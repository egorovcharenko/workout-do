// Workout builder: the user's edits on top of the code-defined program, kept
// in settings.program_builder as JSON { workouts: { [id]: { name, exercises } } }.
// Saved session names never change (history and progression match on them);
// a rename only changes the display name. Exercises are edited as entries:
// { name, sets: [[lo, hi] | null], rest, warmups: [{ weight, reps }], superset }.
import { MAIN_WORKOUTS, WORKOUTS, findExerciseConfig, setWorkoutDisplayOverrides } from "./legacy/shared.js";
import { EXERCISE_MUSCLES, getMuscleImpact } from "./legacy/standards.js";
import { INSIGHT_MUSCLES } from "./progress-insights.js";
import { TRAINING_BLOCK_ROTATION } from "./training-block.js";

export const PROGRAM_BUILDER_KEY = "program_builder";

export function parseProgramBuilder(settings) {
  try {
    const raw = settings?.[PROGRAM_BUILDER_KEY];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed.workouts === "object" && parsed.workouts ? parsed : null;
  } catch { return null; }
}

const rangeOf = (text) => {
  const match = String(text || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (match) return [+match[1], +match[2]];
  const single = String(text || "").match(/^\s*(\d+)\s*$/);
  return single ? [+single[1], +single[1]] : null;
};

/** Editable entry for one template exercise. */
export function exerciseEntry(ex) {
  const count = Math.max(1, ex.sets || 3);
  const fallback = ex.workRepRanges ? null : rangeOf(ex.reps);
  const warmupCount = ex.noWarmup ? 0 : (ex.warmups ?? 1);
  return {
    name: ex.name,
    sets: Array.from({ length: count }, (_, i) => {
      const range = ex.workRepRanges ? ex.workRepRanges[i] ?? ex.workRepRanges[ex.workRepRanges.length - 1] : fallback;
      return range ? [range[0], range[1]] : null;
    }),
    rest: ex.rest || 60,
    warmups: Array.from({ length: warmupCount }, (_, i) => ({
      weight: ex.defaultWarmup?.[i] ?? null, reps: ex.defaultWarmupReps?.[i] ?? null,
    })),
    superset: ex.superset || null,
  };
}

export function workoutEntries(workout) {
  return workout.exercises.flatMap(ex => ex.supersetExercises
    ? ex.supersetExercises.map(sub => ({ ...exerciseEntry({ ...sub, sets: ex.sets, rest: ex.rest }), superset: `g-${ex.name}` }))
    : [exerciseEntry(ex)]);
}

/** A superset is two or more consecutive entries sharing a group id; a lone
 * or split member drops back to a straight exercise. */
export function normalizeSupersets(entries) {
  const used = new Set();
  let runId = null;
  return entries.map((entry, i) => {
    const id = entry.superset;
    const joined = id && (entries[i - 1]?.superset === id || entries[i + 1]?.superset === id);
    if (!joined) { runId = null; return { ...entry, superset: null }; }
    if (entries[i - 1]?.superset !== id) {
      runId = used.has(id) ? `${id}-${i}` : id;
      used.add(runId);
    }
    return { ...entry, superset: runId };
  });
}

const sameEntry = (a, b) => JSON.stringify({ ...a, superset: null }) === JSON.stringify({ ...b, superset: null });
const resize = (list, n) => list ? Array.from({ length: n }, (_, i) => list[i] ?? list[list.length - 1] ?? null) : list;

function exerciseFromEntry(entry, base) {
  const source = base || { name: entry.name, sets: 3, reps: "8-12", rest: 60 };
  const superset = entry.superset || undefined;
  if (base && sameEntry(entry, exerciseEntry(base))) return { ...base, superset };
  const n = Math.max(1, entry.sets.length);
  const ranges = entry.sets.map(range => range ? [range[0], range[1]] : null);
  const uniqueRanges = ranges.filter(Boolean).map(range => range[0] === range[1] ? `${range[0]}` : range.join("–"))
    .filter((range, i, all) => all.indexOf(range) === i);
  const lp = source.loadProgression;
  const singleGroups = lp?.groups?.every(group => group.length === 1);
  // Existing set groups keep their rules; added sets progress on their own.
  const groups = lp && [...lp.groups.map(group => group.filter(set => set <= n)).filter(group => group.length),
    ...(singleGroups ? ranges.map((_, i) => i + 1).filter(set => set > (source.sets || 0)).map(set => [set]) : [])];
  const followup = source.followupLoad;
  const warmups = entry.warmups || [];
  return {
    ...source, superset,
    sets: n, rest: entry.rest, fixedPrescription: true, preserveSetCount: true,
    reps: uniqueRanges.length ? uniqueRanges.join(" / ") : `${(source.targetRir || [1, 2]).join("–")} RIR`,
    workRepRanges: ranges,
    defaultWork: resize(source.defaultWork, n) || ranges.map(() => null),
    defaultWorkReps: ranges.map(range => range?.[0] ?? null),
    loadProgression: lp && groups.length ? { ...lp, groups } : undefined,
    followupLoad: followup && followup.source <= n && followup.sets.every(set => set <= n) ? followup : undefined,
    noWarmup: warmups.length === 0,
    warmups: warmups.length,
    defaultWarmup: warmups.length ? warmups.map(w => w.weight ?? null) : undefined,
    defaultWarmupReps: warmups.length ? warmups.map(w => w.reps ?? null) : undefined,
  };
}

/** Every exercise the builder can add: program first, then the library. */
export function exerciseLibrary(program = MAIN_WORKOUTS) {
  const seen = new Map();
  const add = ex => { if (ex?.name && !seen.has(ex.name)) seen.set(ex.name, ex); };
  program.forEach(w => w.exercises.forEach(ex => (ex.supersetExercises || [ex]).forEach(add)));
  WORKOUTS.forEach(w => w.exercises.forEach(ex => (ex.supersetExercises || [ex]).forEach(add)));
  return seen;
}

function baseFor(name, workout, program, library) {
  return workout.exercises.find(ex => ex.name === name)
    || program.map(w => w.exercises.find(ex => ex.name === name)).find(Boolean)
    || findExerciseConfig(name) || library.get(name) || null;
}

/** Applies saved builder edits to program workouts (original ones as bases). */
export function applyProgramBuilder(workouts, builder, program = MAIN_WORKOUTS) {
  if (!builder?.workouts) return workouts;
  const library = exerciseLibrary(program);
  return workouts.map(workout => {
    const edit = builder.workouts[workout.id];
    if (!edit) return workout;
    const letters = {};
    const exercises = Array.isArray(edit.exercises)
      ? normalizeSupersets(edit.exercises.filter(entry => entry?.name && Array.isArray(entry.sets) && entry.sets.length))
        .map(entry => exerciseFromEntry({ ...entry, superset: entry.superset
          ? letters[entry.superset] ||= String.fromCharCode(65 + Object.keys(letters).length) : null },
        baseFor(entry.name, workout, program, library)))
      : workout.exercises;
    return { ...workout, exercises, ...(edit.name ? { displayName: edit.name } : {}) };
  });
}

/** Program workouts with the user's builder edits; also syncs display names. */
export function programWorkouts(settings) {
  const builder = parseProgramBuilder(settings);
  setWorkoutDisplayOverrides(Object.fromEntries(MAIN_WORKOUTS
    .filter(w => builder?.workouts?.[w.id]?.name).map(w => [w.name, builder.workouts[w.id].name])));
  return applyProgramBuilder(MAIN_WORKOUTS, builder);
}

/** Planned hard sets per muscle per week: the rotation repeats every
 * ROTATION_DAYS, primary movers count fully, secondary by their ratio. */
export function plannedWeeklyMuscleSets(workouts, rotationDays = TRAINING_BLOCK_ROTATION.length) {
  const perWeek = value => Math.round(value * 7 / rotationDays * 10) / 10;
  const totals = Object.fromEntries(INSIGHT_MUSCLES.map(muscle => [muscle.id, {}]));
  for (const workout of workouts) {
    for (const ex of workout.exercises.flatMap(ex => ex.supersetExercises ? ex.supersetExercises.map(sub => ({ ...sub, sets: ex.sets })) : [ex])) {
      const mapping = EXERCISE_MUSCLES[ex.name];
      if (!mapping) continue;
      const sets = ex.sets || 3;
      const add = (muscle, primary) => {
        if (!(muscle in totals)) return;
        totals[muscle][ex.name] = (totals[muscle][ex.name] || 0) + sets * getMuscleImpact(ex.name, muscle, primary);
      };
      (mapping.primary || []).forEach(muscle => add(muscle, true));
      (mapping.secondary || []).forEach(muscle => add(muscle, false));
    }
  }
  return INSIGHT_MUSCLES.map(muscle => {
    const parts = Object.entries(totals[muscle.id]).map(([name, sets]) => ({ name, sets: perWeek(sets) }))
      .filter(part => part.sets > 0).sort((a, b) => b.sets - a.sets);
    const total = perWeek(Object.values(totals[muscle.id]).reduce((sum, sets) => sum + sets, 0));
    const [low, high] = muscle.target;
    return { ...muscle, perWeek: total, parts, status: total < low ? "low" : total > high ? "high" : "ok" };
  });
}
