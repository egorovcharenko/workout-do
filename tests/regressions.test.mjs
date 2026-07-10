import test from "node:test";
import assert from "node:assert/strict";

import { localDate } from "../lib/legacy/shared.js";
import {
  canApplyResolvedSessionId,
  selectScopedSaveTiming,
  sessionUpdateConflict,
} from "../lib/session-save-scope.js";
import {
  firstToLatestTrainingDelta,
  latestSessionDeltaPercent,
  trainingPoints,
} from "../lib/deload-progress.js";

test("localDate uses local calendar fields", () => {
  assert.equal(localDate(new Date(2026, 6, 9, 23, 30)), "2026-07-09");
});

test("a stale workout save keeps its captured clock values", () => {
  const captured = { startedAt: 100, elapsed: 12 };
  const latest = { startedAt: 900, elapsed: 99 };
  assert.deepEqual(selectScopedSaveTiming("Squat:2026-07-09", "Deadlift:2026-07-09", captured, latest), captured);
  assert.deepEqual(selectScopedSaveTiming("Squat:2026-07-09", "Squat:2026-07-09", captured, latest), latest);
});

test("a resolved session id only applies to the scope that created it", () => {
  assert.equal(canApplyResolvedSessionId("Squat:2026-07-09", "Deadlift:2026-07-09", null, "old-id"), false);
  assert.equal(canApplyResolvedSessionId("Squat:2026-07-09", "Squat:2026-07-09", null, "new-id"), true);
  assert.equal(canApplyResolvedSessionId("Squat:2026-07-09", "Squat:2026-07-09", "existing", "new-id"), false);
});

test("session updates reject cross-date and cross-workout ids", () => {
  const existing = { date: "2026-07-09", workout_name: "Main: Squat" };
  assert.equal(sessionUpdateConflict(existing, { date: "2026-07-10", workout: "Main: Squat" }), "date");
  assert.equal(sessionUpdateConflict(existing, { date: "2026-07-09", workout: "Main: Deadlift" }), "workout");
  assert.equal(sessionUpdateConflict(existing, { date: "2026-07-09", workout: "Main: Squat" }), null);
});

test("deload points remain visible but do not count as regressions", () => {
  const points = [
    { date: "2026-06-20", value: 150 },
    { date: "2026-06-27", value: 160 },
    { date: "2026-07-04", value: 125, isDeload: true },
  ];
  assert.deepEqual(trainingPoints(points), points.slice(0, 2));
  assert.equal(firstToLatestTrainingDelta(points), 10);
  assert.equal(latestSessionDeltaPercent(points), null);
});

test("the next normal session compares with the prior normal session", () => {
  const points = [
    { value: 160 },
    { value: 125, isDeload: true },
    { value: 168 },
  ];
  assert.equal(latestSessionDeltaPercent(points), 5);
});
