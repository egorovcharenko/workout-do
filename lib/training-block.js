import { hintsFromSessions } from "./legacy/exercise-hints.js";
import { isStoredSessionFinished, parseSessionState } from "./legacy/session-status.js";

export const TRAINING_BLOCK_ID = "strength-4-week-v1";
export const TRAINING_BLOCK_NAME = "4-week strength block";
export const TRAINING_BLOCK_DAYS = 28;
export const TRAINING_BLOCK_ROTATION = ["strength-a", "strength-accessories-1", null, "strength-b", "strength-accessories-2", null];
const BLOCK_NAMES = ["Strength A", "Strength Accessories 1", "Strength B", "Strength Accessories 2"];

function calendarDay(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date
    ? timestamp / 86400000 : NaN;
}

export function addCalendarDays(date, days) {
  const day = calendarDay(date);
  if (!Number.isFinite(day)) throw new Error("Choose a valid start date.");
  return new Date((day + days) * 86400000).toISOString().slice(0, 10);
}

export function localCalendarDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function parseTrainingBlock(settings) {
  try {
    const raw = settings?.training_block;
    const block = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (block?.id !== TRAINING_BLOCK_ID || typeof block.instanceId !== "string" || !block.instanceId
      || !["active", "ended"].includes(block.status) || !Number.isFinite(calendarDay(block.startDate))
      || block.returnDate !== addCalendarDays(block.startDate, TRAINING_BLOCK_DAYS)) return null;
    return block;
  } catch { return null; }
}

export function trainingBlockStatus(settings, date = localCalendarDate()) {
  const block = parseTrainingBlock(settings);
  if (!block) return { status: "available", block: null };
  const offset = calendarDay(date) - calendarDay(block.startDate);
  if (block.status === "ended" || offset >= TRAINING_BLOCK_DAYS) return { status: "ended", block };
  if (offset < 0) return { status: "scheduled", block };
  if (!Number.isFinite(offset)) return { status: "available", block: null };
  return { status: "active", block, day: offset + 1, daysLeft: TRAINING_BLOCK_DAYS - offset,
    workoutId: TRAINING_BLOCK_ROTATION[offset % TRAINING_BLOCK_ROTATION.length] };
}

export function createTrainingBlock(startDate, instanceId, today = localCalendarDate()) {
  if (!Number.isFinite(calendarDay(startDate)) || startDate < today) throw new Error("Choose today or a future start date.");
  if (typeof instanceId !== "string" || !instanceId) throw new Error("Could not create the block. Try again.");
  return { id: TRAINING_BLOCK_ID, instanceId, startDate,
    returnDate: addCalendarDays(startDate, TRAINING_BLOCK_DAYS), status: "active" };
}

export function isTrainingBlockSession(session) {
  return BLOCK_NAMES.includes(session?.workout_name)
    || parseSessionState(session?.state_json)?.trainingBlock?.id === TRAINING_BLOCK_ID;
}

export function regularProgramSessions(sessions) {
  return (sessions || []).filter(session => !isTrainingBlockSession(session));
}

export function trainingBlockSessionMatches(session, block) {
  return !!block && parseSessionState(session?.state_json)?.trainingBlock?.instanceId === block.instanceId;
}

export function blockWorkoutCompleted(sessions, block, workoutName, date) {
  return (sessions || []).some(session => session.date === date && session.workout_name === workoutName
    && trainingBlockSessionMatches(session, block) && isStoredSessionFinished(session));
}

export function upcomingBlockDays(block, date = localCalendarDate(), limit = 3) {
  const entries = [];
  for (let i = 0; i < TRAINING_BLOCK_DAYS; i++) {
    const nextDate = addCalendarDays(block.startDate, i);
    if (nextDate <= date) continue;
    entries.push({ date: nextDate, day: i + 1, workoutId: TRAINING_BLOCK_ROTATION[i % 6] });
    if (entries.length >= limit) break;
  }
  return entries;
}

// A and B have different jobs for the same lifts. Only this run's completed
// appearances of this workout can supply its next weights and previous reps.
export function trainingBlockHints(workout, sessions, block, excludeSessionId = null) {
  const completed = (sessions || []).filter(session => session.id !== excludeSessionId
    && session.workout_name === workout.name && trainingBlockSessionMatches(session, block)
    && isStoredSessionFinished(session))
    .sort((a, b) => (b.started_at || b.date).localeCompare(a.started_at || a.date));
  const hints = hintsFromSessions(completed);
  // Preserve the existing dragon-fly variation without importing the old
  // program's loads, rep targets, or extra sets into a new block.
  for (const exercise of workout.exercises.filter(ex => ex.stages)) {
    const latest = (sessions || []).filter(isStoredSessionFinished)
      .slice().sort((a, b) => (b.started_at || b.date).localeCompare(a.started_at || a.date))
      .flatMap(session => session.sets || [])
      .find(set => set.exercise === exercise.name && set.set_type === "working"
        && exercise.stages.some(stage => stage.id === set.grip));
    if (latest && !Object.keys(hints).some(key => key.startsWith(`${exercise.name}|`))) {
      for (let i = 1; i <= exercise.sets; i++) hints[`${exercise.name}|working|${i}`] = {
        weight_lb: null, reps: exercise.defaultWorkReps[i - 1], grip: latest.grip, bands_json: null,
      };
    }
  }
  return hints;
}

export function regularToBlockWorkoutId(id) {
  return { "main-a": "strength-a", "main-b": "strength-b", "micro-arms": "strength-accessories-1", "micro-delts": "strength-accessories-2" }[id] || null;
}

export const BLOCK_PROGRESSION_NOTES = [
  "Main squat, bench and pull-ups: leave 1–2 clean reps available. Easier squats, RDLs and accessories: leave 2–3.",
  "Squat and bench: reach the top of the range on every set in a group, with reserve, on two consecutive appearances of that workout. Then add 2–5 lb and return to the lower target. Progress the main set and back-offs separately.",
  "Pull-ups: build one total rep at a time, 3/3/3/3 → 4/3/3/3 → 4/4/3/3. Stop at two if a third would grind. Compare A with A and B with B.",
  "Easier squats: keep 115 lb for the first two B sessions. Then add 5 lb only if both sets stay comfortable and the main squat session is holding up.",
  "Keep accessory and RDL weights steady during this block. Lower the weight if the minimum reps already require grinding.",
  "At the end, compare the first and last A and B sessions at similar effort, with the same squat depth and pull-up range.",
];

export function buildTrainingBlockWorkouts(regularWorkouts) {
  const library = regularWorkouts.flatMap(workout => workout.exercises.flatMap(ex => ex.supersetExercises || [ex]));
  const exercise = (name, weights, ranges, rest, overrides = {}) => {
    const base = library.find(ex => ex.name === name);
    if (!base) throw new Error(`Missing block exercise: ${name}`);
    return { ...base, sets: weights.length, fixedPrescription: true,
      defaultWork: weights, defaultWorkReps: ranges.map(range => range[0]), workRepRanges: ranges,
      reps: ranges.every(range => range.join() === ranges[0].join()) ? ranges[0].join("-")
        : `1x${ranges[0].join("-")}, ${ranges.length - 1}x${ranges[1].join("-")}`,
      rest, notes: "Leave 2–3 clean reps available. Keep the weight steady during this block.", ...overrides };
  };
  const mainNote = "Leave 1–2 clean reps available. Reach the upper rep target on every set in a group in two consecutive appearances before adding 2–5 lb. Main set and back-offs progress separately.";
  const pullUps = () => exercise("Pull-Ups", [0, 0, 0, 0], [[3, 3], [3, 3], [3, 3], [3, 3]], 180,
    { grips: ["pullup", "chinup", "neutral"], notes: "Leave 1–2 clean reps available; stop at two if three would grind. Build one total rep at a time. Compare A with A and B with B." });
  const core = () => exercise("Dragon Fly Progression", [null, null], [[5, 8], [5, 8]], 120,
    { notes: "Keep your current variation. Leave 2–3 controlled reps available; use an easier stage if needed." });
  const workout = (id, name, label, exercises, main) => ({ id, name, blockLabel: label,
    trainingBlockId: TRAINING_BLOCK_ID, main: !!main, program: false, hidden: true,
    kind: main ? "main" : "micro", rest: main ? 180 : 120, exercises });
  return [
    workout("strength-a", BLOCK_NAMES[0], "A · Squat", [
      exercise("Barbell Back Squat", [135, 115, 115], [[5, 8], [8, 10], [8, 10]], 180,
        { warmups: 4, defaultWarmup: [45, 75, 95, 115], defaultWarmupReps: [8, 5, 3, 1], notes: mainNote }),
      exercise("Barbell Bench Press", [135, 135, 135], [[6, 8], [6, 8], [6, 8]], 180,
        { warmups: 3, defaultWarmup: [45, 95, 115], defaultWarmupReps: [8, 5, 2], notes: mainNote }),
      pullUps(),
      exercise("Low Row", [55, 55], [[8, 12], [8, 12]], 120),
    ], true),
    workout("strength-accessories-1", BLOCK_NAMES[1], "Accessories 1", [
      exercise("Dips", [15, 15], [[6, 8], [6, 8]], 150),
      exercise("Bayesian Cable Curl", [17.5, 17.5], [[10, 12], [10, 12]], 120),
      exercise("Reverse Flyes", [20, 20], [[12, 15], [12, 15]], 120), core(),
    ], false),
    workout("strength-b", BLOCK_NAMES[2], "B · Bench", [
      exercise("Barbell Bench Press", [150, 135, 135], [[3, 5], [6, 8], [6, 8]], 180,
        { warmups: 3, defaultWarmup: [45, 95, 125], defaultWarmupReps: [8, 5, 2], notes: mainNote }),
      pullUps(),
      exercise("Barbell Back Squat", [115, 115], [[6, 6], [6, 6]], 150,
        { warmups: 3, defaultWarmup: [45, 75, 95], defaultWarmupReps: [8, 5, 2],
          notes: "Easier practice: leave three clean reps available. Keep 115 lb for the first two B sessions; then add 5 lb only if both sets stay comfortable and your main squat is holding up." }),
      exercise("Barbell RDL", [185, 185], [[6, 8], [6, 8]], 180,
        { warmups: 3, defaultWarmup: [95, 135, 165], defaultWarmupReps: [5, 3, 1] }),
    ], true),
    workout("strength-accessories-2", BLOCK_NAMES[3], "Accessories 2", [
      exercise("Single-Arm Cable Lateral Raise", [12.5, 12.5], [[10, 15], [10, 15]], 120),
      exercise("Incline DB Curls", [20, 20], [[8, 12], [8, 12]], 120),
      exercise("Calf Raises", [55, 55], [[15, 20], [15, 20]], 120), core(),
    ], false),
  ];
}
