function trainingPoints(points) {
  return (points || []).filter(point => point && !point.isDeload);
}

function firstToLatestTrainingDelta(points, valueKey = "value") {
  const training = trainingPoints(points);
  if (training.length < 2) return null;
  return Number(training[training.length - 1][valueKey]) - Number(training[0][valueKey]);
}

function latestSessionDeltaPercent(points, valueKey = "value") {
  const all = (points || []).filter(Boolean);
  const latest = all[all.length - 1];
  if (!latest || latest.isDeload) return null;
  const prior = [...all.slice(0, -1)].reverse().find(point => !point.isDeload);
  if (!prior) return null;
  const previous = Number(prior[valueKey]);
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((Number(latest[valueKey]) - previous) / Math.abs(previous)) * 100);
}

export { trainingPoints, firstToLatestTrainingDelta, latestSessionDeltaPercent };
