// Shared constants and utility functions for Workout Tracker

// Test/sandbox mode: ?test=1 in the URL runs a session normally but persists
// NOTHING real — no /api/save (gated in autoSavePayload), and every session
// localStorage key is namespaced under a throwaway "test:" prefix. So you can
// rehearse a workout (auto-select, override, swaps, logging) without polluting
// real history or clobbering an in-progress real session.
const TEST_MODE = (typeof location !== "undefined") &&
  new URLSearchParams(location.search).get("test") === "1";
const LS_PREFIX = TEST_MODE ? "test:" : "";

// Design tokens — single source so a future tweak flows through the tree.
const T = {
  page: "#0B0F14", cardBg: "rgba(17,24,39,0.45)", cardBorder: "rgba(255,255,255,0.04)", text: "#E5E7EB", strong: "#F3F4F6",
  muted: "#9CA3AF", faint: "#6B7280", disabled: "#4B5563", accent: "#3B82F6", accentLight: "#60A5FA", amber: "#FBBF24",
  amberMid: "#D97706", amberMuted: "#D6B68A", bands: "#C084FC", bandsText: "#E9D5FF", green: "#34D399", red: "#F87171", inv: "#0B0F14", mono: "ui-monospace, Menlo, monospace"
};

const GRIP_LABELS = {
  neutral: { label: "Neutral", hint: "parallel" }, chinup: { label: "Chin-up", hint: "underhand" }, pullup: { label: "Pull-up", hint: "overhand" }, hammer: { label: "Hammer", hint: "neutral" }, supinated: { label: "Supinated", hint: "underhand" }, reverse: { label: "Reverse", hint: "overhand" }
};

// Band resistance levels (Tribe set: 5 stackable bands)
const BANDS = [{ color: "yellow", lb: 5 }, { color: "green", lb: 15 }, { color: "red", lb: 20 }, { color: "blue", lb: 30 }, { color: "black", lb: 35 }];
const BAND_VALUES = BANDS.map(b => b.lb);

// Staged (skill-progression) exercises: instead of a weight, each set records
// which stage of the ladder it was performed at. The stage id is persisted in
// the per-set `grip` column (same round-trip as Pull-Up grips). Order matters:
// index = difficulty rank, used for progress scoring (see calcSet1RM).
const DRAGONFLY_STAGES = [
  { id: "tuck",        label: "Tuck",        hint: "knees tucked" },
  { id: "single-leg",  label: "Single-Leg",  hint: "one leg out" },
  { id: "straddle",    label: "Straddle",    hint: "legs wide" },
  { id: "negatives",   label: "Negatives",   hint: "3-5s lowering" },
  { id: "dragon-flag", label: "Dragon Flag", hint: "full + straight" },
  { id: "dragon-fly",  label: "Dragon Fly",  hint: "hips hinge only" },
];
function stageRank(stages, id) { const i = (stages || []).findIndex(s => s.id === id); return i === -1 ? 0 : i + 1; }
function stageLabel(stages, id) { const s = (stages || []).find(x => x.id === id); return s ? s.label : null; }

// Workouts renamed July 2026 (old sessions in the DB keep the old
// workout_name; the server also aliases these in name-based lookups).
const LEGACY_WORKOUT_NAMES = { "Main A": "Main: Squat", "Main B": "Main: Deadlift", "Main: RDL": "Main: Deadlift", "Micro: Arms & Core": "Micro: Arms" };

const WORKOUTS = [
  {
    id: "main-a", name: "Main: Squat", main: true, program: true, kind: "main", abSplit: "A", rest: 120, warmup: "Empty-bar squats + arm circles, then ramp the bar",
    exercises: [
      { name: "Barbell Back Squat", sets: 3, warmups: 3, reps: "6-10", notes: "Primary quad driver. Set safety pins low.", equipment: "barbell", rest: 150 },
      { name: "Barbell Bench Press", sets: 4, warmups: 3, reps: "1x3-5, 3x8-10", notes: "Rebuild to 180 (no test yet): top set 1x3-5 @ 1-2 RIR, +5 lb when you hit 5. Back-offs 3x8-10 @ 1-2 RIR, +5 lb when the lead set hits 10. No grinding singles. TEST 180 when the top set reaches 170x3. Safeties just below chest.", equipment: "barbell", rest: 150, defaultWarmup: [45, 95, 115], defaultWarmupReps: [10, 5, 3], defaultWork: [155, 140, 140, 140], defaultWorkReps: [4, 8, 8, 8] },
      { name: "Pull-Ups", sets: 3, reps: "1-12", notes: "1. Fresh attempt (1 unassisted). 2. Set 1–2: assisted. 3. Set 3: negatives (3-5s lowering). Top set hits 12 -> REDUCE assistance.", equipment: "band", repsOnly: true, grips: ['pullup', 'neutral', 'chinup'], rest: 90, noWarmup: true },
      // Antagonist pair: barbell + cable, so neither station blocks the other.
      // OHP loses its empty-bar warmup set inside the superset — shoulders are
      // already warm after 7 sets of bench; add a light set manually if needed.
      { name: "Press/Pulldown Superset", sets: 3, reps: "6-12", rest: 90, supersetExercises: [
        { name: "Standing Overhead Press", reps: "6-10", equipment: "barbell", notes: "Front delt. Brace hard." },
        { name: "Lat Pulldown", reps: "8-12", equipment: "cable", notes: "Lats in a real rep range: 8-12 @ 1-2 RIR." },
      ]},
    ],
  },
  {
    id: "micro-arms", name: "Micro: Arms", program: true, kind: "micro", rest: 60, warmup: "One light feel set",
    exercises: [
      // Antagonist pairs on different stations — log a set, go straight to the
      // partner, rest only between rounds.
      { name: "Push/Pull Superset", sets: 3, reps: "8-15", rest: 75, supersetExercises: [
        { name: "Dips", reps: "8-12", repsOnly: true, video: "https://www.youtube.com/shorts/0326dy_-CzM", notes: "Real triceps load." },
        { name: "Dumbbell Bicep Curls", reps: "10-15", video: "https://www.youtube.com/shorts/MKWBV29S6c0", grips: ['supinated', 'hammer', 'reverse'], notes: "Push/pull pair with dips." },
      ]},
      { name: "Delts/Hammers Superset", sets: 3, reps: "10-20", rest: 75, supersetExercises: [
        { name: "Single-Arm Cable Lateral Raise", reps: "12-20", equipment: "cable", notes: "Side delts. Cable keeps constant tension." },
        { name: "Dumbbell Hammer Curls", reps: "10-15", video: "https://www.youtube.com/shorts/0IAJqSwFnHI", grips: ['hammer', 'supinated', 'reverse'], notes: "Focus on hammer grip." },
      ]},
      { name: "Core Superset", sets: 2, reps: "3-15", rest: 90, supersetExercises: [
        { name: "Cable Torso Rotation", reps: "12-15", equipment: "cable", notes: "Rotate left/right." },
        { name: "Dragon Fly Progression", reps: "3-8", stages: DRAGONFLY_STAGES, assist: true, notes: "Pick your stage below. 8 clean reps on all sets -> move up a stage. Slow lowering, lower back stays pressed down." },
      ]},
    ],
  },
  {
    id: "main-b", name: "Main: Deadlift", program: true, kind: "main", abSplit: "B", rest: 120, warmup: "Light hinges + band pull-aparts",
    exercises: [
      { name: "Barbell RDL", sets: 3, warmups: 3, reps: "3-5", equipment: "barbell", rest: 150, notes: "Brace hard, keep flat back. Top-set driven." },
      { name: "Incline Barbell Press", sets: 4, warmups: 2, reps: "8-12", equipment: "barbell", rest: 120, notes: "Bench at ~30°. Top-set driven: 12 reps on top set -> +5 lb next session.", defaultWarmup: [45, 75], defaultWarmupReps: [10, 5], defaultWork: [105, 105, 105, 105], defaultWorkReps: [8, 8, 8, 8] },
      { name: "Pull-Ups", sets: 3, reps: "1-12", notes: "1. Fresh attempt (1 unassisted). 2. Set 1–2: assisted. 3. Set 3: negatives (3-5s lowering). Top set hits 12 -> REDUCE assistance.", equipment: "band", repsOnly: true, grips: ['pullup', 'neutral', 'chinup'], rest: 90, noWarmup: true },
      { name: "Lat Pulldown", sets: 3, reps: "8-12", equipment: "cable", rest: 90, notes: "Lats in a real rep range: 8-12 @ 1-2 RIR. Volume work after the pull-up strength sets.", noWarmup: true },
      { name: "Bent-Over Barbell Rows", sets: 3, warmups: 1, reps: "8-12", equipment: "barbell", rest: 120, notes: "Keep back flat, pull to lower chest." },
    ],
  },
  {
    id: "micro-delts", name: "Micro: Delts & Traps", program: true, kind: "micro", rest: 60, warmup: "Band pull-aparts",
    exercises: [
      // One cable move per superset so the attachment changes between blocks,
      // not between rounds. Reverse Flyes removed from the template — swap
      // Face Pulls to them some sessions (same swap family) to alternate.
      { name: "Delts/Traps Superset", sets: 3, reps: "12-20", rest: 75, supersetExercises: [
        { name: "Single-Arm Cable Lateral Raise", reps: "12-20", equipment: "cable", notes: "Second weekly delt hit. Cable keeps constant tension." },
        { name: "Barbell Shrugs", reps: "12-20", equipment: "barbell", notes: "Pause + squeeze; trap priority." },
      ]},
      { name: "Rear Delt/Biceps Superset", sets: 2, reps: "10-20", rest: 75, supersetExercises: [
        { name: "Cable Face Pulls", reps: "15-20", equipment: "cable", notes: "Rear delt + upper trap; pull pulley to forehead. Alternate with Reverse Flyes via swap." },
        { name: "Incline DB Curls", reps: "10-15", notes: "Stretch-biased biceps." },
      ]},
      { name: "Triceps/Core Superset", sets: 2, reps: "10-15", rest: 75, supersetExercises: [
        { name: "Cable Tricep Pushdowns", reps: "10-15", equipment: "cable", video: "https://www.youtube.com/shorts/eGjSphOefTI", notes: "Constant tension tricep work." },
        { name: "Hanging Knee Raise", reps: "10-15", repsOnly: true },
      ]},
      { name: "Dragon Fly Progression", sets: 2, reps: "3-8", rest: 90, stages: DRAGONFLY_STAGES, notes: "Pick your stage below. 8 clean reps on all sets -> move up a stage. Slow lowering, lower back stays pressed down.", noWarmup: true, assist: true },
    ],
  },
  {
    id: "squat-day", name: "Squat Day", hidden: true, abSplit: "A", rest: 90, warmup: "Squats + arm circles",
    exercises: [
      { name: "Barbell Back Squat", sets: 3, warmups: 3, reps: "6-8", equipment: "barbell", rest: 120 },
      { name: "Dumbbell Flat Bench Press", sets: 4, reps: "8-12", video: "https://www.youtube.com/shorts/YQ0g-a_QLag", rest: 120 },
      { name: "Single-Arm Dumbbell Rows", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/H8jf3DwlIlo", rest: 120 },
      { name: "Seated Overhead Press", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/E9ShwbwZ1zw", rest: 120, noWarmup: true },
      { name: "Reverse Flyes", sets: 3, reps: "15-20", video: "https://www.youtube.com/shorts/LsT-bR_zxLo", rest: 60, noWarmup: true },
      { name: "Sleeve-Buster Superset", sets: 3, reps: "15", rest: 60, supersetExercises: [{ name: "Dips", reps: "8-12", repsOnly: true, video: "https://www.youtube.com/shorts/0326dy_-CzM" }, { name: "Dumbbell Hammer Curls", reps: "8-12", video: "https://www.youtube.com/shorts/0IAJqSwFnHI", grips: ['hammer', 'supinated', 'reverse'] }]},
      { name: "Cable Torso Rotation", sets: 3, reps: "10-12", equipment: "cable", rest: 60, noWarmup: true },
    ],
  },
  {
    id: "deadlift-day", name: "Deadlift Day", hidden: true, abSplit: "B", rest: 90, warmup: "Hinges + pull-aparts",
    exercises: [
      { name: "Barbell RDL", sets: 3, warmups: 3, reps: "3-5", equipment: "barbell", rest: 120 },
      { name: "Incline Barbell Press", sets: 4, warmups: 2, reps: "8-12", equipment: "barbell", rest: 120, defaultWarmup: [45, 75], defaultWarmupReps: [10, 5] },
      { name: "Pull-Ups", sets: 4, reps: "5-8", video: "https://www.youtube.com/shorts/0sRmDbT9Pm0", equipment: "band", repsOnly: true, grips: ['neutral', 'chinup', 'pullup'], rest: 120, noWarmup: true },
      { name: "Standing Overhead Press", sets: 3, reps: "6-8", equipment: "barbell", warmups: 1, rest: 120 },
      { name: "Cable Face Pulls", sets: 3, reps: "15-20", equipment: "cable", rest: 60, noWarmup: true },
      { name: "Sleeve-Buster Superset", sets: 3, reps: "15", rest: 60, supersetExercises: [{ name: "Cable Tricep Pushdowns", reps: "12-15", equipment: "cable", video: "https://www.youtube.com/shorts/eGjSphOefTI" }, { name: "Dumbbell Bicep Curls", reps: "8-12", video: "https://www.youtube.com/shorts/MKWBV29S6c0", grips: ['supinated', 'hammer', 'reverse'] }]},
      { name: "Hanging Knee Raise", sets: 3, reps: "10-15", rest: 60, noWarmup: true, repsOnly: true },
    ],
  },
  {
    id: "full-body", name: "Full Body", hidden: true, rest: 75, warmup: "Squats + arm circles",
    exercises: [
      { name: "Goblet Squat", sets: 3, warmups: 2, reps: "10-12", video: "https://www.youtube.com/shorts/MeIiIdhvXT4", bandAddon: true, rest: 120 },
      { name: "Dumbbell Flat Bench Press", sets: 4, reps: "10-12", video: "https://www.youtube.com/shorts/YQ0g-a_QLag", rest: 120 },
      { name: "Pull-Ups", sets: 4, reps: "5-8", video: "https://www.youtube.com/shorts/0sRmDbT9Pm0", equipment: "band", repsOnly: true, grips: ['neutral', 'chinup', 'pullup'], rest: 120, noWarmup: true },
      { name: "Seated Overhead Press", sets: 4, reps: "8-10", video: "https://www.youtube.com/shorts/E9ShwbwZ1zw", rest: 120, noWarmup: true },
      { name: "Single-Arm Dumbbell Rows", sets: 3, reps: "10-12", video: "https://www.youtube.com/shorts/H8jf3DwlIlo", rest: 120 },
      { name: "Single-Leg DB RDL", sets: 3, reps: "8-10", rest: 120 },
      { name: "Sleeve-Buster Superset", sets: 3, reps: "15", rest: 60, supersetExercises: [{ name: "Cable Tricep Pushdowns", reps: "12-15", equipment: "cable", video: "https://www.youtube.com/shorts/eGjSphOefTI" }, { name: "Dumbbell Hammer Curls", reps: "8-12", video: "https://www.youtube.com/shorts/0IAJqSwFnHI", grips: ['hammer', 'supinated', 'reverse'] }]},
      { name: "Pallof Press", sets: 3, reps: "10-12", equipment: "band", rest: 60, noWarmup: true },
    ],
  },
  {
    id: "full-body-b", name: "Full Body B", hidden: true, rest: 75, warmup: "Light band squats",
    exercises: [
      { name: "Band Squat", sets: 3, warmups: 2, reps: "12-15", video: "https://www.youtube.com/shorts/7VGmSe3FWPU", equipment: "band" },
      { name: "Dumbbell Flat Bench Press", sets: 4, reps: "10-12", video: "https://www.youtube.com/shorts/YQ0g-a_QLag", rest: 120 },
      { name: "Band Row", sets: 3, reps: "12-15", video: "https://www.youtube.com/shorts/BAlsaA1wIhY", equipment: "band", rest: 120 },
      { name: "Band Romanian Deadlift", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/Op7zRCBjGvs", equipment: "band", rest: 120, noWarmup: true },
      { name: "Seated Overhead Press", sets: 4, reps: "8-10", video: "https://www.youtube.com/shorts/E9ShwbwZ1zw", rest: 120, noWarmup: true },
      { name: "Overhead Tricep Extension", sets: 2, reps: "10-15", video: "https://www.youtube.com/shorts/b_r_LW4HEcM" },
      { name: "Sleeve-Buster Superset", sets: 3, reps: "15", rest: 60, supersetExercises: [{ name: "Cable Tricep Pushdowns", reps: "12-15", equipment: "cable", video: "https://www.youtube.com/shorts/eGjSphOefTI" }, { name: "Dumbbell Hammer Curls", reps: "8-12", video: "https://www.youtube.com/shorts/0IAJqSwFnHI", grips: ['hammer', 'supinated', 'reverse'] }]},
    ],
  },
  { id: "arms-shoulders", name: "Arms & Shoulders", hidden: true, rest: 60, warmup: "Elbows/wrists", exercises: [{ name: "Overhead Dumbbell Press", sets: 4, reps: "6-10", video: "https://www.youtube.com/shorts/E9ShwbwZ1zw", rest: 120 }, { name: "Dumbbell Bicep Curls", sets: 3, reps: "8-12", superset: "A", video: "https://www.youtube.com/shorts/MKWBV29S6c0", grips: ['supinated', 'hammer', 'reverse'] }, { name: "Overhead Tricep Extension", sets: 3, reps: "10-15", superset: "A", video: "https://www.youtube.com/shorts/b_r_LW4HEcM" }] },
  { id: "back", name: "Back", hidden: true, rest: 60, warmup: "Light rows", exercises: [{ name: "Dumbbell Bent-Over Rows", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/dpYI8K6e-jE" }, { name: "Single-Arm Dumbbell Rows", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/H8jf3DwlIlo", rest: 75, noWarmup: true }, { name: "Reverse Flyes", sets: 3, reps: "15-20", video: "https://www.youtube.com/shorts/LsT-bR_zxLo" }] }
];

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const interleavedSetNumber = (round, subIdx, subCount) => round * subCount + subIdx + 1;

// Deload week: manual toggle stored in server settings (deload_active = "1",
// deload_started = YYYY-MM-DD). Auto-expires DELOAD_EXPIRY_DAYS after
// activation — computed at read time, nothing on the server flips it back.
const DELOAD_EXPIRY_DAYS = 7;
function isDeloadActive(settings) {
  if (!settings || String(settings.deload_active) !== "1") return false;
  const started = settings.deload_started;
  if (!started) return true;
  const ms = Date.now() - new Date(started + "T00:00:00").getTime();
  return ms >= 0 && ms < DELOAD_EXPIRY_DAYS * 86400000;
}
function deloadDaysLeft(settings) {
  const started = settings && settings.deload_started;
  if (!started) return DELOAD_EXPIRY_DAYS;
  const elapsed = Math.floor((Date.now() - new Date(started + "T00:00:00").getTime()) / 86400000);
  return Math.max(0, DELOAD_EXPIRY_DAYS - elapsed);
}

// Planned-workout queue: an ordered list of upcoming workouts, each with a
// free-text coach note, stored as settings.workout_plan (a JSON array of
// { id, workout, note, added }). The front entry overrides the home rotation
// as "up next"; completed sessions consume matching entries (see
// reconcileWorkoutPlan in components/home/home.js).
function parseWorkoutPlan(settings) {
  try {
    const raw = settings && settings.workout_plan;
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(e => e && e.workout) : [];
  } catch (_) { return []; }
}

// First plan entry for a given workout name (legacy-name aware), or null.
// Used by the session page to surface the note mid-workout.
function planEntryForWorkout(workoutName, settings) {
  const s = settings || (typeof window !== "undefined" ? window.USER_SETTINGS : null);
  const canon = LEGACY_WORKOUT_NAMES[workoutName] || workoutName;
  return parseWorkoutPlan(s).find(e => (LEGACY_WORKOUT_NAMES[e.workout] || e.workout) === canon) || null;
}

const SWAP_GROUPS = [
  { family: "Deadlifts & Hinge (Posterior)", exercises: [
    { name: "Barbell RDL", sets: 3, warmups: 3, reps: "3-5", equipment: "barbell", rest: 120 }, { name: "Barbell Back Squat", sets: 3, warmups: 3, reps: "6-8", equipment: "barbell", rest: 120 },
    { name: "Dumbbell Romanian Deadlift", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/cGMaBqaExBo", rest: 120, noWarmup: true }, { name: "Band Romanian Deadlift", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/Op7zRCBjGvs", equipment: "band", rest: 120, noWarmup: true }, { name: "Single-Leg DB RDL", sets: 3, reps: "8-10", rest: 120 }
  ]},
  { family: "Squats & Quads (Legs)", exercises: [
    { name: "Barbell Back Squat", sets: 3, warmups: 3, reps: "6-8", equipment: "barbell", rest: 120 }, { name: "Barbell RDL", sets: 3, warmups: 3, reps: "3-5", equipment: "barbell", rest: 120 }, { name: "Bulgarian Split Squat", sets: 3, warmups: 2, reps: "8-10", video: "https://www.youtube.com/shorts/2C-uNgKwPLE", bandAddon: true, rest: 120 },
    { name: "Goblet Squat", sets: 3, warmups: 2, reps: "10-12", video: "https://www.youtube.com/shorts/MeIiIdhvXT4", bandAddon: true, rest: 120 }, { name: "Band Squat", sets: 3, warmups: 2, reps: "12-15", video: "https://www.youtube.com/shorts/7VGmSe3FWPU", equipment: "band" }, { name: "Lunges", sets: 3, reps: "10-12", rest: 90 }
  ]},
  { family: "Chest Press (Push)", exercises: [
    { name: "Barbell Bench Press", sets: 4, warmups: 3, reps: "1x3-5, 3x8-10", notes: "Rebuild to 180 (no test yet): top set 1x3-5 @ 1-2 RIR, +5 lb when you hit 5. Back-offs 3x8-10 @ 1-2 RIR, +5 lb when the lead set hits 10. No grinding singles. TEST 180 when the top set reaches 170x3. Safeties just below chest.", equipment: "barbell", rest: 150, defaultWarmup: [45, 95, 115], defaultWarmupReps: [10, 5, 3], defaultWork: [155, 140, 140, 140], defaultWorkReps: [4, 8, 8, 8] }, { name: "Incline Barbell Press", sets: 4, warmups: 2, reps: "8-12", equipment: "barbell", rest: 120, notes: "Bench at ~30°. Double progression: 12 on all sets -> +5 lb.", defaultWarmup: [45, 75], defaultWarmupReps: [10, 5], defaultWork: [100, 100, 100, 100], defaultWorkReps: [8, 8, 8, 8] },
    { name: "Dumbbell Flat Bench Press", sets: 4, reps: "8-12", video: "https://www.youtube.com/shorts/YQ0g-a_QLag", rest: 120 }, { name: "Incline Dumbbell Press", sets: 4, reps: "8-12", rest: 120 }
  ]},
  { family: "Overhead Press (Shoulders)", exercises: [
    { name: "Standing Overhead Press", sets: 3, warmups: 1, reps: "6-8", equipment: "barbell", rest: 120 }, { name: "Seated Overhead Press", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/E9ShwbwZ1zw", rest: 120, noWarmup: true }
  ]},
  { family: "Back Rows & Pulls (Pull)", exercises: [
    { name: "Pull-Ups", sets: 4, reps: "5-8", video: "https://www.youtube.com/shorts/0sRmDbT9Pm0", equipment: "band", repsOnly: true, grips: ['neutral', 'chinup', 'pullup'], rest: 120, noWarmup: true },
    { name: "Lat Pulldown", sets: 3, reps: "8-12", equipment: "cable", rest: 90, notes: "Lats in a real rep range: 8-12 @ 1-2 RIR. Volume work to complement pull-up top sets.", noWarmup: true },
    { name: "Single-Arm Dumbbell Rows", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/H8jf3DwlIlo", rest: 120 },
    { name: "Bent-Over Barbell Rows", sets: 3, reps: "8-12", equipment: "barbell", rest: 120 }, { name: "Dumbbell Bent-Over Rows", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/dpYI8K6e-jE", rest: 120 }, { name: "Band Row", sets: 3, reps: "12-15", video: "https://www.youtube.com/shorts/BAlsaA1wIhY", equipment: "band", rest: 120 }
  ]},
  { family: "Rear Delts & Cable Face Pulls", exercises: [
    { name: "Cable Face Pulls", sets: 3, reps: "15-20", equipment: "cable", rest: 60, noWarmup: true }, { name: "Reverse Flyes", sets: 3, reps: "15-20", video: "https://www.youtube.com/shorts/LsT-bR_zxLo", rest: 60, noWarmup: true }
  ]},
  { family: "Lateral Raises (Side Delts)", exercises: [
    { name: "Single-Arm Cable Lateral Raise", sets: 3, reps: "12-20", notes: "Side delts. Cable keeps constant tension.", equipment: "cable", rest: 60, noWarmup: true },
    { name: "Dumbbell Lateral Raises", sets: 3, reps: "12-20", notes: "Side delts. Chase reps.", rest: 60, noWarmup: true }
  ]},
  { family: "Triceps (Arm Extension)", exercises: [
    { name: "Cable Tricep Pushdowns", sets: 3, reps: "12-15", equipment: "cable", video: "https://www.youtube.com/shorts/eGjSphOefTI", rest: 60 }, { name: "Dips", sets: 3, reps: "8-12", repsOnly: true, video: "https://www.youtube.com/shorts/0326dy_-CzM", rest: 60 }, { name: "Overhead Tricep Extension", sets: 2, reps: "10-15", video: "https://www.youtube.com/shorts/b_r_LW4HEcM" }
  ]},
  { family: "Biceps (Arm Flexion)", exercises: [
    { name: "Dumbbell Bicep Curls", sets: 2, reps: "8-12", video: "https://www.youtube.com/shorts/MKWBV29S6c0", grips: ['supinated', 'hammer', 'reverse'] }, { name: "Incline DB Curls", sets: 2, reps: "10-15", rest: 60 },
    { name: "Dumbbell Hammer Curls", sets: 3, reps: "8-12", video: "https://www.youtube.com/shorts/0IAJqSwFnHI", grips: ['hammer', 'supinated', 'reverse'] }, { name: "Band Bicep Curls", sets: 2, reps: "12-15", video: "https://www.youtube.com/shorts/5ACsDBt_sMQ", equipment: "band", grips: ['supinated', 'hammer', 'reverse'] }
  ]},
  { family: "Calves", exercises: [{ name: "Calf Raises", sets: 3, reps: "15-20", rest: 60 }]},
  { family: "Shrugs (Traps)", exercises: [{ name: "Barbell Shrugs", sets: 3, reps: "12-20", rest: 45, notes: "Pause + squeeze; trap priority.", equipment: "barbell", noWarmup: true }, { name: "Dumbbell Shrugs", sets: 3, reps: "12-20", rest: 45, notes: "Pause + squeeze; trap priority.", noWarmup: true }]},
  { family: "Core", exercises: [
    { name: "Cable Torso Rotation", sets: 3, reps: "10-12", equipment: "cable", rest: 60, noWarmup: true },
    { name: "Band Torso Rotation", sets: 3, reps: "10-12", equipment: "band", rest: 60, noWarmup: true },
    { name: "Hanging Knee Raise", sets: 3, reps: "10-15", rest: 60, noWarmup: true, repsOnly: true },
    { name: "Pallof Press", sets: 3, reps: "10-12", equipment: "band", rest: 60, noWarmup: true },
    { name: "Dragon Fly Progression", sets: 2, reps: "3-8", rest: 90, stages: DRAGONFLY_STAGES, notes: "Pick your stage below. 8 clean reps on all sets -> move up a stage. Slow lowering, lower back stays pressed down.", noWarmup: true, assist: true }
  ]}
];

function findExerciseConfig(n) { const name = n === "Bench Dips" ? "Dips" : n; for (const g of SWAP_GROUPS) { const f = g.exercises.find(e => e.name === name); if (f) return f; } return null; }
function getSwapGroup(n) { const name = n === "Bench Dips" ? "Dips" : n, g = SWAP_GROUPS.find(grp => grp.exercises.some(e => e.name === name)); return g ? g.exercises : null; }
function getSwapGroupName(n) { const name = n === "Bench Dips" ? "Dips" : n, g = SWAP_GROUPS.find(grp => grp.exercises.some(e => e.name === name)); return g ? g.family : null; }
function getSwapOptions(n) { const name = n === "Bench Dips" ? "Dips" : n, g = getSwapGroup(name); return g ? g.filter(e => e.name !== name) : []; }
function isSwappable(n) { const name = n === "Bench Dips" ? "Dips" : n; return SWAP_GROUPS.some(g => g.exercises.some(e => e.name === name)); }
function getSetRepRange(repsStr, setIdx) { if (!repsStr.includes(",")) return repsStr; let cur = 0; for (const p of repsStr.split(",")) { const m = p.match(/(\d+)x([\d-]+)/); if (m) { const c = +m[1]; if (setIdx >= cur && setIdx < cur + c) return m[2]; cur += c; } } return repsStr; }
function getDrivingSetIdx(exName, setKey) { return exName === "Barbell Bench Press" ? (setKey === 0 ? 0 : 1) : 0; }


function getSetupTime(exName, equipment) {
  const name = exName.toLowerCase();
  const eq = (equipment || "").toLowerCase();
  if (name.includes("back squat") || name.includes("bench press") || name.includes("deadlift") || name.includes("rdl")) return 180;
  if (eq === "barbell" || name.includes("barbell") || name.includes("overhead press")) return 120;
  if (name.includes("dead hang") || name.includes("torso rotation") || name.includes("face pull") || name.includes("reverse flye") || name.includes("shrug")) return 30;
  return 60;
}

function estimateExerciseDuration(ex) {
  if (!ex || ex.skipped) return 0;
  const isUnilateral = ex.name.includes("Single-") || ex.name.includes("Bulgarian") || ex.name.includes("One-Leg") || ex.name.includes("One-Arm");
  const setWork = isUnilateral ? 90 : 45;
  const sets = ex.sets || [];
  const hasArraySets = Array.isArray(sets);
  const totalSets = hasArraySets ? sets.length : (ex.noWarmup ? 0 : (ex.warmups || 1)) + (ex.sets || 3);
  if (totalSets === 0) return 0;
  const setupTime = getSetupTime(ex.name, ex.equipment);
  const workTime = totalSets * setWork;
  const warmups = hasArraySets ? sets.filter(s => s.kind === "warmup").length : (ex.noWarmup ? 0 : (ex.warmups || 1));
  const workSets = hasArraySets ? sets.filter(s => s.kind === "work").length : (ex.sets || 3);
  let restTime = 0;
  if (warmups > 0) {
    restTime += warmups * 60;
    if (workSets > 0) restTime += (workSets - 1) * (ex.rest || 60);
    else restTime -= 60;
  } else {
    restTime += (workSets - 1) * (ex.rest || 60);
  }
  return setupTime + workTime + Math.max(0, restTime);
}

function estimateActiveWorkoutDuration(exercises) {
  if (!exercises || !exercises.length) return 0;
  const supersets = {};
  const singles = [];
  let groupCount = 0;
  exercises.forEach(ex => {
    if (ex.skipped) return;
    if (ex.superset) {
      if (!supersets[ex.superset]) { supersets[ex.superset] = []; groupCount++; }
      supersets[ex.superset].push(ex);
    } else {
      singles.push(ex);
      groupCount++;
    }
  });
  let totalSec = 0;
  singles.forEach(ex => { totalSec += estimateExerciseDuration(ex); });
  Object.values(supersets).forEach(group => {
    let totalSets = 0, maxRest = 60, workTime = 0, setupTime = 0;
    group.forEach(ex => {
      const isUnilateral = ex.name.includes("Single-") || ex.name.includes("Bulgarian") || ex.name.includes("One-Leg") || ex.name.includes("One-Arm");
      const setWork = isUnilateral ? 90 : 45;
      const setsCount = ex.sets ? ex.sets.length : 0;
      totalSets += setsCount;
      workTime += setsCount * setWork;
      setupTime += getSetupTime(ex.name, ex.equipment);
      if (ex.rest > maxRest) maxRest = ex.rest;
    });
    totalSec += setupTime + workTime + (totalSets > 1 ? (totalSets - 1) * maxRest : 0);
  });
  if (groupCount > 1) totalSec += (groupCount - 1) * 120;
  return totalSec;
}

function estimateTemplateWorkoutDuration(w) {
  if (!w || !w.exercises) return 0;
  const supersets = {};
  const singles = [];
  let groupCount = 0;
  w.exercises.forEach(ex => {
    if (ex.optional) return;
    if (ex.superset) {
      if (!supersets[ex.superset]) { supersets[ex.superset] = []; groupCount++; }
      supersets[ex.superset].push(ex);
    } else if (ex.supersetExercises) {
      const key = `group_${ex.name}`;
      if (!supersets[key]) { supersets[key] = []; groupCount++; }
      ex.supersetExercises.forEach(sub => {
        supersets[key].push({ ...sub, sets: ex.sets, rest: ex.rest });
      });
    } else {
      singles.push(ex);
      groupCount++;
    }
  });
  let totalSec = 0;
  singles.forEach(ex => { totalSec += estimateExerciseDuration(ex); });
  Object.values(supersets).forEach(group => {
    let totalSets = 0, maxRest = 60, workTime = 0, setupTime = 0;
    group.forEach(ex => {
      const isUnilateral = ex.name.includes("Single-") || ex.name.includes("Bulgarian") || ex.name.includes("One-Leg") || ex.name.includes("One-Arm");
      const setWork = isUnilateral ? 90 : 45;
      const setsCount = ex.sets || 3;
      totalSets += setsCount;
      workTime += setsCount * setWork;
      setupTime += getSetupTime(ex.name, ex.equipment);
      if (ex.rest > maxRest) maxRest = ex.rest;
    });
    totalSec += setupTime + workTime + (totalSets > 1 ? (totalSets - 1) * maxRest : 0);
  });
  if (groupCount > 1) totalSec += (groupCount - 1) * 120;
  return totalSec;
}

if (typeof window !== "undefined") {
  Object.assign(window, { WORKOUTS, localDate, interleavedSetNumber, SWAP_GROUPS, findExerciseConfig, getSwapGroup, getSwapGroupName, getSwapOptions, isSwappable, estimateExerciseDuration, estimateActiveWorkoutDuration, estimateTemplateWorkoutDuration, getSetRepRange, getDrivingSetIdx, isDeloadActive, deloadDaysLeft, DRAGONFLY_STAGES, stageRank, stageLabel, LEGACY_WORKOUT_NAMES });
}

export {
  TEST_MODE, LS_PREFIX, T, GRIP_LABELS, BANDS, BAND_VALUES, DRAGONFLY_STAGES, stageRank, stageLabel,
  LEGACY_WORKOUT_NAMES, WORKOUTS, localDate, interleavedSetNumber, DELOAD_EXPIRY_DAYS, isDeloadActive,
  deloadDaysLeft, SWAP_GROUPS, findExerciseConfig, getSwapGroup, getSwapGroupName, getSwapOptions,
  isSwappable, getSetRepRange, getDrivingSetIdx, getSetupTime, estimateExerciseDuration,
  estimateActiveWorkoutDuration, estimateTemplateWorkoutDuration, parseWorkoutPlan, planEntryForWorkout,
};
