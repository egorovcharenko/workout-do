import test from "node:test";
import assert from "node:assert/strict";

import { buildExerciseSessionHistory } from "../lib/legacy/exercise-session-history.js";

const workingSet = (exercise, setNumber, weight, reps) => ({
  exercise,
  set_type: "working",
  set_number: setNumber,
  weight_lb: weight,
  reps,
});

test("exercise history excludes the active session and sorts newest first", () => {
  const history = [
    { id: "old", date: "2026-07-01", sets: [workingSet("Dips", 1, 25, 8)] },
    { id: "active", date: "2026-07-18", sets: [workingSet("Dips", 1, 45, 6)] },
    { id: "new", date: "2026-07-12", sets: [workingSet("Dips", 1, 35, 7)] },
  ];

  const result = buildExerciseSessionHistory(history, "Dips", "active");
  assert.deepEqual(result.rows.map((row) => row.session.id), ["new", "old"]);
});

test("exercise history aligns superset sets by exercise position", () => {
  const history = [
    {
      id: "three-sets",
      date: "2026-07-12",
      sets: [
        workingSet("Dips", 5, 25, 8),
        workingSet("Dips", 1, 25, 10),
        workingSet("Dips", 3, 25, 9),
      ],
    },
    {
      id: "two-sets",
      date: "2026-07-05",
      sets: [workingSet("Dips", 1, 20, 10), workingSet("Dips", 3, 20, 9)],
    },
  ];

  const result = buildExerciseSessionHistory(history, "Dips");
  assert.equal(result.columnCount, 3);
  assert.deepEqual(result.rows[0].sets.map((set) => set.set_number), [1, 3, 5]);
  assert.equal(result.rows[1].sets.length, 2);
});

test("exercise history ignores warmups and unrelated exercises", () => {
  const result = buildExerciseSessionHistory([
    {
      id: "session",
      date: "2026-07-01",
      sets: [
        { ...workingSet("Bench Press", 0, 45, 10), set_type: "warmup" },
        workingSet("Bench Press", 1, 125, 12),
        workingSet("Barbell Row", 1, 125, 12),
      ],
    },
  ], "Bench Press");

  assert.equal(result.columnCount, 1);
  assert.equal(result.rows[0].sets[0].weight_lb, 125);
});

test("exercise history keeps legacy rows without ids when there is no active session", () => {
  const result = buildExerciseSessionHistory([
    { date: "2026-06-01", sets: [workingSet("Dips", 1, 15, 10)] },
  ], "Dips");

  assert.equal(result.rows.length, 1);
});
