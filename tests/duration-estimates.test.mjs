import test from "node:test";
import assert from "node:assert/strict";
import {
  addLiveExerciseTime,
  buildExerciseDurationHistory,
  currentSessionExerciseTimes,
  estimateExerciseDurationMeta,
  loggedAtForSetUpdate,
  sessionExerciseDurations,
} from "../lib/legacy/duration-estimates.js";

function set(exercise, minute) {
  return {
    exercise,
    logged_at: `2026-07-01T10:${String(minute).padStart(2, "0")}:00.000Z`,
  };
}

test("historical exercise duration follows the set timestamp chain", () => {
  const result = sessionExerciseDurations({
    started_at: "2026-07-01T10:00:00.000Z",
    sets: [set("Lat Pulldown", 2), set("Lat Pulldown", 4), set("Face Pulls", 6)],
  });
  assert.deepEqual(result["Lat Pulldown"], { durationSec: 240, setCount: 2 });
  assert.deepEqual(result["Face Pulls"], { durationSec: 120, setCount: 1 });
});

test("duration history ignores the active session and deload attempts", () => {
  const history = [
    { id: "active", date: "2026-07-03", sets: [set("Lat Pulldown", 2)] },
    { id: "deload", date: "2026-07-02", is_deload: 1, sets: [set("Lat Pulldown", 3)] },
    { id: "normal", date: "2026-07-01", sets: [set("Lat Pulldown", 4)] },
  ];
  const result = buildExerciseDurationHistory(history, { excludeSessionId: "active" });
  assert.equal(result["Lat Pulldown"].length, 1);
  assert.equal(result["Lat Pulldown"][0].sessionId, "normal");
});

test("smart estimate learns from attempts and converges to actual when complete", () => {
  const exercise = {
    name: "Cable Face Pulls",
    equipment: "cable",
    rest: 60,
    sets: [
      { kind: "work", completed: false },
      { kind: "work", completed: false },
      { kind: "work", completed: false },
    ],
  };
  const learned = estimateExerciseDurationMeta(exercise, [
    { durationSec: 360, setCount: 3 },
    { durationSec: 330, setCount: 3 },
    { durationSec: 345, setCount: 3 },
  ]);
  assert.equal(learned.sampleCount, 3);
  assert.equal(learned.source, "history");
  assert.ok(learned.estimatedSec > 300);

  const complete = estimateExerciseDurationMeta(
    { ...exercise, sets: exercise.sets.map(() => ({ completed: true })) },
    [],
    410,
  );
  assert.equal(complete.estimatedSec, 410);
  assert.equal(complete.actualSec, 410);
  assert.equal(complete.source, "actual");
});

test("current exercise actual time keeps ticking after the last logged set", () => {
  const result = addLiveExerciseTime(
    { 0: 120 },
    Date.parse("2026-07-01T10:02:00.000Z"),
    Date.parse("2026-07-01T10:00:00.000Z"),
    1,
    Date.parse("2026-07-01T10:05:00.000Z"),
  );
  assert.equal(result[0], 120);
  assert.equal(result[1], 180);
});

test("reopening a logged set keeps its exercise duration", () => {
  const startedAt = Date.parse("2026-07-01T10:00:00.000Z");
  const result = currentSessionExerciseTimes([
    {
      name: "Barbell Back Squat",
      sets: [
        { completed: true, logged_at: "2026-07-01T10:02:00.000Z" },
        { completed: false, logged_at: "2026-07-01T10:04:00.000Z" },
      ],
    },
  ], startedAt);

  assert.equal(result.byExercise[0], 240);
  assert.equal(result.bySet["2026-07-01T10:04:00.000Z"], 120);
});

test("correcting a logged set preserves its original timestamp", () => {
  const original = "2026-07-01T10:04:00.000Z";
  const correctionTime = "2026-07-01T10:20:00.000Z";
  assert.equal(loggedAtForSetUpdate({ logged_at: original }, correctionTime), original);
  assert.equal(loggedAtForSetUpdate({}, correctionTime), correctionTime);
});
