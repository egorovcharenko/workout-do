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

test('a variant is its own exercise with the base exercise config and muscles', async () => {
  const { findExerciseConfig } = await import('../lib/legacy/shared.js');
  const { EXERCISE_MUSCLES } = await import('../lib/legacy/standards.js');
  const { isBeltLoadExercise } = await import('../lib/legacy/belt-load.js');
  const bench = workoutEntries(a).find(e => e.name === 'Barbell Bench Press');
  const volume = { ...bench, name: 'Barbell Bench Press · Volume', sets: [[10, 12], [10, 12]] };
  const dips = { ...workoutEntries(acc1).find(e => e.name === 'Dips'), name: 'Dips · Heavy' };
  const [w] = programWorkouts({ program_builder: JSON.stringify({
    aliases: { 'Barbell Bench Press · Volume': 'Barbell Bench Press', 'Dips · Heavy': 'Dips' },
    workouts: { [a.id]: { exercises: [...workoutEntries(a), volume, dips] } } }) });
  const ex = w.exercises.find(e => e.name === 'Barbell Bench Press · Volume');
  assert.equal(ex.equipment, 'barbell');
  assert.equal(ex.warmups, 3);
  assert.deepEqual(ex.workRepRanges, [[10, 12], [10, 12]]);
  assert.equal(w.exercises.find(e => e.name === 'Barbell Bench Press').sets, 4, 'The original is unchanged');
  assert.equal(EXERCISE_MUSCLES['Barbell Bench Press · Volume'], EXERCISE_MUSCLES['Barbell Bench Press']);
  assert.equal(findExerciseConfig('Dips · Heavy').name, 'Dips · Heavy');
  assert.ok(isBeltLoadExercise('Dips · Heavy'));
  const chest = plannedWeeklyMuscleSets([w]).find(m => m.id === 'chest');
  assert.ok(chest.parts.some(part => part.name === 'Barbell Bench Press · Volume'));
  programWorkouts({});
});

test('planned RIR is optional per set and overrides the exercise default only when set', () => {
  const entries = workoutEntries(a);
  assert.ok(entries.every(e => e.rir.length === e.sets.length && e.rir.every(v => v === null)), 'Blank by default');
  const legacy = entries.map(({ rir: _rir, ...rest }) => rest);
  const [same] = applyProgramBuilder([a], { workouts: { [a.id]: { exercises: legacy } } });
  assert.deepEqual(same.exercises.map(ex => ex.workRir), a.exercises.map(() => undefined), 'Older saves without RIR still match');
  entries[0] = { ...entries[0], rir: [2, null, 1] };
  const [w] = applyProgramBuilder([a], { workouts: { [a.id]: { exercises: entries } } });
  assert.deepEqual(w.exercises[0].workRir, [2, null, 1]);
});
