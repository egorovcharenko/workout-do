import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLibraryExerciseTemplate,
  exerciseNameExists,
  firstPendingSetIndex,
  selectedSetWeight,
  shouldRestoreCustomExercise,
  skipRemainingWarmups,
} from "../lib/legacy/session-mutations.js";

test("skipping remaining warmups preserves warmups already logged", () => {
  const before = [{
    name: "Barbell Back Squat",
    sets: [
      { kind: "warmup", active: false, completed: true, reps: 10 },
      { kind: "warmup", active: true, completed: false, reps: null },
      { kind: "warmup", active: false, completed: false, reps: null },
      { kind: "work", active: false, completed: false, reps: null },
    ],
  }];

  const after = skipRemainingWarmups(before, 0);

  assert.equal(after[0].sets[0].completed, true);
  assert.equal(after[0].sets[0].reps, 10);
  assert.equal(after[0].sets[1].userSkipped, true);
  assert.equal(after[0].sets[2].userSkipped, true);
  assert.equal(after[0].sets[3].active, true);
  assert.equal(before[0].sets[1].userSkipped, undefined);
});

test("exercise navigation ignores intentionally skipped sets", () => {
  const exercise = {
    sets: [
      { completed: false, userSkipped: true },
      { completed: true },
      { completed: false },
    ],
  };
  assert.equal(firstPendingSetIndex(exercise), 2);
});

test("set selection preserves an intentional zero belt load", () => {
  assert.equal(selectedSetWeight({ weight: 0, lastWeight: 25 }), 0);
  assert.equal(selectedSetWeight({ weight: null, lastWeight: 25 }), 25);
});

test("exercise names are unique regardless of capitalization", () => {
  const exercises = [{ name: "Pull-Ups" }, { name: "Dips" }];
  assert.equal(exerciseNameExists(exercises, "pull-ups"), true);
  assert.equal(exerciseNameExists(exercises, "Cable Row"), false);
  assert.equal(exerciseNameExists(exercises, "Pull-Ups", 0), false);
});

test("library exercise templates retain staged and band-addon metadata", () => {
  const stages = [{ id: "tuck", label: "Tuck" }];
  const template = buildLibraryExerciseTemplate("Dragon Fly Progression", {
    sets: 4,
    reps: "3-5",
    equipment: "band",
    bandAddon: true,
    stages,
    session: "micro",
  });

  assert.equal(template.bandAddon, true);
  assert.equal(template.stages, stages);
  assert.equal(template.session, "micro");
  assert.equal(template.sets, 4);
});

test("unfinished custom exercises remain restorable", () => {
  assert.equal(shouldRestoreCustomExercise([{ completed: false, weight: 25 }]), true);
  assert.equal(shouldRestoreCustomExercise([]), false);
});
