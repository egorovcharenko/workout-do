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
import { applySuggestedLoad } from '../lib/legacy/load-guidance.js';

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

test('lighter bench sets retain the previous reps within the range instead of resetting to six', () => {
  const name = 'Barbell Bench Press';
  const past = session('past', 'Squat Focus', '2026-09-05', [row(name, 2, 145, 8)]);
  const raw = [ex(name, [set(2, 135, { targetRepRange: [6, 8] })], { repRange: '6-8' })];
  const before = JSON.stringify({ raw, past });
  const guided = withRepGuidance(raw, [past], options)[0];
  const guidance = guided.sets[0].repGuidance;
  assert.equal(guidance.previous.label, '145 lb × 8');
  assert.equal(guidance.previous.comparable, false, 'The different load must remain visible');
  assert.equal(guidance.previous.loadDelta, -10);
  assert.equal(guidance.suggested, 8);
  assert.equal(JSON.stringify({ raw, past }), before, 'Do not change the load, history or logged reps');
  const html = renderToStaticMarkup(React.createElement(ActiveSetBlock, { exercise: guided, set: guided.sets[0] }));
  assert.match(html, /Last <strong>145 lb × 8<\/strong>/);
  assert.match(html, /Suggested <strong>8<\/strong>/);
  assert.match(html, /Log 8 reps \(suggested\) \(last workout\)/);
  assert.doesNotMatch(html, /Log 6 reps \(suggested\)/);
});

test('lighter-load guidance respects exact prescriptions, warm-ups, deloads, variation changes and heavier loads', () => {
  const previous = { reps: 8, comparable: false, sameVariation: true, loadDelta: -10 };
  assert.equal(repSuggestion({ previous, range: [6, 8] }), 8);
  assert.equal(repSuggestion({ previous: { ...previous, reps: 7 }, range: [6, 8] }), 7, 'Do not extrapolate extra reps from a different weight');
  assert.equal(repSuggestion({ previous: { ...previous, reps: 12 }, range: [6, 8] }), 8);
  assert.equal(repSuggestion({ previous: { ...previous, reps: 3 }, range: [6, 8] }), 6);
  assert.equal(repSuggestion({ previous, range: [6, 8], deload: true }), 6);
  assert.equal(repSuggestion({ previous, range: [2, 2], target: 2, warmup: true }), 2);
  assert.equal(repSuggestion({ previous: { ...previous, sameVariation: false }, range: [6, 8] }), 6);
  assert.equal(repSuggestion({ previous: { ...previous, loadDelta: 5 }, range: [6, 8] }), 6);
  const name = 'Barbell Bench Press';
  const raw = [ex(name, [set(2, 135, { targetRepRange: [6, 8], planTargetReps: 6 })])];
  const past = session('past', 'Squat Focus', '2026-09-05', [row(name, 2, 145, 8)]);
  assert.equal(withRepGuidance(raw, [past], options)[0].sets[0].repGuidance.suggested, 6);
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

test('block pull-ups use an effort target on every set, including resumed sets with the old three-rep target', () => {
  const name = 'Pull-Ups';
  const historyRows = [7, 6, 5, 4].map((reps, i) => row(name, i + 1, 0, reps, { grip: 'pullup', load_type: 'belt' }));
  const past = session('previous-a', 'Strength A', '2026-09-06', historyRows, { state_json: JSON.stringify({ trainingBlock: block }) });
  const raw = [ex(name, [1, 2, 3, 4].map(i => set(i, 0, { grip: 'pullup', targetRepRange: [3, 3] })), { beltLoad: true, repsOnly: true })];
  const before = JSON.stringify({ raw, past });
  for (const id of ['strength-a', 'strength-b']) {
    for (const history of [[], [past]]) {
      const currentWorkout = shared.BLOCK_WORKOUTS.find(w => w.id === id);
      const guided = withRepGuidance(raw, history, { ...options, workout: currentWorkout, date: '2026-09-12' })[0];
      assert.deepEqual(guided.sets.map(s => s.repGuidance.rirLabel), ['1–2', '1–2', '1–2', '1–2']);
      assert.ok(guided.sets.every(s => s.repGuidance.range == null && s.repGuidance.rangeLabel == null && s.repGuidance.suggested == null));
      assert.ok(guided.sets.every(s => s.reps == null));
    }
  }
  const guided = withRepGuidance(raw, [past], { ...options, date: '2026-09-12' })[0];
  assert.deepEqual(guided.sets.map(s => s.repGuidance.previous.reps), [7, 6, 5, 4]);
  assert.equal(JSON.stringify({ raw, past }), before);
  assert.equal(shared.parseRepTargetRange('1–2 RIR'), null, 'RIR is never a one-to-two rep range');
  assert.equal(shared.parseRepTargetRange('RIR 1–2'), null);
  assert.deepEqual(shared.parseRepTargetRange('6–8 reps @ 1–2 RIR'), [6, 8], 'A combined rep and effort prescription keeps its rep range');
  assert.equal(withRepGuidance(raw, [past], { ...options, block: null })[0].sets[0].repGuidance.rirLabel, null, 'The original program is unchanged');
  raw[0].sets[0].planTargetReps = 5;
  const planned = withRepGuidance(raw, [past], options)[0].sets[0].repGuidance;
  assert.equal(planned.rirLabel, null);
  assert.equal(planned.suggested, 5, 'An explicit per-set prescription takes precedence');
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
const { SetChip } = loadComponent('../components/session/NavChip.jsx', {
  '@/lib/legacy/nav-set-display': { navSetDisplay },
});
const empty = () => null;
const loadProgression = loadComponent('../components/session/LoadProgression.jsx');
const { ActiveSetBlock } = loadComponent('../components/session/ActiveSetBlock.jsx', {
  './LoadProgression': loadProgression,
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

test('pull-up cards, navigation and picker show target RIR without suggesting or logging a rep count', () => {
  const name = 'Pull-Ups';
  const past = session('past', 'Squat Focus', '2026-09-05', [row(name, 1, 0, 7, { load_type: 'belt', grip: 'pullup' })]);
  const raw = [ex(name, [set(1, 0, { grip: 'pullup', active: true, targetRepRange: [3, 3] })], { beltLoad: true, repsOnly: true })];
  const guided = withRepGuidance(raw, [past], options)[0];
  const current = guided.sets[0];
  const chosen = [];
  const html = renderToStaticMarkup(React.createElement(ActiveSetBlock, { exercise: guided, set: current, onLogReps: n => chosen.push(n) }));
  assert.match(html, /Target <strong>1–2 RIR<\/strong>/);
  assert.match(html, /Last <strong>7<\/strong>/);
  assert.match(html, /Log 7 reps \(last workout\)/);
  assert.doesNotMatch(html, /Suggested|data-suggested/);
  const card = renderToStaticMarkup(React.createElement(SetCard, { s: current, idx: 0, exercise: guided }));
  assert.match(card, /1–2 RIR/);
  assert.match(card, /TARGET/);
  assert.doesNotMatch(card, /Suggested|>3</);
  const chip = renderToStaticMarkup(React.createElement(SetChip, { d: navSetDisplay(current, guided), k: 0 }));
  assert.match(chip, /1–2 RIR/);
  assert.equal(navSetDisplay(current, guided).reps, null);
  assert.deepEqual(chosen, [], 'Displaying an effort target does not record an effort or reps');
  reps.RepCell({ n: 9, onClick: () => chosen.push(9) }).props.onClick();
  assert.deepEqual(chosen, [9]);
  current.completed = true; current.reps = 9;
  const logged = navSetDisplay(current, guided);
  assert.equal(logged.reps, 9);
  assert.equal(logged.rirLabel, undefined);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(SetCard, { s: current, idx: 0, exercise: guided })), /1–2 RIR/);
  current.completed = false; current.reps = null; current.weight = 10;
  const weighted = renderToStaticMarkup(React.createElement(SetChip, { d: navSetDisplay(current, guided), k: 0 }));
  assert.match(weighted, /\+10 · .*1–2 RIR/);
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

const bench = 'Barbell Bench Press';
function blockExercise(name = squat, id = 'strength-a') {
  const config = shared.BLOCK_WORKOUTS.find(w => w.id === id).exercises.find(e => e.name === name);
  return ex(name, config.defaultWork.map((weight, i) => set(i + 1, weight, { targetRepRange: config.workRepRanges[i] })), { isBarbell: true });
}
const appearance = (id, date, sets, extra = {}) => session(id, 'Strength A', date, sets, { state_json: JSON.stringify({ trainingBlock: block }), ...extra });
const cappedSquat = () => [row(squat, 1, 135, 8), row(squat, 2, 115, 10), row(squat, 3, 115, 10)];
const twoAppearances = () => [appearance('a2', '2026-09-12', cappedSquat()), appearance('a1', '2026-09-06', cappedSquat())];
const nextOptions = { ...options, date: '2026-09-18' };

test('load progression offers 140 × 5 after two qualifying main sets, independently of back-offs', () => {
  const history = twoAppearances();
  history[0].sets[2].reps = '9';
  const raw = [blockExercise()];
  const before = JSON.stringify({ raw, history });
  const guided = withRepGuidance(raw, history, nextOptions)[0];
  const main = guided.sets[0].repGuidance;
  assert.equal(main.loadProgression.ready, true);
  assert.equal(main.loadProgression.weight, 140);
  assert.equal(main.loadProgression.reps, 5);
  assert.equal(main.suggested, 8, 'The current load still targets eight until the increase is accepted');
  assert.equal(guided.sets[1].repGuidance.loadProgression.ready, false);
  assert.equal(guided.sets[2].repGuidance.loadProgression.qualifying, 0);
  assert.equal(JSON.stringify({ raw, history }), before);
});

test('a consecutive two-workout streak requires every matching set, load and variation', () => {
  const raw = [blockExercise()];
  assert.equal(withRepGuidance(raw, twoAppearances().slice(0, 1), nextOptions)[0].sets[0].repGuidance.loadProgression.qualifying, 1);
  const mutations = [
    s => { s.sets[0].reps = '7'; }, s => { s.sets.shift(); },
    s => { s.sets[0].weight_lb = 125; }, s => { s.sets[0].grip = 'other'; },
    s => { s.sets.push({ ...s.sets[0] }); }, s => { s.is_deload = true; },
    s => { s.state_json = JSON.stringify({ trainingBlock: block, setsMap: { [squat]: [{ kind: 'work', setNumber: 1, userSkipped: true }] } }); },
  ];
  for (const mutate of mutations) {
    const history = twoAppearances();
    mutate(history[0]);
    history.push(appearance('even-older', '2026-09-05', cappedSquat()));
    assert.equal(withRepGuidance(raw, history, nextOptions)[0].sets[0].repGuidance.loadProgression.qualifying, 0, 'Never search past a missed target for an older success');
  }
});

test('weight offers compare the same block and A/B workout, never old-program, future, current or unfinished logs', () => {
  const excluded = [
    appearance('regular', '2026-09-05', cappedSquat(), { workout_name: 'Squat Focus', state_json: '{}' }),
    appearance('b', '2026-09-09', cappedSquat(), { workout_name: 'Strength B' }),
    appearance('old-block', '2026-09-10', cappedSquat(), { state_json: JSON.stringify({ trainingBlock: { ...block, instanceId: 'old' } }) }),
    appearance('future', '2026-09-19', cappedSquat()), appearance('today', '2026-09-18', cappedSquat()),
    appearance('unfinished', '2026-09-17', cappedSquat(), { finished_at: null }),
  ];
  const guided = withRepGuidance([blockExercise()], [...excluded, twoAppearances()[0]], nextOptions)[0];
  assert.equal(guided.sets[0].repGuidance.loadProgression.qualifying, 1);
  assert.equal(guided.sets[0].repGuidance.loadProgression.ready, false);
});

test('accepting a load updates the entire pending group without logging, changing other groups or repeating the increase', () => {
  const raw = [blockExercise()];
  raw[0].sets.unshift(set(0, 45, { kind: 'warmup', reps: 8, completed: true }));
  const guided = withRepGuidance(raw, twoAppearances(), nextOptions);
  guided[0].sets[1].reps = 8;
  guided[0].sets[1].completed = true;
  guided[0].sets[2].barPlates = [35];
  const before = JSON.stringify(guided);
  const next = applySuggestedLoad(guided, 0, 3);
  assert.deepEqual(next[0].sets.map(s => s.weight), [45, 135, 120, 120]);
  assert.deepEqual(next[0].sets.map(s => s.reps), [8, 8, null, null]);
  assert.strictEqual(next[0].sets[0], guided[0].sets[0]);
  assert.strictEqual(next[0].sets[1], guided[0].sets[1]);
  assert.equal(next[0].sets[2].barPlates, undefined);
  assert.equal(JSON.stringify(guided), before);
  assert.strictEqual(applySuggestedLoad(next, 0, 3), next, 'A stale second click cannot add weight again');
  const refreshed = withRepGuidance(JSON.parse(JSON.stringify(next)), twoAppearances(), nextOptions);
  assert.equal(refreshed[0].sets[2].repGuidance.suggested, 8, 'Heavier back-offs restart at the lower end');
  assert.equal(refreshed[0].sets[2].repGuidance.loadProgression.qualifying, 0);
  const heavierMain = applySuggestedLoad(withRepGuidance(raw, twoAppearances(), nextOptions), 0, 1);
  assert.equal(withRepGuidance(heavierMain, twoAppearances(), nextOptions)[0].sets[1].repGuidance.suggested, 5);
});

test('load acceptance refuses a partially logged, reopened, skipped, removed or changed group', () => {
  for (const patch of [ { completed: true }, { reps: 8 }, { logged_at: '2026-09-18T12:01:00Z' },
    { userSkipped: true }, { weight: 120 }, { grip: 'changed' }, { planTargetReps: 6 }, { bands: [5] } ]) {
    const guided = withRepGuidance([blockExercise()], twoAppearances(), nextOptions);
    Object.assign(guided[0].sets[1], patch);
    assert.strictEqual(applySuggestedLoad(guided, 0, 2), guided);
  }
  const guided = withRepGuidance([blockExercise()], twoAppearances(), nextOptions);
  guided[0].sets.pop();
  assert.strictEqual(applySuggestedLoad(guided, 0, 1), guided);
});

test('bench adds two pounds only when every set in its program group qualifies', () => {
  const rows = [1, 2, 3].map(n => row(bench, n, 135, 8));
  const history = [appearance('a2', '2026-09-12', rows), appearance('a1', '2026-09-06', rows)];
  const guided = withRepGuidance([blockExercise(bench)], history, nextOptions);
  assert.deepEqual(applySuggestedLoad(guided, 0, 0)[0].sets.map(s => s.weight), [137, 137, 137]);
  rows[2].reps = '7';
  assert.ok(withRepGuidance([blockExercise(bench)], history, nextOptions)[0].sets.every(s => !s.repGuidance.loadProgression.ready));
  const b = shared.BLOCK_WORKOUTS.find(w => w.id === 'strength-b');
  const bRows = [row(bench, 1, 150, 5), row(bench, 2, 135, 8), row(bench, 3, 135, 7)];
  const bHistory = history.map(s => ({ ...s, workout_name: b.name, sets: bRows }));
  const bGuided = withRepGuidance([blockExercise(bench, b.id)], bHistory, { ...nextOptions, workout: b });
  assert.deepEqual(applySuggestedLoad(bGuided, 0, 0)[0].sets.map(s => s.weight), [152, 135, 135]);
});

test('easy B squats have their own two-appearance effort condition; fixed accessories, plans and deloads do not receive offers', () => {
  const b = shared.BLOCK_WORKOUTS.find(w => w.id === 'strength-b');
  const bHistory = twoAppearances().map(s => ({ ...s, workout_name: b.name, sets: [row(squat, 1, 115, 6), row(squat, 2, 115, 6)] }));
  const guided = withRepGuidance([blockExercise(squat, b.id)], bHistory, { ...nextOptions, workout: b });
  assert.equal(guided[0].sets[0].repGuidance.loadProgression.practice, true);
  assert.deepEqual(applySuggestedLoad(guided, 0, 1)[0].sets.map(s => s.weight), [120, 120]);
  const rdl = withRepGuidance([blockExercise('Barbell RDL', b.id)], bHistory, { ...nextOptions, workout: b });
  assert.equal(rdl[0].sets[0].repGuidance.loadProgression, undefined);
  for (const overrides of [{ deload: true }, { skipped: true }]) {
    const raw = [Object.assign(blockExercise(), overrides)];
    assert.equal(withRepGuidance(raw, twoAppearances(), nextOptions)[0].sets[0].repGuidance.loadProgression, undefined);
  }
  const plan = blockExercise(); plan.sets[0].planTargetReps = 5;
  assert.equal(withRepGuidance([plan], twoAppearances(), nextOptions)[0].sets[0].repGuidance.loadProgression, null);
  const regular = withRepGuidance([blockExercise()], twoAppearances(), { ...nextOptions, block: null });
  assert.equal(regular[0].sets[0].repGuidance.loadProgression, undefined);
});

test('the weight offer makes the reserve confirmation explicit and changes weight only after the click', () => {
  const guided = withRepGuidance([blockExercise()], twoAppearances(), nextOptions);
  let next = guided;
  const offer = guided[0].sets[0].repGuidance.loadProgression;
  const onApply = () => { next = applySuggestedLoad(guided, 0, 0); };
  const html = renderToStaticMarkup(React.createElement(ActiveSetBlock, { exercise: guided[0], set: guided[0].sets[0], onApplyLoadProgression: onApply }));
  assert.match(html, /Next <strong>140 lb × 5<\/strong>/);
  assert.match(html, /1–2 reps left both times\?/);
  assert.match(html, /Confirm 1–2 reps in reserve in both workouts; use 140 lb for S1/);
  assert.match(html, /Suggested <strong>8<\/strong>/);
  assert.strictEqual(next, guided, 'Rendering must not apply the weight or assume effort');
  const tree = loadProgression.LoadProgression({ offer, onApply });
  tree.props.children[1].props.children[1].props.onClick();
  assert.equal(next[0].sets[0].weight, 140);
  assert.equal(next[0].sets[0].reps, null);
  const building = renderToStaticMarkup(React.createElement(loadProgression.LoadProgression, { offer: { ...offer, qualifying: 1, ready: false, canApply: false }, onApply }));
  assert.match(building, /1\/2 A workouts at 8 reps/);
  assert.doesNotMatch(building, /<button/);
});
