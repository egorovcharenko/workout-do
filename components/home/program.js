import { workoutDisplayName } from "../../lib/legacy/shared.js";
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function renderProgramRestDay(completed = false) {
  return `<section class="home-hero home-rest-day" aria-label="${completed ? 'Workout complete' : 'Rest day'}"><span class="home-label home-accent">${completed ? 'DONE FOR TODAY' : 'TODAY'}</span>
    <h2>${completed ? 'Workout complete' : 'Rest day'}</h2><p class="home-note">${completed ? 'Your next scheduled day is below.' : 'No lifting scheduled today.'}</p></section>`;
}

export function renderProgramUpcoming(schedule, workouts) {
  return `<section><h2 class="home-label">Next days</h2><div class="home-rotation">${schedule.upcoming.map(entry => {
    const workout = workouts.find(w => w.id === entry.workoutId);
    return `<div class="home-schedule-row home-then-row"><span class="home-row-copy"><strong>${escape(workout ? workoutDisplayName(workout.name) : 'Rest')}</strong></span><span class="home-meta">${escape(dateLabel(entry.date))}</span></div>`;
  }).join('')}</div></section>`;
}
