// Renamed exercises: the old name is what saved sessions and history rows
// carry, the new name is what the program offers now. Every lookup that reads
// saved data resolves through currentExerciseName so a rename never splits
// an exercise's history, duplicates it in a session, or drops it from a
// recap. This module imports nothing, so it can be used from shared.js,
// training-block.js and the history helpers without import cycles.

const LEGACY_EXERCISE_NAMES = {
  "Dumbbell Hammer Curls": "Cable Hammer Curls",
  "Dumbbell Romanian Deadlift": "Cable Romanian Deadlift",
  "Single-Leg DB RDL": "Single-Leg Cable RDL",
  "Goblet Squat": "Cable Goblet Squat",
  "Dumbbell Flat Bench Press": "Cable Chest Press",
  "Incline Dumbbell Press": "Incline Cable Press",
  "Seated Overhead Press": "Seated Cable Overhead Press",
  "Single-Arm Dumbbell Rows": "Single-Arm Cable Rows",
  "Dumbbell Bent-Over Rows": "Cable Bent-Over Rows",
  "Reverse Flyes": "Cable Reverse Flyes",
  "Dumbbell Lateral Raises": "Cable Lateral Raises",
  "Dumbbell Bicep Curls": "Cable Bicep Curls",
  "Dumbbell Shrugs": "Cable Shrugs",
  "Overhead Dumbbell Press": "Cable Overhead Press",
  "Lunges": "Cable Reverse Lunges",
  "Bench-Supported Dumbbell Wrist Curls": "Bench-Supported Cable Wrist Curls",
  "Incline DB Curls": "Incline Cable Curls",
};

// The program's current name for an exercise, old or new.
function currentExerciseName(name) {
  return LEGACY_EXERCISE_NAMES[name] || name;
}

// Old names that map onto this current name. History rows saved before a
// rename live under the old name, so lookups keyed by exercise name must
// check these too, or the renamed exercise shows no history.
function legacyNamesFor(exerciseName) {
  return Object.entries(LEGACY_EXERCISE_NAMES)
    .filter(([, newName]) => newName === exerciseName)
    .map(([oldName]) => oldName);
}

// Saved sets for a template exercise: sets saved under its current name win,
// otherwise sets saved under any of its old names. Used when a session saved
// before a rename reloads against the renamed template.
function savedSetsForExercise(savedSetsMap, exerciseName) {
  if (!savedSetsMap) return undefined;
  if (savedSetsMap[exerciseName]) return savedSetsMap[exerciseName];
  for (const [oldName, newName] of Object.entries(LEGACY_EXERCISE_NAMES)) {
    if (newName === exerciseName && savedSetsMap[oldName]) return savedSetsMap[oldName];
  }
  return undefined;
}

export { LEGACY_EXERCISE_NAMES, currentExerciseName, legacyNamesFor, savedSetsForExercise };
