import test from "node:test";
import assert from "node:assert/strict";
import { exerciseHintsWithDeloadBootstrap, lastBeltLoadHintsFromSessions, workingSetCountsFromSessions } from "../lib/legacy/exercise-hints.js";

const set = (exercise, setNumber, weight, reps = 10, setType = "working") => ({
  exercise,
  set_type: setType,
  set_number: setNumber,
  weight_lb: weight,
  reps: String(reps),
  bands_json: null,
  grip: null,
});

const beltSet = (exercise, setNumber, weight, reps = 3) => ({
  ...set(exercise, setNumber, weight, reps),
  load_type: "belt",
});

const session = (data) => ({
  date: "2026-07-14",
  cable_weight_mode: "per_stack",
  ...data,
});

test("an exercise with no normal history bootstraps from the latest deload", () => {
  const hints = exerciseHintsWithDeloadBootstrap([
    session({ id: "deload", is_deload: 1, sets: [set("Lat Pulldown", 1, 70, 10)] }),
    session({ id: "normal", is_deload: 0, sets: [set("Barbell Bench Press", 1, 155, 4)] }),
  ]);

  assert.equal(hints["Lat Pulldown|working|1"].weight_lb, 70);
  assert.equal(hints["Lat Pulldown|working|1"].reps, "10");
});

test("the first normal attempt permanently replaces the deload bootstrap", () => {
  const hints = exerciseHintsWithDeloadBootstrap([
    session({ id: "normal", is_deload: 0, sets: [set("Lat Pulldown", 1, 80, 9)] }),
    session({ id: "deload", is_deload: 1, sets: [set("Lat Pulldown", 1, 70, 10), set("Lat Pulldown", 2, 70, 10)] }),
  ]);

  assert.equal(hints["Lat Pulldown|working|1"].weight_lb, 80);
  assert.equal(hints["Lat Pulldown|working|2"], undefined);
});

test("bootstrap sets come from one deload session instead of mixing dates", () => {
  const hints = exerciseHintsWithDeloadBootstrap([
    session({ id: "latest-deload", is_deload: 1, sets: [set("Lat Pulldown", 1, 70, 10)] }),
    session({ id: "older-deload", is_deload: 1, sets: [set("Lat Pulldown", 1, 65, 10), set("Lat Pulldown", 2, 65, 10)] }),
  ]);

  assert.equal(hints["Lat Pulldown|working|1"].weight_lb, 70);
  assert.equal(hints["Lat Pulldown|working|2"], undefined);
});

test("normal hints for established exercises remain unchanged", () => {
  const hints = exerciseHintsWithDeloadBootstrap([
    session({ id: "latest-normal", is_deload: 0, sets: [set("Barbell Bench Press", 1, 165, 1)] }),
    session({ id: "older-normal", is_deload: 0, sets: [set("Barbell Bench Press", 1, 155, 4)] }),
    session({ id: "deload", is_deload: 1, sets: [set("Barbell Bench Press", 1, 125, 4)] }),
  ]);

  assert.equal(hints["Barbell Bench Press|working|1"].weight_lb, 165);
});

test("legacy total-load cable hints are converted to per-stack values", () => {
  const hints = exerciseHintsWithDeloadBootstrap([
    { id: "legacy", date: "2026-07-10", is_deload: 0, sets: [set("Lat Pulldown", 1, 95, 1)] },
  ]);

  assert.equal(hints["Lat Pulldown|working|1"].weight_lb, 47.5);
});

test("belt load comes from the latest workout containing the exercise", () => {
  const hints = lastBeltLoadHintsFromSessions([
    session({ id: "unrelated", sets: [set("Barbell Bench Press", 1, 155, 4)] }),
    session({ id: "latest-pull-ups", sets: [beltSet("Pull-Ups", 0, 5), beltSet("Pull-Ups", 1, 0)] }),
    session({ id: "older-pull-ups", sets: [beltSet("Pull-Ups", 1, 25)] }),
  ]);

  assert.equal(hints["Pull-Ups|working|last-belt-load"].weight_lb, 5);
});

test("a latest bodyweight-only workout resets the shared belt load", () => {
  const hints = lastBeltLoadHintsFromSessions([
    session({ id: "latest-pull-ups", sets: [beltSet("Pull-Ups", 0, 0), beltSet("Pull-Ups", 1, 0)] }),
    session({ id: "older-pull-ups", sets: [beltSet("Pull-Ups", 1, 25)] }),
  ]);

  assert.equal(hints["Pull-Ups|working|last-belt-load"].weight_lb, 0);
});

test("working set counts follow the newest session per exercise, excluding the UA opener", () => {
  const counts = workingSetCountsFromSessions([
    // Newest first: 4 pull-up sets plus the set-0 UA opener.
    session({ id: "new", sets: [set("Pull-Ups", 0, 0, 4), set("Pull-Ups", 1, 0, 4), set("Pull-Ups", 2, 0, 4), set("Pull-Ups", 3, 0, 3), set("Pull-Ups", 4, 0, 2), set("Low Row", 1, 65, 8)] }),
    session({ id: "old", sets: [set("Pull-Ups", 1, 0, 3), set("Pull-Ups", 2, 0, 2), set("Low Row", 1, 65, 8), set("Low Row", 2, 65, 8), set("Low Row", 3, 65, 8)] }),
  ]);

  assert.equal(counts["Pull-Ups"], 4);
  assert.equal(counts["Low Row"], 1);
});

test("hint maps carry last-performed counts so an added set persists", () => {
  const hints = exerciseHintsWithDeloadBootstrap([
    session({ id: "normal", is_deload: 0, sets: [set("Lat Pulldown", 1, 80, 9), set("Lat Pulldown", 2, 80, 8), set("Lat Pulldown", 3, 80, 8), set("Lat Pulldown", 4, 80, 6)] }),
  ]);

  assert.equal(hints.__counts["Lat Pulldown"], 4);
});
