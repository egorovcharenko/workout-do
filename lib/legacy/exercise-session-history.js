function compareSets(a, b) {
  return (Number(a.set_number) || 0) - (Number(b.set_number) || 0)
    || String(a.logged_at || "").localeCompare(String(b.logged_at || ""));
}

/**
 * Build one row per prior session. Sets are normalized to their ordinal
 * position for this exercise so superset set numbers (1, 3, 5, for example)
 * still line up under Set 1, Set 2, Set 3.
 */
function buildExerciseSessionHistory(history, exerciseName, excludeSessionId = null) {
  const rows = (history || [])
    .filter((session) => !excludeSessionId || String(session?.id || "") !== String(excludeSessionId))
    .map((session) => {
      const sets = (session?.sets || [])
        .filter((set) => set.exercise === exerciseName && set.set_type === "working")
        .sort(compareSets);
      return { session, sets };
    })
    .filter((row) => row.sets.length > 0)
    .sort((a, b) =>
      String(b.session.date || "").localeCompare(String(a.session.date || ""))
      || String(b.session.created_at || "").localeCompare(String(a.session.created_at || ""))
      || String(b.session.id || "").localeCompare(String(a.session.id || ""))
    );

  return {
    rows,
    columnCount: rows.reduce((max, row) => Math.max(max, row.sets.length), 0),
  };
}

export { buildExerciseSessionHistory };

// Prefer the heaviest completed set, then the most reps at that same load.
function selectTopSet(sets, loadForSet = (set) => Number(set.weight_lb) || 0) {
  return (sets || []).filter(set => Number(set.reps) > 0).reduce((best, set) => {
    if (!best) return set;
    const load = loadForSet(set), bestLoad = loadForSet(best);
    return load > bestLoad || (load === bestLoad && Number(set.reps) > Number(best.reps)) ? set : best;
  }, null);
}

export { selectTopSet };
