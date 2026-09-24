// Regression: when the server mints a replacement session doc (the sent id no
// longer exists, or its update is rejected as a stale-tab / cross-workout
// write), the client must adopt the returned id and reuse it on every later
// autosave. Before the fix the client kept the old truthy id, so each later
// autosave created another duplicate session doc.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

import { canApplyResolvedSessionId, sessionUpdateConflict } from "../lib/session-save-scope.js";

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    console,
    setTimeout,
    require: (id) => dependencies[id] || {},
  });
  return exports;
}
// set-rir.js is self-contained; the other legacy modules use extensionless
// imports that plain Node can't resolve, so they get faithful stubs here.
// These tests only exercise the save queue (autoSavePayload), which needs
// TEST_MODE falsy and api.save — nothing else from those modules.
const setRir = load("../lib/legacy/set-rir.js");

// In-memory Firestore stand-in: only the calls saveSession makes are modeled.
const store = new Map();
let autoSeq = 0;
const firestore = {
  collection: (dbArg, ...segments) => ({ path: segments.join("/"), kind: "collection" }),
  doc: (colRef, id) => {
    if (id == null) {
      autoSeq += 1;
      id = `auto-${autoSeq}`;
    }
    return { path: `${colRef.path}/${id}`, id, kind: "doc" };
  },
  getDoc: async (ref) => ({ exists: () => store.has(ref.path), data: () => store.get(ref.path) }),
  setDoc: async (ref, data) => {
    store.set(ref.path, { ...data });
  },
  updateDoc: async (ref, data) => {
    if (!store.has(ref.path)) throw new Error("missing doc");
    store.set(ref.path, { ...store.get(ref.path), ...data });
  },
  deleteDoc: async (ref) => {
    store.delete(ref.path);
  },
  getDocs: async () => ({ docs: [] }),
  query: (colRef) => colRef,
  orderBy: () => ({}),
};
const docPath = (id) => `users/test-uid/sessions/${id}`;
const seenDocs = () => [...store.entries()].filter(([p]) => p.startsWith("users/test-uid/sessions/"));

// The real server save path, backed by the fake Firestore.
const sessionsApi = load("../lib/db/sessions.ts", {
  "firebase/firestore": firestore,
  "@/lib/firebase/client": { db: () => ({}) },
  "@/lib/log": { log() {}, warn() {}, error() {} },
  "@/lib/session-save-scope": { sessionUpdateConflict },
  "@/lib/legacy/set-rir": setRir,
  "@/lib/legacy/standards": {},
  "./types": {},
});

// The real client save queue. api.save delegates to the real saveSession.
const seenSessionIds = [];
const api = {
  save: (body) => {
    seenSessionIds.push(body.session_id ?? null);
    return sessionsApi.saveSession("test-uid", body);
  },
  // Stands in for the authenticated DELETE /api/workout-sessions/:id route.
  deleteSession: async (id) => {
    if (api.failDelete) throw new Error("offline");
    store.delete(docPath(id));
  },
};
const { autoSavePayload, abandonSession } = load("../lib/legacy/session-persistence.js", {
  "@/lib/db/api": { api },
  "./shared": { TEST_MODE: false, localDate: () => "2026-07-09" },
  "./session-utils": { safeJSON: (s) => { try { return JSON.parse(s); } catch { return []; } } },
  "./belt-load": { currentBeltLoad: () => 0, storedBeltLoad: () => 0 },
  "./set-logging": { isPendingSet: () => false, nextSupersetTarget: () => null },
});

// Mirrors the SessionApp autosave callback: the resolved id is adopted only
// through canApplyResolvedSessionId, and the id sent is the one captured when
// the save was queued (exactly like the component's pendingSaveRef).
async function clientAutosave(payload, state) {
  const saveScope = `${payload.workout}:${payload.date}`;
  const sentSessionId = state.sessionId;
  const sentPayload = { ...payload, session_id: sentSessionId };
  return new Promise((resolve) => {
    autoSavePayload(sentPayload, (newId) => {
      if (canApplyResolvedSessionId(saveScope, state.scope, sentSessionId, newId)) {
        state.sessionId = newId;
      }
      resolve(newId);
    });
  });
}

const payload = (workout, date) => ({ workout, date, sets: [] });

function reset() {
  store.clear();
  seenSessionIds.length = 0;
}

test("normal path: a vanished session id is adopted and reused, never duplicated", async () => {
  reset();
  const state = { scope: "Squat:2026-07-09", sessionId: "old-1" };

  const first = await clientAutosave(payload("Squat", "2026-07-09"), state);
  assert.notEqual(first, "old-1");
  assert.equal(state.sessionId, first);

  const second = await clientAutosave(payload("Squat", "2026-07-09"), state);
  assert.equal(second, first);
  assert.equal(state.sessionId, first);

  assert.equal(seenDocs().length, 1);
  assert.equal(seenSessionIds[1], first);
});

test("queued autosave with the stale id reuses the adopted replacement instead of duplicating", async () => {
  reset();
  const state = { scope: "Squat:2026-07-10", sessionId: "old-1" };

  // Hold the first server round-trip so a second autosave queues with the
  // stale id still on the wire, exactly like the 400ms-debounce race.
  let release;
  let gated = false;
  const gatedSave = api.save;
  api.save = async (body) => {
    seenSessionIds.push(body.session_id ?? null);
    if (!gated) {
      gated = true;
      await new Promise((r) => {
        release = r;
      });
    }
    return sessionsApi.saveSession("test-uid", body);
  };
  try {
    const p1 = clientAutosave(payload("Squat", "2026-07-10"), state);
    assert.ok(gated, "first save must be in flight before the second is queued");
    const p2 = clientAutosave(payload("Squat", "2026-07-10"), state);
    release();
    const [first, second] = await Promise.all([p1, p2]);
    assert.notEqual(first, "old-1");
    assert.equal(state.sessionId, first);
    assert.equal(second, first);
    // The second save must have been stamped with the adopted id, not the stale one.
    assert.equal(seenSessionIds[1], first);
  } finally {
    api.save = gatedSave;
  }
  assert.equal(seenDocs().length, 1);
});

test("cross-day path: a stale-tab date conflict creates a replacement, leaves the old doc alone", async () => {
  reset();
  await firestore.setDoc(
    { path: docPath("old-1"), id: "old-1" },
    { workout_name: "Squat", date: "2026-07-08", sets: [{ exercise: "Squat", set_number: 1 }] },
  );
  const state = { scope: "Squat:2026-07-11", sessionId: "old-1" };

  const first = await clientAutosave(payload("Squat", "2026-07-11"), state);
  assert.notEqual(first, "old-1");
  assert.equal(state.sessionId, first);

  const second = await clientAutosave(payload("Squat", "2026-07-11"), state);
  assert.equal(second, first);

  const oldDoc = (await firestore.getDoc({ path: docPath("old-1"), id: "old-1" })).data();
  assert.equal(oldDoc.date, "2026-07-08");
  assert.equal(oldDoc.sets.length, 1);
  const newDoc = (await firestore.getDoc({ path: docPath(first), id: first })).data();
  assert.equal(newDoc.date, "2026-07-11");
  assert.equal(seenDocs().length, 2);
});

test("cross-workout path: a workout-name conflict creates a replacement, leaves the old doc alone", async () => {
  reset();
  await firestore.setDoc(
    { path: docPath("old-1"), id: "old-1" },
    { workout_name: "Squat", date: "2026-07-12", sets: [{ exercise: "Squat", set_number: 1 }] },
  );
  const state = { scope: "Deadlift:2026-07-12", sessionId: "old-1" };

  const first = await clientAutosave(payload("Deadlift", "2026-07-12"), state);
  assert.notEqual(first, "old-1");
  assert.equal(state.sessionId, first);

  const second = await clientAutosave(payload("Deadlift", "2026-07-12"), state);
  assert.equal(second, first);

  const oldDoc = (await firestore.getDoc({ path: docPath("old-1"), id: "old-1" })).data();
  assert.equal(oldDoc.workout_name, "Squat");
  assert.equal(oldDoc.sets.length, 1);
  const newDoc = (await firestore.getDoc({ path: docPath(first), id: first })).data();
  assert.equal(newDoc.workout_name, "Deadlift");
  assert.equal(seenDocs().length, 2);
});

// Hold api.save's server round-trip until release() so tests can order it
// against an abandon.
function gateSaves() {
  const original = api.save;
  let release;
  const gate = new Promise((r) => { release = r; });
  api.save = async (body) => {
    await gate;
    return original(body);
  };
  return { release, restore: () => { api.save = original; } };
}

test("abandoning a loaded session waits out an in-flight autosave instead of racing it", async () => {
  reset();
  await firestore.setDoc({ path: docPath("s1"), id: "s1" }, { workout_name: "Squat", date: "2026-07-20", sets: [] });
  const gate = gateSaves();
  try {
    const save = clientAutosave(payload("Squat", "2026-07-20"), { scope: "Squat:2026-07-20", sessionId: "s1" });
    const abandon = abandonSession("Squat", "2026-07-20", "s1");
    setTimeout(gate.release, 100);
    await Promise.all([save, abandon]);
  } finally {
    gate.restore();
  }
  assert.equal(seenDocs().length, 0);
});

test("an autosave landing after the abandon delete does not resurrect the workout", async () => {
  reset();
  await firestore.setDoc({ path: docPath("s2"), id: "s2" }, { workout_name: "Squat", date: "2026-07-21", sets: [] });
  const gate = gateSaves();
  let saveSettled;
  try {
    // Not awaited: an abandoned save never reports its id back.
    autoSavePayload({ ...payload("Squat", "2026-07-21"), session_id: "s2" }, () => {});
    await abandonSession("Squat", "2026-07-21", "s2"); // times out waiting, then deletes s2
    assert.equal(seenDocs().length, 0);
    const recreated = new Promise((r) => { saveSettled = r; });
    const deleteSession = api.deleteSession;
    api.deleteSession = async (id) => { await deleteSession(id); saveSettled(); };
    gate.release(); // saveSession now finds no doc and creates a new one
    await recreated;
    api.deleteSession = deleteSession;
  } finally {
    gate.restore();
  }
  assert.equal(seenDocs().length, 0);
});

test("a failed abandon lets later autosaves through", async () => {
  reset();
  api.failDelete = true;
  try {
    await assert.rejects(abandonSession("Squat", "2026-07-22", "s3"), /offline/);
  } finally {
    api.failDelete = false;
  }
  const id = await clientAutosave(payload("Squat", "2026-07-22"), { scope: "Squat:2026-07-22", sessionId: "s3" });
  assert.ok(store.has(docPath(id)));
});
