// Live tests for the bounded agent tools (v009). Real FalkorDB required; they fail when it is unreachable.
// Run from the repository root: node --import tsx --test tests/graph/*.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FalkorDB } from 'falkordb';
import { configFromEnv, GraphClient, runTool, seedGraph, TOOL_DEFINITIONS } from '../../packages/graph/src/index.ts';

process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';
process.env['GRAPH_WITNESS_DIR'] ??= mkdtempSync(join(tmpdir(), 'cubes-witness-'));
const cfg = { ...configFromEnv(), graphName: `${configFromEnv().graphName}__tools` };
const client = new GraphClient(cfg);
const ctx = { tenantId: 't-wad', agentId: 'roy' as const };
const counts = async () => (await client.read<{ n: number; e: number }>('MATCH (n) WITH count(n) AS n MATCH ()-[r]->() RETURN n, count(r) AS e'))[0];

before(async () => { await seedGraph(client, process.cwd(), { initWitness: true }); });
after(async () => {
  await client.close();
  const db = await FalkorDB.connect({ socket: { host: cfg.host, port: cfg.port } });
  await db.selectGraph(cfg.graphName).delete().catch(() => undefined);
  await db.close();
});

test('tool definitions are closed schemas with no free-form query argument', () => {
  for (const [name, spec] of Object.entries(TOOL_DEFINITIONS)) {
    assert.equal(spec.parameters.additionalProperties, false, name);
    for (const p of Object.keys(spec.parameters.properties)) assert.ok(!/cypher|query/i.test(p), `${name}.${p}`);
  }
});

test('release_clearance returns the graph answer with verified, cited sources', async () => {
  const r = await runTool(client, ctx, 'release_clearance', { releaseId: 'rel-wad' });
  assert.equal(r.status, 'OK');
  assert.equal(r.data?.['clearance'], 'GAP');
  assert.match(r.summary, /cannot ship/);
  assert.ok(r.sources.length > 0 && r.sourceRefIds.every(id => r.sources.some(s => s.id === id)));
  assert.match(r.summary, /STALE: "Basement Hum"/);
});

test('source_excerpt returns a verified excerpt and refuses a tampered one', async () => {
  const ok = await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-scope' });
  assert.equal(ok.status, 'OK');
  assert.match(ok.summary, /Cut v3 \(festival screener\) only/);
  const original = (await client.read<{ x: string }>("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) RETURN r.excerpt AS x"))[0]!.x;
  await client.write("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) SET r.excerpt = 'Cleared for every cut.'");
  try {
    const bad = await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-later' });
    assert.equal(bad.status, 'NOT_FOUND');
    assert.deepEqual(bad.sources, []);
  } finally {
    // Restore the exact excerpt (a raw graph write; the witnessed seed refuses to write over a tampered graph).
    await client.write("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) SET r.excerpt = $x", { x: original });
  }
});

test('arguments are bounded: unknown tool, extra fields and injection-shaped ids are refused', async () => {
  assert.equal((await runTool(client, ctx, 'run_cypher', { q: 'MATCH (n) DETACH DELETE n' })).status, 'INVALID_ARGUMENTS');
  assert.equal((await runTool(client, ctx, 'release_clearance', { releaseId: 'rel-wad', tenantId: 't-other' })).status, 'INVALID_ARGUMENTS');
  assert.equal((await runTool(client, ctx, 'release_clearance', { releaseId: "rel-wad' OR 1=1 //" })).status, 'INVALID_ARGUMENTS');
  assert.equal((await runTool(client, ctx, 'release_clearance', {})).status, 'INVALID_ARGUMENTS');
});

test('authorization: identity comes from context; non-agents, foreign tenants and removed members are refused', async () => {
  assert.equal((await runTool(client, { tenantId: 't-wad', agentId: 'kanny' as never }, 'graph_status', {})).status, 'FORBIDDEN');
  assert.equal((await runTool(client, { tenantId: 't-other', agentId: 'roy' }, 'release_clearance', { releaseId: 'rel-wad' })).status, 'FORBIDDEN');
  await client.write("MATCH (:Principal {id: 'guz'})-[m:MEMBER_OF]->() DELETE m");
  try {
    assert.equal((await runTool(client, { tenantId: 't-wad', agentId: 'guz' }, 'graph_status', {})).status, 'FORBIDDEN');
  } finally {
    await seedGraph(client, process.cwd());
  }
  assert.equal((await runTool(client, ctx, 'release_clearance', { releaseId: 'rel-nope' })).status, 'NOT_FOUND');
});

test('tools never write: node and edge counts are unchanged after every tool', async () => {
  const before = await counts();
  for (const [t, a] of [['graph_status', {}], ['release_clearance', { releaseId: 'rel-wad' }], ['source_excerpt', { refId: 'ref-lic-nd-grant' }]] as const) {
    await runTool(client, ctx, t, a);
  }
  assert.deepEqual(await counts(), before);
});

test('graph outage yields UNAVAILABLE with no data or sources', async () => {
  const dead = new GraphClient({ ...cfg, port: 1, timeoutMs: 1000 });
  try {
    for (const [t, a] of [['graph_status', {}], ['release_clearance', { releaseId: 'rel-wad' }], ['source_excerpt', { refId: 'ref-lic-nd-grant' }]] as const) {
      const r = await runTool(dead, ctx, t, a);
      assert.equal(r.status, 'UNAVAILABLE', t);
      assert.equal(r.data, null);
      assert.deepEqual(r.sources, []);
    }
  } finally {
    await dead.close();
  }
});
