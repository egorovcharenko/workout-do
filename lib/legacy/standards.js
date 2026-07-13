import { findExerciseConfig } from "./shared.js";
import { effectiveExerciseWeight } from "./cable-stack.js";

const EXERCISE_MUSCLES = {
  "Barbell RDL": { primary: ["hamstrings", "glutes", "lower_back"], secondary: ["upper_back", "lats", "quads", "forearms", "core"], ratios: { hamstrings: 1.0, glutes: 1.0, lower_back: 1.0, upper_back: 0.5, lats: 0.3, quads: 0.3, forearms: 0.4, core: 0.3 } },
  "Dumbbell Lateral Raises": { primary: ["shoulders"], secondary: [], ratios: { shoulders: 1.0 } },
  "Single-Arm Cable Lateral Raise": { primary: ["shoulders"], secondary: [], ratios: { shoulders: 1.0 } },
  "Incline DB Curls": { primary: ["biceps"], secondary: ["forearms"], ratios: { biceps: 1.0, forearms: 0.3 } },
  "Overhead Dumbbell Press": { primary: ["shoulders"], secondary: ["triceps"], ratios: { shoulders: 1.0, triceps: 0.4 } },
  "Dumbbell Bicep Curls": { primary: ["biceps"], secondary: ["forearms"], ratios: { biceps: 1.0, forearms: 0.3 } },
  "Band Bicep Curls": { primary: ["biceps"], secondary: ["forearms"], ratios: { biceps: 1.0, forearms: 0.3 } },
  "Overhead Tricep Extension": { primary: ["triceps"], secondary: [], ratios: { triceps: 1.0 } },
  "Cable Tricep Pushdowns": { primary: ["triceps"], secondary: [], ratios: { triceps: 1.0 } },
  "Dumbbell Hammer Curls": { primary: ["biceps"], secondary: ["forearms"], ratios: { biceps: 1.0, forearms: 0.4 } },
  "Dips": { primary: ["triceps"], secondary: ["chest", "shoulders"], ratios: { triceps: 1.0, chest: 0.4, shoulders: 0.4 } },
  "Dumbbell Bent-Over Rows": { primary: ["lats"], secondary: ["biceps", "rear_delts"], ratios: { lats: 1.0, biceps: 0.3, rear_delts: 0.4 } },
  "Single-Arm Dumbbell Rows": { primary: ["lats"], secondary: ["biceps", "rear_delts"], ratios: { lats: 1.0, biceps: 0.3, rear_delts: 0.4 } },
  "Low Row": { primary: ["lats", "upper_back"], secondary: ["biceps", "rear_delts"], ratios: { lats: 1.0, upper_back: 1.0, biceps: 0.3, rear_delts: 0.4 } },
  "Pull-Ups": { primary: ["lats"], secondary: ["biceps", "upper_back", "rear_delts"], ratios: { lats: 1.0, biceps: 0.35, upper_back: 0.5, rear_delts: 0.3 } },
  "Reverse Flyes": { primary: ["rear_delts"], secondary: ["upper_back"], ratios: { rear_delts: 1.0, upper_back: 0.4 } },
  "Goblet Squat": { primary: ["quads", "glutes"], secondary: ["core"], ratios: { quads: 1.0, glutes: 1.0, core: 0.3 } },
  "Bulgarian Split Squat": { primary: ["quads", "glutes"], secondary: ["hamstrings", "core"], ratios: { quads: 1.0, glutes: 1.0, hamstrings: 0.4, core: 0.2 } },
  "Dumbbell Flat Bench Press": { primary: ["chest"], secondary: ["triceps", "shoulders"], ratios: { chest: 1.0, triceps: 0.4, shoulders: 0.4 } },
  "Barbell Bench Press": { primary: ["chest"], secondary: ["triceps", "shoulders"], ratios: { chest: 1.0, triceps: 0.4, shoulders: 0.4 } },
  "Dumbbell Romanian Deadlift": { primary: ["hamstrings", "glutes"], secondary: ["lower_back"], ratios: { hamstrings: 1.0, glutes: 1.0, lower_back: 0.5 } },
  "Seated Overhead Press": { primary: ["shoulders"], secondary: ["triceps"], ratios: { shoulders: 1.0, triceps: 0.4 } },
  "Band Squat": { primary: ["quads", "glutes"], secondary: ["core"], ratios: { quads: 1.0, glutes: 1.0, core: 0.3 } },
  "Band Row": { primary: ["lats", "upper_back"], secondary: ["biceps"], ratios: { lats: 1.0, upper_back: 1.0, biceps: 0.3 } },
  "Band Romanian Deadlift": { primary: ["hamstrings", "glutes"], secondary: ["lower_back"], ratios: { hamstrings: 1.0, glutes: 1.0, lower_back: 0.4 } },
  "Pallof Press": { primary: ["core"], secondary: [], ratios: { core: 1.0 } },
  "Lunges": { primary: ["quads", "glutes"], secondary: ["hamstrings"], ratios: { quads: 1.0, glutes: 1.0, hamstrings: 0.3 } },
  "Calf Raises": { primary: ["calves"], secondary: [], ratios: { calves: 1.0 } },
  "Single-Leg DB RDL": { primary: ["hamstrings", "glutes"], secondary: ["lower_back", "core"], ratios: { hamstrings: 1.0, glutes: 1.0, lower_back: 0.4, core: 0.3 } },
  "Barbell Back Squat": { primary: ["quads", "glutes"], secondary: ["lower_back", "core"], ratios: { quads: 1.0, glutes: 0.8, lower_back: 0.4, core: 0.4 } },
  "Bent-Over Barbell Rows": { primary: ["lats", "upper_back"], secondary: ["biceps", "rear_delts", "lower_back"], ratios: { lats: 1.0, upper_back: 1.0, biceps: 0.3, rear_delts: 0.4, lower_back: 0.4 } },
  "Bended Barbell Rows": { primary: ["lats", "upper_back"], secondary: ["biceps", "rear_delts", "lower_back"], ratios: { lats: 1.0, upper_back: 1.0, biceps: 0.3, rear_delts: 0.4, lower_back: 0.4 } },
  "Incline Dumbbell Press": { primary: ["chest"], secondary: ["shoulders", "triceps"], ratios: { chest: 1.0, shoulders: 0.6, triceps: 0.4 } },
  "Incline Barbell Press": { primary: ["chest"], secondary: ["shoulders", "triceps"], ratios: { chest: 1.0, shoulders: 0.6, triceps: 0.4 } },
  "Standing Overhead Press": { primary: ["shoulders"], secondary: ["triceps", "upper_back", "core"], ratios: { shoulders: 1.0, triceps: 0.5, upper_back: 0.3, core: 0.4 } },
  "Cable Face Pulls": { primary: ["rear_delts"], secondary: ["upper_back"], ratios: { rear_delts: 1.0, upper_back: 0.5 } },
  "Band Torso Rotation": { primary: ["core"], secondary: [], ratios: { core: 1.0 } },
  "Cable Torso Rotation": { primary: ["core"], secondary: [], ratios: { core: 1.0 } },
  "Hanging Knee Raise": { primary: ["core"], secondary: ["forearms"], ratios: { core: 1.0, forearms: 0.2 } },
  "Dragon Fly Progression": { primary: ["core"], secondary: ["lats"], ratios: { core: 1.0, lats: 0.2 } },
  "Surf Pop-Up": { primary: ["core"], secondary: ["chest", "shoulders", "triceps", "quads", "glutes"], ratios: { core: 1.0, chest: 0.4, shoulders: 0.3, triceps: 0.3, quads: 0.4, glutes: 0.3 } },
  "Dumbbell Shrugs": { primary: ["upper_back"], secondary: ["forearms"], ratios: { upper_back: 1.0, forearms: 0.3 } },
  "Barbell Shrugs": { primary: ["upper_back"], secondary: ["forearms"], ratios: { upper_back: 1.0, forearms: 0.3 } },
  "Dead Hang + Scap Pulls": { primary: ["upper_back"], secondary: ["lats", "forearms"], ratios: { upper_back: 1.0, lats: 0.3, forearms: 0.5 } }
};

function getMuscleImpact(exName, muscle, isPrimary) {
  const mapping = EXERCISE_MUSCLES[exName];
  if (!mapping) return isPrimary ? 1.0 : 0.5;
  if (mapping.ratios && mapping.ratios[muscle] !== undefined) {
    return mapping.ratios[muscle];
  }
  return isPrimary ? 1.0 : 0.5;
}

// Staged exercises: progress score instead of an estimated 1RM. Encoded as
// stage rank + reps fraction (S3 × 8 reps -> 3.4), so the value is monotonic
// across stage-ups and the stage/reps can be decoded back for display.
// Mirrors the server-side scoring in workout_server.py get_exercise_1rm_history.
const DRAGONFLY_STAGE_RANK = { "tuck": 1, "single-leg": 2, "straddle": 3, "negatives": 4, "dragon-flag": 5, "dragon-fly": 6 };
function calcStageScore(rank, reps) { return rank + Math.min(parseInt(reps) || 0, 19) / 20; }
function decodeStageScore(v) { const s = Math.floor(v); return { stage: s, reps: Math.round((v - s) * 20) }; }

// Exercise-type lists — the single source of truth for scoring special cases.
// repsOnly: graded by raw reps; weight/volume are meaningless (older rows saved
// bodyweight in weight_lb). assist: logged as bodyweight minus band assistance.
// get1RMHistory in lib/db/sessions.ts scores from these same lists.
const REPS_ONLY_EXERCISES = ["Hanging Knee Raise", "Dips", "Pull-Ups", "Surf Pop-Up"];
const ASSIST_EXERCISES = ["Dead Hang + Scap Pulls"];
const isRepsOnlyExercise = (n) => REPS_ONLY_EXERCISES.includes(n);
const isAssistExercise = (n) => ASSIST_EXERCISES.includes(n);

function calcSet1RM(exerciseName, weight, reps, bandsJson, grip) {
  if (isRepsOnlyExercise(exerciseName)) {
    return reps;
  }
  if (exerciseName === "Dragon Fly Progression") {
    return calcStageScore(DRAGONFLY_STAGE_RANK[grip] || 1, reps);
  }
  const isAssist = isAssistExercise(exerciseName);
  const effectiveWeight = effectiveExerciseWeight(exerciseName, weight);
  
  let bandSum = 0;
  if (bandsJson) {
    try {
      const b = typeof bandsJson === 'string' ? JSON.parse(bandsJson) : bandsJson;
      if (Array.isArray(b)) {
        bandSum = b.reduce((a, x) => a + (+x || 0), 0);
      }
    } catch(e){}
  }
  
  if (isAssist) {
    return reps > 1 ? (effectiveWeight * reps / 30.0) - bandSum : -bandSum;
  } else {
    return reps > 1 ? effectiveWeight * (1 + reps / 30.0) : effectiveWeight;
  }
}

if (typeof window !== "undefined") {
  window.USER_SETTINGS = { gender: "male", birth_date: "1983-11-08", bodyweight: 175 };
}

function applySwaps(workout, swapMap) {
  if (!swapMap || !Object.keys(swapMap).length) return workout;
  return {
    ...workout,
    exercises: workout.exercises.map((ex, idx) => {
      const topWant = swapMap[`${idx}`];
      if (topWant && topWant !== ex.name) {
        const repl = findExerciseConfig(topWant);
        if (repl) return { ...repl };
      }
      if (ex.supersetExercises) {
        let changed = false;
        const newSubs = ex.supersetExercises.map((sub, subIdx) => {
          const subWant = swapMap[`${idx}-${subIdx}`];
          if (!subWant || subWant === sub.name) return sub;
          const repl = findExerciseConfig(subWant);
          if (!repl) return sub;
          changed = true;
          const { sets: _s, rest: _r, warmups: _w, ...subFields } = repl;
          return subFields;
        });
        if (changed) return { ...ex, supersetExercises: newSubs };
      }
      return ex;
    }),
  };
}

if (typeof window !== "undefined") {
  window.EXERCISE_MUSCLES = EXERCISE_MUSCLES;
  window.getMuscleImpact = getMuscleImpact;
  window.calcSet1RM = calcSet1RM;
  window.calcStageScore = calcStageScore;
  window.decodeStageScore = decodeStageScore;
  window.DRAGONFLY_STAGE_RANK = DRAGONFLY_STAGE_RANK;
  window.applySwaps = applySwaps;
  window.isRepsOnlyExercise = isRepsOnlyExercise;
  window.isAssistExercise = isAssistExercise;
}

export {
  EXERCISE_MUSCLES, getMuscleImpact, DRAGONFLY_STAGE_RANK, calcStageScore, decodeStageScore,
  calcSet1RM, applySwaps, isRepsOnlyExercise, isAssistExercise,
};
