import { localDate } from '../../lib/legacy/shared.js';

// Calendar arithmetic stays local across daylight-saving changes.
export function recentActivity(history, now = new Date()) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13 + i);
    const key = localDate(date);
    const sessions = history.filter(s => s.date === key && (s.sets || []).some(set => Number(set.reps) > 0));
    return { date: key, count: sessions.length, today: i === 13 };
  });
  return { days, count: days.reduce((n, day) => n + day.count, 0) };
}

export function latestLift(orm, exercise) {
  const points = [...(orm?.[exercise] || [])].filter(p => Number.isFinite(p.orm))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = points.at(-1);
  if (!latest) return null;
  // Deloads remain visible, but are not presented as strength losses.
  const previous = points.slice(0, -1).filter(p => !p.is_deload).at(-1);
  return { value: Math.round(latest.orm), deload: latest.is_deload,
    delta: latest.is_deload || !previous ? null : Math.round(latest.orm) - Math.round(previous.orm) };
}

export function latestBody(measurements, key) {
  const points = [...measurements].filter(p => p[key] != null && Number.isFinite(Number(p[key])))
    .sort((a, b) => (a.taken_at || a.date || '').localeCompare(b.taken_at || b.date || ''));
  const latest = points.at(-1), previous = points.at(-2);
  if (!latest) return null;
  return { value: Number(latest[key]), date: latest.taken_at || latest.date,
    delta: previous ? Number(latest[key]) - Number(previous[key]) : null };
}
