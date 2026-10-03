import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WORKOUTS, workoutDisplayName, estimateTemplateWorkoutDuration } from '../lib/legacy/shared.js';
import { applyProgramBuilder, normalizeSupersets, plannedWeeklyMuscleSets, programWorkouts, workoutEntries } from '../lib/program-builder.js';

const [a, acc1] = MAIN_WORKOUTS;

test('unedited entries leave the program exactly as defined', () => {
  const applied = applyProgramBuilder(MAIN_WORKOUTS, { workouts: { [a.id]: { exercises: workoutEntries(a) } } });
  applied[0].exercises.forEach((ex, i) => assert.deepEqual({ ...ex, superset: undefined }, { ...a.exercises[i], superset: undefined }));
  assert.equal(programWorkouts({}), MAIN_WORKOUTS);
});

test('edits change sets, reps, rest, warm-ups and supersets; renames only change the label', () => {
  const entries = workoutEntries(a);
  entries[0] = { ...entries[0], sets: entries[0].sets.slice(0, 2), warmups: [], rest: 150 };
  entries[3] = { ...entries[3], superset: 'x' };
  entries[4] = { ...entries[4], superset: 'x' };
  const [w] = programWorkouts({ program_builder: JSON.stringify({ workouts: { [a.id]: { name: 'Legs', exercises: entries } } }) });
  const squat = w.exercises[0];
  assert.equal(squat.sets, 2);
  assert.equal(squat.rest, 150);
  assert.equal(squat.noWarmup, true);
  assert.deepEqual(squat.loadProgression.groups, [[1]], 'Existing set groups keep their rules');
  assert.deepEqual(w.exercises.slice(3).map(ex => ex.superset), ['A', 'A']);
  assert.equal(w.name, 'Strength A', 'Saved session name is unchanged');
  assert.equal(workoutDisplayName('Strength A'), 'Legs');
  assert.ok(estimateTemplateWorkoutDuration(w) < estimateTemplateWorkoutDuration(a));
  programWorkouts({});
  assert.equal(workoutDisplayName('Strength A'), 'Squat Focus');
});

test('moved and added exercises keep their own configuration', () => {
  const dips = workoutEntries(acc1).find(e => e.name === 'Dips');
  const [w] = applyProgramBuilder([a], { workouts: { [a.id]: { exercises: [...workoutEntries(a), dips,
    { name: 'Goblet Squat', sets: [[8, 12], [8, 12]], rest: 60, warmups: [], superset: null }] } } });
  const moved = w.exercises.find(ex => ex.name === 'Dips');
  assert.deepEqual(moved.loadProgression, acc1.exercises.find(ex => ex.name === 'Dips').loadProgression);
  const goblet = w.exercises.find(ex => ex.name === 'Goblet Squat');
  assert.equal(goblet.equipment, 'dumbbell');
  assert.deepEqual(goblet.workRepRanges, [[8, 12], [8, 12]]);
});

test('supersets need consecutive members; split runs become separate groups', () => {
  const e = name => ({ name, superset: null });
  const out = normalizeSupersets([{ ...e('a'), superset: 'x' }, { ...e('b'), superset: 'x' }, e('c'), { ...e('d'), superset: 'x' }, { ...e('f'), superset: 'x' }, { ...e('g'), superset: 'y' }]);
  assert.equal(out[0].superset, out[1].superset);
  assert.notEqual(out[3].superset, out[0].superset);
  assert.equal(out[3].superset, out[4].superset);
  assert.equal(out[5].superset, null);
});

test('weekly muscle sets follow the planned sets', () => {
  const before = plannedWeeklyMuscleSets(MAIN_WORKOUTS).find(m => m.id === 'calves').perWeek;
  const acc2 = MAIN_WORKOUTS[3];
  const entries = workoutEntries(acc2).map(e => e.name === 'Calf Raises' ? { ...e, sets: [...e.sets, ...e.sets] } : e);
  const after = plannedWeeklyMuscleSets(applyProgramBuilder(MAIN_WORKOUTS, { workouts: { [acc2.id]: { exercises: entries } } })).find(m => m.id === 'calves').perWeek;
  assert.ok(after > before);
});
