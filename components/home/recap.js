import { workoutDisplayName } from "../../lib/legacy/shared.js";
import { buildRecap1rmTrends, renderRecap1rm, renderRecapMonthlyChanges, recapTimeDomain } from "../../lib/legacy/recap-1rm.js";
import { buildStoredWorkoutRecap, latestCompletedWorkout, recapDate, recapDuration } from '../../lib/legacy/workout-recap.js';
import { localDate } from '../../lib/legacy/shared.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function renderLatestWorkoutRecap(history, activeSessions = [], today = localDate(), options = {}) {
  const session = latestCompletedWorkout(history, activeSessions, today);
  if (!session) return '';
  const recap = buildStoredWorkoutRecap(session);
  const trends = buildRecap1rmTrends(history.filter(item => !activeSessions.some(active => active.id === item.id)), session, options);
  const timeDomain = recapTimeDomain(trends);
  return `<article class="workout-recap home-workout-recap" aria-label="Latest workout recap">
    <header class="workout-recap-header">
      <div class="workout-recap-eyebrow"><span>Latest workout</span><time datetime="${escapeHtml(session.date)}">${escapeHtml(recapDate(session.date))}</time></div>
      <h2 class="workout-recap-title">${escapeHtml(workoutDisplayName(session.workout_name))}</h2>
    </header>
    <dl class="workout-recap-metrics">
      <div><dt>Time</dt><dd>${session.duration_sec > 0 ? escapeHtml(recapDuration(session.duration_sec)) : '—'}</dd></div>
      <div><dt>Working sets</dt><dd>${recap.workingSets}</dd></div>
      <div><dt>Reps</dt><dd>${recap.reps}</dd></div>
    </dl>
    <ol class="workout-recap-exercises">${recap.exercises.map(exercise => `<li class="workout-recap-exercise">
      <div class="workout-recap-exercise-heading"><h3>${escapeHtml(exercise.name)}</h3>${exercise.workingSets ? `<span>${exercise.workingSets} ${exercise.workingSets === 1 ? 'set' : 'sets'}</span>` : ''}</div>
      <div class="workout-recap-results${trends[exercise.name] ? ' has-trend' : ''}"><div>${exercise.groups.length ? exercise.groups.map(group => `<div class="workout-recap-set-group"><span class="workout-recap-load">${escapeHtml(group.load)}</span><span class="workout-recap-reps"><span class="workout-recap-times">× </span><strong>${group.reps.join(' · ')}</strong><small> reps</small></span></div>`).join('') : `<p class="workout-recap-warmup-only">${exercise.warmupSets} warm-up ${exercise.warmupSets === 1 ? 'set' : 'sets'} only</p>`}</div>${trends[exercise.name] ? `<div class="workout-recap-trend">${renderRecap1rm(trends[exercise.name], timeDomain)}${renderRecapMonthlyChanges(trends[exercise.name], timeDomain)}</div>` : ''}</div>
    </li>`).join('')}</ol>
    <footer class="workout-recap-footer"><span>${recap.warmupSets ? `+ ${recap.warmupSets} warm-up ${recap.warmupSets === 1 ? 'set' : 'sets'}` : `${recap.exercises.length} ${recap.exercises.length === 1 ? 'exercise' : 'exercises'}`}</span><span class="workout-recap-brand">workouts</span></footer>
  </article>`;
}
