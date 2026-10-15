// Live tests for the bounded agent tools (v009). Real FalkorDB required; they fail when it is unreachable.
// Run from the repository root: node --import tsx --test tests/graph/*.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FalkorDB } from 'falkordb';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { configFromEnv, evidenceKeyFromEnv, GraphClient, ledgerFromEnv, runTool, seedGraph, TOOL_DEFINITIONS, witnessedWrite } from '../../packages/graph/src/index.ts';

process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';
process.env['GRAPH_WITNESS_DIR'] ??= mkdtempSync(join(tmpdir(), 'cubes-witness-'));
const cfg = { ...configFromEnv(), graphName: `${configFromEnv().graphName}__tools` };
const client = new GraphClient(cfg);
const ctx = { tenantId: 't-wad', agentId: 'roy' as const };
/** Evidence changes made through the witnessed writer (tests the layers behind the witness). */
const ww = (q: string, p?: Parameters<GraphClient['write']>[1]) =>
  witnessedWrite(client, ledgerFromEnv(evidenceKeyFromEnv()), 't-wad', 'test-mutation', () => client.write(q, p));
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
  assert.equal(ok.data?.['witnessed'], true);
  assert.match(ok.summary, /Cut v3 \(festival screener\) only/);
  // Through the witnessed writer, the file check is what refuses the edited excerpt.
  const original = (await client.read<{ x: string }>("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) RETURN r.excerpt AS x"))[0]!.x;
  await ww("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) SET r.excerpt = 'Cleared for every cut.'");
  try {
    const bad = await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-later' });
    assert.equal(bad.status, 'NOT_FOUND');
    assert.deepEqual(bad.sources, []);
  } finally {
    await ww("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) SET r.excerpt = $x", { x: original });
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

// --- PR #12 review repairs (v009.004–.006) ---
test('#18 graph_status is tenant-scoped: other tenants\' releases are not counted', async () => {
  const before = await runTool(client, ctx, 'graph_status', {});
  assert.equal(before.status, 'OK');
  await client.write("CREATE (:Release {id: 'rel-p1', tenantId: 't-private', revision: 'rel-p1@r1'}), (:Release {id: 'rel-p2', tenantId: 't-private', revision: 'rel-p2@r1'})");
  try {
    const after = await runTool(client, ctx, 'graph_status', {});
    assert.equal(after.status, 'OK');
    assert.equal(after.data?.['releases'], before.data?.['releases']);
    assert.equal(after.data?.['releases'], 1);
  } finally {
    await client.write("MATCH (r:Release {tenantId: 't-private'}) DELETE r");
  }
});

test('#19 source_excerpt: a reference rebound to genuine bytes outside the witness is INTEGRITY_FAILED, not OK', async () => {
  const V4 = 'graph/seed/sources/license-basement-hum-v4.txt';
  const body = (await readFile(V4)).toString('utf8');
  const sha = createHash('sha256').update(await readFile(V4)).digest('hex');
  const grant = 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).';
  const start = Array.from(body.slice(0, body.indexOf(grant))).length;
  const orig = (await client.read<{ path: string; sha: string; kind: string; x: string; a: number; b: number }>(
    `MATCH (r:SourceRef {id: 'ref-mail-bh-scope'})-[:EXCERPT_OF]->(s:Source)
     RETURN s.path AS path, s.sha256 AS sha, s.kind AS kind, r.excerpt AS x, r.startOffset AS a, r.endOffset AS b`))[0]!;
  await client.write(`MATCH (r:SourceRef {id: 'ref-mail-bh-scope'})-[:EXCERPT_OF]->(s:Source)
    SET s.path = $p, s.sha256 = $sha, s.kind = 'license', r.excerpt = $x, r.startOffset = $a, r.endOffset = $b`,
    { p: V4, sha, x: grant, a: start, b: start + Array.from(grant).length });
  try {
    const r = await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-scope' });
    assert.equal(r.status, 'INTEGRITY_FAILED');
    assert.equal(r.data?.['witnessed'], false);
    assert.deepEqual([r.sources, r.sourceRefIds], [[], []]);
    const c = await runTool(client, ctx, 'release_clearance', { releaseId: 'rel-wad' });
    assert.equal(c.data?.['clearance'], 'UNKNOWN');
    assert.deepEqual(c.sources, []);
  } finally {
    await client.write(`MATCH (r:SourceRef {id: 'ref-mail-bh-scope'})-[:EXCERPT_OF]->(s:Source)
      SET s.path = $path, s.sha256 = $sha, s.kind = $kind, r.excerpt = $x, r.startOffset = $a, r.endOffset = $b`, orig);
  }
  assert.equal((await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-scope' })).status, 'OK', 'restored graph matches the witness again');
  assert.equal((await runTool(client, { ...ctx, witness: null }, 'source_excerpt', { refId: 'ref-mail-bh-scope' })).status, 'INTEGRITY_FAILED', 'no witness configured');
});

test('closed schemas hold for inherited names: constructor, toString, __proto__ and non-plain objects are refused', async () => {
  const bad: unknown[] = [
    { releaseId: 'rel-wad', constructor: 'EXTRA' },
    { releaseId: 'rel-wad', toString: 'x' },
    { releaseId: 'rel-wad', hasOwnProperty: 'x' },
    JSON.parse('{"releaseId":"rel-wad","__proto__":{"x":1}}'),
    Object.assign(Object.create({ releaseId: 'rel-wad' }), {}),
    Object.assign(Object.create({ inherited: 1 }), { releaseId: 'rel-wad' }),
    new (class Args { releaseId = 'rel-wad'; })()
  ];
  for (const a of bad) assert.equal((await runTool(client, ctx, 'release_clearance', a)).status, 'INVALID_ARGUMENTS', JSON.stringify(a));
  assert.equal((await runTool(client, ctx, 'graph_status', { constructor: 'x' })).status, 'INVALID_ARGUMENTS');
  assert.equal((await runTool(client, ctx, 'release_clearance', Object.assign(Object.create(null), { releaseId: 'rel-wad' }))).status, 'OK');
});

test('#20 check-then-read: a replacement written and restored around the witness check is never returned as witnessed', async () => {
  const attacker = new GraphClient(cfg);
  const original = (await client.read<{ x: string; a: number; b: number }>(
    "MATCH (r:SourceRef {id: 'ref-mail-bh-scope'}) RETURN r.excerpt AS x, r.startOffset AS a, r.endOffset AS b"))[0]!;
  let witnessReads = 0;
  let readsAfterWitness = 0;
  const hooked = Object.create(client) as GraphClient;
  hooked.read = async (q, p) => {
    const isWitness = q.includes('ANY(l IN labels(');
    if (!isWitness && witnessReads > 0) readsAfterWitness++;
    const rows = await client.read(q, p);
    if (isWitness && witnessReads++ === 0) {
      // Right after the witness snapshot: swap the reference to other genuine text, as #20 did.
      await attacker.write(`MATCH (r:SourceRef {id: 'ref-mail-bh-scope'}), (o:SourceRef {id: 'ref-mail-bh-later'})
        SET r.excerpt = o.excerpt, r.startOffset = o.startOffset, r.endOffset = o.endOffset`);
    }
    return rows;
  };
  try {
    const r = await runTool(hooked, ctx, 'source_excerpt', { refId: 'ref-mail-bh-scope' });
    assert.equal(r.status, 'OK');
    assert.equal(r.sources[0]?.excerpt, original.x, 'the witnessed text, not the replacement');
    assert.equal(readsAfterWitness, 0, 'no graph read after the witnessed snapshot');
    // The replacement is still in place: the next call sees an unwitnessed graph.
    assert.equal((await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-scope' })).status, 'INTEGRITY_FAILED');
  } finally {
    await attacker.write("MATCH (r:SourceRef {id: 'ref-mail-bh-scope'}) SET r.excerpt = $x, r.startOffset = $a, r.endOffset = $b", original);
    await attacker.close();
  }
  assert.equal((await runTool(client, ctx, 'source_excerpt', { refId: 'ref-mail-bh-scope' })).status, 'OK');
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
