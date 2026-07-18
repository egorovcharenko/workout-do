import test from "node:test";
import assert from "node:assert/strict";

import { logSetAndTransition } from "../lib/legacy/set-logging.js";

function exercise(name, sets) {
  return { name, sets };
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
