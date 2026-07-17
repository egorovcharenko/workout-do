const BELT_LOAD_EXERCISES = new Set(["Pull-Ups", "Dips"]);

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

export { currentBeltLoad, isBeltLoadExercise, isStoredBeltLoad, storedBeltLoad };
