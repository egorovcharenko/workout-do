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
  "Dumbbell Bent-Over Rows",
  "Dumbbell Bicep Curls",
  "Dumbbell Flat Bench Press",
  "Dumbbell Hammer Curls",
  "Dumbbell Lateral Raises",
  "Dumbbell Romanian Deadlift",
  "Dumbbell Shrugs",
  "Cable Face Pulls",
  "Face Pulls",
  "Goblet Squat",
  "Hanging Knee Raise",
  "Incline Barbell Press",
  "Incline DB Curls",
  "Incline Dumbbell Press",
  "Lat Pulldown",
  "Low Row",
  "Lunges",
  "Overhead Dumbbell Press",
  "Overhead Tricep Extension",
  "Pallof Press",
  "Reverse Flyes",
  "Seated Overhead Press",
  "Single-Arm Cable Lateral Raise",
  "Single-Arm Dumbbell Rows",
  "Single-Leg DB RDL",
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
