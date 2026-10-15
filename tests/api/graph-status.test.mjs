import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createApiServer } from '../../apps/api/dist/app.js';

test('an unconfigured status route stays NOT_IMPLEMENTED', async () => {
  await withApi(async origin => {
    const body = await get(origin, '/api/graph/status');
    assert.equal(body.status, 503);
    assert.equal(body.json.status, 'UNAVAILABLE');
    assert.equal(body.json.ready, false);
    assert.equal(body.json.reason, 'NOT_IMPLEMENTED');
    assert.equal(typeof body.json.requestId, 'string');
    assert.equal(Number.isNaN(Date.parse(body.json.checkedAt)), false);
  });
});

test('a status query string is not a route', async () => {
  await withApi(async origin => {
    const body = await get(origin, '/api/graph/status?tenantId=t-other');
    assert.equal(body.status, 404);
    assert.equal(body.json.error.code, 'NOT_FOUND');
  }, { status: availableProbe });
});

test('a doubled available probe returns 200 and a failed probe returns 503', async () => {
  await withApi(async origin => {
    const open = await get(origin, '/api/graph/status');
    assert.equal(open.status, 200);
    assert.equal(open.json.status, 'AVAILABLE');
    assert.equal(open.json.ready, true);
    assert.equal(open.json.reason, null);
    assert.equal(open.json.graphName, 'probe-graph');
    assert.equal(open.json.releases, undefined);
  }, { status: availableProbe });
  await withApi(async origin => {
    const down = await get(origin, '/api/graph/status');
    assert.equal(down.status, 503);
    assert.equal(down.json.status, 'UNAVAILABLE');
    assert.equal(down.json.ready, false);
    assert.equal(down.json.reason, 'CONNECTION_FAILED');
  }, { status: { graphName: 'probe-graph', async check() { return { state: 'unavailable', reason: 'CONNECTION_FAILED' }; } } });
  await withApi(async origin => {
    const empty = await get(origin, '/api/graph/status');
    assert.equal(empty.status, 503);
    assert.equal(empty.json.reason, 'QUERY_FAILED');
    assert.equal(empty.json.ready, false);
  }, { status: { graphName: 'probe-graph', async check() { return { state: 'unavailable', reason: 'QUERY_FAILED' }; } } });
  await withApi(async origin => {
    const thrown = await get(origin, '/api/graph/status');
    assert.equal(thrown.status, 503);
    assert.equal(thrown.json.reason, 'QUERY_FAILED');
    assert.equal(thrown.json.graphName, 'probe-graph');
  }, { status: { graphName: 'probe-graph', async check() { throw new Error('probe failed'); } } });
});

test('the shipped server reports a refused graph instead of NOT_IMPLEMENTED', async () => {
  const closed = await freePort();
  const api = await freePort();
  const child = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PATHEXT: process.env.PATHEXT,
      COMSPEC: process.env.COMSPEC,
      API_HOST: '127.0.0.1',
      API_PORT: String(api),
      FALKORDB_HOST: '127.0.0.1',
      FALKORDB_PORT: String(closed),
      FALKORDB_TIMEOUT_MS: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => { throw new Error(`Server exited early: ${stderr}`); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); }),
    ]);
    const body = await get(`http://127.0.0.1:${api}`, '/api/graph/status');
    assert.equal(body.status, 503);
    assert.equal(body.json.status, 'UNAVAILABLE');
    assert.equal(body.json.ready, false);
    assert.equal(body.json.reason, 'CONNECTION_FAILED');
    assert.equal(body.json.graphName, 'wad_studio');
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

const availableProbe = {
  graphName: 'probe-graph',
  async check() { return { state: 'available' }; },
};

async function withApi(run, options = {}) {
  const server = createApiServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function get(origin, path) {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, json: await response.json() };
}

function freePort() {
  const reservation = createServer();
  return new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const { port } = reservation.address();
      reservation.close(() => resolve(port));
    });
  });
}
