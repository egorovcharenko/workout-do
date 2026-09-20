import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedProgress, validProgressToken } from '../lib/progress-sharing.js';
import { saveProgressShare, getProgressShare, readPublicProgress, removeProgressShare } from '../lib/progress-share-store.js';
import { buildProgress, renderProgressModel } from '../components/home/progress.js';

const workout = (id, date, weight, extra = {}) => ({ id, date, finished_at: `${date}T18:00:00Z`, notes: 'PRIVATE NOTES', state_json: 'PRIVATE STATE',
  sets: [{ exercise: 'Barbell Bench Press', set_type: 'working', weight_lb: weight, reps: 8 }], ...extra });
const history = [workout('apr', '2026-04-10', 100), workout('aug', '2026-08-28', 135),
  workout('deload', '2026-09-02', 65, { is_deload: 1 }), workout('sep', '2026-09-16', 140),
  workout('last-deload', '2026-09-19', 70, { is_deload: true })];
const now = new Date('2026-09-20T18:00:00Z');

test('deload workouts never determine latest sets, sparkline points or monthly bars', () => {
  const data = buildProgress(history, [], { today: '2026-09-20' });
  assert.deepEqual(data.trends['Barbell Bench Press'].map(p => p.date), ['2026-04-10', '2026-08-28', '2026-09-16']);
  assert.equal(data.groups[0].exercises[0].groups[0].load, '140 lb');
  assert.equal(data.groups[0].exercises[0].date, '2026-09-16');
  assert.doesNotMatch(renderProgressModel(data), /2026-09-02|2026-09-19/);
  assert.deepEqual(buildProgress([history[2]], [], { today: '2026-09-20' }).groups, []);
});

test('public snapshot includes only progress, with no account data, notes, active workout or raw sessions', () => {
  const model = buildSharedProgress([...history, workout('live', '2026-09-20', 900, { finished_at: null })],
    [{ taken_at: '2026-09-16', chest_cm: 99.5, notes: 'PRIVATE MEASUREMENT' }],
    { bodyweight: '165', email: 'private@example.com', birth_date: 'PRIVATE BIRTHDAY' }, now);
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /PRIVATE|private@example|state_json|finished_at|900/);
  assert.match(serialized, /99.5/);
  const html = renderProgressModel(model);
  assert.doesNotMatch(html, /onclick|<button|Sign in|Start workout/);
  assert.match(html, /data-chart-points/);
});

function database() {
  const entries = new Map();
  const snapshot = path => ({ exists: entries.has(path), data: () => entries.get(path) });
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => col(`${path}/${name}`), get: async () => snapshot(path) });
  const col = path => ({ doc: id => ref(`${path}/${id}`), get: async () => ({ docs: [...entries.keys()].filter(key => key.startsWith(`${path}/`) && key.slice(path.length + 1).indexOf('/') === -1).map(key => ({ ...snapshot(key), id: key.split('/').at(-1) })) }) });
  return { entries, collection: col, runTransaction: async callback => callback({ get: async ref => snapshot(ref.path), set: (ref, value) => entries.set(ref.path, value), delete: ref => entries.delete(ref.path) }) };
}

test('sharing creates an opaque link, refreshes its snapshot, revokes it and never exposes owner identity', async () => {
  const db = database();
  history.forEach(s => db.entries.set(`users/owner/sessions/${s.id}`, s));
  const link = await saveProgressShare(db, 'owner', now);
  const token = link.path.split('/').at(-1);
  assert.ok(validProgressToken(token));
  assert.equal(token.length, 48);
  assert.deepEqual(await getProgressShare(db, 'owner'), link);
  const shared = await readPublicProgress(db, token);
  assert.equal(shared.ownerUid, undefined);
  assert.deepEqual((await saveProgressShare(db, 'owner', now)).path, link.path);
  assert.equal(await readPublicProgress(db, '../owner'), null);
  assert.equal(await readPublicProgress(db, 'a'.repeat(48)), null);
  await removeProgressShare(db, 'owner');
  assert.equal(await readPublicProgress(db, token), null);
  assert.equal(await getProgressShare(db, 'owner'), null);
});

test('knowing another owners token cannot overwrite or revoke their snapshot', async () => {
  const db = database();
  const first = await saveProgressShare(db, 'owner', now);
  const token = first.path.split('/').at(-1);
  db.entries.set('users/other/settings/progressShare', { token });
  assert.equal(await getProgressShare(db, 'other'), null);
  const second = await saveProgressShare(db, 'other', now);
  assert.notEqual(second.path, first.path);
  db.entries.set('users/other/settings/progressShare', { token });
  await removeProgressShare(db, 'other');
  assert.ok(await readPublicProgress(db, token));
});
