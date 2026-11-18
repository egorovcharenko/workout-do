import test from "node:test";
import assert from "node:assert/strict";
import {
  CABLE_WEIGHT_MIN,
  CABLE_SIDE_MAX,
  CABLE_TOTAL_MAX,
  CABLE_WEIGHT_STEP,
  cableSides,
  cableWeightBounds,
  cableWeightPerSide,
  clampCableWeight,
  nextCableWeightAtLeast,
  isCableExercise,
  effectiveExerciseWeight,
  effectiveStoredExerciseWeight,
  storedCableMultiplier,
  storedExerciseInputWeight,
  usesPerStackCableWeight,
  usesSideCableWeight,
} from "../lib/legacy/cable-stack.js";
import { calcSet1RM, calcStoredSet1RM } from "../lib/legacy/standards.js";

test("lifts worked with both arms carry a total, one-sided lifts carry a side", () => {
  assert.equal(cableSides("Lat Pulldown"), 2);
  assert.equal(cableSides("Low Row"), 2);
  assert.equal(cableSides("Cable Chest Press"), 2);
  assert.equal(cableSides("Cable Chest Fly"), 2);
  assert.equal(cableSides("Cable Tricep Pushdowns"), 2);

  assert.equal(cableSides("Single-Arm Cable Rear Delt Fly"), 1);
  assert.equal(cableSides("Single-Arm Cable Lateral Raise"), 1);
  assert.equal(cableSides("Single-Leg Cable RDL"), 1);
  assert.equal(cableSides("Calf Raises"), 1);
  assert.equal(cableSides("Cable External Rotations"), 1);
  assert.equal(cableSides("Bayesian Cable Curl"), 1);
});

test("the machine caps at 260 lb in total and 130 lb per side", () => {
  assert.equal(CABLE_WEIGHT_MIN, 8);
  assert.equal(CABLE_SIDE_MAX, 130);
  assert.equal(CABLE_TOTAL_MAX, 260);
  assert.equal(CABLE_WEIGHT_STEP, 1);

  assert.deepEqual(cableWeightBounds("Lat Pulldown"), { min: 8, max: 260 });
  assert.deepEqual(cableWeightBounds("Calf Raises"), { min: 8, max: 130 });

  assert.equal(clampCableWeight(0, "Lat Pulldown"), 8);
  assert.equal(clampCableWeight(300, "Lat Pulldown"), 260);
  assert.equal(clampCableWeight(131, "Lat Pulldown"), 131);
  assert.equal(clampCableWeight(0, "Calf Raises"), 8);
  assert.equal(clampCableWeight(200, "Calf Raises"), 130);
  assert.equal(clampCableWeight(40.4, "Calf Raises"), 40);
});

test("a both-sides weight splits evenly across the arms", () => {
  assert.equal(cableWeightPerSide(200, "Lat Pulldown"), 100);
  assert.equal(cableWeightPerSide(45, "Lat Pulldown"), 22.5);
  assert.equal(cableWeightPerSide(40, "Calf Raises"), 40);
});

test("progression offers stay inside the lift's own range", () => {
  assert.equal(nextCableWeightAtLeast(100.4, "Lat Pulldown"), 101);
  assert.equal(nextCableWeightAtLeast(101, "Lat Pulldown"), 101);
  assert.equal(nextCableWeightAtLeast(400, "Lat Pulldown"), 260);
  assert.equal(nextCableWeightAtLeast(5, "Calf Raises"), 8);
  assert.equal(nextCableWeightAtLeast(5, "Lat Pulldown"), 8);
  assert.equal(nextCableWeightAtLeast(400, "Calf Raises"), 130);
});

test("cable lifts are recognized even without equipment metadata", () => {
  assert.equal(isCableExercise("Low Row"), true);
  assert.equal(isCableExercise("Cable Face Pulls"), true);
  assert.equal(isCableExercise("Calf Raises"), true);
  assert.equal(isCableExercise("Lat Pulldown"), true);
  assert.equal(isCableExercise("Dumbbell Row", "dumbbell"), false);
});

test("a weight entered today is already the load", () => {
  assert.equal(effectiveExerciseWeight("Lat Pulldown", 140), 140);
  assert.equal(effectiveExerciseWeight("Low Row", 100), 100);
  assert.equal(effectiveExerciseWeight("Cable Chest Press", 120), 120);
  assert.equal(effectiveExerciseWeight("Calf Raises", 70), 70);
});

// Everything below guards history written before Nov 18, 2026, when the weight
// was a per-stack pin value and two-stack lifts had to be doubled.
test("sets logged from Nov 18 store the real load, earlier ones keep per-stack math", () => {
  const perStack = { date: "2026-11-17", cable_weight_mode: "per_stack" };
  const sides = { date: "2026-11-18", cable_weight_mode: "per_stack" };

  assert.equal(usesSideCableWeight(perStack), false);
  assert.equal(usesSideCableWeight(sides), true);
  assert.equal(usesSideCableWeight({ date: "2026-01-01", cable_weight_mode: "sides" }), true);

  assert.equal(storedCableMultiplier("Lat Pulldown", perStack), 2);
  assert.equal(storedCableMultiplier("Lat Pulldown", sides), 1);
  assert.equal(effectiveStoredExerciseWeight("Lat Pulldown", 55, perStack), 110);
  assert.equal(effectiveStoredExerciseWeight("Lat Pulldown", 55, sides), 55);
});

// The dumbbell-era rows (logged as Dumbbell Flat Bench Press before the
// per-stack selector shipped) must keep their own load, not double. The two
// stacks the lift ran between Nov 12 and Nov 14, 2026 still count double.
test("pre-per-stack chest press history keeps its stored load", () => {
  const legacy = { date: "2026-06-01" };
  const dual = { date: "2026-11-12", cable_weight_mode: "per_stack" };
  const single = { date: "2026-11-15", cable_weight_mode: "per_stack" };
  assert.equal(effectiveStoredExerciseWeight("Cable Chest Press", 50, legacy), 50);
  assert.equal(effectiveStoredExerciseWeight("Cable Chest Press", 40, dual), 80);
  assert.equal(storedExerciseInputWeight("Cable Chest Press", 40, dual), 80);
  assert.equal(effectiveStoredExerciseWeight("Cable Chest Press", 40, single), 40);
  assert.equal(storedExerciseInputWeight("Cable Chest Press", 40, single), 40);
});

// Calf raises went single-sided on Nov 13, 2026: earlier rows ran a handle on
// each stack, later ones do not.
test("calf raise history keeps the two stacks it was logged with", () => {
  const twoStack = { date: "2026-11-01", cable_weight_mode: "per_stack" };
  const oneStack = { date: "2026-11-13", cable_weight_mode: "per_stack" };
  assert.equal(storedCableMultiplier("Calf Raises", twoStack), 2);
  assert.equal(storedCableMultiplier("Calf Raises", oneStack), 1);
  assert.equal(effectiveStoredExerciseWeight("Calf Raises", 70, twoStack), 140);
  assert.equal(effectiveStoredExerciseWeight("Calf Raises", 70, oneStack), 70);
  // The selector shows what was lifted, not the pin number it was logged as.
  assert.equal(storedExerciseInputWeight("Calf Raises", 70, twoStack), 140);
});

test("stored cable history respects the July 2026 storage transition", () => {
  const legacy = { date: "2026-07-10" };
  const current = { date: "2026-07-14" };

  assert.equal(usesPerStackCableWeight(legacy), false);
  assert.equal(usesPerStackCableWeight(current), true);
  assert.equal(effectiveStoredExerciseWeight("Lat Pulldown", 95, legacy), 95);
  assert.equal(effectiveStoredExerciseWeight("Lat Pulldown", 55, current), 110);
  assert.equal(effectiveStoredExerciseWeight("Cable Face Pulls", 30, legacy), 30);
});

test("explicit cable storage mode overrides the date fallback", () => {
  assert.equal(
    effectiveStoredExerciseWeight("Lat Pulldown", 55, { date: "2026-07-10", cable_weight_mode: "per_stack" }),
    110,
  );
  assert.equal(
    effectiveStoredExerciseWeight("Lat Pulldown", 95, { date: "2026-07-14", cable_weight_mode: "total" }),
    95,
  );
});

// Every storage generation now reports the load itself, so a hint seeded from
// an old per-stack row offers the weight that was really lifted.
test("stored rows convert to the load the selector shows today", () => {
  assert.equal(storedExerciseInputWeight("Lat Pulldown", 95, { date: "2026-07-10" }), 95);
  assert.equal(storedExerciseInputWeight("Lat Pulldown", 55, { date: "2026-07-14" }), 110);
  assert.equal(storedExerciseInputWeight("Lat Pulldown", 110, { date: "2026-11-18" }), 110);
  assert.equal(storedExerciseInputWeight("Barbell Bench Press", 155, { date: "2026-07-10" }), 155);
});

test("strength scoring reads a cable weight as the load it is", () => {
  assert.equal(calcSet1RM("Lat Pulldown", 70, 10), calcSet1RM("Cable Face Pulls", 70, 10));
  assert.ok(calcSet1RM("Lat Pulldown", 140, 10) > calcSet1RM("Lat Pulldown", 70, 10));
});

test("historical scoring no longer lets a legacy deload beat a stronger current set", () => {
  const legacyDeload = calcStoredSet1RM("Lat Pulldown", 95, 1, null, null, { date: "2026-07-10" });
  const currentSet = calcStoredSet1RM("Lat Pulldown", 55, 10, null, null, { date: "2026-07-14" });

  assert.equal(legacyDeload, 95);
  assert.equal(Math.round(currentSet), 147);
  assert.ok(currentSet > legacyDeload);
});
