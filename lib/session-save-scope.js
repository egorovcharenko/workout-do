function selectScopedSaveTiming(saveScope, currentScope, captured, latest) {
  return saveScope === currentScope ? latest : captured;
}

function canApplyResolvedSessionId(saveScope, currentScope, currentSessionId, newId) {
  return !currentSessionId && !!newId && saveScope === currentScope;
}

function sessionUpdateConflict(existing, payload) {
  if (existing?.date && payload?.date && existing.date !== payload.date) return "date";
  if (existing?.workout_name && existing.workout_name !== payload?.workout) return "workout";
  return null;
}

export { selectScopedSaveTiming, canApplyResolvedSessionId, sessionUpdateConflict };
