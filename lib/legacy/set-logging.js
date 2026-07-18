function patchExerciseSet(exercises, eIdx, sIdx, patch) {
  if (!exercises[eIdx]?.sets[sIdx]) return exercises;
  return exercises.map((exercise, exerciseIndex) => exerciseIndex !== eIdx ? exercise : ({
    ...exercise,
    sets: exercise.sets.map((set, setIndex) => setIndex !== sIdx ? set : ({ ...set, ...patch })),
  }));
}

function isPendingSet(set) {
  return !set.completed && !set.userSkipped;
}

function transitionActiveSetAfterLog(prev, eIdx, sIdx) {
  const cur = prev[eIdx];
  if (!cur?.sets[sIdx]) return prev;
  if (cur.superset) {
    const partnerIdx = prev.findIndex((e2, j) => j !== eIdx && e2.superset === cur.superset);
    const partnerNext = partnerIdx !== -1 ? prev[partnerIdx].sets.findIndex(isPendingSet) : -1;
    if (partnerNext !== -1) {
      return prev.map((e, i) => i === eIdx ? { ...e, sets: e.sets.map((s, j) => j === sIdx ? { ...s, active: false } : s) } : i === partnerIdx ? { ...e, sets: e.sets.map((s, j) => j === partnerNext ? { ...s, active: true } : s) } : e);
    }
  }
  const sameExNext = cur.sets.findIndex((s, k) => k > sIdx && isPendingSet(s));
  if (sameExNext !== -1) {
    return prev.map((e, i) => i !== eIdx ? e : ({ ...e, sets: e.sets.map((s, j) => j === sIdx ? { ...s, active: false } : j === sameExNext ? { ...s, active: true } : s) }));
  }
  const nextExIdx = prev.findIndex((e, k) => k > eIdx && e.sets.some(isPendingSet));
  return prev.map((e, i) => {
    if (i === eIdx) return { ...e, sets: e.sets.map((s, j) => j === sIdx ? { ...s, active: false } : s) };
    if (i === nextExIdx) {
      const firstUndone = e.sets.findIndex(isPendingSet);
      return firstUndone === -1 ? e : { ...e, sets: e.sets.map((s, j) => j === firstUndone ? { ...s, active: true } : s) };
    }
    return e;
  });
}

function logSetAndTransition(exercises, eIdx, sIdx, patch) {
  return transitionActiveSetAfterLog(
    patchExerciseSet(exercises, eIdx, sIdx, patch),
    eIdx,
    sIdx,
  );
}

export { logSetAndTransition, patchExerciseSet, transitionActiveSetAfterLog };
