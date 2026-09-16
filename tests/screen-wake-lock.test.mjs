import test from 'node:test';
import assert from 'node:assert/strict';
import { keepScreenAwake } from '../lib/screen-wake-lock.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
class Sentinel extends EventTarget {
  released = false;
  releases = 0;
  async release() {
    this.releases++;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}
function environment(request) {
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const win = new EventTarget();
  const locks = [];
  const calls = [];
  const nav = { wakeLock: { request: async type => {
    calls.push(type);
    if (request) return request();
    const lock = new Sentinel(); locks.push(lock); return lock;
  } } };
  const visibility = state => { doc.visibilityState = state; doc.dispatchEvent(new Event('visibilitychange')); };
  return { doc, nav, win, calls, locks, visibility, start: () => keepScreenAwake(doc, nav, win) };
}

test('open requests one screen lock, background releases it, returning reacquires, closing cleans up', async () => {
  const e = environment(); const stop = e.start(); await flush();
  assert.deepEqual(e.calls, ['screen']);
  e.doc.dispatchEvent(new Event('pointerdown')); e.win.dispatchEvent(new Event('focus')); await flush();
  assert.equal(e.calls.length, 1);
  e.visibility('hidden'); await flush();
  assert.equal(e.locks[0].released, true);
  e.visibility('visible'); await flush();
  assert.equal(e.calls.length, 2);
  stop(); await flush(); assert.equal(e.locks[1].released, true);
  e.doc.dispatchEvent(new Event('pointerdown')); e.visibility('visible'); e.win.dispatchEvent(new Event('pageshow')); await flush();
  assert.equal(e.calls.length, 2, 'No listeners remain after unmount');
});

test('hidden launch waits; page cache navigation releases and restores even without a visibility event', async () => {
  const e = environment(); e.doc.visibilityState = 'hidden'; const stop = e.start(); await flush();
  assert.equal(e.calls.length, 0);
  e.visibility('visible'); await flush();
  e.win.dispatchEvent(new Event('pagehide')); await flush();
  assert.equal(e.locks[0].released, true);
  e.win.dispatchEvent(new Event('focus')); await flush(); assert.equal(e.calls.length, 1);
  e.win.dispatchEvent(new Event('pageshow')); await flush(); assert.equal(e.calls.length, 2);
  stop();
});

test('unsupported and denied APIs do not break the app; later interaction retries without a loop', async () => {
  keepScreenAwake(new EventTarget(), {}, new EventTarget())();
  let denied = true;
  const lock = new Sentinel();
  const e = environment(() => { if (denied) throw Error('NotAllowedError'); return lock; });
  const stop = e.start(); await flush(); await flush(); assert.equal(e.calls.length, 1);
  denied = false; e.doc.dispatchEvent(new Event('pointerdown')); await flush();
  assert.equal(e.calls.length, 2);
  await lock.release(); await flush(); assert.equal(e.calls.length, 2, 'System revocation never starts a retry loop');
  stop();
});

test('late requests are released after unmount, including React effect remounts', async () => {
  let resolve;
  const e = environment(() => new Promise(r => { resolve = r; }));
  const stop = e.start();
  e.doc.dispatchEvent(new Event('pointerdown')); assert.equal(e.calls.length, 1);
  stop(); const late = new Sentinel(); resolve(late); await flush();
  assert.equal(late.released, true);
  const stopAgain = e.start(); assert.equal(e.calls.length, 2);
  const current = new Sentinel(); resolve(current); await flush();
  assert.equal(current.released, false); stopAgain(); await flush(); assert.equal(current.released, true);
});

test('background and return during a pending request discards stale lock and acquires a fresh one', async () => {
  let resolve;
  const e = environment(() => new Promise(r => { resolve = r; }));
  const stop = e.start(); e.visibility('hidden'); e.visibility('visible');
  const stale = new Sentinel(); resolve(stale); await flush();
  assert.equal(stale.released, true); assert.equal(e.calls.length, 2);
  const current = new Sentinel(); resolve(current); await flush(); assert.equal(current.released, false);
  stop();
});
