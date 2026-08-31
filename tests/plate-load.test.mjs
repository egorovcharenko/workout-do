import test from "node:test";
import assert from "node:assert/strict";

import { BELT_PLATES, decomposeBeltLoad, removeBarbellPlate, removeBeltPlate } from "../lib/legacy/plate-load.js";

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
