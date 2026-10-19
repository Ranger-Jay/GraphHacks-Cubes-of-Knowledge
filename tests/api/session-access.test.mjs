import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
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
    port,
    output: started.output,
    async stop() {
      started.child.kill('SIGTERM');
      await started.exited;
    },
  };
}

async function get(origin, path, token) {
  const response = await fetch(`${origin}${path}`, { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } });
  return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
}

/** Raw request: sends the path verbatim, including a query string or fragment, and may carry a body on GET. */
function raw(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, cacheControl: res.headers['cache-control'], text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('session access derives OWNER/READER from the server session and refuses agent and anonymous callers', async () => {
  const owner = opaque();
  const reader = opaque();
  const agent = opaque();
  const api = await startApi({ API_OWNER_TOKEN: owner, API_READER_TOKEN: reader, API_AGENT_TOKEN: agent });
  try {
    const ownerRead = await get(`http://127.0.0.1:${api.port}`, '/api/session/access', owner);
    assert.equal(ownerRead.status, 200);
    assert.equal(ownerRead.cacheControl, 'no-store');
    assert.deepEqual(ownerRead.body, { access: 'OWNER', canReadIdeas: true, canImportIdeas: true });

    const readerRead = await get(`http://127.0.0.1:${api.port}`, '/api/session/access', reader);
    assert.equal(readerRead.status, 200);
    assert.equal(readerRead.cacheControl, 'no-store');
    assert.deepEqual(readerRead.body, { access: 'READER', canReadIdeas: true, canImportIdeas: false });

    const agentRead = await get(`http://127.0.0.1:${api.port}`, '/api/session/access', agent);
    assert.equal(agentRead.status, 403);
    assert.equal(agentRead.body.error.code, 'FORBIDDEN');
    assert.equal(agentRead.body.error.message, 'Session access was not read. This session cannot read it.');
    assert.equal(typeof agentRead.body.error.requestId, 'string');

    const anonymous = await get(`http://127.0.0.1:${api.port}`, '/api/session/access');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, 'UNAUTHENTICATED');
    assert.equal(anonymous.body.error.message, 'Session access was not read. No server session was presented.');

    const unknown = await get(`http://127.0.0.1:${api.port}`, '/api/session/access', opaque());
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.code, 'UNAUTHENTICATED');

    const malformed = await get(`http://127.0.0.1:${api.port}`, '/api/session/access', 'tiny');
    assert.equal(malformed.status, 401);

    const quiet = api.output();
    for (const token of [owner, reader, agent]) {
      assert.equal(quiet.stdout.includes(token) || quiet.stderr.includes(token), false);
      for (const body of [ownerRead.body, readerRead.body, agentRead.body, anonymous.body, unknown.body]) {
        assert.equal(JSON.stringify(body).includes(token), false);
      }
    }
  } finally {
    await api.stop();
  }
});

test('session access matches the exact path only: query, fragment, POST, and a GET body never change the answer', async () => {
  const owner = opaque();
  const reader = opaque();
  const agent = opaque();
  const api = await startApi({ API_OWNER_TOKEN: owner, API_READER_TOKEN: reader, API_AGENT_TOKEN: agent });
  try {
    const origin = `http://127.0.0.1:${api.port}`;
    const queried = await raw(api.port, '/api/session/access?role=owner', { headers: { authorization: `Bearer ${owner}` } });
    assert.equal(queried.status, 404);
    assert.equal(JSON.parse(queried.text).error.code, 'NOT_FOUND');

    const fragmented = await raw(api.port, '/api/session/access#owner', { headers: { authorization: `Bearer ${owner}` } });
    assert.equal(fragmented.status, 404);
    assert.equal(JSON.parse(fragmented.text).error.code, 'NOT_FOUND');

    const posted = await fetch(`${origin}/api/session/access`, { method: 'POST', headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(posted.status, 404);
    assert.equal((await posted.json()).error.code, 'NOT_FOUND');

    const withBody = await raw(api.port, '/api/session/access', { headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' }, body: '{"role":"owner"}' });
    assert.equal(withBody.status, 200);
    assert.deepEqual(JSON.parse(withBody.text), { access: 'OWNER', canReadIdeas: true, canImportIdeas: true });
  } finally {
    await api.stop();
  }
});
