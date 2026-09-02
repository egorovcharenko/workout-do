import test from "node:test";
import assert from "node:assert/strict";

import {
  BELT_PLATES,
  barbellPlateChanges,
  decomposeBarbellLoad,
  decomposeBeltLoad,
  nearestBarbellWeightByPlateChanges,
  removeBarbellPlate,
  removeBeltPlate,
  restackBarbellLoad,
} from "../lib/legacy/plate-load.js";

test("belt plate options include fractional assistance plates", () => {
  assert.ok(BELT_PLATES.includes(1.25));
  assert.ok(BELT_PLATES.includes(0.5));
  assert.deepEqual(decomposeBeltLoad(1.75), [1.25, 0.5]);
  assert.deepEqual(decomposeBeltLoad(28.75), [25, 2.5, 1.25]);
});

test("clicking a loaded belt plate removes exactly that plate", () => {
  assert.equal(removeBeltPlate(70, 45), 25);
  assert.equal(removeBeltPlate(27.5, 2.5), 25);
  assert.equal(removeBeltPlate(10, 15), 0);
});

test("clicking a loaded barbell plate removes it from both sides", () => {
  assert.equal(removeBarbellPlate(225, 45), 135);
  assert.equal(removeBarbellPlate(100, 2.5), 95);
  assert.equal(removeBarbellPlate(45, 45), 45);
});

test("barbell plates decompose per side, largest first", () => {
  assert.deepEqual(decomposeBarbellLoad(175), [45, 15, 5]);
  assert.deepEqual(decomposeBarbellLoad(45), []);
  assert.deepEqual(decomposeBarbellLoad(30), []);
});

test("plate changes count everything outside the shared inner stack", () => {
  assert.equal(barbellPlateChanges(175, 165), 1); // pull the 5
  assert.equal(barbellPlateChanges(175, 155), 3); // pull 15 + 5, add 10
  assert.equal(barbellPlateChanges(155, 165), 2); // swap 10 for 15
  assert.equal(barbellPlateChanges(125, 145), 4); // 35+5 -> 45+5: the outer 5 comes off too
  assert.equal(barbellPlateChanges(135, 135), 0);
});

test("nearest weight by plate changes stays within the tolerance window", () => {
  // 90% of 175 is 157.5: 155 (45+10) is three swaps, 160 (45+10+2.5) is four.
  assert.equal(nearestBarbellWeightByPlateChanges(175, 157.5), 155);
  // 165 would be a single plate change but sits outside ±5 of 157.5.
  assert.notEqual(nearestBarbellWeightByPlateChanges(175, 157.5), 165);
  // A wider window lets it through.
  assert.equal(nearestBarbellWeightByPlateChanges(175, 157.5, { tolerance: 10 }), 165);
  // 90% of 165 is 148.5: 145 (45+5) beats 150 (45+5+2.5).
  assert.equal(nearestBarbellWeightByPlateChanges(165, 148.5), 145);
  assert.equal(nearestBarbellWeightByPlateChanges(125, 112.5), 115);
  assert.equal(nearestBarbellWeightByPlateChanges(45, 20), 45);
});

test("restacking keeps the plates already on the bar", () => {
  assert.deepEqual(restackBarbellLoad([35], 135), [35, 10]); // not a lone 45
  assert.deepEqual(restackBarbellLoad([35, 10], 155), [35, 10, 10]);
  assert.deepEqual(restackBarbellLoad([45, 15, 5], 165), [45, 15]); // pull the outer 5
  assert.deepEqual(restackBarbellLoad([45, 15, 5], 145), [45, 5]);
  assert.deepEqual(restackBarbellLoad([25], 175), [25, 35, 5]);
  assert.deepEqual(restackBarbellLoad([], 135), [45]);
  assert.deepEqual(restackBarbellLoad([45], 45), []);
});
