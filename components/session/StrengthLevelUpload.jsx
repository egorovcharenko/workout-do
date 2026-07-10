"use client";
import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { T } from "@/lib/legacy/shared";
import { loadBodyweight } from "@/lib/legacy/session-persistence";

// ─── file: workout-session-strengthlevel.js ───

// Upload a finished session to Strength Level (my.strengthlevel.com).
//
// Strength Level's write API is session-cookie + same-origin only, so this app
// (a different origin) cannot POST to it directly. Instead the button builds a
// self-contained bookmarklet with the workout embedded; run it in a logged-in
// my.strengthlevel.com tab and it performs the create -> populate calls.
//
// See STRENGTHLEVEL_API.md for the reverse-engineered contract. This is an
// unofficial API; automated use is against Strength Level's ToS.

const LB_TO_KG = 0.45359237;

// Program exercise name -> Strength Level catalog exercise_id.
// Resolved against the live catalog (GET /api/exercises). ⚠ rows are the
// closest sensible match where no exact equivalent exists.
const SL_EXERCISE_MAP = {
  "Barbell Bench Press": "014b6a3d-a9a8-7249-a366-57858b8f510b",
  "Dumbbell Flat Bench Press": "015ae8ce-4a70-74dc-b935-40c38d951800",
  "Incline Barbell Press": "015df666-1ae8-7d63-a1f7-024a3a81c9df",
  "Incline Dumbbell Press": "016040da-ac68-76a9-ab62-ae8ffd8464bd",
  "Barbell Back Squat": "014b6a3d-b560-7ef2-8ecd-5575d15dce9d",
  "Goblet Squat": "0164ae2c-76f8-7da1-b808-615f7c4e6e42",
  "Bulgarian Split Squat": "0164ae2c-28d8-72a7-ada7-e0d86ef38c9c",
  "Lunges": "0164ae2c-6370-7313-8fe9-a2fb8fe544da",
  "Barbell RDL": "015c1754-6978-733e-812c-b6e9397d3864",
  "Dumbbell Romanian Deadlift": "0164ae2c-d8a0-73db-8934-0a30d166c7d3",
  "Single-Leg DB RDL": "016c62ab-8e50-7022-ad5a-c88c0fc9e9d5",
  "Band Romanian Deadlift": "015c1754-6978-733e-812c-b6e9397d3864", // ⚠ band→barbell
  "Band Squat": "014b6a3d-b560-7ef2-8ecd-5575d15dce9d", // ⚠ band→barbell
  "Standing Overhead Press": "0164ae2c-8a80-7947-a8ef-44661037202f",
  "Seated Overhead Press": "016df687-c908-7a50-852c-0e8aef0f7d6e",
  "Overhead Dumbbell Press": "015ae8cd-11f0-77fd-9092-bdf8bf43c627",
  "Dumbbell Lateral Raises": "015c1758-93e0-792c-987d-e2cbc635afa9",
  "Single-Arm Cable Lateral Raise": "0164ae2c-c130-7e82-a5ef-305397024b0e",
  "Reverse Flyes": "0164ae2c-9638-70ad-acbe-62093c04743c",
  "Cable Face Pulls": "0164ae2c-4430-7e27-be36-53b411f8088e",
  "Face Pulls": "0164ae2c-4430-7e27-be36-53b411f8088e",
  "Bent-Over Barbell Rows": "01502a1c-09a0-7cf9-ace6-47810571c38a",
  "Dumbbell Bent-Over Rows": "015ae8cd-0a20-7cc4-88b4-cd9f407b842e",
  "Single-Arm Dumbbell Rows": "015ae8cd-0a20-7cc4-88b4-cd9f407b842e",
  "Band Row": "0164ae2c-2108-7f95-8da0-46be2d687fcf", // ⚠ band→cable
  "Pull-Ups": "0158c933-b558-7d76-8c30-1e4c9944e224", // ⚠ logged as bodyweight
  "Dips": "0158c933-b940-765a-8e91-da5b2c9ffbb5",
  "Dumbbell Bicep Curls": "015ae8cd-0e08-77d2-8267-84afb69ad410",
  "Incline DB Curls": "0164ae2c-7ec8-7ae6-944c-86527fec8ac5",
  "Dumbbell Hammer Curls": "0164ae2c-1550-7e24-823c-e75abb78e4d2",
  "Band Bicep Curls": "015ae8cd-0e08-77d2-8267-84afb69ad410", // ⚠ band→dumbbell
  "Cable Tricep Pushdowns": "016040e0-8098-770d-8e50-e1b7c9732731",
  "Band Tricep Pushdowns": "016040e0-8098-770d-8e50-e1b7c9732731", // ⚠ band→cable
  "Overhead Tricep Extension": "016040d9-9ee0-73c7-b5cd-3c89fe16eebc",
  "Barbell Shrugs": "015df664-1f18-75fb-974e-fc745a6d58f1",
  "Dumbbell Shrugs": "015df666-1700-7bdc-980b-31ecdec839ab",
  "Calf Raises": "016c62ab-9a08-7b20-ac4e-76c77efe8995", // ⚠ bodyweight variant
  "Hanging Knee Raise": "016c62ac-3260-7f3c-80bf-e564325d600a",
  "Pallof Press": "017ca55f-0f78-737d-86d2-b4723925d23c",
  "Band Torso Rotation": "017ca55f-0b90-7e8b-be71-8a5379b790ff", // ⚠ band→cable
  "Cable Torso Rotation": "017ca55f-0b90-7e8b-be71-8a5379b790ff",
};

// Effective lifted weight in lb for one set, mirroring serializeForSave().
function _setWeightLb(ex, s) {
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  if (ex.repsOnly) return 0; // reps-only → bodyweight movement, no added weight
  if (ex.assist) return 0; // assisted/bodyweight → log as bodyweight (0 added) on SL
  if (ex.isBandsOnly) return bandSum;
  if (ex.bandAddon) return (s.weight || 0) + bandSum;
  return s.weight || 0;
}

// Turn the live `exercises` state into Strength Level's exercises[] payload.
// Returns { name, date, exercises, setCount, unmapped, mappedCount }.
function buildStrengthLevelPayload(exercises, workoutName, sessionDate) {
  const out = [];
  const unmapped = [];
  let setCount = 0;

  // Current bodyweight (the app tracks it in lb) → kg, so the upload can stamp
  // the right weight instead of letting Strength Level fall back to a stale
  // entry in its own bodyweight log.
  let bodyweightKg = null;
  try {
    const lb = (typeof loadBodyweight === "function" ? loadBodyweight() : null)
      || (typeof window !== "undefined" && window.USER_SETTINGS && parseFloat(window.USER_SETTINGS.bodyweight))
      || null;
    if (lb) bodyweightKg = Math.round(lb * LB_TO_KG * 10) / 10;
  } catch (e) {}

  (exercises || []).forEach(ex => {
    if (ex.skipped) return;
    const done = (ex.sets || []).filter(s => s.completed && parseInt(s.reps) > 0);
    if (!done.length) return;
    const id = SL_EXERCISE_MAP[ex.name];
    if (!id) {
      if (!unmapped.includes(ex.name)) unmapped.push(ex.name);
      return;
    }
    const sets = done.map(s => ({
      weight: Math.round(_setWeightLb(ex, s) * LB_TO_KG * 10) / 10,
      reps: parseInt(s.reps),
      rpe: null,
      notes: null,
      warmup: s.kind === "warmup",
      dropset: false,
      rest: null,
    }));
    setCount += sets.length;
    out.push({ exercise_id: id, sets });
  });
  return {
    name: workoutName || "Workout",
    date: sessionDate,
    exercises: out,
    bodyweightKg,
    setCount,
    mappedCount: out.length,
    unmapped,
  };
}

// Build a javascript: bookmarklet that, run on my.strengthlevel.com while
// logged in, creates the workout (POST) and populates it (PUT).
function buildStrengthLevelBookmarklet(payload) {
  const embedded = JSON.stringify({
    name: payload.name,
    date: payload.date,
    exercises: payload.exercises,
    bodyweightKg: payload.bodyweightKg,
  });
  const runner = function (W) {
    return (async () => {
      try {
        const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
        const off = new Date().getTimezoneOffset();
        const who = await fetch("/api/user", { headers: { Accept: "application/json" } });
        if (who.status !== 200) { alert("Not logged into Strength Level. Log in at my.strengthlevel.com, then run this again."); return; }
        const uid = (await who.json()).data.id;
        const cr = await fetch("/api/workouts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ user_id: uid, name: W.name, date: W.date, start_at: null, finish_at: null, timezone: tz, timezone_offset_mins: off }),
        });
        if (!cr.ok) { alert("Create failed (HTTP " + cr.status + ")."); return; }
        const crd = (await cr.json()).data;
        const id = crd.id;
        const g = await fetch("/api/workouts/" + id + "?user_id=" + uid + "&workout.fields=etag", { headers: { Accept: "application/json" } });
        let etag = g.headers.get("ETag");
        if (!etag) { try { etag = (await g.json()).data.etag; } catch (e) {} }
        const now = new Date();
        const doc = {
          id: id, version: 1, date: W.date, name: W.name, timezone: tz, timezone_offset_mins: off,
          created_at: crd.created_at || now.toISOString(), updated_at: now.toISOString(), updated_at_ms: now.getTime(),
          exercises: W.exercises, etag: etag,
        };
        const headers = { "Content-Type": "application/json", Accept: "application/json" };
        if (etag) headers["If-Match"] = etag;
        const pu = await fetch("/api/workouts/" + id, { method: "PUT", headers: headers, body: JSON.stringify(doc) });
        if (!pu.ok) { alert("Populate failed (HTTP " + pu.status + "). Empty workout " + id + " was created — delete it if needed."); return; }
        // Stamp bodyweight for this date if the log has no entry for it yet
        // (never overwrite a manually-logged weigh-in).
        let bwNote = "";
        if (W.bodyweightKg) {
          try {
            const bwLog = await (await fetch("/api/bodyweights?user_id=" + uid + "&limit=50", { headers: { Accept: "application/json" } })).json();
            const exists = (bwLog.data || []).some(b => b.date === W.date);
            if (!exists) {
              const bwr = await fetch("/api/bodyweights", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ user_id: uid, date: W.date, bodyweight: W.bodyweightKg }) });
              bwNote = bwr.ok ? "\nBodyweight " + W.bodyweightKg + " kg logged." : "\n(Bodyweight log failed — set it manually.)";
            } else {
              bwNote = "\n(Bodyweight already logged for " + W.date + ".)";
            }
          } catch (e) { bwNote = "\n(Bodyweight step errored.)"; }
        }
        alert("✅ Uploaded \"" + W.name + "\" (" + W.exercises.length + " exercises) to Strength Level." + bwNote + "\nRefresh your workouts page to see it.");
      } catch (e) { alert("Sync error: " + (e && e.message ? e.message : e)); }
    })();
  };
  return "javascript:(" + runner.toString() + ")(" + embedded + ");void 0;";
}

function StrengthLevelUpload({ exercises, workoutName, sessionDate }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const payload = useMemo(
    () => buildStrengthLevelPayload(exercises, workoutName, sessionDate),
    [exercises, workoutName, sessionDate]
  );
  const bookmarklet = useMemo(() => buildStrengthLevelBookmarklet(payload), [payload]);

  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(bookmarklet).then(done).catch(() => {});
    }
  };

  const nothing = payload.mappedCount === 0;

  return (
    <React.Fragment>
      <button
        onClick={() => { setOpen(true); copy(); }}
        style={{
          width: "100%", maxWidth: 320, background: "transparent",
          border: `1px solid ${T.cardBorder}`, color: T.text,
          fontFamily: "inherit", fontSize: 14, fontWeight: 700,
          padding: "11px 0", borderRadius: 11, cursor: "pointer",
        }}>
        ⬆ Upload to Strength Level
      </button>

      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 460, background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 22, color: T.text, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: T.strong, fontSize: 17, fontWeight: 800 }}>Upload to Strength Level</h3>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: T.accentLight, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>

            {nothing ? (
              <p style={{ color: T.amber, fontSize: 13, lineHeight: 1.5, margin: "0 0 8px" }}>
                No completed, mappable exercises to upload yet.
              </p>
            ) : (
              <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.5, margin: "0 0 4px" }}>
                Prepared <b style={{ color: T.strong }}>{payload.mappedCount}</b> exercise{payload.mappedCount !== 1 ? "s" : ""} · <b style={{ color: T.strong }}>{payload.setCount}</b> sets for <b style={{ color: T.strong }}>{payload.date}</b>. Weights converted lb → kg{payload.bodyweightKg ? `; bodyweight ${payload.bodyweightKg} kg` : ""}.
              </p>
            )}
            {payload.unmapped.length > 0 && (
              <p style={{ color: T.faint, fontSize: 11.5, lineHeight: 1.5, margin: "6px 0 0" }}>
                Skipped (no Strength Level match): {payload.unmapped.join(", ")}
              </p>
            )}

            {!nothing && (
              <React.Fragment>
                <div style={{ marginTop: 16, background: "rgba(255,255,255,0.03)", border: `1px solid ${T.cardBorder}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ color: T.faint, fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>HOW TO RUN {copied ? "· COPIED ✓" : ""}</div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
                    <li>Open <b style={{ color: T.text }}>my.strengthlevel.com</b> in a tab and make sure you&apos;re logged in.</li>
                    <li>Open that tab&apos;s DevTools <b style={{ color: T.text }}>Console</b> (⌥⌘J), paste the copied snippet, press Enter. (First time, Chrome may ask you to type <i>allow pasting</i>.)</li>
                    <li>A confirmation alert appears; refresh your workouts page.</li>
                  </ol>
                </div>
                <button
                  onClick={copy}
                  style={{ width: "100%", marginTop: 12, background: `linear-gradient(180deg, ${T.accentLight}, ${T.accent})`, border: "none", color: T.inv, fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: "11px 0", borderRadius: 10, cursor: "pointer" }}>
                  {copied ? "Copied to clipboard ✓" : "Copy sync snippet"}
                </button>
                <textarea
                  readOnly
                  value={bookmarklet}
                  onFocus={e => e.target.select()}
                  style={{ width: "100%", marginTop: 10, height: 70, background: "rgba(0,0,0,0.25)", border: `1px solid ${T.cardBorder}`, borderRadius: 8, color: T.faint, fontFamily: T.mono, fontSize: 10, padding: 8, resize: "vertical" }}
                />
                <p style={{ color: T.faint, fontSize: 10.5, lineHeight: 1.5, margin: "10px 0 0" }}>
                  Note: this uses Strength Level&apos;s unofficial API and is against their Terms of Service. It uploads only your own data.
                </p>
              </React.Fragment>
            )}
          </div>
        </div>,
        document.body
      )}
    </React.Fragment>
  );
}

if (typeof window !== "undefined") {
  window.SL_EXERCISE_MAP = SL_EXERCISE_MAP;
  window.buildStrengthLevelPayload = buildStrengthLevelPayload;
  window.buildStrengthLevelBookmarklet = buildStrengthLevelBookmarklet;
  window.StrengthLevelUpload = StrengthLevelUpload;
}

export { SL_EXERCISE_MAP, buildStrengthLevelPayload, buildStrengthLevelBookmarklet, StrengthLevelUpload };
