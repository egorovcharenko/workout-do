import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_EXERCISE_NAMES, currentExerciseName, legacyNamesFor, savedSetsForExercise } from "../lib/legacy/exercise-renames.js";
import * as shared from "../lib/legacy/shared.js";
import { hintsFromSessions, workingSetCountsFromSessions } from "../lib/legacy/exercise-hints.js";
import { buildExerciseSessionHistory } from "../lib/legacy/exercise-session-history.js";

const currentNames = new Set([
  ...shared.ALL_WORKOUTS.flatMap(w => w.exercises.map(e => e.name)),
  ...shared.SWAP_GROUPS.flatMap(g => g.exercises.map(e => e.name)),
]);

test("every renamed exercise maps onto an exercise the program still offers", () => {
  for (const [oldName, newName] of Object.entries(LEGACY_EXERCISE_NAMES)) {
    assert.ok(currentNames.has(newName), `${newName} should exist in the program or swaps`);
    assert.ok(!currentNames.has(oldName), `${oldName} should no longer be offered`);
  }
});

test("currentExerciseName leaves unknown names alone", () => {
  assert.equal(currentExerciseName("Dips"), "Dips");
  assert.equal(currentExerciseName("Dumbbell Hammer Curls"), "Cable Hammer Curls");
});

test("savedSetsForExercise prefers current-name sets and falls back to old-name sets", () => {
  const map = { "Dumbbell Hammer Curls": ["old"], "Cable Hammer Curls": ["new"] };
  assert.deepEqual(savedSetsForExercise(map, "Cable Hammer Curls"), ["new"]);
  assert.deepEqual(savedSetsForExercise({ "Dumbbell Hammer Curls": ["old"] }, "Cable Hammer Curls"), ["old"]);
  assert.equal(savedSetsForExercise({}, "Cable Hammer Curls"), undefined);
});

test("history hints count rows saved under a renamed exercise's old name", () => {
  const sessions = [{ id: "s1", sets: [
    { exercise: "Dumbbell Hammer Curls", set_type: "working", set_number: 1, weight_lb: 20, reps: "13", bands_json: null, grip: null },
    { exercise: "Dumbbell Hammer Curls", set_type: "working", set_number: 2, weight_lb: 20, reps: "7", bands_json: null, grip: null },
  ] }];
  const hints = hintsFromSessions(sessions);
  assert.equal(hints["Cable Hammer Curls|working|1"].weight_lb, 20);
  assert.equal(hints["Cable Hammer Curls|working|1"].reps, "13");
  assert.equal(hints["Dumbbell Hammer Curls|working|1"], undefined);
  assert.equal(workingSetCountsFromSessions(sessions)["Cable Hammer Curls"], 2);
});

test("per-exercise history includes rows saved under the old name", () => {
  const history = [{ id: "s1", date: "2026-11-02", sets: [
    { exercise: "Dumbbell Hammer Curls", set_type: "working", set_number: 1, weight_lb: 20, reps: "13" },
  ] }];
  const { rows } = buildExerciseSessionHistory(history, "Cable Hammer Curls");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sets[0].weight_lb, 20);
});

test("legacyNamesFor lists the old names for a renamed exercise", () => {
  assert.deepEqual(legacyNamesFor("Bench-Supported Cable Wrist Curls"), ["Bench-Supported Dumbbell Wrist Curls"]);
  assert.deepEqual(legacyNamesFor("Cable Hammer Curls"), ["Dumbbell Hammer Curls"]);
  assert.deepEqual(legacyNamesFor("Barbell RDL"), []);
});

test("findExerciseConfig resolves an old name to the cable exercise", () => {
  const config = shared.findExerciseConfig("Dumbbell Hammer Curls");
  assert.equal(config.name, "Cable Hammer Curls");
  assert.equal(config.equipment, "cable");
  assert.equal(shared.findExerciseConfig("Bench-Supported Dumbbell Wrist Curls").name, "Bench-Supported Cable Wrist Curls");
});
