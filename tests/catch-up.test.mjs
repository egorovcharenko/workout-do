import test from 'node:test';
import assert from 'node:assert/strict';
import { mainProgramSchedule, missedScheduledWorkout, catchUpSettings, dismissMissedSettings } from '../lib/main-program.js';

// Default anchor 2026-09-06 → rotation: A, Acc1, rest, B, Acc2, rest, ...
const names = { 'strength-a': 'Strength A', 'strength-accessories-1': 'Strength Accessories 1', 'strength-b': 'Strength B', 'strength-accessories-2': 'Strength Accessories 2' };
const nameFor = id => names[id];
const done = (workout_name, date) => ({ workout_name, date, finished_at: `${date}T19:00:00Z` });

test('a skipped scheduled day is reported, rest days are passed over, and doing it later clears it', () => {
  // 2026-09-24 is Strength A (day 18), 09-25 is Acc1.
  assert.equal(mainProgramSchedule({}, '2026-09-24').workoutId, 'strength-a');
  const missed = missedScheduledWorkout({ sessions: [], today: '2026-09-25', nameFor });
  assert.deepEqual(missed, { workoutId: 'strength-a', date: '2026-09-24', daysLate: 1 });
  // 09-27 (rest) → looks past the rest day to 09-26 (Strength B).
  assert.equal(missedScheduledWorkout({ sessions: [], today: '2026-09-28', nameFor }).workoutId, 'strength-b');
  assert.equal(missedScheduledWorkout({ sessions: [done('Strength A', '2026-09-24')], today: '2026-09-25', nameFor }), null);
  assert.equal(missedScheduledWorkout({ sessions: [{ workout_name: 'Strength A', date: '2026-09-25' }], today: '2026-09-25', nameFor }), null,
    'Already started today');
  const dismissed = dismissMissedSettings('2026-09-25');
  assert.equal(missedScheduledWorkout({ sessions: [], settings: dismissed, today: '2026-09-25', nameFor }), null);
  assert.equal(missedScheduledWorkout({ sessions: [], settings: dismissed, today: '2026-09-26', nameFor }).workoutId, 'strength-accessories-1',
    'A dismissal only covers the days before it');
});

test('catching up shifts the rotation so the missed workout is today and the rest follows', () => {
  const settings = catchUpSettings({}, '2026-09-24', '2026-09-25');
  const schedule = mainProgramSchedule(settings, '2026-09-25');
  assert.equal(schedule.workoutId, 'strength-a');
  assert.deepEqual(schedule.upcoming.map(day => day.workoutId), ['strength-accessories-1', null, 'strength-b']);
  assert.equal(settings.missed_check_from, '2026-09-25');
  assert.equal(missedScheduledWorkout({ sessions: [], settings, today: '2026-09-25', nameFor }), null,
    'Re-mapped past days are not reported as missed');
});
