import { addCalendarDays, localCalendarDate, parseTrainingBlock, TRAINING_BLOCK_DAYS, TRAINING_BLOCK_ID, TRAINING_BLOCK_ROTATION, TRAINING_BLOCK_PRESCRIPTION_REVISION } from './training-block.js';
import { isStoredSessionFinished, parseSessionState } from './legacy/session-status.js';

// Keep the existing calendar anchor and workout identities when promoting the
// strength block. Old expiry/pause settings no longer control access or rotation.
const DEFAULT_START = '2026-09-06';
export function mainProgramContext(settings = {}, savedSession = null) {
  const previous = parseSessionState(savedSession?.state_json)?.trainingBlock || parseTrainingBlock(settings);
  return { ...previous, id: TRAINING_BLOCK_ID, instanceId: previous?.instanceId || 'main-strength-program',
    startDate: previous?.startDate || DEFAULT_START, permanent: true,
    prescriptionRevision: previous?.prescriptionRevision || TRAINING_BLOCK_PRESCRIPTION_REVISION };
}

export function mainProgramSchedule(settings = {}, date = localCalendarDate()) {
  const context = mainProgramContext(settings);
  const elapsed = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${context.startDate}T00:00:00Z`)) / 86400000);
  const index = ((elapsed % TRAINING_BLOCK_ROTATION.length) + TRAINING_BLOCK_ROTATION.length) % TRAINING_BLOCK_ROTATION.length;
  return { context, workoutId: TRAINING_BLOCK_ROTATION[index], upcoming: [1, 2, 3].map(offset => ({
    date: addCalendarDays(date, offset), workoutId: TRAINING_BLOCK_ROTATION[(index + offset) % TRAINING_BLOCK_ROTATION.length],
  })) };
}

const dayDiff = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * When the most recent scheduled workout day (rest days passed over, looking
 * back up to `lookbackDays`) was skipped, suggest the workout that follows the
 * last finished program workout in the rotation, so several missed days don't
 * jump ahead (after Squat Focus comes Dips Focus, not whatever day was last
 * scheduled). Returns null when nothing was missed or today's scheduled workout
 * already is that next one. Days before `missed_check_from` (set on catch-up or
 * dismissal) are ignored, since a catch-up re-maps past days.
 * `nameFor(id)` maps a rotation id to its workout name(s).
 */
export function missedScheduledWorkout({ sessions = [], settings = {}, today = localCalendarDate(), nameFor, lookbackDays = 7 } = {}) {
  const { context, workoutId: todayId } = mainProgramSchedule(settings, today);
  const ids = [...new Set(TRAINING_BLOCK_ROTATION.filter(Boolean))];
  const idOf = name => ids.find(id => [].concat(nameFor?.(id) || []).includes(name)) || null;
  const program = sessions.filter(session => idOf(session.workout_name) && session.date <= today);
  let missed = null;
  for (let back = 1; back <= lookbackDays; back++) {
    const date = addCalendarDays(today, -back);
    if (date < context.startDate || (settings.missed_check_from && date < settings.missed_check_from)) return null;
    const workoutId = mainProgramSchedule(settings, date).workoutId;
    if (!workoutId) continue;
    const done = program.some(session => idOf(session.workout_name) === workoutId && session.date >= date
      && (isStoredSessionFinished(session) || session.date > date));
    if (done) return null;
    missed = { workoutId, date, daysLate: back };
    break;
  }
  if (!missed) return null;
  const last = program.filter(isStoredSessionFinished)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.started_at || '').localeCompare(String(a.started_at || '')))[0];
  const lastId = last ? idOf(last.workout_name) : null;
  let workoutId = missed.workoutId;
  if (lastId) {
    const index = TRAINING_BLOCK_ROTATION.indexOf(lastId);
    for (let step = 1; step <= TRAINING_BLOCK_ROTATION.length; step++) {
      const next = TRAINING_BLOCK_ROTATION[(index + step) % TRAINING_BLOCK_ROTATION.length];
      if (next) { workoutId = next; break; }
    }
  }
  if (workoutId === todayId) return null;
  return { workoutId, date: missed.date, daysLate: missed.daysLate, afterId: lastId };
}

/** Settings that shift the rotation (by the fewest days) so `workoutId` lands
 * on `today` and everything after it follows in order. History is untouched. */
export function catchUpSettings(settings = {}, workoutId, today = localCalendarDate()) {
  const context = mainProgramContext(settings);
  const length = TRAINING_BLOCK_ROTATION.length;
  const current = ((dayDiff(context.startDate, today) % length) + length) % length;
  const target = TRAINING_BLOCK_ROTATION.indexOf(workoutId);
  const shift = target < 0 ? 0 : ((current - target) % length + length) % length;
  const startDate = addCalendarDays(context.startDate, shift);
  const block = { id: TRAINING_BLOCK_ID, instanceId: context.instanceId, status: 'active', startDate,
    returnDate: addCalendarDays(startDate, TRAINING_BLOCK_DAYS), prescriptionRevision: context.prescriptionRevision };
  return { training_block: JSON.stringify(block), missed_check_from: today };
}

/** Settings that keep the calendar and stop reporting days before today. */
export function dismissMissedSettings(today = localCalendarDate()) {
  return { missed_check_from: today };
}
