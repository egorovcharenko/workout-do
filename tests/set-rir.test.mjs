import * as followupLoad from "../lib/legacy/followup-load.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as rir from '../lib/legacy/set-rir.js';
import * as shared from '../lib/legacy/shared.js';
import * as belt from '../lib/legacy/belt-load.js';
import * as logging from '../lib/legacy/set-logging.js';
import * as saveScope from '../lib/session-save-scope.js';
import * as history from '../lib/legacy/exercise-history.js';
import * as bench from '../lib/legacy/bench-progression.js';
import * as squat from '../lib/legacy/squat-progression.js';

function load(path, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require: id => dependencies[id] || {}, ...globals });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const set = (number, extra = {}) => ({ kind: 'work', idx: number, setNumber: number,
  saveExerciseName: 'Dips', reps: null, rir: null, weight: 25, completed: false, active: number === 1, ...extra });
const fixture = () => [{ name: 'Dips', beltLoad: true, repsOnly: true, sets: [set(1), set(2)] }];
const { RirSelector } = load('../components/session/RirSelector.jsx', {
  'react/jsx-runtime': jsxRuntime, '@/lib/legacy/set-rir': rir,
    '@/lib/legacy/followup-load': followupLoad,
});

test('RIR buttons are optional and unselected; choosing and clearing does not log or advance a set', () => {
  const html = renderToStaticMarkup(React.createElement(RirSelector, { onPick: () => assert.fail('render must not select') }));
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 4);
  assert.doesNotMatch(html, /aria-pressed="true"|required/);
  assert.match(html, /0 RIR/);
  assert.match(html, /1–2 RIR/);
  assert.match(html, /3–4 RIR/);
  assert.match(html, /5\+ RIR/);
  for (const { value } of rir.RIR_OPTIONS) {
    let exercises = fixture();
    const before = JSON.stringify(exercises);
    const tree = RirSelector({ value: null, onPick: picked => { exercises = rir.toggleSetRir(exercises, 0, 0, picked); } });
    tree.props.children[1].find(button => button.key === value).props.onClick();
    assert.equal(exercises[0].sets[0].rir, value);
    assert.equal(exercises[0].sets[0].completed, false);
    assert.equal(exercises[0].sets[0].reps, null);
    assert.equal(exercises[0].sets[0].active, true);
    assert.equal(exercises[0].sets[1].rir, null);
    const chosen = renderToStaticMarkup(React.createElement(RirSelector, { value }));
    assert.equal((chosen.match(/aria-pressed="true"/g) || []).length, 1);
    exercises = rir.toggleSetRir(exercises, 0, 0, value);
    assert.equal(JSON.stringify(exercises), before);
  }
});

test('RIR updates save through workout actions without restarting rest, changing completion or timestamps', () => {
  const exercises = fixture();
  Object.assign(exercises[0].sets[0], { reps: 11, completed: true, active: false, logged_at: '2026-09-07T18:00:00Z' });
  exercises[0].sets[1].active = true;
  let saved;
  const { useWorkoutActions } = load('../components/session/useWorkoutActions.js', {
    react: { useEffect: effect => effect(), useRef: current => ({ current }) },
    '@/lib/legacy/set-rir': rir,
    '@/lib/legacy/followup-load': followupLoad,
    '@/lib/legacy/session-persistence': { saveSessionSets: () => {} },
  });
  const actions = useWorkoutActions({ workout: { name: 'Dips Focus' }, exercises,
    setExercises: () => {}, queueSave: next => { saved = next; },
    startTimer: () => assert.fail('RIR must not start a timer'),
    setRest: () => assert.fail('RIR must not change rest'),
  });
  actions.onPickRir(0, 0, '0');
  assert.equal(saved[0].sets[0].rir, '0');
  assert.equal(saved[0].sets[0].completed, true);
  assert.equal(saved[0].sets[0].logged_at, exercises[0].sets[0].logged_at);
  assert.equal(saved[0].sets[0].reps, 11);
  assert.equal(saved[0].sets[1].active, true);
  actions.onPickRir(0, 0, '0');
  assert.equal(saved[0].sets[0].rir, null);
  assert.equal(exercises[0].sets[0].rir, null, 'Do not mutate the previous state');
});

test('just-logged RIR follows actual logging across exercises and superset partners', () => {
  const exercises = fixture();
  Object.assign(exercises[0].sets[0], { completed: true, logged_at: '2026-09-07T18:10:00Z' });
  Object.assign(exercises[0].sets[1], { completed: true, logged_at: '2026-09-07T18:00:00Z' });
  exercises.push({ name: 'Bayesian Cable Curl', sets: [{ completed: true, logged_at: '2026-09-07T18:09:00Z' }, { active: true }] });
  const latest = rir.latestLoggedSet(exercises);
  assert.equal(latest.eIdx, 0);
  assert.equal(latest.sIdx, 0, 'Use logging time, not exercise or set order');
  const next = rir.toggleSetRir(exercises, latest.eIdx, latest.sIdx, '3-4');
  assert.equal(next[0].sets[0].rir, '3-4');
  assert.equal(next[1], exercises[1], 'The next active exercise is untouched');
});

test('every RIR option, unset, and cleared survive serialization, database save and resume', async () => {
  const persistence = load('../lib/legacy/session-persistence.js', {
    './shared': shared, './belt-load': belt, './set-logging': logging,
    './session-utils': { safeJSON: JSON.parse },
  }, { window: {} });
  let stored;
  const database = load('../lib/db/sessions.ts', {
    '@/lib/legacy/set-rir': rir,
    '@/lib/legacy/followup-load': followupLoad,
    '@/lib/session-save-scope': saveScope,
    '@/lib/firebase/client': { db: () => ({}) },
    '@/lib/log': { log: () => {} },
    'firebase/firestore': { collection: () => ({}), doc: () => ({ id: 'test-session' }),
      setDoc: async (_, value) => { stored = plain(value); },
      getDoc: async () => ({ exists: () => true, data: () => stored }),
      updateDoc: async (_, value) => { stored = { ...stored, ...plain(value) }; } },
  });
  for (const value of [null, ...rir.RIR_OPTIONS.map(option => option.value)]) {
    const exercises = fixture();
    Object.assign(exercises[0].sets[0], { rir: value, completed: true, reps: 11, logged_at: '2026-09-07T18:00:00Z' });
    exercises[0].sets[1].rir = '5+'; // A selection alone must stay a draft.
    const payload = persistence.serializeForSave(exercises, 'Dips Focus', null, null, 120, '2026-09-07');
    assert.equal(payload.sets.length, 1);
    assert.equal(payload.sets[0].rir, value);
    assert.equal(JSON.parse(payload.state_json).setsMap.Dips[1].rir, '5+');
    await database.saveSession('test-user', payload);
    assert.equal(stored.sets[0].rir, value);
    const resumed = persistence.hydrateToday(fixture(), stored.sets);
    assert.equal(resumed[0].sets[0].rir, value);
    assert.equal(resumed[0].sets[0].logged_at, '2026-09-07T18:00:00Z');
    assert.equal(resumed[0].sets[0].reps, 11);
    assert.equal(resumed[0].sets[1].rir, null);
    payload.session_id = 'test-session';
    payload.sets[0].rir = null;
    await database.saveSession('test-user', payload);
    assert.equal(stored.sets[0].rir, null, 'Clearing RIR updates the existing record');
    const cleared = persistence.hydrateToday(resumed, stored.sets);
    assert.equal(cleared[0].sets[0].rir, null, 'Explicitly cleared RIR wins over cached state');
  }
  const legacy = persistence.hydrateToday(fixture(), [{ exercise: 'Dips', set_type: 'working', set_number: 1, reps: '8' }]);
  assert.equal(legacy[0].sets[0].rir, null);
  for (const bad of ['', '2', 0, undefined, 'invalid']) assert.equal(rir.normalizeRir(bad), null);
});

test('new workout sets never inherit RIR from previous workout hints', () => {
  const utils = load('../lib/legacy/session-utils.js', {
    './shared': shared, './session-persistence': { loadBodyweight: () => 165 },
    './bench-progression': bench, './squat-progression': squat,
    './belt-load': belt, './set-logging': logging, './exercise-history': history,
  });
  const exercises = utils.flattenTemplate({ exercises: [{ name: 'Dips', repsOnly: true, beltLoad: true, sets: 3, noWarmup: true, reps: '6-12' }] }, {}, {
    'Dips|working|1': { reps: '11', weight_lb: 25, load_type: 'belt', rir: '0' },
  });
  assert.ok(exercises[0].sets.every(set => set.rir === null && !set.completed));
});
