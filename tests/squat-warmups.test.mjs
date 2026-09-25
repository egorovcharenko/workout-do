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

test('a logged, skipped or edited 75 lb warm-up and already-migrated sessions are left alone', () => {
  for (const extra of [{ completed: true, reps: 5 }, { userSkipped: true }, { logged_at: 't' }]) {
    const saved = [warm(0, 45), warm(1, 75, extra), warm(2, 95), warm(3, 115), work(1)];
    assert.equal(dropRetiredSquatWarmup(saved, template), saved);
  }
  const edited = [warm(0, 45), warm(1, 85), warm(2, 95), warm(3, 115), work(1)];
  assert.equal(dropRetiredSquatWarmup(edited, template), edited);
  const current = [warm(0, 45), warm(1, 95), warm(2, 115), work(1)];
  assert.equal(dropRetiredSquatWarmup(current, template), current);
  assert.equal(dropRetiredSquatWarmup(undefined, template), undefined);
});
