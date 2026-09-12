import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKOUTS } from '../lib/legacy/shared.js';
import { buildTrainingBlockWorkouts } from '../lib/training-block.js';
import { withFollowupLoads, followupWeightPatch } from '../lib/legacy/followup-load.js';
import { withLoadGuidance, applySuggestedLoad } from '../lib/legacy/load-guidance.js';

const workout = buildTrainingBlockWorkouts(WORKOUTS).find(w => w.id === 'strength-a');
const config = workout.exercises.find(e => e.name === 'Barbell Back Squat');
const fixture = () => [{ name: config.name, sets: [
  { kind: 'warmup', setNumber: 0, weight: 45, reps: 8, completed: true },
  ...[135, 115, 115].map((weight, i) => ({ kind: 'work', setNumber: i + 1, weight, lastWeight: weight,
    targetRepRange: i ? [8, 10] : [5, 8], reps: null, completed: false, active: i === 0 })),
] }];

test('second squat set resumes at the first set load for 6–10 without changing history, warmups or S3', () => {
  const raw = fixture();
  const before = JSON.stringify(raw);
  const next = withFollowupLoads(raw, workout);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(next[0].sets[2].weight, 135);
  assert.deepEqual(next[0].sets[2].targetRepRange, [6, 10]);
  assert.equal(next[0].sets[2].lastWeight, 115);
  assert.equal(next[0].sets[0], raw[0].sets[0]);
  assert.equal(next[0].sets[3], raw[0].sets[3]);
  const resumed = withFollowupLoads(JSON.parse(JSON.stringify(next)), workout);
  assert.deepEqual(resumed, next);
  assert.equal(withFollowupLoads(raw, { exercises: [] })[0], raw[0]);
});

test('following load tracks S1, but manual reductions persist through updates and reopening', () => {
  const next = withFollowupLoads(fixture(), workout);
  next[0].sets[1].weight = 140;
  const raised = withFollowupLoads(next, workout);
  assert.equal(raised[0].sets[2].weight, 140);
  Object.assign(raised[0].sets[2], followupWeightPatch(raised[0].sets[2], 130));
  raised[0].sets[1].weight = 145;
  const resumed = withFollowupLoads(JSON.parse(JSON.stringify(raised)), workout);
  assert.equal(resumed[0].sets[2].weight, 130);
  const oldManual = fixture();
  oldManual[0].sets[2].weight = 125;
  assert.equal(withFollowupLoads(oldManual, workout)[0].sets[2].weight, 125);
});

test('logged, skipped, exact-plan and deload sets retain their weights and ranges', () => {
  for (const patch of [{ completed: true, reps: 5, rir: '0' }, { reps: 5 },
    { logged_at: '2026-09-12T16:00:00Z' }, { userSkipped: true }, { planTargetReps: 8 }]) {
    const raw = fixture();
    Object.assign(raw[0].sets[2], patch);
    assert.deepEqual(withFollowupLoads(raw, workout)[0].sets[2], raw[0].sets[2]);
  }
  for (const flag of ['deload', 'skipped']) {
    const raw = fixture(); raw[0][flag] = true;
    assert.equal(withFollowupLoads(raw, workout)[0], raw[0]);
  }
});

test('one top set of eight offers 140 and carries it to S2; failure does not qualify', () => {
  const raw = withFollowupLoads(fixture(), workout)[0];
  for (const set of raw.sets) set.repGuidance = { range: set.targetRepRange };
  const past = [{ sets: [{ exercise: config.name, set_type: 'working', set_number: 1, weight_lb: 135, reps: '8', rir: '1-2' }] }];
  let guided = withLoadGuidance(raw, config, past, workout.name);
  const offer = guided.sets[1].repGuidance.loadProgression;
  assert.equal(offer.required, 1);
  assert.equal(offer.canApply, true);
  assert.equal(guided.sets[2].repGuidance.loadProgression, null);
  const raised = withFollowupLoads(applySuggestedLoad([guided], 0, 1), workout);
  assert.equal(raised[0].sets[1].weight, 140);
  assert.equal(raised[0].sets[2].weight, 140);
  for (const rir of ['0', 0]) {
    past[0].sets[0].rir = rir;
    guided = withLoadGuidance(raw, config, past, workout.name);
    assert.equal(guided.sets[1].repGuidance.loadProgression.ready, false);
  }
  past[0].sets[0].rir = null;
  assert.equal(withLoadGuidance(raw, config, past, workout.name).sets[1].repGuidance.loadProgression.canApply, true,
    'Unset RIR leaves the existing explicit reserve-confirmation button available');
});
