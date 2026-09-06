import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as shared from '../lib/legacy/shared.js';
import { createTrainingBlock } from '../lib/training-block.js';
import { withRepGuidance, repSuggestion } from '../lib/legacy/rep-guidance.js';
import { navSetDisplay } from '../lib/legacy/nav-set-display.js';
import { cableStackMultiplier } from '../lib/legacy/cable-stack.js';

const block = createTrainingBlock('2026-09-06', 'rep-run', '2026-09-05');
const workout = shared.BLOCK_WORKOUTS.find(w => w.id === 'strength-a');
const squat = 'Barbell Back Squat';
const set = (number, weight, extra = {}) => ({ kind: 'work', idx: number, setNumber: number, weight,
  lastReps: 5, lastWeight: weight, reps: null, bands: [], completed: false, ...extra });
const ex = (name, sets, extra = {}) => ({ name, repRange: '5-8', sets, ...extra });
const row = (name, number, weight, reps, extra = {}) => ({ exercise: name, set_type: 'working', set_number: number, weight_lb: weight, reps: String(reps), ...extra });
const session = (id, name, date, sets, extra = {}) => ({ id, workout_name: name, date, sets,
  started_at: `${date}T12:00:00Z`, finished_at: `${date}T13:00:00Z`, state_json: '{}', ...extra });
const options = { workout, block, sessionId: 'today', date: '2026-09-06' };

test('the first block workout shows real previous reps separately from the range and suggested reps', () => {
  const past = session('previous', 'Squat Focus', '2026-09-05', [row(squat, 1, 135, 8), row(squat, 2, 115, 10), row(squat, 3, 115, 9)]);
  const raw = [ex(squat, [set(1, 135, { targetRepRange: [5, 8] }), set(2, 115, { targetRepRange: [8, 10] }), set(3, 115, { targetRepRange: [8, 10] })])];
  const before = JSON.stringify(raw);
  const guided = withRepGuidance(raw, [past], options)[0].sets;
  assert.deepEqual(guided.map(s => s.repGuidance.previous.reps), [8, 10, 9]);
  assert.deepEqual(guided.map(s => s.repGuidance.rangeLabel), ['5–8', '8–10', '8–10']);
  assert.deepEqual(guided.map(s => s.repGuidance.suggested), [8, 10, 10]);
  assert.equal(JSON.stringify(raw), before, 'Guidance must not alter targets, weights, or logged data');
  assert.equal(navSetDisplay(guided[0], raw[0]).reps, '5–8');
});

test('suggestions add one only at comparable load and variation; capped ranges and exact targets remain intact', () => {
  assert.equal(repSuggestion({ previous: { reps: 6, comparable: true }, range: [5, 8] }), 7);
  assert.equal(repSuggestion({ previous: { reps: 8, comparable: true }, range: [5, 8] }), 8);
  assert.equal(repSuggestion({ previous: { reps: 3, comparable: true }, range: [5, 8] }), 5);
  assert.equal(repSuggestion({ previous: { reps: 12, comparable: false }, range: [5, 8] }), 5);
  assert.equal(repSuggestion({ previous: { reps: 8, comparable: true }, range: [8, 8], warmup: true }), 8);
  assert.equal(repSuggestion({ previous: { reps: 8, comparable: true }, range: [5, 8], deload: true }), 5);
  assert.equal(repSuggestion({ previous: { reps: 20, comparable: true } }), 21);
  const past = session('past', 'Squat Focus', '2026-09-05', [row(squat, 1, 135, 8)]);
  const raw = [ex(squat, [set(1, 140, { targetRepRange: [5, 8] })])];
  let result = withRepGuidance(raw, [past], options)[0].sets[0].repGuidance;
  assert.equal(result.previous.label, '135 lb × 8');
  assert.equal(result.previous.comparable, false);
  assert.equal(result.suggested, 5);
  raw[0].sets[0].weight = 135;
  result = withRepGuidance(raw, [past], options)[0].sets[0].repGuidance;
  assert.equal(result.suggested, 8, 'Changing the picker weight recalculates the suggestion');
  raw[0].sets[0].planTargetReps = 4;
  assert.equal(withRepGuidance(raw, [past], options)[0].sets[0].repGuidance.suggested, 4);
});

test('missing history never turns a template default or another set into a previous result', () => {
  const raw = [ex(squat, [set(1, 135), set(2, 115)])];
  const past = session('past', 'Squat Focus', '2026-09-05', [row(squat, 1, 135, 7)]);
  const result = withRepGuidance(raw, [past], options)[0].sets;
  assert.equal(result[0].repGuidance.previous.reps, 7);
  assert.equal(result[1].repGuidance.previous, null);
  assert.equal(withRepGuidance(raw, [], options)[0].sets[0].repGuidance.previous, null);
});

test('current, unfinished and future sessions are excluded; repeat A does not inherit B or an older block run', () => {
  const rows = [
    session('old', 'Squat Focus', '2026-09-05', [row(squat, 1, 135, 8)]),
    session('a', 'Strength A', '2026-09-06', [row(squat, 1, 135, 6)], { state_json: JSON.stringify({ trainingBlock: block }) }),
    session('b', 'Strength B', '2026-09-09', [row(squat, 1, 115, 6)], { state_json: JSON.stringify({ trainingBlock: block }) }),
    session('older-run', 'Strength A', '2026-09-10', [row(squat, 1, 135, 15)], { state_json: JSON.stringify({ trainingBlock: { ...block, instanceId: 'older' } }) }),
    session('unfinished', 'Strength A', '2026-09-11', [row(squat, 1, 135, 11)], { finished_at: null }),
    session('today', 'Strength A', '2026-09-12', [row(squat, 1, 135, 5)], { state_json: JSON.stringify({ trainingBlock: block }) }),
    session('future', 'Strength A', '2026-09-18', [row(squat, 1, 135, 8)], { state_json: JSON.stringify({ trainingBlock: block }) }),
  ];
  const raw = [ex(squat, [set(1, 135, { reps: 5, completed: true, logged_at: '2026-09-12T12:10:00Z', targetRepRange: [5, 8] })])];
  const guided = withRepGuidance(raw, rows, { ...options, date: '2026-09-12', startedAt: Date.parse('2026-09-12T12:00:00Z') })[0].sets[0];
  assert.equal(guided.repGuidance.previous.reps, 6);
  assert.equal(guided.repGuidance.suggested, 7);
  assert.equal(guided.reps, 5);
  assert.equal(guided.completed, true);
  assert.equal(guided.logged_at, raw[0].sets[0].logged_at);
  const normal = withRepGuidance(raw, rows, { ...options, date: '2026-10-04', block: null })[0].sets[0];
  assert.equal(normal.repGuidance.previous.reps, 8);
});

test('band assistance and different dragon-fly stages do not trigger last-plus-one suggestions', () => {
  const past = session('past', 'Dips Focus', '2026-09-05', [
    row('Dips', 1, 145, 10, { bands_json: '[20]' }),
    row('Dragon Fly Progression', 1, 165, 8, { grip: 'tuck' }),
  ]);
  const raw = [ex('Dips', [set(1, 0)], { beltLoad: true, repsOnly: true }),
    ex('Dragon Fly Progression', [set(1, 0, { grip: 'straddle' })], { stages: shared.DRAGONFLY_STAGES, assist: true })];
  const result = withRepGuidance(raw, [past], { ...options, block: null });
  for (const exercise of result) {
    assert.equal(exercise.sets[0].repGuidance.previous.comparable, false);
    assert.equal(exercise.sets[0].repGuidance.suggested, 5);
  }
});

test('the block adds one total pull-up rep, rather than one on every set or capping progress at three', () => {
  const name = 'Pull-Ups';
  const historyRows = [3, 3, 3, 3].map((reps, i) => row(name, i + 1, 0, reps, { grip: 'pullup', load_type: 'belt' }));
  const past = session('previous-a', 'Strength A', '2026-09-06', historyRows, { state_json: JSON.stringify({ trainingBlock: block }) });
  const raw = [ex(name, [1, 2, 3, 4].map(i => set(i, 0, { grip: 'pullup', targetRepRange: [3, 3] })), { beltLoad: true, repsOnly: true })];
  const suggestion = () => withRepGuidance(raw, [past], { ...options, date: '2026-09-12' })[0].sets.map(s => s.repGuidance.suggested);
  assert.deepEqual(suggestion(), [4, 3, 3, 3]);
  historyRows[0].reps = '4';
  assert.deepEqual(suggestion(), [4, 4, 3, 3]);
});

function loadComponent(path, dependencies) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: id => {
    const deps = { react: React, 'react/jsx-runtime': jsxRuntime, '@/lib/legacy/shared': shared, ...dependencies };
    assert.ok(id in deps, `Unexpected dependency ${id}`);
    return deps[id];
  } });
  return exports;
}

const reps = loadComponent('../components/session/RepStrip.jsx');
const { SetCard } = loadComponent('../components/session/SetCard.jsx', {
  '@/lib/legacy/cable-stack': { cableStackMultiplier }, '@/lib/legacy/session-utils': { fmtSetDuration: () => '' },
});
const empty = () => null;
const { ActiveSetBlock } = loadComponent('../components/session/ActiveSetBlock.jsx', {
  './Stepper': { GripSelector: empty, BandsGrid: empty }, './StageSelector': { StageSelector: empty }, './RepStrip': reps,
  './BarbellVisualizer': { BarbellVisualizer: empty }, './CableStackVisualizer': { CableStackVisualizer: empty },
  './WeightSelection': { EquipmentWeightSelector: empty }, './BeltPlateVisualizer': { BeltPlateVisualizer: empty },
  '@/lib/legacy/cable-stack': { isCableStackExercise: () => false },
});

test('set cards and the rep picker render distinct previous, target and suggested values without logging anything', () => {
  const guided = withRepGuidance([ex(squat, [set(1, 135, { active: true, targetRepRange: [5, 8] })])],
    [session('past', 'Squat Focus', '2026-09-05', [row(squat, 1, 135, 6)])], options)[0];
  const chosen = [];
  const html = renderToStaticMarkup(React.createElement(ActiveSetBlock, { exercise: guided, set: guided.sets[0], onLogReps: n => chosen.push(n) }));
  assert.match(html, /Last <strong>6<\/strong>/);
  assert.match(html, /Target <strong>5–8<\/strong>/);
  assert.match(html, /Suggested <strong>7<\/strong>/);
  assert.match(html, /aria-label="Log 7 reps \(suggested\)" data-suggested="true"/);
  assert.match(html, /aria-label="Log 6 reps \(last workout\)" data-last="true"/);
  assert.equal((html.match(/aria-label="Log /g) || []).length, 20);
  const card = renderToStaticMarkup(React.createElement(SetCard, { s: guided.sets[0], idx: 0, exercise: guided }));
  assert.match(card, /TARGET/);
  assert.match(card, /Suggested <strong>7<\/strong>/);
  assert.doesNotMatch(card, />Last .*?>5<\/strong>/);
  assert.deepEqual(chosen, []);
  const button = reps.RepCell({ n: 8, isSuggested: false, onClick: () => chosen.push(8) });
  button.props.onClick();
  assert.deepEqual(chosen, [8], 'The athlete can still log a different number');
});

test('when last and suggested coincide, both markers remain and reps beyond twenty stay accessible', () => {
  const html = renderToStaticMarkup(React.createElement(reps.RepStrip, { last: 8, suggested: 8, range: [5, 8], onLog: () => {} }));
  assert.match(html, /Log 8 reps \(suggested\) \(last workout\)/);
  assert.match(html, /data-suggested="true" data-last="true"/);
  const exercise = ex('Example', [set(1, 20, { repGuidance: { previous: { reps: 20, comparable: true }, suggested: 21 } })]);
  const expanded = renderToStaticMarkup(React.createElement(ActiveSetBlock, { exercise, set: exercise.sets[0] }));
  assert.match(expanded, /Log 21 reps \(suggested\)/);
});

test('completed set cards keep real weight changes and never invent a delta from defaults', () => {
  const raw = [ex(squat, [set(1, 140, { completed: true, reps: 5, lastWeight: 140 })])];
  const past = session('past', 'Squat Focus', '2026-09-05', [row(squat, 1, 135, 8)]);
  const guided = withRepGuidance(raw, [past], options)[0];
  const card = renderToStaticMarkup(React.createElement(SetCard, { s: guided.sets[0], idx: 0, exercise: guided }));
  assert.match(card, />\+5</);
  assert.match(card, /135 lb × 8/);
  assert.equal(navSetDisplay(guided.sets[0], guided).reps, 5);
});
