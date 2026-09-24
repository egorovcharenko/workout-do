function selectScopedSaveTiming(saveScope, currentScope, captured, latest) {
  return saveScope === currentScope ? latest : captured;
}

function canApplyResolvedSessionId(saveScope, currentScope, currentSessionId, newId) {
  // Adopt the server's id whenever it differs from the one the save was sent
  // with and the save still belongs to the current workout+date scope. The
  // server mints a replacement doc when the sent id no longer exists or the
  // update was rejected as a stale-tab / cross-workout write; keeping the old
  // id would make every later autosave mint another duplicate. The scope check
  // still blocks ids that belong to a different workout or date.
  return !!newId && newId !== currentSessionId && saveScope === currentScope;
}

function sessionUpdateConflict(existing, payload) {
  if (existing?.date && payload?.date && existing.date !== payload.date) return "date";
  if (existing?.workout_name && existing.workout_name !== payload?.workout) return "workout";
  return null;
}

export { selectScopedSaveTiming, canApplyResolvedSessionId, sessionUpdateConflict };
