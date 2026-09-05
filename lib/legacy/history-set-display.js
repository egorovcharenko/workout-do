import { GRIP_LABELS } from "./shared.js";
import { isStoredBeltLoad, storedBeltLoad } from "./belt-load.js";
import { effectiveStoredExerciseWeight } from "./cable-stack.js";

function bandLoad(set) {
  if (!set?.bands_json) return 0;
  try {
    const bands = JSON.parse(set.bands_json);
    return Array.isArray(bands) ? bands.reduce((sum, weight) => sum + (Number(weight) || 0), 0) : 0;
  } catch {
    return 0;
  }
}

function formatWeight(value) {
  const weight = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(weight) ? String(weight) : String(weight).replace(/0+$/, "").replace(/\.$/, "");
}

function historicalSetLabel(set, session, exercise) {
  const reps = parseInt(set.reps, 10) || 0;
  const repLabel = reps === 1 ? "1 rep" : `${reps} reps`;
  const grip = GRIP_LABELS[set.grip]?.label || set.grip;
  const repDetail = grip ? `${repLabel} · ${grip}` : repLabel;

  if (exercise.stages) {
    const stage = exercise.stages.find((item) => item.id === set.grip);
    return { value: stage?.label || set.grip || "Stage", detail: repLabel };
  }
  if (exercise.beltLoad && !isStoredBeltLoad(set) && bandLoad(set) > 0) {
    return { value: `−${formatWeight(bandLoad(set))} lb`, detail: `${repLabel} · assist` };
  }
  if (exercise.beltLoad) {
    const load = storedBeltLoad(set);
    return load > 0
      ? { value: `+${formatWeight(load)} lb`, detail: repDetail }
      : { value: "Bodyweight", detail: repDetail };
  }
  if (exercise.assist) {
    const assistance = bandLoad(set);
    return assistance > 0
      ? { value: `−${formatWeight(assistance)} lb`, detail: `${repLabel} · assist` }
      : { value: "Bodyweight", detail: repLabel };
  }
  if (exercise.repsOnly) return { value: repLabel, detail: "" };

  const weight = effectiveStoredExerciseWeight(
    set.exercise || exercise.name,
    Number(set.weight_lb) || 0,
    session,
  );
  return weight > 0
    ? { value: `${formatWeight(weight)} lb`, detail: repDetail }
    : { value: repLabel, detail: "" };
}

function historySetLoad(set, session, exercise) {
  if (exercise.stages) return exercise.stages.findIndex(stage => stage.id === set.grip);
  if (exercise.beltLoad) return isStoredBeltLoad(set) ? storedBeltLoad(set) : -bandLoad(set);
  if (exercise.assist) return -bandLoad(set);
  if (exercise.repsOnly) return 0;
  return effectiveStoredExerciseWeight(set.exercise || exercise.name, Number(set.weight_lb) || 0, session);
}

export { historicalSetLabel, historySetLoad };
