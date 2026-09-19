import { effectiveStoredExerciseWeight } from './cable-stack.js';
import { findExerciseConfig } from './shared.js';
import { calcStoredSet1RM, isAssistExercise, isRepsOnlyExercise } from './standards.js';

function supports1rm(name, flags = {}) {
  const config = { ...findExerciseConfig(name), ...flags };
  if (name === "Pull-Ups") return !config.assist;
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
          load_type: exercise.beltLoad ? "belt" : null,
          bands_json: JSON.stringify(set.bands || []), grip: set.grip }));
    }) };
}

// Use one explicit bodyweight baseline for the entire pull-up trend. Legacy
// weight_lb may contain an old bodyweight, not added load; only belt rows add load.
function pullupLoad(row, bodyweightLb) {
  const bw = Number(bodyweightLb);
  if (!Number.isFinite(bw) || bw <= 0) return null;
  try {
    const bands = typeof row.bands_json === 'string' ? JSON.parse(row.bands_json) : row.bands_json;
    if (bands != null && (!Array.isArray(bands) || bands.some(b => !Number.isFinite(Number(b)) || Number(b) !== 0))) return null;
  } catch { return null; }
  const added = row.load_type === 'belt' ? Number(row.weight_lb) : 0;
  return Number.isFinite(added) && added >= 0 ? bw + added : null;
}

function best1rm(session, name, bodyweightLb) {
  let best = null, maxWeight = null;
  for (const row of session.sets || []) {
    const isPullup = name === "Pull-Ups";
    const reps = Number(row.reps), weight = isPullup ? pullupLoad(row, bodyweightLb) : Number(row.weight_lb);
    if (row.exercise !== name || row.set_type !== 'working' || row.userSkipped
      || row.completed === false || !Number.isInteger(reps) || reps <= 0 || !(weight > 0) || !Number.isFinite(weight)) continue;
    const value = isPullup ? weight * (reps > 1 ? 1 + reps / 30 : 1)
      : calcStoredSet1RM(name, weight, reps, row.bands_json, row.grip, session, row.load_type);
    if (Number.isFinite(value) && value > 0) {
      best = Math.max(best || 0, value);
      maxWeight = Math.max(maxWeight || 0, isPullup ? weight : effectiveStoredExerciseWeight(name, weight, session));
    }
  }
  return best == null ? null : { value: Math.round(best * 10) / 10, maxWeight,
    ...(name === "Pull-Ups" ? { bodyweightLb: Number(bodyweightLb) } : {}) };
}

/** One point per workout, including the current result exactly once. The live
 * result replaces any earlier autosaved copy, and future workouts stay out. */
export function buildRecap1rmTrends(history = [], current, { bodyweightLb } = {}) {
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
    const latest = best1rm(current, name, bodyweightLb);
    if (latest == null) continue;
    const points = prior.flatMap(session => {
      const result = best1rm(session, name, bodyweightLb);
      return result ? [{ date: session.date, ...result }] : [];
    });
    points.push({ date: current.date, ...latest });
    trends[name] = points;
  }
  return trends;
}

const validTrendPoint = point => /^\d{4}-\d{2}-\d{2}$/.test(point?.date || '')
  && Number.isFinite(Date.parse(point.date)) && new Date(point.date).toISOString().slice(0, 10) === point.date
  && Number.isFinite(point.value) && point.value > 0;

/** Compare consecutive month-end results. In the first month or after a gap,
 * use that month's first result instead, so missing months are never scored. */
export function recapMonthlyChanges(points = []) {
  const months = new Map();
  for (const point of points.filter(validTrendPoint).slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const month = point.date.slice(0, 7);
    const group = months.get(month) || [];
    group.push(point);
    months.set(month, group);
  }
  let previous = null;
  return [...months].map(([month, group]) => {
    const start = Date.parse(`${month}-01T00:00:00Z`);
    const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
    const last = group.at(-1);
    const baseline = previous?.end === start ? previous.last : group.length > 1 ? group[0] : null;
    previous = { end: next.getTime(), last };
    return { month, start, end: next.getTime(), fromDate: baseline?.date || null,
      toDate: last.date, delta: baseline ? Math.round((last.value - baseline.value) * 10) / 10 : null };
  });
}

const monthLabel = timestamp => new Date(timestamp).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

// Only validated dates and numeric chart data enter this shared SVG renderer.
// Both the React completion view and the HTML home recap use the same markup.
export function renderRecap1rm(points) {
  points = points?.filter(validTrendPoint).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!points?.length) return '';
  const validWeight = weight => Number.isFinite(weight) && weight > 0;
  const values = points.flatMap(p => validWeight(p.maxWeight) ? [p.value, p.maxWeight] : [p.value]);
  const min = Math.min(...values), max = Math.max(...values);
  const y = value => max === min ? 22 : 36 - (value - min) / (max - min) * 28;
  const months = recapMonthlyChanges(points);
  const firstDate = months[0].start, lastDate = months.at(-1).end;
  const x = date => firstDate === lastDate ? 80 : 5 + (Math.max(firstDate, Math.min(lastDate, date)) - firstDate) / (lastDate - firstDate) * 150;
  // Keep calendar gaps on the axis. Thin labels on long histories rather than
  // squeezing overlapping month names into a mobile sparkline.
  const start = new Date(firstDate), end = new Date(lastDate);
  const monthCount = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  const stride = Math.ceil(monthCount / 6);
  const labelIndices = Array.from({ length: Math.ceil(monthCount / stride) }, (_, i) => i * stride);
  if (labelIndices.at(-1) !== monthCount - 1) {
    if (labelIndices.length > 1 && monthCount - 1 - labelIndices.at(-1) < stride) labelIndices.pop();
    labelIndices.push(monthCount - 1);
  }
  const monthLabels = labelIndices.map(index => {
    const date = new Date(firstDate); date.setUTCMonth(date.getUTCMonth() + index);
    const next = new Date(date); next.setUTCMonth(next.getUTCMonth() + 1);
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `<span style="left:${(x((date.getTime() + next.getTime()) / 2) / 160 * 100).toFixed(2)}%" title="${label}">${monthLabel(date)}</span>`;
  }).join('');
  const coords = points.map(p => ({ ...p,
    x: x(Date.parse(p.date)),
    y: y(p.value) }));
  const path = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const weightPath = coords.map((p, i) => validWeight(p.maxWeight)
    ? `${i && validWeight(coords[i - 1].maxWeight) ? 'L' : 'M'}${p.x.toFixed(2)},${y(p.maxWeight).toFixed(2)}` : '').join(' ');
  const last = coords.at(-1);
  const number = value => Number(value.toFixed(1));
  const firstYear = points[0].date.slice(0, 4), lastYear = last.date.slice(0, 4);
  const maxChange = Math.max(0, ...months.map(month => Math.abs(month.delta || 0)));
  const monthBars = months.filter(month => month.delta != null && month.delta !== 0 && firstDate !== lastDate).map(month => {
    const left = x(month.start), right = x(month.end);
    const gap = Math.min(1, (right - left) * 0.08);
    const height = Math.abs(month.delta) / maxChange * 11;
    const label = `${month.month}: estimated 1RM ${month.delta > 0 ? '+' : ''}${number(month.delta)} lb (${month.fromDate} to ${month.toDate})`;
    return `<rect class="recap-month-change ${month.delta > 0 ? 'gain' : 'loss'}" x="${(left + gap).toFixed(2)}" y="${(month.delta > 0 ? 14 - height : 14).toFixed(2)}" width="${Math.max(0, right - left - 2 * gap).toFixed(2)}" height="${height.toFixed(2)}" rx="1" role="img" aria-label="${label}"><title>${label}</title></rect>`;
  }).join('');
  const basis = validWeight(last.bodyweightLb)
    ? `Total load includes bodyweight. All pull-up estimates use current bodyweight ${number(last.bodyweightLb)} lb plus recorded belt weight; assisted sets excluded.` : '';
  return `<div title="${basis}" class="recap-1rm" aria-label="Estimated 1RM history">
    <div class="recap-1rm-label"><span class="recap-1rm-key">1RM EST</span><strong>${number(last.value)} <small>lb</small></strong></div>
    ${validWeight(last.maxWeight) ? `<div class="recap-1rm-label recap-max-weight"><span class="recap-1rm-key">MAX WT</span><strong>${number(last.maxWeight)} <small>lb</small></strong></div>` : ''}
    <svg role="img" aria-label="Estimated 1RM across ${points.length} ${points.length === 1 ? 'workout' : 'workouts'}, latest ${number(last.value)} lb${validWeight(last.maxWeight) ? `; maximum working-set weight ${number(last.maxWeight)} lb, shared weight scale` : ''}" viewBox="0 0 160 44">
      <title>Best estimated 1RM and maximum working-set weight per workout · shared lb scale · all history through ${last.date}.</title>
      ${coords.length > 1 ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${coords.map((p, i) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${i === coords.length - 1 ? 3.5 : 1.5}" fill="currentColor"><title>${p.date}: ${number(p.value)} lb</title></circle>`).join('')}
      <g class="recap-max-weight">
        ${coords.some((p, i) => i > 0 && validWeight(p.maxWeight) && validWeight(coords[i - 1].maxWeight)) ? `<path d="${weightPath}" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${coords.filter(p => validWeight(p.maxWeight)).map(p => `<circle cx="${p.x.toFixed(2)}" cy="${y(p.maxWeight).toFixed(2)}" r="${p === last ? 2.5 : 1.5}" fill="currentColor"><title>${p.date}: max weight ${number(p.maxWeight)} lb</title></circle>`).join('')}
      </g>
    </svg>
    ${monthBars ? `<svg class="recap-month-bars" role="img" aria-label="Monthly estimated 1RM change: green increases, red decreases" viewBox="0 0 160 28">
      <title>Monthly estimated 1RM change in lb, centered at zero. First month and months after gaps compare their first and last results; other months compare consecutive month-end results.</title>
      <line x1="5" x2="155" y1="14" y2="14" class="recap-month-zero"/>${monthBars}
    </svg>` : ''}
    <div class="recap-month-axis" aria-label="Calendar months">${monthLabels}</div>
    <div class="recap-1rm-dates"><span>${firstYear}</span><span>${points.length === 1 ? 'First result' : lastYear !== firstYear ? lastYear : ''}</span></div>
  </div>`;
}
