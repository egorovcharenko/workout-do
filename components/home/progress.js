import { chartInspectionAttributes } from "../../lib/chart-inspection.js";
import { EXERCISE_MUSCLES } from '../../lib/legacy/standards.js';
import { localDate } from '../../lib/legacy/shared.js';
import { buildStoredWorkoutRecap, latestCompletedWorkout, recapDate } from '../../lib/legacy/workout-recap.js';
import { buildAllTime1rmTrends, recapTimeDomain, renderRecap1rm, renderRecapMonthlyChanges, renderRecapTimeHeader, renderRecapTrendMetrics } from '../../lib/legacy/recap-1rm.js';
import { MUSCLE_TO_UNIFIED_GROUP, METRIC_TO_UNIFIED_GROUP, UNIFIED_GROUPS } from './sparklines.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date))
  && new Date(date).toISOString().slice(0, 10) === date;

export function buildProgress(history = [], measurements = [], { activeSessions = [], today = localDate(), metrics = [], bodyweightLb } = {}) {
  const seen = new Set();
  const sessions = history.filter(session => {
    if (session.is_deload === true || Number(session.is_deload) === 1 || !validDate(session.date) || session.date > today || (session.id && seen.has(session.id))
      || activeSessions.some(active => active.id === session.id)
      || !latestCompletedWorkout([session], activeSessions, today)) return false;
    if (session.id) seen.add(session.id);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date)
    || String(a.started_at || a.created_at || '').localeCompare(String(b.started_at || b.created_at || '')));
  const latest = new Map();
  for (const session of sessions) {
    const logged = { ...session, sets: (session.sets || []).filter(set => set.completed !== false && !set.userSkipped) };
    for (const exercise of buildStoredWorkoutRecap(logged).exercises) {
      if (exercise.workingSets) latest.set(exercise.name, { ...exercise, date: session.date });
    }
  }
  const trends = buildAllTime1rmTrends(sessions, { bodyweightLb });
  const metricRows = metrics.map(metric => ({ ...metric, points: measurements.flatMap(entry => {
    const date = String(entry.taken_at || entry.date || '').slice(0, 10);
    const value = Number(entry[metric.id]);
    return validDate(date) && date <= today && entry[metric.id] != null && Number.isFinite(value) && value > 0
      ? [{ date, value }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date)) })).filter(metric => metric.points.length);
  const groups = UNIFIED_GROUPS.map(group => ({ ...group,
    exercises: [...latest.values()].filter(exercise => {
      const muscle = EXERCISE_MUSCLES[exercise.name]?.primary?.[0];
      return (MUSCLE_TO_UNIFIED_GROUP[muscle] || 'other') === group.id;
    }).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)),
    metrics: metricRows.filter(metric => (METRIC_TO_UNIFIED_GROUP[metric.id] || 'other') === group.id),
  })).filter(group => group.exercises.length || group.metrics.length);
  return { groups, trends, timeDomain: recapTimeDomain({ ...trends, measurements: metricRows.flatMap(metric => metric.points) }) };
}

// Use the same calendar axis and fixed-size dots as the workout sparklines.
function measurementChart(metric, domain) {
  const values = metric.points.map(point => point.value);
  const low = Math.min(...values), high = Math.max(...values);
  const points = metric.points.map(point => ({ ...point,
    x: 5 + (Date.parse(point.date) - domain.start) / (domain.end - domain.start) * 150,
    y: high === low ? 22 : 36 - (point.value - low) / (high - low) * 28,
  }));
  const inspection = chartInspectionAttributes(points.map(point => ({
    date: point.date, x: point.x / 160 * 100,
    values: [{ label: metric.label, value: point.value, unit: metric.unit || 'cm', kind: 'measurement' }],
  })));
  return `<div class="recap-1rm progress-measurement-chart" aria-label="${esc(metric.label)} history" ${inspection}><svg role="img" aria-label="${esc(metric.label)} measurement history">
    <svg width="100%" height="100%" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">
      ${points.length > 1 ? `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    </svg>
    ${points.map(p => `<circle cx="${(p.x / 160 * 100).toFixed(3)}%" cy="${(p.y / 44 * 100).toFixed(3)}%" r="1.5" fill="currentColor"><title>${p.date}: ${p.value} ${esc(metric.unit || 'cm')}</title></circle>`).join('')}
  </svg></div>`;
}

function measurementRow(metric, domain) {
  const last = metric.points.at(-1);
  const delta = Math.round((last.value - metric.points[0].value) * 10) / 10;
  const favorable = metric.direction === 'up' ? delta > 0 : metric.direction === 'down' ? delta < 0 : null;
  const kind = delta === 0 || favorable == null ? '' : favorable ? 'gain' : 'loss';
  return `<li class="workout-recap-exercise progress-measurement"><div class="workout-recap-results has-trend">
    <div class="workout-recap-details"><div class="workout-recap-exercise-heading"><h3>${esc(metric.label)}</h3><time datetime="${last.date}">${esc(recapDate(last.date))}</time></div>
      <div class="workout-recap-detail-body"><span class="workout-recap-load">${last.value} ${esc(metric.unit || 'cm')}</span>
      ${metric.points.length > 1 ? `<span class="progress-delta ${kind}" title="Change since ${metric.points[0].date}">${delta > 0 ? '+' : ''}${delta} ${esc(metric.unit || 'cm')}</span>` : ''}</div>
    </div><div class="workout-recap-trend">${measurementChart(metric, domain)}</div>
  </div></li>`;
}

export function renderProgress(history, measurements, options = {}) {
  return renderProgressModel(buildProgress(history, measurements, options), options);
}

export function renderProgressModel({ groups, trends, timeDomain }, options = {}) {
  return `<section class="workout-recap home-history-progress" aria-label="All-time progress">
    <header class="workout-recap-header"><div class="workout-recap-heading-row"><h2 class="workout-recap-title">All-time progress</h2>${options.headerControls || ''}</div></header>
    ${timeDomain ? `<div class="workout-recap-chart-header"><span class="progress-caption">Latest sets & measurements</span>${renderRecapTimeHeader(timeDomain)}</div>` : ''}
    ${groups.map(group => `<section class="progress-group" aria-label="${esc(group.label)}"><h2 class="progress-group-title">${esc(group.label)}</h2>
      <ol class="workout-recap-exercises">${group.exercises.map(exercise => {
        const points = trends[exercise.name];
        return `<li class="workout-recap-exercise"><div class="workout-recap-results${points ? ' has-trend' : ''}">
          <div class="workout-recap-details"><div class="workout-recap-exercise-heading"><h3>${esc(exercise.name)}</h3><time datetime="${exercise.date}">${esc(recapDate(exercise.date))}</time></div>
          <div class="workout-recap-detail-body"><div class="workout-recap-set-groups">${exercise.groups.map(set => `<div class="workout-recap-set-group"><span class="workout-recap-load">${esc(set.load)}</span><span class="workout-recap-reps"><span class="workout-recap-times">× </span><strong>${set.reps.join('·')}</strong><small> reps</small></span></div>`).join('')}</div>
          ${points ? `<div class="workout-recap-metric-summary">${renderRecapTrendMetrics(points)}</div>` : ''}</div></div>
          ${points ? `<div class="workout-recap-trend">${renderRecap1rm(points, timeDomain)}${renderRecapMonthlyChanges(points, timeDomain)}</div>` : ''}
        </div></li>`;
      }).join('')}${group.metrics.map(metric => measurementRow(metric, timeDomain)).join('')}</ol>
    </section>`).join('') || '<p class="workout-recap-empty">No workouts or measurements yet.</p>'}
    ${options.controls || ''}
  </section>`;
}
