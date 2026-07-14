const DUAL_STACK_PATTERNS = [
  /\blat\s+pulldowns?\b/i,
  /\blow(?:\s+cable)?\s+rows?\b/i,
  /\bcable\s+low\s+rows?\b/i,
];
const CABLE_STACK_MIN = 10;
const CABLE_STACK_MAX = 85;
const CABLE_STACK_STEP = 5;
const CABLE_STACK_ADD_ON_WEIGHT = 1.25;
const CABLE_STACK_ADD_ON_COUNT = 2;
const CABLE_STACK_MAX_LOAD = CABLE_STACK_MAX + CABLE_STACK_ADD_ON_WEIGHT * CABLE_STACK_ADD_ON_COUNT;
// The cable selector began storing a per-stack pin value after the July 10
// deployment. Older rows stored the already-combined exercise load. Use the
// following day as the legacy fallback boundary because workouts earlier on
// July 10 predate that deployment. New writes carry an explicit mode below.
const CABLE_PER_STACK_STORAGE_START_DATE = "2026-07-11";

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
  const requested = Number(stackWeight) || 0;
  let closest = CABLE_STACK_MIN;
  let closestDistance = Math.abs(requested - closest);
  for (let pin = CABLE_STACK_MIN; pin <= CABLE_STACK_MAX; pin += CABLE_STACK_STEP) {
    for (let addOns = 0; addOns <= CABLE_STACK_ADD_ON_COUNT; addOns += 1) {
      const candidate = roundCableWeight(pin + addOns * CABLE_STACK_ADD_ON_WEIGHT);
      const distance = Math.abs(requested - candidate);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
  }
  return closest;
}

function cableStackWeightWithAddOns(pinWeight, addOnCount = 0) {
  const requestedPin = Number(pinWeight) || CABLE_STACK_MIN;
  const snappedPin = CABLE_STACK_MIN + Math.round((requestedPin - CABLE_STACK_MIN) / CABLE_STACK_STEP) * CABLE_STACK_STEP;
  const pin = Math.min(CABLE_STACK_MAX, Math.max(CABLE_STACK_MIN, snappedPin));
  const addOns = Math.min(CABLE_STACK_ADD_ON_COUNT, Math.max(0, Math.round(Number(addOnCount) || 0)));
  return roundCableWeight(pin + addOns * CABLE_STACK_ADD_ON_WEIGHT);
}

function cableStackSelection(stackWeight) {
  const weight = clampCableStackWeight(stackWeight);
  for (let pin = CABLE_STACK_MIN; pin <= CABLE_STACK_MAX; pin += CABLE_STACK_STEP) {
    for (let addOnCount = 0; addOnCount <= CABLE_STACK_ADD_ON_COUNT; addOnCount += 1) {
      if (cableStackWeightWithAddOns(pin, addOnCount) === weight) {
        return { pinWeight: pin, addOnCount, stackWeight: weight };
      }
    }
  }
  return { pinWeight: CABLE_STACK_MIN, addOnCount: 0, stackWeight: CABLE_STACK_MIN };
}

function effectiveExerciseWeight(exerciseName, recordedWeight) {
  return cableTotalWeight(recordedWeight, cableStackMultiplier(exerciseName));
}

function usesPerStackCableWeight(session) {
  if (session?.cable_weight_mode === "per_stack") return true;
  if (session?.cable_weight_mode === "total") return false;
  return String(session?.date || "") >= CABLE_PER_STACK_STORAGE_START_DATE;
}

/**
 * Convert a persisted set to the load used for history, volume and 1RM math.
 * Current UI values are always per-stack and use effectiveExerciseWeight;
 * persisted history needs its session's storage semantics as well.
 */
function effectiveStoredExerciseWeight(exerciseName, recordedWeight, session) {
  const multiplier = usesPerStackCableWeight(session) ? cableStackMultiplier(exerciseName) : 1;
  return cableTotalWeight(recordedWeight, multiplier);
}

/** Convert either storage generation back to the current selector's value. */
function storedExerciseInputWeight(exerciseName, recordedWeight, session) {
  const multiplier = cableStackMultiplier(exerciseName);
  return cableStackWeight(
    effectiveStoredExerciseWeight(exerciseName, recordedWeight, session),
    multiplier,
  );
}

export {
  CABLE_STACK_MAX,
  CABLE_STACK_MAX_LOAD,
  CABLE_STACK_MIN,
  CABLE_STACK_STEP,
  CABLE_STACK_ADD_ON_COUNT,
  CABLE_STACK_ADD_ON_WEIGHT,
  CABLE_PER_STACK_STORAGE_START_DATE,
  cableStackMultiplier,
  cableStackSelection,
  cableStackWeight,
  cableStackWeightWithAddOns,
  cableTotalWeight,
  clampCableStackWeight,
  effectiveExerciseWeight,
  effectiveStoredExerciseWeight,
  isCableStackExercise,
  storedExerciseInputWeight,
  usesPerStackCableWeight,
};
