import test from "node:test";
import assert from "node:assert/strict";
import { stageProgression } from "../lib/legacy/stage-progression.js";

const stages = [
  { id: "tuck", label: "Tuck" },
  { id: "single-leg", label: "Single-Leg" },
  { id: "straddle", label: "Straddle" },
];

test("two clean sets at the target unlock exactly one next stage", () => {
  const result = stageProgression(stages, [
    { stageId: "tuck", reps: 8 },
    { stageId: "tuck", reps: 9 },
  ], 2);

  assert.equal(result.mastered, true);
  assert.equal(result.previousStage.id, "tuck");
  assert.equal(result.nextStage.id, "single-leg");
});

test("a sub-target set keeps the athlete at the current stage", () => {
  const result = stageProgression(stages, [
    { stageId: "single-leg", reps: 8 },
    { stageId: "single-leg", reps: 7 },
  ], 2);

  assert.equal(result.complete, true);
  assert.equal(result.mastered, false);
  assert.equal(result.nextStage, null);
  assert.deepEqual(result.reps, [8, 7]);
});

test("mixed stages do not produce a false advancement recommendation", () => {
  const result = stageProgression(stages, [
    { stageId: "tuck", reps: 8 },
    { stageId: "single-leg", reps: 8 },
  ], 2);

  assert.equal(result.mixedStages, true);
  assert.equal(result.mastered, false);
  assert.equal(result.previousStage, null);
});

test("mastering the final stage is reported without a nonexistent next stage", () => {
  const result = stageProgression(stages, [
    { stageId: "straddle", reps: 8 },
    { stageId: "straddle", reps: 8 },
  ], 2);

  assert.equal(result.mastered, true);
  assert.equal(result.masteredTopStage, true);
  assert.equal(result.nextStage, null);
});
