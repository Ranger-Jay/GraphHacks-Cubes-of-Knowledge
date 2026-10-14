// Live graph integration tests. They require a reachable FalkorDB server (FALKORDB_HOST/PORT/GRAPH)
// and FAIL when it is unreachable; there is no offline substitute.
// Run from the repository root: node --import tsx --test tests/graph/*.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { analyzeRelease, configFromEnv, graphHealth, GraphClient, seedGraph } from '../../packages/graph/src/index.ts';

const client = new GraphClient(configFromEnv());
const count = async (cypher: string) => (await client.read<{ n: number }>(cypher))[0]?.n ?? -1;

before(async () => { await seedGraph(client, process.cwd()); });
after(async () => { await client.close(); });

test('seed is idempotent: a second run adds no nodes or edges', async () => {
  const nodes = await count('MATCH (n) RETURN count(n) AS n');
  const edges = await count('MATCH ()-[e]->() RETURN count(e) AS n');
  await seedGraph(client, process.cwd());
  assert.equal(await count('MATCH (n) RETURN count(n) AS n'), nodes);
  assert.equal(await count('MATCH ()-[e]->() RETURN count(e) AS n'), edges);
});

test('health is a real read of seeded releases', async () => {
  const h = await graphHealth(client);
  assert.equal(h.ok, true);
});

test('current cut v4 has a GAP: Basement Hum is cleared only for the old cut; Night Drive is verified', async () => {
  const a = await analyzeRelease(client, 't-wad', 'rel-wad');
  assert.ok(a && a.status === 'AVAILABLE');
  assert.equal(a.cutId, 'cut-wad-v4');
  assert.equal(a.clearance, 'GAP');
  assert.equal(a.revision, 'rel-wad@r1');
  const byTrack = Object.fromEntries(a.evidence.map(e => [e.id, e.status]));
  assert.deepEqual(byTrack, { 'ev-trk-basement-hum': 'STALE', 'ev-trk-night-drive': 'VERIFIED' });
  assert.deepEqual(a.proposedActions.map(p => [p.kind, p.requiresHumanApproval]), [['REQUEST_CLEARANCE', true]]);
  // Every edge endpoint is a returned node, and every cited reference is a returned source.
  const nodeIds = new Set(a.nodes.map(n => n.id));
  for (const e of a.edges) assert.ok(nodeIds.has(e.from) && nodeIds.has(e.to), e.id);
  const refIds = new Set(a.sources.map(s => s.id));
  for (const e of [...a.evidence, ...a.edges]) for (const r of e.sourceRefIds) assert.ok(refIds.has(r), r);
  // The stale path old-license -> VALID_FOR -> cut v3 is present as returned graph edges.
  assert.ok(a.edges.some(e => e.type === 'VALID_FOR' && e.from === 'lic-basement-hum-v3' && e.to === 'cut-wad-v3'));
});

test('every returned excerpt matches its file at the stored SHA-256 and code-point offsets', async () => {
  const a = await analyzeRelease(client, 't-wad', 'rel-wad');
  assert.ok(a && a.status === 'AVAILABLE');
  assert.ok(a.sources.length > 0);
  for (const s of a.sources) {
    const bytes = await readFile(s.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), s.sha256, s.id);
    assert.equal(Array.from(bytes.toString('utf8')).slice(s.startOffset, s.endOffset).join(''), s.excerpt, s.id);
  }
});

test('release outside the caller tenant is not visible', async () => {
  assert.equal(await analyzeRelease(client, 't-other', 'rel-wad'), null);
});

test('unreachable graph yields UNAVAILABLE with no evidence, paths, sources or actions', async () => {
  const dead = new GraphClient({ ...configFromEnv(), port: 1, timeoutMs: 1000 });
  try {
    const a = await analyzeRelease(dead, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'UNAVAILABLE');
    assert.equal(a.reason, 'CONNECTION_FAILED');
    assert.deepEqual([a.evidence, a.nodes, a.edges, a.sources, a.proposedActions], [[], [], [], [], []]);
    assert.deepEqual(await graphHealth(dead), { ok: false, reason: 'CONNECTION_FAILED' });
  } finally {
    await dead.close();
  }
});
