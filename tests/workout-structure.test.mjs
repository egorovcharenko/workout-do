import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { DRAGONFLY_STAGES, LEGACY_WORKOUT_NAMES, SWAP_GROUPS, WORKOUTS } from "../lib/legacy/shared.js";

test("program workouts use exercise-led focus names and preserve old aliases", () => {
  assert.deepEqual(
    WORKOUTS.filter((workout) => workout.program).map((workout) => workout.name),
    ["Squat Focus", "Dips Focus", "RDL Focus", "Shrugs Focus"],
  );
  assert.equal(LEGACY_WORKOUT_NAMES["Main: Squat"], "Squat Focus");
  assert.equal(LEGACY_WORKOUT_NAMES["Micro: Arms"], "Dips Focus");
  assert.equal(LEGACY_WORKOUT_NAMES["Main: Deadlift"], "RDL Focus");
  assert.equal(LEGACY_WORKOUT_NAMES["Micro: Delts & Traps"], "Shrugs Focus");
});

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

test("main squat uses top-set and back-off progression targets", () => {
  const workout = WORKOUTS.find((candidate) => candidate.id === "main-a");
  const squat = workout.exercises.find((exercise) => exercise.name === "Barbell Back Squat");

  assert.equal(squat.sets, 3);
  assert.equal(squat.reps, "1x5-8, 2x8-10");
  assert.deepEqual(squat.defaultWork, [125, 115, 115]);
  assert.match(squat.notes, /\+5 lb at 8/);
  assert.match(squat.notes, /both hit 10/);
});

test("deadlift day uses low cable rows instead of bent-over barbell rows", () => {
  const workout = WORKOUTS.find((candidate) => candidate.id === "main-b");
  const latPulldownIndex = workout.exercises.findIndex((exercise) => exercise.name === "Neutral-Grip Lat Pulldown");
  const lowRow = workout.exercises[latPulldownIndex + 1];

  assert.equal(lowRow.name, "Low Row");
  assert.equal(lowRow.equipment, "cable");
  assert.equal(lowRow.sets, 3);
  assert.equal(lowRow.noWarmup, true);
  assert.equal(lowRow.warmups, undefined);
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

test("micro days close with dragon fly, add leg accessories, and drop surf pop-up", () => {
  const arms = WORKOUTS.find((candidate) => candidate.id === "micro-arms");
  const delts = WORKOUTS.find((candidate) => candidate.id === "micro-delts");

  assert.ok(arms.exercises.some((exercise) => exercise.name === "Lunges"));
  assert.ok(delts.exercises.some((exercise) => exercise.name === "Calf Raises"));
  assert.equal(arms.exercises[arms.exercises.length - 1].name, "Dragon Fly Progression");
  assert.equal(delts.exercises[delts.exercises.length - 1].name, "Dragon Fly Progression");

  const allNames = WORKOUTS.flatMap((workout) => workout.exercises.flatMap((exercise) => [
    exercise.name,
    ...(exercise.supersetExercises || []).map((sub) => sub.name),
  ]));
  assert.equal(allNames.includes("Surf Pop-Up"), false);
});

test("rear delt flyes and incline curls are the only superset", () => {
  const wrappers = WORKOUTS.flatMap((workout) =>
    workout.exercises.filter((exercise) => exercise.supersetExercises),
  );
  const directGroups = WORKOUTS.flatMap((workout) =>
    workout.exercises.filter((exercise) => exercise.superset),
  );

  assert.equal(wrappers.length, 1);
  assert.deepEqual(
    wrappers[0].supersetExercises.map((exercise) => exercise.name),
    ["Single-Arm Cable Rear Delt Fly", "Incline DB Curls"],
  );
  assert.equal(directGroups.length, 0);
});

test("hanging knee raises are absent from workouts and the exercise library", () => {
  const workoutNames = WORKOUTS.flatMap((workout) =>
    workout.exercises.flatMap((exercise) => [
      exercise.name,
      ...(exercise.supersetExercises || []).map((sub) => sub.name),
    ]),
  );
  const libraryNames = SWAP_GROUPS.flatMap((group) =>
    group.exercises.map((exercise) => exercise.name),
  );

  assert.equal(workoutNames.includes("Hanging Knee Raise"), false);
  assert.equal(libraryNames.includes("Hanging Knee Raise"), false);
});

test("every dragon fly stage uses a bundled illustration", () => {
  assert.equal(DRAGONFLY_STAGES.length, 7);

  for (const stage of DRAGONFLY_STAGES) {
    assert.match(stage.demoUrl, /^\/exercises\/dragon-fly\/.+\.png$/);
    assert.equal(stage.demoSourceUrl, undefined);
    assert.equal(existsSync(new URL(`../public${stage.demoUrl}`, import.meta.url)), true);
  }
});
