import test from "node:test";
import assert from "node:assert/strict";
import { applyBenchProgression } from "../lib/legacy/bench-progression.js";

function benchSets(topWeight, topReps, backoffWeight = 140, backoffReps = 8) {
  return [
    { kind: "warmup", weight: 115, lastWeight: 115, lastReps: 3 },
    { kind: "work", idx: 1, weight: topWeight, lastWeight: topWeight, lastReps: topReps },
    ...Array.from({ length: 3 }, (_, index) => ({
      kind: "work",
      idx: index + 2,
      weight: backoffWeight,
      lastWeight: backoffWeight,
      lastReps: backoffReps,
    })),
  ];
}

test("bench top set adds five pounds after reaching five reps", () => {
  const result = applyBenchProgression(benchSets(155, 5));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.equal(result.progression.status, "building");
  assert.equal(result.progression.top.advanced, true);
  assert.equal(work[0].weight, 160);
  assert.deepEqual(work[0].targetRepRange, [3, 5]);
  assert.equal(work[0].lastWeight, 155);
});

test("bench top set repeats its weight until five reps", () => {
  const result = applyBenchProgression(benchSets(160, 4));

  assert.equal(result.progression.top.advanced, false);
  assert.equal(result.progression.top.weight, 160);
});

test("lead back-off set advances all back-offs at ten reps", () => {
  const result = applyBenchProgression(benchSets(160, 4, 145, 10));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.equal(result.progression.backoff.advanced, true);
  assert.deepEqual(work.slice(1).map((set) => set.weight), [150, 150, 150]);
  assert.ok(work.slice(1).every((set) => set.targetRepRange[0] === 8 && set.targetRepRange[1] === 10));
});

test("170 by three unlocks a literal 180 pound single", () => {
  const result = applyBenchProgression(benchSets(170, 3, 150, 9));
  const top = result.sets.find((set) => set.kind === "work");

  assert.equal(result.progression.status, "test");
  assert.equal(top.weight, 180);
  assert.deepEqual(top.targetRepRange, [1, 1]);
});

test("logged 180 single marks the goal achieved", () => {
  const result = applyBenchProgression(benchSets(180, 1, 150, 9));

  assert.equal(result.progression.status, "achieved");
  assert.equal(result.progression.top.weight, 180);
});

test("template defaults stay put when there is no history", () => {
  const result = applyBenchProgression(benchSets(155, 5, 140, 10), { hasHistory: false });

  assert.equal(result.progression.status, "baseline");
  assert.equal(result.progression.top.weight, 155);
  assert.equal(result.progression.backoff.weight, 140);
});
