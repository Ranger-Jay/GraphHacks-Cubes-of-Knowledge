import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from '../../apps/api/dist/app.js';
import { createGraphIdeaverse } from '../../apps/api/dist/ideaverse.js';
import { GraphClient, configFromEnv, seedIdeaverse } from '../../packages/graph/dist/index.js';

const sessions = {
  authenticate(token) {
    const principals = {
      'kanny-session-token': { id: 'kanny', kind: 'owner' },
      'serena-session-token': { id: 'serena', kind: 'reader' },
      'roy-session-token': { id: 'roy', kind: 'agent' },
    };
    return principals[token] ?? null;
  },
};
const owner = { authorization: 'Bearer kanny-session-token' };
const reader = { authorization: 'Bearer serena-session-token' };
const agent = { authorization: 'Bearer roy-session-token' };

test('studio routes deny before a body read or a graph call', async () => {
  const gateway = countingGateway();
  const server = createApiServer({ sessions, ideaverse: gateway });
  const origin = await listen(server);
  try {
    const anon = await hangPost(origin, '/api/studio/ideas/idea-a/import');
    assert.equal(anon, 401);
    assert.deepEqual(gateway.calls, []);
    const denied = await post(origin, '/api/studio/ideas/idea-a/import', reader, { idempotencyKey: 'same-key-1', expectedRevision: 0 });
    assert.equal(denied.status, 403);
    assert.equal((await post(origin, '/api/studio/ideas/idea-a/import-status', agent, { idempotencyKey: 'same-key-1', expectedRevision: 0 })).status, 403);
    assert.equal((await get(origin, '/api/studio/ideas', agent)).status, 403);
    assert.equal((await get(origin, '/api/studio/ideas?tenant=t-other', owner)).status, 404);
    assert.equal((await post(origin, '/api/studio/ideas/idea-a/import', owner, { idempotencyKey: 'same-key-1', expectedRevision: 0, ideaId: 'idea-b' })).status, 400);
    assert.deepEqual(gateway.calls, []);
    const listed = await get(origin, '/api/studio/ideas', reader);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.status, 'EMPTY');
    assert.equal(listed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(gateway.calls, ['overview']);
  } finally {
    await close(server);
  }
});

test('an unconfigured studio route stays unavailable after authentication', async () => {
  const server = createApiServer({ sessions });
  const origin = await listen(server);
  try {
    const body = await get(origin, '/api/studio/ideas', reader);
    assert.equal(body.status, 503);
    assert.equal(body.body.status, 'UNAVAILABLE');
    assert.notEqual(body.status, 201);
  } finally {
    await close(server);
  }
});

test('the dev proxy still injects only the reader token', async () => {
  const source = await readFile(new URL('../../apps/web/dev-proxy.ts', import.meta.url), 'utf8');
  assert.match(source, /API_READER_TOKEN/);
  assert.equal(source.includes('API_OWNER_TOKEN'), false);
});

const kind = await launcherKind();
test('live import reconciles on a disposable FalkorDB before success', { skip: kind === null && process.env.CUBES_STARTUP_GRAPH !== '1' ? 'falkordblite is not installed here' : false, timeout: 180000 }, async () => {
  if (kind === null) throw new Error('CUBES_STARTUP_GRAPH=1 but no disposable FalkorDB launcher is available');
  const graph = await openGraph(kind);
  const root = await mkdtemp(join(tmpdir(), 'ideaverse-api-'));
  const name = `idea_api_${randomBytes(4).toString('hex')}`;
  const client = new GraphClient({ ...configFromEnv(), host: '127.0.0.1', port: graph.port, graphName: name, timeoutMs: 15000 });
  const gateway = createGraphIdeaverse(client, root, 't-wad');
  const server = createApiServer({ sessions, ideaverse: gateway });
  const origin = await listen(server);
  try {
    await writeManifest(root);
    await seedIdeaverse(client, root);
    const listed = await get(origin, '/api/studio/ideas', reader);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.status, 'AVAILABLE');
    assert.equal(listed.body.workspace.revision, 0);
    assert.equal(listed.body.counts.imported, 0);
    const before = await receipts(client);
    const readerWrite = await post(origin, '/api/studio/ideas/idea-a/import', reader, { idempotencyKey: 'owner-key-1', expectedRevision: 0 });
    assert.equal(readerWrite.status, 403);
    assert.equal(await receipts(client), before);
    const saved = await post(origin, '/api/studio/ideas/idea-a/import', owner, { idempotencyKey: 'owner-key-1', expectedRevision: 0 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.status, 'IMPORTED');
    assert.equal(saved.body.replayed, false);
    assert.equal(saved.body.receipt.ideaId, 'idea-a');
    assert.equal(saved.body.receipt.workspaceRevision, 1);
    const replay = await post(origin, '/api/studio/ideas/idea-a/import', owner, { idempotencyKey: 'owner-key-1', expectedRevision: 0 });
    assert.equal(replay.body.status, 'IMPORTED');
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.receipt.membershipId, saved.body.receipt.membershipId);
    const reused = await post(origin, '/api/studio/ideas/idea-b/import', owner, { idempotencyKey: 'owner-key-1', expectedRevision: 0 });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.reason, 'KEY_REUSED');
    const stale = await post(origin, '/api/studio/ideas/idea-b/import', owner, { idempotencyKey: 'owner-key-2', expectedRevision: 0 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.reason, 'STALE_REVISION');
    const countBeforeStatus = await receipts(client);
    const status = await post(origin, '/api/studio/ideas/idea-a/import-status', owner, { idempotencyKey: 'owner-key-1', expectedRevision: 0 });
    assert.equal(status.status, 200);
    assert.equal(status.body.status, 'IMPORTED');
    assert.equal(status.body.receipt.sha256, saved.body.receipt.sha256);
    assert.equal(await receipts(client), countBeforeStatus);
    const missing = await post(origin, '/api/studio/ideas/idea-a/import-status', owner, { idempotencyKey: 'missing-key', expectedRevision: 0 });
    assert.equal(missing.status, 200);
    assert.equal(missing.body.status, 'NOT_FOUND');
    const detail = await get(origin, '/api/studio/ideas/idea-a', reader);
    assert.equal(detail.status, 200);
    assert.match(detail.body.idea.text, /unlabeled reel/);
    const file = join(root, 'graph/seed/ideaverse/files/idea-a.txt');
    await writeFile(file, Buffer.from('changed synthetic text\n'));
    const mismatch = await get(origin, '/api/studio/ideas/idea-a', owner);
    assert.equal(mismatch.status, 503);
    assert.equal(mismatch.body.reason, 'SOURCE_MISMATCH');
    await writeFile(file, Buffer.from(`${TEXTS['idea-a']}\n`));
    await graph.stop();
    const down = await post(origin, '/api/studio/ideas/idea-c/import', owner, { idempotencyKey: 'owner-key-3', expectedRevision: 1 });
    assert.equal(down.status, 503);
    assert.notEqual(down.body.status, 'IMPORTED');
    await graph.start();
    const again = await post(origin, '/api/studio/ideas/idea-a/import-status', owner, { idempotencyKey: 'owner-key-1', expectedRevision: 0 });
    assert.equal(again.status, 200);
    assert.equal(again.body.status, 'IMPORTED');
    await client.write('CREATE (:Workspace {id: $id, tenantId: $tenantId, revision: 9})', { id: 'ws-wad-cube', tenantId: 't-wad' });
    const ambiguous = await get(origin, '/api/studio/ideas', owner);
    assert.equal(ambiguous.body.workspace.revision, null);
    assert.deepEqual(ambiguous.body.ideas, []);
    const refused = await post(origin, '/api/studio/ideas/idea-c/import', owner, { idempotencyKey: 'owner-key-4', expectedRevision: 1 });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.status, 'REJECTED');
    assert.equal(refused.body.reason, 'AMBIGUOUS_IDENTITY');
  } finally {
    await close(server);
    await client.close().catch(() => undefined);
    await graph.stop();
    await rm(root, { recursive: true, force: true });
  }
});

function countingGateway() {
  const calls = [];
  return {
    calls,
    async overview() { calls.push('overview'); return { status: 'EMPTY', tenantId: 't-wad', domain: 'studio' }; },
    async detail() { calls.push('detail'); return { status: 'NOT_FOUND' }; },
    async importIdea() { calls.push('import'); return { status: 'REJECTED', reason: 'UNKNOWN_IDEA' }; },
    async importStatus() { calls.push('status'); return { status: 'NOT_FOUND' }; },
  };
}

const TEXTS = {
  'idea-a': 'A short fictional film about a night-shift projectionist who finds one unlabeled reel every Friday.',
  'idea-b': 'A synthetic studio story where the catering van becomes the only witness to a missing prop.',
  'idea-c': 'An invented sound designer records the sea inside an abandoned cinema and hears a script.',
};
const sha = value => createHash('sha256').update(value).digest('hex');

async function writeManifest(root) {
  await mkdir(join(root, 'graph/seed/ideaverse/files'), { recursive: true });
  const ideas = [];
  let day = 11;
  for (const [id, text] of Object.entries(TEXTS)) {
    const filename = `${id}.txt`;
    const bytes = Buffer.from(`${text}\n`);
    await writeFile(join(root, 'graph/seed/ideaverse/files', filename), bytes);
    ideas.push({ id, filename, path: `graph/seed/ideaverse/files/${filename}`, byteCount: bytes.length, sha256: sha(bytes), submittedAt: `2026-10-${day}T09:00:00Z`, touchedAt: `2026-10-${day}T12:00:00Z`, synthetic: true, origin: 'project-authored synthetic idea', licenseStatus: 'none claimed' });
    day += 1;
  }
  await writeFile(join(root, 'graph/seed/ideaverse/manifest.json'), JSON.stringify({ version: 'ideaverse@test', ideas }));
}

async function receipts(client) {
  return (await client.read('MATCH (r:ImportReceipt) RETURN count(r) AS n'))[0]?.n ?? -1;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}
function close(server) {
  return new Promise(resolve => server.close(() => resolve()));
}
async function get(origin, path, headers = {}) {
  const response = await fetch(`${origin}${path}`, { headers });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function post(origin, path, headers, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
function hangPost(origin, path) {
  const url = new URL(path, origin);
  return new Promise(resolve => {
    const pending = httpRequest({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'content-type': 'application/json' } });
    const timer = setTimeout(() => { pending.destroy(); resolve(0); }, 1500);
    pending.on('response', response => { clearTimeout(timer); response.resume(); pending.destroy(); resolve(response.statusCode); });
    pending.on('error', () => { clearTimeout(timer); resolve(0); });
    pending.flushHeaders();
  });
}

function canRun(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', code => resolve(code === 0));
  });
}
async function launcherKind() {
  try { await import('falkordblite'); return 'falkordblite'; } catch { /* Linux CI imports the package. This host uses WSL. */ }
  if (process.platform === 'win32' && process.env.CUBES_ALLOW_WSL_FALKOR === '1' && await canRun('wsl.exe', ['-e', 'python3', '-c', 'import redislite'])) return 'wsl-redislite';
  if (process.platform !== 'win32' && await canRun('python3', ['-c', 'import redislite'])) return 'python-redislite';
  return null;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}
const pythonLauncher = `
import os, signal, sys, time
path, port, flag = sys.argv[1:]
os.makedirs(os.path.dirname(path), exist_ok=True)
from redislite import FalkorDB
db = FalkorDB(path, serverconfig={"port": port, "bind": "127.0.0.1", "appendonly": "yes", "appendfsync": "always", "protected-mode": "yes"})
pid = db.client.pid
print("READY", pid, flush=True)
while not os.path.exists(flag):
    time.sleep(0.2)
os.kill(pid, signal.SIGTERM)
`;
function toWsl(path) {
  const match = /^([A-Za-z]):\\(.*)$/.exec(path);
  return match === null ? path : `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}
async function openGraph(selected) {
  const scriptPath = join(await mkdtemp(join(tmpdir(), 'ideaverse-falkor-')), 'launch.py');
  await writeFile(scriptPath, pythonLauncher);
  const dataDir = `/tmp/cubes-v026-${randomBytes(4).toString('hex')}`;
  const port = await freePort();
  let active = null;
  const start = async () => {
    const flag = join(await mkdtemp(join(tmpdir(), 'ideaverse-flag-')), 'stop');
    const useWsl = selected === 'wsl-redislite';
    const args = useWsl ? ['-e', 'python3', toWsl(scriptPath), `${dataDir}/graph.db`, String(port), toWsl(flag)] : [scriptPath, `${dataDir}/graph.db`, String(port), flag];
    const child = spawn(useWsl ? 'wsl.exe' : 'python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    await Promise.race([
      new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', code => reject(new Error(`falkor exited ${code}: ${stderr}`)));
        child.stdout.on('data', () => { if (stdout.includes('READY')) resolve(stdout); });
      }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(`falkor startup timeout: ${stderr}`)), 30000); timer.unref(); }),
    ]);
    active = { child, flag };
  };
  const stop = async () => {
    if (active === null) return;
    const { child, flag } = active;
    active = null;
    await writeFile(flag, 'stop');
    await Promise.race([once(child, 'exit'), new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 8000); timer.unref(); })]);
  };
  await start();
  return { port, start, stop };
}
