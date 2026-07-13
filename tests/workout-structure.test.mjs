import test from "node:test";
import assert from "node:assert/strict";

import { WORKOUTS } from "../lib/legacy/shared.js";

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
