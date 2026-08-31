import test from "node:test";
import assert from "node:assert/strict";

import { abandonAndExit } from "../lib/legacy/abandon-workout.js";

test("abandon deletes the workout draft before exiting", async () => {
  const calls = [];
  const outcome = await abandonAndExit({
    discard: async () => { calls.push("discard"); },
    exit: () => { calls.push("exit"); },
  });

  assert.deepEqual(calls, ["discard", "exit"]);
  assert.equal(outcome.status, "abandoned");
});

test("abandon stays in the session when draft deletion fails", async () => {
  const expected = new Error("offline");
  let exited = false;

  await assert.rejects(
    abandonAndExit({
      discard: async () => { throw expected; },
      exit: () => { exited = true; },
    }),
    expected,
  );

  assert.equal(exited, false);
});
