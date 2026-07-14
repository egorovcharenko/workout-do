import { storedExerciseInputWeight } from "./cable-stack.js";

function hintValue(set, session) {
  return {
    weight_lb: storedExerciseInputWeight(set.exercise, set.weight_lb, session),
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

export { exerciseHintsWithDeloadBootstrap, hintsFromSessions };
