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
  const lowerName = name.toLowerCase();
  const fallbackEquipment = lowerName.includes("barbell")
    ? "barbell"
    : lowerName.includes("band") ? "band" : "dumbbell";
  return {
    name,
    sets: official?.sets || 3,
    reps: official?.reps || "8-12",
    notes: official?.notes || "Added from library.",
    equipment: official?.equipment || fallbackEquipment,
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

function shouldRestoreCustomExercise(savedSets) {
  return Array.isArray(savedSets) && savedSets.length > 0;
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
