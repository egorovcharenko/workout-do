import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(token) {
  const calls = [];
  const source = ts.transpileModule(fs.readFileSync(new URL('../app/api/progress-share/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ Request, Response, URL, console,
    verifyRequestUid: async request => {
      const header = request.headers.get('authorization');
      return header === 'Bearer owner-token' ? 'owner' : null;
    },
    getFirebaseAdminFirestore: () => ({}),
    getProgressShare: async (_db, uid) => { calls.push(['get', uid]); return { path: '/progress/existing' }; },
    saveProgressShare: async (_db, uid) => { calls.push(['save', uid]); return { path: '/progress/new' }; },
    removeProgressShare: async (_db, uid) => { calls.push(['remove', uid]); },
  });
  vm.runInContext(source, context);
  return { calls, run: async (method, origin) => {
    const headers = { ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    context.request = new Request('https://workouts.egorovcharenko.com/api/progress-share', { method, headers });
    return vm.runInContext(`${method}(request)`, context);
  } };
}
test('all share-management actions require a verified owner ID token', async () => {
  for (const token of [null, 'stranger-token']) {
    const h = harness(token);
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await h.run(method)).status, 401);
    assert.deepEqual(h.calls, []);
  }
});
test('foreign-origin mutations are denied and authenticated actions use only the token owner', async () => {
  const h = harness('owner-token');
  for (const method of ['POST', 'DELETE']) assert.equal((await h.run(method, 'https://other.example')).status, 403);
  assert.deepEqual(h.calls, []);
  for (const method of ['GET', 'POST', 'DELETE']) {
    const response = await h.run(method, 'https://workouts.egorovcharenko.com');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(h.calls, [['get', 'owner'], ['save', 'owner'], ['remove', 'owner']]);
});
