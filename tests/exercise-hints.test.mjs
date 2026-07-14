import test from "node:test";
import assert from "node:assert/strict";
import { exerciseHintsWithDeloadBootstrap } from "../lib/legacy/exercise-hints.js";

const set = (exercise, setNumber, weight, reps = 10, setType = "working") => ({
  exercise,
  set_type: setType,
  set_number: setNumber,
  weight_lb: weight,
  reps: String(reps),
  bands_json: null,
  grip: null,
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
