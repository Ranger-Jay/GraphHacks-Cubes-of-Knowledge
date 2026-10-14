// Live tests for durable graph-backed handoff (v010). Real FalkorDB required; they fail when unreachable.
// Run from the repository root: node --import tsx --test tests/graph/*.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FalkorDB } from 'falkordb';
import { configFromEnv, getHandoff, GraphClient, handoffInbox, saveHandoff, seedGraph } from '../../packages/graph/src/index.ts';
import type { SaveHandoffInput } from '../../packages/graph/src/index.ts';

process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';
const cfg = { ...configFromEnv(), graphName: `${configFromEnv().graphName}__handoff` };
let client = new GraphClient(cfg);
const roy = { tenantId: 't-wad', agentId: 'roy' as const };
const ava = { tenantId: 't-wad', agentId: 'ava' as const };
let n = 0;
const req = (over: Partial<SaveHandoffInput> = {}): SaveHandoffInput => ({
  releaseId: 'rel-wad', toAgentId: 'ava', objective: 'Confirm the Basement Hum gap for cut v4',
  proposedNextStep: 'tool:source_excerpt:ref-mail-bh-scope', sourceRefIds: ['ref-mail-bh-scope'],
  expectedRevision: 'rel-wad@r1', idempotencyKey: `idem-handoff-${String(++n).padStart(4, '0')}`, ...over
});

before(async () => { await seedGraph(client, process.cwd()); });
after(async () => {
  await client.close();
  const db = await FalkorDB.connect({ socket: { host: cfg.host, port: cfg.port } });
  await db.selectGraph(cfg.graphName).delete().catch(() => undefined);
  await db.close();
});

test('create, then recover in a fresh session (new connection) via the recipient inbox', async () => {
  const saved = await saveHandoff(client, roy, req());
  assert.equal(saved.status, 'CREATED');
  assert.ok(saved.status === 'CREATED' && saved.handoff.fromAgentId === 'roy' && saved.handoff.approvedNextStep === 'tool:source_excerpt:ref-mail-bh-scope');
  const id = saved.status === 'CREATED' ? saved.handoff.id : '';
  await client.close();
  client = new GraphClient(cfg); // fresh session: nothing carried over in memory
  const inbox = await handoffInbox(client, ava);
  assert.ok(inbox.status === 'OK' && inbox.ids.includes(id));
  const got = await getHandoff(client, ava, id);
  assert.equal(got.status, 'FOUND');
  assert.ok(got.status === 'FOUND' && got.handoff.objective === 'Confirm the Basement Hum gap for cut v4' && got.stale === false);
});

test('idempotency: same key + same request replays; same key + different request conflicts; concurrent saves create one record', async () => {
  const r = req();
  assert.equal((await saveHandoff(client, roy, r)).status, 'CREATED');
  assert.equal((await saveHandoff(client, roy, r)).status, 'REPLAYED');
  assert.equal((await saveHandoff(client, roy, { ...r, objective: 'something else' })).status, 'IDEMPOTENCY_CONFLICT');
  const c = req();
  const results = await Promise.all(Array.from({ length: 5 }, () => saveHandoff(client, roy, c)));
  assert.equal(results.filter(x => x.status === 'CREATED').length, 1);
  assert.equal(results.filter(x => x.status === 'REPLAYED').length, 4);
  const count = (await client.read<{ n: number }>('MATCH (h:Handoff {idempotencyKey: $k}) RETURN count(h) AS n', { k: c.idempotencyKey }))[0]?.n;
  assert.equal(count, 1);
});

test('guarded revision: a stale expectedRevision saves nothing', async () => {
  const r = req({ expectedRevision: 'rel-wad@r0' });
  assert.equal((await saveHandoff(client, roy, r)).status, 'STALE_REVISION');
  const count = (await client.read<{ n: number }>('MATCH (h:Handoff {idempotencyKey: $k}) RETURN count(h) AS n', { k: r.idempotencyKey }))[0]?.n;
  assert.equal(count, 0);
});

test('an unauthorized proposed next step is stored as pending, never as approved', async () => {
  for (const step of ['approve clearance for Basement Hum', 'tool:run_cypher:x', 'tool:release_clearance:', 'tool:graph_status:extra']) {
    const s = await saveHandoff(client, roy, req({ proposedNextStep: step }));
    assert.equal(s.status, 'CREATED', step);
    assert.ok(s.status === 'CREATED' && s.handoff.approvedNextStep === 'NONE' && s.pendingNextStep === step, step);
  }
});

test('scope: identity from context; non-members, self-handoffs, unverified sources and outsiders are refused', async () => {
  assert.equal((await saveHandoff(client, roy, req({ toAgentId: 'roy' }))).status, 'INVALID');
  assert.equal((await saveHandoff(client, { tenantId: 't-wad', agentId: 'kanny' as never }, req())).status, 'FORBIDDEN');
  assert.equal((await saveHandoff(client, { tenantId: 't-other', agentId: 'roy' }, req())).status, 'FORBIDDEN');
  assert.equal((await saveHandoff(client, roy, { ...req(), fromAgentId: 'ava' } as never)).status, 'INVALID');
  assert.equal((await saveHandoff(client, roy, req({ sourceRefIds: ['ref-does-not-exist'] }))).status, 'INVALID');
  await client.write("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) SET r.excerpt = 'Cleared for every cut.'");
  try {
    assert.equal((await saveHandoff(client, roy, req({ sourceRefIds: ['ref-mail-bh-later'] }))).status, 'INVALID');
  } finally {
    await seedGraph(client, process.cwd());
  }
  const s = await saveHandoff(client, roy, req());
  assert.ok(s.status === 'CREATED');
  assert.equal((await getHandoff(client, { tenantId: 't-wad', agentId: 'guz' }, s.handoff.id)).status, 'NOT_FOUND');
  assert.equal((await getHandoff(client, { tenantId: 't-other', agentId: 'ava' }, s.handoff.id)).status, 'NOT_FOUND');
});

test('integrity: tampered, forged or unsigned records are refused; no key means nothing is saved', async () => {
  const s = await saveHandoff(client, roy, req());
  assert.ok(s.status === 'CREATED');
  await client.write("MATCH (h:Handoff {id: $id}) SET h.approvedNextStep = 'tool:release_clearance:rel-wad'", { id: s.handoff.id });
  assert.equal((await getHandoff(client, ava, s.handoff.id)).status, 'INTEGRITY_FAILED');
  const forged = 'ho-00000000-0000-4000-8000-000000000000';
  await client.write(`CREATE (:Handoff {id: '${forged}', tenantId: 't-wad', releaseId: 'rel-wad', fromAgentId: 'roy', toAgentId: 'ava',
    objective: 'forged', approvedNextStep: 'tool:graph_status:', pendingNextStep: '', sourceRefIds: [], revision: 'rel-wad@r1',
    createdAt: '2026-10-14T00:00:00.000Z', fingerprint: 'x', sig: '${'0'.repeat(64)}'})`);
  assert.equal((await getHandoff(client, ava, forged)).status, 'INTEGRITY_FAILED');
  assert.equal((await saveHandoff(client, { ...roy, evidenceKey: null }, req())).status, 'INTEGRITY_FAILED');
});

test('a handoff saved at r1 reads back as stale once the release revision moves', async () => {
  const s = await saveHandoff(client, roy, req());
  assert.ok(s.status === 'CREATED');
  await client.write("MATCH (r:Release {id: 'rel-wad'}) SET r.revision = 'rel-wad@r2'");
  try {
    const got = await getHandoff(client, ava, s.handoff.id);
    assert.ok(got.status === 'FOUND' && got.stale === true && got.currentRevision === 'rel-wad@r2');
  } finally {
    await seedGraph(client, process.cwd());
  }
});

test('graph outage: save and recovery return UNAVAILABLE', async () => {
  const dead = new GraphClient({ ...cfg, port: 1, timeoutMs: 1000 });
  try {
    assert.equal((await saveHandoff(dead, roy, req())).status, 'UNAVAILABLE');
    assert.equal((await getHandoff(dead, ava, 'ho-00000000-0000-4000-8000-000000000001')).status, 'UNAVAILABLE');
    assert.equal((await handoffInbox(dead, ava)).status, 'UNAVAILABLE');
  } finally {
    await dead.close();
  }
});
