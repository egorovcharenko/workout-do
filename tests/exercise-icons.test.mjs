import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const exerciseNames = [
  "Pull-Ups",
  "Band Bicep Curls",
  "Band Romanian Deadlift",
  "Band Row",
  "Band Squat",
  "Band Torso Rotation",
  "Cable Tricep Pushdowns",
  "Band Tricep Pushdowns",
  "Barbell Back Squat",
  "Barbell Bench Press",
  "Barbell RDL",
  "Barbell Shrugs",
  "Bent-Over Barbell Rows",
  "Bulgarian Split Squat",
  "Cable Torso Rotation",
  "Dragon Fly Progression",
  "Surf Pop-Up",
  "Calf Raises",
  "Dips",
  "Cable Bent-Over Rows",
  "Cable Bicep Curls",
  "Cable Chest Press",
  "Cable Hammer Curls",
  "Cable Lateral Raises",
  "Cable Romanian Deadlift",
  "Cable Shrugs",
  "Cable Face Pulls",
  "Face Pulls",
  "Cable Goblet Squat",
  "Hanging Knee Raise",
  "Incline Barbell Press",
  "Incline Cable Curls",
  "Incline Cable Press",
  "Lat Pulldown",
  "Neutral-Grip Lat Pulldown",
  "Low Row",
  "Cable Reverse Lunges",
  "Cable Overhead Press",
  "Overhead Tricep Extension",
  "Pallof Press",
  "Cable Reverse Flyes",
  "Seated Cable Overhead Press",
  "Single-Arm Cable Lateral Raise",
  "Single-Arm Cable Rear Delt Fly",
  "Single-Arm Cable Rows",
  "Single-Leg Cable RDL",
  "Standing Overhead Press"
];

function loadIconRenderer() {
  const source = fs.readFileSync("components/session/icons.js", "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.getExerciseIcon;
}

test("every known exercise uses a bundled local illustration", () => {
  const getExerciseIcon = loadIconRenderer();

  for (const name of exerciseNames) {
    const markup = getExerciseIcon(name);
    const src = markup.match(/src="([^"]+)"/)?.[1];

    assert.ok(src, `${name} should render an image`);
    assert.match(src, /^\/exercises\//, `${name} should use a local asset`);
    assert.ok(
      fs.existsSync(path.join("public", src)),
      `${name} should point to an existing asset: ${src}`
    );
  }
});

test("unknown exercises still use the fallback icon", () => {
  const getExerciseIcon = loadIconRenderer();
  assert.doesNotMatch(getExerciseIcon("Unknown Exercise"), /<img/);
});

test("sprite illustrations preserve their aspect ratio in variable-height cards", () => {
  const getExerciseIcon = loadIconRenderer();

  assert.match(
    getExerciseIcon("Barbell Back Squat"),
    /aspect-ratio:1 \/ 1/,
    "sprite crops should use a square canvas instead of stretching to the card height"
  );
  assert.doesNotMatch(
    getExerciseIcon("Pull-Ups"),
    /aspect-ratio:1 \/ 1/,
    "standalone artwork should continue using its intrinsic aspect ratio"
  );
});
