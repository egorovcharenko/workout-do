const untouched = set => !set.completed && !set.userSkipped && set.reps == null && !set.logged_at;

// Program-defined following sets share the source load until the user chooses
// another weight. Persist the choice with the set so reopening cannot undo it.
export function withFollowupLoads(exercises, workout) {
  return exercises.map(exercise => {
    const policy = workout?.exercises?.find(config => config.name === exercise.name)?.followupLoad;
    if (!policy || exercise.deload || exercise.skipped) return exercise;
    const source = exercise.sets.find(set => set.kind === 'work' && set.setNumber === policy.source);
    if (!source || source.userSkipped || source.planTargetReps != null || !(source.weight > 0)) return exercise;
    return { ...exercise, sets: exercise.sets.map(set => {
      if (set.kind !== 'work' || !policy.sets.includes(set.setNumber) || !untouched(set) || set.planTargetReps != null) return set;
      const manual = set.followupLoad?.manual ?? (set.lastWeight != null && set.weight !== set.lastWeight);
      return { ...set, targetRepRange: policy.range,
        weight: manual ? set.weight : source.weight,
        barPlates: manual || set.weight === source.weight ? set.barPlates : undefined,
        followupLoad: { manual, source: policy.source } };
    }) };
  });
}

export function followupWeightPatch(set, weight) {
  return { weight, barPlates: undefined,
    ...(set.followupLoad ? { followupLoad: { ...set.followupLoad, manual: true } } : {}) };
}
