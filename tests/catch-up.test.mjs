import test from 'node:test';
import assert from 'node:assert/strict';
import { mainProgramSchedule, missedScheduledWorkout, catchUpSettings, dismissMissedSettings } from '../lib/main-program.js';

// Default anchor 2026-09-06 → rotation: A, Acc1, rest, B, Acc2, rest, ...
const names = { 'strength-a': 'Strength A', 'strength-accessories-1': 'Strength Accessories 1', 'strength-b': 'Strength B', 'strength-accessories-2': 'Strength Accessories 2' };
const nameFor = id => names[id];
const done = (workout_name, date) => ({ workout_name, date, finished_at: `${date}T19:00:00Z` });

test('after missed days it offers the workout that follows the last one done', () => {
  // A done 09-18; Acc1 (09-19), B (09-21), Acc2 (09-22) skipped. Today 09-23 is a rest day.
  const missed = missedScheduledWorkout({ sessions: [done('Strength A', '2026-09-18')], today: '2026-09-23', nameFor });
  assert.equal(missed.workoutId, 'strength-accessories-1', 'Dips Focus follows Squat Focus');
  assert.equal(missed.afterId, 'strength-a');
});

test('nothing is offered when the last scheduled day was done or today already is the next workout', () => {
  assert.equal(missedScheduledWorkout({ sessions: [done('Strength A', '2026-09-24')], today: '2026-09-25', nameFor }), null);
  // A done 09-18, Acc1 missed 09-19, today 09-20 (rest) → next is Acc1: offered.
  assert.equal(missedScheduledWorkout({ sessions: [done('Strength A', '2026-09-18')], today: '2026-09-20', nameFor }).workoutId, 'strength-accessories-1');
  // Today 09-24 is A; last done Acc2 on 09-22 → next is A = today's workout: nothing to offer.
  assert.equal(missedScheduledWorkout({ sessions: [done('Strength A', '2026-09-18'), done('Strength Accessories 2', '2026-09-22')], today: '2026-09-24', nameFor }), null);
  const dismissed = dismissMissedSettings('2026-09-25');
  assert.equal(missedScheduledWorkout({ sessions: [], settings: dismissed, today: '2026-09-25', nameFor }), null);
});

test('doing it today shifts the rotation so that workout is today and the rest follows', () => {
  const settings = catchUpSettings({}, 'strength-accessories-1', '2026-09-23');
  const schedule = mainProgramSchedule(settings, '2026-09-23');
  assert.equal(schedule.workoutId, 'strength-accessories-1');
  assert.deepEqual(schedule.upcoming.map(day => day.workoutId), [null, 'strength-b', 'strength-accessories-2']);
  assert.equal(missedScheduledWorkout({ sessions: [done('Strength A', '2026-09-18')], settings, today: '2026-09-23', nameFor }), null);
});
