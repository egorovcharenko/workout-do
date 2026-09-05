import { parseRepTargetRange, stageRank } from "./shared.js";
import { cableStackMultiplier } from "./cable-stack.js";

function navSetDisplay(s, exercise) {
  const weightMultiplier = cableStackMultiplier(exercise.name);
  if (exercise.repsOnly && !exercise.beltLoad) {
    const targetRange = parseRepTargetRange(exercise.repRange);
    const targetReps = targetRange && targetRange[0] === targetRange[1] ? targetRange[0] : null;
    if (s.completed) return { repsOnly: true, reps: s.reps, state: "done", kind: s.kind };
    if (s.active) return { repsOnly: true, reps: s.reps != null ? s.reps : (s.lastReps != null ? s.lastReps : targetReps), state: "current", kind: s.kind };
    return { repsOnly: true, reps: s.lastReps != null ? s.lastReps : targetReps, state: "upcoming", preview: true, kind: s.kind };
  }
  if (exercise.stages) {
    const rank = (id) => stageRank(exercise.stages, id);
    const cur = rank(s.grip) > 0 ? `S${rank(s.grip)}` : null;
    const prev = rank(s.lastGrip) > 0 ? `S${rank(s.lastGrip)}` : null;
    if (s.completed) return { lb: cur, reps: s.reps, state: "done", kind: s.kind };
    if (s.active) {
      const reps = s.reps != null ? s.reps : (s.lastReps != null ? s.lastReps : null);
      return { lb: cur || prev, reps, state: "current", kind: s.kind };
    }
    return { lb: cur || prev, reps: s.lastReps != null ? s.lastReps : null, state: "upcoming", preview: true, kind: s.kind };
  }
  const isBW = exercise.mode === "bodyweight";
  const isAssist = exercise.assist;
  const isBandsOnly = exercise.isBandsOnly;
  const baseW = isBW ? (s.bodyweight || 0) : (s.weight || 0);
  const lastBaseW = isBW ? (s.lastBodyweight || 0) : (s.lastWeight || 0);
  const bandSum = (s.bands || []).reduce((a, b) => a + b, 0);
  const lastBandSum = (s.lastBands || []).reduce((a, b) => a + b, 0);
  const cur = isAssist ? Math.max(0, baseW - bandSum) : (isBandsOnly ? bandSum : baseW + bandSum);
  const prevW = isAssist ? Math.max(0, lastBaseW - lastBandSum) : (isBandsOnly ? lastBandSum : lastBaseW + lastBandSum);
  const currentLoadPresent = isBandsOnly ? s.bands != null : isBW ? s.bodyweight != null : s.weight != null;
  const beltPrefix = exercise.beltLoad && cur > 0 ? "+" : "";
  if (s.completed) return { lb: `${beltPrefix}${cur || (exercise.beltLoad ? "BW" : "")}`, reps: s.reps, state: "done", kind: s.kind, weightMultiplier };
  if (s.active) {
    const reps = s.reps != null ? s.reps : (s.lastReps != null ? s.lastReps : null);
    const shown = currentLoadPresent ? cur : prevW;
    return { lb: exercise.beltLoad ? (shown > 0 ? `+${shown}` : "BW") : shown, reps, state: "current", kind: s.kind, weightMultiplier };
  }
  const shown = currentLoadPresent ? cur : prevW;
  return { lb: exercise.beltLoad ? (shown > 0 ? `+${shown}` : "BW") : shown, reps: s.lastReps != null ? s.lastReps : null, state: "upcoming", preview: true, kind: s.kind, weightMultiplier };
}

export { navSetDisplay };
