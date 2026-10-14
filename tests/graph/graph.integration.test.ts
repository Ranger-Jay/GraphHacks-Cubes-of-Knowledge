// Live graph integration tests. They require a reachable FalkorDB server (FALKORDB_HOST/PORT/GRAPH)
// and FAIL when it is unreachable; there is no offline substitute.
// Run from the repository root: node --import tsx --test tests/graph/*.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { FalkorDB } from 'falkordb';
import { analyzeRelease, configFromEnv, graphHealth, GraphClient, seedGraph } from '../../packages/graph/src/index.ts';
import { parseCueSheet, refWitness } from '../../packages/graph/src/seed.ts';

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
  assert.ok(h.ok && h.releases > 0);
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

// Variant graphs: a separate, freshly seeded graph per case, deleted afterwards. The main graph is untouched.
async function withVariant(name: string, mutate: string | null, check: (c: GraphClient) => Promise<void>, bundles: string[] = []) {
  const c = new GraphClient({ ...configFromEnv(), graphName: `${configFromEnv().graphName}__variant_${name}` });
  try {
    await seedGraph(c, process.cwd(), { bundles });
    if (mutate) await c.write(mutate);
    await check(c);
  } finally {
    await c.close();
    // Remove the whole variant graph key (test-only; the adapter exposes no delete operation).
    const cfg = configFromEnv();
    const db = await FalkorDB.connect({ socket: { host: cfg.host, port: cfg.port, ...(cfg.tls ? { tls: true as const } : {}) }, ...(cfg.username ? { username: cfg.username } : {}), ...(cfg.password ? { password: cfg.password } : {}) });
    await db.selectGraph(c.config.graphName).delete().catch(() => undefined);
    await db.close();
  }
}

test('MISSING: a current-cut track with no covering license is a GAP with a clearance action', async () => {
  await withVariant('missing', "MATCH (:License {id: 'lic-night-drive-v4'})-[e:COVERS]->() DELETE e", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'GAP');
    const nd = a.evidence.find(e => e.id === 'ev-trk-night-drive');
    assert.equal(nd?.status, 'MISSING');
    assert.ok(a.proposedActions.some(p => p.id === 'act-clear-trk-night-drive-cut-wad-v4'));
  });
});

test('UNKNOWN: without complete cue-sheet coverage, absence is not asserted and no action is proposed', async () => {
  await withVariant('unknown', "MATCH (s:Source {id: 'src-cue-v4'}) SET s.complete = false", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'UNKNOWN');
    assert.equal(a.evidence.find(e => e.id === 'ev-trk-basement-hum')?.status, 'UNKNOWN');
    assert.equal(a.evidence.find(e => e.id === 'ev-trk-night-drive')?.status, 'VERIFIED');
    assert.deepEqual(a.proposedActions, []);
  });
});

// --- Final-review regressions (#8, #9) and the legitimate positive ---
const statusOf = (a: { evidence: { id: string; status: string }[] }, id: string) => a.evidence.find(e => e.id === id)?.status;

test('#8 negative: deleting a USES_TRACK edge cannot clear a cut whose cue sheet lists that cue', async () => {
  await withVariant('b01-edge', "MATCH (:Cut {id: 'cut-wad-v4'})-[e:USES_TRACK]->(:Track {id: 'trk-basement-hum'}) DELETE e", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'UNKNOWN');
    assert.equal(statusOf(a, 'ev-coverage-cut-wad-v4'), 'UNKNOWN');
    assert.match(a.evidence.find(e => e.id === 'ev-coverage-cut-wad-v4')!.statement, /Basement Hum/);
  });
});

test('#8 negative: deleting the track node itself cannot clear the cut', async () => {
  await withVariant('b01-node', "MATCH (t:Track {id: 'trk-basement-hum'}) DETACH DELETE t", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'UNKNOWN');
  });
});

test('#8 negative: a USES_TRACK edge citing another cue entry is unsupported coverage', async () => {
  await withVariant('b01-cite', "MATCH (:Cut {id: 'cut-wad-v4'})-[e:USES_TRACK]->(:Track {id: 'trk-basement-hum'}) SET e.sourceRefIds = ['ref-cue-v4-night-drive']", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'UNKNOWN');
  });
});

test('#9 negative: relinking the v3-only license to cut v4 is reported, not counted (still GAP)', async () => {
  await withVariant('b02-relink', "MATCH (l:License {id: 'lic-basement-hum-v3'}), (c:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-relink', sourceRefIds: ['ref-mail-bh-scope']}]->(c)", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'GAP');
    assert.equal(statusOf(a, 'ev-trk-basement-hum'), 'STALE');
    assert.equal(statusOf(a, 'ev-unsupported-e-relink'), 'UNKNOWN');
  });
});

test('#9 negative: a v4 scope excerpt from a different license source does not support the link', async () => {
  await withVariant('b02-foreign', "MATCH (l:License {id: 'lic-basement-hum-v3'}), (c:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-foreign', sourceRefIds: ['ref-lic-nd-grant']}]->(c)", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'GAP');
    assert.equal(statusOf(a, 'ev-unsupported-e-foreign'), 'UNKNOWN');
  });
});

test('#9 negative: with genuine v4 evidence present, an extra unsupported link blocks ESTABLISHED', async () => {
  await withVariant('b02-mixed', "MATCH (l:License {id: 'lic-basement-hum-v3'}), (c:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-mixed', sourceRefIds: ['ref-mail-bh-scope']}]->(c)", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'UNKNOWN');
    assert.equal(statusOf(a, 'ev-trk-basement-hum'), 'VERIFIED');
  }, ['basement-hum-v4-license']);
});

test('positive: a genuine v4 license document clears the cut and advances the revision', async () => {
  await withVariant('positive', null, async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'ESTABLISHED');
    assert.equal(a.revision, 'rel-wad@r2');
    assert.deepEqual(a.proposedActions, []);
    const bh = a.evidence.find(e => e.id === 'ev-trk-basement-hum')!;
    assert.equal(bh.status, 'VERIFIED');
    assert.ok(bh.sourceRefIds.includes('ref-lic-bh4-grant'));
    const grant = a.sources.find(s => s.id === 'ref-lic-bh4-grant')!;
    assert.equal(grant.path, 'graph/seed/sources/license-basement-hum-v4.txt');
  }, ['basement-hum-v4-license']);
});

test('witness grammar: incomplete or inconsistent cue sheets are not complete; malformed excerpts are refused', () => {
  const ok = 'Cut: v4 (x)\nCue 1: "A"\nCue 2: "B"\nEND OF CUE SHEET. Complete listing: 2 cues.\n';
  assert.equal(parseCueSheet(ok).complete, true);
  assert.equal(parseCueSheet(ok.replace('2 cues', '3 cues')).complete, false);
  assert.equal(parseCueSheet(ok.replace('Cue 2: "B"\n', '')).complete, false);
  assert.equal(parseCueSheet(ok.replace('END OF CUE SHEET. Complete listing: 2 cues.\n', '')).complete, false);
  assert.equal(parseCueSheet(ok.replace('Cue 2: "B"', 'Cue 3: "B"')).complete, false);
  assert.equal(parseCueSheet(ok + 'Cut: v5 (y)\n').complete, false);
  assert.deepEqual(refWitness('license_scope', 'cleared for WAD Cut v3 only'), { scopeCutVersion: 3, scopeTitle: null });
  assert.throws(() => refWitness('license_scope', 'cleared for Cut v3 and Cut v4'));
  assert.throws(() => refWitness('license_subject', 'Song: Basement Hum'));
  assert.throws(() => refWitness('cue_entry', 'Cue one: "A"'));
});
