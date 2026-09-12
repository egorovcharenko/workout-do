import { historySetLoad } from "./history-set-display.js";
import { cableStackMultiplier } from "./cable-stack.js";
import { parseSessionState } from "./session-status.js";

const sameWeight = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b))
  && Math.abs(Number(a) - Number(b)) < 0.001;
const pending = set => !set.completed && !set.userSkipped && set.reps == null && !set.logged_at;

/** Group membership comes from the program, never from the selected set or
 * the order in which the athlete clicks the weight controls.
 * History is already limited to this block's completed A or B workouts.
 */
export function withLoadGuidance(exercise, config, history, workoutName) {
  const policy = config?.loadProgression;
  if (!policy || exercise.deload || exercise.skipped) return exercise;
  const required = policy.required === 1 ? 1 : 2;
  const offers = new Map();
  for (const numbers of policy.groups) {
    const group = exercise.sets.filter(set => set.kind === "work" && numbers.includes(Number(set.setNumber)));
    if (group.length !== numbers.length || new Set(group.map(set => Number(set.setNumber))).size !== numbers.length) continue;
    const fromWeight = Number(group[0].weight);
    const range = config.workRepRanges[numbers[0] - 1];
    if (!(fromWeight > 0) || !range || group.some(set => set.planTargetReps != null
      || !sameWeight(set.weight, fromWeight) || set.bands?.length
      || set.repGuidance?.range?.join() !== range.join())) continue;

    let qualifying = 0;
    for (const session of history) {
      const state = parseSessionState(session.state_json);
      const qualifies = !session.is_deload && !state?.skipped?.includes(exercise.name) && group.every(set => {
        const rows = (session.sets || []).filter(row => row.exercise === exercise.name
          && row.set_type === "working" && Number(row.set_number) === Number(set.setNumber));
        if (rows.length !== 1) return false;
        const row = rows[0];
        const storedSet = state?.setsMap?.[exercise.name]?.find(item => item.kind === "work"
          && Number(item.setNumber) === Number(set.setNumber));
        return !(required === 1 && String(row.rir ?? storedSet?.rir) === "0") && !storedSet?.userSkipped && storedSet?.planTargetReps == null
          && (!storedSet?.targetRepRange || storedSet.targetRepRange.join() === range.join())
          && Number.isInteger(Number(row.reps)) && Number(row.reps) >= range[1]
          && sameWeight(historySetLoad(row, session, exercise) / cableStackMultiplier(exercise.name), fromWeight)
          && (row.grip || null) === (set.grip || null);
      });
      // A missed target, changed load, or missing group breaks the streak.
      if (!qualifies) break;
      qualifying += 1;
      if (qualifying === required) break;
    }
    const offer = {
      fromWeight, weight: Math.round((fromWeight + policy.increment) * 100) / 100,
      reps: range[0], upper: range[1], setNumbers: numbers,
      grips: Object.fromEntries(group.map(set => [set.setNumber, set.grip || null])),
      rirLabel: config.targetRir ? [...new Set(config.targetRir)].join("–") : null,
      qualifying, required, ready: qualifying === required,
      canApply: qualifying === required && group.every(pending), practice: !!policy.practice,
      workoutLabel: workoutName.replace(/^Strength /, ""),
      groupLabel: numbers.length === 1 ? `S${numbers[0]}` : `S${numbers[0]}–S${numbers.at(-1)}`,
    };
    for (const number of numbers) offers.set(number, offer);
  }
  return { ...exercise, sets: exercise.sets.map(set => ({ ...set, repGuidance: {
    ...set.repGuidance,
    loadProgression: set.kind === "work" ? offers.get(Number(set.setNumber)) || null : null,
  } })) };
}

/** Clicking the offer confirms the unlogged effort condition. Only untouched
 * sets in this group change; logged sets and workout/rest state are preserved.
 */
export function applySuggestedLoad(exercises, exerciseIndex, setIndex) {
  const exercise = exercises[exerciseIndex];
  const offer = exercise?.sets[setIndex]?.repGuidance?.loadProgression;
  if (!offer?.ready || !offer.canApply || exercise.skipped || exercise.deload
    || !(offer.weight > offer.fromWeight)) return exercises;
  const group = exercise.sets.filter(set => set.kind === "work" && offer.setNumbers.includes(Number(set.setNumber)));
  if (group.length !== offer.setNumbers.length || new Set(group.map(set => Number(set.setNumber))).size !== offer.setNumbers.length
    || group.some(set => !pending(set) || !sameWeight(set.weight, offer.fromWeight)
      || (set.grip || null) !== offer.grips[set.setNumber] || set.planTargetReps != null || set.bands?.length
      || (set.targetRepRange && set.targetRepRange.join() !== [offer.reps, offer.upper].join()))) return exercises;
  return exercises.map((item, index) => index !== exerciseIndex ? item : ({ ...item,
    sets: item.sets.map(set => group.includes(set) ? { ...set, weight: offer.weight, barPlates: undefined } : set),
  }));
}
