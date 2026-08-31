import test from "node:test";
import assert from "node:assert/strict";

import {
  currentBeltLoad,
  isBeltLoadExercise,
  lastBeltLoadFromHistory,
  lastBeltLoadHistoryKey,
  storedBeltLoad,
} from "../lib/legacy/belt-load.js";
import { WORKOUTS } from "../lib/legacy/shared.js";
import { beltAdjustedRepScore, calcStoredSet1RM } from "../lib/legacy/standards.js";

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

test("belted reps-only sets score above raw reps, untyped rows stay reps-based", () => {
  assert.equal(beltAdjustedRepScore(12, 0), 12);
  const belted = beltAdjustedRepScore(12, 10);
  assert.ok(belted > 12 && belted < 16, `expected ~14.4, got ${belted}`);
  assert.ok(beltAdjustedRepScore(12, 15) > belted);

  // Old assist-era rows saved bodyweight in weight_lb with no load_type — raw reps.
  assert.equal(calcStoredSet1RM("Dips", 175, 12, null, null, { date: "2026-07-01" }), 12);
  // Explicit belt rows fold the belt into the score.
  const beltedOrm = calcStoredSet1RM("Dips", 10, 12, null, null, { date: "2026-08-01" }, "belt");
  assert.ok(beltedOrm > 12, `expected belted score > 12, got ${beltedOrm}`);
});

test("the exercise-level belt load is distinct from per-set history", () => {
  const history = {
    [lastBeltLoadHistoryKey("Pull-Ups")]: { weight_lb: 15, load_type: "belt" },
    "Pull-Ups|working|2": { weight_lb: 25, load_type: "belt" },
  };

  assert.equal(lastBeltLoadFromHistory("Pull-Ups", history), 15);
  assert.equal(lastBeltLoadFromHistory("Dips", history), null);
});
