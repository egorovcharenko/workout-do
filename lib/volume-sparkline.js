import { chartInspectionAttributes } from './chart-inspection.js';
import { recapTimeDomain } from './legacy/recap-1rm.js';

const valid = point => /^\d{4}-\d{2}-\d{2}$/.test(point?.date || '')
  && Number.isFinite(Date.parse(point.date)) && new Date(point.date).toISOString().slice(0, 10) === point.date
  && Number.isFinite(point.value) && point.value > 0 && ['lb·reps', 'reps'].includes(point.unit);
const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 1 });

export function renderVolumeMetric(points = []) {
  const last = points.filter(valid).at(-1);
  if (!last) return '';
  return `<div class="recap-trend-metrics recap-volume-metric"><div class="recap-1rm-label"><span class="recap-1rm-key">Volume</span><strong>${number(last.value)} <small>${last.unit}</small></strong></div></div>`;
}

export function renderVolumeSparkline(points = [], timeDomain = null) {
  points = points.filter(valid).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) return '';
  const domain = timeDomain || recapTimeDomain({ points });
  if (!Number.isFinite(domain?.start) || !Number.isFinite(domain?.end) || domain.end <= domain.start) return '';
  points = points.filter(p => Date.parse(p.date) >= domain.start && Date.parse(p.date) <= domain.end);
  if (!points.length) return '';
  const values = points.map(p => p.value), min = Math.min(...values), max = Math.max(...values);
  const coords = points.map(p => ({ ...p,
    x: 5 + (Date.parse(p.date) - domain.start) / (domain.end - domain.start) * 150,
    y: max === min ? 14 : 24 - (p.value - min) / (max - min) * 20 }));
  const path = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const last = points.at(-1);
  const inspection = chartInspectionAttributes(coords.map(p => ({ date: p.date, x: p.x / 160 * 100,
    values: [{ label: 'Volume', value: p.value, unit: p.unit, kind: 'volume' }] })),
    last.unit === 'reps' ? 'Total working-set reps' : last.bodyweightLb ? `Working-set load × reps; uses ${number(last.bodyweightLb)} lb bodyweight plus belt load throughout` : 'Working-set load × reps');
  return `<div class="recap-1rm recap-volume" aria-label="Working-set volume history" ${inspection}>
    <svg role="img" aria-label="Volume across ${points.length} workouts, latest ${number(last.value)} ${last.unit}">
      <title>Working-set volume per workout</title>
      <svg width="100%" height="100%" viewBox="0 0 160 28" preserveAspectRatio="none" aria-hidden="true">
        ${coords.length > 1 ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      </svg>
      ${coords.map(p => `<circle cx="${(p.x / 160 * 100).toFixed(3)}%" cy="${(p.y / 28 * 100).toFixed(3)}%" r="1.5" fill="currentColor"/>`).join('')}
    </svg></div>`;
}
