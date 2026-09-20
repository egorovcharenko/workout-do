import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as shared from '../lib/legacy/shared.js';
import * as overview from '../components/home/overview.js';
import { EXERCISE_MUSCLES } from '../lib/legacy/standards.js';
import { cableStackMultiplier } from '../lib/legacy/cable-stack.js';
import * as trainingBlock from '../lib/training-block.js';
import { mainProgramSchedule } from '../lib/main-program.js';
import { storedSessionProgress } from '../lib/legacy/session-status.js';
import { renderLatestWorkoutRecap } from '../components/home/recap.js';

function homeHarness(settings = {}, today = '2026-09-18') {
  const state = { loaded: true, history: [], lastSession: {}, measurements: [] };
  const elements = { planEditorText: { value: '' }, planEditorError: { style: {} } };
  const saves = [];
  const context = vm.createContext({ ...shared, ...overview, ...trainingBlock, mainProgramSchedule, storedSessionProgress, EXERCISE_MUSCLES, cableStackMultiplier, state,
    renderLatestWorkoutRecap: (history, active) => renderLatestWorkoutRecap(history, active, today),
    localDate: () => today,
    trainingBlockStatus: settings => trainingBlock.trainingBlockStatus(settings, today),
    upcomingBlockDays: block => trainingBlock.upcomingBlockDays(block, today),
    window: { USER_SETTINGS: settings }, document: { getElementById: id => elements[id] }, console,
    api: { saveSettings: async data => saves.push(data) }, render: () => {},
    loadSkippedExercises: () => new Set(), renderCalendar: () => '', renderWorkoutSummaryCard: () => '', renderMeasurementsCard: () => '<section aria-label="All-time progress"></section>',
  });
  const blockSource = fs.readFileSync(new URL('../components/home/program.js', import.meta.url), 'utf8')
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
  assert.equal((html.match(/<a class="home-then-row"/g) || []).length, shared.MAIN_WORKOUTS.length - 1);
  assert.match(html, /0 sessions/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('home shows the latest workout recap expanded above the program and next workout', () => {
  const h = homeHarness({}, '2026-09-06');
  h.state.history = [{ id: 'done', workout_name: 'Strength A', date: '2026-09-06', duration_sec: 3240,
    finished_at: '2026-09-06T18:00:00Z', sets: [
      { exercise: 'Barbell Bench Press', weight_lb: 135, reps: '10', set_type: 'working' },
      { exercise: 'Barbell Bench Press', weight_lb: 135, reps: '8', set_type: 'working' },
    ] }];
  const html = h.html();
  const card = html.match(/<article[^>]*aria-label="Latest workout recap"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card, 'The recap is directly on home');
  assert.match(card, /54 min/);
  assert.match(card, /135 lb/);
  assert.match(card, /10·8/);
  assert.doesNotMatch(card, /<details|<button|onclick=/, 'The screenshot card needs no click or expansion');
  assert.ok(html.indexOf(card) < html.indexOf('class="home-hero'));
  assert.equal(h.html(), html, 'Rerendering home keeps the recap visible');
});

test('home recap escapes saved names and never renders empty or active-only history as a completed workout', () => {
  const session = { id: 'done', date: '2026-09-06', finished_at: '2026-09-06T18:00:00Z',
    workout_name: '<script>alert(1)</script>', sets: [{ exercise: '<img src=x onerror=alert(1)>', reps: '8', weight_lb: 45 }] };
  const html = renderLatestWorkoutRecap([session], [], '2026-09-06');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /<dt>Time<\/dt><dd>—<\/dd>/, 'Missing duration is not shown as zero');
  assert.equal(renderLatestWorkoutRecap([], [], '2026-09-06'), '');
  const live = { ...session, finished_at: null };
  assert.equal(renderLatestWorkoutRecap([live], [live], '2026-09-06'), '');
});

test('home resumes the persisted active session ahead of the plan without todaySets', () => {
  const date = '2026-09-18';
  const h = homeHarness({ workout_plan: JSON.stringify([{ workout: 'RDL Focus' }]) }, date);
  h.state.history = [{ id: 'live', workout_name: 'Squat Focus', date, sets: [{ exercise: 'Barbell Back Squat', reps: 6, set_type: 'working' }] }];
  h.state._activeSessions = [{ id: 'live', workout_name: 'Main: Squat', date }];
  assert.match(h.html(), /Resume Squat Focus/);
  assert.match(h.html(), /aria-valuenow="1"/);
});

test('old deload and queued plan settings do not change the permanent prescription', () => {
  const baseline = homeHarness().html();
  const html = homeHarness({ deload_active: '1', deload_started: '2026-09-18', workout_plan: JSON.stringify([{workout:'RDL Focus'}]) }).html();
  assert.equal(html, baseline);
});

test('plan notes are escaped and saving preserves prescriptions and identity', async () => {
  const entry = { id: 'saved', workout: 'Squat Focus', note: '<img src=x>', added: '2026-09-01T00:00:00Z', items: [{ name: 'Barbell Bench Press', sets: [{ w: 155, r: 4 }] }] };
  const h = homeHarness({ workout_plan: JSON.stringify([entry]) });
  assert.match(vm.runInContext('renderPlanEditor()', h.context), /&lt;img src=x&gt;/);
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

test('permanent program has no block controls or expiry and keeps the same calendar rotation', () => {
  for (const date of ['2026-09-06','2026-10-06','2027-01-04']) {
    const html = homeHarness(blockSettings,date).html();
    assert.match(html,/Start Squat Focus/);
    assert.doesNotMatch(html,/4-week|Day .* of 28|Regular program|Schedule block|End block|Start date|Cancel block/);
    assert.doesNotMatch(html,/Start RDL Focus/);
  }
  const rest = homeHarness(blockSettings,'2026-10-08').html();
  assert.match(rest,/Rest recommended/);
  assert.equal((rest.match(/<a class="home-then-row"/g)||[]).length,4,'Every workout remains available on rest days');
  assert.match(rest,/class="home-start" href="\/session\?w=strength-b">Start RDL Focus today/);
});

test('both rest days offer the next scheduled workout and keep recovery advice non-blocking', () => {
  for (const [date, id, name] of [
    ['2026-09-20', 'strength-b', 'RDL Focus'],
    ['2026-09-23', 'strength-a', 'Squat Focus'],
  ]) {
    const h = homeHarness(blockSettings, date);
    const html = h.html();
    assert.match(html, /Rest recommended/);
    assert.match(html, /If you feel ready, you can train today/);
    assert.ok(html.includes(`class="home-start" href="/session?w=${id}">Start ${name} today</a>`));
    assert.equal((html.match(/class="home-start"/g) || []).length, 1);
    assert.equal(h.saves.length, 0, 'Offering an optional workout does not write settings');
  }
});

test('rest-day workouts resume when active and show completion once finished', () => {
  const h = homeHarness(blockSettings, '2026-09-20');
  const session = { id: 'optional', workout_name: 'Strength B', date: '2026-09-20',
    state_json: JSON.stringify({ trainingBlock: scheduledBlock,
      setsMap: { rdl: [{ completed: true }, { completed: false }] } }), sets: [] };
  h.state._activeSessions = [session];
  assert.match(h.html(), /Resume RDL Focus/);
  assert.doesNotMatch(h.html(), /Rest recommended|Start RDL Focus today/);
  h.state._activeSessions = [];
  h.state.history = [{ ...session, finished_at: '2026-09-20T12:00:00Z' }];
  assert.match(h.html(), /DONE FOR TODAY/);
  assert.doesNotMatch(h.html(), /Start RDL Focus today/);
});

test('completing today shows recovery while active sessions still resume after the old expiry', () => {
  const finished = {id:'complete',workout_name:'Strength A',date:'2026-09-06',finished_at:'2026-09-06T12:00:00Z',state_json:JSON.stringify({trainingBlock:scheduledBlock}),sets:[]};
  const h=homeHarness(blockSettings,'2026-09-06'); h.state.history=[finished];
  assert.match(h.html(),/DONE FOR TODAY/);
  const resumed=homeHarness(blockSettings,'2026-10-04');
  resumed.state._activeSessions=[{workout_name:'Strength B',date:'2026-10-03',state_json:JSON.stringify({trainingBlock:scheduledBlock,setsMap:{bench:[{completed:true},{completed:false}]}})}];
  assert.match(resumed.html(),/Resume RDL Focus/);
  resumed.state._activeSessions[0].state_json=JSON.stringify({setsMap:{bench:[{completed:false},{completed:false}]}});
  assert.match(resumed.html(),/Resume RDL Focus/,'An unlogged but started workout is retained');
});

test('old paused or ended settings cannot reactivate the previous program', () => {
  for (const saved of [{...scheduledBlock,resumeDate:'2026-09-08'},{...scheduledBlock,status:'ended'}]) {
    const html=homeHarness({training_block:JSON.stringify(saved)},'2026-09-07').html();
    assert.match(html,/Start Dips Focus/);
    assert.match(html,/20 sets/);
    assert.doesNotMatch(html,/Start Strength Accessories 1|Resumes|Regular program/);
  }
});

 test('home exposes all-time exercise and body progress at the bottom instead of the old history disclosure', () => {
  const html = homeHarness().html();
  assert.match(html, /aria-label="All-time progress"/);
  assert.doesNotMatch(html, /<summary>History & measurements<\/summary>/);
  assert.ok(html.indexOf('aria-label="All-time progress"') > html.indexOf('Upload missing workouts'));
});
