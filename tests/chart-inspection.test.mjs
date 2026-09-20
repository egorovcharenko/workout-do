import test from 'node:test';
import assert from 'node:assert/strict';
import { chartInspectionAttributes, chartPointText, nearestChartPoint } from '../lib/chart-inspection.js';
import { renderRecap1rm } from '../lib/legacy/recap-1rm.js';
import { renderProgress } from '../components/home/progress.js';
const payload = html => JSON.parse(html.match(/data-chart-points="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

test('nearest point follows calendar positions, including gaps, endpoints and a single result', () => {
  const points = [{ x: 3 }, { x: 12 }, { x: 80 }];
  assert.equal(nearestChartPoint(points, -10), 0);
  assert.equal(nearestChartPoint(points, 25), 1);
  assert.equal(nearestChartPoint(points, 60), 2);
  assert.equal(nearestChartPoint(points, 105), 2);
  assert.equal(nearestChartPoint([{ x: 80 }], 1), 0);
});
test('both lines are inspected as a single workout and use the plotted shared time axis', () => {
  const points = [{ date: '2026-04-02', value: 180, maxWeight: 155 }, { date: '2026-09-19', value: 188.5, maxWeight: 160 }];
  const html = renderRecap1rm(points);
  const data = payload(html);
  assert.equal(data.points.length, 2);
  assert.deepEqual(data.points[1].values.map(item => item.value), [188.5, 160]);
  assert.equal(data.points[1].date, '2026-09-19');
  const xs = [...html.matchAll(/<circle cx="([\d.]+)%"/g)].map(match => Number(match[1]));
  assert.ok(Math.abs(data.points[1].x - xs[1]) < .001);
  assert.match(html, /tabindex="0" role="slider"/);
  assert.match(html, /aria-valuemax="1"/);
  assert.match(chartPointText(data.points[1]), /1RM est 188.5 lb; Max weight 160 lb/);
});
test('missing weights are not invented and measurement tooltips keep their actual units', () => {
  const data = payload(renderRecap1rm([{ date: '2026-09-19', value: 100 }]));
  assert.equal(data.points[0].values.length, 1);
  assert.equal(payload(renderRecap1rm([{ date: '2026-09-19', value: 22, maxWeight: 16.25 }])).points[0].values[1].value, 16.25);
  const html = renderProgress([], [{ taken_at: '2026-09-19', weight_kg: 75.2 }], {
    today: '2026-09-20', metrics: [{ id: 'weight_kg', label: 'Weight', unit: 'kg' }],
  });
  assert.deepEqual(payload(html).points[0].values, [{ label: 'Weight', value: 75.2, unit: 'kg', kind: 'measurement' }]);
});
test('inspection data is escaped and bodyweight lifts explain their total-load values', () => {
  const point = { date: '2026-09-19', x: 90, values: [{ label: '<img "x">', value: 3, unit: 'cm' }] };
  const html = chartInspectionAttributes([point]);
  assert.doesNotMatch(html, /<img/);
  assert.deepEqual(payload(html).points[0], point);
  const bw = payload(renderRecap1rm([{ date: '2026-09-19', value: 220, maxWeight: 165, bodyweightLb: 165 }]));
  assert.match(bw.note, /bodyweight/);
});
