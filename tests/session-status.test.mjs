import test from "node:test";
import assert from "node:assert/strict";

import {
  isStoredSessionFinished,
  storedSessionProgress,
} from "../lib/legacy/session-status.js";
import { consumeSatisfiedPlanEntries } from "../lib/legacy/workout-plan.js";

function sessionState(setsMap, skipped = []) {
  return JSON.stringify({ setsMap, skipped });
}

test("a same-day session stays unfinished while a saved set remains", () => {
  const session = {
    state_json: sessionState({
      "Barbell RDL": [
        { completed: true },
        { completed: false },
      ],
    }),
  };

  assert.deepEqual(storedSessionProgress(session), {
    completed: 1,
    total: 2,
    finished: false,
  });
  assert.equal(isStoredSessionFinished(session), false);
});

test("skipped exercises and warm-ups count as resolved completion state", () => {
  const session = {
    state_json: sessionState(
      {
        "Barbell RDL": [
          { completed: false, userSkipped: true },
          { completed: true },
        ],
        "Lat Pulldown": [
          { completed: false },
          { completed: false },
        ],
      },
      ["Lat Pulldown"],
    ),
  };

  assert.deepEqual(storedSessionProgress(session), {
    completed: 2,
    total: 2,
    finished: true,
  });
  assert.equal(isStoredSessionFinished(session), true);
});

test("an explicit finish marker handles legacy or malformed state", () => {
  assert.equal(isStoredSessionFinished({
    finished_at: "2026-07-10T18:00:00.000Z",
    state_json: "not-json",
  }), true);
  assert.equal(isStoredSessionFinished({ state_json: "not-json" }), false);
});

test("a completed workout consumes the matching pre-existing plan entry", () => {
  const plan = [
    {
      id: "deadlift",
      workout: "Main: Deadlift",
      added: "2026-07-10T16:00:00.000Z",
    },
    {
      id: "delts",
      workout: "Micro: Delts & Traps",
      added: "2026-07-10T16:00:00.000Z",
    },
  ];
  const history = [{
    id: "done",
    workout_name: "Main: Deadlift",
    date: "2026-07-10",
    started_at: "2026-07-10T17:00:00.000Z",
    sets: [{ reps: "10" }],
  }];

  assert.deepEqual(
    consumeSatisfiedPlanEntries(plan, history, [], {}),
    [plan[1]],
  );
  assert.equal(plan.length, 2, "the persisted input is not mutated");
});

test("an active workout or a plan added afterward is not consumed", () => {
  const activePlan = [{
    workout: "Main: Deadlift",
    added: "2026-07-10T16:00:00.000Z",
  }];
  const laterPlan = [{
    workout: "Main: Deadlift",
    added: "2026-07-10T18:00:00.000Z",
  }];
  const history = [{
    id: "session",
    workout_name: "Main B",
    date: "2026-07-10",
    started_at: "2026-07-10T17:00:00.000Z",
    sets: [{ reps: "5" }],
  }];
  const aliases = { "Main B": "Main: Deadlift" };

  assert.deepEqual(
    consumeSatisfiedPlanEntries(activePlan, history, [{ id: "session" }], aliases),
    activePlan,
  );
  assert.deepEqual(
    consumeSatisfiedPlanEntries(laterPlan, history, [], aliases),
    laterPlan,
  );
});
