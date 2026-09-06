import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as shared from '../lib/legacy/shared.js';
import * as overview from '../components/home/overview.js';
import { EXERCISE_MUSCLES } from '../lib/legacy/standards.js';
import { cableStackMultiplier } from '../lib/legacy/cable-stack.js';
import * as trainingBlock from '../lib/training-block.js';
import { storedSessionProgress } from '../lib/legacy/session-status.js';

function homeHarness(settings = {}, today = shared.localDate()) {
  const state = { loaded: true, history: [], lastSession: {}, measurements: [] };
  const elements = { planEditorText: { value: '' }, planEditorError: { style: {} } };
  const saves = [];
  const context = vm.createContext({ ...shared, ...overview, ...trainingBlock, storedSessionProgress, EXERCISE_MUSCLES, cableStackMultiplier, state,
    localDate: () => today,
    trainingBlockStatus: settings => trainingBlock.trainingBlockStatus(settings, today),
    upcomingBlockDays: block => trainingBlock.upcomingBlockDays(block, today),
    window: { USER_SETTINGS: settings }, document: { getElementById: id => elements[id] }, console,
    api: { saveSettings: async data => saves.push(data) }, render: () => {},
    loadSkippedExercises: () => new Set(), renderCalendar: () => '', renderWorkoutSummaryCard: () => '', renderMeasurementsCard: () => '',
  });
  const blockSource = fs.readFileSync(new URL('../components/home/trainingBlock.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/export /g, '');
  vm.runInContext(blockSource, context);
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

const scheduledBlock = trainingBlock.createTrainingBlock('2026-09-06', 'home-run', '2026-09-05');
const blockSettings = { training_block: JSON.stringify(scheduledBlock), workout_plan: JSON.stringify([{ workout: 'RDL Focus' }]) };

test('home transitions from the saved program to the dated block and back after four weeks', () => {
  const before = homeHarness(blockSettings, '2026-09-05').html();
  assert.match(before, /Starts Sep 6/);
  assert.match(before, /Start RDL Focus/);
  const active = homeHarness(blockSettings, '2026-09-06').html();
  assert.match(active, /Day 1 of 28/);
  assert.match(active, /Start Strength A/);
  assert.match(active, /Regular program returns Oct 4/);
  assert.match(active, /End block early/);
  assert.match(active, /4 sets · 1–2 RIR/);
  assert.doesNotMatch(active, /3\/3\/3\/3|Stop at two if a third/);
  const rest = homeHarness(blockSettings, '2026-09-08').html();
  assert.match(rest, /No lifting scheduled today/);
  assert.doesNotMatch(rest, /class="home-start"/);
  const returned = homeHarness(blockSettings, '2026-10-04').html();
  assert.match(returned, /Regular program restored/);
  assert.match(returned, /Start RDL Focus/);
});

test('completing today shows the next calendar days while an in-flight block still resumes after expiry', () => {
  const finished = { id: 'complete', workout_name: 'Strength A', date: '2026-09-06', finished_at: '2026-09-06T12:00:00Z', state_json: JSON.stringify({ trainingBlock: scheduledBlock }), sets: [] };
  const h = homeHarness(blockSettings, '2026-09-06');
  h.state.history = [finished];
  assert.match(h.html(), /DONE FOR TODAY/);
  assert.doesNotMatch(h.html(), /class="home-start"/);
  const resumed = homeHarness(blockSettings, '2026-10-04');
  resumed.state._activeSessions = [{ workout_name: 'Strength B', date: '2026-10-03', state_json: JSON.stringify({ trainingBlock: scheduledBlock, setsMap: { bench: [{ completed: true }, { completed: false }] } }) }];
  assert.match(resumed.html(), /Resume Strength B/);
});

test('failed scheduling and cancellation keep the current program and show a retryable error', async () => {
  const h = homeHarness(blockSettings, '2026-09-05');
  const initial = JSON.stringify(h.context.window.USER_SETTINGS);
  h.context.api.endTrainingBlock = async () => { throw new Error('Save failed'); };
  await vm.runInContext('endCurrentTrainingBlock()', h.context);
  assert.equal(JSON.stringify(h.context.window.USER_SETTINGS), initial);
  assert.equal(h.state.blockBusy, false);
  assert.match(h.html(), /role="alert">Save failed/);
});
