// v034.00: real repository manifest -> disposable graph -> shipped HTTP server.
// Requires an explicitly selected disposable local FalkorDB server and a prior npm build.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { GraphClient, configFromEnv, loadIdeaManifest, seedIdeaverse } from '../packages/graph/dist/index.js';

if (process.env.CUBES_PARTIAL_GRAPH !== '1') throw new Error('Set CUBES_PARTIAL_GRAPH=1 with a disposable loopback FalkorDB server.');
const config = configFromEnv();
if (config.host !== '127.0.0.1' || config.tls || config.username || config.password) throw new Error('This rehearsal requires an isolated unauthenticated loopback test server.');
const root = fileURLToPath(new URL('../', import.meta.url));
const graphName = `partial_manifest_${randomBytes(8).toString('hex')}`;
const client = new GraphClient({ ...config, graphName, timeoutMs: 15000 });
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const owner = randomBytes(24).toString('hex'), reader = randomBytes(24).toString('hex');
let server;
try {
  const manifest = await loadIdeaManifest(root);
  assert.equal(manifest.manifestSha256, '85209bd70ee02f779f907addadd704a84e7867f0f77b3f4f187ecba4e5a41994');
  assert.equal(manifest.ideas.length, 100);
  assert.equal((await seedIdeaverse(client, root)).ideas, 100);
  server = spawn(process.execPath, ['apps/api/dist/server.js'], { cwd: root, env: {
    ...process.env, API_HOST: '127.0.0.1', API_PORT: String(port), API_TENANT_ID: 't-wad',
    API_OWNER_TOKEN: owner, API_READER_TOKEN: reader, API_AGENT_TOKEN: '',
    FALKORDB_HOST: '127.0.0.1', FALKORDB_PORT: String(config.port), FALKORDB_GRAPH: graphName,
    FALKORDB_TLS: 'false', FALKORDB_USERNAME: '', FALKORDB_PASSWORD: '',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', c => { logs += c; }); server.stderr.on('data', c => { logs += c; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Shipped API startup timed out')), 15000);
    const ready = () => { if (logs.includes('Bootstrap API:')) { clearTimeout(timer); resolve(); } };
    server.stdout.on('data', ready);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', () => { clearTimeout(timer); reject(new Error('Shipped API exited before readiness')); });
    ready();
  });
  const request = async (path, token, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: body ? 'POST' : 'GET',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const raw = await response.text();
    assert.equal(raw.includes(owner) || raw.includes(reader) || raw.includes(root), false);
    return { status: response.status, body: JSON.parse(raw) };
  };
  const path = '/api/studio/ideas';
  assert.equal((await request(path)).status, 401);
  const list = await request(path, reader);
  assert.equal(list.status, 200); assert.equal(list.body.status, 'AVAILABLE');
  assert.equal(list.body.ideas.length, 100); assert.equal(list.body.counts.imported, 0);
  assert.deepEqual(list.body.integrity, []); assert.equal(list.body.workspace.revision, 0);
  const idea = manifest.ideas[0];
  const detail = await request(`${path}/${idea.id}`, reader);
  assert.equal(detail.status, 200); assert.equal(detail.body.idea.sha256, idea.sha256);
  const words = detail.body.idea.text.trim().split(/\s+/).length; assert.ok(words > 0 && words <= 30);
  const attempt = { idempotencyKey: 'partial-manifest-owner-1', expectedRevision: 0 };
  assert.equal((await request(`${path}/${idea.id}/import`, reader, attempt)).status, 403);
  const imported = await request(`${path}/${idea.id}/import`, owner, attempt);
  assert.equal(imported.status, 200); assert.equal(imported.body.status, 'IMPORTED');
  assert.equal(imported.body.replayed, false); assert.equal(imported.body.receipt.sha256, idea.sha256);
  assert.deepEqual(Object.keys(imported.body.receipt).sort(), ['ideaId','sha256','workspaceId','importedAt','workspaceRevision','membershipId'].sort());
  const fresh = await request(path, reader);
  const row = fresh.body.ideas.find(i => i.id === idea.id);
  assert.equal(fresh.body.counts.imported, 1); assert.equal(fresh.body.workspace.revision, 1);
  assert.equal(row.imported, true); assert.equal(row.membershipId, imported.body.receipt.membershipId);
  assert.equal(row.importedAt, imported.body.receipt.importedAt);
  const replay = await request(`${path}/${idea.id}/import`, owner, attempt);
  assert.equal(replay.body.replayed, true); assert.deepEqual(replay.body.receipt, imported.body.receipt);
  const receipts = async () => (await client.read('MATCH (r:ImportReceipt) RETURN count(r) AS n'))[0].n;
  const before = await receipts();
  const status = await request(`${path}/${idea.id}/import-status`, owner, attempt);
  assert.equal(status.body.status, 'IMPORTED'); assert.deepEqual(status.body.receipt, imported.body.receipt);
  assert.equal(await receipts(), before); assert.equal(before, 1);
  assert.equal(logs.includes(owner) || logs.includes(reader), false);
  console.log(JSON.stringify({ status: 'PASS', manifestSha256: manifest.manifestSha256, ideas: 100,
    verifiedDetailWords: words, imported: 1, receiptCount: before, readerWrite: 403,
    sameKeyReplay: true, readOnlyRecheck: true, noStore: true, tokenAndPathLeak: false,
    browserImportBinding: 'NOT_INCLUDED', cometPull: 'NOT_INCLUDED' }));
} finally {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  // Only this script's random graph namespace is touched; the server/data directory belongs to its launcher.
  await client.write('MATCH (n) DETACH DELETE n').catch(() => undefined);
  await client.close();
}
