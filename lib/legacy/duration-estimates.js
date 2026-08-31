import { estimateExerciseDuration, getSetupTime } from "./shared.js";

const DEFAULT_FIRST_SET_SEC = 120;
const MIN_INTERVAL_SEC = 15;
const MAX_INTERVAL_SEC = 10 * 60;
const MAX_SAMPLES = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function exerciseSetCount(exercise) {
  if (!exercise || exercise.skipped) return 0;
  if (Array.isArray(exercise.sets)) return exercise.sets.length;
  const warmups = exercise.noWarmup ? 0 : (exercise.warmups || 1);
  return warmups + (exercise.sets || 3);
}

function sessionExerciseDurations(session) {
  const sorted = (session?.sets || [])
    .filter((set) => set.logged_at)
    .map((set) => ({ ...set, loggedMs: Date.parse(set.logged_at) }))
    .filter((set) => Number.isFinite(set.loggedMs))
    .sort((a, b) => a.loggedMs - b.loggedMs);
  const byExercise = {};
  const startedMs = session?.started_at ? Date.parse(session.started_at) : null;

  sorted.forEach((set, index) => {
    const previousMs = index === 0
      ? Number.isFinite(startedMs) && startedMs < set.loggedMs && set.loggedMs - startedMs < 2 * 60 * 60 * 1000
        ? startedMs
        : set.loggedMs - DEFAULT_FIRST_SET_SEC * 1000
      : sorted[index - 1].loggedMs;
    const rawSec = Math.round((set.loggedMs - previousMs) / 1000);
    const durationSec = clamp(rawSec, MIN_INTERVAL_SEC, MAX_INTERVAL_SEC);
    const entry = byExercise[set.exercise] || { durationSec: 0, setCount: 0 };
    entry.durationSec += durationSec;
    entry.setCount += 1;
    byExercise[set.exercise] = entry;
  });

  return byExercise;
}

function buildExerciseDurationHistory(history, { excludeSessionId = null } = {}) {
  const byExercise = {};
  (history || []).forEach((session) => {
    if (!session || session.id === excludeSessionId || session.is_deload) return;
    const durations = sessionExerciseDurations(session);
    Object.entries(durations).forEach(([exerciseName, sample]) => {
      if (sample.setCount < 1 || sample.durationSec < MIN_INTERVAL_SEC) return;
      const samples = byExercise[exerciseName] || [];
      if (samples.length >= MAX_SAMPLES) return;
      samples.push({
        ...sample,
        date: session.date || null,
        sessionId: session.id || null,
      });
      byExercise[exerciseName] = samples;
    });
  });
  return byExercise;
}

function historicalProjection(exercise, samples) {
  const currentSetCount = exerciseSetCount(exercise);
  if (!currentSetCount || !samples?.length) return null;
  const programmedSetup = getSetupTime(exercise.name, exercise.equipment);
  const projected = samples.slice(0, MAX_SAMPLES).map((sample, index) => {
    const sampleSetup = Math.min(programmedSetup, sample.durationSec * 0.4);
    const variablePerSet = Math.max(
      MIN_INTERVAL_SEC,
      (sample.durationSec - sampleSetup) / Math.max(1, sample.setCount),
    );
    const durationSec = sampleSetup + variablePerSet * currentSetCount;
    const recencyWeight = 0.78 ** index;
    const setSimilarity = 1 / (1 + Math.abs(sample.setCount - currentSetCount) / currentSetCount);
    return { durationSec, weight: recencyWeight * setSimilarity };
  });

  const ordered = projected.map((sample) => sample.durationSec).sort((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)];
  const filtered = projected.length >= 3
    ? projected.filter((sample) => sample.durationSec >= median * 0.55 && sample.durationSec <= median * 1.8)
    : projected;
  const usable = filtered.length >= 2 ? filtered : projected;
  const totalWeight = usable.reduce((sum, sample) => sum + sample.weight, 0);
  return usable.reduce((sum, sample) => sum + sample.durationSec * sample.weight, 0) / totalWeight;
}

function estimateExerciseDurationMeta(exercise, samples = [], actualSec = 0) {
  const plannedSec = estimateExerciseDuration(exercise);
  const setCount = exerciseSetCount(exercise);
  const completedSets = Array.isArray(exercise?.sets)
    ? exercise.sets.filter((set) => set.completed).length
    : 0;
  const complete = setCount > 0 && completedSets >= setCount;
  const historicalSec = historicalProjection(exercise, samples);
  const sampleCount = Math.min(samples.length, MAX_SAMPLES);
  const confidence = historicalSec == null ? 0 : Math.min(0.8, 0.25 + sampleCount * 0.15);
  let estimatedSec = historicalSec == null
    ? plannedSec
    : plannedSec * (1 - confidence) + historicalSec * confidence;
  let source = historicalSec == null ? "plan" : "history";

  if (plannedSec > 0) estimatedSec = clamp(estimatedSec, plannedSec * 0.55, plannedSec * 2);

  const safeActualSec = Math.max(0, Math.round(actualSec || 0));
  if (complete && safeActualSec > 0) {
    estimatedSec = safeActualSec;
    source = "actual";
  } else if (setCount > 0 && safeActualSec > 0) {
    const hasActiveSet = Array.isArray(exercise?.sets) && exercise.sets.some((set) => set.active && !set.completed);
    const effectiveProgress = clamp((completedSets + (hasActiveSet ? 0.25 : 0)) / setCount, 0.08, 0.95);
    const liveProjection = safeActualSec / effectiveProgress;
    const liveWeight = Math.min(0.65, 0.12 + (completedSets / setCount) * 0.7);
    estimatedSec = estimatedSec * (1 - liveWeight) + liveProjection * liveWeight;
    const incompleteSets = Math.max(0, setCount - completedSets);
    estimatedSec = Math.max(estimatedSec, safeActualSec + incompleteSets * MIN_INTERVAL_SEC);
    source = "live";
  }

  return {
    plannedSec: Math.max(0, Math.round(plannedSec)),
    estimatedSec: source === "actual"
      ? safeActualSec
      : Math.max(0, Math.round(estimatedSec / 15) * 15),
    actualSec: safeActualSec,
    sampleCount,
    source,
    complete,
  };
}

function addLiveExerciseTime(byExercise, lastLoggedMs, startedAtMs, activeExerciseIdx, nowMs) {
  const next = { ...(byExercise || {}) };
  const liveStartMs = lastLoggedMs || startedAtMs;
  if (activeExerciseIdx != null && nowMs && liveStartMs && nowMs > liveStartMs && nowMs - liveStartMs < 2 * 60 * 60 * 1000) {
    next[activeExerciseIdx] = (next[activeExerciseIdx] || 0) + Math.round((nowMs - liveStartMs) / 1000);
  }
  return next;
}

function currentSessionExerciseTimes(exercises, startedAtMs, activeExerciseIdx = null, nowMs = null) {
  const entries = [];
  (exercises || []).forEach((exercise, exerciseIdx) => (exercise.sets || []).forEach((set) => {
    // Reopening a logged set for correction makes it temporarily incomplete.
    // Its original timestamp still represents real work and must keep counting.
    if (!set.logged_at) return;
    const loggedMs = Date.parse(set.logged_at);
    if (Number.isFinite(loggedMs)) entries.push({ exerciseIdx, key: set.logged_at, loggedMs });
  }));
  entries.sort((a, b) => a.loggedMs - b.loggedMs);

  const bySet = {};
  const byExercise = {};
  entries.forEach((entry, index) => {
    const previousMs = index === 0
      ? startedAtMs && startedAtMs < entry.loggedMs && entry.loggedMs - startedAtMs < 2 * 60 * 60 * 1000
        ? startedAtMs
        : entry.loggedMs - DEFAULT_FIRST_SET_SEC * 1000
      : entries[index - 1].loggedMs;
    const durationSec = Math.max(0, Math.round((entry.loggedMs - previousMs) / 1000));
    bySet[entry.key] = durationSec;
    byExercise[entry.exerciseIdx] = (byExercise[entry.exerciseIdx] || 0) + durationSec;
  });

  const lastLoggedMs = entries.length ? entries[entries.length - 1].loggedMs : null;
  return {
    bySet,
    byExercise: addLiveExerciseTime(byExercise, lastLoggedMs, startedAtMs, activeExerciseIdx, nowMs),
  };
}

function loggedAtForSetUpdate(set, nowIso) {
  return set?.logged_at || nowIso;
}

export {
  addLiveExerciseTime,
  buildExerciseDurationHistory,
  currentSessionExerciseTimes,
  estimateExerciseDurationMeta,
  exerciseSetCount,
  loggedAtForSetUpdate,
  sessionExerciseDurations,
};
