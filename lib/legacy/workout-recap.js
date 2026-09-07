import { cableStackMultiplier, storedExerciseInputWeight } from "./cable-stack.js";
import { currentBeltLoad } from "./belt-load.js";
import { findExerciseConfig } from "./shared.js";
import { isAssistExercise, isRepsOnlyExercise } from "./standards.js";
import { isStoredSessionFinished } from "./session-status.js";

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
function summarizeRecap(exercises, loadLabel) {
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
      const load = loadLabel(exercise, set);
      const previous = groups.at(-1);
      if (previous?.load === load) previous.reps.push(actualReps);
      else groups.push({ load, reps: [actualReps] });
    }
    // Skipping an exercise's remaining sets must not hide work already logged.
    if (exerciseSets || exerciseWarmups) rows.push({ name: exercise.name, groups, workingSets: exerciseSets, warmupSets: exerciseWarmups });
  }
  return { exercises: rows, workingSets, warmupSets, reps };
}

function buildWorkoutRecap(exercises = []) {
  return summarizeRecap(exercises, recapLoadLabel);
}

function buildStoredWorkoutRecap(session) {
  const exercises = new Map();
  for (const row of session.sets || []) {
    if (!exercises.has(row.exercise)) exercises.set(row.exercise, { name: row.exercise, sets: [] });
    exercises.get(row.exercise).sets.push({ ...row, kind: row.set_type === "warmup" ? "warmup" : "work", completed: true });
  }
  return summarizeRecap([...exercises.values()], (exercise, row) => {
    const config = findExerciseConfig(exercise.name) || {};
    let bands = [];
    try {
      const parsed = typeof row.bands_json === "string" ? JSON.parse(row.bands_json) : row.bands_json;
      if (Array.isArray(parsed)) bands = parsed.filter(value => Number.isFinite(Number(value)) && Number(value) > 0).map(Number);
    } catch { /* Older rows may have no usable band metadata. */ }
    const beltLoad = row.load_type === "belt";
    const assist = !beltLoad && (config.assist || isAssistExercise(exercise.name) || (isRepsOnlyExercise(exercise.name) && bands.length > 0));
    const bandTotal = bands.reduce((sum, value) => sum + value, 0);
    return recapLoadLabel({
      name: exercise.name, stages: config.stages, beltLoad, assist,
      repsOnly: !assist && (config.repsOnly || isRepsOnlyExercise(exercise.name)),
      isBandsOnly: config.equipment === "band", bandAddon: config.bandAddon,
    }, {
      weight: config.bandAddon ? Math.max(0, (Number(row.weight_lb) || 0) - bandTotal) : storedExerciseInputWeight(exercise.name, row.weight_lb, session),
      grip: row.grip, bands,
    });
  });
}

function latestCompletedWorkout(history = [], activeSessions = [], today) {
  const activeIds = new Set(activeSessions.map(session => session.id));
  return history.filter(session => {
    if (!(session.sets || []).some(set => Number.isFinite(Number(set.reps)) && Number(set.reps) > 0)) return false;
    if (isStoredSessionFinished(session)) return true;
    // Older imports have no completion marker. Past, non-active entries in
    // history remain eligible; a partial workout today must not replace them.
    return Boolean(today && session.date < today && !activeIds.has(session.id));
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))
    || String(b.finished_at || b.started_at || b.created_at || "").localeCompare(String(a.finished_at || a.started_at || a.created_at || "")))[0] || null;
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

export { buildWorkoutRecap, buildStoredWorkoutRecap, latestCompletedWorkout, recapLoadLabel, recapDuration, recapDate };
