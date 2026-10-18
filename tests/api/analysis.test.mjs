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

test('anonymous analysis is denied and a tenant query is not a route', async () => {
  await withApi(async origin => {
    const missing = await get(origin, '/api/releases/rel-wad/analysis');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, 'UNAUTHENTICATED');
    const tenant = await get(origin, '/api/releases/rel-wad/analysis?tenantId=t-other', {
      authorization: 'Bearer kanny-session-token',
    });
    assert.equal(tenant.status, 404);
  });
});

test('an agent cannot read analysis', async () => {
  await withApi(async origin => {
    const response = await get(origin, '/api/releases/rel-wad/analysis', {
      authorization: 'Bearer roy-session-token',
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });
});

test('a missing release is 404 and an outage returns no evidence', async () => {
  let seen = '';
  const analysis = {
    async analyze(releaseId) {
      seen = releaseId;
      return releaseId === 'rel-missing' ? null : {
        status: 'UNAVAILABLE', requestId: 'req-outage', reason: 'CONNECTION_FAILED',
        message: 'Graph connection failed', evidence: [], nodes: [], edges: [], sources: [], proposedActions: [],
      };
    },
  };
  await withApi(async origin => {
    const missing = await get(origin, '/api/releases/rel-missing/analysis', {
      authorization: 'Bearer serena-session-token',
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
    const outage = await get(origin, '/api/releases/rel-wad/analysis', {
      authorization: 'Bearer kanny-session-token',
    });
    assert.equal(outage.status, 503);
    assert.equal(outage.body.status, 'UNAVAILABLE');
    assert.deepEqual(outage.body.evidence, []);
    assert.deepEqual(outage.body.sources, []);
    assert.deepEqual(outage.body.proposedActions, []);
    assert.equal(seen, 'rel-wad');
  }, { analysis });
});

test('an available read is returned unchanged and does not record', async () => {
  const analysis = {
    async analyze() {
      return {
        status: 'AVAILABLE', requestId: 'req-gap', releaseId: 'rel-wad', cutId: 'cut-wad-v4',
        revision: 'rel-wad@r1', clearance: 'GAP', summary: 'one track is stale',
        evidence: [{ id: 'ev-trk-basement-hum', status: 'STALE', statement: 'old cut only', sourceRefIds: [] }],
        nodes: [], edges: [], sources: [], proposedActions: [],
      };
    },
  };
  await withApi(async origin => {
    const response = await get(origin, '/api/releases/rel-wad/analysis', {
      authorization: 'Bearer kanny-session-token',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.clearance, 'GAP');
    assert.equal(response.body.revision, 'rel-wad@r1');
    assert.equal(response.body.auditEventId, undefined);
    const approval = await fetch(`${origin}/api/approvals`, { method: 'POST' });
    assert.equal(approval.status, 401);
  }, { analysis });
});

async function withApi(run, options = {}) {
  const server = createApiServer({ sessions, ...options });
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

async function get(origin, path, headers = {}) {
  const response = await fetch(`${origin}${path}`, { headers });
  return { status: response.status, body: await response.json() };
}
