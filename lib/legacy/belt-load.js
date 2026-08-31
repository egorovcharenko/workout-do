const BELT_LOAD_EXERCISES = new Set(["Pull-Ups", "Dips"]);
const LAST_BELT_LOAD_SET_NUMBER = "last-belt-load";

function isBeltLoadExercise(exerciseName) {
  return BELT_LOAD_EXERCISES.has(exerciseName);
}

function isStoredBeltLoad(set) {
  return set?.load_type === "belt";
}

function storedBeltLoad(set) {
  return isStoredBeltLoad(set) ? Math.max(0, Number(set?.weight_lb) || 0) : 0;
}

function currentBeltLoad(set) {
  return Math.max(0, Number(set?.weight) || 0);
}

function lastBeltLoadHistoryKey(exerciseName) {
  return `${exerciseName}|working|${LAST_BELT_LOAD_SET_NUMBER}`;
}

function lastBeltLoadFromHistory(exerciseName, history) {
  const row = history?.[lastBeltLoadHistoryKey(exerciseName)];
  return row ? storedBeltLoad(row) : null;
}

export {
  currentBeltLoad,
  isBeltLoadExercise,
  isStoredBeltLoad,
  lastBeltLoadFromHistory,
  lastBeltLoadHistoryKey,
  storedBeltLoad,
};
