import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreChestFlyPrescription } from '../lib/cable-chest-fly.js';

const template = [{ kind: 'warmup', setNumber: 0, weight: 10 }, ...[1,2,3].map(setNumber => ({
  kind: 'work', setNumber, weight: 10, reps: null, rir: null, completed: false,
}))];

test('older ongoing fly session gains warmup and third work set without changing logged results', () => {
  const saved = [{ ...template[1], weight: 20, reps: 12, rir: '1-2', completed: true, logged_at: '2026-09-23T03:06:52Z' },
    { ...template[2], weight: 20, active: true }];
  const before = JSON.stringify(saved);
  const result = restoreChestFlyPrescription(template, saved);
  assert.equal(result.length, 4);
  assert.equal(result[0].kind, 'warmup');
  assert.equal(result[0].weight, 10);
  assert.deepEqual(result[1], { ...saved[0], prescriptionVersion: 1 });
  assert.deepEqual(result[2], { ...saved[1], prescriptionVersion: 1 });
  assert.equal(result[3].weight, 20);
  assert.equal(result[3].completed, false);
  assert.equal(JSON.stringify(saved), before);
  assert.deepEqual(restoreChestFlyPrescription(template, result), result);
});

test('deliberate removals after upgrade stay removed and extra logged sets survive', () => {
  const extra = { kind: 'work', setNumber: 4, completed: true, reps: 9, weight: 20 };
  const upgraded = restoreChestFlyPrescription(template, [template[1], template[2], extra]);
  assert.equal(upgraded.length, 5);
  const edited = upgraded.filter(set => set.kind !== 'warmup' && set.setNumber !== 3);
  assert.deepEqual(restoreChestFlyPrescription(template, edited), edited);
  assert.equal(restoreChestFlyPrescription(template, undefined), undefined);
});
