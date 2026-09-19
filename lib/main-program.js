import { addCalendarDays, localCalendarDate, parseTrainingBlock, TRAINING_BLOCK_ID, TRAINING_BLOCK_ROTATION, TRAINING_BLOCK_PRESCRIPTION_REVISION } from './training-block.js';
import { parseSessionState } from './legacy/session-status.js';

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
