const BENCH_EXERCISE = "Barbell Bench Press";
const BENCH_GOAL_WEIGHT = 180;
const BENCH_TEST_UNLOCK_WEIGHT = 170;
const BENCH_TEST_UNLOCK_REPS = 3;
const BENCH_WEIGHT_STEP = 5;

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

function formatRange(range) {
  return range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}`;
}

/**
 * Turns the written bench rebuild rules into the next workout prescription.
 * The supplied sets already contain the latest non-deload attempt in lastWeight
 * and lastReps; those values remain untouched so the UI can still show/restore
 * the previous attempt.
 */
function applyBenchProgression(sets, { hasHistory = true } = {}) {
  const work = (sets || []).filter((set) => set.kind === "work");
  if (work.length < 2) return { sets, progression: null };

  const top = work[0];
  const leadBackoff = work[1];
  const previousTopWeight = positiveNumber(top.lastWeight, positiveNumber(top.weight, 155));
  const previousTopReps = positiveNumber(top.lastReps, 4);
  const previousBackoffWeight = positiveNumber(leadBackoff.lastWeight, positiveNumber(leadBackoff.weight, 140));
  const previousBackoffReps = positiveNumber(leadBackoff.lastReps, 8);

  let status = hasHistory ? "building" : "baseline";
  let topWeight = previousTopWeight;
  let topRange = [3, 5];
  let topAdvanced = false;

  if (hasHistory && previousTopWeight >= BENCH_GOAL_WEIGHT && previousTopReps >= 1) {
    status = "achieved";
    topWeight = BENCH_GOAL_WEIGHT;
    topRange = [1, 1];
  } else if (hasHistory && previousTopWeight >= BENCH_TEST_UNLOCK_WEIGHT && previousTopReps >= BENCH_TEST_UNLOCK_REPS) {
    status = "test";
    topWeight = BENCH_GOAL_WEIGHT;
    topRange = [1, 1];
    topAdvanced = previousTopWeight !== topWeight;
  } else if (hasHistory && previousTopReps >= 5) {
    topWeight = Math.min(previousTopWeight + BENCH_WEIGHT_STEP, BENCH_TEST_UNLOCK_WEIGHT);
    topAdvanced = topWeight > previousTopWeight;
  }

  const backoffAdvanced = hasHistory && previousBackoffReps >= 10;
  const backoffWeight = previousBackoffWeight + (backoffAdvanced ? BENCH_WEIGHT_STEP : 0);
  const backoffRange = [8, 10];

  let headline = "Start the 180 lb rebuild";
  let detail = `Top set ${topWeight} lb × ${formatRange(topRange)}; back-offs ${backoffWeight} lb × ${formatRange(backoffRange)}.`;
  if (status === "building") {
    headline = topAdvanced || backoffAdvanced ? "Next weights earned" : "Build reps before adding weight";
    detail = `Top set ${topWeight} lb × ${formatRange(topRange)}; back-offs ${backoffWeight} lb × ${formatRange(backoffRange)}. `
      + "Top set: add 5 lb at 5 reps. Back-offs: add 5 lb when the first set reaches 10.";
  } else if (status === "test") {
    headline = "180 lb single unlocked";
    detail = `You completed at least ${BENCH_TEST_UNLOCK_WEIGHT} × ${BENCH_TEST_UNLOCK_REPS}. Attempt ${BENCH_GOAL_WEIGHT} × 1 with safeties set and no grinding.`;
  } else if (status === "achieved") {
    headline = "180 lb single achieved";
    detail = `${BENCH_GOAL_WEIGHT} × 1 is in your non-deload history. The goal is complete; this session keeps the successful single available.`;
  }

  let workIndex = 0;
  const progressedSets = sets.map((set) => {
    if (set.kind !== "work") return set;
    const isTop = workIndex === 0;
    workIndex += 1;
    const targetRepRange = isTop ? topRange : backoffRange;
    return {
      ...set,
      weight: isTop ? topWeight : backoffWeight,
      targetRepRange,
      progressionRole: isTop ? "top" : "backoff",
    };
  });

  return {
    sets: progressedSets,
    progression: {
      exercise: BENCH_EXERCISE,
      status,
      headline,
      detail,
      goalWeight: BENCH_GOAL_WEIGHT,
      unlock: { weight: BENCH_TEST_UNLOCK_WEIGHT, reps: BENCH_TEST_UNLOCK_REPS },
      top: {
        previousWeight: hasHistory ? previousTopWeight : null,
        previousReps: hasHistory ? previousTopReps : null,
        weight: topWeight,
        repRange: topRange,
        advanced: topAdvanced,
      },
      backoff: {
        previousWeight: hasHistory ? previousBackoffWeight : null,
        previousReps: hasHistory ? previousBackoffReps : null,
        weight: backoffWeight,
        repRange: backoffRange,
        advanced: backoffAdvanced,
      },
    },
  };
}

export {
  BENCH_EXERCISE,
  BENCH_GOAL_WEIGHT,
  BENCH_TEST_UNLOCK_REPS,
  BENCH_TEST_UNLOCK_WEIGHT,
  applyBenchProgression,
};
