import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as recap from '../lib/legacy/workout-recap.js';

const logged = (weight, reps, extra = {}) => ({ kind: 'work', weight, reps, completed: true, ...extra });
const exercise = (name, sets, extra = {}) => ({ name, sets, ...extra });

test('recap uses logged working sets and actual reps, with warm-ups counted separately', () => {
  const exercises = [exercise('Squat', [
    logged(45, 10, { kind: 'warmup' }), logged(95, 3, { kind: 'warmup' }),
    logged(135, 8), logged(135, '7'), logged(125, 10), logged(135, 6),
    logged(145, null, { completed: false, lastReps: 12, repGuidance: { suggested: 9 } }),
    logged(145, 5, { userSkipped: true }), logged(145, 0), logged(145, '5–8'),
  ])];
  const before = JSON.stringify(exercises);
  const result = recap.buildWorkoutRecap(exercises);
  assert.equal(result.workingSets, 4);
  assert.equal(result.reps, 31);
  assert.equal(result.warmupSets, 2);
  assert.deepEqual(result.exercises[0].groups, [
    { load: '135 lb', reps: [8, 7] }, { load: '125 lb', reps: [10] }, { load: '135 lb', reps: [6] },
  ], 'A return to a previous weight retains its position in the workout');
  assert.equal(JSON.stringify(exercises), before, 'Summarizing must not modify workout data');
});

test('skipping the remainder of an exercise retains work already completed', () => {
  const result = recap.buildWorkoutRecap([
    exercise('Bench', [logged(135, 8), logged(135, null, { completed: false })], { skipped: true }),
    exercise('Row', [logged(60, null, { completed: false })], { skipped: true }),
    exercise('Squat', [logged(45, 10, { kind: 'warmup' })]),
  ]);
  assert.equal(result.workingSets, 1);
  assert.equal(result.warmupSets, 1);
  assert.deepEqual(result.exercises.map(item => item.name), ['Bench', 'Squat']);
  assert.deepEqual(result.exercises[1].groups, []);
  assert.deepEqual(recap.buildWorkoutRecap(), { exercises: [], workingSets: 0, warmupSets: 0, reps: 0 });
});

test('load labels distinguish bodyweight, belt, cable stacks, bands and progression stages', () => {
  const label = (flags, set) => recap.recapLoadLabel({ name: 'Exercise', ...flags }, set);
  assert.equal(label({ beltLoad: true, repsOnly: true }, logged(15, 5)), 'BW + 15 lb');
  assert.equal(label({ beltLoad: true, repsOnly: true }, logged(0, 5)), 'BW');
  assert.equal(label({ repsOnly: true }, logged(165, 10)), 'BW');
  assert.equal(label({ assist: true }, logged(165, 5, { bodyweight: 165, bands: [20, 10] })), 'BW · 30 lb assistance');
  assert.equal(label({ assist: true }, logged(165, 5)), 'BW');
  assert.equal(label({ name: 'Low Row' }, logged(62.5, 12)), '62.5 lb / stack × 2');
  assert.equal(label({ isBandsOnly: true }, logged(0, 10, { bands: [15, 10] })), '25 lb band');
  assert.equal(label({ bandAddon: true }, logged(45, 10, { bands: [20] })), '45 lb + 20 lb band');
  assert.equal(label({ assist: true, stages: [{ id: 'tuck', label: 'Tuck' }] }, logged(165, 5, { grip: 'tuck' })), 'Tuck');
  assert.equal(label({ assist: true, stages: [{ id: 'tuck', label: 'Tuck' }] }, logged(165, 5, { grip: 'tuck', bands: [10] })), 'Tuck · 10 lb assistance');
});

test('recap date stays on the workout calendar date and duration handles hours', () => {
  assert.equal(recap.recapDate('2026-09-06'), 'Sep 6, 2026');
  assert.equal(recap.recapDuration(58), '58 sec');
  assert.equal(recap.recapDuration(59 * 60 + 58), '59 min');
  assert.equal(recap.recapDuration(65 * 60), '1h 5m');
  assert.equal(recap.recapDuration(null), '0 sec');
});

test('home selects the latest completed workout, retaining older imports and excluding live or empty sessions', () => {
  const row = { exercise: 'Barbell Bench Press', weight_lb: 135, reps: '8', set_type: 'working' };
  const earlier = { id: 'earlier', date: '2026-09-06', finished_at: '2026-09-06T16:00:00Z', sets: [row] };
  const latest = { id: 'latest', date: '2026-09-06', finished_at: '2026-09-06T18:00:00Z', sets: [row] };
  const live = { id: 'live', date: '2026-09-06', started_at: '2026-09-06T20:00:00Z', sets: [row] };
  const imported = { id: 'imported', date: '2026-09-05', sets: [row] };
  const empty = { id: 'empty', date: '2026-09-06', finished_at: '2026-09-06T21:00:00Z', sets: [] };
  const history = [live, earlier, empty, imported, latest];
  const before = JSON.stringify(history);
  assert.equal(recap.latestCompletedWorkout(history, [live], '2026-09-06'), latest);
  assert.equal(recap.latestCompletedWorkout([live, imported], [live], '2026-09-06'), imported);
  assert.equal(recap.latestCompletedWorkout([live, empty], [live], '2026-09-06'), null);
  const allLogged = { ...live, state_json: JSON.stringify({ setsMap: { Bench: [{ completed: true }] } }) };
  assert.equal(recap.latestCompletedWorkout([earlier, allLogged], [], '2026-09-06'), allLogged);
  assert.equal(JSON.stringify(history), before);
});

test('persisted recap uses saved rows, not suggested values in the session map', () => {
  const session = { date: '2026-09-06', cable_weight_mode: 'per_stack', state_json: JSON.stringify({
    setsMap: { 'Barbell Bench Press': [{ weight: 145, reps: 12, completed: false }] },
  }), sets: [
    { exercise: 'Barbell Bench Press', set_type: 'warmup', weight_lb: 45, reps: '10' },
    { exercise: 'Barbell Bench Press', set_type: 'working', weight_lb: 135, reps: '8' },
    { exercise: 'Barbell Bench Press', set_type: 'working', weight_lb: 135, reps: '7' },
    { exercise: 'Pull-Ups', set_type: 'working', weight_lb: 15, load_type: 'belt', reps: '6' },
    { exercise: 'Low Row', set_type: 'working', weight_lb: 60, reps: '12' },
  ] };
  const before = JSON.stringify(session);
  const result = recap.buildStoredWorkoutRecap(session);
  assert.equal(result.workingSets, 4);
  assert.equal(result.warmupSets, 1);
  assert.equal(result.reps, 33);
  assert.deepEqual(result.exercises.map(ex => ex.groups), [
    [{ load: '135 lb', reps: [8, 7] }], [{ load: 'BW + 15 lb', reps: [6] }], [{ load: '60 lb / stack × 2', reps: [12] }],
  ]);
  assert.equal(JSON.stringify(session), before);
});

test('historical load conversion preserves old cable totals, bodyweight, assistance and band add-ons', () => {
  const session = { date: '2026-07-01', sets: [
    { exercise: 'Low Row', weight_lb: 120, reps: '10' },
    { exercise: 'Pull-Ups', weight_lb: 165, reps: '7' },
    { exercise: 'Pull-Ups', weight_lb: 135, bands_json: '[30]', reps: '8' },
    { exercise: 'Goblet Squat', weight_lb: 65, bands_json: '[20]', reps: '10' },
    { exercise: 'Band Row', weight_lb: 30, bands_json: '[20,10]', reps: '12' },
    { exercise: 'Dead Hang + Scap Pulls', weight_lb: 165, bands_json: 'broken', reps: '8' },
  ] };
  assert.deepEqual(recap.buildStoredWorkoutRecap(session).exercises.map(ex => ex.groups.map(group => group.load)), [
    ['60 lb / stack × 2'], ['BW', 'BW · 30 lb assistance'], ['45 lb + 20 lb band'], ['30 lb band'], ['BW'],
  ]);
});

function loadComponent(path, react = React) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const dependencies = { react, 'react/jsx-runtime': jsxRuntime,
    '@/lib/legacy/workout-recap': recap, './StrengthLevelUpload': { StrengthLevelUpload: () => null } };
  vm.runInNewContext(compiled, { exports, console: { error() {} }, require(id) {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return exports;
}

const { WorkoutCompleteScreen } = loadComponent('../components/session/WorkoutCompleteScreen.jsx');
const props = { workoutName: 'Strength A', elapsedSec: 3240, sessionDate: '2026-09-06', exercises: [
  exercise('Barbell Back Squat', [logged(45, 10, { kind: 'warmup' }), logged(135, 8), logged(135, 7)]),
  exercise('Pull-Ups', [logged(0, 7), logged(0, 6)], { beltLoad: true, repsOnly: true }),
], onReview() {}, onFinish() {} };

test('screenshot card shows the workout and actual sets with controls outside its boundary', () => {
  const html = renderToStaticMarkup(React.createElement(WorkoutCompleteScreen, props));
  const card = html.match(/<article\b[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);
  assert.match(card, /Strength A/);
  assert.match(card, /Sep 6, 2026/);
  assert.match(card, /54 min/);
  assert.match(card, /Working sets<\/dt><dd>4<\/dd>/);
  assert.match(card, /Reps<\/dt><dd>28<\/dd>/);
  assert.match(card, /Barbell Back Squat/);
  assert.match(card, /135 lb/);
  assert.match(card, /<strong>8 · 7<\/strong>/);
  assert.match(card, /BW/);
  assert.match(card, /<strong>7 · 6<\/strong>/);
  assert.match(card, /\+ 1 warm-up set/);
  assert.doesNotMatch(card, /<button|<input|<select|165|saved to your history|Suggested/);
  assert.match(html.slice(html.indexOf('</article>')), /Review sets/);
  assert.match(html.slice(html.indexOf('</article>')), /Finish &amp; exit/);
});

test('test mode and empty or warm-up-only sessions are represented truthfully', () => {
  const empty = renderToStaticMarkup(React.createElement(WorkoutCompleteScreen, { ...props, testMode: true, exercises: [] }));
  assert.match(empty, /Test workout · not saved/);
  assert.match(empty, /No sets logged/);
  assert.match(empty, /Working sets<\/dt><dd>0<\/dd>/);
  const warmup = renderToStaticMarkup(React.createElement(WorkoutCompleteScreen, { ...props,
    exercises: [exercise('Squat', [logged(45, 10, { kind: 'warmup' })])] }));
  assert.match(warmup, /1 warm-up set<!-- --> only|1 warm-up set only/);
  assert.match(warmup, /Reps<\/dt><dd>0<\/dd>/);
});

// Exercise hook transitions and event handlers without a browser or live data.
function harness(path, name) {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], update => {
        slots[index] = typeof update === 'function' ? update(slots[index]) : update;
        dirty = true;
      }];
    },
  };
  react.useRef = initial => react.useState(() => ({ current: initial }))[0];
  const component = loadComponent(path, react)[name];
  return input => {
    let output;
    let passes = 0;
    do {
      cursor = 0;
      dirty = false;
      output = component(input);
      assert.ok(++passes < 10, 'State updates must settle');
    } while (dirty);
    return output;
  };
}

test('completion opens automatically, freezes time through review, and resets when work resumes', () => {
  const render = harness('../components/session/useWorkoutCompletion.js', 'useWorkoutCompletion');
  const input = { isFinished: false, elapsedSec: 3000, scope: 'a:2026-09-06' };
  assert.equal(render(input).showRecap, false);
  let state = render({ ...input, isFinished: true });
  assert.equal(state.showRecap, true);
  state = render({ ...input, isFinished: true, elapsedSec: 3100 });
  assert.equal(state.elapsedSec, 3000);
  state.review();
  state = render({ ...input, isFinished: true, elapsedSec: 3200 });
  assert.equal(state.showRecap, false);
  assert.equal(state.elapsedSec, 3000);
  state.show();
  assert.equal(render({ ...input, isFinished: true }).showRecap, true);
  render({ ...input, elapsedSec: 3300 });
  state = render({ ...input, isFinished: true, elapsedSec: 3400 });
  assert.equal(state.showRecap, true);
  assert.equal(state.elapsedSec, 3400);
  state.review();
  state = render({ ...input, scope: 'b:2026-09-06', isFinished: true, elapsedSec: 1200 });
  assert.equal(state.showRecap, true);
  assert.equal(state.elapsedSec, 1200);
});

function buttons(node) {
  if (!node || typeof node !== 'object') return [];
  return [ ...(node.type === 'button' ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(buttons) ];
}

test('finish submits only once, keeps review available, and allows a retry after rejection', async () => {
  const render = harness('../components/session/WorkoutCompleteScreen.jsx', 'WorkoutCompleteScreen');
  let calls = 0;
  let reviews = 0;
  const input = { ...props, onReview() { reviews += 1; }, onFinish() {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error('offline'));
    return Promise.resolve();
  } };
  const [review, finish] = buttons(render(input));
  review.props.onClick();
  assert.equal(reviews, 1);
  finish.props.onClick();
  finish.props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  let output = render(input);
  assert.match(renderToStaticMarkup(output), /Couldn’t finish/);
  assert.equal(buttons(output)[1].props.disabled, false);
  buttons(output)[1].props.onClick();
  await new Promise(setImmediate);
  output = render(input);
  assert.equal(calls, 2);
  assert.ok(buttons(output).every(button => button.props.disabled));
});
