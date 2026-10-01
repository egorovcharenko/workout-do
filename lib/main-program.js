import { addCalendarDays, localCalendarDate, parseTrainingBlock, TRAINING_BLOCK_ID, TRAINING_BLOCK_ROTATION, TRAINING_BLOCK_PRESCRIPTION_REVISION } from './training-block.js';
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

/** Up next: the workout after the last finished program workout, in rotation
 * order (rest days skipped). With no history, the first workout. */
export function nextProgramWorkout(sessions = [], nameFor) {
  const ids = [...new Set(TRAINING_BLOCK_ROTATION.filter(Boolean))];
  const idOf = name => ids.find(id => [].concat(nameFor?.(id) || []).includes(name)) || null;
  const last = sessions.filter(session => idOf(session.workout_name) && isStoredSessionFinished(session))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.started_at || '').localeCompare(String(a.started_at || '')))[0];
  if (!last) return ids[0];
  const index = TRAINING_BLOCK_ROTATION.indexOf(idOf(last.workout_name));
  for (let step = 1; step <= TRAINING_BLOCK_ROTATION.length; step++) {
    const next = TRAINING_BLOCK_ROTATION[(index + step) % TRAINING_BLOCK_ROTATION.length];
    if (next) return next;
  }
  return ids[0];
}
