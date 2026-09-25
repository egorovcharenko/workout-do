import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights } from '../lib/progress-insights.js';
import { buildSharedProgress } from '../lib/progress-sharing.js';
import { buildProgress } from '../components/home/progress.js';
import { renderInsights } from '../components/home/insights.js';

const today = '2026-09-24';
const daysAgo = n => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const set = (exercise, reps = 8, rir = null) => ({ exercise, set_type: 'working', weight_lb: 100, reps: String(reps), rir });
const session = (n, sets) => ({ id: `s${n}`, date: daysAgo(n), finished_at: `${daysAgo(n)}T19:00:00Z`, sets });
const trend = values => values.map(([n, value]) => ({ date: daysAgo(n), value }));

test('lifts are classified as new best, stalled, down, baseline or paused', () => {
  const sessions = [session(1, [set('Barbell Back Squat')])];
  const { lifts } = buildInsights(sessions, {
    'Barbell Back Squat': trend([[50, 160], [40, 170], [30, 168], [20, 169], [10, 170], [1, 169]]),
    'Barbell Bench Press': trend([[30, 180], [20, 172], [1, 165]]),
    'Barbell RDL': trend([[21, 200], [14, 205], [2, 210]]),
    'Standing Overhead Press': trend([[3, 95]]),
    'Dips': trend([[80, 100], [70, 105], [60, 110]]),
  }, { today });
  const status = Object.fromEntries(lifts.map(lift => [lift.name, lift.status]));
  assert.deepEqual(status, {
    'Barbell Back Squat': 'stalled', 'Barbell Bench Press': 'down', 'Barbell RDL': 'progressing',
    'Standing Overhead Press': 'new', 'Dips': 'paused',
  });
  const squat = lifts.find(lift => lift.name === 'Barbell Back Squat');
  assert.equal(squat.sessionsSinceBest, 4);
  assert.equal(squat.change, 5.6, '8-week change compares with the first result inside the window');
});

test('muscle volume counts secondary movers fractionally and flags low, in-range and high muscles', () => {
  // Four weeks of 4 bench sets twice a week = 8 chest sets/week (below 10);
  // plus lots of lateral raises for high shoulder volume.
  const sessions = [];
  for (let week = 0; week < 4; week++) for (const day of [2, 6]) {
    sessions.push(session(week * 7 + day, [
      ...Array(4).fill(set('Barbell Bench Press')),
      ...Array(12).fill(set('Dumbbell Lateral Raises')),
    ]));
  }
  const { muscles, actions, balance } = buildInsights(sessions, {}, { today });
  const chest = muscles.find(m => m.id === 'chest');
  assert.equal(chest.perWeek, 8);
  assert.equal(chest.status, 'low');
  assert.equal(muscles.find(m => m.id === 'shoulders').status, 'high');
  assert.ok(muscles.find(m => m.id === 'triceps').perWeek > 0, 'Bench counts toward triceps too');
  assert.ok(balance.ratio > 1.5, 'No pulling at all is flagged as push-heavy');
  assert.ok(actions.some(a => a.kind === 'low' && /Chest: 8 sets\/week/.test(a.text) && /Add about 2 sets/.test(a.text)));
  assert.ok(actions.some(a => a.kind === 'balance'));
  assert.ok(!actions.some(a => a.kind === 'low' && /Calves/.test(a.text)), 'Muscles never trained are not nagged about');
});

test('effort and consistency produce advice only with enough data', () => {
  const easy = Array.from({ length: 6 }, (_, i) => session(i * 4 + 1, Array(3).fill(set('Barbell Back Squat', 8, '3-4'))));
  const tooEasy = buildInsights(easy, {}, { today });
  assert.equal(tooEasy.rir.rated, 18);
  assert.ok(tooEasy.actions.some(a => a.kind === 'effort' && /3\+ reps left/.test(a.text)));

  const drop = [...[30, 32, 35, 37, 40, 42, 45, 47, 50, 52].map(n => session(n, [set('Barbell Back Squat')])), session(3, [set('Barbell Back Squat')])];
  const { rhythm, actions } = buildInsights(drop, {}, { today });
  assert.equal(rhythm.weeks.length, 8);
  assert.ok(rhythm.recent < rhythm.prior);
  assert.ok(actions.some(a => a.kind === 'consistency'));
  assert.equal(buildInsights([], {}, { today }), null);
});

test('home progress carries insights, the public share snapshot never does, and names are escaped', () => {
  const sessions = [session(2, [set('Barbell Back Squat')]), session(9, [set('Barbell Back Squat')])];
  assert.ok(buildProgress(sessions, [], { today, insights: true }).insights);
  assert.equal(buildProgress(sessions, [], { today }).insights, undefined);
  assert.equal(buildSharedProgress(sessions, [], {}, new Date(`${today}T20:00:00Z`)).insights, undefined);
  const html = renderInsights({ actions: [{ kind: 'low', severity: 2, text: '<img src=x>' }], muscles: [], lifts: [{ name: '<b>', status: 'new', value: 100, best: 100, sessions: 1, change: null, fromBest: 0 }],
    balance: { ratio: null }, rir: { counts: {}, rated: 0, total: 0 }, rhythm: { weeks: [0, 0, 0, 0, 0, 0, 0, 1], recent: 0.3, prior: 0 } });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /What to change next/);
});

test('several low muscles collapse into one action and imbalance outranks them', () => {
  const sessions = [1, 5, 9, 13, 17, 21, 25].map(n => session(n, [
    ...Array(3).fill(set('Barbell Bench Press')), set('Barbell Back Squat'), set('Barbell RDL'), set('Lat Pulldown'),
  ]));
  const { actions } = buildInsights(sessions, {}, { today });
  assert.equal(actions.filter(a => a.kind === 'low').length, 1);
  assert.match(actions.find(a => a.kind === 'low').text, /muscles are below their weekly target/);
  assert.ok(actions.findIndex(a => a.kind === 'balance') < actions.findIndex(a => a.kind === 'low'));
});

test('time per set and exercise comes from gaps between logged sets', () => {
  const at = (n, min) => `${daysAgo(n)}T18:${String(min).padStart(2, '0')}:00Z`;
  const timed = (n, rows) => ({ ...session(n, rows.map(([ex, min]) => ({ ...set(ex), logged_at: at(n, min) }))),
    started_at: at(n, 0), finished_at: at(n, 30) });
  const sessions = [
    timed(3, [['Barbell Back Squat', 3], ['Barbell Back Squat', 6], ['Barbell Back Squat', 9], ['Lat Pulldown', 11], ['Lat Pulldown', 13]]),
    timed(40, [['Barbell Back Squat', 4], ['Barbell Back Squat', 8]]),
  ];
  const { pace } = buildInsights(sessions, {}, { today });
  const squat = pace.exercises.find(ex => ex.name === 'Barbell Back Squat');
  assert.equal(squat.perSet, 180);
  assert.equal(squat.perSetBefore, 240);
  assert.equal(squat.perWorkout, 540);
  assert.equal(pace.exercises.find(ex => ex.name === 'Lat Pulldown').perSet, 120);
  assert.deepEqual(pace.workouts.map(w => w.minutes), [30, 30]);
  const html = renderInsights(buildInsights(sessions, {}, { today }));
  assert.match(html, /Time per set and exercise/);
  assert.match(html, /3:00/);
  assert.match(html, /−60s/);
});
