import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../../apps/api/dist/app.js';

const validBody = {
  releaseId: 'rel-wad',
  cutId: 'cut-wad-v4',
  expectedRevision: 'rev-4',
  actionId: 'act-clear-basement-hum',
  idempotencyKey: 'idem-0001',
  evidenceSourceIds: ['src-license-v4'],
};

test('unauthenticated approval is denied and a caller-supplied role does not create a session', async () => {
  await withApi(async origin => {
    const forged = await post(origin, validBody, { 'x-role': 'owner', 'content-type': 'application/json' });
    assert.equal(forged.status, 401);
    assert.equal(forged.body.error.code, 'UNAUTHENTICATED');
    assert.equal(forged.body.auditEventId, undefined);
  });
});

test('reader and agent sessions cannot approve, including when the body claims the owner', async () => {
  const sessions = testSessions();
  await withApi(async origin => {
    const reader = await post(origin, { ...validBody, role: 'kanny' }, { authorization: 'Bearer serena-session-token' });
    assert.equal(reader.status, 403);
    assert.equal(reader.body.error.code, 'FORBIDDEN');
    const agent = await post(origin, validBody, { authorization: 'Bearer roy-session-token' });
    assert.equal(agent.status, 403);
    assert.equal(agent.body.error.code, 'FORBIDDEN');
  }, { sessions });
});

test('owner approval fail-closes while the graph is unavailable', async () => {
  let writes = 0;
  const graph = {
    async currentRevision() { return { state: 'unavailable', reason: 'NOT_IMPLEMENTED' }; },
    async storedFingerprint() { writes += 1; return null; },
  };
  await withApi(async origin => {
    const denied = await post(origin, validBody, { authorization: 'Bearer kanny-session-token' });
    assert.equal(denied.status, 503);
    assert.equal(denied.body.error.code, 'GRAPH_UNAVAILABLE');
    assert.equal(denied.body.status, undefined);
    assert.equal(writes, 0);
  }, { sessions: testSessions(), graph });
});

test('stale revision and reused idempotency key are rejected before any record', async () => {
  const graph = {
    async currentRevision() { return { state: 'available', revision: 'rev-5' }; },
    async storedFingerprint(key) {
      return key === 'idem-0001' ? JSON.stringify({ different: true }) : null;
    },
  };
  await withApi(async origin => {
    const stale = await post(origin, validBody, { authorization: 'Bearer kanny-session-token' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'STALE_REVISION');
    const conflict = await post(origin, { ...validBody, expectedRevision: 'rev-5', actionId: 'act-other' }, {
      authorization: 'Bearer kanny-session-token',
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');
  }, { sessions: testSessions(), graph });
});

test('an owner request that misses the current analysis is not recorded', async () => {
  const graph = {
    async currentRevision() { return { state: 'available', revision: 'rev-4' }; },
    async storedFingerprint() { return null; },
    async releaseAnalysis() {
      return { state: 'available', revision: 'rev-4', cutId: 'cut-DOES-NOT-EXIST', actionIds: ['act-other'], sourceIds: ['src-other'] };
    },
  };
  await withApi(async origin => {
    const missed = await post(origin, validBody, { authorization: 'Bearer kanny-session-token' });
    assert.equal(missed.status, 400);
    assert.equal(missed.body.error.code, 'VALIDATION_ERROR');
    assert.equal(missed.body.auditEventId, undefined);
    assert.equal(missed.body.status, undefined);
  }, { sessions: testSessions(), graph });
});

test('a current owner request is not recorded without a durable audit writer', async () => {
  const graph = {
    async currentRevision() { return { state: 'available', revision: 'rev-4' }; },
    async storedFingerprint() { return null; },
    async releaseAnalysis() {
      return {
        state: 'available', revision: 'rev-4', cutId: validBody.cutId,
        actionIds: [validBody.actionId], sourceIds: validBody.evidenceSourceIds,
      };
    },
  };
  await withApi(async origin => {
    const held = await post(origin, validBody, { authorization: 'Bearer kanny-session-token' });
    assert.equal(held.status, 503);
    assert.equal(held.body.error.code, 'NOT_IMPLEMENTED');
    assert.equal(held.body.status, undefined);
  }, { sessions: testSessions(), graph });
});

function testSessions() {
  const principals = {
    'kanny-session-token': { id: 'kanny', kind: 'owner' },
    'serena-session-token': { id: 'serena', kind: 'reader' },
    'roy-session-token': { id: 'roy', kind: 'agent' },
  };
  return { authenticate: token => principals[token] ?? null };
}

async function withApi(run, options) {
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

async function post(origin, body, headers = {}) {
  const response = await fetch(`${origin}/api/approvals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
