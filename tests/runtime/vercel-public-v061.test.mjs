import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from '../../apps/api/dist/app.js';
import { witnessedWrite, readChain } from '@cubes/graph';
import { createPublicHandler } from '../../hosting/public-handler.mjs';
import { prepareWitnessSnapshot } from '../../hosting/witness-snapshot.mjs';

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
  const server = createApiServer({ sessions: { authenticate: token => token === readerToken ? { id: 'serena', kind: 'reader' } : { id: 'kanny', kind: 'owner' } } });
  const url = await serve(t, createPublicHandler({ createRuntime: async () => ({ server, readerToken }) }));
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
  const server = createServer((request, response) => { response.end(JSON.stringify({ status: 'fixture-only' })); });
  const url = await serve(t, createPublicHandler({ createRuntime: async () => { calls++; return { server, readerToken: 'private-test-reader' }; } }));
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
