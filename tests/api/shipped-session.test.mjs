import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const opaque = () => randomBytes(24).toString('base64url');

function childEnv(extra) {
  return { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PATHEXT: process.env.PATHEXT, COMSPEC: process.env.COMSPEC, ...extra };
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

function run(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const started = run(['apps/api/dist/server.js'], childEnv({ ...env, API_HOST: '127.0.0.1', API_PORT: String(port) }));
  await Promise.race([
    once(started.child.stdout, 'data'),
    started.exited.then(code => { throw new Error(`server exited ${code}: ${started.output().stderr}`); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('server startup timeout')), 15000); timer.unref(); }),
  ]);
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

test('an unconfigured shipped startup denies every bearer', async () => {
  const api = await startApi({});
  try {
    const missing = await get(api.origin, '/api/releases/rel-wad/analysis');
    const unknown = await get(api.origin, '/api/releases/rel-wad/analysis', opaque());
    assert.equal(missing.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(missing.body.error.code, 'UNAUTHENTICATED');
  } finally {
    await api.stop();
  }
});

test('a malformed or repeated session token refuses to listen and is not logged', async () => {
  const malformed = 'tiny';
  const shared = opaque();
  for (const env of [
    { API_OWNER_TOKEN: malformed },
    { API_OWNER_TOKEN: shared, API_READER_TOKEN: shared },
  ]) {
    const started = run(['apps/api/dist/server.js'], childEnv({ ...env, API_HOST: '127.0.0.1', API_PORT: String(await freePort()) }));
    const code = await started.exited;
    const { stdout, stderr } = started.output();
    assert.notEqual(code, 0);
    assert.equal(stdout.includes(malformed) || stderr.includes(malformed), false);
    assert.equal(stdout.includes(shared) || stderr.includes(shared), false);
  }
});

test('a configured shipped session is accepted and the token is not logged', async () => {
  const owner = opaque();
  const reader = opaque();
  const agent = opaque();
  const api = await startApi({ API_OWNER_TOKEN: owner, API_READER_TOKEN: reader, API_AGENT_TOKEN: agent });
  try {
    const read = await get(api.origin, '/api/releases/rel-wad/analysis', reader);
    const forbidden = await get(api.origin, '/api/releases/rel-wad/analysis', agent);
    const anonymous = await get(api.origin, '/api/releases/rel-wad/analysis');
    assert.equal(read.status, 503);
    assert.equal(read.body.status, 'UNAVAILABLE');
    assert.equal(read.body.reason, 'NOT_IMPLEMENTED');
    assert.deepEqual(read.body.evidence, []);
    assert.equal(forbidden.status, 403);
    assert.equal(anonymous.status, 401);
    const quiet = api.output();
    for (const token of [owner, reader, agent]) {
      assert.equal(quiet.stdout.includes(token) || quiet.stderr.includes(token), false);
    }
  } finally {
    await api.stop();
  }
});
