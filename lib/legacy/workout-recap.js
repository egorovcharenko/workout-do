import { cableStackMultiplier } from "./cable-stack.js";
import { currentBeltLoad } from "./belt-load.js";

function recapLoadLabel(exercise, set) {
  const band = (set.bands || []).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const stage = exercise.stages?.find(item => item.id === set.grip)?.label;
  if (stage) return band > 0 ? `${stage} · ${band} lb assistance` : stage;
  if (exercise.beltLoad) {
    const weight = currentBeltLoad(set);
    return weight > 0 ? `BW + ${weight} lb` : "BW";
  }
  if (exercise.repsOnly) return "BW";
  if (exercise.assist) return band > 0 ? `BW · ${band} lb assistance` : "BW";
  if (exercise.isBandsOnly) return band > 0 ? `${band} lb band` : "No band";
  if (exercise.mode === "bodyweight") return "BW";
  const weight = Number(set.weight) || 0;
  if (exercise.bandAddon && band > 0) return `${weight} lb + ${band} lb band`;
  return `${weight} lb${cableStackMultiplier(exercise.name) > 1 ? " / stack × 2" : ""}`;
}

/** Summarize performed work, keeping set order and load changes intact. */
function buildWorkoutRecap(exercises = []) {
  let workingSets = 0;
  let warmupSets = 0;
  let reps = 0;
  const rows = [];
  for (const exercise of exercises) {
    const groups = [];
    let exerciseWarmups = 0;
    let exerciseSets = 0;
    for (const set of exercise.sets || []) {
      const actualReps = Number(set.reps);
      if (!set.completed || set.userSkipped || !Number.isFinite(actualReps) || actualReps <= 0) continue;
      if (set.kind === "warmup") {
        warmupSets += 1;
        exerciseWarmups += 1;
        continue;
      }
      workingSets += 1;
      exerciseSets += 1;
      reps += actualReps;
      const load = recapLoadLabel(exercise, set);
      const previous = groups.at(-1);
      if (previous?.load === load) previous.reps.push(actualReps);
      else groups.push({ load, reps: [actualReps] });
    }
    // Skipping an exercise's remaining sets must not hide work already logged.
    if (exerciseSets || exerciseWarmups) rows.push({ name: exercise.name, groups, workingSets: exerciseSets, warmupSets: exerciseWarmups });
  }
  return { exercises: rows, workingSets, warmupSets, reps };
}

function recapDuration(elapsedSec) {
  const seconds = Math.max(0, Math.floor(Number(elapsedSec) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes} min`;
  return `${seconds} sec`;
}

function recapDate(sessionDate) {
  // Date-only workout dates are local calendar dates, not UTC instants.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate || "");
  if (!match) return sessionDate || "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export { buildWorkoutRecap, recapLoadLabel, recapDuration, recapDate };
