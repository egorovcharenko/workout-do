import test from "node:test";
import assert from "node:assert/strict";
import {
  CABLE_STACK_MAX,
  CABLE_STACK_MIN,
  CABLE_STACK_STEP,
  cableStackMultiplier,
  cableStackWeight,
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
  assert.equal(cableTotalWeight(17.5, 1), 17.5);
});

test("effective load doubles legacy pin values only for dual-stack movements", () => {
  assert.equal(effectiveExerciseWeight("Lat Pulldown", 70), 140);
  assert.equal(effectiveExerciseWeight("Low Row", 50), 100);
  assert.equal(effectiveExerciseWeight("Cable Face Pulls", 30), 30);
});

test("strength scoring uses effective dual-stack load without changing single-stack scoring", () => {
  assert.equal(Math.round(calcSet1RM("Lat Pulldown", 70, 10)), 187);
  assert.equal(Math.round(calcSet1RM("Cable Face Pulls", 30, 10)), 40);
});

test("stack selector snaps to the real 10–85 pound range in 5 pound steps", () => {
  assert.equal(CABLE_STACK_MIN, 10);
  assert.equal(CABLE_STACK_MAX, 85);
  assert.equal(CABLE_STACK_STEP, 5);
  assert.equal(clampCableStackWeight(0), 10);
  assert.equal(clampCableStackWeight(12), 10);
  assert.equal(clampCableStackWeight(13), 15);
  assert.equal(clampCableStackWeight(90), 85);
});
