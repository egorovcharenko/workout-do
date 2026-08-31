const SQUAT_EXERCISE = "Barbell Back Squat";
const SQUAT_WEIGHT_STEP = 5;
const SQUAT_BACKOFF_RATIO = 0.9;
const SQUAT_TOP_RANGE = [5, 8];
const SQUAT_BACKOFF_RANGE = [8, 10];

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const roundToFive = (weight) => Math.max(45, Math.round(weight / 5) * 5);
const sameWeight = (a, b) => Math.abs(a - b) < 0.01;

function formatRange(range) {
  return range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}`;
}

/**
 * Prescribes one squat top set plus two lighter back-off sets.
 *
 * Existing straight-set history is migrated once by recognizing equal working
 * weights and anchoring the back-offs at roughly 90% of the top set. Subsequent
 * sessions progress the two tracks independently: the top set earns 5 lb at
 * eight reps, and the back-offs earn 5 lb only after both reach ten reps.
 */
function applySquatProgression(sets, { hasHistory = true } = {}) {
  const work = (sets || []).filter((set) => set.kind === "work");
  if (work.length < 3) return { sets, progression: null };

  const top = work[0];
  const backoffs = work.slice(1, 3);
  const previousTopWeight = positiveNumber(top.lastWeight, positiveNumber(top.weight, 125));
  const previousTopReps = positiveNumber(top.lastReps, 5);
  const historicalBackoffWeights = backoffs.map((set) => positiveNumber(set.lastWeight, previousTopWeight));
  const historicalBackoffReps = backoffs.map((set) => positiveNumber(set.lastReps, 8));
  const legacyStraightSets = hasHistory && historicalBackoffWeights.every((weight) => sameWeight(weight, previousTopWeight));

  const topAdvanced = hasHistory && previousTopReps >= SQUAT_TOP_RANGE[1];
  const topWeight = previousTopWeight + (topAdvanced ? SQUAT_WEIGHT_STEP : 0);

  const migratedBackoffWeight = roundToFive(previousTopWeight * SQUAT_BACKOFF_RATIO);
  const previousBackoffWeight = legacyStraightSets
    ? migratedBackoffWeight
    : positiveNumber(historicalBackoffWeights[0], migratedBackoffWeight);
  const matchedBackoffLoad = historicalBackoffWeights.every((weight) => sameWeight(weight, previousBackoffWeight));
  const backoffAdvanced = hasHistory
    && !legacyStraightSets
    && matchedBackoffLoad
    && historicalBackoffReps.every((reps) => reps >= SQUAT_BACKOFF_RANGE[1]);
  const backoffWeight = previousBackoffWeight + (backoffAdvanced ? SQUAT_WEIGHT_STEP : 0);

  let status = hasHistory ? "building" : "baseline";
  let headline = "Establish the top-set baseline";
  let detail = `Top set ${topWeight} lb × ${formatRange(SQUAT_TOP_RANGE)}; back-offs ${backoffWeight} lb × ${formatRange(SQUAT_BACKOFF_RANGE)}.`;

  if (legacyStraightSets) {
    status = "transition";
    headline = "Switch to a top set + back-offs";
    detail = `Keep the top set at ${topWeight} lb, then use ${backoffWeight} lb for two higher-quality back-offs. `
      + "This replaces the fatiguing straight sets while keeping three work sets.";
  } else if (hasHistory) {
    headline = topAdvanced || backoffAdvanced ? "Next weights earned" : "Build reps before adding weight";
    detail = `Top set ${topWeight} lb × ${formatRange(SQUAT_TOP_RANGE)}; back-offs ${backoffWeight} lb × ${formatRange(SQUAT_BACKOFF_RANGE)}. `
      + "Top: add 5 lb at 8 reps. Back-offs: add 5 lb when both sets reach 10.";
  }

  let workIndex = 0;
  const progressedSets = sets.map((set) => {
    if (set.kind !== "work") return set;
    const isTop = workIndex === 0;
    workIndex += 1;
    return {
      ...set,
      weight: isTop ? topWeight : backoffWeight,
      targetRepRange: isTop ? SQUAT_TOP_RANGE : SQUAT_BACKOFF_RANGE,
      progressionRole: isTop ? "top" : "backoff",
    };
  });

  return {
    sets: progressedSets,
    progression: {
      exercise: SQUAT_EXERCISE,
      label: "Squat progression · top + 2 back-offs",
      targetLabel: topAdvanced ? "NEW TOP" : "NEXT TOP",
      status,
      headline,
      detail,
      top: {
        previousWeight: hasHistory ? previousTopWeight : null,
        previousReps: hasHistory ? previousTopReps : null,
        weight: topWeight,
        repRange: SQUAT_TOP_RANGE,
        advanced: topAdvanced,
      },
      backoff: {
        previousWeight: hasHistory && !legacyStraightSets ? previousBackoffWeight : null,
        previousReps: hasHistory && !legacyStraightSets ? historicalBackoffReps : null,
        weight: backoffWeight,
        repRange: SQUAT_BACKOFF_RANGE,
        advanced: backoffAdvanced,
        migrated: legacyStraightSets,
      },
    },
  };
}

export {
  SQUAT_BACKOFF_RANGE,
  SQUAT_EXERCISE,
  SQUAT_TOP_RANGE,
  SQUAT_WEIGHT_STEP,
  applySquatProgression,
};
