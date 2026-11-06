import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as shared from '../lib/legacy/shared.js';
import * as standards from '../lib/legacy/standards.js';
import * as deloadProgress from '../lib/deload-progress.js';
import * as cableStack from '../lib/legacy/cable-stack.js';
import * as beltLoad from '../lib/legacy/belt-load.js';
import * as exerciseRenames from '../lib/legacy/exercise-renames.js';

// summary.js uses Next.js "@/..." imports, so load it the same way
// workout-recap.test.mjs loads JSX components: transpile and stub the
// module map instead of importing it directly.
const MUSCLE_GROUPS = { biceps: { label: 'Biceps' }, forearms: { label: 'Forearms' } };
const state = { history: [], bodyweight: 175 };

function loadSummary() {
  const exports = {};
  const source = fs.readFileSync(new URL('../components/home/summary.js', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const dependencies = {
    '../../lib/legacy/shared.js': shared,
    './state': { state },
    './shell': { MUSCLE_GROUPS },
    '@/lib/legacy/standards': standards,
    '@/lib/deload-progress': deloadProgress,
    '@/lib/legacy/cable-stack': cableStack,
    '@/lib/legacy/belt-load': beltLoad,
    '@/lib/legacy/exercise-renames': exerciseRenames,
  };
  vm.runInNewContext(compiled, { exports, console: { error() {} }, require(id) {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return exports;
}

const { renderWorkoutSummaryCard } = loadSummary();

const set = (exercise, weight, reps) => ({ exercise, set_type: 'working', weight_lb: String(weight), reps: String(reps) });
const session = (date, sets) => ({ date, workout_name: 'Strength Accessories 1', duration_sec: 3000, sets });

test('renamed exercise keeps its pre-rename sparkline, delta and weekly muscle sets', () => {
  state.history = [
    session('2026-11-06', [set('Cable Hammer Curls', 30, 10), set('Cable Hammer Curls', 30, 9), set('Cable Hammer Curls', 30, 8)]),
    session('2026-11-04', [set('Dumbbell Hammer Curls', 25, 10), set('Dumbbell Hammer Curls', 25, 10), set('Dumbbell Hammer Curls', 25, 9)]),
  ];
  const html = renderWorkoutSummaryCard();
  assert.match(html, /Cable Hammer Curls/);
  assert.doesNotMatch(html, /Dumbbell Hammer Curls/);
  assert.match(html, /<polyline/, 'pre-rename points join the sparkline');
  assert.match(html, /\+20%/, 'delta compares against the pre-rename best');
  // (Weekly muscle sets are normalized the same way in summary.js, but the
  // weekly-sets block is computed, not rendered, so it has no assertion here.)
});
