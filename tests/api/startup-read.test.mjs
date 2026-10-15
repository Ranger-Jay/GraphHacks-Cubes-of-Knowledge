import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphClient, configFromEnv } from '../../packages/graph/dist/index.js';

const root = join(import.meta.dirname, '..', '..');
const opaque = () => randomBytes(24).toString('base64url');

function childEnv(extra) {
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    PATHEXT: process.env.PATHEXT,
    COMSPEC: process.env.COMSPEC,
    ...extra,
  };
}

function waitForPort(port) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > 10000) reject(new Error(`127.0.0.1:${port} did not accept a connection`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

function waitUntilClosed(port) {
  return new Promise(resolve => {
    const started = Date.now();
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.end();
        if (Date.now() - started > 10000) resolve();
        else setTimeout(attempt, 200);
      });
      socket.once('error', () => { socket.destroy(); resolve(); });
    };
    attempt();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function toWsl(path) {
  const match = /^([A-Za-z]):\\(.*)$/.exec(path);
  if (match === null) return path;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function run(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => resolve(code));
  });
  return { child, exited, output: () => ({ stdout, stderr }) };
}

async function startApi(env) {
  const port = await freePort();
  const started = run(process.execPath, ['apps/api/dist/server.js'], childEnv({ ...env, API_HOST: '127.0.0.1', API_PORT: String(port) }));
  const ready = await Promise.race([
    once(started.child.stdout, 'data'),
    started.exited.then(code => { throw new Error(`server exited ${code}: ${started.output().stderr}`); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('server startup timeout')), 15000); timer.unref(); }),
  ]);
  void ready;
  return {
    origin: `http://127.0.0.1:${port}`,
    output: started.output,
    async stop() {
      started.child.kill('SIGTERM');
      await started.exited;
    },
  };
}

async function get(origin, path, token) {
  const response = await fetch(`${origin}${path}`, { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } });
  return { status: response.status, body: await response.json() };
}

async function postApproval(origin, token) {
  const response = await fetch(`${origin}/api/approvals`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      releaseId: 'rel-wad', cutId: 'cut-wad-v4', expectedRevision: 'rel-wad@r1',
      actionId: 'act-request-clearance', idempotencyKey: `idem-${opaque()}`, evidenceSourceIds: ['src-wad'],
    }),
  });
  return { status: response.status, body: await response.json() };
}

const pythonLauncher = `
import os, signal, sys, time
path, port, flag = sys.argv[1:]
os.makedirs(os.path.dirname(path), exist_ok=True)
from redislite import FalkorDB
db = FalkorDB(path, serverconfig={
    "port": port, "bind": "127.0.0.1", "appendonly": "yes",
    "appendfsync": "always", "protected-mode": "yes",
})
pid = db.client.pid
info = db.client.info("server")
print("READY", info.get("redis_version"), pid, flush=True)
while not os.path.exists(flag):
    time.sleep(0.2)
os.kill(pid, signal.SIGTERM)
for _ in range(50):
    try:
        os.kill(pid, 0)
    except OSError:
        break
    time.sleep(0.1)
else:
    os.kill(pid, signal.SIGKILL)
`;

function canRun(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', code => resolve(code === 0));
  });
}

async function launcherKind() {
  try {
    await import('falkordblite');
    return 'falkordblite';
  } catch {
    // The npm package is not a workspace dependency. Linux can import it; this host uses WSL.
  }
  if (process.platform === 'win32' && process.env.CUBES_ALLOW_WSL_FALKOR === '1') {
    if (await canRun('wsl.exe', ['-e', 'python3', '-c', 'import redislite'])) return 'wsl-redislite';
  }
  if (process.platform !== 'win32' && await canRun('python3', ['-c', 'import redislite'])) return 'python-redislite';
  return null;
}

const kind = await launcherKind();

test('shipped startup reads a disposable graph without writing', { skip: kind === null && process.env.CUBES_STARTUP_GRAPH !== '1' ? 'falkordblite is not installed here' : false, timeout: 180000 }, async () => {
  if (kind === null) throw new Error('CUBES_STARTUP_GRAPH=1 but no disposable FalkorDB launcher is available');
  const graph = await openGraph(kind);
  const witnessDir = await mkdtemp(join(tmpdir(), 'cubes-witness-'));
  const evidenceKey = `test-only-${opaque()}-evidence-key`;
  const graphName = `cubes_${opaque().replaceAll('-', '').slice(0, 12)}`;
  const graphEnv = {
    FALKORDB_HOST: '127.0.0.1', FALKORDB_PORT: String(graph.port), FALKORDB_GRAPH: graphName,
    FALKORDB_TIMEOUT_MS: '15000', GRAPH_EVIDENCE_KEY: evidenceKey, GRAPH_WITNESS_DIR: witnessDir,
  };
  const owner = opaque();
  const reader = opaque();
  const agent = opaque();
  const tokens = { API_OWNER_TOKEN: owner, API_READER_TOKEN: reader, API_AGENT_TOKEN: agent };
  let primary;
  let hidden;
  try {
    await seed(graphEnv);
    const before = await snapshot(graphEnv, witnessDir);
    primary = await startApi({ ...graphEnv, ...tokens, API_TENANT_ID: 't-wad' });
    hidden = await startApi({ ...graphEnv, ...tokens, API_TENANT_ID: 't-other' });
    const status = await get(primary.origin, '/api/graph/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.status, 'AVAILABLE');
    assert.equal(status.body.ready, true);
    assert.equal(status.body.reason, null);
    assert.equal(status.body.graphName, graphName);
    assert.equal(status.body.releases, undefined);
    const read = await get(primary.origin, '/api/releases/rel-wad/analysis', reader);
    assert.equal(read.status, 200);
    assert.equal(read.body.status, 'AVAILABLE');
    assert.equal(read.body.clearance, 'GAP');
    assert.equal(read.body.releaseId, 'rel-wad');
    assert.equal(read.body.cutId, 'cut-wad-v4');
    assert.equal(read.body.revision, 'rel-wad@r1');
    assert.ok(read.body.nodes.length > 0);
    assert.equal((await get(primary.origin, '/api/releases/rel-wad/analysis', owner)).status, 200);
    assert.equal((await get(primary.origin, '/api/releases/rel-wad/analysis')).status, 401);
    assert.equal((await get(primary.origin, '/api/releases/rel-wad/analysis', opaque())).body.error.code, 'UNAUTHENTICATED');
    const forbidden = await get(primary.origin, '/api/releases/rel-wad/analysis', agent);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');
    const missing = await get(primary.origin, '/api/releases/rel-missing/analysis', reader);
    assert.equal(missing.status, 404);
    const otherTenant = await get(hidden.origin, '/api/releases/rel-wad/analysis', reader);
    assert.equal(otherTenant.status, 404);
    assert.equal(otherTenant.body.error.code, 'NOT_FOUND');
    const readerWrite = await postApproval(primary.origin, reader);
    const ownerWrite = await postApproval(primary.origin, owner);
    assert.equal(readerWrite.status, 403);
    assert.equal(ownerWrite.status, 503);
    assert.notEqual(readerWrite.status, 201);
    assert.notEqual(ownerWrite.status, 201);
    assert.deepEqual(await snapshot(graphEnv, witnessDir), before);
    const quiet = primary.output();
    for (const token of [owner, reader, agent, evidenceKey]) {
      assert.equal(quiet.stdout.includes(token) || quiet.stderr.includes(token), false);
    }
    await graph.stop();
    const statusDown = await get(primary.origin, '/api/graph/status');
    assert.equal(statusDown.status, 503);
    assert.equal(statusDown.body.status, 'UNAVAILABLE');
    assert.equal(statusDown.body.ready, false);
    assert.notEqual(statusDown.body.reason, 'NOT_IMPLEMENTED');
    const outage = await get(primary.origin, '/api/releases/rel-wad/analysis', reader);
    assert.equal(outage.status, 503);
    assert.equal(outage.body.status, 'UNAVAILABLE');
    assert.deepEqual(outage.body.evidence, []);
    assert.deepEqual(outage.body.nodes, []);
    assert.deepEqual(outage.body.edges, []);
    assert.deepEqual(outage.body.sources, []);
    assert.deepEqual(outage.body.proposedActions, []);
    await graph.start();
    const statusAgain = await get(primary.origin, '/api/graph/status');
    assert.equal(statusAgain.status, 200);
    assert.equal(statusAgain.body.status, 'AVAILABLE');
    assert.equal(statusAgain.body.ready, true);
    assert.equal(statusAgain.body.graphName, graphName);
    assert.notEqual(statusAgain.body.requestId, status.body.requestId);
    const again = await get(primary.origin, '/api/releases/rel-wad/analysis', reader);
    assert.equal(again.status, 200);
    assert.equal(again.body.clearance, 'GAP');
    assert.equal(again.body.revision, 'rel-wad@r1');
    assert.notEqual(again.body.requestId, read.body.requestId);
    assert.deepEqual(await snapshot(graphEnv, witnessDir), before);
  } finally {
    if (primary !== undefined) await primary.stop();
    if (hidden !== undefined) await hidden.stop();
    await graph.stop();
  }
});

async function seed(env) {
  const started = run(process.execPath, ['--import', 'tsx', 'packages/graph/src/cli.ts', 'seed', '--init-witness'], childEnv(env));
  const code = await started.exited;
  if (code !== 0) throw new Error(`seed exited ${code}: ${started.output().stderr}`);
}

async function snapshot(env, witnessDir) {
  const client = new GraphClient(configFromEnv(env));
  try {
    const nodes = (await client.read('MATCH (n) RETURN count(n) AS n'))[0]?.n;
    const edges = (await client.read('MATCH ()-[e]->() RETURN count(e) AS n'))[0]?.n;
    return { nodes, edges, witness: await witnessDigest(witnessDir) };
  } finally {
    await client.close();
  }
}

async function witnessDigest(dir) {
  const files = (await walk(dir)).sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(file).update(await readFile(join(dir, file)));
  return hash.digest('hex');
}

async function walk(dir, prefix = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await walk(join(dir, entry.name), relative));
    else found.push(relative);
  }
  return found;
}

async function openGraph(selected) {
  if (selected === 'falkordblite') return openJs();
  return openPython(selected === 'wsl-redislite');
}

async function openJs() {
  const { FalkorDB } = await import('falkordblite');
  const directory = await mkdtemp(join(tmpdir(), 'cubes-falkor-'));
  let current = null;
  const port = await freePort();
  const start = async () => {
    current = await FalkorDB.open({
      path: directory,
      additionalConfig: { port: String(port), bind: '127.0.0.1', appendonly: 'yes', appendfsync: 'always', 'protected-mode': 'yes', save: '' },
    });
  };
  await start();
  return {
    port,
    start,
    stop: async () => {
      if (current === null) return;
      const pid = current.pid;
      current = null;
      if (typeof pid === 'number') process.kill(pid, 'SIGTERM');
    },
  };
}

async function openPython(useWsl) {
  const scriptPath = join(await mkdtemp(join(tmpdir(), 'cubes-falkor-py-')), 'launch.py');
  await writeFile(scriptPath, pythonLauncher);
  const dataDir = `/tmp/cubes-v014-${opaque().replaceAll('-', '').slice(0, 12)}`;
  const port = await freePort();
  let active = null;
  const start = async () => {
    const flag = join(await mkdtemp(join(tmpdir(), 'cubes-falkor-flag-')), 'stop');
    const args = useWsl
      ? ['-e', 'python3', toWsl(scriptPath), `${dataDir}/graph.db`, String(port), toWsl(flag)]
      : [scriptPath, `${dataDir}/graph.db`, String(port), flag];
    const child = spawn(useWsl ? 'wsl.exe' : 'python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const ready = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`falkor exited ${code}: ${stderr}`)));
      child.stdout.on('data', () => { if (stdout.includes('READY')) resolve(stdout); });
    });
    await Promise.race([
      ready,
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(`falkor startup timeout: ${stderr}`)), 30000); timer.unref(); }),
    ]);
    await waitForPort(port);
    active = { child, flag };
  };
  const stop = async () => {
    if (active === null) return;
    const { child, flag } = active;
    active = null;
    await writeFile(flag, 'stop');
    await Promise.race([
      once(child, 'exit'),
      new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 8000); timer.unref(); }),
    ]);
    await waitUntilClosed(port);
  };
  await start();
  return { port, start, stop };
}
