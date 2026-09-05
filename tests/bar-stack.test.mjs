import test from 'node:test';
import assert from 'node:assert/strict';
import { platesForExerciseSet } from '../lib/legacy/bar-stack.js';

const squat = () => [45, 75, 95, 115, 135, 125, 125].map(weight => ({ weight }));

test('squat plates follow warmups through top set and backoffs', () => {
  const sets = squat();
  assert.deepEqual(platesForExerciseSet(sets, 4), [15, 10, 10, 10]);
  assert.deepEqual(platesForExerciseSet(sets, 5), [15, 10, 10, 5]);
  assert.deepEqual(platesForExerciseSet(sets, 6), [15, 10, 10, 5]);
});

test('navigation order, other exercises, and stale snapshots never change the plan', () => {
  const sets = squat().map(set => ({ ...set, barPlates: [35, 5] }));
  for (const index of [5, 1, 4, 0, 6, 2]) {
    platesForExerciseSet(sets, index);
    platesForExerciseSet([{ weight: 45 }, { weight: 155 }], 1);
  }
  assert.deepEqual(platesForExerciseSet(sets, 5), [15, 10, 10, 5]);
  assert.deepEqual(platesForExerciseSet(JSON.parse(JSON.stringify(sets)), 5), [15, 10, 10, 5]);
});

test('skipped loads are excluded and changing an earlier weight updates the sequence', () => {
  const sets = squat();
  sets[1].userSkipped = true;
  assert.deepEqual(platesForExerciseSet(sets, 2), [25]);
  sets[1].userSkipped = false;
  sets[1].weight = 85;
  const plates = platesForExerciseSet(sets, 5);
  assert.equal(45 + plates.reduce((sum, plate) => sum + plate, 0) * 2, 125);
  assert.notDeepEqual(plates, [15, 10, 10, 5]);
  assert.deepEqual(platesForExerciseSet([], 0), []);
});
