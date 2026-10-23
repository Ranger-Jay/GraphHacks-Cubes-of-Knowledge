import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiHandler } from '../../apps/api/dist/app.js';
import { witnessedWrite, readChain } from '@cubes/graph';
import { createPublicHandler } from '../../hosting/public-handler.mjs';
import { prepareWitnessSnapshot } from '../../hosting/witness-snapshot.mjs';
import { bindPublicPath, bindIdeaDetail } from '../../hosting/vercel-entry.mjs';

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('hosted health is liveness only and does not create a graph connection', async t => {
  let calls = 0;
  const url = await serve(t, createPublicHandler({ createRuntime: () => { calls++; throw new Error(); } }));
  const result = await fetch(`${url}/api/health`);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).ready, false);
  assert.equal(calls, 0);
});

test('physical Vercel entrypoint binds one route regardless of rewrite/protection/caller query parameters', async t => {
  const readerToken = 'private-test-reader';
  const handleRequest = createApiHandler({ sessions: { authenticate: token => token === readerToken ? { id: 'serena', kind: 'reader' } : null } });
  const url = await serve(t, bindPublicPath('/api/session/access', { createRuntime: async () => ({ handleRequest, readerToken }) }));
  for (const path of ['/api/index?__cubes_path=approvals', '/api/session/access?__vercel_share=test-only-transport-value', '/api/health?__cubes_path=session%2Faccess&__cubes_path=approvals']) {
    const result = await fetch(url + path, { headers: { Authorization: 'Bearer owner-attempt' } });
    assert.deepEqual(await result.json(), { access: 'READER', canReadIdeas: true, canImportIdeas: false });
  }
  assert.equal((await fetch(`${url}/api/session/access`, { method: 'POST' })).status, 403);
  assert.throws(() => bindPublicPath('/api/approvals'));
});

test('dynamic idea entrypoint refuses duplicate, traversing, or missing identifiers before dispatch', async t => {
  let calls = 0;
  const handler = bindIdeaDetail({ createRuntime: () => { calls++; throw new Error(); } });
  const url = await serve(t, (request, response) => {
    const values = new URL(request.url, 'http://test.invalid').searchParams.getAll('ideaId');
    request.query = { ideaId: values.length > 1 ? values : values[0] };
    return handler(request, response);
  });
  for (const query of ['', '?ideaId=..%2Fsecret', '?ideaId=idea-001&ideaId=idea-002']) {
    assert.equal((await fetch(url + '/' + query)).status, 400);
  }
  assert.equal(calls, 0);
});

test('owner/import/approval/unknown paths cannot reach the underlying API', async t => {
  let calls = 0;
  const url = await serve(t, createPublicHandler({ createRuntime: () => { calls++; throw new Error(); } }));
  for (const path of ['/api/approvals', '/api/studio/ideas/idea-001/import', '/api/studio/ideas/idea-001/import-status', '/__owner_rehearsal/api/studio/ideas/idea-001/import']) {
    const result = await fetch(url + path, { method: 'POST', headers: { Authorization: 'Bearer owner-attempt' } });
    assert.equal(result.status, 403, path);
  }
  assert.equal((await fetch(`${url}/api/releases/other-release/analysis`)).status, 404);
  assert.equal(calls, 0);
});

test('caller authorization is replaced and real API session enforcement returns reader access', async t => {
  const readerToken = 'private-test-reader';
  const handleRequest = createApiHandler({ sessions: { authenticate: token => token === readerToken ? { id: 'serena', kind: 'reader' } : { id: 'kanny', kind: 'owner' } } });
  const url = await serve(t, createPublicHandler({ createRuntime: async () => ({ handleRequest, readerToken }) }));
  const response = await fetch(`${url}/api/session/access`, { headers: { Authorization: 'Bearer owner-attempt' } });
  assert.deepEqual(await response.json(), { access: 'READER', canReadIdeas: true, canImportIdeas: false });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('Explain is disabled by default without constructing a provider or graph runtime', async t => {
  let calls = 0;
  const url = await serve(t, createPublicHandler({ env: {}, createRuntime: () => { calls++; throw new Error(); } }));
  const result = await fetch(`${url}/api/talk`, { method: 'POST' });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.code, 'NOT_IMPLEMENTED');
  assert.equal(calls, 0);
});

test('enabled Explain rejects absent/wrong/cross-site origins before any runtime or provider', async t => {
  let calls = 0;
  const url = await serve(t, createPublicHandler({ env: { PUBLIC_DEMO_TALK_ENABLED: 'true', WEB_ORIGIN: 'https://demo.example' }, createRuntime: () => { calls++; throw new Error(); } }));
  for (const headers of [{}, { Origin: 'https://other.example' }, { Origin: 'https://demo.example', 'Sec-Fetch-Site': 'cross-site' }]) {
    const result = await fetch(`${url}/api/talk`, { method: 'POST', headers });
    assert.equal(result.status, 403);
  }
  assert.equal(calls, 0);
});

test('missing private configuration fails closed without leaking internal errors', async t => {
  const url = await serve(t, createPublicHandler({ createRuntime: () => { throw new Error('private-value-must-not-leak'); } }));
  const result = await fetch(`${url}/api/releases/rel-wad/analysis`);
  assert.equal(result.status, 503);
  const body = await result.text();
  assert.match(body, /GRAPH_UNAVAILABLE/);
  assert.doesNotMatch(body, /private-value/);
});

test('one initialized runtime is shared across simultaneous reader requests', async t => {
  let calls = 0;
  const handleRequest = async (request, response) => { response.end(JSON.stringify({ status: 'fixture-only' })); };
  const url = await serve(t, createPublicHandler({ createRuntime: async () => { calls++; return { handleRequest, readerToken: 'private-test-reader' }; } }));
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(`${url}/api/graph/status`)));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(calls, 1);
});

test('private witness snapshot preserves a valid committed chain and rejects wrong keys/tampering', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cubes-v061-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = 'test-only-evidence-key-not-a-live-secret-061';
  // Offline fixture only: no FalkorDB server is contacted by this test.
  const client = { config: { graphName: 'fixture_graph' }, read: async () => [] };
  await witnessedWrite(client, { dir, key: Buffer.from(key) }, 't-wad', 'fixture-init', async () => {}, { init: true });
  const bytes = await readFile(join(dir, 'fixture_graph', 't-wad.jsonl'));
  const env = { FALKORDB_GRAPH: 'fixture_graph', API_TENANT_ID: 't-wad', GRAPH_EVIDENCE_KEY: key, GRAPH_WITNESS_SNAPSHOT_B64: bytes.toString('base64') };
  const restored = await prepareWitnessSnapshot(env);
  t.after(() => rm(restored.dir, { recursive: true, force: true }));
  assert.equal((await readChain(restored, 'fixture_graph', 't-wad')).status, 'COMMITTED');
  assert.deepEqual(await readFile(join(restored.dir, 'fixture_graph', 't-wad.jsonl')), bytes);
  await assert.rejects(prepareWitnessSnapshot({ ...env, GRAPH_EVIDENCE_KEY: key + '-wrong' }));
  await assert.rejects(prepareWitnessSnapshot({ ...env, GRAPH_WITNESS_SNAPSHOT_B64: Buffer.from(bytes.toString().replace('fixture-init', 'tampered-init')).toString('base64') }));
  await assert.rejects(prepareWitnessSnapshot({ ...env, FALKORDB_GRAPH: '../escape' }));
  await assert.rejects(prepareWitnessSnapshot({ ...env, GRAPH_WITNESS_SNAPSHOT_B64: '' }));
});

function talkRequest() {
  const request = Readable.from([Buffer.from(JSON.stringify({ persona: 'roy', intent: 'release-gap', releaseId: 'rel-wad' }))]);
  return Object.assign(request, { method: 'POST', url: '/api/talk', headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' } });
}

function memoryResponse() {
  return Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, headersSent: false, ends: 0,
    setHeader() {}, writeHead(status) { this.statusCode = status; this.headersSent = true; },
    end(body) { this.body = body; this.ends++; this.writableEnded = true; this.emit('finish'); } });
}

test('a response close notification cannot settle the hosted function before its API work', async () => {
  let release;
  let started;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const providerPending = new Promise(resolve => { release = resolve; });
  const readerToken = 'fixture-reader';
  const a = { status: 'AVAILABLE', requestId: 'fixture-request', releaseId: 'rel-wad', cutId: 'v4', revision: 'r1', clearance: 'GAP',
    summary: 'Synthetic fixture', evidence: [], sources: [{ id: 's1' }], nodes: [], edges: [], proposedActions: [] };
  const handleRequest = createApiHandler({
    sessions: { authenticate: token => token === readerToken ? { id: 'serena', kind: 'reader' } : null },
    analysis: { async analyze() { return a; } },
    talker: { async explain(_analysis, _persona, signal) {
      started(); await providerPending;
      assert.equal(signal.aborted, false);
      return { status: 'AVAILABLE', explanation: 'fixture answer' };
    } },
  });
  const handler = createPublicHandler({ env: { PUBLIC_DEMO_TALK_ENABLED: 'true', WEB_ORIGIN: 'http://127.0.0.1:5173' },
    createRuntime: async () => ({ handleRequest, readerToken }) });
  const request = talkRequest();
  const response = memoryResponse();
  let settled = false;
  const pending = handler(request, response).then(() => { settled = true; });
  await providerStarted;
  response.emit('close');
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(settled, false, 'the hosted handler must await the API promise, not response close'); }
  finally { release(); await pending; await new Promise(resolve => setImmediate(resolve)); }
  assert.match(response.body, /fixture answer/);
});

for (const stage of ['runtime', 'first-read', 'provider', 'fresh-read']) {
  test(`hosted deadline bounds ${stage} and discards late work without another response`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(console, 'error', () => {});
    let release;
    let entered;
    const held = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const wait = async () => { entered(); await held; };
    let reads = 0;
    let providerCalls = 0;
    let providerSignal;
    const readerToken = 'fixture-reader';
    const a = { status: 'AVAILABLE', releaseId: 'rel-wad', cutId: 'v4', revision: 'r1', clearance: 'GAP',
      summary: 'Synthetic fixture', evidence: [], sources: [{ id: 's1' }], nodes: [], edges: [], proposedActions: [] };
    const handleRequest = createApiHandler({
      sessions: { authenticate: () => ({ id: 'serena', kind: 'reader' }) },
      analysis: { async analyze() {
        reads++;
        if ((stage === 'first-read' && reads === 1) || (stage === 'fresh-read' && reads === 2)) await wait();
        return a;
      } },
      talker: { async explain(_a, _persona, signal) {
        providerCalls++; providerSignal = signal;
        if (stage === 'provider') await wait();
        return { status: 'AVAILABLE', explanation: 'late fixture answer must not escape' };
      } },
    });
    const handler = createPublicHandler({ env: { PUBLIC_DEMO_TALK_ENABLED: 'true', WEB_ORIGIN: 'http://127.0.0.1:5173' },
      createRuntime: async () => { if (stage === 'runtime') await wait(); return { handleRequest, readerToken }; } });
    const response = memoryResponse();
    const pending = handler(talkRequest(), response);
    await started;
    t.mock.timers.tick(27_000);
    await pending;
    assert.equal(response.statusCode, 503);
    assert.match(response.body, /timed out/);
    if (providerSignal) assert.equal(providerSignal.aborted, true);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(response.ends, 1);
    assert.doesNotMatch(response.body, /late fixture answer/);
    assert.equal(providerCalls, ['runtime', 'first-read'].includes(stage) ? 0 : 1);
  });
}
