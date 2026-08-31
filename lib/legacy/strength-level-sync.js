// ─── file: strength-level-sync.js ───
//
// Shared Strength Level (my.strengthlevel.com) sync logic:
//   - SL_EXERCISE_MAP: program exercise name -> SL catalog exercise_id
//     (single source of truth; the per-session upload button re-exports it).
//   - buildStoredSessionPayload: a SAVED session doc -> SL exercises[] payload
//     (the live-session equivalent lives in StrengthLevelUpload.jsx and works
//     off in-memory exercise state; this one works off persisted sets and
//     mirrors the weight semantics in "Data model gotchas": reps-only rows
//     carry no weight except an explicit belt load, band-assisted bodyweight
//     rows upload as negative weight, cable rows go through the per-stack
//     multiplier).
//   - buildHistorySyncPlan / buildStrengthLevelHistorySnippet: the batch
//     "upload whatever Strength Level is missing" flow. SL's write API is
//     session-cookie + same-origin only, so the snippet runs in a logged-in
//     my.strengthlevel.com tab: it lists existing workouts, skips embedded
//     ones already present (matched by date+name), and create->populates the
//     rest. Unofficial API; automated use is against SL's ToS.

import { LEGACY_WORKOUT_NAMES } from "./shared.js";
import { isAssistExercise, isRepsOnlyExercise } from "./standards.js";
import { effectiveStoredExerciseWeight } from "./cable-stack.js";
import { isStoredBeltLoad, storedBeltLoad } from "./belt-load.js";
import { isStoredSessionFinished } from "./session-status.js";

const LB_TO_KG = 0.45359237;

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
  "Lat Pulldown": "015c1754-6590-7192-b1c2-afcb83a704f5",
  "Neutral-Grip Lat Pulldown": "016df68a-16e0-75e5-86e2-c5540d8501b1", // SL "V Bar Lat Pulldown"
  "Low Row": "0164ae2c-2108-7f95-8da0-46be2d687fcf", // SL "Seated Cable Row"
  "Pull-Ups": "0158c933-b558-7d76-8c30-1e4c9944e224", // belt → +weight, band assist → -weight
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

function parseBandsJson(bandsJson) {
  if (!bandsJson) return 0;
  try {
    const bands = JSON.parse(bandsJson);
    if (!Array.isArray(bands)) return 0;
    return bands.reduce((a, b) => a + (Number(b) || 0), 0);
  } catch {
    return 0;
  }
}

// Effective lifted weight (lb) for a PERSISTED set, mirroring _setWeightLb in
// StrengthLevelUpload.jsx for live state. Bodyweight movements (reps-only or
// assist): belt load uploads as added weight, band assistance as negative
// weight, plain bodyweight as 0 — never the stored weight_lb, which older
// reps-only rows filled with bodyweight. Everything else goes through the
// cable per-stack conversion.
function storedSetWeightLb(set, session) {
  const ex = set.exercise;
  if (isRepsOnlyExercise(ex) || isAssistExercise(ex)) {
    if (isStoredBeltLoad(set)) return storedBeltLoad(set);
    const bandSum = parseBandsJson(set.bands_json);
    if (bandSum > 0) return -bandSum;
    return 0;
  }
  return effectiveStoredExerciseWeight(ex, Number(set.weight_lb) || 0, session);
}

// A saved session doc -> { name, date, exercises, setCount, unmapped }.
function buildStoredSessionPayload(session) {
  const byExercise = new Map();
  const unmapped = [];
  let setCount = 0;
  (session.sets || []).forEach((set) => {
    const reps = parseInt(set.reps, 10);
    if (!reps || reps <= 0) return;
    const id = SL_EXERCISE_MAP[set.exercise];
    if (!id) {
      if (!unmapped.includes(set.exercise)) unmapped.push(set.exercise);
      return;
    }
    if (!byExercise.has(set.exercise)) {
      byExercise.set(set.exercise, { exercise_id: id, sets: [] });
    }
    byExercise.get(set.exercise).sets.push({
      weight: Math.round(storedSetWeightLb(set, session) * LB_TO_KG * 10) / 10,
      reps,
      rpe: null,
      notes: null,
      warmup: set.set_type === "warmup",
      dropset: false,
      rest: null,
    });
    setCount++;
  });
  return {
    name: session.workout_name || "Workout",
    date: session.date,
    exercises: [...byExercise.values()],
    setCount,
    unmapped,
  };
}

// History rows -> what the batch snippet should carry. Only finished sessions
// with at least one mapped set are candidates; SL-side date+name matching
// decides what is actually missing.
function buildHistorySyncPlan(history) {
  const workouts = [];
  const unmapped = [];
  let unfinished = 0;
  let empty = 0;
  (history || []).forEach((session) => {
    if (!session?.date) return;
    if (!isStoredSessionFinished(session)) {
      unfinished++;
      return;
    }
    const payload = buildStoredSessionPayload(session);
    payload.unmapped.forEach((n) => {
      if (!unmapped.includes(n)) unmapped.push(n);
    });
    if (payload.exercises.length === 0) {
      empty++;
      return;
    }
    workouts.push(payload);
  });
  // Oldest first so Strength Level's list fills chronologically.
  workouts.sort((a, b) => a.date.localeCompare(b.date));
  return { workouts, unmapped, unfinished, empty };
}

// Console snippet that, run on my.strengthlevel.com while logged in, lists
// existing workouts and create->populates every embedded workout not already
// present (matched by date+name). Sequential with a small delay between
// uploads to stay polite.
function buildStrengthLevelHistorySnippet(workouts) {
  const embedded = JSON.stringify(
    workouts.map((w) => ({ name: w.name, date: w.date, exercises: w.exercises })),
  );
  const runner = function (LIST, LEGACY) {
    // Sessions uploaded before the rename still sit on Strength Level under
    // their old name ("Main A"), while history normalizes them to the current
    // one ("Squat Focus"). Match on the canonical name or a same-day re-upload
    // creates a duplicate of a workout that is already there.
    const key = function (date, name) {
      return date + " " + (LEGACY[name] || name);
    };
    return (async () => {
      try {
        const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
        const off = new Date().getTimezoneOffset();
        const H = { Accept: "application/json" };
        const HJ = { "Content-Type": "application/json", Accept: "application/json" };
        const who = await fetch("/api/user", { headers: H });
        if (who.status !== 200) { alert("Not logged into Strength Level. Log in at my.strengthlevel.com, then run this again."); return; }
        const uid = (await who.json()).data.id;
        const have = new Set();
        try {
          const lr = await fetch("/api/workouts?user_id=" + uid + "&limit=500", { headers: H });
          if (lr.ok) ((await lr.json()).data || []).forEach(function (w) { have.add(key(w.date || "", w.name || "")); });
          else { alert("Couldn't list existing workouts (HTTP " + lr.status + ") — aborting so nothing gets duplicated."); return; }
        } catch (e) { alert("Couldn't list existing workouts (" + (e && e.message ? e.message : e) + ") — aborting so nothing gets duplicated."); return; }
        const done = [], skipped = [], failed = [];
        for (const W of LIST) {
          if (have.has(key(W.date, W.name))) { skipped.push(W.date + " " + W.name); continue; }
          try {
            const cr = await fetch("/api/workouts", { method: "POST", headers: HJ, body: JSON.stringify({ user_id: uid, name: W.name, date: W.date, start_at: null, finish_at: null, timezone: tz, timezone_offset_mins: off }) });
            if (!cr.ok) { failed.push(W.date + " " + W.name + " (create HTTP " + cr.status + ")"); continue; }
            const crd = (await cr.json()).data;
            const g = await fetch("/api/workouts/" + crd.id + "?user_id=" + uid + "&workout.fields=etag", { headers: H });
            let etag = g.headers.get("ETag");
            if (!etag) { try { etag = (await g.json()).data.etag; } catch { /* no etag */ } }
            const now = new Date();
            const doc = {
              id: crd.id, version: 1, date: W.date, name: W.name, timezone: tz, timezone_offset_mins: off,
              created_at: crd.created_at || now.toISOString(), updated_at: now.toISOString(), updated_at_ms: now.getTime(),
              exercises: W.exercises, etag: etag,
            };
            const ph = { "Content-Type": "application/json", Accept: "application/json" };
            if (etag) ph["If-Match"] = etag;
            const pu = await fetch("/api/workouts/" + crd.id, { method: "PUT", headers: ph, body: JSON.stringify(doc) });
            if (!pu.ok) { failed.push(W.date + " " + W.name + " (populate HTTP " + pu.status + " — empty workout " + crd.id + " created, delete it)"); continue; }
            done.push(W.date + " " + W.name);
            await new Promise(function (res) { setTimeout(res, 400); });
          } catch (e) { failed.push(W.date + " " + W.name + " (" + (e && e.message ? e.message : e) + ")"); }
        }
        alert(
          "Strength Level history sync\n" +
          "✅ Uploaded: " + done.length + (done.length ? "\n   " + done.join("\n   ") : "") +
          "\n⏭ Already there: " + skipped.length +
          (failed.length ? "\n⚠ Failed: " + failed.length + "\n   " + failed.join("\n   ") : "") +
          "\nRefresh your workouts page to see them."
        );
      } catch (e) { alert("Sync error: " + (e && e.message ? e.message : e)); }
    })();
  };
  return (
    "javascript:(" + runner.toString() + ")(" +
    embedded + "," + JSON.stringify(LEGACY_WORKOUT_NAMES) + ");void 0;"
  );
}

export {
  LB_TO_KG,
  SL_EXERCISE_MAP,
  storedSetWeightLb,
  buildStoredSessionPayload,
  buildHistorySyncPlan,
  buildStrengthLevelHistorySnippet,
};
