function trainingPoints(points) {
  return (points || []).filter(point => point && !point.isDeload);
}

function sparklineDomain(points, goal = null) {
  const valid = (points || []).filter(point => point && Number.isFinite(Number(point.value)));
  const training = trainingPoints(valid);
  const values = (training.length > 0 ? training : valid).map(point => Number(point.value));

  if (Number.isFinite(goal)) values.push(Number(goal));
  if (values.length === 0) return { min: 0, max: 1 };

  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const range = valueMax - valueMin;
  const midpoint = (valueMin + valueMax) / 2;
  const padding = range > 0
    ? Math.max(range * 0.18, Math.abs(midpoint) * 0.005)
    : Math.max(Math.abs(midpoint) * 0.025, 1);

  return { min: valueMin - padding, max: valueMax + padding };
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

export { trainingPoints, sparklineDomain, firstToLatestTrainingDelta, latestSessionDeltaPercent };
