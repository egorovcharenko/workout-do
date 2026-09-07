import { GRIP_LABELS, parseRepTargetRange } from "./shared.js";
import { cableStackMultiplier } from "./cable-stack.js";
import { historicalSetLabel, historySetLoad } from "./history-set-display.js";
import { isStoredSessionFinished } from "./session-status.js";
import { regularProgramSessions, trainingBlockSessionMatches, trainingBlockPrescriptionMatches } from "../training-block.js";
import { withLoadGuidance } from "./load-guidance.js";

const repCount = value => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const bandTotal = values => (values || []).reduce((sum, value) => sum + (Number(value) || 0), 0);

function currentLoad(exercise, set) {
  if (exercise.stages) return exercise.stages.findIndex(stage => stage.id === set.grip);
  if (exercise.beltLoad) return Number(set.weight) || 0;
  if (exercise.assist) return -bandTotal(set.bands);
  if (exercise.repsOnly) return 0;
  return (exercise.isBandsOnly ? bandTotal(set.bands) : (Number(set.weight) || 0) + bandTotal(set.bands))
    * cableStackMultiplier(exercise.name);
}

function previousResult(session, exercise, set) {
  if (!session) return null;
  const kind = set.kind === "warmup" ? "warmup" : "working";
  const hasLegacyOpener = kind === "working" && exercise.name === "Pull-Ups"
    && !exercise.sets.some(item => item.kind === "work" && Number(item.setNumber) === 0)
    && (session.sets || []).some(row => row.exercise === exercise.name && row.set_type === kind && Number(row.set_number) === 0);
  const number = Number(set.setNumber) - (hasLegacyOpener ? 1 : 0);
  const row = (session.sets || []).find(row => row.exercise === exercise.name
    && row.set_type === kind && Number(row.set_number) === number && repCount(row.reps));
  if (!row) return null;
  const reps = repCount(row.reps);
  const label = historicalSetLabel(row, session, exercise);
  const loadDelta = (currentLoad(exercise, set) - historySetLoad(row, session, exercise)) / cableStackMultiplier(exercise.name);
  const sameLoad = Math.abs(loadDelta) < 0.001;
  const sameVariation = (!row.grip && !set.grip) || row.grip === set.grip
    || (exercise.name === "Pull-Ups" && !row.grip && set.grip === "pullup");
  const variation = !sameVariation && !exercise.stages && row.grip ? ` · ${GRIP_LABELS[row.grip]?.label || row.grip}` : '';
  return {
    reps, date: session.date, workout: session.workout_name,
    label: (exercise.repsOnly && !exercise.beltLoad ? `${reps} reps` : `${label.value} × ${reps}`) + variation,
    comparable: sameLoad && sameVariation, sameVariation, loadDelta,
  };
}

export function repSuggestion({ previous, range, warmup = false, deload = false, target = null }) {
  const lo = repCount(range?.[0]), hi = repCount(range?.[1]);
  const baseline = repCount(target) || lo;
  if (warmup) return baseline || previous?.reps || null;
  const lighterSameVariation = previous?.sameVariation && previous.loadDelta < 0;
  if (deload || (!previous?.comparable && !lighterSameVariation)) return baseline && hi ? Math.min(hi, Math.max(lo || 1, baseline)) : baseline;
  // A heavier load starts at the lower target. At a lighter load, retain
  // the actual previous reps without estimating how many extra are possible.
  const next = previous.reps + (previous.comparable ? 1 : 0);
  return hi ? Math.min(hi, Math.max(lo || 1, next)) : next;
}

/** Display guidance is rebuilt from logged history, never saved previews.
 * It does not change prescribed weights, logged reps, or session completion.
 */
export function withRepGuidance(exercises, sessions, { workout, block = null, sessionId = null, date, startedAt = null } = {}) {
  const eligible = (sessions || []).filter(session => session.id !== sessionId && isStoredSessionFinished(session)
    && (!date || session.date <= date)
    && (!startedAt || !session.started_at || Date.parse(session.started_at) < startedAt))
    .slice().sort((a, b) => String(b.started_at || b.date).localeCompare(String(a.started_at || a.date)));
  const regular = regularProgramSessions(eligible);
  const scoped = block ? eligible.filter(session => session.workout_name === workout?.name && trainingBlockSessionMatches(session, block) && trainingBlockPrescriptionMatches(session, workout)) : regular;
  return exercises.map(exercise => {
    const appeared = session => (session.sets || []).some(row => row.exercise === exercise.name && row.set_type === "working" && repCount(row.reps));
    // The first appearance of a lift in this block can still show the real
    // previous program result. Later appearances compare A with A, B with B.
    const scopedSession = scoped.find(appeared);
    const previousSession = scopedSession || (block ? regular.find(appeared) : null);
    const config = workout?.exercises?.find(ex => ex.name === exercise.name);
    const sets = exercise.sets.map(set => {
      const warmup = set.kind === "warmup";
      const targetRir = block && !warmup && set.planTargetReps == null ? config?.targetRir : null;
      const prescribed = warmup ? config?.defaultWarmupReps?.[set.setNumber]
        : set.planTargetReps ?? config?.defaultWorkReps?.[set.setNumber - 1];
      const range = targetRir && !config?.workRepRanges?.[set.setNumber - 1] ? null : warmup ? (prescribed ? [prescribed, prescribed] : null)
        : set.planTargetReps != null ? [set.planTargetReps, set.planTargetReps]
        : set.targetRepRange || parseRepTargetRange(exercise.repRange);
      const previous = previousResult(previousSession, exercise, set);
      const suggested = targetRir ? null : set.planTargetReps != null && !warmup ? set.planTargetReps
        : repSuggestion({ previous, range, warmup, deload: exercise.deload, target: prescribed });
      return { ...set, repGuidance: { previous, range, suggested,
        rirLabel: targetRir ? targetRir[0] === targetRir[1] ? String(targetRir[0]) : targetRir.join("–") : null,
        rangeLabel: range ? range[0] === range[1] ? String(range[0]) : range.join("–") : null } };
    });
    const guided = { ...exercise, sets };
    const progressionHistory = block && workout?.prescriptionRevision >= 2
      ? [...scoped, ...regular.filter(session => session.date < (block.resumeDate || block.startDate))] : scoped;
    return block ? withLoadGuidance(guided, config, progressionHistory, workout.name) : guided;
  });
}
