import test from "node:test";
import assert from "node:assert/strict";

import { currentBeltLoad, isBeltLoadExercise, storedBeltLoad } from "../lib/legacy/belt-load.js";
import { WORKOUTS } from "../lib/legacy/shared.js";

test("pull-ups and dips are belt-load exercises wherever they appear", () => {
  assert.equal(isBeltLoadExercise("Pull-Ups"), true);
  assert.equal(isBeltLoadExercise("Dips"), true);
  assert.equal(isBeltLoadExercise("Hanging Knee Raise"), false);

  const configuredNames = WORKOUTS.flatMap((workout) => workout.exercises.flatMap((exercise) => [
    exercise.name,
    ...(exercise.supersetExercises || []).map((sub) => sub.name),
  ]));
  assert.ok(configuredNames.includes("Pull-Ups"));
  assert.ok(configuredNames.includes("Dips"));
  assert.equal(configuredNames.filter(isBeltLoadExercise).every((name) => name === "Pull-Ups" || name === "Dips"), true);
});

test("belt load restores only explicitly typed history", () => {
  assert.equal(storedBeltLoad({ weight_lb: 25, load_type: "belt" }), 25);
  assert.equal(storedBeltLoad({ weight_lb: 175 }), 0);
  assert.equal(storedBeltLoad({ weight_lb: -10, load_type: "belt" }), 0);
});

test("current belt load is normalized before save", () => {
  assert.equal(currentBeltLoad({ weight: 35 }), 35);
  assert.equal(currentBeltLoad({ weight: "12.5" }), 12.5);
  assert.equal(currentBeltLoad({ weight: -5 }), 0);
  assert.equal(currentBeltLoad({}), 0);
});
