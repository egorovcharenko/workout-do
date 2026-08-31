import test from "node:test";
import assert from "node:assert/strict";

import { logSetAndTransition, nextSupersetTarget, findNextActivationTarget } from "../lib/legacy/set-logging.js";

function exercise(name, sets) {
  return { name, sets };
}

function work(overrides = {}) {
  return { kind: "work", active: false, completed: false, userSkipped: false, reps: null, ...overrides };
}

function supersetPair(aSets, bSets, extra = {}) {
  return [
    { name: "Dips", superset: "A", sets: aSets, ...extra },
    { name: "Dumbbell Bicep Curls", superset: "A", sets: bSets, ...extra },
  ];
}

test("logging reps and moving to the next set is one immutable transition", () => {
  const before = [exercise("Bench Press", [
    { active: true, completed: false, weight: 165, reps: null },
    { active: false, completed: false, weight: 165, reps: null },
  ])];

  const after = logSetAndTransition(before, 0, 0, {
    reps: 8,
    completed: true,
    logged_at: "2026-07-17T12:00:00.000Z",
  });

  assert.deepEqual(after[0].sets[0], {
    active: false,
    completed: true,
    weight: 165,
    reps: 8,
    logged_at: "2026-07-17T12:00:00.000Z",
  });
  assert.equal(after[0].sets[1].active, true);
  assert.equal(before[0].sets[0].completed, false);
});

test("rapid consecutive rep logs preserve both completed sets", () => {
  const before = [exercise("Pull-Ups", [
    { active: true, completed: false, reps: null },
    { active: false, completed: false, reps: null },
    { active: false, completed: false, reps: null },
  ])];

  const first = logSetAndTransition(before, 0, 0, { reps: 10, completed: true });
  const second = logSetAndTransition(first, 0, 1, { reps: 9, completed: true });

  assert.equal(second[0].sets[0].reps, 10);
  assert.equal(second[0].sets[0].completed, true);
  assert.equal(second[0].sets[1].reps, 9);
  assert.equal(second[0].sets[1].completed, true);
  assert.equal(second[0].sets[2].active, true);
});

test("superset logging alternates A1→B1→A2→B2 and rests between rounds", () => {
  let state = supersetPair(
    [work({ active: true }), work()],
    [work(), work()],
  );

  state = logSetAndTransition(state, 0, 0, { reps: 10, completed: true });
  assert.equal(state[1].sets[0].active, true, "after A1 the partner's first set is up");

  state = logSetAndTransition(state, 1, 0, { reps: 12, completed: true });
  assert.equal(state[0].sets[1].active, true, "after B1 round 2 starts back at A");

  state = logSetAndTransition(state, 0, 1, { reps: 9, completed: true });
  assert.equal(state[1].sets[1].active, true, "after A2 the partner's last set is up");
});

test("superset logging never activates a set inside a skipped partner", () => {
  const state = supersetPair(
    [work({ active: true }), work()],
    [work(), work()],
  );
  state[1].skipped = true;

  const after = logSetAndTransition(state, 0, 0, { reps: 10, completed: true });

  assert.equal(after[1].sets.some(s => s.active), false, "skipped partner stays inactive");
  assert.equal(after[0].sets[1].active, true, "continues within the visible exercise");
});

test("mid-superset resume picks the partner with fewer completed sets", () => {
  // A finished rounds 1-2, B finished round 1 — round 2 continues at B.
  const state = supersetPair(
    [work({ completed: true }), work({ completed: true }), work()],
    [work({ completed: true }), work(), work()],
  );

  assert.deepEqual(nextSupersetTarget(state, "A"), { eIdx: 1, sIdx: 1 });
});

test("extra solo superset sets run last", () => {
  // A has one extra set beyond B's count; once both are even, A's extra is next.
  const state = supersetPair(
    [work({ completed: true }), work({ completed: true }), work()],
    [work({ completed: true }), work({ completed: true })],
  );

  assert.deepEqual(nextSupersetTarget(state, "A"), { eIdx: 0, sIdx: 2 });
});

test("advance wraps around to earlier pending exercises", () => {
  const state = [
    exercise("Barbell Back Squat", [work(), work()]),
    exercise("Barbell Bench Press", [work({ completed: true }), work({ active: true })]),
  ];

  const after = logSetAndTransition(state, 1, 1, { reps: 8, completed: true });

  assert.equal(after[0].sets[0].active, true, "falls back to the earlier unfinished exercise");
});

test("advance skips over skipped exercises when moving on", () => {
  const state = [
    exercise("Barbell Back Squat", [work({ active: true })]),
    { ...exercise("Standing Overhead Press", [work(), work()]), skipped: true },
    exercise("Lat Pulldown", [work(), work()]),
  ];

  const after = logSetAndTransition(state, 0, 0, { reps: 8, completed: true });

  assert.equal(after[1].sets.some(s => s.active), false);
  assert.equal(after[2].sets[0].active, true);
});

test("no pending sets anywhere leaves nothing active", () => {
  const state = supersetPair(
    [work({ completed: true }), work({ completed: true })],
    [work({ completed: true }), work({ active: true })],
  );

  const after = logSetAndTransition(state, 1, 1, { reps: 8, completed: true });

  assert.equal(after.every(e => e.sets.every(s => !s.active)), true);
  assert.equal(findNextActivationTarget(after, 1, 1), null);
});

test("logging never reactivates a user-skipped set", () => {
  const before = [exercise("Barbell Back Squat", [
    { active: true, completed: false },
    { active: false, completed: false, userSkipped: true },
    { active: false, completed: false },
  ])];

  const after = logSetAndTransition(before, 0, 0, { reps: 8, completed: true });

  assert.equal(after[0].sets[1].active, false);
  assert.equal(after[0].sets[2].active, true);
});
