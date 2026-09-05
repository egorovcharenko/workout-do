import test from "node:test";
import assert from "node:assert/strict";
import { applySquatProgression, optimizeMigratedSquatBackoffs } from "../lib/legacy/squat-progression.js";

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

test("migrated back-offs pick the 90% neighbour with the fewest plate swaps", () => {
  // 175 = 45+15+5 per side. Plain rounding of 157.5 gives 160 (45+10+2.5,
  // four swaps); 155 (45+10) is three, so it wins.
  const result = applySquatProgression(squatSets(175, [7, 6, 5]));
  const work = result.sets.filter((set) => set.kind === "work");

  assert.equal(result.progression.status, "transition");
  assert.deepEqual(work.map((set) => set.weight), [175, 155, 155]);
});

function migratedExercise() {
  const { sets, progression } = applySquatProgression(squatSets(135, [7, 6, 5]));
  return { name: "Barbell Back Squat", sets, progression };
}

test("initial migration accounts for all warm-up plates", () => {
  const sets = [45, 75, 95].map(weight => ({ kind: "warmup", weight }));
  sets.push(...squatSets(135, [7, 6, 5]).filter(s => s.kind === "work"));
  const result = applySquatProgression(sets);
  assert.equal(result.progression.backoff.weight, 125);
});

test("live migration uses manually loaded plates and preserves set metadata", () => {
  const ex = migratedExercise();
  ex.sets[1].completed = true;
  ex.sets[2].active = true;
  const next = optimizeMigratedSquatBackoffs(ex, 1, [15, 10, 15, 5]);
  assert.equal(next.progression.backoff.weight, 125);
  assert.deepEqual(next.sets.slice(2).map(s => s.weight), [125, 125]);
  assert.equal(next.sets[2].active, true);
  assert.equal(next.sets[2].lastWeight, 135);
  assert.match(next.progression.detail, /125 lb/);
  assert.notEqual(next.sets, ex.sets);
});

test("live optimization preserves established, planned, deload, edited and logged prescriptions", () => {
  for (const change of [
    ex => { ex.progression.backoff.migrated = false; },
    ex => { ex.planPrescribed = true; },
    ex => { ex.deload = true; },
    ex => { ex.sets[2].weight = 100; },
    ex => { ex.sets[2].completed = true; },
    ex => { ex.sets[2].userSkipped = true; },
  ]) {
    const ex = migratedExercise(); change(ex);
    assert.equal(optimizeMigratedSquatBackoffs(ex, 1, [15, 10, 15, 5]), ex);
  }
  const ex = migratedExercise();
  assert.equal(optimizeMigratedSquatBackoffs(ex, 0, [25]), ex, "warm-up log does not retarget");
  assert.equal(optimizeMigratedSquatBackoffs(ex, 1, null), ex, "no physical stack means no live retarget");
});
