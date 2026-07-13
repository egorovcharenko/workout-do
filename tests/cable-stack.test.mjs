import test from "node:test";
import assert from "node:assert/strict";
import {
  CABLE_STACK_ADD_ON_COUNT,
  CABLE_STACK_ADD_ON_WEIGHT,
  CABLE_STACK_MAX,
  CABLE_STACK_MAX_LOAD,
  CABLE_STACK_MIN,
  CABLE_STACK_STEP,
  cableStackMultiplier,
  cableStackSelection,
  cableStackWeight,
  cableStackWeightWithAddOns,
  cableTotalWeight,
  effectiveExerciseWeight,
  clampCableStackWeight,
  isCableStackExercise,
} from "../lib/legacy/cable-stack.js";
import { calcSet1RM } from "../lib/legacy/standards.js";

test("lat pulldowns and low rows use two cable stacks", () => {
  assert.equal(cableStackMultiplier("Lat Pulldown"), 2);
  assert.equal(cableStackMultiplier("Lat Pulldowns"), 2);
  assert.equal(cableStackMultiplier("Low Row"), 2);
  assert.equal(cableStackMultiplier("Seated Low Rows"), 2);
  assert.equal(cableStackMultiplier("Cable Low Row"), 2);
});

test("other cable exercises use one stack", () => {
  assert.equal(cableStackMultiplier("Cable Face Pulls"), 1);
  assert.equal(cableStackMultiplier("Cable Tricep Pushdowns"), 1);
  assert.equal(cableStackMultiplier("Single-Arm Cable Lateral Raise"), 1);
});

test("low rows are recognized as cable-stack exercises even without equipment metadata", () => {
  assert.equal(isCableStackExercise("Low Row"), true);
  assert.equal(isCableStackExercise("Cable Face Pulls"), true);
  assert.equal(isCableStackExercise("Dumbbell Row", "dumbbell"), false);
});

test("stack values round-trip through the logged total", () => {
  assert.equal(cableTotalWeight(35, 2), 70);
  assert.equal(cableStackWeight(70, 2), 35);
  assert.equal(cableTotalWeight(11.25, 1), 11.25);
  assert.equal(cableTotalWeight(12.5, 2), 25);
});

test("effective load doubles legacy pin values only for dual-stack movements", () => {
  assert.equal(effectiveExerciseWeight("Lat Pulldown", 70), 140);
  assert.equal(effectiveExerciseWeight("Lat Pulldown", 71.25), 142.5);
  assert.equal(effectiveExerciseWeight("Low Row", 50), 100);
  assert.equal(effectiveExerciseWeight("Cable Face Pulls", 30), 30);
});

test("strength scoring uses effective dual-stack load without changing single-stack scoring", () => {
  assert.equal(Math.round(calcSet1RM("Lat Pulldown", 70, 10)), 187);
  assert.equal(Math.round(calcSet1RM("Cable Face Pulls", 30, 10)), 40);
});

test("stack selector supports two 1.25 pound add-ons above each pin", () => {
  assert.equal(CABLE_STACK_MIN, 10);
  assert.equal(CABLE_STACK_MAX, 85);
  assert.equal(CABLE_STACK_STEP, 5);
  assert.equal(CABLE_STACK_ADD_ON_WEIGHT, 1.25);
  assert.equal(CABLE_STACK_ADD_ON_COUNT, 2);
  assert.equal(CABLE_STACK_MAX_LOAD, 87.5);
  assert.equal(clampCableStackWeight(0), 10);
  assert.equal(clampCableStackWeight(11.25), 11.25);
  assert.equal(clampCableStackWeight(12), 12.5);
  assert.equal(clampCableStackWeight(12.5), 12.5);
  assert.equal(clampCableStackWeight(13), 12.5);
  assert.equal(clampCableStackWeight(88), 87.5);
  assert.deepEqual(cableStackSelection(12.5), { pinWeight: 10, addOnCount: 2, stackWeight: 12.5 });
  assert.deepEqual(cableStackSelection(31.25), { pinWeight: 30, addOnCount: 1, stackWeight: 31.25 });
  assert.equal(cableStackWeightWithAddOns(30, 1), 31.25);
  assert.equal(cableStackWeightWithAddOns(85, 2), 87.5);
});
