import { effectiveStoredExerciseWeight } from './cable-stack.js';
import { findExerciseConfig } from './shared.js';
import { calcStoredSet1RM, isAssistExercise, isRepsOnlyExercise } from './standards.js';

const isBodyweightLift = name => name === "Pull-Ups" || name === "Dips";

function supports1rm(name, flags = {}) {
  const config = { ...findExerciseConfig(name), ...flags };
  if (isBodyweightLift(name)) return !config.assist;
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

// Use one explicit bodyweight baseline for the entire bodyweight-lift trend. Legacy
// weight_lb may contain an old bodyweight, not added load; only belt rows add load.
function bodyweightLoad(row, bodyweightLb) {
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
    const isBodyweight = isBodyweightLift(name);
    const reps = Number(row.reps), weight = isBodyweight ? bodyweightLoad(row, bodyweightLb) : Number(row.weight_lb);
    if (row.exercise !== name || row.set_type !== 'working' || row.userSkipped
      || row.completed === false || !Number.isInteger(reps) || reps <= 0 || !(weight > 0) || !Number.isFinite(weight)) continue;
    const value = isBodyweight ? weight * (reps > 1 ? 1 + reps / 30 : 1)
      : calcStoredSet1RM(name, weight, reps, row.bands_json, row.grip, session, row.load_type);
    if (Number.isFinite(value) && value > 0) {
      best = Math.max(best || 0, value);
      maxWeight = Math.max(maxWeight || 0, isBodyweight ? weight : effectiveStoredExerciseWeight(name, weight, session));
    }
  }
  return best == null ? null : { value: Math.round(best * 10) / 10, maxWeight,
    ...(isBodyweightLift(name) ? { bodyweightLb: Number(bodyweightLb) } : {}) };
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

/** One calendar window for every exercise shown in a recap. */
export function recapTimeDomain(trends = {}) {
  const dates = Object.values(trends).flat().filter(validTrendPoint).map(point => point.date).sort();
  if (!dates.length) return null;
  const start = Date.parse(`${dates[0].slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${dates.at(-1).slice(0, 7)}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end: end.getTime() };
}

const validTimeDomain = domain => Number.isFinite(domain?.start)
  && Number.isFinite(domain?.end) && domain.end > domain.start;

const monthLabel = timestamp => new Date(timestamp).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

export function renderRecapTrendMetrics(points = []) {
  const last = points.filter(validTrendPoint).slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!last) return '';
  const number = value => Number(value.toFixed(1));
  const validWeight = weight => Number.isFinite(weight) && weight > 0;
  return `<div class="recap-trend-metrics">
    <div class="recap-1rm-label"><span class="recap-1rm-key">1RM EST</span><strong>${number(last.value)} <small>lb</small></strong></div>
    ${validWeight(last.maxWeight) ? `<div class="recap-1rm-label recap-max-weight"><span class="recap-1rm-key">MAX WT</span><strong>${number(last.maxWeight)} <small>lb</small></strong></div>` : ''}
  </div>`;
}

/** The shared month key appears once, above the chart column. */
export function renderRecapTimeHeader(domain) {
  if (!validTimeDomain(domain)) return '';
  const months = [];
  for (const date = new Date(domain.start); date.getTime() < domain.end; date.setUTCMonth(date.getUTCMonth() + 1)) {
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    months.push(`<span class="recap-month-name" title="${label}">${monthLabel(date)} <small>${String(date.getUTCFullYear()).slice(-2)}</small></span>`);
  }
  return `<div class="recap-month-grid" aria-label="Shared chart timeline">${months.join('')}</div>`;
}

// Only validated dates and numeric chart data enter this shared SVG renderer.
// Both the React completion view and the HTML home recap use the same markup.
// Paths use normalized plot coordinates; dots live in the unscaled outer SVG
// so resizing the available drawing area never stretches their circular shape.
export function renderRecap1rm(points, timeDomain = null) {
  points = points?.filter(validTrendPoint).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!points?.length) return '';
  const validWeight = weight => Number.isFinite(weight) && weight > 0;
  const values = points.flatMap(p => validWeight(p.maxWeight) ? [p.value, p.maxWeight] : [p.value]);
  const min = Math.min(...values), max = Math.max(...values);
  const y = value => max === min ? 22 : 36 - (value - min) / (max - min) * 28;
  const domain = validTimeDomain(timeDomain) ? timeDomain : recapTimeDomain({ points });
  const firstDate = domain.start, lastDate = domain.end;
  const x = date => firstDate === lastDate ? 80 : 5 + (Math.max(firstDate, Math.min(lastDate, date)) - firstDate) / (lastDate - firstDate) * 150;
  const coords = points.map(p => ({ ...p,
    x: x(Date.parse(p.date)),
    y: y(p.value) }));
  const path = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const weightPath = coords.map((p, i) => validWeight(p.maxWeight)
    ? `${i && validWeight(coords[i - 1].maxWeight) ? 'L' : 'M'}${p.x.toFixed(2)},${y(p.maxWeight).toFixed(2)}` : '').join(' ');
  const last = coords.at(-1);
  const number = value => Number(value.toFixed(1));
  const basis = validWeight(last.bodyweightLb)
    ? `Total load includes bodyweight. All estimates use current bodyweight ${number(last.bodyweightLb)} lb plus recorded belt weight; assisted sets excluded.` : '';
  return `<div title="${basis}" class="recap-1rm" aria-label="Estimated 1RM history">

    <svg role="img" aria-label="Estimated 1RM across ${points.length} ${points.length === 1 ? 'workout' : 'workouts'}, latest ${number(last.value)} lb${validWeight(last.maxWeight) ? `; maximum working-set weight ${number(last.maxWeight)} lb, shared weight scale` : ''}" >
      <title>${points.length === 1 ? 'First result. ' : ''}Best estimated 1RM and maximum working-set weight per workout · shared lb scale · all history through ${last.date}.</title>
      <svg width="100%" height="100%" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
      ${coords.length > 1 ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      <g class="recap-max-weight">
        ${coords.some((p, i) => i > 0 && validWeight(p.maxWeight) && validWeight(coords[i - 1].maxWeight)) ? `<path d="${weightPath}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      </g>
      </svg>
      ${coords.map(p => `<circle cx="${(p.x / 160 * 100).toFixed(3)}%" cy="${(p.y / 44 * 100).toFixed(3)}%" r="1.5" fill="currentColor"><title>${p.date}: ${number(p.value)} lb</title></circle>`).join('')}
      <g class="recap-max-weight">
        ${coords.filter(p => validWeight(p.maxWeight)).map(p => `<circle cx="${(p.x / 160 * 100).toFixed(3)}%" cy="${(y(p.maxWeight) / 44 * 100).toFixed(3)}%" r="1.5" fill="currentColor"><title>${p.date}: max weight ${number(p.maxWeight)} lb</title></circle>`).join('')}
      </g>
    </svg>
  </div>`;
}

/** Calendar month values displayed directly beneath the matching sparkline. */
export function renderRecapMonthlyChanges(points = [], timeDomain = null) {
  const months = recapMonthlyChanges(points);
  if (!months.some(month => month.delta != null)) return '';
  const domain = validTimeDomain(timeDomain) ? timeDomain : { start: months[0].start, end: months.at(-1).end };
  const byMonth = new Map(months.map(month => [month.month, month]));
  const maxChange = Math.max(1, ...months.map(month => Math.abs(month.delta || 0)));
  const cells = [];
  for (const date = new Date(domain.start); date.getTime() < domain.end; date.setUTCMonth(date.getUTCMonth() + 1)) {
    const key = date.toISOString().slice(0, 7);
    const month = byMonth.get(key);
    const delta = month?.delta;
    const kind = delta == null ? 'unknown' : delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'flat';
    const value = delta == null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}`;
    const height = delta == null ? 0 : delta === 0 ? 1 : Math.abs(delta) / maxChange * 5;
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const title = `${label}: ${delta == null ? 'not enough data' : `estimated 1RM ${value} lb (${month.fromDate} to ${month.toDate})`}`;
    cells.push(`<div class="recap-month-cell ${kind}" title="${title}" aria-label="${title}">
      <strong class="recap-month-value">${value}</strong>
      <div class="recap-month-track"><i style="height:${height.toFixed(2)}px"></i></div>
    </div>`);
  }
  return `<div class="recap-month-summary" aria-label="Monthly estimated 1RM change in pounds"><div class="recap-month-grid">${cells.join('')}</div></div>`;
}
