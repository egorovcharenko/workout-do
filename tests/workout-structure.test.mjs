import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { DRAGONFLY_STAGES, WORKOUTS, parseRepTargetRange } from "../lib/legacy/shared.js";
import { isRepsOnlyExercise } from "../lib/legacy/standards.js";

test("standing overhead press and lat pulldown are independent exercises", () => {
  const workout = WORKOUTS.find((candidate) => candidate.id === "main-a");
  const overheadPress = workout.exercises.find((exercise) => exercise.name === "Standing Overhead Press");
  const latPulldown = workout.exercises.find((exercise) => exercise.name === "Lat Pulldown");

  assert.ok(overheadPress);
  assert.ok(latPulldown);
  assert.equal(overheadPress.superset, undefined);
  assert.equal(overheadPress.supersetExercises, undefined);
  assert.equal(latPulldown.superset, undefined);
  assert.equal(latPulldown.supersetExercises, undefined);
  assert.equal(overheadPress.warmups, 1);
  assert.equal(latPulldown.noWarmup, true);
});

test("deadlift day uses low cable rows instead of bent-over barbell rows", () => {
  const workout = WORKOUTS.find((candidate) => candidate.id === "main-b");
  const latPulldownIndex = workout.exercises.findIndex((exercise) => exercise.name === "Lat Pulldown");
  const lowRow = workout.exercises[latPulldownIndex + 1];

  assert.equal(lowRow.name, "Low Row");
  assert.equal(lowRow.equipment, "cable");
  assert.equal(lowRow.sets, 3);
  assert.equal(lowRow.warmups, 1);
  assert.equal(workout.exercises.some((exercise) => exercise.name === "Bent-Over Barbell Rows"), false);
});

test("main workout pull-ups do not show assisted progression instructions", () => {
  for (const workoutId of ["main-a", "main-b"]) {
    const workout = WORKOUTS.find((candidate) => candidate.id === workoutId);
    const pullUps = workout.exercises.find((exercise) => exercise.name === "Pull-Ups");

    assert.ok(pullUps);
    assert.equal(pullUps.sets, 3);
    assert.equal(pullUps.notes, undefined);
  }
});

test("surf pop-up follows dragon fly in both micro workouts", () => {
  for (const workoutId of ["micro-arms", "micro-delts"]) {
    const workout = WORKOUTS.find((candidate) => candidate.id === workoutId);
    const dragonFlyIndex = workout.exercises.findIndex((exercise) => exercise.name === "Dragon Fly Progression");
    const surfPopUp = workout.exercises[dragonFlyIndex + 1];

    assert.ok(dragonFlyIndex >= 0);
    assert.equal(surfPopUp.name, "Surf Pop-Up");
    assert.equal(surfPopUp.sets, 3);
    assert.equal(surfPopUp.reps, "5");
    assert.equal(surfPopUp.repsOnly, true);
    assert.equal(surfPopUp.noWarmup, true);
  }
  assert.equal(isRepsOnlyExercise("Surf Pop-Up"), true);
  assert.deepEqual(parseRepTargetRange("5"), [5, 5]);
});

test("every dragon fly stage uses a bundled illustration", () => {
  assert.equal(DRAGONFLY_STAGES.length, 6);

  for (const stage of DRAGONFLY_STAGES) {
    assert.match(stage.demoUrl, /^\/exercises\/dragon-fly\/.+\.png$/);
    assert.equal(stage.demoSourceUrl, undefined);
    assert.equal(existsSync(new URL(`../public${stage.demoUrl}`, import.meta.url)), true);
  }
});
