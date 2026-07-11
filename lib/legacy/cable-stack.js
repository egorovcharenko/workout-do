const DUAL_STACK_PATTERNS = [
  /\blat\s+pulldowns?\b/i,
  /\blow(?:\s+cable)?\s+rows?\b/i,
  /\bcable\s+low\s+rows?\b/i,
];
const CABLE_STACK_MIN = 10;
const CABLE_STACK_MAX = 85;
const CABLE_STACK_STEP = 5;

function roundCableWeight(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cableStackMultiplier(exerciseName) {
  const name = String(exerciseName || "").replace(/[-_]+/g, " ");
  return DUAL_STACK_PATTERNS.some((pattern) => pattern.test(name)) ? 2 : 1;
}

function isCableStackExercise(exerciseName, equipment) {
  const name = String(exerciseName || "");
  return String(equipment || "").toLowerCase() === "cable" || /\bcable\b/i.test(name) || cableStackMultiplier(name) === 2;
}

function cableStackWeight(totalWeight, multiplier = 1) {
  return roundCableWeight((Number(totalWeight) || 0) / Math.max(1, multiplier));
}

function cableTotalWeight(stackWeight, multiplier = 1) {
  return roundCableWeight((Number(stackWeight) || 0) * Math.max(1, multiplier));
}

function clampCableStackWeight(stackWeight) {
  const snapped = Math.round((Number(stackWeight) || 0) / CABLE_STACK_STEP) * CABLE_STACK_STEP;
  return Math.min(CABLE_STACK_MAX, Math.max(CABLE_STACK_MIN, snapped));
}

function effectiveExerciseWeight(exerciseName, recordedWeight) {
  return cableTotalWeight(recordedWeight, cableStackMultiplier(exerciseName));
}

export {
  CABLE_STACK_MAX,
  CABLE_STACK_MIN,
  CABLE_STACK_STEP,
  cableStackMultiplier,
  cableStackWeight,
  cableTotalWeight,
  clampCableStackWeight,
  effectiveExerciseWeight,
  isCableStackExercise,
};
