import test from 'node:test';
import assert from 'node:assert/strict';
import { currentBarStack, recordedBarStack, setBarStack } from '../lib/legacy/bar-stack.js';

test('recorded stack returns a snapshot only for the matching exercise and weight', () => {
  setBarStack('Squat', [15, 10, 15, 5]);
  const stack = recordedBarStack('Squat', 135);
  assert.deepEqual(stack, [15, 10, 15, 5]);
  stack.pop();
  assert.deepEqual(recordedBarStack('Squat', 135), [15, 10, 15, 5]);
  assert.equal(recordedBarStack('Bench', 135), null);
  assert.equal(recordedBarStack('Squat', 125), null);
  assert.deepEqual(currentBarStack('Squat', 125), [15, 10, 15]);
});
