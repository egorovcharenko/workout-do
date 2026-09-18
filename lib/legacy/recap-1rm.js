import { findExerciseConfig } from './shared.js';
import { calcStoredSet1RM, isAssistExercise, isRepsOnlyExercise } from './standards.js';

function supports1rm(name, flags = {}) {
  const config = { ...findExerciseConfig(name), ...flags };
  return !config.repsOnly && !config.assist && !config.stages && !config.isBandsOnly
    && config.equipment !== 'band' && !isRepsOnlyExercise(name) && !isAssistExercise(name);
}

export function recapTrendSession(exercises, date, id, startedAt) {
  return { id, date, started_at: startedAt ? new Date(startedAt).toISOString() : null,
    cable_weight_mode: 'per_stack', sets: exercises.flatMap(exercise => {
      if (!supports1rm(exercise.name, exercise)) return [];
      return exercise.sets.filter(set => set.kind === 'work' && set.completed && !set.userSkipped)
        .map(set => ({ exercise: exercise.name, set_type: 'working', reps: set.reps,
          weight_lb: Number(set.weight) + (exercise.bandAddon ? (set.bands || []).reduce((sum, b) => sum + Number(b), 0) : 0),
          grip: set.grip }));
    }) };
}

function best1rm(session, name) {
  let best = null;
  for (const row of session.sets || []) {
    const reps = Number(row.reps), weight = Number(row.weight_lb);
    if (row.exercise !== name || row.set_type !== 'working' || row.userSkipped
      || row.completed === false || !Number.isInteger(reps) || reps <= 0 || !(weight > 0) || !Number.isFinite(weight)) continue;
    const value = calcStoredSet1RM(name, weight, reps, row.bands_json, row.grip, session, row.load_type);
    if (Number.isFinite(value) && value > 0) best = Math.max(best || 0, value);
  }
  return best == null ? null : Math.round(best * 10) / 10;
}

/** One point per workout, including the current result exactly once. The live
 * result replaces any earlier autosaved copy, and future workouts stay out. */
export function buildRecap1rmTrends(history = [], current) {
  if (!current?.date) return {};
  const dateValid = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date));
  if (!dateValid(current.date)) return {};
  const seen = new Set();
  const prior = history.filter(session => {
    if (session === current || (current.id && session.id === current.id)
      || !dateValid(session.date) || session.date > current.date) return false;
    if (session.date === current.date && current.started_at && session.started_at
      && session.started_at >= current.started_at) return false;
    if (session.id && seen.has(session.id)) return false;
    if (session.id) seen.add(session.id);
    return true;
  }).slice().sort((a, b) => a.date.localeCompare(b.date)
    || String(a.started_at || '').localeCompare(String(b.started_at || '')));
  const trends = {};
  for (const name of new Set((current.sets || []).map(row => row.exercise))) {
    if (!supports1rm(name)) continue;
    const latest = best1rm(current, name);
    if (latest == null) continue;
    const points = prior.map(session => ({ date: session.date, value: best1rm(session, name) }))
      .filter(point => point.value != null);
    points.push({ date: current.date, value: latest });
    trends[name] = points;
  }
  return trends;
}

// Only validated dates and numeric chart data enter this shared SVG renderer.
// Both the React completion view and the HTML home recap use the same markup.
export function renderRecap1rm(points) {
  points = points?.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date || "") && Number.isFinite(point.value) && point.value > 0);
  if (!points?.length) return '';
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const coords = points.map((p, i) => ({ ...p,
    x: points.length === 1 ? 80 : 5 + i / (points.length - 1) * 150,
    y: max === min ? 22 : 36 - (p.value - min) / (max - min) * 28 }));
  const path = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const last = coords.at(-1);
  const number = value => Number(value.toFixed(1));
  return `<div class="recap-1rm" aria-label="Estimated 1RM history">
    <div class="recap-1rm-label"><span>1RM EST</span><strong>${number(last.value)} <small>lb</small></strong></div>
    <svg role="img" aria-label="Estimated 1RM across ${points.length} ${points.length === 1 ? 'workout' : 'workouts'}, latest ${number(last.value)} lb" viewBox="0 0 160 44">
      <title>Best estimated 1RM per workout · all history through ${last.date}</title>
      ${coords.length > 1 ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${coords.map((p, i) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${i === coords.length - 1 ? 3.5 : 1.5}" fill="currentColor"><title>${p.date}: ${number(p.value)} lb</title></circle>`).join('')}
    </svg>
    <div class="recap-1rm-dates"><span>${points[0].date.slice(2)}</span><span>${points.length > 1 ? last.date.slice(2) : 'First result'}</span></div>
  </div>`;
}
