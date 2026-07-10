import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { isAssistExercise, isRepsOnlyExercise } from "@/lib/legacy/standards";
import { log } from "@/lib/log";
import { sessionUpdateConflict } from "@/lib/session-save-scope";
import type {
  HintMap,
  SessionDoc,
  SessionWithId,
  SetRow,
} from "./types";

// Workouts renamed in July 2026; sessions saved before then keep the old
// workout_name. Name-based lookups match old and new names together so
// history continuity (last-session prefills, resume) survives the rename.
const WORKOUT_NAME_ALIASES: Record<string, string[]> = {
  "Main: Squat": ["Main A"],
  "Main: Deadlift": ["Main B", "Main: RDL"],
  "Micro: Arms": ["Micro: Arms & Core"],
};

const DRAGONFLY_STAGE_RANK: Record<string, number> = {
  tuck: 1,
  "single-leg": 2,
  straddle: 3,
  negatives: 4,
  "dragon-flag": 5,
  "dragon-fly": 6,
};

function nameVariants(workoutName: string): string[] {
  return [workoutName, ...(WORKOUT_NAME_ALIASES[workoutName] ?? [])];
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Whether a session should be treated as the in-progress one (resumable,
 * and excluded from last-session/hint lookups). Dated today: active.
 * Dated yesterday: only if it started within the last 12h (the
 * midnight-crossing case). Mirrors _is_active_session in the old server.
 */
function isActiveSession(s: SessionWithId): boolean {
  if (s.date && s.date >= localToday()) return true;
  const ts = s.started_at ?? s.created_at;
  if (!ts) return false;
  const started = Date.parse(ts);
  if (Number.isNaN(started)) return false;
  return Date.now() - started < 12 * 3600 * 1000;
}

function sessionsCol(uid: string) {
  return collection(db(), "users", uid, "sessions");
}

/**
 * One fetch feeds everything. The old backend had five endpoints doing
 * five queries; with sessions this small (a few KB each) a single ordered
 * read plus client-side derivation is both simpler and faster. Cached per
 * page load; mutations invalidate.
 */
let _allCache: { uid: string; promise: Promise<SessionWithId[]> } | null = null;

export function invalidateSessionCache() {
  _allCache = null;
}

export function fetchAllSessions(uid: string): Promise<SessionWithId[]> {
  if (_allCache && _allCache.uid === uid) return _allCache.promise;
  const t0 = performance.now();
  const promise = getDocs(
    query(sessionsCol(uid), orderBy("date", "desc")),
  ).then((snap) => {
    const rows = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as SessionDoc) }) as SessionWithId,
    );
    // Secondary sort: same-date sessions newest-first by created_at.
    rows.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.created_at || "").localeCompare(a.created_at || ""),
    );
    log("db", `fetchAllSessions: ${rows.length} sessions in ${Math.round(performance.now() - t0)}ms`);
    return rows;
  });
  _allCache = { uid, promise };
  promise.catch(() => {
    if (_allCache?.promise === promise) _allCache = null;
  });
  return promise;
}

/** Resumable session for a workout: /api/today-session equivalent. */
export async function getTodaySession(
  uid: string,
  workoutName: string,
): Promise<(SessionWithId & { finish_motivation?: null }) | null> {
  const variants = nameVariants(workoutName);
  const all = await fetchAllSessions(uid);
  const recent = all.filter(
    (s) => variants.includes(s.workout_name) && s.date >= yesterdayStr(),
  );
  const row = recent[0];
  if (!row || !isActiveSession(row)) return null;
  return row;
}

function hintsFromSessions(sessions: SessionWithId[]): HintMap {
  // Sessions arrive newest-first; first write per key wins = most recent.
  const out: HintMap = {};
  for (const s of sessions) {
    for (const set of s.sets ?? []) {
      const key = `${set.exercise}|${set.set_type}|${set.set_number}`;
      if (!(key in out)) {
        out[key] = {
          weight_lb: set.weight_lb,
          reps: set.reps,
          bands_json: set.bands_json,
          grip: set.grip,
        };
      }
    }
  }
  return out;
}

/** /api/last-session equivalent: most recent non-deload, non-active session for a workout. */
export async function getLastSession(
  uid: string,
  workoutName: string,
): Promise<HintMap> {
  const variants = nameVariants(workoutName);
  const all = await fetchAllSessions(uid);
  const candidates = all.filter(
    (s) =>
      variants.includes(s.workout_name) &&
      !(s.is_deload ?? 0) &&
      !isActiveSession(s),
  );
  const last = candidates[0];
  return last ? hintsFromSessions([last]) : {};
}

/** /api/exercise-hints equivalent: latest values per exercise across ALL workouts. */
export async function getExerciseHints(uid: string): Promise<HintMap> {
  const all = await fetchAllSessions(uid);
  return hintsFromSessions(
    all.filter((s) => !(s.is_deload ?? 0) && !isActiveSession(s)),
  );
}

/** /api/history equivalent. */
export async function getHistory(
  uid: string,
  limit = 20,
): Promise<(SessionWithId & { finish_motivation: null })[]> {
  const all = await fetchAllSessions(uid);
  return all.slice(0, limit).map((s) => ({ ...s, finish_motivation: null }));
}

/** /api/active-sessions equivalent (home screen in-progress indicator). */
export async function getActiveSessions(uid: string): Promise<
  {
    id: string;
    workout_name: string;
    date: string;
    duration_sec: number;
    sets_done: number;
    state_json: string | null;
  }[]
> {
  const all = await fetchAllSessions(uid);
  const out = [];
  for (const s of all) {
    if (s.date < yesterdayStr()) continue;
    if (!isActiveSession(s)) continue;
    const cnt = (s.sets ?? []).length;
    if (cnt === 0) continue;
    // Live wall-clock from started_at beats the persisted duration_sec
    // snapshot (only updated on save).
    let duration = s.duration_sec || 0;
    if (s.started_at) {
      const started = Date.parse(s.started_at);
      if (!Number.isNaN(started)) {
        duration = Math.max(0, Math.round((Date.now() - started) / 1000));
      }
    }
    out.push({
      id: s.id,
      workout_name: s.workout_name,
      date: s.date,
      duration_sec: duration,
      sets_done: cnt,
      state_json: s.state_json ?? null,
    });
  }
  return out;
}

/** /api/1rm-history equivalent — same math as the old Python, in TS. */
export async function get1RMHistory(uid: string): Promise<{
  orm: Record<string, { date: string; orm: number }[]>;
  reps: Record<string, { date: string; reps: number }[]>;
  vol: Record<string, { date: string; vol: number }[]>;
  wt: Record<string, { date: string; wt: number }[]>;
}> {
  const all = await fetchAllSessions(uid);
  // Oldest-first, like the SQL's ORDER BY date ASC.
  const sessions = [...all].reverse();

  const ormRaw = new Map<string, number[]>();
  const repsRaw = new Map<string, number[]>();
  const wtRaw = new Map<string, number[]>();
  const volRaw = new Map<string, number>();
  const push = (m: Map<string, number[]>, k: string, v: number) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };

  for (const s of sessions) {
    for (const set of s.sets ?? []) {
      if (set.set_type !== "working") continue;
      const repsStr = String(set.reps ?? "");
      if (!/^\d+$/.test(repsStr)) continue;
      const reps = parseInt(repsStr, 10);
      if (reps <= 0) continue;
      const key = `${set.exercise}\u0000${s.date}`;
      push(repsRaw, key, reps);

      // Reps-only exercise: graded on reps (mirrors calcSet1RM).
      if (isRepsOnlyExercise(set.exercise)) {
        push(ormRaw, key, reps);
        continue;
      }
      // Staged exercise: progress score = stage rank + reps fraction.
      if (set.exercise === "Dragon Fly Progression") {
        const rank = DRAGONFLY_STAGE_RANK[set.grip ?? ""] ?? 1;
        push(ormRaw, key, Math.round((rank + Math.min(reps, 19) / 20) * 1000) / 1000);
        continue;
      }
      const w = set.weight_lb ? Number(set.weight_lb) : 0;
      if (w > 0) {
        const isAssist = isAssistExercise(set.exercise);
        let bandSum = 0;
        if (set.bands_json) {
          try {
            const bands = JSON.parse(set.bands_json);
            if (Array.isArray(bands)) bandSum = bands.reduce((a, b) => a + Number(b || 0), 0);
          } catch {
            /* malformed bands_json — treat as none */
          }
        }
        let orm: number;
        if (isAssist) {
          orm = reps > 1 ? w * (reps / 30) - bandSum : -bandSum;
          push(wtRaw, key, -bandSum);
        } else {
          push(wtRaw, key, w);
          orm = reps > 1 ? w * (1 + reps / 30) : w;
        }
        push(ormRaw, key, Math.round(orm * 10) / 10);
      }

      // Volume = sum(weight * reps) per exercise per date.
      if (w > 0) volRaw.set(key, (volRaw.get(key) ?? 0) + w * reps);
    }
  }

  const groupMax = (m: Map<string, number[]>, field: string) => {
    const out: Record<string, { date: string; [k: string]: number | string }[]> = {};
    for (const [key, vals] of m) {
      const [ex, date] = key.split("\u0000");
      (out[ex] ??= []).push({ date, [field]: Math.max(...vals) });
    }
    for (const ex of Object.keys(out)) out[ex].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return out;
  };
  const vol: Record<string, { date: string; vol: number }[]> = {};
  for (const [key, v] of volRaw) {
    const [ex, date] = key.split("\u0000");
    (vol[ex] ??= []).push({ date, vol: Math.round(v) });
  }
  for (const ex of Object.keys(vol)) vol[ex].sort((a, b) => a.date.localeCompare(b.date));

  return {
    orm: groupMax(ormRaw, "orm") as Record<string, { date: string; orm: number }[]>,
    reps: groupMax(repsRaw, "reps") as Record<string, { date: string; reps: number }[]>,
    vol,
    wt: groupMax(wtRaw, "wt") as Record<string, { date: string; wt: number }[]>,
  };
}

export type SavePayload = {
  session_id?: string | null;
  workout: string;
  date: string;
  duration_sec?: number;
  notes?: string;
  started_at?: string;
  state_json?: string | null;
  is_deload?: boolean | number;
  sets?: {
    exercise: string;
    set_type: "warmup" | "working";
    set_number?: number;
    reps?: string | number;
    weight_lb?: number | null;
    bands_json?: string | null;
    grip?: string | null;
    logged_at?: string | null;
  }[];
};

/** /api/save equivalent. Returns {id, ok} like the old endpoint. */
export async function saveSession(
  uid: string,
  data: SavePayload,
): Promise<{ id: string; ok: true }> {
  let sessionId = data.session_id ? String(data.session_id) : null;
  const sets: SetRow[] = (data.sets ?? []).map((s) => ({
    exercise: s.exercise,
    set_type: s.set_type,
    set_number: s.set_number ?? 0,
    reps: s.reps ?? "",
    weight_lb: s.weight_lb ?? null,
    bands_json: s.bands_json ?? null,
    grip: s.grip ?? null,
    completed: 1,
    logged_at: s.logged_at ?? null,
  }));

  if (sessionId) {
    const ref = doc(sessionsCol(uid), sessionId);
    const snap = await getDoc(ref);
    // Cross-day stale-tab guard (same as the old server): a tab from a
    // previous day must not overwrite that older session with today's
    // partial state. Date mismatch → treat as a fresh session.
    const existing = snap.exists() ? (snap.data() as SessionDoc) : null;
    const conflict = sessionUpdateConflict(existing, data);
    if (!snap.exists()) {
      log("db", `save: session ${sessionId} not found, creating new`);
      sessionId = null;
    } else if (conflict === "date") {
      log("db", `save: REJECTED stale-tab update (session dated ${existing?.date}, payload ${data.date})`);
      sessionId = null;
    } else if (conflict === "workout") {
      log("db", `save: REJECTED cross-workout update (session ${existing?.workout_name}, payload ${data.workout})`);
      sessionId = null;
    } else {
      await updateDoc(ref, {
        duration_sec: data.duration_sec ?? 0,
        notes: data.notes ?? "",
        is_deload: data.is_deload ? 1 : 0,
        ...(data.state_json !== undefined && data.state_json !== null
          ? { state_json: data.state_json }
          : {}),
        sets,
      });
      invalidateSessionCache();
      return { id: sessionId, ok: true };
    }
  }

  const ref = doc(sessionsCol(uid));
  const nowIso = new Date().toISOString();
  const docData: SessionDoc = {
    workout_name: data.workout,
    date: data.date,
    duration_sec: data.duration_sec ?? 0,
    notes: data.notes ?? "",
    started_at: data.started_at ?? nowIso,
    created_at: nowIso,
    state_json: data.state_json ?? null,
    is_deload: data.is_deload ? 1 : 0,
    sets,
  };
  await setDoc(ref, docData);
  invalidateSessionCache();
  return { id: ref.id, ok: true };
}

/** /api/session/<id> DELETE equivalent (sets are embedded, so one delete). */
export async function deleteSession(uid: string, sessionId: string) {
  await deleteDoc(doc(sessionsCol(uid), String(sessionId)));
  invalidateSessionCache();
}
