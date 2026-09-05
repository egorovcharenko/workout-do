import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as shared from '../lib/legacy/shared.js';
import * as overview from '../components/home/overview.js';
import { EXERCISE_MUSCLES } from '../lib/legacy/standards.js';
import { cableStackMultiplier } from '../lib/legacy/cable-stack.js';

function homeHarness(settings = {}) {
  const state = { loaded: true, history: [], lastSession: {}, measurements: [] };
  const elements = { planEditorText: { value: '' }, planEditorError: { style: {} } };
  const saves = [];
  const context = vm.createContext({ ...shared, ...overview, EXERCISE_MUSCLES, cableStackMultiplier, state,
    window: { USER_SETTINGS: settings }, document: { getElementById: id => elements[id] }, console,
    api: { saveSettings: async data => saves.push(data) }, render: () => {},
    loadSkippedExercises: () => new Set(), renderCalendar: () => '', renderWorkoutSummaryCard: () => '', renderMeasurementsCard: () => '',
  });
  // Load the actual legacy renderer while replacing its database/DOM imports.
  const source = fs.readFileSync(new URL('../components/home/home.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/export \{[\s\S]*?\};\s*$/, '');
  vm.runInContext(source, context);
  return { state, elements, saves, context, html: () => vm.runInContext('renderHome()', context) };
}

test('home keeps one primary workout, renders the remaining rotation, and supports empty history', () => {
  const h = homeHarness(); const html = h.html();
  assert.equal((html.match(/class="home-start"/g) || []).length, 1);
  assert.match(html, /Start Squat Focus/);
  assert.equal((html.match(/class="home-then-row"/g) || []).length, shared.WORKOUTS.filter(w => w.program).length - 1);
  assert.match(html, /0 sessions/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('home resumes the persisted active session ahead of the plan without todaySets', () => {
  const h = homeHarness({ workout_plan: JSON.stringify([{ workout: 'RDL Focus' }]) });
  const date = shared.localDate();
  h.state.history = [{ id: 'live', workout_name: 'Squat Focus', date, sets: [{ exercise: 'Barbell Back Squat', reps: 6, set_type: 'working' }] }];
  h.state._activeSessions = [{ id: 'live', workout_name: 'Main: Squat', date }];
  assert.match(h.html(), /Resume Squat Focus/);
  assert.match(h.html(), /aria-valuenow="1"/);
});

test('deload lowers the displayed prescription and duration without changing templates', () => {
  const baseline = homeHarness().html();
  const copy = JSON.stringify(shared.WORKOUTS);
  const html = homeHarness({ deload_active: '1', deload_started: shared.localDate() }).html();
  const values = str => str.match(/(\d+) sets · ~(\d+) min/).slice(1).map(Number);
  assert.ok(values(html)[0] < values(baseline)[0]);
  assert.ok(values(html)[1] < values(baseline)[1]);
  assert.equal(JSON.stringify(shared.WORKOUTS), copy);
});

test('plan notes are escaped and saving preserves prescriptions and identity', async () => {
  const entry = { id: 'saved', workout: 'Squat Focus', note: '<img src=x>', added: '2026-09-01T00:00:00Z', items: [{ name: 'Barbell Bench Press', sets: [{ w: 155, r: 4 }] }] };
  const h = homeHarness({ workout_plan: JSON.stringify([entry]) });
  assert.match(h.html(), /&lt;img src=x&gt;/);
  h.elements.planEditorText.value = 'Squat Focus -- <img src=x>\n  Bench: 155x4';
  await vm.runInContext('savePlanEditor()', h.context);
  assert.deepEqual(JSON.parse(h.saves[0].workout_plan), [entry]);
  h.elements.planEditorText.value = 'Squat Focus\n  Bench: nonsense';
  await vm.runInContext('savePlanEditor()', h.context);
  assert.equal(h.saves.length, 1);
  assert.match(h.elements.planEditorError.textContent, /Can't parse set/);
});
