import { api } from "@/lib/db/api";
import { BLOCK_WORKOUTS, localDate } from "@/lib/legacy/shared";
import { addCalendarDays, BLOCK_PROGRESSION_NOTES, parseTrainingBlock, trainingBlockStatus, upcomingBlockDays } from "@/lib/training-block";
import { state } from "./state";
import { render } from "./shell";

const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function exerciseTargets(exercise) {
  if (exercise.targetRir) return `${exercise.sets} sets · ${exercise.targetRir.join("–")} RIR`;
  const groups = [];
  exercise.defaultWork.forEach((weight, index) => {
    const range = exercise.workRepRanges[index];
    const reps = range[0] === range[1] ? range[0] : range.join("–");
    const load = exercise.stages ? "Current stage" : exercise.repsOnly ? weight ? `+${weight} lb` : "BW" : `${weight} lb`;
    const previous = groups.at(-1);
    const label = `${load} × ${reps}`;
    if (previous?.label === label) previous.count += 1;
    else groups.push({ label, count: 1 });
  });
  return groups.map(group => `${group.count} × ${group.label}`).join(" · ");
}

export function renderTrainingBlockCard() {
  const info = trainingBlockStatus(window.USER_SETTINGS);
  const block = info.block;
  const running = info.status === "active" || info.status === "scheduled";
  const label = info.status === "active" ? `Day ${info.day} of 28`
    : info.status === "scheduled" ? `Starts ${dateLabel(block.startDate)}`
    : info.status === "ended" ? "Regular program restored" : "Squat · Bench · Pull-ups";
  const date = state.blockStartDate || localDate();
  return `<section class="home-block" aria-label="Four-week training block">
    <div class="home-section-heading"><strong>4-week strength block</strong><span class="home-meta">${escape(label)}</span></div>
    ${running ? `<p class="home-note">${escape(dateLabel(block.startDate))}–${escape(dateLabel(addCalendarDays(block.returnDate, -1)))} · Regular program returns ${escape(dateLabel(block.returnDate))}.</p>` : ''}
    <details class="home-details" ${state.trainingBlockOpen ? 'open' : ''} ontoggle="state.trainingBlockOpen=this.open">
      <summary>${running ? 'View block' : 'View program & schedule'}</summary>
      <p class="home-note">A → Accessories 1 → Rest → B → Accessories 2 → Rest</p>
      ${BLOCK_WORKOUTS.map(workout => `<div class="home-block-workout"><h3>${escape(workout.blockLabel)} <span>${workout.exercises.reduce((n, ex) => n + ex.sets, 0)} sets</span></h3>
        ${workout.exercises.map(ex => `<div class="home-block-exercise"><strong>${escape(ex.name)}</strong><span>${escape(exerciseTargets(ex))}</span><small>Rest ${ex.rest / 60} min</small></div>`).join('')}</div>`).join('')}
      <p class="home-note">Barbell weights include the bar; dumbbells are per hand. Use your usual cable settings. Working sets exclude warm-ups. Squat and bench rest can extend to 5 minutes.</p>
      <ul class="home-block-rules">${BLOCK_PROGRESSION_NOTES.map(note => `<li>${escape(note)}</li>`).join('')}</ul>
      ${running ? `<button class="home-chip" onclick="endCurrentTrainingBlock()" ${state.blockBusy ? 'disabled' : ''}>${info.status === 'scheduled' ? 'Cancel block' : 'End block early'}</button>`
        : `<div class="home-block-actions"><label for="blockStartDate">Start date<input id="blockStartDate" type="date" value="${escape(date)}" min="${localDate()}" onchange="state.blockStartDate=this.value"></label>
          <button class="home-chip" onclick="startCurrentTrainingBlock()" ${state.blockBusy || state.loadError ? 'disabled' : ''}>${state.blockBusy ? 'Saving…' : 'Schedule block'}</button></div>`}
    </details>
    ${state.blockError ? `<p class="home-note home-block-error" role="alert">${escape(state.blockError)}</p>` : ''}
  </section>`;
}

export function renderBlockRestDay(completed = false) {
  return `<section class="home-hero home-rest-day" aria-label="${completed ? 'Workout complete' : 'Rest day'}"><span class="home-label home-accent">${completed ? 'DONE FOR TODAY' : 'TODAY'}</span>
    <h2>${completed ? 'Workout complete' : 'Rest day'}</h2><p class="home-note">${completed ? 'Your next scheduled day is below.' : 'No lifting scheduled today.'}</p></section>`;
}

export function renderBlockUpcoming(block) {
  const entries = upcomingBlockDays(block);
  const rows = entries.map(entry => {
    const workout = BLOCK_WORKOUTS.find(w => w.id === entry.workoutId);
    return `<div class="home-then-row"><span class="home-row-copy"><strong>${escape(workout?.blockLabel || 'Rest')}</strong><span class="home-lead">Day ${entry.day}</span></span><span class="home-meta">${escape(dateLabel(entry.date))}</span></div>`;
  }).join('');
  return `<section><h2 class="home-label">Next days</h2><div class="home-rotation">${rows || `<div class="home-then-row"><strong>Regular program</strong><span class="home-meta">${escape(dateLabel(block.returnDate))}</span></div>`}</div></section>`;
}

export async function startCurrentTrainingBlock() {
  if (state.blockBusy) return;
  const startDate = document.getElementById('blockStartDate')?.value || state.blockStartDate || localDate();
  state.blockBusy = true; state.blockError = null; render();
  try {
    if (startDate === localDate() && (await api.activeSessions()).length) {
      throw new Error("Finish your current workout before starting the block, or choose a future date.");
    }
    const block = await api.startTrainingBlock(startDate);
    window.USER_SETTINGS = { ...window.USER_SETTINGS, training_block: JSON.stringify(block) };
    state.trainingBlockOpen = false;
  } catch (error) { state.blockError = error.message || "Could not schedule the block. Try again."; }
  finally { state.blockBusy = false; render(); }
}

export async function endCurrentTrainingBlock() {
  const block = parseTrainingBlock(window.USER_SETTINGS);
  if (!block || state.blockBusy) return;
  state.blockBusy = true; state.blockError = null; render();
  try {
    const ended = await api.endTrainingBlock(block.instanceId);
    window.USER_SETTINGS = { ...window.USER_SETTINGS, training_block: JSON.stringify(ended) };
    state.trainingBlockOpen = false;
  } catch (error) { state.blockError = error.message || "Could not end the block. Try again."; }
  finally { state.blockBusy = false; render(); }
}
