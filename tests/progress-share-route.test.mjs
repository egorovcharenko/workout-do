import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(email) {
  const calls = [];
  const source = ts.transpileModule(fs.readFileSync(new URL('../app/api/progress-share/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ Request, Response, URL, console,
    auth: async () => ({ user: { email } }), isAllowedSuiteEmail: value => value === 'owner@example.com',
    findFirebaseBridgeUid: async () => 'owner', getFirebaseAdminFirestore: () => ({}),
    getProgressShare: async (_db, uid) => { calls.push(['get', uid]); return { path: '/progress/existing' }; },
    saveProgressShare: async (_db, uid) => { calls.push(['save', uid]); return { path: '/progress/new' }; },
    removeProgressShare: async (_db, uid) => { calls.push(['remove', uid]); },
  });
  vm.runInContext(source, context);
  return { calls, run: async (method, origin) => {
    context.request = new Request('https://workouts.egorovcharenko.com/api/progress-share', { method, headers: origin ? { origin } : {} });
    return vm.runInContext(`${method}(request)`, context);
  } };
}
test('all share-management actions require the allowed owner session', async () => {
  for (const email of [null, 'stranger@example.com']) {
    const h = harness(email);
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await h.run(method)).status, 401);
    assert.deepEqual(h.calls, []);
  }
});
test('foreign-origin mutations are denied and authenticated actions use only the session owner', async () => {
  const h = harness('owner@example.com');
  for (const method of ['POST', 'DELETE']) assert.equal((await h.run(method, 'https://other.example')).status, 403);
  assert.deepEqual(h.calls, []);
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = await h.run(method, 'https://workouts.egorovcharenko.com');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(h.calls, [['get', 'owner'], ['save', 'owner'], ['remove', 'owner']]);
});
