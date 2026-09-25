// ─── file: workout-ui-home.js ───
// UI rendering logic for the Home tab of Workout Tracker

import { api } from "@/lib/db/api";
import {
  workoutDisplayName,
  WORKOUTS,
  ALL_WORKOUTS,
  MAIN_WORKOUTS,
  T,
  LEGACY_WORKOUT_NAMES,
  localDate,
  isDeloadActive,
  estimateTemplateWorkoutDuration,
  parseWorkoutPlan,
  SWAP_GROUPS,
} from "@/lib/legacy/shared";
import { EXERCISE_MUSCLES } from "@/lib/legacy/standards";
import { loadSkippedExercises } from "@/lib/legacy/session-persistence";
import { cableStackMultiplier } from "@/lib/legacy/cable-stack";
import { state } from "./state";
import { renderCalendar } from "./calendar";
import { renderMeasurementsCard } from "./measurementsCard";
import { render } from "./shell";
import { recentActivity, latestLift, latestBody } from "./overview";
import { blockWorkoutCompleted } from "@/lib/training-block";
import { storedSessionProgress } from "@/lib/legacy/session-status";
import { mainProgramSchedule, missedScheduledWorkout, catchUpSettings, dismissMissedSettings } from "@/lib/main-program";
import { renderProgramRestDay, renderProgramUpcoming } from "./program";
import { renderLatestWorkoutRecap } from "./recap";

function renderWorkoutMuscleMap(w) {
  const muscles = {};
  const add = (mapping, sets) => {
    if (!mapping) return;
    (mapping.primary || []).forEach(m => { muscles[m] = (muscles[m] || 0) + sets; });
    (mapping.secondary || []).forEach(m => { muscles[m] = (muscles[m] || 0) + sets * 0.5; });
  };
  w.exercises.forEach(ex => {
    const sets = ex.sets || 3;
    if (ex.supersetExercises) {
      ex.supersetExercises.forEach(sub => add(EXERCISE_MUSCLES[sub.name], sets));
    } else {
      add(EXERCISE_MUSCLES[ex.name], sets);
    }
  });

  const sorted = Object.entries(muscles)
    .filter(([_, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const badgeHTML = sorted.map(([id], index) => {
    const label = window.MUSCLE_GROUPS?.[id]?.label || id;
    return `<span class="home-muscle home-muscle-${index}">${escapeHtml(label)}</span>`;
  }).join("");
  return `<div class="home-muscles">${badgeHTML}</div>`;
}

function displayPrescription(w) {
  if (w.trainingBlockId) return w;
  const deload = isDeloadActive(window.USER_SETTINGS || {});
  return deload ? { ...w, exercises: w.exercises.map(ex => ({ ...ex, sets: 1 })) } : w;
}

function renderWorkoutCard(w, isSuggested, isOngoing, logged, expected, pct) {
  const prescription = displayPrescription(w);
  const minutes = Math.round(estimateTemplateWorkoutDuration(prescription) / 60);
  if (!isSuggested) {
    const lead = w.exercises.flatMap(ex => ex.supersetExercises || [ex]).slice(0, 2).map(ex => ex.name).join(' · ');
    return `<a class="home-then-row" href="/session?w=${encodeURIComponent(w.id)}">
      <span class="home-row-copy"><strong>${escapeHtml(workoutDisplayName(w.name))}</strong><span class="home-lead">${escapeHtml(lead)}</span></span>
      <span class="home-duration">~${minutes} min</span></a>`;
  }
  const rowHTML = ex => {
    if (w.trainingBlockId) {
      return `<div class="home-exercise"><span>${escapeHtml(ex.name)}</span><span class="home-value">${ex.sets} sets</span></div>`;
    }
    const last = state.lastSession[`${ex.name}|working|1`] || state.lastSession[`${ex.name}|working|2`] || state.lastSession[`${ex.name}|working|3`];
    const weight = last?.weight_lb ?? '—', reps = last?.reps ?? '—';
    const value = !last ? '—' : ex.repsOnly ? `${reps} reps` : `${weight}${cableStackMultiplier(ex.name) === 2 ? '×2' : ''} × ${reps}`;
    return `<div class="home-exercise"><span title="${escapeHtml(ex.name)}">${escapeHtml(ex.name)}</span><span class="home-value">${escapeHtml(value)}</span></div>`;
  };
  const rows = w.exercises.map(ex => ex.supersetExercises
    ? `<div class="home-superset">${ex.supersetExercises.map(rowHTML).join('')}</div>` : rowHTML(ex)).join('');
  const deload = !w.trainingBlockId && isDeloadActive(window.USER_SETTINGS || {});
  const sets = planExpectedWorkingSets(w, deload);
  const fromPlan = !w.trainingBlockId && !isOngoing && parseWorkoutPlan(window.USER_SETTINGS || {}).length > 0;
  return `<section class="home-hero" aria-label="Up next workout">
    <div class="home-hero-top"><div class="home-row-copy">
      <div class="home-kickers"><span class="home-label home-accent">${isOngoing ? 'In progress' : fromPlan ? 'Up next · from plan' : 'Up next'}</span>${deload ? '<span class="home-deload-badge">DELOAD</span>' : ''}</div>
      <h2>${escapeHtml(workoutDisplayName(w.name))}</h2><span class="home-meta">${sets} sets · ~${minutes} min</span>
      ${isOngoing ? `<div class="home-progress" role="progressbar" aria-label="Workout sets" aria-valuemin="0" aria-valuemax="${expected}" aria-valuenow="${logged}"><span style="width:${pct}%"></span></div><span class="home-meta">${logged}/${expected} sets</span>` : ''}
    </div>${renderWorkoutMuscleMap(w)}</div>
    <a class="home-start" href="/session?w=${encodeURIComponent(w.id)}">${isOngoing ? 'Resume' : 'Start'} ${escapeHtml(workoutDisplayName(w.name))}</a>
    <div class="home-exercises">${rows}</div>
  </section>`;
}

// Skeleton mirroring the home layout (deload strip, workout cards, calendar,
// summary cards) so the first paint never shows default values as answers.
// ---- Planned-workout queue ("Plan") ----------------------------------------
// The queue lives in settings.workout_plan (see lib/legacy/shared.js). Home
// shows it as an ordered card above the workout list; the front entry becomes
// the suggested "up next" workout instead of the fixed rotation.

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Resolve a user-typed workout token to a WORKOUTS entry: exact name/id first
// (legacy names accepted), then name minus the "Main:"/"Micro:" prefix, then a
// unique substring among the program workouts.
function resolvePlanWorkout(token) {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  const legacyKey = Object.keys(LEGACY_WORKOUT_NAMES).find(k => k.toLowerCase() === t);
  const canonName = legacyKey ? LEGACY_WORKOUT_NAMES[legacyKey] : null;
  let w = WORKOUTS.find(x => x.name.toLowerCase() === t || x.id.toLowerCase() === t || (canonName && x.name === canonName));
  if (w) return w;
  const program = WORKOUTS.filter(x => x.program);
  w = program.find(x => x.name.toLowerCase().replace(/^(main|micro):\s*/, "") === t);
  if (w) return w;
  const subs = program.filter(x => x.name.toLowerCase().includes(t));
  return subs.length === 1 ? subs[0] : null;
}

// ---- Plan prescription text format ----------------------------------------
// A workout line may be followed by indented exercise lines carrying concrete
// targets, which the session pre-fills (see applyPlanPrescription):
//   Main: Squat -- rebuild starts
//     Barbell Bench Press: 155x4, 140x8x3
//     + Lat Pulldown: 70x10x3
// Set tokens: WxR (one set), WxRxS (S sets), bare R (reps only, weight from
// history). "+" adds an exercise that isn't in the template.

function resolveLibraryExercise(token) {
  const t = token.trim().toLowerCase();
  const all = [];
  SWAP_GROUPS.forEach(g => g.exercises.forEach(e => all.push(e.name)));
  const exact = all.find(n => n.toLowerCase() === t);
  if (exact) return exact;
  const subs = all.filter(n => n.toLowerCase().includes(t));
  return subs.length === 1 ? subs[0] : null;
}

function parsePlanSetTokens(setsStr) {
  const sets = [];
  for (const tok of setsStr.split(",").map(s => s.trim()).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)\s*x\s*(\d+)$/i))) {
      for (let i = 0; i < +m[3]; i++) sets.push({ w: +m[1], r: +m[2] });
    } else if ((m = tok.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i))) {
      sets.push({ w: +m[1], r: +m[2] });
    } else if ((m = tok.match(/^(\d+)$/))) {
      sets.push({ w: null, r: +m[1] });
    } else {
      return { error: `Can't parse set "${tok}" — use weight x reps (155x5), weight x reps x sets (140x8x3), or bare reps (8)` };
    }
  }
  return { sets };
}

function parsePlanItemLine(line, entry) {
  const add = line.startsWith("+");
  const body = add ? line.slice(1).trim() : line;
  const ci = body.indexOf(":");
  if (ci === -1) return { error: `Exercise line needs "Name: sets" — got "${line}"` };
  const nameToken = body.slice(0, ci).trim();
  const parsed = parsePlanSetTokens(body.slice(ci + 1).trim());
  if (parsed.error) return parsed;
  let name = nameToken;
  if (add) {
    name = resolveLibraryExercise(nameToken) || nameToken;
  } else {
    const w = WORKOUTS.find(x => x.name === entry.workout);
    const all = [];
    if (w) w.exercises.forEach(ex => ex.supersetExercises ? ex.supersetExercises.forEach(s => all.push(s.name)) : all.push(ex.name));
    const exact = all.find(n => n.toLowerCase() === nameToken.toLowerCase());
    const subs = all.filter(n => n.toLowerCase().includes(nameToken.toLowerCase()));
    if (exact) name = exact;
    else if (subs.length === 1) name = subs[0];
    else return { error: `"${nameToken}" is not in ${entry.workout}${subs.length ? ` (ambiguous: ${subs.join(", ")})` : ""}. Prefix with + to add a new exercise.` };
  }
  return { item: { name, add: add || undefined, sets: parsed.sets } };
}

// Compact set-list display/serialization: equal consecutive weighted sets
// collapse to WxRxN; reps-only sets never collapse (8x3 would read as 8 lb).
function compressPlanSets(sets) {
  const out = [];
  let i = 0;
  while (i < sets.length) {
    let j = i;
    while (j + 1 < sets.length && sets[j + 1].w === sets[i].w && sets[j + 1].r === sets[i].r) j++;
    const n = j - i + 1;
    const s = sets[i];
    if (s.w != null) out.push(n > 1 ? `${s.w}x${s.r}x${n}` : `${s.w}x${s.r}`);
    else out.push(Array(n).fill(String(s.r)).join(", "));
    i = j + 1;
  }
  return out.join(", ");
}

function planEntryToText(e) {
  const workoutName = LEGACY_WORKOUT_NAMES[e.workout] || e.workout;
  const lines = [e.note ? `${workoutName} -- ${e.note}` : workoutName];
  (e.items || []).forEach(it => lines.push(`  ${it.add ? "+ " : ""}${it.name}: ${compressPlanSets(it.sets)}`));
  return lines.join("\n");
}

// Expected working-set count for a workout template (1/exercise on deload).
// Skipped exercises are excluded, mirroring getExpectedSets in renderHome — a
// finished session that skipped a lift logs fewer working sets than the raw
// template, and the plan must still count it as done.
function planExpectedWorkingSets(w, isDeload, skipped) {
  let n = 0;
  w.exercises.forEach(ex => {
    if (ex.supersetExercises) {
      ex.supersetExercises.forEach(sub => {
        if (skipped && skipped.has(sub.name)) return;
        n += isDeload ? 1 : ex.sets;
      });
    } else {
      if (skipped && skipped.has(ex.name)) return;
      n += (isDeload ? 1 : ex.sets);
    }
  });
  return n;
}

// Drop plan entries satisfied by a completed session: any non-active session
// (the day passed) consumes a matching entry outright; a still-active
// (today's) session consumes one only once all template working sets are
// logged. Sessions older than the entry's added-timestamp never consume it.
async function reconcileWorkoutPlan() {
  const remaining = parseWorkoutPlan(window.USER_SETTINGS || {});
  if (!remaining.length) return;
  const activeIds = new Set((state._activeSessions || []).map(s => s.id));
  const sessions = (state.history || []).filter(s => (s.sets || []).some(x => x.reps));
  let changed = false;
  // Oldest first so each session consumes the earliest matching entry.
  for (const sess of sessions.slice().reverse()) {
    const name = LEGACY_WORKOUT_NAMES[sess.workout_name] || sess.workout_name;
    let finished = !activeIds.has(sess.id);
    if (!finished) {
      const w = WORKOUTS.find(x => x.name === name);
      const skipped = loadSkippedExercises(name, sess.date);
      const logged = (sess.sets || []).filter(x => x.reps && x.set_type !== "warmup").length;
      finished = !!w && logged >= planExpectedWorkingSets(w, !!sess.is_deload, skipped);
    }
    if (!finished) continue;
    const ts = sess.started_at ? Date.parse(sess.started_at) : Date.parse(sess.date + "T23:59:59");
    const idx = remaining.findIndex(e =>
      (LEGACY_WORKOUT_NAMES[e.workout] || e.workout) === name && (!e.added || Date.parse(e.added) <= ts));
    if (idx !== -1) { remaining.splice(idx, 1); changed = true; }
  }
  if (!changed) return;
  window.USER_SETTINGS.workout_plan = JSON.stringify(remaining);
  try {
    await api.saveSettings({ workout_plan: window.USER_SETTINGS.workout_plan });
  } catch (e) { console.error("[PLAN] failed to save reconciled plan:", e); }
}

function renderPlanEditor() {
  const text = parseWorkoutPlan(window.USER_SETTINGS || {}).map(planEntryToText).join("\n");
  const names = WORKOUTS.filter(w => w.program).map(w => w.name).join(" · ");
  return `<div class="home-scrim" onclick="if(event.target===this)closePlanEditor()" onkeydown="if(event.key==='Escape')closePlanEditor()">
    <section class="home-modal" role="dialog" aria-modal="true" aria-labelledby="planEditorTitle">
      <h2 id="planEditorTitle">Edit plan</h2>
      <p id="planEditorHelp">One workout per line, in order. Add a note after <code>--</code>. Indent a line to prescribe sets: <code>Bench: 155x4, 140x8x3</code>. Prefix <code>+</code> to add an exercise outside the template.<br>Workouts: ${escapeHtml(names)}</p>
      <label class="home-sr-only" for="planEditorText">Workout plan</label>
      <textarea id="planEditorText" aria-describedby="planEditorHelp planEditorError" spellcheck="false">${escapeHtml(text)}</textarea>
      <div id="planEditorError" role="alert" style="display:none"></div>
      <div class="home-modal-actions"><button class="home-chip" onclick="closePlanEditor()">Cancel</button><button class="home-start" onclick="savePlanEditor()">Save plan</button></div>
    </section></div>`;
}

let planTrigger = null;
function openPlanEditor() {
  planTrigger = document.activeElement;
  state.planEditorOpen = true;
  render();
  document.getElementById('planEditorText')?.focus();
}

function closePlanEditor() {
  state.planEditorOpen = false;
  render();
  // Rendering replaces the trigger node, so restore focus to its new peer.
  const label = planTrigger?.textContent?.trim() || 'Plan';
  [...document.querySelectorAll('.home-page button')].find(b => b.textContent.trim() === label)?.focus();
}
async function savePlanEditor() {
  const ta = document.getElementById("planEditorText");
  if (!ta) return;
  const showError = (msg) => {
    const err = document.getElementById("planEditorError");
    if (err) { err.style.display = "block"; err.textContent = msg; }
  };
  const prev = parseWorkoutPlan(window.USER_SETTINGS || {});
  const entries = [];
  for (const raw of ta.value.split("\n")) {
    if (!raw.trim()) continue;
    // Indented line = exercise prescription for the workout above it.
    if (/^\s/.test(raw)) {
      if (!entries.length) { showError(`Exercise line "${raw.trim()}" has no workout line above it`); return; }
      const entry = entries[entries.length - 1];
      const res = parsePlanItemLine(raw.trim(), entry);
      if (res.error) { showError(res.error); return; }
      (entry.items = entry.items || []).push(res.item);
      continue;
    }
    const line = raw.trim();
    const sepMatch = line.match(/\s+(--|—)\s+/);
    const token = sepMatch ? line.slice(0, sepMatch.index) : line;
    const note = sepMatch ? line.slice(sepMatch.index + sepMatch[0].length).trim() : "";
    const w = resolvePlanWorkout(token);
    if (!w) { showError(`Unknown workout: "${token.trim()}"`); return; }
    entries.push({ id: `p${Date.now()}-${entries.length}`, workout: w.name, note, added: new Date().toISOString() });
  }
  // Keep the original id/added-timestamp for entries that survive an edit, so
  // reconcile still sees sessions completed since they were first planned.
  const sig = (e) => `${e.workout}|${e.note || ""}|${JSON.stringify(e.items || [])}`;
  entries.forEach((e, i) => {
    const kept = prev.find(p => sig(p) === sig(e) && !entries.some((e2, j) => j < i && e2.id === p.id));
    if (kept) { e.id = kept.id; e.added = kept.added; }
  });
  window.USER_SETTINGS = window.USER_SETTINGS || {};
  window.USER_SETTINGS.workout_plan = JSON.stringify(entries);
  state.planEditorOpen = false;
  render();
  try {
    await api.saveSettings({ workout_plan: window.USER_SETTINGS.workout_plan });
  } catch (e) { console.error("[PLAN] failed to save plan:", e); }
}

function homeTokens() {
  return Object.entries(T).filter(([key]) => key !== 'mono').map(([key, value]) => `--home-${key}:${value}`).join(';');
}

function renderHomeSkeleton() {
  return `<main class="home-page" style="${homeTokens()}" aria-busy="true" aria-label="Loading workouts">
    <header class="home-header"><div><div class="home-date">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div><h1>Workouts</h1></div></header>
    <section class="home-hero">${[28, 20, 130, 56].map(height => `<div class="shimmer" style="height:${height}px"></div>`).join('')}</section>
    <div class="shimmer" style="height:190px"></div><div class="shimmer" style="height:70px"></div><div class="shimmer" style="height:120px"></div>
  </main>`;
}

function renderActivity() {
  const { days, count } = recentActivity(state.history || []);
  return `<section class="home-tile home-tile-activity"><div class="home-section-heading"><h2 class="home-label">Last 14 days</h2><span class="home-meta">${count} ${count === 1 ? 'session' : 'sessions'}</span></div>
    <div class="home-activity">${days.map(d => `<div class="home-day ${d.count ? 'trained' : ''} ${d.today ? 'today' : ''}" role="img" aria-label="${d.date}: ${d.count} sessions${d.today ? ', today' : ''}" title="${d.date}: ${d.count} sessions"></div>`).join('')}</div>
    <details class="home-details" ${state.calendarOpen ? 'open' : ''} ontoggle="state.calendarOpen=this.open"><summary>View calendar</summary>${renderCalendar()}</details>
  </section>`;
}

function metricHTML(name, metric, unit, neutral = false) {
  const delta = metric?.delta;
  const text = delta == null ? '' : delta === 0 ? '=' : `${delta > 0 ? '+' : '−'}${neutral ? Math.abs(delta).toFixed(1) : Math.abs(delta)}`;
  const color = neutral || !delta ? T.faint : delta > 0 ? T.green : T.red;
  return `<div class="home-stat"><span class="home-stat-name">${name}</span><div class="home-stat-value"><strong>${metric ? (neutral ? metric.value.toFixed(1) : metric.value) : '—'}</strong><span style="color:${color}">${text}</span></div><span class="home-stat-unit">${unit}${metric?.deload ? ' · deload' : ''}</span></div>`;
}

// Same short date as the recap cards: "Sep 6", plus the year if not this year.
function shortDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

function renderOverview() {
  const lifts = [['Squat', 'Barbell Back Squat'], ['Bench', 'Barbell Bench Press'], ['RDL', 'Barbell RDL'], ['OHP', 'Standing Overhead Press']];
  const measurements = state.measurements || [];
  const metrics = [['Weight', 'weight_kg', 'kg'], ['Waist', 'waist_cm', 'cm'], ['Chest', 'chest_cm', 'cm']].map(([label, key, unit]) => ({ label, unit, metric: latestBody(measurements, key) })).filter(x => x.metric);
  const date = metrics.map(x => x.metric.date || '').sort().at(-1);
  // Bento snapshot: one tile per lift (2×2), body metrics in a wide tile.
  return `<section class="home-bento" aria-label="Snapshot">
    ${lifts.map(([label, key]) => `<div class="home-tile home-tile-lift">${metricHTML(label, latestLift(state.ormHistory?.orm, key), 'lb est. 1RM')}</div>`).join('')}
    ${state.ormError ? '<p class="home-note home-tile-wide">Strength history could not be loaded. Reload to try again.</p>' : ''}
    ${metrics.length ? `<div class="home-tile home-tile-wide"><div class="home-section-heading"><h2 class="home-label">Body</h2><span class="home-meta">${escapeHtml(shortDate(date))}</span></div><div class="home-stats">${metrics.map(x => metricHTML(x.label, x.metric, x.unit, true)).join('')}</div></div>` : ''}
  </section>`;
}

function renderHome() {
  if (!state.loaded) return renderHomeSkeleton();
  const schedule = mainProgramSchedule(window.USER_SETTINGS, localDate());
  const deloadOn = false;
  const getExpectedSets = (w) => {
    let count = 0;
    w.exercises.forEach(ex => {
      const exName = ex.name;
      const cachedSkips = loadSkippedExercises(w.name, localDate());
      if (cachedSkips.has(exName)) return;
      if (ex.supersetExercises) {
        ex.supersetExercises.forEach(sub => {
          if (cachedSkips.has(sub.name)) return;
          count += deloadOn ? 1 : ex.sets;
        });
      } else {
        const warmups = ex.noWarmup || state.warmupOff?.[exName] ? 0 : 1;
        count += (deloadOn ? 1 : ex.sets) + warmups;
      }
    });
    return count;
  };

  const getLoggedCount = (w) => {
    const active = (state._activeSessions || []).find(s => (LEGACY_WORKOUT_NAMES[s.workout_name] || s.workout_name) === w.name && s.date === localDate());
    const saved = (state.history || []).find(s => s.id === active?.id);
    return (saved?.sets || []).filter(row => Number(row.reps) > 0).length;
  };

  const getSessionDateStr = () => {
    const today = new Date();
    return today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const activeSess = state._activeSessions && state._activeSessions[0];
  const program = MAIN_WORKOUTS;
  const nextWorkoutId = schedule.workoutId || schedule.upcoming.find(day => day.workoutId)?.workoutId;
  const nextW = program.find(w => w.id === nextWorkoutId) || program[0];

  let activeWorkout = nextW;
  let isOngoing = false;
  let logged = 0;
  let expected = 0;
  let pct = 0;

  if (activeSess) {
    const w = ALL_WORKOUTS.find(x => x.name === (LEGACY_WORKOUT_NAMES[activeSess.workout_name] || activeSess.workout_name));
    if (w) {
      const progress = storedSessionProgress(activeSess);
      expected = progress?.total ?? getExpectedSets(w);
      logged = progress?.completed ?? getLoggedCount(w);
      if (expected > 0 && logged < expected) {
        activeWorkout = w;
        isOngoing = true;
        pct = Math.round((logged / expected) * 100);
      }
    }
  }

  const activeIdx = program.findIndex(w => w.id === activeWorkout.id);
  const orderedProgram = [];
  if (activeIdx !== -1) {
    for (let i = 0; i < program.length; i++) {
      orderedProgram.push(program[(activeIdx + i) % program.length]);
    }
  } else {
    orderedProgram.push(...program);
  }

  const completedToday = blockWorkoutCompleted(state.history, schedule.context, nextW.name, localDate());
  const hero = !isOngoing && (!schedule.workoutId || completedToday)
    ? renderProgramRestDay(completedToday, nextW)
    : renderWorkoutCard(activeWorkout, true, isOngoing, logged, expected, pct);
  const remaining = orderedProgram.filter(w => (!isOngoing && !schedule.workoutId) || w.id !== activeWorkout.id).map(w => renderWorkoutCard(w, false)).join('');
  const missed = isOngoing ? null : missedScheduledWorkout({
    sessions: state.history || [], settings: window.USER_SETTINGS || {}, today: localDate(), nameFor: programWorkoutNames,
  });
  return `<main class="home-page" style="${homeTokens()}">
    <header class="home-header"><div><div class="home-date">${getSessionDateStr()}</div><h1>Workouts</h1></div></header>
    ${state.loadError ? '<p role="alert" class="home-note">Your workout data could not be loaded. Reload to try again.</p>' : ''}
    ${missed ? renderMissedWorkout(missed) : ''}
    ${hero}
    ${renderLatestWorkoutRecap(state.history || [], state._activeSessions || [], undefined, { bodyweightLb: window.USER_SETTINGS?.bodyweight })}
    ${renderProgramUpcoming(schedule, program)}<section><h2 class="home-label">Workouts</h2><div class="home-rotation">${remaining}</div></section>
    ${renderActivity()}${renderOverview()}
    ${state.planEditorOpen ? renderPlanEditor() : ''}
    ${renderMeasurementsCard()}
    <details class="home-details home-tools" ${state.toolsOpen ? 'open' : ''} ontoggle="state.toolsOpen=this.open"><summary>Tools</summary>
      <section class="home-tests"><h2 class="home-label">Test mode · nothing saved</h2><div>${program.filter(w => w.kind !== 'optional').map(w => `<a class="home-chip" href="/session?w=${w.id}&test=1">${escapeHtml(workoutDisplayName(w.name))}</a>`).join('')}</div></section>
      <button class="home-chip home-sync" onclick="window.openSLHistorySync()">Upload missing workouts to Strength Level</button>
    </details>
  </main>`;
}

// Rotation id → every name its sessions may be saved under (current + legacy).
function programWorkoutNames(id) {
  const workout = ALL_WORKOUTS.find(w => w.id === id);
  if (!workout) return [];
  return [workout.name, ...Object.keys(LEGACY_WORKOUT_NAMES).filter(name => LEGACY_WORKOUT_NAMES[name] === workout.name)];
}

function renderMissedWorkout(missed) {
  const workout = ALL_WORKOUTS.find(w => w.id === missed.workoutId);
  if (!workout) return '';
  const when = missed.daysLate === 1 ? 'yesterday' : `${missed.daysLate} days ago`;
  const name = escapeHtml(workoutDisplayName(workout.name));
  return `<section class="home-missed" aria-label="Missed workout">
    <div><span class="home-label home-accent">Missed ${when}</span><h2>${name}</h2>
    <p class="home-note">Do it today and the plan shifts ${missed.daysLate === 1 ? 'one day' : `${missed.daysLate} days`}, so nothing gets skipped. Or skip it and stay on today's schedule.</p></div>
    <div class="home-missed-actions">
      <button type="button" class="home-start home-missed-go" onclick="catchUpWorkout('${escapeHtml(missed.workoutId)}','${escapeHtml(missed.date)}')" ${state.catchUpBusy ? 'disabled' : ''}>${state.catchUpBusy ? 'Shifting plan…' : `Do ${name} today`}</button>
      <button type="button" class="home-missed-skip" onclick="dismissMissedWorkout()" ${state.catchUpBusy ? 'disabled' : ''}>Skip it</button>
    </div>
  </section>`;
}

async function saveScheduleSettings(body) {
  window.USER_SETTINGS = Object.assign(window.USER_SETTINGS || {}, body);
  await api.saveSettings(body);
}

async function catchUpWorkout(workoutId, missedDate) {
  if (state.catchUpBusy) return;
  state.catchUpBusy = true;
  render();
  try {
    await saveScheduleSettings(catchUpSettings(window.USER_SETTINGS || {}, missedDate, localDate()));
    window.location.href = `/session?w=${encodeURIComponent(workoutId)}`;
  } catch (e) {
    console.error("[SCHEDULE] catch-up failed:", e);
    state.catchUpBusy = false;
    render();
    alert("Couldn't shift the plan. Check your connection and try again.");
  }
}

async function dismissMissedWorkout() {
  try {
    await saveScheduleSettings(dismissMissedSettings(localDate()));
  } catch (e) {
    console.error("[SCHEDULE] dismiss failed:", e);
  }
  render();
}

async function toggleDeload() {
  const on = isDeloadActive(window.USER_SETTINGS || {});
  const body = on
    ? { deload_active: "0" }
    : { deload_active: "1", deload_started: localDate() };
  window.USER_SETTINGS = Object.assign(window.USER_SETTINGS || {}, body);
  render();
  try {
    await api.saveSettings(body);
  } catch (e) {
    console.error("[DELOAD] failed to save toggle:", e);
  }
}

export {
  renderWorkoutMuscleMap,
  renderWorkoutCard,
  renderHomeSkeleton,
  renderHome,
  toggleDeload,
  catchUpWorkout,
  dismissMissedWorkout,
  reconcileWorkoutPlan,
  openPlanEditor,
  closePlanEditor,
  savePlanEditor,
};
