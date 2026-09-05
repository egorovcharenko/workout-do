import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as block from '../lib/training-block.js';
import * as shared from '../lib/legacy/shared.js';
import * as duration from '../lib/legacy/duration-estimates.js';
import * as bench from '../lib/legacy/bench-progression.js';
import * as squat from '../lib/legacy/squat-progression.js';
import * as belt from '../lib/legacy/belt-load.js';
import * as logging from '../lib/legacy/set-logging.js';
import * as history from '../lib/legacy/exercise-history.js';
import { exerciseHintsWithDeloadBootstrap } from '../lib/legacy/exercise-hints.js';

const run = block.createTrainingBlock('2026-09-06', 'run-one', '2026-09-05');
const settings = { workout_plan: '[{"workout":"RDL Focus"}]', bodyweight: '165', training_block: JSON.stringify(run) };
const workout = id => shared.BLOCK_WORKOUTS.find(w => w.id === id);
const benchRow = (weight, number = 1, reps = '8') => ({ exercise: 'Barbell Bench Press', set_type: 'working', set_number: number, weight_lb: weight, reps });
const session = (name, date, sets, extra = {}) => ({ id: date + name, workout_name: name, date, sets, finished_at: date + 'T12:00:00Z', state_json: JSON.stringify({ trainingBlock: run }), ...extra });

function loadModule(path, dependencies, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: id => {
    assert.ok(id in dependencies, `Unexpected dependency ${id}`);
    return dependencies[id];
  }, console, ...globals });
  return exports;
}

const utils = loadModule('../lib/legacy/session-utils.js', {
  './shared': shared, './session-persistence': { loadBodyweight: () => 165 },
  './duration-estimates': duration, './bench-progression': bench, './squat-progression': squat,
  './belt-load': belt, './set-logging': logging, './exercise-history': history,
});
const plain = value => JSON.parse(JSON.stringify(value));
const workSets = (exercises, name) => exercises.find(ex => ex.name === name).sets.filter(s => s.kind === 'work');

test('scheduled block starts tomorrow, includes rest days, and expires after exactly 28 calendar days', () => {
  const before = JSON.stringify(settings);
  assert.equal(block.trainingBlockStatus(settings, '2026-09-05').status, 'scheduled');
  for (let day = 0; day < 28; day++) {
    const status = block.trainingBlockStatus(settings, block.addCalendarDays(run.startDate, day));
    assert.equal(status.status, 'active');
    assert.equal(status.day, day + 1);
    assert.equal(status.workoutId, block.TRAINING_BLOCK_ROTATION[day % 6]);
  }
  assert.equal(block.trainingBlockStatus(settings, '2026-10-03').workoutId, 'strength-b');
  assert.equal(block.trainingBlockStatus(settings, '2026-10-04').status, 'ended');
  assert.equal(block.upcomingBlockDays(run, '2026-10-03').length, 0);
  assert.equal(JSON.stringify(settings), before, 'Expiry must not rewrite the saved regular plan');
  assert.equal(block.addCalendarDays('2026-10-20', 28), '2026-11-17', 'DST must not shorten the block');
});

test('invalid and cancelled blocks safely use the regular program', () => {
  for (const raw of ['{', '{}', JSON.stringify({ ...run, returnDate: '2026-10-05' })]) {
    assert.equal(block.trainingBlockStatus({ training_block: raw }).status, 'available');
  }
  assert.throws(() => block.createTrainingBlock('2026-02-30', 'x', '2026-01-01'));
  assert.throws(() => block.createTrainingBlock('2026-09-04', 'x', '2026-09-05'));
  assert.equal(block.trainingBlockStatus({ training_block: { ...run, status: 'ended' } }, '2026-09-07').status, 'ended');
});

test('A and B use their agreed loads and set counts without importing regular progression or extra sets', () => {
  const regularBefore = JSON.stringify(shared.WORKOUTS);
  const a = utils.flattenTemplate(workout('strength-a'), {}, {});
  const b = utils.flattenTemplate(workout('strength-b'), {}, {});
  assert.equal(a.flatMap(ex => ex.sets).filter(s => s.kind === 'work').length, 12);
  assert.equal(b.flatMap(ex => ex.sets).filter(s => s.kind === 'work').length, 11);
  assert.deepEqual(plain(workSets(a, 'Barbell Back Squat').map(s => [s.weight, s.targetRepRange])), [[135, [5, 8]], [115, [8, 10]], [115, [8, 10]]]);
  assert.deepEqual(plain(workSets(a, 'Barbell Bench Press').map(s => s.weight)), [135, 135, 135]);
  assert.deepEqual(plain(workSets(b, 'Barbell Bench Press').map(s => s.weight)), [150, 135, 135]);
  assert.deepEqual(plain(workSets(b, 'Barbell Back Squat').map(s => [s.weight, s.lastReps])), [[115, 6], [115, 6]]);
  for (const exercises of [a, b]) {
    assert.deepEqual(plain(workSets(exercises, 'Pull-Ups').map(s => [s.setNumber, s.weight, s.lastReps])), [[1, 0, 3], [2, 0, 3], [3, 0, 3], [4, 0, 3]]);
    assert.ok(exercises.every(ex => !ex.progression));
  }
  const historyHints = { __counts: { 'Barbell Bench Press': 8 } };
  for (let i = 1; i <= 8; i++) historyHints[`Barbell Bench Press|working|${i}`] = { weight_lb: 140, reps: '8' };
  const repeat = utils.flattenTemplate(workout('strength-a'), {}, historyHints);
  assert.deepEqual(plain(workSets(repeat, 'Barbell Bench Press').map(s => s.weight)), [140, 140, 140], 'Keep manually selected weights without automatically progressing or adding sets');
  assert.equal(JSON.stringify(shared.WORKOUTS), regularBefore);
});

test('block hints isolate A from B, unfinished sessions, previous runs and the regular program', () => {
  const rows = [
    session('Squat Focus', '2026-09-18', [benchRow(160)], { state_json: '{}' }),
    session('Strength B', '2026-09-17', [benchRow(150)]),
    session('Strength A', '2026-09-16', [benchRow(155)], { finished_at: null }),
    session('Strength A', '2026-09-15', [benchRow(145)], { state_json: JSON.stringify({ trainingBlock: { ...run, instanceId: 'older-run' } }) }),
    session('Strength A', '2026-09-12', [benchRow(137.5, 1, '7'), benchRow(135, 2, '6')]),
  ];
  const hints = block.trainingBlockHints(workout('strength-a'), rows, run);
  assert.equal(hints['Barbell Bench Press|working|1'].weight_lb, 137.5);
  assert.equal(hints['Barbell Bench Press|working|1'].reps, '7');
  const next = workSets(utils.flattenTemplate(workout('strength-a'), {}, hints), 'Barbell Bench Press');
  assert.deepEqual(plain(next.map(s => s.weight)), [137.5, 135, 135]);
  assert.equal(next[2].lastReps, 6, 'An unperformed set uses the block target instead of borrowing another role');
  const regular = exerciseHintsWithDeloadBootstrap(block.regularProgramSessions(rows));
  assert.equal(regular['Barbell Bench Press|working|1'].weight_lb, 160);
  assert.equal(rows.length, 5, 'History must remain intact');
  assert.deepEqual(block.trainingBlockHints(workout('strength-a'), rows, { ...run, instanceId: 'new-run' }), {});
});

test('accessories retain the existing dragon stage and start dips with the agreed belt load', () => {
  const previous = session('Dips Focus', '2026-09-03', [{ exercise: 'Dragon Fly Progression', set_type: 'working', set_number: 1, grip: 'straddle', reps: '11', weight_lb: 165 }], { state_json: '{}' });
  const w = workout('strength-accessories-1');
  const exs = utils.flattenTemplate(w, {}, block.trainingBlockHints(w, [previous], run));
  assert.deepEqual(plain(workSets(exs, 'Dips').map(s => s.weight)), [15, 15]);
  assert.deepEqual(plain(workSets(exs, 'Dragon Fly Progression').map(s => [s.grip, s.lastReps])), [['straddle', 5], ['straddle', 5]]);
  assert.equal(exs.flatMap(ex => ex.sets).length, 8);
});

test('saved block sessions retain their identity and edited sets through resume after expiry', () => {
  const persistence = () => loadModule('../lib/legacy/session-persistence.js', {
    '@/lib/db/api': { api: {} }, './shared': shared, './session-utils': utils, './belt-load': belt, './set-logging': logging,
  }, { window: { SESSION_DELOAD: false } });
  const exs = utils.flattenTemplate(workout('strength-b'), {}, {});
  const set = workSets(exs, 'Barbell Bench Press')[0];
  set.weight = 152.5; set.reps = 4; set.completed = true;
  const first = persistence();
  first.setSessionTrainingBlock('Strength B', '2026-10-03', run);
  const saved = first.serializeForSave(exs, 'Strength B', 'session-one', null, 120, '2026-10-03');
  const resumed = persistence();
  resumed.setSessionStateCache('Strength B', saved.date, JSON.parse(saved.state_json));
  const again = resumed.serializeForSave(exs, 'Strength B', 'session-one', null, 150, saved.date);
  assert.deepEqual(JSON.parse(again.state_json).trainingBlock, run);
  assert.equal(again.sets[0].weight_lb, 152.5);
  assert.equal(again.sets[0].reps, '4');
  const normal = resumed.serializeForSave([], 'Squat Focus', null, null, 0, '2026-10-04');
  assert.equal(JSON.parse(normal.state_json).trainingBlock, undefined);
});

test('scheduling and cancellation atomically change only the block field and reject stale actions', async () => {
  let stored = { workout_plan: settings.workout_plan, bodyweight: '165', deload_active: '0' };
  const original = { ...stored };
  const misc = loadModule('../lib/db/misc.ts', {
    'firebase/firestore': {
      doc: (...args) => { assert.ok(args.includes('owner-uid')); return 'settings/app'; },
      runTransaction: async (_db, callback) => callback({
        get: async () => ({ data: () => stored }),
        set: (_ref, patch, options) => { assert.equal(options.merge, true); stored = { ...stored, ...patch }; },
      }),
    },
    '@/lib/firebase/client': { db: () => ({}) },
    '@/lib/training-block': { ...block, createTrainingBlock: (date, id) => block.createTrainingBlock(date, id, '2026-09-05'), trainingBlockStatus: s => block.trainingBlockStatus(s, '2026-09-05') },
  }, { crypto: { randomUUID: () => 'transaction-run' } });
  const saved = await misc.startTrainingBlock('owner-uid', '2026-09-06');
  assert.equal(saved.startDate, '2026-09-06');
  await assert.rejects(() => misc.startTrainingBlock('owner-uid', '2026-09-07'), /already/);
  await assert.rejects(() => misc.endTrainingBlock('owner-uid', 'stale-run'), /changed/);
  await misc.endTrainingBlock('owner-uid', saved.instanceId);
  assert.equal(JSON.parse(stored.training_block).status, 'ended');
  const unchanged = { ...stored };
  delete unchanged.training_block;
  assert.deepEqual(unchanged, original);
});
