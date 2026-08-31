import test from "node:test";
import assert from "node:assert/strict";

import { finishAndExit } from "../lib/legacy/finish-workout.js";

test("finish waits for a successful save before exiting", async () => {
  const calls = [];
  const outcome = await finishAndExit({
    save: async () => { calls.push("save"); },
    exit: () => { calls.push("exit"); },
    wait: () => new Promise(() => {}),
  });

  assert.deepEqual(calls, ["save", "exit"]);
  assert.equal(outcome.status, "saved");
});

test("finish still exits when the save fails", async () => {
  let exited = false;
  const expected = new Error("offline");
  const outcome = await finishAndExit({
    save: async () => { throw expected; },
    exit: () => { exited = true; },
    wait: () => new Promise(() => {}),
  });

  assert.equal(exited, true);
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.error, expected);
});

test("finish exits after the deadline when a save hangs", async () => {
  let exited = false;
  const outcome = await finishAndExit({
    save: () => new Promise(() => {}),
    exit: () => { exited = true; },
    timeoutMs: 2500,
    wait: async (ms) => { assert.equal(ms, 2500); },
  });

  assert.equal(exited, true);
  assert.equal(outcome.status, "timed_out");
});
