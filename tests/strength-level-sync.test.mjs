import test from "node:test";
import assert from "node:assert/strict";

import {
  LB_TO_KG,
  SL_EXERCISE_MAP,
  buildHistorySyncPlan,
  buildStoredSessionPayload,
  buildStrengthLevelHistorySnippet,
  storedSetWeightLb,
} from "../lib/legacy/strength-level-sync.js";

const kg = (lb) => Math.round(lb * LB_TO_KG * 10) / 10;

function session(overrides = {}) {
  return {
    workout_name: "Squat Focus",
    date: "2026-08-20",
    finished_at: "2026-08-20T18:00:00Z",
    cable_weight_mode: "per_stack",
    sets: [],
    ...overrides,
  };
}

test("plain barbell sets pass their stored weight through", () => {
  const s = session();
  assert.equal(
    storedSetWeightLb({ exercise: "Barbell Back Squat", weight_lb: 185 }, s),
    185,
  );
});

test("per-stack cable rows upload the true combined load", () => {
  const s = session();
  assert.equal(
    storedSetWeightLb({ exercise: "Lat Pulldown", weight_lb: 80 }, s),
    160,
  );
});

test("reps-only rows never use stored weight: belt is added load, bands are negative, bodyweight is zero", () => {
  const s = session();
  // Older reps-only rows stored bodyweight in weight_lb — must be ignored.
  assert.equal(
    storedSetWeightLb({ exercise: "Pull-Ups", weight_lb: 175 }, s),
    0,
  );
  assert.equal(
    storedSetWeightLb(
      { exercise: "Pull-Ups", weight_lb: 25, load_type: "belt" },
      s,
    ),
    25,
  );
  assert.equal(
    storedSetWeightLb(
      { exercise: "Pull-Ups", weight_lb: 175, bands_json: "[30,15]" },
      s,
    ),
    -45,
  );
});

test("payload keeps set order, marks warmups, converts to kg, and reports unmapped", () => {
  const s = session({
    sets: [
      { exercise: "Barbell Back Squat", set_type: "warmup", reps: "5", weight_lb: 95 },
      { exercise: "Barbell Back Squat", set_type: "working", reps: "8", weight_lb: 185 },
      { exercise: "Dragon Fly Progression", set_type: "working", reps: "6", grip: "tuck" },
      { exercise: "Barbell Back Squat", set_type: "working", reps: "0", weight_lb: 185 },
    ],
  });
  const p = buildStoredSessionPayload(s);
  assert.equal(p.name, "Squat Focus");
  assert.equal(p.date, "2026-08-20");
  assert.equal(p.exercises.length, 1);
  assert.equal(p.setCount, 2);
  assert.deepEqual(p.unmapped, ["Dragon Fly Progression"]);
  const sets = p.exercises[0].sets;
  assert.equal(sets[0].warmup, true);
  assert.equal(sets[0].weight, kg(95));
  assert.equal(sets[1].warmup, false);
  assert.equal(sets[1].weight, kg(185));
  assert.equal(
    p.exercises[0].exercise_id,
    SL_EXERCISE_MAP["Barbell Back Squat"],
  );
});

test("history plan keeps only finished sessions with mapped sets, oldest first", () => {
  const finished = session({
    date: "2026-08-22",
    sets: [{ exercise: "Barbell Back Squat", set_type: "working", reps: "5", weight_lb: 185 }],
  });
  const earlier = session({
    date: "2026-08-01",
    sets: [{ exercise: "Dips", set_type: "working", reps: "10" }],
  });
  const unfinished = session({
    date: "2026-08-23",
    finished_at: null,
    sets: [{ exercise: "Barbell Back Squat", set_type: "working", reps: "5", weight_lb: 185 }],
  });
  const unmappableOnly = session({
    date: "2026-08-21",
    sets: [{ exercise: "Dragon Fly Progression", set_type: "working", reps: "6" }],
  });
  const plan = buildHistorySyncPlan([finished, unfinished, unmappableOnly, earlier]);
  assert.deepEqual(
    plan.workouts.map((w) => w.date),
    ["2026-08-01", "2026-08-22"],
  );
  assert.equal(plan.unfinished, 1);
  assert.equal(plan.empty, 1);
  assert.deepEqual(plan.unmapped, ["Dragon Fly Progression"]);
});

test("snippet embeds the workouts and dedupes by date+name against the existing list", () => {
  const plan = buildHistorySyncPlan([
    session({
      date: "2026-08-22",
      sets: [{ exercise: "Barbell Back Squat", set_type: "working", reps: "5", weight_lb: 185 }],
    }),
  ]);
  const snippet = buildStrengthLevelHistorySnippet(plan.workouts);
  assert.ok(snippet.startsWith("javascript:("));
  assert.ok(snippet.includes("2026-08-22"));
  assert.ok(snippet.includes("Squat Focus"));
  // The SL-side guard: skip anything already present, keyed date+name.
  assert.ok(snippet.includes("have.has(key(W.date, W.name))"));
  // Never proceed without the existing-workouts list (duplicate protection).
  assert.ok(snippet.includes("aborting so nothing gets duplicated"));
});

test("snippet matches renamed sessions against their pre-rename Strength Level name", () => {
  const plan = buildHistorySyncPlan([
    session({
      date: "2026-06-21",
      sets: [{ exercise: "Barbell Back Squat", set_type: "working", reps: "5", weight_lb: 185 }],
    }),
  ]);
  const snippet = buildStrengthLevelHistorySnippet(plan.workouts);
  // Strength Level still stores the pre-rename name, so the legacy map has to
  // ride along or the session uploads a second time under its new name.
  assert.ok(snippet.includes('"Main A":"Squat Focus"'));

  // Run the snippet's own key() against both spellings of the same session.
  const runner = snippet.slice("javascript:".length, snippet.lastIndexOf(";void 0;"));
  const args = runner.slice(runner.indexOf(")(") + 2, runner.length - 1);
  const legacyMap = JSON.parse(args.slice(args.lastIndexOf(",{") + 1));
  const key = (date, name) => date + " " + (legacyMap[name] || name);
  assert.equal(key("2026-06-21", "Main A"), key("2026-06-21", "Squat Focus"));
  assert.notEqual(key("2026-06-21", "Main A"), key("2026-06-21", "RDL Focus"));
});

// A NUL once crept into the date+name separator on both sides of the compare,
// so matching still worked and nothing caught it. Keep the key printable.
test("the snippet's match key uses a real space, not a stray control byte", () => {
  const snippet = buildStrengthLevelHistorySnippet(
    buildHistorySyncPlan([
      session({ sets: [{ exercise: "Barbell Back Squat", set_type: "working", reps: "5", weight_lb: 185 }] }),
    ]).workouts,
  );
  assert.ok(!/[\u0000-\u0008\u000b-\u001f]/.test(snippet));
  assert.ok(snippet.includes('return date + " " + (LEGACY[name] || name);'));
});
