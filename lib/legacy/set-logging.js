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

function completedWorkCount(exercise) {
  return exercise.sets.filter((s) => s.kind !== "warmup" && s.completed).length;
}

// Members of a superset group that can still take sets, in template order.
function supersetGroup(exercises, groupKey) {
  return exercises
    .map((e, i) => ({ e, i }))
    .filter((g) => g.e.superset === groupKey && !g.e.skipped);
}

// Round-robin target inside a superset: the member with the fewest completed
// working sets goes next (ties resolve in template order), and within that
// member the first pending set is up. This keeps the A1→B1→A2→B2 alternation,
// survives reloads and uneven set counts (extra solo sets naturally run last),
// ignores skipped partners, and never points at a resolved set.
function nextSupersetTarget(exercises, groupKey) {
  const group = supersetGroup(exercises, groupKey).filter((g) => g.e.sets.some(isPendingSet));
  if (!group.length) return null;
  let best = null;
  for (const g of group) {
    const count = completedWorkCount(g.e);
    if (!best || count < best.count) best = { g, count };
  }
  return { eIdx: best.g.i, sIdx: best.g.e.sets.findIndex(isPendingSet) };
}

// The set to activate after (eIdx, sIdx) resolved, or null when nothing is
// pending anywhere. Order: finish the current exercise's warmups → superset
// round-robin → rest of the current exercise → following exercises → wrap
// around to earlier ones. Skipped exercises are never targeted: an active set
// inside a skipped exercise is invisible and reads as "no next set" in the UI.
function findNextActivationTarget(exercises, eIdx, sIdx) {
  const cur = exercises[eIdx];
  if (!cur) return null;
  const resolved = cur.sets[sIdx];
  if (resolved && resolved.kind === "warmup") {
    const nextWarm = cur.sets.findIndex((s, k) => k > sIdx && s.kind === "warmup" && isPendingSet(s));
    if (nextWarm !== -1) return { eIdx, sIdx: nextWarm };
  }
  if (cur.superset) {
    const target = nextSupersetTarget(exercises, cur.superset);
    if (target) return target;
  }
  if (!cur.skipped) {
    const sameExNext = cur.sets.findIndex((s, k) => k > sIdx && isPendingSet(s));
    if (sameExNext !== -1) return { eIdx, sIdx: sameExNext };
  }
  const n = exercises.length;
  const seenGroups = new Set(cur.superset ? [cur.superset] : []);
  for (let step = 1; step < n; step++) {
    const i = (eIdx + step) % n;
    const e = exercises[i];
    if (!e || e.skipped) continue;
    if (e.superset) {
      if (seenGroups.has(e.superset)) continue;
      seenGroups.add(e.superset);
      const target = nextSupersetTarget(exercises, e.superset);
      if (target) return target;
      continue;
    }
    const j = e.sets.findIndex(isPendingSet);
    if (j !== -1) return { eIdx: i, sIdx: j };
  }
  // Only the origin exercise still has something pending (an earlier hole).
  if (!cur.skipped) {
    const anyPending = cur.sets.findIndex(isPendingSet);
    if (anyPending !== -1) return { eIdx, sIdx: anyPending };
  }
  return null;
}

// One active set, everywhere: clears every stale flag and sets the target.
function applyActiveTarget(exercises, target) {
  return exercises.map((e, i) => {
    let changed = false;
    const sets = e.sets.map((s, j) => {
      const shouldBeActive = !!target && i === target.eIdx && j === target.sIdx;
      if (!!s.active === shouldBeActive) return s;
      changed = true;
      return { ...s, active: shouldBeActive };
    });
    return changed ? { ...e, sets } : e;
  });
}

function transitionActiveSetAfterLog(prev, eIdx, sIdx) {
  const cur = prev[eIdx];
  if (!cur?.sets[sIdx]) return prev;
  return applyActiveTarget(prev, findNextActivationTarget(prev, eIdx, sIdx));
}

function logSetAndTransition(exercises, eIdx, sIdx, patch) {
  return transitionActiveSetAfterLog(
    patchExerciseSet(exercises, eIdx, sIdx, patch),
    eIdx,
    sIdx,
  );
}

export {
  applyActiveTarget,
  findNextActivationTarget,
  isPendingSet,
  logSetAndTransition,
  nextSupersetTarget,
  patchExerciseSet,
  transitionActiveSetAfterLog,
};
