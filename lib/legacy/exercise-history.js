const PULL_UPS_EXERCISE = "Pull-Ups";
const LOW_ROW_EXERCISE = "Low Row";

function hasWorkingHistory(source, exerciseName) {
  return Object.keys(source || {}).some((key) => {
    const [name, kind] = key.split("|");
    return name === exerciseName && kind === "working";
  });
}

/**
 * Global hints are assembled one set-number at a time across every workout.
 * That is useful for most lifts, but it can splice an old Pull-Up set 3 onto a
 * newer 0/1/2 attempt. Pull-Ups have special set roles, so keep all four values
 * from the most recent matching workout whenever that history exists.
 */
function selectWorkingHistorySource(exerciseName, lastSessionMap, hintsMap) {
  if (exerciseName === PULL_UPS_EXERCISE && hasWorkingHistory(lastSessionMap, exerciseName)) {
    return lastSessionMap || {};
  }
  return hasWorkingHistory(hintsMap, exerciseName) ? (hintsMap || {}) : (lastSessionMap || {});
}

function workingHistoryBySetNumber(exerciseName, source) {
  const history = {};
  Object.keys(source || {}).forEach((key) => {
    const [name, kind, setNumberText] = key.split("|");
    if (name !== exerciseName || kind !== "working") return;
    const setNumber = parseInt(setNumberText, 10);
    if (Number.isFinite(setNumber)) history[setNumber] = source[key];
  });
  return history;
}

function previousWorkingSet(exerciseName, history, index, setNumber) {
  // UA/set 0, assisted sets 1-2, and the negative set 3 are different jobs.
  // A missing role must remain empty instead of borrowing another role's reps.
  if (exerciseName === PULL_UPS_EXERCISE) return history[setNumber] || null;

  const numbers = Object.keys(history || {}).map(Number).sort((a, b) => a - b);
  if (index < numbers.length) return history[numbers[index]];
  return numbers.length ? history[numbers[numbers.length - 1]] : null;
}

function mergeTemplateAndSavedSet(exerciseName, templateSet, savedSet) {
  if (!templateSet) return savedSet;
  if (!savedSet) return templateSet;
  const merged = {
    ...templateSet,
    ...savedSet,
    kind: templateSet.kind,
    setNumber: templateSet.setNumber,
    idx: templateSet.idx,
  };

  // A session can be opened before a first-ever hint exists, which persists an
  // empty preview in state_json. If a later reload discovers a bootstrap value,
  // let it fill only empty, untouched fields. Any positive weight or logged reps
  // chosen today still win.
  const untouched = !savedSet.completed && savedSet.reps == null && !savedSet.logged_at && !savedSet.userSkipped;
  if (untouched) {
    if ((savedSet.weight == null || savedSet.weight === 0) && templateSet.weight > 0) merged.weight = templateSet.weight;
    if ((savedSet.lastWeight == null || savedSet.lastWeight === 0) && templateSet.lastWeight > 0) merged.lastWeight = templateSet.lastWeight;
    if (savedSet.lastReps == null && templateSet.lastReps != null) merged.lastReps = templateSet.lastReps;
  }

  // state_json persists previews as well as completed results. Replace a stale
  // uncompleted Pull-Up preview with the freshly reconstructed coherent history
  // while retaining real reps from any set already logged today.
  if (exerciseName === PULL_UPS_EXERCISE && !savedSet.completed && savedSet.reps == null) {
    merged.lastReps = templateSet.lastReps ?? null;
    merged.lastGrip = templateSet.lastGrip ?? null;
  }
  return merged;
}

// Low Row used to include a warm-up. Drop that untouched preview when an
// in-progress session reloads against the new three-set prescription, while
// retaining any warm-up the user already performed or explicitly skipped.
function shouldKeepRemovedWarmup(exerciseName, savedSet) {
  if (exerciseName !== LOW_ROW_EXERCISE) return true;
  return !!(savedSet?.completed || savedSet?.reps != null || savedSet?.logged_at || savedSet?.userSkipped);
}

export {
  LOW_ROW_EXERCISE,
  PULL_UPS_EXERCISE,
  hasWorkingHistory,
  mergeTemplateAndSavedSet,
  previousWorkingSet,
  selectWorkingHistorySource,
  shouldKeepRemovedWarmup,
  workingHistoryBySetNumber,
};
