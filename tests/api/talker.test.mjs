import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../../apps/api/dist/app.js';

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

const readyStatus = { graphName: 'probe-graph', async check() { return { state: 'available' }; } };
const talk = { persona: 'roy', intent: 'release-gap', releaseId: 'rel-wad' };

test('an unauthenticated talk is refused and a query string is not a route', async () => {
  await withApi(async origin => {
    const missing = await post(origin, '/api/talk', talk);
    assert.equal(missing.status, 401);
    assert.equal(missing.json.error.code, 'UNAUTHENTICATED');
    assert.match(missing.json.error.message, /The model was not called/);
    const queried = await post(origin, '/api/talk?phase=READY', talk, 'kanny-session-token');
    assert.equal(queried.status, 404);
  }, { sessions, status: readyStatus });
});

test('an unauthorized or invalid talk does not probe the graph', async () => {
  let probes = 0;
  const counting = {
    graphName: 'probe-graph',
    async check() {
      probes += 1;
      return { state: 'available' };
    },
  };
  await withApi(async origin => {
    const missing = await post(origin, '/api/talk', talk);
    assert.equal(missing.status, 401);
    const malformed = await post(origin, '/api/talk', talk, 'short');
    assert.equal(malformed.status, 401);
    const unknown = await post(origin, '/api/talk', talk, 'unknown-session-token');
    assert.equal(unknown.status, 401);
    const agent = await post(origin, '/api/talk', talk, 'roy-session-token');
    assert.equal(agent.status, 403);
    const phase = await post(origin, '/api/talk', { ...talk, phase: 'READY' }, 'kanny-session-token');
    assert.equal(phase.status, 400);
    const burst = await Promise.all(Array.from({ length: 50 }, () => post(origin, '/api/talk', talk)));
    assert.equal(burst.every(item => item.status === 401), true);
    assert.equal(probes, 0);
    const allowed = await post(origin, '/api/talk', talk, 'kanny-session-token');
    assert.equal(allowed.status, 503);
    assert.equal(probes, 1);
  }, { sessions, status: counting });
});

test('a persona does not let an agent ask', async () => {
  await withApi(async origin => {
    const agent = await post(origin, '/api/talk', { ...talk, persona: 'roy' }, 'roy-session-token');
    assert.equal(agent.status, 403);
    assert.equal(agent.json.error.code, 'FORBIDDEN');
    assert.match(agent.json.error.message, /The model was not called/);
  }, { sessions, status: readyStatus });
});

test('a talk stays closed when the graph is not ready', async () => {
  await withApi(async origin => {
    const down = await post(origin, '/api/talk', talk, 'kanny-session-token');
    assert.equal(down.status, 503);
    assert.equal(down.json.error.code, 'GRAPH_UNAVAILABLE');
    assert.match(down.json.error.message, /The model was not called/);
  }, { sessions });
});

test('a ready talk does not call a provider without a key or a cap', async () => {
  await withApi(async origin => {
    const closed = await tracked(origin, talk, 'serena-session-token');
    assert.equal(closed.status, 503);
    assert.equal(closed.json.error.code, 'NOT_IMPLEMENTED');
    assert.match(closed.json.error.message, /No provider key and enforceable spend cap/);
    assert.equal(closed.externalCalls, 0);
    assert.notEqual(closed.status, 201);
  }, { sessions, status: readyStatus });
});

test('a configured gate still has no completion client', async () => {
  await withApi(async origin => {
    const closed = await tracked(origin, { persona: 'guz', intent: 'release-gap', releaseId: 'rel-wad' }, 'kanny-session-token');
    assert.equal(closed.status, 503);
    assert.equal(closed.json.error.code, 'NOT_IMPLEMENTED');
    assert.match(closed.json.error.message, /no completion client/);
    assert.equal(closed.externalCalls, 0);
    assert.notEqual(closed.status, 201);
  }, { sessions, status: readyStatus, talker: { keyPresent: true, capConfigured: true } });
});

test('browser phase, tenant, and unknown intents are rejected', async () => {
  await withApi(async origin => {
    const phase = await post(origin, '/api/talk', { ...talk, phase: 'READY' }, 'kanny-session-token');
    assert.equal(phase.status, 400);
    assert.equal(phase.json.error.code, 'VALIDATION_ERROR');
    const tenant = await post(origin, '/api/talk', { ...talk, tenantId: 't-other' }, 'kanny-session-token');
    assert.equal(tenant.status, 400);
    const intent = await post(origin, '/api/talk', { ...talk, intent: 'invent-an-answer' }, 'kanny-session-token');
    assert.equal(intent.status, 400);
    assert.match(intent.json.error.message, /The model was not called/);
  }, { sessions, status: readyStatus });
});

async function tracked(origin, body, token) {
  const original = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(origin)) externalCalls += 1;
    return original(url, init);
  };
  try {
    const result = await post(origin, '/api/talk', body, token);
    return { ...result, externalCalls };
  } finally {
    globalThis.fetch = original;
  }
}

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

async function post(origin, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() };
}
