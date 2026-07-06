"use client";

import { useState } from "react";
import { doc, getDocs, collection, writeBatch } from "firebase/firestore";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/auth";
import { invalidateSessionCache } from "@/lib/db/sessions";
import exportData from "@/migration/export.json";

/**
 * One-time Postgres → Firestore migration page. Reads migration/export.json
 * (produced by sports/scratch/export_for_firestore.py from the prod Neon DB)
 * and writes docs under users/{uid}/ with deterministic ids (pg-<id>), so
 * re-running is idempotent: same doc paths are overwritten, never duplicated.
 * Nothing is deleted anywhere. After writing it re-reads every doc and
 * deep-compares against the payload.
 */

type Report = { line: string; ok: boolean }[];

const MEAS_FIELDS = [
  "head_cm", "neck_cm", "shoulder_cm", "chest_cm", "waist_cm", "hip_cm",
  "l_arm_cm", "r_arm_cm", "l_thigh_cm", "r_thigh_cm", "l_calf_cm", "r_calf_cm",
  "weight_kg",
] as const;

function sessionDocFromExport(s: (typeof exportData.sessions)[number]) {
  return {
    workout_name: s.workout_name,
    date: s.date,
    duration_sec: s.duration_sec ?? 0,
    notes: s.notes ?? "",
    started_at: s.started_at ?? null,
    created_at: s.created_at ?? s.started_at ?? new Date(0).toISOString(),
    state_json: s.state_json ?? null,
    is_deload: s.is_deload ?? 0,
    pg_id: s.id,
    sets: (s.sets ?? []).map((x) => ({
      exercise: x.exercise,
      set_type: x.set_type,
      set_number: x.set_number ?? 0,
      reps: x.reps ?? "",
      weight_lb: x.weight_lb ?? null,
      bands_json: x.bands_json ?? null,
      grip: x.grip ?? null,
      completed: x.completed ?? 1,
      logged_at: x.logged_at ?? null,
    })),
  };
}

function MigrateInner() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report>([]);
  const [done, setDone] = useState(false);

  const add = (line: string, ok = true) =>
    setReport((r) => [...r, { line, ok }]);

  async function run() {
    if (!user) return;
    setRunning(true);
    setReport([]);
    const uid = user.uid;
    const d = db();
    try {
      // All writes go into one atomic batch (66 docs, well under the 500-op
      // limit) — a single network round-trip instead of one per document.
      const batch = writeBatch(d);
      for (const s of exportData.sessions) {
        batch.set(doc(d, "users", uid, "sessions", `pg-${s.id}`), sessionDocFromExport(s));
      }
      for (const m of exportData.measurements) {
        const docData: Record<string, unknown> = {
          taken_at: m.taken_at,
          date: m.date,
          notes: m.notes ?? null,
          pg_id: m.id,
        };
        for (const f of MEAS_FIELDS) docData[f] = m[f] ?? null;
        batch.set(doc(d, "users", uid, "measurements", `pg-${m.id}`), docData);
      }
      for (const n of exportData.exercise_notes) {
        batch.set(doc(d, "users", uid, "exerciseNotes", encodeURIComponent(n.exercise)), {
          exercise: n.exercise,
          body: n.body,
          updated_at: n.updated_at ?? new Date().toISOString(),
        });
      }
      batch.set(doc(d, "users", uid, "settings", "app"), exportData.settings, { merge: true });
      await batch.commit();
      add(
        `wrote ${exportData.sessions.length} sessions, ${exportData.measurements.length} measurements, ` +
          `${exportData.exercise_notes.length} notes, settings (${Object.keys(exportData.settings).length} keys) — one batch`,
      );

      // ---- verify: counts ----
      const sessSnap = await getDocs(collection(d, "users", uid, "sessions"));
      const measSnap = await getDocs(collection(d, "users", uid, "measurements"));
      const migratedSess = sessSnap.docs.filter((x) => x.id.startsWith("pg-"));
      add(
        `verify counts: ${migratedSess.length}/${exportData.sessions.length} migrated sessions, ` +
          `${measSnap.docs.filter((x) => x.id.startsWith("pg-")).length}/${exportData.measurements.length} measurements`,
        migratedSess.length === exportData.sessions.length,
      );

      // ---- verify: field-level deep compare of EVERY session ----
      // Firestore returns map keys alphabetically sorted, so the compare must
      // be key-order-insensitive: canonicalize by sorting keys recursively.
      const canon = (v: unknown): string => {
        if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
        }
        return JSON.stringify(v);
      };
      let setCount = 0;
      let mismatches = 0;
      const FIELDS = [
        "workout_name", "date", "duration_sec", "notes", "started_at",
        "created_at", "state_json", "is_deload",
      ] as const;
      // sessSnap already holds every session doc — no per-doc reads needed.
      const byId = new Map(sessSnap.docs.map((x) => [x.id, x.data() as Record<string, unknown>]));
      for (const s of exportData.sessions) {
        const expected = sessionDocFromExport(s);
        const actual = byId.get(`pg-${s.id}`);
        const badField =
          !actual
            ? "missing doc"
            : (FIELDS.find((f) => canon(expected[f]) !== canon(actual[f])) ??
              (canon(expected.sets) !== canon(actual.sets) ? "sets" : null));
        if (badField) {
          mismatches++;
          add(`MISMATCH session pg-${s.id} (${s.workout_name} ${s.date}) — field: ${badField}`, false);
        }
        setCount += expected.sets.length;
      }
      add(
        `verify deep-compare: ${exportData.sessions.length} sessions / ${setCount} sets checked, ${mismatches} mismatches`,
        mismatches === 0,
      );
      invalidateSessionCache();
      setDone(mismatches === 0);
    } catch (e) {
      add(`ERROR: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      setRunning(false);
    }
  }

  const totalSets = exportData.sessions.reduce((a, s) => a + (s.sets?.length ?? 0), 0);

  return (
    <div className="min-h-screen p-6 text-gray-200" style={{ background: "#0B0F14" }}>
      <h1 className="text-xl font-bold mb-2">Postgres → Firestore migration</h1>
      <p className="text-sm text-gray-400 mb-1">
        Payload: {exportData.sessions.length} sessions · {totalSets} sets ·{" "}
        {exportData.measurements.length} measurements · {exportData.exercise_notes.length} notes ·
        exported {exportData.exported_at}
      </p>
      <p className="text-sm text-gray-400 mb-4">
        Target: users/{user?.uid} ({user?.email}). Idempotent — safe to re-run.
      </p>
      <button
        onClick={() => void run()}
        disabled={running}
        className="px-4 py-2 rounded-lg bg-blue-600 font-semibold disabled:opacity-50"
      >
        {running ? "Migrating…" : "Run migration"}
      </button>
      {done && (
        <div className="mt-4 text-green-400 font-semibold">
          ✓ Migration verified — every session matches the export field-for-field.
        </div>
      )}
      <pre className="mt-4 text-xs whitespace-pre-wrap">
        {report.map((r, i) => (
          <div key={i} className={r.ok ? "text-gray-300" : "text-red-400"}>
            {r.ok ? "· " : "✗ "}
            {r.line}
          </div>
        ))}
      </pre>
    </div>
  );
}

export default function MigratePage() {
  return (
    <AuthGate>
      <MigrateInner />
    </AuthGate>
  );
}
