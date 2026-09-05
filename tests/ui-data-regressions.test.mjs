import test from 'node:test';
import assert from 'node:assert/strict';
import { navSetDisplay } from '../lib/legacy/nav-set-display.js';
import { historicalSetLabel, historySetLoad } from '../lib/legacy/history-set-display.js';
import { selectTopSet } from '../lib/legacy/exercise-session-history.js';
import { adjustWeight } from '../lib/legacy/weight-adjustment.js';
import { decomposeBarbellLoad, restackBarbellLoad } from '../lib/legacy/plate-load.js';

test('barbell fine and coarse adjustments stay at or above the bar and match plate totals', () => {
  for (let weight = 45; weight <= 300; weight++) {
    for (const delta of [-5, -1, 1, 5]) {
      const next = adjustWeight(weight, delta, 45, 1);
      const plates = restackBarbellLoad(decomposeBarbellLoad(weight), next);
      assert.equal(45 + 2 * plates.reduce((sum, p) => sum + p, 0), next);
    }
  }
  assert.equal(adjustWeight(97.5, 1, 45, 1), 99);
  assert.equal(adjustWeight(97.5, -1, 45, 1), 97);
  assert.equal(adjustWeight(45, -5, 45, 1), 45);
  assert.equal(adjustWeight(95, 1, 45), 96);
  assert.equal(adjustWeight(95, 2.5), 97.5); // Other equipment retains fractional adjustments.
});

test('navigation uses current prescription for progression and deload', () => {
  for (const weight of [140, 115]) {
    const result = navSetDisplay({ kind: 'work', weight, lastWeight: 135, lastReps: 7 }, { name: 'Barbell Back Squat' });
    assert.equal(result.lb, weight);
  }
});

test('zero added load stays bodyweight even after a weighted session', () => {
  for (const active of [false, true]) {
    const result = navSetDisplay({ kind: 'work', weight: 0, lastWeight: 25, lastReps: 8, active }, { name: 'Pull-Ups', beltLoad: true, repsOnly: true });
    assert.equal(result.lb, 'BW');
  }
});

test('missing current load still falls back to history', () => {
  assert.equal(navSetDisplay({ kind: 'work', lastWeight: 135 }, { name: 'Squat' }).lb, 135);
});

test('legacy assisted history stays labeled and ranks below unassisted and weighted sets', () => {
  const exercise = { name: 'Pull-Ups', beltLoad: true, repsOnly: true };
  const assisted = { weight_lb: 125, bands_json: '[20,30]', reps: 12 };
  const bodyweight = { weight_lb: 0, load_type: 'belt', reps: 8 };
  const weighted = { weight_lb: 10, load_type: 'belt', reps: 5 };
  assert.deepEqual(historicalSetLabel(assisted, {}, exercise), { value: '−50 lb', detail: '12 reps · assist' });
  const load = set => historySetLoad(set, {}, exercise);
  assert.equal(selectTopSet([assisted, bodyweight], load), bodyweight);
  assert.equal(selectTopSet([assisted, bodyweight, weighted], load), weighted);
  assert.equal(historicalSetLabel(weighted, {}, exercise).value, '+10 lb');
  assert.equal(historicalSetLabel(bodyweight, {}, exercise).value, 'Bodyweight');
});
