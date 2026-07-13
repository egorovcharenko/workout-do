import test from "node:test";
import assert from "node:assert/strict";

import { WORKOUTS, parseRepTargetRange } from "../lib/legacy/shared.js";
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
