import { hintsFromSessions, workingSetCountsFromSessions } from "./legacy/exercise-hints.js";
import { isStoredSessionFinished, parseSessionState } from "./legacy/session-status.js";

export const TRAINING_BLOCK_ID = "strength-4-week-v1";
export const TRAINING_BLOCK_NAME = "4-week strength block";
export const TRAINING_BLOCK_DAYS = 28;
export const TRAINING_BLOCK_PRESCRIPTION_REVISION = 2;
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
      || block.returnDate !== addCalendarDays(block.startDate, TRAINING_BLOCK_DAYS)
      || (block.resumeDate != null && (!Number.isFinite(calendarDay(block.resumeDate))
        || block.resumeDate < block.startDate || block.resumeDate >= block.returnDate))) return null;
    return block;
  } catch { return null; }
}

export function trainingBlockStatus(settings, date = localCalendarDate()) {
  const block = parseTrainingBlock(settings);
  if (!block) return { status: "available", block: null };
  const offset = calendarDay(date) - calendarDay(block.startDate);
  if (block.status === "ended" || offset >= TRAINING_BLOCK_DAYS) return { status: "ended", block };
  if (offset < 0) return { status: "scheduled", block };
  if (block.resumeDate && date < block.resumeDate) return { status: "paused", block };
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
export function trainingBlockPrescriptionMatches(session, workout) {
  return (parseSessionState(session?.state_json)?.trainingBlock?.prescriptionRevision || 1)
    === (workout?.prescriptionRevision || 1);
}

// Existing workouts keep their original prescription through a release or expiry.
// The revision belongs to the session; changing it must not restart the calendar.
export function resolveTrainingBlockSession(workout, block, savedSession, regularWorkouts) {
  if (!workout.trainingBlockId) return { workout, block };
  const saved = parseSessionState(savedSession?.state_json)?.trainingBlock;
  const revision = savedSession ? saved?.prescriptionRevision || 1 : TRAINING_BLOCK_PRESCRIPTION_REVISION;
  return {
    workout: buildTrainingBlockWorkouts(regularWorkouts, revision).find(item => item.id === workout.id) || workout,
    block: savedSession ? saved || block : { ...block, prescriptionRevision: revision },
  };
}

export function trainingBlockHints(workout, sessions, block, excludeSessionId = null) {
  const completed = (sessions || []).filter(session => session.id !== excludeSessionId
    && session.workout_name === workout.name && trainingBlockSessionMatches(session, block)
    && trainingBlockPrescriptionMatches(session, workout)
    && isStoredSessionFinished(session))
    .sort((a, b) => (b.started_at || b.date).localeCompare(a.started_at || a.date));
  const revised = workout.prescriptionRevision >= 2;
  const baseline = revised ? regularProgramSessions(sessions).filter(session => isStoredSessionFinished(session)
    && !session.is_deload && session.date < (block.resumeDate || block.startDate))
    .slice().sort((a, b) => String(b.started_at || b.date).localeCompare(String(a.started_at || a.date))) : [];
  const hints = hintsFromSessions(completed);
  if (revised) {
    hints.__counts = workingSetCountsFromSessions(completed);
    for (const exercise of workout.exercises) {
      const latest = baseline.find(session => (session.sets || []).some(set => set.exercise === exercise.name && set.set_type === "working"));
      if (!latest) continue;
      // Bootstrap an exercise from one appearance, not a mixture of old sets.
      // Once this revision has logged it, its own history owns the next load.
      if (completed.some(session => (session.sets || []).some(set => set.exercise === exercise.name && set.set_type === "working"))) continue;
      const rows = (latest.sets || []).filter(set => set.exercise === exercise.name);
      const normalized = rows.map(set => exercise.name === "Pull-Ups" && rows.some(row => row.set_type === "working" && Number(row.set_number) === 0)
        && set.set_type === "working" ? { ...set, set_number: Number(set.set_number) + 1, grip: set.grip || "pullup" } : set);
      Object.assign(hints, hintsFromSessions([{ ...latest, sets: normalized }]));
      Object.assign(hints.__counts, workingSetCountsFromSessions([{ ...latest, sets: normalized }]));
      if (exercise.name === "Barbell Bench Press") {
        const top = hints[`${exercise.name}|working|1`];
        if (top && top.weight_lb > 150) top.weight_lb = 150;
      }
    }
    return hints;
  }
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
  "Keep your usual exercises, working sets and recent loads. This block changes effort and rest, with no extra squat or bench sessions added on top.",
  "Leave 1–2 clean reps available on working sets. RDLs and dragon flies: leave 2; stop before position or control breaks down. Rep ranges guide progression, not a requirement to grind or stop early.",
  "Progress throughout the block. Reach the upper range with reserve on two consecutive appearances, then accept the smallest practical load increase. Squats need one qualifying appearance; S2 matches S1 for 6–10 reps unless you need a lighter load. Each set or matching group progresses separately; a missed target does not automatically lower your weights.",
  "Pull-ups: keep four sets, stopping at 1–2 RIR. Reps can vary between sets. Dragon flies: keep your current stage and three sets; advance when all three reach 8 clean reps with reserve.",
  "Rest about 3 minutes for demanding compounds and 2 minutes for isolation work. Extend rest when needed to sustain clean later sets.",
  "Bench starts with a 150 lb top set to avoid repeating the grinding 160 lb triple. Your established back-off loads remain. Review performance at similar effort and technique when the block ends.",
];

function buildLegacyTrainingBlockWorkouts(regularWorkouts) {
  const library = regularWorkouts.flatMap(workout => workout.exercises.flatMap(ex => ex.supersetExercises || [ex]));
  const exercise = (name, weights, ranges, rest, overrides = {}) => {
    const base = library.find(ex => ex.name === name);
    if (!base) throw new Error(`Missing block exercise: ${name}`);
    return { ...base, sets: weights.length, fixedPrescription: true,
      defaultWork: weights, defaultWorkReps: weights.map((_, index) => ranges?.[index]?.[0] ?? null),
      workRepRanges: ranges || weights.map(() => null),
      reps: overrides.targetRir ? `${overrides.targetRir.join("–")} RIR`
        : ranges.every(range => range.join() === ranges[0].join()) ? ranges[0].join("-")
        : `1x${ranges[0].join("-")}, ${ranges.length - 1}x${ranges[1].join("-")}`,
      rest, notes: "Leave 2–3 clean reps available. Keep the weight steady during this block.", ...overrides };
  };
  const mainNote = "Leave 1–2 clean reps available. Reach the upper rep target on every set in a group in two consecutive appearances before adding 2–5 lb. Main set and back-offs progress separately.";
  const pullUps = () => exercise("Pull-Ups", [0, 0, 0, 0], null, 180,
    { targetRir: [1, 2], grips: ["pullup"],
      notes: "Finish each set with one or two clean reps still available (1–2 RIR). Reps can vary by set. Compare A with A and B with B." });
  const core = () => exercise("Dragon Fly Progression", [null, null], [[5, 8], [5, 8]], 120,
    { notes: "Keep your current variation. Leave 2–3 controlled reps available; use an easier stage if needed." });
  const workout = (id, name, label, exercises, main) => ({ id, name, blockLabel: label,
    trainingBlockId: TRAINING_BLOCK_ID, main: !!main, program: false, hidden: true,
    kind: main ? "main" : "micro", rest: main ? 180 : 120, exercises });
  return [
    workout("strength-a", BLOCK_NAMES[0], "A · Squat", [
      exercise("Barbell Back Squat", [135, 115, 115], [[5, 8], [8, 10], [8, 10]], 180,
        { warmups: 4, defaultWarmup: [45, 75, 95, 115], defaultWarmupReps: [8, 5, 3, 1], notes: mainNote,
          loadProgression: { increment: 5, groups: [[1], [2, 3]] } }),
      exercise("Barbell Bench Press", [135, 135, 135], [[6, 8], [6, 8], [6, 8]], 180,
        { warmups: 3, defaultWarmup: [45, 95, 115], defaultWarmupReps: [8, 5, 2], notes: mainNote,
          loadProgression: { increment: 2, groups: [[1, 2, 3]] } }),
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
        { warmups: 3, defaultWarmup: [45, 95, 125], defaultWarmupReps: [8, 5, 2], notes: mainNote,
          loadProgression: { increment: 2, groups: [[1], [2, 3]] } }),
      pullUps(),
      exercise("Barbell Back Squat", [115, 115], [[6, 6], [6, 6]], 150,
        { warmups: 3, defaultWarmup: [45, 75, 95], defaultWarmupReps: [8, 5, 2],
          loadProgression: { increment: 5, groups: [[1, 2]], practice: true },
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


/** Audited against the last complete regular rotation, including user-added
 * sets. Defaults are starting references; revised-session history takes over.
 */
export function buildTrainingBlockWorkouts(regularWorkouts, revision = TRAINING_BLOCK_PRESCRIPTION_REVISION) {
  if (revision < 2) return buildLegacyTrainingBlockWorkouts(regularWorkouts);
  const library = regularWorkouts.flatMap(workout => workout.exercises.flatMap(ex => ex.supersetExercises || [ex]));
  const exercise = (name, weights, ranges, rest, increment, overrides = {}) => {
    const base = library.find(ex => ex.name === name);
    if (!base) throw new Error(`Missing block exercise: ${name}`);
    const workRepRanges = ranges && (Array.isArray(ranges[0]) ? ranges : weights.map(() => ranges));
    const targetRir = overrides.targetRir || [1, 2];
    return { ...base, sets: weights.length, fixedPrescription: true, preserveSetCount: true,
      defaultWork: weights, defaultWorkReps: weights.map((_, i) => workRepRanges?.[i]?.[0] ?? null),
      workRepRanges: workRepRanges || weights.map(() => null), targetRir,
      reps: workRepRanges ? workRepRanges.map(range => range.join("–")).filter((range, i, all) => all.indexOf(range) === i).join(" / ") : `${targetRir.join("–")} RIR`,
      rest, notes: `Leave ${targetRir.join("–")} clean reps available. Keep progressing when the upper range is comfortable; extend rest if needed.`,
      loadProgression: increment ? { increment, groups: weights.map((_, i) => [i + 1]) } : undefined,
      ...overrides };
  };
  const core = () => exercise("Dragon Fly Progression", [null, null, null], [3, 8], 120, null,
    { targetRir: [2, 2], notes: "Keep your current stage and three sets. Stop with two controlled reps available. Advance when all three sets reach 8 with reserve; stop before body position breaks." });
  const pullUps = () => exercise("Pull-Ups", [0, 0, 0, 0], null, 180, null,
    { grips: ["pullup"], notes: "Four sets at 1–2 RIR. Finish with one or two clean reps available; reps can vary by set." });
  const workout = (id, name, label, exercises, main) => ({ id, name, blockLabel: label, exercises,
    trainingBlockId: TRAINING_BLOCK_ID, prescriptionRevision: TRAINING_BLOCK_PRESCRIPTION_REVISION,
    main, program: false, hidden: true, kind: main ? "main" : "micro", rest: main ? 180 : 120 });
  return [
    workout("strength-a", BLOCK_NAMES[0], "A · Squat & Bench", [
      exercise("Barbell Back Squat", [135, 135, 115], [[5, 8], [6, 10], [8, 10]], 180, 5,
        { warmups: 4, defaultWarmup: [45, 75, 95, 115], defaultWarmupReps: [8, 5, 3, 1],
          followupLoad: { source: 1, sets: [2], range: [6, 10] },
          notes: "S2: keep the S1 weight for 6–10 reps at 1–2 RIR. Lower it only if 6 clean reps are not achievable. Add 5 lb to S1 after reaching 8 with reserve in one workout.",
          loadProgression: { increment: 5, groups: [[1], [3]], required: 1 } }),
      exercise("Barbell Bench Press", [150, 145, 145, 125], [[3, 5], [5, 10], [5, 10], [8, 12]], 180, 2,
        { warmups: 3, defaultWarmup: [45, 95, 125], defaultWarmupReps: [8, 5, 2] }),
      pullUps(),
      exercise("Standing Overhead Press", [95, 95, 95], [4, 10], 180, 2,
        { warmups: 1, defaultWarmup: [45], defaultWarmupReps: [8] }),
      exercise("Lat Pulldown", [60, 55, 55], [6, 12], 120, 1.25),
    ], true),
    workout("strength-accessories-1", BLOCK_NAMES[1], "Accessories 1 · Dips & Arms", [
      exercise("Dips", [25, 25, 25], [5, 12], 180, 2.5),
      exercise("Bayesian Cable Curl", [20, 20, 20], [6, 15], 120, 1.25),
      exercise("Reverse Flyes", [25, 25, 25], [8, 15], 120, 2.5),
      exercise("Dumbbell Hammer Curls", [30, 30, 30], [5, 12], 120, 2.5),
      exercise("Overhead Tricep Extension", [35, 35, 35], [6, 15], 120, 1.25), core(),
    ], false),
    workout("strength-b", BLOCK_NAMES[2], "B · RDL & Incline", [
      exercise("Barbell RDL", [205, 205, 165], [[4, 8], [4, 8], [8, 15]], 180, 5,
        { targetRir: [2, 2], warmups: 3, defaultWarmup: [95, 135, 165], defaultWarmupReps: [5, 3, 1] }),
      exercise("Incline Barbell Press", [135, 135, 115, 115], [[4, 8], [4, 8], [6, 12], [6, 12]], 180, 2,
        { warmups: 2, defaultWarmup: [45, 95], defaultWarmupReps: [8, 5] }),
      pullUps(),
      exercise("Neutral-Grip Lat Pulldown", [60, 60, 60], [6, 12], 120, 1.25),
      exercise("Low Row", [65, 65, 60], [6, 12], 180, 1.25),
    ], true),
    workout("strength-accessories-2", BLOCK_NAMES[3], "Accessories 2 · Delts & Traps", [
      exercise("Single-Arm Cable Lateral Raise", [15, 15, 10], [6, 15], 120, 1.25),
      exercise("Barbell Shrugs", [135, 205, 205, 205], [[10, 12], [6, 15], [6, 15], [6, 15]], 120, 5),
      exercise("Single-Arm Cable Rear Delt Fly", [15, 15, 15], [8, 15], 120, 1.25),
      exercise("Incline DB Curls", [20, 20, 20], [6, 15], 120, 2.5),
      exercise("Cable Tricep Pushdowns", [55, 55, 55], [5, 12], 120, 1.25),
      exercise("Calf Raises", [55, 55, 55], [15, 20], 120, 1.25), core(),
    ], false),
  ];
}
