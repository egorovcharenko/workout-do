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
 * The most recent scheduled workout day (looking back up to `lookbackDays`)
 * if it was skipped: no finished session of that workout on or after that
 * day and nothing of it in progress. Rest days are passed over. Days before
 * `missed_check_from` (set when the athlete catches up or dismisses) are ignored,
 * since a catch-up re-maps past calendar days to different workouts.
 * `nameFor(id)` maps a rotation id to its workout name(s).
 */
export function missedScheduledWorkout({ sessions = [], settings = {}, today = localCalendarDate(), nameFor, lookbackDays = 3 } = {}) {
  const { context } = mainProgramSchedule(settings, today);
  for (let back = 1; back <= lookbackDays; back++) {
    const date = addCalendarDays(today, -back);
    if (date < context.startDate || (settings.missed_check_from && date < settings.missed_check_from)) return null;
    const workoutId = mainProgramSchedule(settings, date).workoutId;
    if (!workoutId) continue;
    const names = [].concat(nameFor?.(workoutId) || []);
    const caughtUp = sessions.some(session => names.includes(session.workout_name) && session.date >= date
      && (isStoredSessionFinished(session) || session.date > date));
    return caughtUp ? null : { workoutId, date, daysLate: back };
  }
  return null;
}

/** Settings that shift the rotation so `missedDate`'s workout lands on `today`
 * and everything after it follows in order. History is untouched. */
export function catchUpSettings(settings = {}, missedDate, today = localCalendarDate()) {
  const context = mainProgramContext(settings);
  const startDate = addCalendarDays(context.startDate, dayDiff(missedDate, today));
  const block = { id: TRAINING_BLOCK_ID, instanceId: context.instanceId, status: 'active', startDate,
    returnDate: addCalendarDays(startDate, TRAINING_BLOCK_DAYS), prescriptionRevision: context.prescriptionRevision };
  return { training_block: JSON.stringify(block), missed_check_from: today };
}

/** Settings that keep the calendar and stop reporting days before today. */
export function dismissMissedSettings(today = localCalendarDate()) {
  return { missed_check_from: today };
}
