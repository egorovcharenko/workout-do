import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as block from '../lib/training-block.js';
import * as shared from '../lib/legacy/shared.js';
import * as duration from '../lib/legacy/duration-estimates.js';
import * as bench from '../lib/legacy/bench-progression.js';
import * as squat from '../lib/legacy/squat-progression.js';
import * as belt from '../lib/legacy/belt-load.js';
import * as logging from '../lib/legacy/set-logging.js';
import * as history from '../lib/legacy/exercise-history.js';
import * as cable from '../lib/legacy/cable-stack.js';
import { withRepGuidance } from '../lib/legacy/rep-guidance.js';
import { applySuggestedLoad } from '../lib/legacy/load-guidance.js';

function loadModule(path, dependencies) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { exports, require: id => {
    assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id];
  }, console });
  return exports;
}
const utils = loadModule('../lib/legacy/session-utils.js', {
  './shared': shared, './session-persistence': { loadBodyweight: () => 165 },
  './duration-estimates': duration, './bench-progression': bench, './squat-progression': squat,
  './belt-load': belt, './set-logging': logging, './exercise-history': history, './cable-stack': cable,
});
const plain = value => JSON.parse(JSON.stringify(value));
const getWorkout = id => shared.BLOCK_WORKOUTS.find(w => w.id === id);
const run = { ...block.createTrainingBlock('2026-09-06', 'run-one', '2026-09-05'), prescriptionRevision: 2 };
const row = (exercise, n, w, r, extra = {}) => ({ exercise, set_type: 'working', set_number: n, weight_lb: w, reps: String(r), ...extra });
const session = (name, date, sets, extra = {}) => ({ id: name + date, workout_name: name, date, sets, finished_at: date + 'T20:00:00Z', ...extra });
const work = (exercises, name) => exercises.find(e => e.name === name).sets.filter(s => s.kind === 'work');
const flatten = (workout, sessions = []) => utils.flattenTemplate(workout, {}, block.trainingBlockHints(workout, sessions, run));
const guide = (workout, sessions) => withRepGuidance(flatten(workout, sessions), sessions, { workout, block: run, date: '2026-09-25' });

test('the revised block preserves the audited full rotation without extra squat or flat-bench appearances', () => {
  const before = JSON.stringify(shared.WORKOUTS);
  const counts = shared.BLOCK_WORKOUTS.map(w => flatten(w).reduce((n, e) => n + e.sets.filter(s => s.kind === 'work').length, 0));
  assert.deepEqual(counts, [17, 20, 17, 27]);
  assert.equal(counts.reduce((a, b) => a + b), 81);
  assert.deepEqual(shared.BLOCK_WORKOUTS.filter(w => w.exercises.some(e => e.name === 'Barbell Bench Press')).map(w => w.id), ['strength-a']);
  assert.deepEqual(shared.BLOCK_WORKOUTS.filter(w => w.exercises.some(e => e.name === 'Barbell Back Squat')).map(w => w.id), ['strength-a']);
  const arms = flatten(getWorkout('strength-accessories-1'));
  assert.deepEqual(plain(arms.map(e => [e.name, e.sets.map(s => s.weight ?? null)])), [
    ['Dips', [25,25,25]], ['Bayesian Cable Curl', [20,20,20]], ['Single-Arm Cable Rear Delt Fly', [15,15,15]],
    ['Dumbbell Hammer Curls', [30,30,30]], ['Overhead Tricep Extension', [35,35,35]], ['Dragon Fly Progression', [null,null,null]],
    ['Bench-Supported Dumbbell Wrist Curls', [5,5]],
  ]);
  assert.deepEqual(plain(work(flatten(getWorkout('strength-b')), 'Barbell RDL').map(s => s.weight)), [205,205,165]);
  assert.deepEqual(plain(work(flatten(getWorkout('strength-b')), 'Low Row').map(s => s.weight)), [65,65,60]);
  assert.equal(JSON.stringify(shared.WORKOUTS), before, 'The original program and automatic return remain intact');
});

test('initial revised targets use the regular baseline and ignore the superseded reduction', () => {
  const w = getWorkout('strength-accessories-1');
  const regular = session('Dips Focus', '2026-09-01', [1,2,3].map(n => row('Dips', n, 25, 12 - n, { load_type: 'belt' })));
  const reduced = session(w.name, '2026-09-07', [row('Dips', 1, 15, 8, { load_type: 'belt' })], { state_json: JSON.stringify({ trainingBlock: { ...run, prescriptionRevision: 1 } }) });
  const rows = [reduced, regular]; const before = JSON.stringify(rows);
  assert.deepEqual(plain(work(flatten(w, rows), 'Dips').map(s => s.weight)), [25,25,25]);
  const e = guide(w, rows).find(e => e.name === 'Dips');
  assert.equal(e.sets[0].repGuidance.previous.reps, 11);
  assert.equal(e.sets[0].repGuidance.rirLabel, '1–2');
  assert.equal(e.sets[0].repGuidance.suggested, null, 'Show effort without pretending to know maximum reps');
  assert.equal(JSON.stringify(rows), before);
});

test('new revision history owns loads and user-added sets without reapplying the baseline', () => {
  const w = getWorkout('strength-accessories-1');
  const regular = session('Dips Focus', '2026-09-01', [1,2,3].map(n => row('Dips', n, 25, 10, { load_type: 'belt' })));
  const latest = session(w.name, '2026-09-13', [1,2,3,4].map(n => row('Dips', n, 27.5, 9, { load_type: 'belt' })), { state_json: JSON.stringify({ trainingBlock: run }) });
  const sets = work(flatten(w, [latest, regular]), 'Dips');
  assert.deepEqual(plain(sets.map(s => s.weight)), [27.5,27.5,27.5,27.5]);
  assert.equal(guide(w, [latest, regular]).find(e => e.name === 'Dips').sets[0].repGuidance.previous.reps, 9);
});

test('legacy pull-up opener numbering maps all four actual sets and core retains its stage', () => {
  const w = getWorkout('strength-a');
  const prev = session('Squat Focus', '2026-09-05', [5,3,3,2].map((r, n) => row('Pull-Ups', n, 0, r, { load_type: 'belt' })));
  const sets = work(guide(w, [prev]), 'Pull-Ups');
  assert.deepEqual(plain(sets.map(s => [s.weight, s.lastReps, s.repGuidance.previous.reps])), [[0,5,5],[0,3,3],[0,3,3],[0,2,2]]);
  assert.ok(sets.every(s => s.repGuidance.range == null && s.repGuidance.suggested == null));
  const core = session('Shrugs Focus', '2026-09-03', [8,8,4].map((r, n) => row('Dragon Fly Progression', n + 1, 165, r, { grip: 'single-leg' })));
  assert.deepEqual(plain(work(flatten(getWorkout('strength-accessories-2'), [core]), 'Dragon Fly Progression').map(s => s.grip)), ['single-leg','single-leg','single-leg']);
});

test('bench makes only the reviewed top-set adjustment and preserves the three back-offs', () => {
  const w = getWorkout('strength-a');
  const prev = session('Squat Focus', '2026-09-05', [160,145,145,125].map((weight, n) => row('Barbell Bench Press', n + 1, weight, [3,8,5,10][n])));
  assert.deepEqual(plain(work(flatten(w, [prev]), 'Barbell Bench Press').map(s => s.weight)), [150,145,145,125]);
  const later = session(w.name, '2026-09-12', [152,145,145,125].map((weight, n) => row('Barbell Bench Press', n + 1, weight, [4,8,6,10][n])), { state_json: JSON.stringify({ trainingBlock: run }) });
  assert.equal(work(flatten(w, [later, prev]), 'Barbell Bench Press')[0].weight, 152, 'The starting adjustment never becomes a ceiling');
});

test('cable and dumbbell accessories progress with reserve confirmation while all logged reps remain untouched', () => {
  for (const [name, id, weight, reps, expected] of [
    ['Calf Raises','strength-accessories-2',55,20,56.25],
    ['Low Row','strength-b',65,12,66.25],
    ['Incline DB Curls','strength-accessories-2',20,15,22.5],
  ]) {
    const w = getWorkout(id);
    const rows = [1,2,3].map(n => row(name,n,weight,reps));
    const sessions = ['2026-09-12','2026-09-18'].map(date => session(w.name,date,rows,{ cable_weight_mode: 'per_stack',state_json:JSON.stringify({trainingBlock:run}) })).reverse();
    const guided = guide(w, sessions); const ei = guided.findIndex(e => e.name === name); const si = guided[ei].sets.findIndex(s => s.kind === 'work');
    const offer = guided[ei].sets[si].repGuidance.loadProgression;
    assert.equal(offer.ready,true,name); assert.equal(offer.weight,expected,name); assert.equal(offer.rirLabel,'1–2');
    const accepted = applySuggestedLoad(guided,ei,si);
    assert.equal(accepted[ei].sets[si].weight,expected); assert.equal(accepted[ei].sets[si].reps,null);
    assert.equal(guided[ei].sets[si].weight,weight);
  }
});

test('a workout already started keeps its original template while the next workout receives the revision', () => {
  const w = getWorkout('strength-accessories-1');
  const oldRun = { ...run }; delete oldRun.prescriptionRevision;
  const saved = {state_json:JSON.stringify({trainingBlock:oldRun,setsMap:{Dips:[{weight:15,reps:8,completed:true}]}})};
  const before = JSON.stringify(saved);
  const resumed = block.resolveTrainingBlockSession(w,run,saved,shared.WORKOUTS);
  assert.equal(resumed.workout.exercises[0].sets,2); assert.deepEqual(resumed.block,oldRun);
  const fresh = block.resolveTrainingBlockSession(w,oldRun,null,shared.WORKOUTS);
  assert.equal(fresh.workout.exercises[0].sets,3); assert.equal(fresh.block.prescriptionRevision,2);
  assert.equal(fresh.block.instanceId,oldRun.instanceId); assert.equal(fresh.block.returnDate,'2026-10-04');
  assert.equal(JSON.stringify(saved),before);
  const regular = shared.WORKOUTS.find(w=>w.id==='micro-arms');
  assert.strictEqual(block.resolveTrainingBlockSession(regular,null,saved,shared.WORKOUTS).workout,regular,'The restored current Dips workout stays regular');
});

test('RIR and the rep range render together on revised working cards without a forced rep suggestion', () => {
  const { SetCard } = loadModule('../components/session/SetCard.jsx', { react: React, 'react/jsx-runtime': jsx,
    '@/lib/legacy/shared': shared, '@/lib/legacy/session-utils': utils, '@/lib/legacy/cable-stack': cable });
  const w = getWorkout('strength-accessories-1'); const exercise = guide(w, []).find(e => e.name === 'Dips');
  const html = renderToStaticMarkup(React.createElement(SetCard, { s: exercise.sets[0], idx: 0, exercise }));
  assert.match(html, /\+25/); assert.match(html, /5–12/); assert.match(html, /1–2 RIR/); assert.doesNotMatch(html, /Suggested/);
});


test('a one-day pause preserves today’s regular workout and the original return date', () => {
  const settings = { training_block: { ...run, resumeDate: '2026-09-08' } };
  assert.equal(block.trainingBlockStatus(settings, '2026-09-07').status, 'paused');
  assert.equal(block.trainingBlockStatus(settings, '2026-09-08').status, 'active');
  assert.equal(block.trainingBlockStatus(settings, '2026-09-08').workoutId, null);
  assert.equal(block.trainingBlockStatus(settings, '2026-09-09').workoutId, 'strength-b');
  assert.equal(block.trainingBlockStatus(settings, '2026-10-04').status, 'ended');
  assert.equal(block.parseTrainingBlock({ training_block: { ...run, resumeDate: 'invalid' } }), null);
});


test('the restored regular Dips workout supplies the next block load after the one-day pause', () => {
  const w = getWorkout('strength-accessories-1');
  const resumedRun = { ...run, resumeDate: '2026-09-08' };
  const today = session('Dips Focus', '2026-09-07', [1,2,3].map(n => row('Dips',n,27.5,10,{load_type:'belt'})));
  const hints = block.trainingBlockHints(w,[today],resumedRun);
  assert.deepEqual(plain(work(utils.flattenTemplate(w,{},hints),'Dips').map(s=>s.weight)),[27.5,27.5,27.5]);
  assert.equal(block.trainingBlockHints(w,[{...today,finished_at:null}],resumedRun)['Dips|working|1'],undefined);
});


test('accessory progression finds its regular baseline across unrelated workout days', () => {
  const w = getWorkout('strength-accessories-2');
  const rows = [1,2,3].map(n=>row('Calf Raises',n,55,20));
  const past = [session('Squat Focus','2026-09-05',[row('Barbell Back Squat',1,135,8)]),
    session('Shrugs Focus','2026-09-03',rows,{cable_weight_mode:'per_stack'}),
    session('Dips Focus','2026-09-01',[row('Dips',1,25,11,{load_type:'belt'})]),
    session('Shrugs Focus','2026-08-30',rows,{cable_weight_mode:'per_stack'})];
  const sets = work(guide(w,past),'Calf Raises');
  assert.equal(sets[0].repGuidance.loadProgression.qualifying,2);
  assert.equal(sets[0].repGuidance.loadProgression.weight,56.25);
});

test('replacement cable fly keeps three sets and seeds its actual cable history before Accessories 1 has a result', () => {
  const name = 'Single-Arm Cable Rear Delt Fly';
  const w = getWorkout('strength-accessories-1');
  const source = session('Strength Accessories 2', '2026-09-10', [
    row(name, 1, 15, 15), row(name, 2, 16.25, 11), row(name, 3, 16.25, 11),
  ], { state_json: JSON.stringify({ trainingBlock: run }), cable_weight_mode: 'per_stack' });
  const wrongRun = session('Strength Accessories 2', '2026-09-11', [row(name, 1, 50, 20)],
    { state_json: JSON.stringify({ trainingBlock: { ...run, instanceId: 'other' } }) });
  const dumbbells = session('Dips Focus', '2026-09-05', [row('Reverse Flyes', 1, 25, 12)]);
  const sessions = [wrongRun, source, dumbbells];
  const before = JSON.stringify(sessions);
  let exercises = guide(w, sessions);
  const cable = exercises.find(e => e.name === name);
  assert.equal(cable.equipment, 'cable');
  assert.deepEqual(plain(cable.sets.map(s => s.weight)), [15, 16.25, 16.25]);
  assert.deepEqual(plain(cable.sets.map(s => s.repGuidance.previous.reps)), [15, 11, 11]);
  assert.ok(cable.sets.every(s => s.repGuidance.rirLabel === '1–2'));
  assert.ok(!exercises.some(e => e.name === 'Reverse Flyes'));
  assert.equal(JSON.stringify(sessions), before);
  assert.equal(shared.WORKOUTS.find(w => w.id === 'micro-arms').exercises.find(e => e.name === name).sets, 3);

  const own = session(w.name, '2026-09-13', [1,2,3].map(n => row(name, n, 17.5, 10)),
    { state_json: JSON.stringify({ trainingBlock: run }), cable_weight_mode: 'per_stack' });
  const laterSource = { ...source, date: '2026-09-16', sets: [row(name, 1, 20, 15)] };
  exercises = guide(w, [...sessions, own, laterSource]);
  assert.deepEqual(plain(work(exercises, name).map(s => s.weight)), [17.5,17.5,17.5]);
  assert.ok(work(exercises, name).every(s => s.repGuidance.previous.workout === w.name), 'After the first A accessory appearance, its own history owns progression');
});


test('wrist curls finish both accessory days with dumbbell controls and optional RIR', () => {
  const name = 'Bench-Supported Dumbbell Wrist Curls';
  assert.equal(shared.findExerciseConfig(name).equipment, 'dumbbell');
  for (const id of ['strength-accessories-1', 'strength-accessories-2']) {
    const w = getWorkout(id);
    const e = guide(w, []).at(-1);
    assert.equal(e.name, name);
    assert.equal(e.equipment, 'dumbbell');
    assert.equal(e.sets.length, 2);
    assert.ok(e.sets.every(s => s.kind === 'work' && s.rir == null && s.reps == null));
    assert.deepEqual(plain(e.sets.map(s => s.repGuidance.range)), [[15,25],[15,25]]);
    assert.ok(e.sets.every(s => s.repGuidance.rirLabel === '1–2'));
    for (const [reps, rir, ready] of [[[25,24], '1-2', false], [[25,25], '0', false], [[25,25], '1-2', true]]) {
      const prev = session(w.name, '2026-09-18', reps.map((r,i) => row(name,i+1,5,r,{rir})), {state_json:JSON.stringify({trainingBlock:run})});
      const guided = guide(w, [prev]);
      const wrist = guided.at(-1);
      const offer = wrist.sets[0].repGuidance.loadProgression;
      assert.equal(offer.ready, ready);
      assert.equal(offer.weight, 7.5);
      if (ready) {
        const accepted = applySuggestedLoad(guided, guided.length-1, 0);
        assert.deepEqual(plain(accepted.at(-1).sets.map(s => s.weight)), [7.5,7.5]);
      }
    }
  }
});

test('cable chest fly starts Shrugs Focus with per-stack loading and progresses all three sets together', () => {
  const name = 'Cable Chest Fly';
  const w = getWorkout('strength-accessories-2');
  const e = guide(w, [])[0];
  assert.equal(e.name, name);
  assert.equal(e.equipment, 'cable');
  assert.equal(e.rest, 75);
  assert.equal(shared.findExerciseConfig(name).equipment, 'cable');
  assert.equal(cable.cableStackMultiplier(name), 2);
  assert.equal(cable.effectiveExerciseWeight(name, 10), 20);
  assert.equal(e.sets.length, 4);
  assert.equal(e.sets[0].kind, 'warmup');
  assert.equal(e.sets[0].weight, 10);
  assert.deepEqual(plain(e.sets[0].repGuidance.range), [10,10]);
  const working = e.sets.filter(s => s.kind === 'work');
  assert.deepEqual(plain(working.map(s => s.repGuidance.range)), [[12,20],[12,20],[12,20]]);
  assert.ok(working.every(s => !s.completed && s.reps == null && s.rir == null && s.repGuidance.rirLabel === '2'));
  assert.ok(!getWorkout('strength-accessories-1').exercises.some(e => e.name === name));
  for (const [reps, ready] of [[[20,20], false], [[20,20,19], false], [[20,20,20], true]]) {
    const prev = session(w.name, '2026-09-18', reps.map((r,i) => row(name,i+1,10,r,{rir:'1-2'})), {state_json:JSON.stringify({trainingBlock:run})});
    const offer = guide(w, [prev])[0].sets.find(s => s.kind === 'work').repGuidance.loadProgression;
    assert.equal(offer.ready, ready);
    assert.equal(offer.weight, 11.25);
  }
});
