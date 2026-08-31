import { storedExerciseInputWeight } from "./cable-stack.js";
import {
  isBeltLoadExercise,
  isStoredBeltLoad,
  lastBeltLoadHistoryKey,
  storedBeltLoad,
} from "./belt-load.js";

function hintValue(set, session) {
  return {
    weight_lb: storedExerciseInputWeight(set.exercise, set.weight_lb, session),
    load_type: set.load_type || null,
    reps: set.reps,
    bands_json: set.bands_json,
    grip: set.grip,
  };
}

function hintsFromSessions(sessions) {
  // Sessions arrive newest-first; first write per key wins = most recent.
  const out = {};
  for (const session of sessions || []) {
    for (const set of session.sets || []) {
      const key = `${set.exercise}|${set.set_type}|${set.set_number}`;
      if (!(key in out)) out[key] = hintValue(set, session);
    }
  }
  return out;
}

/**
 * How many working sets the athlete actually performed the last time each
 * exercise appeared (newest session wins). Set number 0 (the Pull-Ups UA
 * opener) is excluded. Stored on the hint map under `__counts` so extra sets
 * added mid-session carry into the next prescription.
 */
function workingSetCountsFromSessions(sessions) {
  const out = {};
  for (const session of sessions || []) {
    const perExercise = {};
    for (const set of session.sets || []) {
      if (set.set_type !== "working") continue;
      const setNumber = parseInt(set.set_number, 10);
      if (!Number.isFinite(setNumber) || setNumber < 1) continue;
      (perExercise[set.exercise] = perExercise[set.exercise] || new Set()).add(setNumber);
    }
    for (const exercise of Object.keys(perExercise)) {
      if (!(exercise in out)) out[exercise] = perExercise[exercise].size;
    }
  }
  return out;
}

function lastBeltLoadHintsFromSessions(sessions) {
  const out = {};
  for (const session of sessions || []) {
    const exerciseNames = new Set(
      (session.sets || [])
        .filter((set) => set.set_type === "working" && isBeltLoadExercise(set.exercise))
        .map((set) => set.exercise),
    );
    for (const exerciseName of exerciseNames) {
      const key = lastBeltLoadHistoryKey(exerciseName);
      if (key in out) continue;
      const explicitLoads = (session.sets || []).filter(
        (set) => set.exercise === exerciseName && set.set_type === "working" && isStoredBeltLoad(set),
      );
      if (!explicitLoads.length) continue;
      const lastAdded = [...explicitLoads].reverse().find((set) => storedBeltLoad(set) > 0);
      out[key] = hintValue(lastAdded || explicitLoads[explicitLoads.length - 1], session);
    }
  }
  return out;
}

/**
 * Normal training remains the source of truth. A deload session is used only
 * when an exercise has no normal working history at all, and all fallback sets
 * come from one most-recent deload session so histories are never spliced.
 * Once the first normal session is completed, that exercise automatically
 * leaves the fallback path.
 */
function exerciseHintsWithDeloadBootstrap(sessions) {
  const completed = sessions || [];
  const normalSessions = completed.filter((session) => !session.is_deload);
  const deloadSessions = completed.filter((session) => !!session.is_deload);
  const out = hintsFromSessions(normalSessions);
  Object.assign(out, lastBeltLoadHintsFromSessions(normalSessions));

  const counts = workingSetCountsFromSessions(normalSessions);
  const deloadCounts = workingSetCountsFromSessions(deloadSessions);
  for (const exercise of Object.keys(deloadCounts)) {
    if (!(exercise in counts)) counts[exercise] = deloadCounts[exercise];
  }
  out.__counts = counts;

  const exercisesWithNormalWork = new Set();
  for (const session of normalSessions) {
    for (const set of session.sets || []) {
      if (set.set_type === "working") exercisesWithNormalWork.add(set.exercise);
    }
  }

  const bootstrapped = new Set();
  for (const session of deloadSessions) {
    const eligibleExercises = new Set(
      (session.sets || [])
        .filter((set) => set.set_type === "working")
        .map((set) => set.exercise)
        .filter((exercise) => !exercisesWithNormalWork.has(exercise) && !bootstrapped.has(exercise)),
    );
    for (const exercise of eligibleExercises) {
      for (const set of session.sets || []) {
        if (set.exercise !== exercise) continue;
        const key = `${set.exercise}|${set.set_type}|${set.set_number}`;
        if (!(key in out)) out[key] = hintValue(set, session);
      }
      bootstrapped.add(exercise);
    }
  }

  return out;
}

export {
  exerciseHintsWithDeloadBootstrap,
  hintsFromSessions,
  lastBeltLoadHintsFromSessions,
  workingSetCountsFromSessions,
};
