function isResolvedSet(set) {
  return !!(set?.completed || set?.userSkipped);
}

function firstPendingSetIndex(exercise) {
  return exercise?.sets?.findIndex(set => !isResolvedSet(set)) ?? -1;
}

function skipRemainingWarmups(exercises, eIdx) {
  return exercises.map((exercise, index) => {
    if (index !== eIdx) return exercise;
    const sets = exercise.sets.map(set => {
      if (set.kind !== "warmup") return set;
      if (set.completed) return set.active ? { ...set, active: false } : set;
      return { ...set, active: false, completed: false, userSkipped: true };
    });
    const firstWork = sets.findIndex(set => set.kind === "work" && !isResolvedSet(set));
    if (firstWork !== -1) sets[firstWork] = { ...sets[firstWork], active: true };
    return { ...exercise, sets };
  });
}

function selectedSetWeight(set) {
  return set?.weight ?? set?.lastWeight ?? 0;
}

function exerciseNameExists(exercises, name, excludeIndex = -1) {
  const normalized = String(name || "").trim().toLowerCase();
  return exercises.some((exercise, index) => (
    index !== excludeIndex && exercise.name.trim().toLowerCase() === normalized
  ));
}

function buildLibraryExerciseTemplate(name, official) {
  return {
    name,
    sets: official?.sets || 3,
    reps: official?.reps || "8-12",
    notes: official?.notes || "Added from library.",
    equipment: official?.equipment || null,
    noWarmup: !!official?.noWarmup,
    assist: !!official?.assist,
    repsOnly: !!official?.repsOnly,
    bandAddon: !!official?.bandAddon,
    stages: official?.stages || null,
    session: official?.session || null,
    rest: official?.rest || 60,
    video: official?.video || null,
    grips: official?.grips || null,
    defaultWarmup: official?.defaultWarmup,
    defaultWarmupReps: official?.defaultWarmupReps,
    defaultWork: official?.defaultWork,
    defaultWorkReps: official?.defaultWorkReps,
  };
}

/**
 * Whether a saved exercise that is no longer in the program should come back.
 *
 * Any set the UI renders gets persisted, previews included, so "has saved
 * sets" used to be true for an exercise the user never touched. That made an
 * exercise removed from the program reappear in every session that had once
 * displayed it — the face pulls Egor deleted three times on Nov 13, 2026.
 * Restore only real work: a completed set, a logged rep count, or a set the
 * user deliberately skipped. Untouched previews are program residue.
 */
function shouldRestoreCustomExercise(savedSets) {
  if (!Array.isArray(savedSets)) return false;
  return savedSets.some((set) => set && (set.customAdded || set.completed || set.reps != null || set.userSkipped));
}

export {
  buildLibraryExerciseTemplate,
  exerciseNameExists,
  firstPendingSetIndex,
  isResolvedSet,
  selectedSetWeight,
  shouldRestoreCustomExercise,
  skipRemainingWarmups,
};
