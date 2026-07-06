// ─── file: workout-ui-home.js ───
// UI rendering logic for the Home tab of Workout Tracker

import { api } from "@/lib/db/api";
import {
  WORKOUTS,
  LEGACY_WORKOUT_NAMES,
  localDate,
  isDeloadActive,
  deloadDaysLeft,
  estimateTemplateWorkoutDuration,
  parseWorkoutPlan,
} from "@/lib/legacy/shared";
import { EXERCISE_MUSCLES } from "@/lib/legacy/standards";
import { loadSkippedExercises } from "@/lib/legacy/session-persistence";
import { state } from "./state";
import { renderCalendar } from "./calendar";
import { renderWorkoutSummaryCard } from "./summary";
import { renderMeasurementsCard } from "./measurementsCard";
import { render } from "./shell";

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

  const badgeHTML = sorted.map(([id, sets]) => {
    const label = (window.MUSCLE_GROUPS && window.MUSCLE_GROUPS[id]) ? window.MUSCLE_GROUPS[id].label : id;
    let color = "#60a5fa", bg = "rgba(96,165,250,0.06)", border = "rgba(96,165,250,0.15)";
    if (["chest", "triceps"].includes(id)) {
      color = "#60a5fa"; bg = "rgba(96,165,250,0.06)"; border = "rgba(96,165,250,0.15)";
    } else if (["quads", "calves"].includes(id)) {
      color = "#34d399"; bg = "rgba(52,211,153,0.06)"; border = "rgba(52,211,153,0.15)";
    } else if (["shoulders", "rear_delts"].includes(id)) {
      color = "#f472b6"; bg = "rgba(244,114,182,0.06)"; border = "rgba(244,114,182,0.15)";
    } else if (["biceps", "forearms"].includes(id)) {
      color = "#a78bfa"; bg = "rgba(167,139,250,0.06)"; border = "rgba(167,139,250,0.15)";
    } else if (["upper_back", "lats", "lower_back", "glutes", "hamstrings"].includes(id)) {
      color = "#fbbf24"; bg = "rgba(251,191,36,0.06)"; border = "rgba(251,191,36,0.15)";
    } else if (id === "core") {
      color = "#22d3ee"; bg = "rgba(34,211,238,0.06)"; border = "rgba(34,211,238,0.15)";
    }
    return `<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${color};background:${bg};border:1px solid ${border};padding:2.5px 6px;border-radius:5px;text-align:center;white-space:nowrap;font-family:ui-monospace,Menlo,monospace">${label}</div>`;
  }).join("");

  return `<div data-noinvert style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;width:72px">${badgeHTML}</div>`;
}

function renderWorkoutCard(w, isSuggested, isOngoing, logged, expected, pct) {
  const kindLabel = w => w.kind === 'micro' ? 'Micro' : w.kind === 'optional' ? 'Optional' : 'Main';
  const deloadOn = isDeloadActive(window.USER_SETTINGS || {});
  const deloadPill = deloadOn
    ? `<span style="font-size:8px;font-weight:800;letter-spacing:0.5px;color:#b45309;background:#fef3c7;border:1px solid #fcd34d;padding:2px 5px;border-radius:5px;font-family:ui-monospace,Menlo,monospace;vertical-align:middle;margin-right:5px">DELOAD</span>`
    : '';
  const exerciseEntries = [];
  w.exercises.forEach(ex => {
    if (ex.supersetExercises) {
      ex.supersetExercises.forEach(sub => exerciseEntries.push(sub));
    } else {
      exerciseEntries.push(ex);
    }
  });

  const rowsHTML = exerciseEntries.map(ex => {
    const s = state.lastSession[`${ex.name}|working|1`] || state.lastSession[`${ex.name}|working|2`] || state.lastSession[`${ex.name}|working|3`];
    const weightVal = s ? (s.weight_lb || '—') : '—', repsVal = s ? (s.reps || '—') : '—';
    const valLabel = s ? `${weightVal}lb × ${repsVal}` : '—';
    const name = ex.name;
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;gap:6px">
      <span style="color:${isSuggested ? '#4b5563' : '#374151'};font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
      <span style="color:${isSuggested ? '#4b5563' : '#6b7280'};font-family:ui-monospace,Menlo,monospace;flex-shrink:0">${valLabel}</span>
    </div>
  `;
  }).join("");

  const bgStyle = isSuggested
    ? `background:linear-gradient(135deg, #eff6ff, #dbeafe); border:1px solid #bfdbfe; box-shadow:0 4px 12px rgba(59,130,246,0.08)`
    : `background:white; border:1px solid #e5e7eb`;

  const infoLabel = isSuggested && isOngoing
    ? `${logged} of ${expected} sets logged (${pct}%)`
    : `${kindLabel(w)} · ~${Math.round(estimateTemplateWorkoutDuration(w) / 60)} min${isSuggested ? ' · up next' : ''}`;

  return `
  <a href="/session?w=${w.id}" style="text-decoration:none;display:block;">
    <div class="card clickable" style="padding:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;${bgStyle}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px;gap:6px">
          <span style="font-size:14px;font-weight:800;color:${isSuggested ? '#1d4ed8' : '#111827'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${deloadPill}${isSuggested && isOngoing ? '⚡ ' : ''}${w.name}
          </span>
          <span style="font-size:10px;color:${isSuggested ? '#1d4ed8' : '#9ca3af'};font-weight:700;flex-shrink:0;opacity:0.85">
            ${infoLabel}
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">${rowsHTML}</div>
      </div>
      <div style="flex-shrink:0;display:flex;align-items:center;gap:10px">
        ${renderWorkoutMuscleMap(w)}
        ${!isSuggested ? `<span style="font-size:11px;color:#2563eb;font-weight:800;white-space:nowrap;margin-left:4px">Start →</span>` : ''}
      </div>
    </div>
  </a>
`;
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

// Expected working-set count for a workout template (1/exercise on deload).
function planExpectedWorkingSets(w, isDeload) {
  let n = 0;
  w.exercises.forEach(ex => {
    const subs = ex.supersetExercises ? ex.supersetExercises.length : 1;
    n += (isDeload ? 1 : ex.sets) * subs;
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
      const logged = (sess.sets || []).filter(x => x.reps && x.set_type !== "warmup").length;
      finished = !!w && logged >= planExpectedWorkingSets(w, !!sess.is_deload);
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

function renderPlanCard() {
  const entries = parseWorkoutPlan(window.USER_SETTINGS || {});
  const rows = entries.map((e, i) => {
    const first = i === 0;
    return `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;${i > 0 ? 'border-top:1px solid #f3f4f6' : ''}">
        <span style="flex-shrink:0;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;font-family:ui-monospace,Menlo,monospace;${first ? 'background:#dbeafe;color:#1d4ed8' : 'background:#f3f4f6;color:#9ca3af'}">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:6px">
            <span style="font-size:13px;font-weight:700;color:${first ? '#1d4ed8' : '#111827'}">${escapeHtml(e.workout)}</span>
            ${first ? '<span style="font-size:9px;font-weight:800;color:#1d4ed8;opacity:0.7;letter-spacing:0.5px;font-family:ui-monospace,Menlo,monospace">UP NEXT</span>' : ''}
          </div>
          ${e.note ? `<div style="font-size:11.5px;color:#6b7280;line-height:1.45;margin-top:1px">${escapeHtml(e.note)}</div>` : ''}
        </div>
      </div>`;
  }).join("");
  return `
    <div class="card" style="padding:12px 14px;margin-bottom:10px;background:white;border:1px solid #e5e7eb">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${entries.length ? '4px' : '0'}">
        <span style="font-size:13px;font-weight:800;color:#374151">📋 Plan</span>
        <button onclick="openPlanEditor()" style="border:0;cursor:pointer;font-weight:800;font-size:11px;letter-spacing:0.5px;padding:5px 12px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;background:#f3f4f6;color:#6b7280">EDIT</button>
      </div>
      ${entries.length ? rows : '<div style="font-size:11px;color:#9ca3af;margin-top:4px">No planned workouts — following the standard rotation. Tap EDIT to queue workouts with notes.</div>'}
    </div>`;
}

function renderPlanEditor() {
  const entries = parseWorkoutPlan(window.USER_SETTINGS || {});
  const text = entries.map(e => e.note ? `${e.workout} -- ${e.note}` : e.workout).join("\n");
  const names = WORKOUTS.filter(w => w.program).map(w => w.name).join(" · ");
  return `
    <div onclick="if(event.target===this)closePlanEditor()" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="background:white;border-radius:16px;padding:16px;width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column;gap:10px">
        <span style="font-size:15px;font-weight:800;color:#111827">Edit plan</span>
        <span style="font-size:11px;color:#6b7280;line-height:1.5">One workout per line, in order: <b>Workout name -- note</b>. The note shows on the home card and inside the session. Workouts: ${names}</span>
        <textarea id="planEditorText" spellcheck="false" style="width:100%;min-height:220px;resize:vertical;border:1px solid #e5e7eb;border-radius:10px;padding:10px;font-size:12.5px;line-height:1.5;font-family:ui-monospace,Menlo,monospace;color:#111827;outline:none;box-sizing:border-box">${escapeHtml(text)}</textarea>
        <div id="planEditorError" style="font-size:11px;color:#dc2626;display:none"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="closePlanEditor()" style="border:0;cursor:pointer;font-weight:700;font-size:12px;padding:8px 16px;border-radius:10px;background:#f3f4f6;color:#374151">Cancel</button>
          <button onclick="savePlanEditor()" style="border:0;cursor:pointer;font-weight:800;font-size:12px;padding:8px 16px;border-radius:10px;background:#2563eb;color:white">Save plan</button>
        </div>
      </div>
    </div>`;
}

function openPlanEditor() { state.planEditorOpen = true; render(); }
function closePlanEditor() { state.planEditorOpen = false; render(); }
async function savePlanEditor() {
  const ta = document.getElementById("planEditorText");
  if (!ta) return;
  const prev = parseWorkoutPlan(window.USER_SETTINGS || {});
  const entries = [];
  for (const line of ta.value.split("\n").map(l => l.trim()).filter(Boolean)) {
    const sepMatch = line.match(/\s+(--|—)\s+/);
    const token = sepMatch ? line.slice(0, sepMatch.index) : line;
    const note = sepMatch ? line.slice(sepMatch.index + sepMatch[0].length).trim() : "";
    const w = resolvePlanWorkout(token);
    if (!w) {
      const err = document.getElementById("planEditorError");
      if (err) { err.style.display = "block"; err.textContent = `Unknown workout: "${token.trim()}"`; }
      return;
    }
    // Keep the original added-timestamp for entries that survive an edit, so
    // reconcile still sees sessions completed since they were first planned.
    const kept = prev.find(p => p.workout === w.name && (p.note || "") === note && !entries.some(e => e.id === p.id));
    entries.push(kept || { id: `p${Date.now()}-${entries.length}`, workout: w.name, note, added: new Date().toISOString() });
  }
  window.USER_SETTINGS = window.USER_SETTINGS || {};
  window.USER_SETTINGS.workout_plan = JSON.stringify(entries);
  state.planEditorOpen = false;
  render();
  try {
    await api.saveSettings({ workout_plan: window.USER_SETTINGS.workout_plan });
  } catch (e) { console.error("[PLAN] failed to save plan:", e); }
}

function renderHomeSkeleton() {
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const card = (h, inner) => `
  <div class="card" style="padding:14px;margin-bottom:10px">
    ${inner || `<div class="shimmer" style="height:${h}px"></div>`}
  </div>`;
  const workoutCard = (tall) => card(null, `
  <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:12px">
    <div style="flex:1"><div class="shimmer" style="height:18px;width:55%;margin-bottom:8px"></div><div class="shimmer" style="height:11px;width:35%"></div></div>
    <div class="shimmer" style="height:20px;width:72px"></div>
  </div>
  ${Array.from({ length: tall ? 4 : 2 }, () => `<div class="shimmer" style="height:12px;margin-bottom:8px"></div>`).join("")}
  ${tall ? `<div class="shimmer" style="height:40px;margin-top:10px"></div>` : ""}`);
  return `
  <div style="max-width: 600px; margin: 0 auto; padding: 16px 16px 40px; background:#f9fafb; min-height:100vh">
    <div style="display:flex;align-items:center;margin-bottom:16px">
      <div>
        <span style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${dateStr}</span>
        <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0">Workout Tracker</h2>
      </div>
    </div>
    ${card(40)}
    ${workoutCard(true)}
    ${workoutCard(false)}
    ${workoutCard(false)}
    ${workoutCard(false)}
    ${card(320)}
    ${card(220)}
  </div>
`;
}

function renderHome() {
  if (!state.loaded) return renderHomeSkeleton();
  const deloadOn = isDeloadActive(window.USER_SETTINGS || {});
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
    const today = localDate();
    let count = 0;
    (state.todaySets || []).forEach(row => {
      if (row.workout === w.name && row.date === today && row.reps) count++;
    });
    return count;
  };

  const getSessionDateStr = () => {
    const today = new Date();
    return today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const activeSess = state._activeSessions && state._activeSessions[0];
  const program = WORKOUTS.filter(w => w.program);
  const byId = id => WORKOUTS.find(w => w.id === id);

  const ORDER = ['Main: Squat', 'Micro: Arms', 'Main: Deadlift', 'Micro: Delts & Traps'];
  let lastCompletedName = null;
  for (const s of (state.history || [])) {
    const name = LEGACY_WORKOUT_NAMES[s.workout_name] || s.workout_name;
    if (ORDER.includes(name)) {
      lastCompletedName = name;
      break;
    }
  }
  let nextW = byId('main-a');
  if (lastCompletedName) {
    const idx = ORDER.indexOf(lastCompletedName);
    const nextName = ORDER[(idx + 1) % ORDER.length];
    const map = { 'Main: Squat': 'main-a', 'Micro: Arms': 'micro-arms', 'Main: Deadlift': 'main-b', 'Micro: Delts & Traps': 'micro-delts' };
    nextW = byId(map[nextName]) || byId('main-a');
  }
  // A non-empty plan overrides the rotation: its front entry is up next.
  const planEntries = parseWorkoutPlan(window.USER_SETTINGS || {});
  if (planEntries.length) {
    const planName = LEGACY_WORKOUT_NAMES[planEntries[0].workout] || planEntries[0].workout;
    const planW = WORKOUTS.find(x => x.name === planName);
    if (planW) nextW = planW;
  }

  let activeWorkout = nextW;
  let isOngoing = false;
  let logged = 0;
  let expected = 0;
  let pct = 0;

  if (activeSess) {
    const w = WORKOUTS.find(x => x.name === activeSess.workout_name);
    if (w) {
      expected = getExpectedSets(w);
      logged = getLoggedCount(w);
      if (logged > 0 && logged < expected) {
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

  const workoutsHTML = orderedProgram.map(w => {
    const isSuggested = w.id === activeWorkout.id;
    return renderWorkoutCard(w, isSuggested, isOngoing, logged, expected, pct);
  }).join('<div style="height:10px"></div>');

  const deloadCardHTML = `
  <div class="card" style="padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;${deloadOn ? 'background:#fffbeb;border:1px solid #fcd34d' : 'background:white;border:1px solid #e5e7eb'}">
    <div style="min-width:0">
      <span style="font-size:13px;font-weight:700;color:${deloadOn ? '#b45309' : '#374151'}">Deload week</span>
      <span style="font-size:11px;color:#9ca3af;display:block">${deloadOn ? `1 set @ 80% weight · auto-ends in ${deloadDaysLeft(window.USER_SETTINGS)}d` : 'Light week: 1 set @ 80% per exercise'}</span>
    </div>
    <button onclick="toggleDeload()" style="flex-shrink:0;border:0;cursor:pointer;font-weight:800;font-size:11px;letter-spacing:0.5px;padding:6px 14px;border-radius:9999px;font-family:ui-monospace,Menlo,monospace;${deloadOn ? 'background:#f59e0b;color:white' : 'background:#f3f4f6;color:#6b7280'}">${deloadOn ? 'ON' : 'OFF'}</button>
  </div>
`;

  const workoutListHTML = `
  ${deloadCardHTML}
  ${renderPlanCard()}
  <div style="display:flex;flex-direction:column;margin-bottom:8px;">
    ${workoutsHTML}
  </div>
  <div style="text-align:right;margin-bottom:16px;">
    <span style="font-size:11px; color:#9ca3af;">🧪 Test (nothing saved):
      ${program.filter(w => w.kind !== 'optional').map(w => `<a href="/session?w=${w.id}&test=1" style="color:#6b7280; text-decoration:underline;">${w.name.replace('Micro: ', '')}</a>`).join(' · ')}
    </span>
  </div>
`;

  return `
  <div style="max-width: 600px; margin: 0 auto; padding: 16px 16px 40px; background:#f9fafb; min-height:100vh">
    <div style="display:flex;align-items:center;margin-bottom:16px">
      <div>
        <span style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${getSessionDateStr()}</span>
        <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0">Workout Tracker</h2>
      </div>
    </div>

    ${workoutListHTML}

    <div style="margin-bottom:16px;">
      ${renderCalendar()}
    </div>

    <div style="display:flex; flex-direction:column; gap:16px; width:100%;">
      ${renderWorkoutSummaryCard()}
      ${renderMeasurementsCard()}
    </div>
    ${state.planEditorOpen ? renderPlanEditor() : ''}
  </div>
`;
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
  reconcileWorkoutPlan,
  openPlanEditor,
  closePlanEditor,
  savePlanEditor,
};
