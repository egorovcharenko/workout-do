import { buildProgress } from '../components/home/progress.js';
import { MEASUREMENT_METRICS } from './measurement-metrics.js';
import { isStoredSessionFinished } from './legacy/session-status.js';

export const validProgressToken = token => /^[a-f0-9]{48}$/.test(token || '');

/** Publish only the fields displayed by the summary, never sessions or settings. */
export function buildSharedProgress(history, measurements, settings, now = new Date()) {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const activeSessions = history.filter(session => !isStoredSessionFinished(session)
    && (session.date >= today || now.getTime() - Date.parse(session.started_at || session.created_at) < 12 * 3600000));
  return JSON.parse(JSON.stringify(buildProgress(history, measurements, {
    activeSessions, today, bodyweightLb: settings.bodyweight,
    metrics: MEASUREMENT_METRICS,
  })));
}
