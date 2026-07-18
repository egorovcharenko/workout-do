import test from "node:test";
import assert from "node:assert/strict";
import { applySquatProgression } from "../lib/legacy/squat-progression.js";

function squatSets(topWeight, reps, backoffWeight = topWeight) {
  return [
    { kind: "warmup", weight: 95, lastWeight: 95, lastReps: 5 },
    { kind: "work", idx: 1, weight: topWeight, lastWeight: topWeight, lastReps: reps[0] },
    { kind: "work", idx: 2, weight: backoffWeight, lastWeight: backoffWeight, lastReps: reps[1] },
    { kind: "work", idx: 3, weight: backoffWeight, lastWeight: backoffWeight, lastReps: reps[2] },
  ];
}

test("recent straight sets migrate to a top set and lighter back-offs", () => {
  const result = applySquatProgression(squatSets(125, [7, 6, 5]));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.equal(result.progression.status, "transition");
  assert.deepEqual(work.map((set) => set.weight), [125, 115, 115]);
  assert.deepEqual(work.map((set) => set.targetRepRange), [[5, 8], [8, 10], [8, 10]]);
  assert.deepEqual(work.map((set) => set.lastWeight), [125, 125, 125]);
  assert.equal(result.progression.backoff.migrated, true);
});

test("the top set adds five pounds after reaching eight reps", () => {
  const result = applySquatProgression(squatSets(125, [8, 9, 8], 115));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.equal(result.progression.top.advanced, true);
  assert.deepEqual(work.map((set) => set.weight), [130, 115, 115]);
  assert.equal(work[0].lastWeight, 125);
});

test("both back-offs must reach ten before their load advances", () => {
  const result = applySquatProgression(squatSets(125, [7, 10, 9], 115));

  assert.equal(result.progression.backoff.advanced, false);
  assert.equal(result.progression.backoff.weight, 115);
});

test("completed back-offs add five pounds together", () => {
  const result = applySquatProgression(squatSets(125, [7, 10, 10], 115));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.equal(result.progression.backoff.advanced, true);
  assert.deepEqual(work.map((set) => set.weight), [125, 120, 120]);
});

test("top and back-offs can advance in the same session", () => {
  const result = applySquatProgression(squatSets(125, [8, 10, 10], 115));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.deepEqual(work.map((set) => set.weight), [130, 120, 120]);
  assert.equal(result.progression.headline, "Next weights earned");
});

test("template weights stay put when there is no history", () => {
  const result = applySquatProgression(squatSets(125, [6, 8, 8], 115), { hasHistory: false });

  assert.equal(result.progression.status, "baseline");
  assert.equal(result.progression.top.weight, 125);
  assert.equal(result.progression.backoff.weight, 115);
});
