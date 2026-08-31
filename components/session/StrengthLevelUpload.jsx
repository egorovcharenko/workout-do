"use client";
import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { T } from "@/lib/legacy/shared";
import { loadBodyweight } from "@/lib/legacy/session-persistence";
import { effectiveExerciseWeight } from "@/lib/legacy/cable-stack";
// The exercise-id map moved to lib/legacy/strength-level-sync.js so the home
// screen's batch history sync (and node tests) can share it without pulling
// in React. Re-exported below to keep this module's public surface intact.
import { SL_EXERCISE_MAP } from "@/lib/legacy/strength-level-sync";

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

// Effective lifted weight in lb for one set, mirroring serializeForSave().
function _setWeightLb(ex, s) {
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  // Band-assisted bodyweight sets (Pull-Ups/Dips with assistance bands) upload
  // as NEGATIVE weight so Strength Level records them as assisted reps instead
  // of clean bodyweight reps.
  if ((ex.repsOnly || ex.assist) && bandSum > 0) return -bandSum;
  if (ex.beltLoad) return Math.max(0, s.weight || 0); // added load on a dip/pull-up belt
  if (ex.repsOnly) return 0; // pure reps-only → bodyweight movement, no added weight
  if (ex.assist) return 0; // assisted/bodyweight → log as bodyweight (0 added) on SL
  if (ex.isBandsOnly) return bandSum;
  if (ex.bandAddon) return (s.weight || 0) + bandSum;
  // Cable dual-stack exercises store the per-stack selector value; upload the
  // true combined load (×2 for Lat Pulldown / Low Row / Calf Raises variants).
  return effectiveExerciseWeight(ex.name, s.weight || 0);
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
