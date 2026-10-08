import { findExerciseConfig } from './legacy/shared.js';
import { effectiveStoredExerciseWeight } from './legacy/cable-stack.js';
import { isBeltLoadExercise } from './legacy/belt-load.js';
import { baseExerciseName } from './exercise-aliases.js';

const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '')
  && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

export function volumeMetric(name, { bodyweightLb, exerciseConfigs = {} } = {}) {
  const config = { ...findExerciseConfig(name), ...exerciseConfigs[name] };
  const bodyweight = Number(bodyweightLb);
  const belt = isBeltLoadExercise(name) && bodyweight > 0 && Number.isFinite(bodyweight) && !config.assist;
  const repsOnly = !belt && (isBeltLoadExercise(name) || config.repsOnly || config.stages || config.assist
    || config.isBandsOnly || config.equipment === 'band' || config.equipment === 'bodyweight');
  return { unit: repsOnly ? 'reps' : 'lb·reps', bodyweight: belt ? bodyweight : null };
}

/** Logged working-set volume, with the same cable-load convention as the charts.
 * Stages/assistance use total reps rather than inventing a comparable load. */
export function exerciseVolume(session, name, options = {}) {
  const metric = volumeMetric(name, options);
  let value = 0, count = 0;
  for (const row of session?.sets || []) {
    const reps = Number(row.reps);
    if (row.exercise !== name || row.set_type !== 'working' || row.completed === false || row.userSkipped
      || !Number.isInteger(reps) || reps <= 0) continue;
    if (metric.unit === 'reps') { value += reps; count++; continue; }
    let weight = Number(row.weight_lb);
    if (metric.bodyweight) {
      // Legacy bodyweight rows are not belt loads. Never count their weight twice.
      try {
        const bands = typeof row.bands_json === 'string' ? JSON.parse(row.bands_json) : row.bands_json;
        if (bands != null && (!Array.isArray(bands) || bands.some(b => Number(b) !== 0))) continue;
      } catch { continue; }
      const added = row.load_type === 'belt' ? weight : 0;
      if (!Number.isFinite(added) || added < 0) continue;
      weight = metric.bodyweight + added;
    } else {
      if (!Number.isFinite(weight) || weight <= 0) continue;
      weight = effectiveStoredExerciseWeight(baseExerciseName(name), weight, session);
    }
    if (!(weight > 0) || !Number.isFinite(weight * reps)) continue;
    value += weight * reps;
    count++;
  }
  return count ? { value: Math.round(value * 100) / 100, unit: metric.unit, ...(metric.bodyweight ? { bodyweightLb: metric.bodyweight } : {}) } : null;
}

export function liveVolumeSession(exercises, date, id, startedAt) {
  return { id, date, started_at: startedAt ? new Date(startedAt).toISOString() : null,
    cable_weight_mode: 'per_stack', sets: exercises.flatMap(exercise => (exercise.sets || [])
      .filter(set => set.kind === 'work' && set.completed && !set.userSkipped)
      .map(set => ({ exercise: exercise.name, set_type: 'working', reps: set.reps,
        weight_lb: Number(set.weight) + (exercise.bandAddon ? (set.bands || []).reduce((sum, b) => sum + Number(b), 0) : 0),
        load_type: exercise.beltLoad ? 'belt' : null, bands_json: JSON.stringify(set.bands || []) }))) };
}

/** Replace the current autosave, retain distinct workouts on the same day, and
 * never include future sessions or count a duplicated history response twice. */
export function buildVolumeTrends(history = [], current, options = {}) {
  if (!validDate(current?.date)) return {};
  const names = options.exerciseNames || [...new Set((current.sets || []).map(row => row.exercise))];
  const seen = new Set();
  const sessions = history.filter(session => {
    if (session === current || (current.id && session.id === current.id) || !validDate(session.date)
      || session.date > current.date || (session.date === current.date && current.started_at && session.started_at > current.started_at)) return false;
    if (session.id && seen.has(session.id)) return false;
    if (session.id) seen.add(session.id);
    return true;
  }).concat(current).sort((a, b) => a.date.localeCompare(b.date)
    || String(a.started_at || '').localeCompare(String(b.started_at || '')));
  return Object.fromEntries(names.flatMap(name => {
    const points = sessions.flatMap(session => {
      const result = exerciseVolume(session, name, options);
      return result ? [{ date: session.date, ...result, isDeload: !!session.is_deload, isPartial: !!session.isPartial }] : [];
    });
    return points.length ? [[name, points]] : [];
  }));
}
