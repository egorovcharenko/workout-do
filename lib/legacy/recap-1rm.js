import { effectiveStoredExerciseWeight } from './cable-stack.js';
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
  let best = null, maxWeight = null;
  for (const row of session.sets || []) {
    const reps = Number(row.reps), weight = Number(row.weight_lb);
    if (row.exercise !== name || row.set_type !== 'working' || row.userSkipped
      || row.completed === false || !Number.isInteger(reps) || reps <= 0 || !(weight > 0) || !Number.isFinite(weight)) continue;
    const value = calcStoredSet1RM(name, weight, reps, row.bands_json, row.grip, session, row.load_type);
    if (Number.isFinite(value) && value > 0) {
      best = Math.max(best || 0, value);
      maxWeight = Math.max(maxWeight || 0, effectiveStoredExerciseWeight(name, weight, session));
    }
  }
  return best == null ? null : { value: Math.round(best * 10) / 10, maxWeight };
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
    const points = prior.flatMap(session => {
      const result = best1rm(session, name);
      return result ? [{ date: session.date, ...result }] : [];
    });
    points.push({ date: current.date, ...latest });
    trends[name] = points;
  }
  return trends;
}

// Only validated dates and numeric chart data enter this shared SVG renderer.
// Both the React completion view and the HTML home recap use the same markup.
export function renderRecap1rm(points) {
  points = points?.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date || "") && Number.isFinite(point.value) && point.value > 0);
  if (!points?.length) return '';
  const validWeight = weight => Number.isFinite(weight) && weight > 0;
  const values = points.flatMap(p => validWeight(p.maxWeight) ? [p.value, p.maxWeight] : [p.value]);
  const min = Math.min(...values), max = Math.max(...values);
  const y = value => max === min ? 22 : 36 - (value - min) / (max - min) * 28;
  const coords = points.map((p, i) => ({ ...p,
    x: points.length === 1 ? 80 : 5 + i / (points.length - 1) * 150,
    y: y(p.value) }));
  const path = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const weightPath = coords.map((p, i) => validWeight(p.maxWeight)
    ? `${i && validWeight(coords[i - 1].maxWeight) ? 'L' : 'M'}${p.x.toFixed(2)},${y(p.maxWeight).toFixed(2)}` : '').join(' ');
  const last = coords.at(-1);
  const number = value => Number(value.toFixed(1));
  return `<div class="recap-1rm" aria-label="Estimated 1RM history">
    <div class="recap-1rm-label"><span class="recap-1rm-key">1RM EST</span><strong>${number(last.value)} <small>lb</small></strong></div>
    ${validWeight(last.maxWeight) ? `<div class="recap-1rm-label recap-max-weight"><span class="recap-1rm-key">MAX WT</span><strong>${number(last.maxWeight)} <small>lb</small></strong></div>` : ''}
    <svg role="img" aria-label="Estimated 1RM across ${points.length} ${points.length === 1 ? 'workout' : 'workouts'}, latest ${number(last.value)} lb${validWeight(last.maxWeight) ? `; maximum working-set weight ${number(last.maxWeight)} lb, shared weight scale` : ''}" viewBox="0 0 160 44">
      <title>Best estimated 1RM and maximum working-set weight per workout · shared lb scale · all history through ${last.date}</title>
      ${coords.length > 1 ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${coords.map((p, i) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${i === coords.length - 1 ? 3.5 : 1.5}" fill="currentColor"><title>${p.date}: ${number(p.value)} lb</title></circle>`).join('')}
      <g class="recap-max-weight">
        ${coords.some((p, i) => i > 0 && validWeight(p.maxWeight) && validWeight(coords[i - 1].maxWeight)) ? `<path d="${weightPath}" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${coords.filter(p => validWeight(p.maxWeight)).map(p => `<circle cx="${p.x.toFixed(2)}" cy="${y(p.maxWeight).toFixed(2)}" r="${p === last ? 2.5 : 1.5}" fill="currentColor"><title>${p.date}: max weight ${number(p.maxWeight)} lb</title></circle>`).join('')}
      </g>
    </svg>
    <div class="recap-1rm-dates"><span>${points[0].date.slice(2)}</span><span>${points.length > 1 ? last.date.slice(2) : 'First result'}</span></div>
  </div>`;
}
