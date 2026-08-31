function parseSessionState(stateJSON) {
  if (!stateJSON) return null;
  if (typeof stateJSON === "object") return stateJSON;
  if (typeof stateJSON !== "string") return null;
  try {
    const parsed = JSON.parse(stateJSON);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// The embedded Firestore `sets` array only contains logged sets. state_json
// retains the whole live set map, so it is the reliable source for deciding
// whether a same-day session still has work left (including skipped warm-ups
// and exercises).
function storedSessionProgress(session) {
  const state = parseSessionState(session?.state_json);
  if (!state?.setsMap || typeof state.setsMap !== "object") return null;

  const skipped = new Set(Array.isArray(state.skipped) ? state.skipped : []);
  let sawAnySet = false;
  let total = 0;
  let completed = 0;

  Object.entries(state.setsMap).forEach(([exerciseName, sets]) => {
    if (!Array.isArray(sets)) return;
    if (sets.length) sawAnySet = true;
    if (skipped.has(exerciseName)) return;
    sets.forEach((set) => {
      total += 1;
      if (set?.completed || set?.userSkipped) completed += 1;
    });
  });

  return {
    completed,
    total,
    // A workout with every exercise skipped is still finishable. Requiring
    // at least one stored set avoids treating an empty initialized state as
    // a completed session.
    finished: sawAnySet && completed === total,
  };
}

function isStoredSessionFinished(session) {
  if (session?.finished_at) return true;
  return storedSessionProgress(session)?.finished === true;
}

export {
  isStoredSessionFinished,
  parseSessionState,
  storedSessionProgress,
};
