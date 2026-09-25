import test from 'node:test';
import assert from 'node:assert/strict';
import { dropRetiredSquatWarmup } from '../lib/squat-warmups.js';

const warm = (setNumber, weight, extra = {}) => ({ kind: 'warmup', setNumber, idx: `W${setNumber + 1}`, weight, reps: null, completed: false, ...extra });
const work = setNumber => ({ kind: 'work', setNumber, weight: 135, reps: null, completed: false });
const template = [warm(0, 45), warm(1, 95), warm(2, 115), work(1), work(2), work(3)];

test('an in-progress session drops the untouched 75 lb warm-up and renumbers the rest', () => {
  const saved = [warm(0, 45, { completed: true, reps: 8, logged_at: 't' }), warm(1, 75), warm(2, 95), warm(3, 115), work(1), work(2), work(3)];
  const next = dropRetiredSquatWarmup(saved, template);
  assert.deepEqual(next.filter(s => s.kind === 'warmup').map(s => [s.setNumber, s.idx, s.weight]), [[0, 'W1', 45], [1, 'W2', 95], [2, 'W3', 115]]);
  assert.equal(next[0].completed, true, 'Logged warm-ups keep their result');
  assert.equal(next.filter(s => s.kind === 'work').length, 3);
});

test('when the 75 lb slot was already used, the one pending extra warm-up is dropped instead', () => {
  // The athlete bumped W2 to 95 and logged it, then did 115 but not the old 95 single.
  const saved = [warm(0, 45, { completed: true, reps: 10 }), warm(1, 95, { completed: true, reps: 3 }), warm(2, 95), warm(3, 115, { completed: true, reps: 1 }), work(1)];
  const next = dropRetiredSquatWarmup(saved, template);
  assert.deepEqual(next.filter(s => s.kind === 'warmup').map(s => [s.setNumber, s.weight, s.completed]), [[0, 45, true], [1, 95, true], [2, 115, true]]);
});

test('ambiguous or already-migrated sessions are left alone, and logged warm-ups are never removed', () => {
  // Several pending warm-ups and the old slot already logged: no safe choice.
  const saved = [warm(0, 45), warm(1, 75, { completed: true, reps: 5 }), warm(2, 95), warm(3, 115), work(1)];
  assert.equal(dropRetiredSquatWarmup(saved, template), saved);
  const allDone = [0, 1, 2, 3].map(n => warm(n, [45, 75, 95, 115][n], { completed: true, reps: 3 })).concat(work(1));
  assert.equal(dropRetiredSquatWarmup(allDone, template), allDone);
  const current = [warm(0, 45), warm(1, 95), warm(2, 115), work(1)];
  assert.equal(dropRetiredSquatWarmup(current, template), current);
  assert.equal(dropRetiredSquatWarmup(undefined, template), undefined);
});
