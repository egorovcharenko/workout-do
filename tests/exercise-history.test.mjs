import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeTemplateAndSavedSet,
  previousWorkingSet,
  selectWorkingHistorySource,
  workingHistoryBySetNumber,
} from "../lib/legacy/exercise-history.js";

const row = (reps) => ({ reps: String(reps), weight_lb: 0 });

test("pull-ups use one same-workout history instead of a cross-workout splice", () => {
  const lastSession = {
    "Pull-Ups|working|0": row(3),
    "Pull-Ups|working|1": row(2),
    "Pull-Ups|working|2": row(1),
  };
  const globalHints = {
    ...lastSession,
    "Pull-Ups|working|3": row(5),
  };

  const source = selectWorkingHistorySource("Pull-Ups", lastSession, globalHints);
  const history = workingHistoryBySetNumber("Pull-Ups", source);

  assert.deepEqual(Object.keys(history).map(Number), [0, 1, 2]);
  assert.equal(history[3], undefined);
});

test("a missing pull-up role stays empty instead of repeating another set", () => {
  const history = { 1: row(2), 2: row(1) };

  assert.equal(previousWorkingSet("Pull-Ups", history, 0, 1).reps, "2");
  assert.equal(previousWorkingSet("Pull-Ups", history, 1, 2).reps, "1");
  assert.equal(previousWorkingSet("Pull-Ups", history, 2, 3), null);
});

test("other exercises retain global hints and last-set fallback", () => {
  const lastSession = { "Lat Pulldown|working|1": row(8) };
  const globalHints = { "Lat Pulldown|working|1": row(10) };
  const source = selectWorkingHistorySource("Lat Pulldown", lastSession, globalHints);
  const history = workingHistoryBySetNumber("Lat Pulldown", source);

  assert.equal(history[1].reps, "10");
  assert.equal(previousWorkingSet("Lat Pulldown", history, 2, 3).reps, "10");
});

test("stale uncompleted pull-up previews are replaced on hydration", () => {
  const template = { kind: "work", idx: 3, setNumber: 3, lastReps: null, reps: null, completed: false };
  const saved = { kind: "work", idx: 3, setNumber: 3, lastReps: 5, reps: null, completed: false };

  const merged = mergeTemplateAndSavedSet("Pull-Ups", template, saved);

  assert.equal(merged.lastReps, null);
  assert.equal(merged.reps, null);
});

test("completed pull-up results from today remain intact", () => {
  const template = { kind: "work", idx: 3, setNumber: 3, lastReps: null, reps: null, completed: false };
  const saved = { kind: "work", idx: 3, setNumber: 3, lastReps: 5, reps: 2, completed: true };

  const merged = mergeTemplateAndSavedSet("Pull-Ups", template, saved);

  assert.equal(merged.lastReps, 5);
  assert.equal(merged.reps, 2);
  assert.equal(merged.completed, true);
});

test("an untouched empty cable preview accepts a newly available bootstrap", () => {
  const template = { kind: "work", idx: 1, setNumber: 1, weight: 70, lastWeight: 70, lastReps: 10, reps: null, completed: false };
  const saved = { kind: "work", idx: 1, setNumber: 1, weight: 0, lastWeight: null, lastReps: null, reps: null, completed: false };

  const merged = mergeTemplateAndSavedSet("Lat Pulldown", template, saved);

  assert.equal(merged.weight, 70);
  assert.equal(merged.lastWeight, 70);
  assert.equal(merged.lastReps, 10);
});

test("a cable weight selected today is not overwritten by bootstrap history", () => {
  const template = { kind: "work", idx: 1, setNumber: 1, weight: 70, lastWeight: 70, lastReps: 10, reps: null, completed: false };
  const saved = { kind: "work", idx: 1, setNumber: 1, weight: 80, lastWeight: null, lastReps: null, reps: null, completed: false };

  const merged = mergeTemplateAndSavedSet("Lat Pulldown", template, saved);

  assert.equal(merged.weight, 80);
});
