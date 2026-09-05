import test from 'node:test';
import assert from 'node:assert/strict';
import { recentActivity, latestLift, latestBody } from '../components/home/overview.js';

test('activity uses exactly fourteen local dates and counts sessions, not sets or empty drafts', () => {
  const history = [
    { date: '2026-03-01', sets: [{ reps: 5 }] },
    { date: '2026-03-02', sets: [{ reps: 5 }, { reps: 6 }] },
    { date: '2026-03-15', sets: [{ reps: 8 }] },
    { date: '2026-03-15', sets: [{ reps: 10 }] },
    { date: '2026-03-14', sets: [{ reps: 0 }] },
    { date: '2026-03-16', sets: [{ reps: 5 }] },
  ];
  const result = recentActivity(history, new Date(2026, 2, 15, 12));
  assert.equal(result.days.length, 14);
  assert.equal(result.days[0].date, '2026-03-02');
  assert.equal(result.days.at(-1).date, '2026-03-15');
  assert.equal(result.days.at(-1).today, true);
  assert.equal(result.days.at(-1).count, 2);
  assert.equal(result.count, 3);
});

test('1RM compares the previous training point, excludes deload regressions, and preserves input', () => {
  const points = [{ date: '2026-09-03', orm: 174 }, { date: '2026-09-01', orm: 166 }, { date: '2026-09-02', orm: 130, is_deload: true }];
  assert.deepEqual(latestLift({ Bench: points }, 'Bench'), { value: 174, delta: 8, deload: undefined });
  assert.equal(points[0].date, '2026-09-03');
  assert.equal(latestLift({ Bench: [...points, { date: '2026-09-04', orm: 130, is_deload: true }] }, 'Bench').delta, null);
  assert.equal(latestLift({}, 'Bench'), null);
  assert.equal(latestLift({ Bench: [{ date: '2026-09-01', orm: 166 }] }, 'Bench').delta, null);
});

test('body summaries use the previous recorded value for each metric, without treating missing values as zero', () => {
  const rows = [{ taken_at: '2026-09-03', waist_cm: 83 }, { taken_at: '2026-09-02', weight_kg: 80 }, { taken_at: '2026-09-01', waist_cm: 84 }];
  assert.deepEqual(latestBody(rows, 'waist_cm'), { value: 83, date: '2026-09-03', delta: -1 });
  assert.deepEqual(latestBody(rows, 'weight_kg'), { value: 80, date: '2026-09-02', delta: null });
  assert.equal(latestBody(rows, 'chest_cm'), null);
});
