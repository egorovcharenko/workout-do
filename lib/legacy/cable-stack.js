/**
 * Every cable lift runs on the Gym Monster now. It is one machine with two
 * arms, so a lift is worked either with BOTH SIDES at once — and the weight is
 * the total across both arms — or ONE SIDE at a time, where the weight is what
 * that single arm or leg carries. There are no stacks and no doubling: the
 * number on screen is the load.
 *
 * The machine tops out at 130 lb per side, so 260 lb with both arms pulling.
 * The 8 lb floor is the same either way — light accessories like wrist curls
 * and external rotations live down there.
 *
 * This replaced the per-stack model on Nov 18, 2026. Sets logged before that
 * date stored a per-stack pin value that had to be doubled for the lifts that
 * ran a handle on each stack; everything from that date stores the real load.
 * Both generations are read below, so history keeps the numbers it was logged
 * with.
 */

const CABLE_WEIGHT_MIN = 8;
const CABLE_SIDE_MAX = 130;
const CABLE_TOTAL_MAX = CABLE_SIDE_MAX * 2;
// The machine takes whole pounds.
const CABLE_WEIGHT_STEP = 1;
const CABLE_SIDES_START_DATE = "2026-11-18";

function roundCableWeight(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Lifts worked one arm or one leg at a time. The names that say so are matched
 * by pattern; the rest are listed because only the setup gives it away.
 */
const ONE_SIDE_PATTERNS = [
  /\bsingle[-\s]?arm\b/i,
  /\bsingle[-\s]?leg\b/i,
  /\bone[-\s]?arm\b/i,
  /\bone[-\s]?leg\b/i,
];
const ONE_SIDE_NAMES = new Set([
  "Bayesian Cable Curl", // single-arm, facing away from the machine
  "Cable External Rotations", // elbow pinned to the ribs, one arm at a time
  "Calf Raises", // single-leg since Nov 13, 2026
]);

/** 1 when the lift runs one side at a time, 2 when both arms pull. */
function cableSides(exerciseName) {
  const name = String(exerciseName || "").replace(/[-_]+/g, " ");
  if (ONE_SIDE_NAMES.has(String(exerciseName || ""))) return 1;
  return ONE_SIDE_PATTERNS.some((pattern) => pattern.test(name)) ? 1 : 2;
}

function usesBothSides(exerciseName) {
  return cableSides(exerciseName) === 2;
}

/** What the selector may offer for this lift, in the units it stores. */
function cableWeightBounds(exerciseName) {
  return {
    min: CABLE_WEIGHT_MIN,
    max: usesBothSides(exerciseName) ? CABLE_TOTAL_MAX : CABLE_SIDE_MAX,
  };
}

/** The load one arm carries at this weight — the same number for a one-side lift. */
function cableWeightPerSide(weight, exerciseName) {
  return roundCableWeight((Number(weight) || 0) / cableSides(exerciseName));
}

function clampCableWeight(weight, exerciseName) {
  const { min, max } = cableWeightBounds(exerciseName);
  const requested = Math.round(Number(weight) || 0);
  return Math.min(max, Math.max(min, requested));
}

/**
 * Smallest weight the machine can make that is at least `minimum`. Progression
 * offers must land on one of these, or the selector snaps them back down.
 */
function nextCableWeightAtLeast(minimum, exerciseName) {
  const { min, max } = cableWeightBounds(exerciseName);
  const target = Math.ceil((Number(minimum) || 0) - 0.001);
  return Math.min(max, Math.max(min, target));
}

// Cable lifts whose names say neither "cable" nor anything else obvious.
const CABLE_NAME_PATTERNS = [
  /\bcalf\s+raises?\b/i,
  /\blat\s+pulldowns?\b/i,
  /\blow(?:\s+cable)?\s+rows?\b/i,
];

function isCableExercise(exerciseName, equipment) {
  const name = String(exerciseName || "");
  if (String(equipment || "").toLowerCase() === "cable") return true;
  if (/\bcable\b/i.test(name)) return true;
  return CABLE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

// ─── history written under the old per-stack model ───
// Nothing below describes how the app works today. It exists so sets logged
// before Nov 18, 2026 keep the load they were performed at.

const LEGACY_DUAL_STACK_PATTERNS = [
  /\blat\s+pulldowns?\b/i,
  /\blow(?:\s+cable)?\s+rows?\b/i,
  /\bcable\s+low\s+rows?\b/i,
];
const LEGACY_DUAL_STACK_NAMES = new Set(["Cable Chest Fly"]);
/** Lifts that left the two-stack setup before the model itself changed. */
const LEGACY_SINGLE_STACK_SINCE = {
  "Calf Raises": "2026-11-13",
  "Cable Chest Press": "2026-11-15",
};
// The cable selector began storing a per-stack pin value after the July 10
// deployment. Older rows stored the already-combined exercise load.
const CABLE_PER_STACK_STORAGE_START_DATE = "2026-07-11";

function legacyStackMultiplier(exerciseName) {
  if (LEGACY_DUAL_STACK_NAMES.has(exerciseName)) return 2;
  const name = String(exerciseName || "").replace(/[-_]+/g, " ");
  return LEGACY_DUAL_STACK_PATTERNS.some((pattern) => pattern.test(name)) ? 2 : 1;
}

function usesPerStackCableWeight(session) {
  if (session?.cable_weight_mode === "per_stack") return true;
  if (session?.cable_weight_mode === "total") return false;
  return String(session?.date || "") >= CABLE_PER_STACK_STORAGE_START_DATE;
}

/** True once a session's weights are real loads rather than per-stack pins. */
function usesSideCableWeight(session) {
  if (session?.cable_weight_mode === "sides") return true;
  return String(session?.date || "") >= CABLE_SIDES_START_DATE;
}

/** How many stacks a set ran on, by the setup in place the day it was logged. */
function legacyStoredStackMultiplier(exerciseName, session) {
  const movedOn = LEGACY_SINGLE_STACK_SINCE[exerciseName];
  if (movedOn && String(session?.date || "") < movedOn) return 2;
  return legacyStackMultiplier(exerciseName);
}

/** The factor between a stored weight and the value the selector shows for it. */
function storedCableMultiplier(exerciseName, session) {
  return usesSideCableWeight(session) ? 1 : legacyStoredStackMultiplier(exerciseName, session);
}

// ─── loads ───

/** A weight entered today is already the real load. */
function effectiveExerciseWeight(exerciseName, recordedWeight) {
  return roundCableWeight(recordedWeight);
}

/**
 * Convert a persisted set to the load used for history, volume and 1RM math,
 * under the storage model its own session was written with.
 */
function effectiveStoredExerciseWeight(exerciseName, recordedWeight, session) {
  const multiplier = usesSideCableWeight(session) || !usesPerStackCableWeight(session)
    ? 1
    : legacyStoredStackMultiplier(exerciseName, session);
  return roundCableWeight((Number(recordedWeight) || 0) * multiplier);
}

/**
 * Convert either storage generation to the value the selector would show for
 * it today — which is the load itself, whatever model the row was written
 * under. A per-stack row of 65 on a two-stack lift comes back as the 130 lb it
 * actually was, so hints, last-weight seeds and progression offers all speak
 * in the same units as the sets being logged now.
 */
function storedExerciseInputWeight(exerciseName, recordedWeight, session) {
  return effectiveStoredExerciseWeight(exerciseName, recordedWeight, session);
}

export {
  CABLE_WEIGHT_MIN,
  CABLE_SIDE_MAX,
  CABLE_TOTAL_MAX,
  CABLE_WEIGHT_STEP,
  CABLE_SIDES_START_DATE,
  CABLE_PER_STACK_STORAGE_START_DATE,
  cableSides,
  usesBothSides,
  cableWeightBounds,
  cableWeightPerSide,
  clampCableWeight,
  nextCableWeightAtLeast,
  isCableExercise,
  effectiveExerciseWeight,
  effectiveStoredExerciseWeight,
  storedExerciseInputWeight,
  storedCableMultiplier,
  usesPerStackCableWeight,
  usesSideCableWeight,
};
