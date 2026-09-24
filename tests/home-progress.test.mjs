import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgress, renderProgress } from '../components/home/progress.js';
const set = (exercise, weight_lb, reps, extra = {}) => ({ exercise, weight_lb, reps, set_type: 'working', ...extra });
const session = (id, date, sets, extra = {}) => ({ id, date, sets, ...extra });
const options = { today: '2026-09-20', bodyweightLb: 165, metrics: [
  { id: 'chest_cm', label: 'Chest', direction: 'up' },
  { id: 'weight_kg', label: 'Weight', unit: 'kg', direction: 'flat' },
] };
const history = [
  session('old', '2026-04-01', [set('Barbell Bench Press', 125, 8), set('Dips', 25, 8, { load_type: 'belt' })]),
  session('middle', '2026-05-01', [set('Barbell Bench Press', 135, 8), set('Barbell Bench Press', 135, 6)]),
  session('latest', '2026-09-19', [set('Barbell Back Squat', 135, 9), set('Dragon Fly Progression', 0, 5)]),
];
test('all-time progress merges workouts by exercise, retains old lifts and latest actual sets', () => {
  const data = buildProgress(history, [], options);
  const chest = data.groups.find(group => group.id === 'chest');
  const bench = chest.exercises.find(ex => ex.name === 'Barbell Bench Press');
  assert.deepEqual(bench.groups, [{ load: '135 lb', reps: [8, 6] }]);
  assert.equal(bench.date, '2026-05-01');
  assert.equal(data.trends['Barbell Bench Press'].length, 2);
  assert.equal(data.trends.Dips[0].maxWeight, 190);
  assert.ok(data.groups.flatMap(g => g.exercises).some(ex => ex.name === 'Dragon Fly Progression'));
  assert.equal(data.timeDomain.start, Date.parse('2026-04-01'));
  const html = renderProgress(history, [], options);
  assert.equal((html.match(/<h3>Barbell Bench Press<\/h3>/g) || []).length, 1);
  assert.equal((html.match(/Shared chart timeline/g) || []).length, 1);
  assert.match(html, /Monthly estimated 1RM change/);
  assert.doesNotMatch(html, /undefined|NaN/);
});
test('active, future, invalid, skipped and duplicate data do not overwrite completed results', () => {
  const bad = [
    session('live', '2026-09-20', [set('Barbell Bench Press', 999, 20)]),
    session('future', '2027-01-01', [set('Barbell Bench Press', 999, 20)]),
    session('invalid', '2026-02-31', [set('Barbell Bench Press', 999, 20)]),
    session('skipped', '2026-09-19', [set('Barbell Bench Press', 999, 20, { userSkipped: true })]),
    session('pending', '2026-09-19', [set('Barbell Bench Press', 999, 20, { completed: false })]),
  ];
  const data = buildProgress([...history, history[0], ...bad], [], { ...options, activeSessions: [{ id: 'live' }] });
  assert.equal(data.trends['Barbell Bench Press'].length, 2);
  assert.equal(data.groups.find(g => g.id === 'chest').exercises.find(ex => ex.name === 'Barbell Bench Press').date, '2026-05-01');
});
test('measurements share the global time scale and retain units, signed changes and body-area grouping', () => {
  const measurements = [
    { taken_at: '2026-03-10T12:00:00Z', chest_cm: 100, weight_kg: 75 },
    { taken_at: '2026-09-19T12:00:00Z', chest_cm: '102.5', weight_kg: 76 },
    { taken_at: 'bad', chest_cm: 10000 },
    { taken_at: '2026-09-20', chest_cm: null, weight_kg: '' },
  ];
  const data = buildProgress(history, measurements, options);
  assert.equal(data.timeDomain.start, Date.parse('2026-03-01'));
  assert.equal(data.groups.find(g => g.id === 'chest').metrics[0].points.length, 2);
  assert.equal(data.groups.find(g => g.id === 'other').metrics[0].unit, 'kg');
  const html = renderProgress(history, measurements, options);
  assert.match(html, /102.5 cm/);
  assert.match(html, /\+2.5 cm/);
  assert.match(html, /76 kg/);
  assert.doesNotMatch(html, /10000|NaN|undefined/);
});
test('empty and measurement-only histories render without invented strength data and escape names', () => {
  assert.match(renderProgress([], [], options), /No workouts or measurements yet/);
  const html = renderProgress([], [{ taken_at: '2026-09-19', chest_cm: 100 }], options);
  assert.match(html, /100 cm/);
  assert.doesNotMatch(html, /1RM EST/);
  assert.match(renderProgress([session('x', '2026-09-19', [set('<img src=x>', 10, 5)])], [], options), /&lt;img src=x&gt;/);
});

test('evening measurements use their local date, not the UTC day of taken_at', () => {
  // 18:30 PDT on 2026-09-20 is 01:30Z on 2026-09-21.
  const data = buildProgress([], [{ taken_at: '2026-09-21T01:30:00Z', date: '2026-09-20', chest_cm: 101 }], options);
  assert.deepEqual(data.groups.find(g => g.id === 'chest').metrics[0].points, [{ date: '2026-09-20', value: 101 }]);
});
