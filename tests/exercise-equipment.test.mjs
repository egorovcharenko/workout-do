import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as shared from '../lib/legacy/shared.js';
import * as belt from '../lib/legacy/belt-load.js';
import * as history from '../lib/legacy/exercise-history.js';
import { buildLibraryExerciseTemplate } from '../lib/legacy/session-mutations.js';

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => dependencies[id] || {} });
  return exports;
}
const empty = () => null;
const weights = load('../components/session/WeightSelection.jsx', {
  'react/jsx-runtime': jsxRuntime, '@/lib/legacy/shared': shared, './Stepper': { WeightStepper: empty },
});
const { ActiveSetBlock } = load('../components/session/ActiveSetBlock.jsx', {
  'react/jsx-runtime': jsxRuntime, '@/lib/legacy/shared': shared,
  './WeightSelection': weights, './RepStrip': { RepStrip: empty }, './RirSelector': { RirSelector: empty },
  './LoadProgression': { LoadProgression: empty },
  './BarbellVisualizer': { BarbellVisualizer: () => React.createElement('span', null, 'barbell control') },
  './CableStackVisualizer': { CableStackVisualizer: () => React.createElement('span', null, 'cable control') },
});
const utils = load('../lib/legacy/session-utils.js', {
  './shared': shared, './session-persistence': { loadBodyweight: () => 165 },
  './belt-load': belt, './exercise-history': history,
});
const render = exercise => renderToStaticMarkup(React.createElement(ActiveSetBlock, {
  exercise, set: exercise.sets[0],
}));

test('every workout and library exercise has explicitly assigned equipment', () => {
  const allowed = new Set(['barbell', 'dumbbell', 'cable', 'band', 'bodyweight']);
  const exercises = [...shared.ALL_WORKOUTS, ...shared.LEGACY_BLOCK_WORKOUTS].flatMap(workout =>
    workout.exercises.flatMap(exercise => exercise.supersetExercises || [exercise]));
  exercises.push(...shared.SWAP_GROUPS.flatMap(group => group.exercises));
  for (const exercise of exercises) assert.ok(allowed.has(exercise.equipment), `Missing equipment: ${exercise.name}`);
  for (const exercise of exercises.filter(exercise => exercise.name === 'Reverse Flyes')) {
    assert.equal(exercise.equipment, 'dumbbell');
  }
});

test('equipment controls use assignments even when the name suggests a different tool', () => {
  const makeExercise = equipment => utils.flattenTemplate({ exercises: [{
    name: 'Barbell Cable Dumbbell', equipment, sets: 1, reps: '8-12', noWarmup: true,
  }] }, {}, {})[0];
  const dumbbell = makeExercise('dumbbell');
  assert.equal(dumbbell.isBarbell, false);
  const dumbbellHtml = render(dumbbell);
  assert.match(dumbbellHtml, /viewBox="0 0 72 34"/);
  assert.doesNotMatch(dumbbellHtml, /cable control|barbell control|viewBox="0 0 48 42"/);
  assert.match(render(makeExercise('barbell')), /barbell control/);
  assert.match(render(makeExercise('cable')), /cable control/);
  const unknown = makeExercise(null);
  assert.equal(unknown.isBarbell, false);
  assert.doesNotMatch(render(unknown), /<svg|cable control|barbell control/);
  assert.equal(buildLibraryExerciseTemplate('Barbell Cable Dumbbell').equipment, null);
});

test('Reverse Flyes uses its assigned dumbbells when added or resumed, preserving logged values', () => {
  const official = shared.findExerciseConfig('Reverse Flyes');
  const template = buildLibraryExerciseTemplate(official.name, official);
  const exercise = utils.flattenTemplate({ exercises: [template] }, {}, {})[0];
  const saved = { ...exercise.sets[0], weight: 25, reps: 12, rir: '1-2', completed: true,
    logged_at: '2026-09-07T18:00:00Z' };
  exercise.sets[0] = history.mergeTemplateAndSavedSet(exercise.name, exercise.sets[0], saved);
  assert.deepEqual(exercise.sets[0], saved);
  assert.match(render(exercise), /viewBox="0 0 72 34"/);
});
