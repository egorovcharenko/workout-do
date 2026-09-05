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

test('previewing earlier sets and another exercise does not overwrite the loaded squat bar', () => {
  setBarStack('Squat navigation', [15, 10, 10, 10]);
  currentBarStack('Squat navigation', 75);
  currentBarStack('Bench navigation', 95);
  assert.deepEqual(currentBarStack('Squat navigation', 125), [15, 10, 10, 5]);
  assert.deepEqual(recordedBarStack('Squat navigation', 135), [15, 10, 10, 10]);
  assert.equal(recordedBarStack('Squat navigation', 125), null);
});

test('logged plate snapshots remain stable when the current bar changes', async () => {
  const { platesForSet } = await import('../lib/legacy/bar-stack.js');
  const logged = { completed: true, weight: 135, barPlates: [15, 10, 10, 10] };
  setBarStack('Squat snapshot', [35, 5]);
  const plates = platesForSet('Squat snapshot', logged);
  assert.deepEqual(plates, [15, 10, 10, 10]);
  plates.pop();
  assert.equal(logged.barPlates.length, 4);
  assert.deepEqual(recordedBarStack('Squat snapshot', 125), [35, 5]);
});

test('loaded stacks survive module reload through storage', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }});
  try {
    setBarStack('Persisted squat', [15, 10, 10, 10]);
    const fresh = await import('../lib/legacy/bar-stack.js?reload-test');
    assert.deepEqual(fresh.currentBarStack('Persisted squat', 125), [15, 10, 10, 5]);
    assert.deepEqual(fresh.recordedBarStack('Persisted squat', 135), [15, 10, 10, 10]);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
