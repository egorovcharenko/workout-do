import { randomBytes } from 'node:crypto';
import { buildSharedProgress, validProgressToken } from './progress-sharing.js';

const ownerRef = (db, uid) => db.collection('users').doc(uid).collection('settings').doc('progressShare');

export async function getProgressShare(db, uid) {
  const owner = await ownerRef(db, uid).get();
  const token = owner.data()?.token;
  if (!validProgressToken(token)) return null;
  const snapshot = await db.collection('progressShares').doc(token).get();
  return snapshot.exists && snapshot.data()?.ownerUid === uid ? { path: `/progress/${token}` } : null;
}

export async function saveProgressShare(db, uid, now = new Date()) {
  const user = db.collection('users').doc(uid);
  const [sessions, measurements, settings] = await Promise.all([
    user.collection('sessions').get(), user.collection('measurements').get(), user.collection('settings').doc('app').get(),
  ]);
  const model = buildSharedProgress(
    sessions.docs.map(doc => ({ ...doc.data(), id: doc.id })),
    measurements.docs.map(doc => doc.data()), settings.data() || {}, now,
  );
  const ref = ownerRef(db, uid);
  return db.runTransaction(async transaction => {
    const owner = await transaction.get(ref);
    const existing = owner.data()?.token;
    const prior = validProgressToken(existing) ? await transaction.get(db.collection('progressShares').doc(existing)) : null;
    const token = prior?.data()?.ownerUid === uid ? existing : randomBytes(24).toString('hex');
    transaction.set(db.collection('progressShares').doc(token), { ownerUid: uid, model, updatedAt: now.toISOString() });
    transaction.set(ref, { token });
    return { path: `/progress/${token}` };
  });
}

export async function removeProgressShare(db, uid) {
  const ref = ownerRef(db, uid);
  await db.runTransaction(async transaction => {
    const owner = await transaction.get(ref);
    const token = owner.data()?.token;
    if (validProgressToken(token)) {
      const shared = db.collection('progressShares').doc(token);
      const prior = await transaction.get(shared);
      if (prior.data()?.ownerUid === uid) transaction.delete(shared);
    }
    transaction.delete(ref);
  });
}

export async function readPublicProgress(db, token) {
  if (!validProgressToken(token)) return null;
  const snapshot = await db.collection('progressShares').doc(token).get();
  // Only this derived model reaches the public renderer; owner identity stays server-side.
  return snapshot.exists ? snapshot.data()?.model || null : null;
}
