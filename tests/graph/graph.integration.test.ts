// Live graph integration tests. They require a reachable FalkorDB server (FALKORDB_HOST/PORT/GRAPH)
// and FAIL when it is unreachable; there is no offline substitute.
// Run from the repository root: node --import tsx --test tests/graph/*.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { FalkorDB } from 'falkordb';
import { analyzeRelease, bindingSig, configFromEnv, graphHealth, GraphClient, seedGraph } from '../../packages/graph/src/index.ts';
import { bindingHolds } from '../../packages/graph/src/evidence-key.ts';
import { parseCueSheet, refWitness } from '../../packages/graph/src/seed.ts';

// Test-only evidence key (not a secret). Real deployments set GRAPH_EVIDENCE_KEY server-side.
process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';

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

test('UNKNOWN: an unverifiable cue sheet (hash mismatch) leaves absence unasserted and proposes no action', async () => {
  await withVariant('unknown', "MATCH (s:Source {id: 'src-cue-v4'}) SET s.sha256 = '0000000000000000000000000000000000000000000000000000000000000000'", async c => {
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

// --- Read-time verification regressions (review P1 at 679787c) ---
const ESTABLISHED_FORBIDDEN = async (name: string, mutate: string, bundles: string[] = []) =>
  withVariant(name, mutate, async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.notEqual(a.clearance, 'ESTABLISHED', `${name} must not clear`);
  }, bundles);

test('attack 1: forged scopeCutVersion property + relink cannot clear (excerpt still says v3)', async () => {
  await ESTABLISHED_FORBIDDEN('atk1', "MATCH (r:SourceRef {id: 'ref-mail-bh-scope'}) SET r.scopeCutVersion = 4 WITH r MATCH (l:License {id: 'lic-basement-hum-v3'}), (c:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-atk1', sourceRefIds: ['ref-mail-bh-scope']}]->(c)");
});

test('attack 2: forged cueTitle property + edge delete cannot clear (file still lists both cues)', async () => {
  await ESTABLISHED_FORBIDDEN('atk2', "MATCH (r:SourceRef {id: 'ref-cue-v4-basement-hum'}) SET r.cueTitle = 'Night Drive' WITH 1 AS one MATCH (:Cut {id: 'cut-wad-v4'})-[e:USES_TRACK]->(:Track {id: 'trk-basement-hum'}) DELETE e");
});

test('attack 2b: forged declaredCueCount + deleted cue ref + edge delete cannot clear', async () => {
  await ESTABLISHED_FORBIDDEN('atk2b', "MATCH (s:Source {id: 'src-cue-v4'}) SET s.declaredCueCount = 1, s.cueEntryCount = 1 WITH 1 AS one MATCH (r:SourceRef {id: 'ref-cue-v4-basement-hum'}) DETACH DELETE r WITH 1 AS two MATCH (:Cut {id: 'cut-wad-v4'})-[e:USES_TRACK]->(:Track {id: 'trk-basement-hum'}) DELETE e");
});

test('attack 3: rewriting an excerpt to say Cut v4 is detected (text no longer matches the file)', async () => {
  await withVariant('atk3', "MATCH (r:SourceRef {id: 'ref-mail-bh-scope'}) SET r.excerpt = 'Confirmed: \"Basement Hum\" is cleared for WAD Cut v4 (festival screener) only.' WITH r MATCH (l:License {id: 'lic-basement-hum-v3'}), (c:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-atk3', sourceRefIds: ['ref-mail-bh-scope']}]->(c)", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.notEqual(a.clearance, 'ESTABLISHED');
    assert.equal(statusOf(a, 'ev-unverified-refs-cut-wad-v4'), 'UNKNOWN');
    assert.ok(!a.sources.some(s => s.id === 'ref-mail-bh-scope'), 'tampered excerpt is not returned as a source');
  });
});

test('attack 4: relabelling the current cut as v3 cannot borrow the v3 clearance (cue-sheet file says v4)', async () => {
  await ESTABLISHED_FORBIDDEN('atk4', "MATCH (c:Cut {id: 'cut-wad-v4'}) SET c.version = 3 WITH c MATCH (l:License {id: 'lic-basement-hum-v3'}) CREATE (l)-[:VALID_FOR {id: 'e-atk4', sourceRefIds: ['ref-mail-bh-scope']}]->(c)");
});

test('attack 5: re-pointing a Source record at another real file with its true hash cannot forge scope', async () => {
  await ESTABLISHED_FORBIDDEN('atk5', "MATCH (s:Source {id: 'src-mail-basement-hum'}) SET s.path = 'graph/seed/sources/license-basement-hum-v4.txt' WITH s MATCH (l:License {id: 'lic-basement-hum-v3'}), (c:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-atk5', sourceRefIds: ['ref-mail-bh-scope']}]->(c)");
});

test('tenant boundary: another tenant\'s license, source and excerpt cannot clear this tenant\'s cut', async () => {
  await withVariant('foreign', `
    MATCH (t:Track {id: 'trk-basement-hum', tenantId: 't-wad'}), (c:Cut {id: 'cut-wad-v4', tenantId: 't-wad'})
    CREATE (l:License {id: 'lic-foreign', tenantId: 't-other', label: 'Foreign license'}),
           (s:Source {id: 'src-foreign', tenantId: 't-other', kind: 'license', path: 'graph/seed/sources/license-basement-hum-v4.txt', sha256: 'x'}),
           (r1:SourceRef {id: 'ref-foreign-subject', tenantId: 't-other', excerpt: 'Composition: "Basement Hum"', startOffset: 0, endOffset: 1}),
           (r2:SourceRef {id: 'ref-foreign-grant', tenantId: 't-other', excerpt: 'Grant: Cut v4', startOffset: 0, endOffset: 1}),
           (r1)-[:EXCERPT_OF]->(s), (r2)-[:EXCERPT_OF]->(s), (l)-[:EVIDENCED_BY]->(s),
           (l)-[:COVERS {id: 'e-foreign-covers', sourceRefIds: ['ref-foreign-subject']}]->(t),
           (l)-[:VALID_FOR {id: 'e-foreign-valid', sourceRefIds: ['ref-foreign-grant']}]->(c)`, async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'GAP');
    assert.equal(statusOf(a, 'ev-trk-basement-hum'), 'STALE');
    assert.ok(!a.nodes.some(n => n.id === 'lic-foreign') && !a.edges.some(e => e.id.startsWith('e-foreign')), 'foreign records are not returned');
  });
});

// --- Signed evidence bindings (#10) ---
const V4_FILE = 'graph/seed/sources/license-basement-hum-v4.txt';
async function v4Excerpt(text: string) {
  const body = (await readFile(V4_FILE)).toString('utf8');
  const at = body.indexOf(text);
  const start = Array.from(body.slice(0, at)).length;
  return { start, end: start + Array.from(text).length };
}

test('#10 negative: re-pointing a license\'s Source at the v4 file (review repro) cannot clear', async () => {
  const sha = createHash('sha256').update(await readFile(V4_FILE)).digest('hex');
  const grant = 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).';
  const subj = 'Composition: "Basement Hum"';
  const g = await v4Excerpt(grant); const sj = await v4Excerpt(subj);
  await withVariant('rebind', null, async c => {
    await c.write("MATCH (s:Source {id: 'src-mail-basement-hum'}) SET s.path = $p, s.sha256 = $sha, s.kind = 'license'", { p: V4_FILE, sha });
    await c.write("MATCH (r:SourceRef {id: 'ref-mail-bh-scope'}) SET r.excerpt = $x, r.startOffset = $a, r.endOffset = $b", { x: grant, a: g.start, b: g.end });
    await c.write("MATCH (r:SourceRef {id: 'ref-mail-bh-later'}) DETACH DELETE r");
    await c.write("MATCH (:License {id: 'lic-basement-hum-v3'})-[e:VALID_FOR]->(:Cut {id: 'cut-wad-v3'}) DELETE e");
    await c.write("MATCH (s:Source {id: 'src-mail-basement-hum'}) CREATE (:SourceRef {id: 'ref-atk-subj', tenantId: 't-wad', excerpt: $x, startOffset: $a, endOffset: $b})-[:EXCERPT_OF]->(s)", { x: subj, a: sj.start, b: sj.end });
    await c.write("MATCH (:License {id: 'lic-basement-hum-v3'})-[e:COVERS]->() SET e.sourceRefIds = ['ref-atk-subj']");
    await c.write("MATCH (l:License {id: 'lic-basement-hum-v3'}), (k:Cut {id: 'cut-wad-v4'}) CREATE (l)-[:VALID_FOR {id: 'e-rebind', sourceRefIds: ['ref-mail-bh-scope']}]->(k)");
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.notEqual(a.clearance, 'ESTABLISHED');
    assert.equal(statusOf(a, 'ev-unbound-licenses-cut-wad-v4'), 'UNKNOWN');
    assert.notEqual(statusOf(a, 'ev-trk-basement-hum'), 'VERIFIED');
  });
});

test('#10 negative: a new License bound to the real v4 file without a signature cannot clear', async () => {
  const sha = createHash('sha256').update(await readFile(V4_FILE)).digest('hex');
  const g = await v4Excerpt('Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).');
  const sj = await v4Excerpt('Composition: "Basement Hum"');
  await withVariant('unsigned', `
    MATCH (t:Track {id: 'trk-basement-hum'}), (k:Cut {id: 'cut-wad-v4'})
    CREATE (s:Source {id: 'src-forged', tenantId: 't-wad', kind: 'license', path: '${V4_FILE}', sha256: '${sha}'}),
           (r1:SourceRef {id: 'ref-forged-subj', tenantId: 't-wad', excerpt: 'Composition: "Basement Hum"', startOffset: ${sj.start}, endOffset: ${sj.end}})-[:EXCERPT_OF]->(s),
           (r2:SourceRef {id: 'ref-forged-grant', tenantId: 't-wad', excerpt: 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).', startOffset: ${g.start}, endOffset: ${g.end}})-[:EXCERPT_OF]->(s),
           (l:License {id: 'lic-forged', tenantId: 't-wad', label: 'Forged license'})-[:EVIDENCED_BY {id: 'e-forged-ev', sig: '${'a'.repeat(64)}'}]->(s),
           (l)-[:COVERS {id: 'e-forged-cov', sourceRefIds: ['ref-forged-subj']}]->(t),
           (l)-[:VALID_FOR {id: 'e-forged-vf', sourceRefIds: ['ref-forged-grant']}]->(k)`, async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'GAP');
    assert.equal(statusOf(a, 'ev-trk-basement-hum'), 'STALE');
    assert.equal(statusOf(a, 'ev-unbound-licenses-cut-wad-v4'), 'UNKNOWN');
  });
});

test('#10 negative: copying a valid signature onto another license binding does not verify', async () => {
  await withVariant('sigcopy', `
    MATCH (:License {id: 'lic-basement-hum-v4'})-[good:EVIDENCED_BY]->(s:Source)
    MATCH (old:License {id: 'lic-basement-hum-v3'})-[bad:EVIDENCED_BY]->()
    DELETE bad
    WITH good, s, old
    CREATE (old)-[:EVIDENCED_BY {id: 'e-copied', sig: good.sig}]->(s)
    WITH old MATCH (k:Cut {id: 'cut-wad-v4'}), (t:Track {id: 'trk-basement-hum'})
    MATCH (old)-[c:COVERS]->(t) SET c.sourceRefIds = ['ref-lic-bh4-composition']
    CREATE (old)-[:VALID_FOR {id: 'e-copied-vf', sourceRefIds: ['ref-lic-bh4-grant']}]->(k)`, async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(statusOf(a, 'ev-unbound-licenses-cut-wad-v4'), 'UNKNOWN', 'a signature is bound to its own license id');
  }, ['basement-hum-v4-license']);
});

test('#10 negative: re-pointing the current cut at another cut\'s signed cue sheet leaves coverage UNKNOWN', async () => {
  await withVariant('sheetswap', "MATCH (k:Cut {id: 'cut-wad-v4'})-[e:LISTED_IN]->() MATCH (:Cut {id: 'cut-wad-v3'})-[v3:LISTED_IN]->(s3) CREATE (k)-[:LISTED_IN {id: 'e-swap', sig: v3.sig, sourceRefIds: v3.sourceRefIds}]->(s3) DELETE e", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.clearance, 'UNKNOWN');
    assert.match(a.evidence.find(e => e.id === 'ev-coverage-cut-wad-v4')!.statement, /not signed/);
  });
});

test('#10 fail-closed: with no key or the wrong key, even genuine evidence never clears', async () => {
  await withVariant('nokey', null, async c => {
    const none = await analyzeRelease(c, 't-wad', 'rel-wad', { evidenceKey: null });
    assert.ok(none && none.status === 'AVAILABLE');
    assert.equal(none.clearance, 'UNKNOWN');
    const wrong = await analyzeRelease(c, 't-wad', 'rel-wad', { evidenceKey: Buffer.from('wrong-key-wrong-key-wrong-key-wrong-key') });
    assert.ok(wrong && wrong.status === 'AVAILABLE');
    assert.equal(wrong.clearance, 'UNKNOWN');
    const right = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(right && right.status === 'AVAILABLE');
    assert.equal(right.clearance, 'ESTABLISHED');
  }, ['basement-hum-v4-license']);
});

// --- #15: a binding signature covers the whole claim and the revision it was recorded at ---
type Captured = { sig: string; rev: number; tracks: string[]; cuts: string[]; path: string; sha256: string };
async function captureV4Binding(): Promise<Captured> {
  let got: Captured | undefined;
  await withVariant('capture', null, async c => {
    got = (await c.read<Captured>(`MATCH (:License {id: 'lic-basement-hum-v4'})-[e:EVIDENCED_BY]->(s:Source)
      RETURN e.sig AS sig, e.rev AS rev, e.tracks AS tracks, e.cuts AS cuts, s.path AS path, s.sha256 AS sha256`))[0];
  }, ['basement-hum-v4-license']);
  assert.ok(got && got.rev === 2, 'genuine v4 binding is recorded at r2');
  return got;
}
// Base seed only, then: rename the v3 license to the signed id, rebind its Source to the real v4 file,
// replay every captured binding property, and align COVERS / VALID_FOR to the v4 file text.
async function renameReplay(cap: Captured, extra: string | null, check: (c: GraphClient) => Promise<void>) {
  const g = await v4Excerpt('Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).');
  const sj = await v4Excerpt('Composition: "Basement Hum"');
  await withVariant('rename_replay', null, async c => {
    await c.write(`MATCH (l:License {id: 'lic-basement-hum-v3'})-[eb:EVIDENCED_BY]->(s:Source)
      SET l.id = 'lic-basement-hum-v4', s.path = $path, s.sha256 = $sha256, s.kind = 'license'
      DELETE eb
      WITH l, s CREATE (l)-[:EVIDENCED_BY {id: 'e-replayed', sig: $sig, rev: $rev, tracks: $tracks, cuts: $cuts}]->(s)`, cap);
    await c.write(`MATCH (s:Source {id: 'src-mail-basement-hum'})
      CREATE (:SourceRef {id: 'ref-rp-subj', tenantId: 't-wad', excerpt: 'Composition: "Basement Hum"', startOffset: $ss, endOffset: $se})-[:EXCERPT_OF]->(s),
             (:SourceRef {id: 'ref-rp-grant', tenantId: 't-wad', excerpt: 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).', startOffset: $gs, endOffset: $ge})-[:EXCERPT_OF]->(s)`,
      { ss: sj.start, se: sj.end, gs: g.start, ge: g.end });
    await c.write(`MATCH (l:License {id: 'lic-basement-hum-v4'})-[cov:COVERS]->(), (l)-[vf:VALID_FOR]->(), (k:Cut {id: 'cut-wad-v4'})
      SET cov.sourceRefIds = ['ref-rp-subj'] DELETE vf
      WITH l, k CREATE (l)-[:VALID_FOR {id: 'e-rp-vf', sourceRefIds: ['ref-rp-grant']}]->(k)`);
    if (extra) await c.write(extra);
    await check(c);
  });
}

test('#15 negative: renaming a license to a signed id and replaying its binding cannot clear (review repro)', async () => {
  const cap = await captureV4Binding();
  await renameReplay(cap, null, async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.revision, 'rel-wad@r1');
    assert.notEqual(a.clearance, 'ESTABLISHED');
    assert.notEqual(statusOf(a, 'ev-trk-basement-hum'), 'VERIFIED');
    assert.equal(statusOf(a, 'ev-unbound-licenses-cut-wad-v4'), 'UNKNOWN', 'a binding recorded at r2 does not hold at r1');
  });
});

test('#15 limit: replaying a complete signed record with its revision restores exactly the signed state', async () => {
  // Documented boundary, not a fix: the graph can hold a copy of any signed record. Restoring the full
  // record (binding + revision) reproduces what the key holder signed at r2. Revocation and rollback
  // protection need a ledger outside the graph (see graph/schema/README.md).
  const cap = await captureV4Binding();
  await renameReplay(cap, "MATCH (r:Release {id: 'rel-wad'}) SET r.revision = 'rel-wad@r2'", async c => {
    const a = await analyzeRelease(c, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE');
    assert.equal(a.revision, 'rel-wad@r2', 'only the signed revision is reachable');
    assert.equal(a.clearance, 'ESTABLISHED');
  });
});

test('#15 unit: a binding holds only for its own claim, revision window, track and cut', () => {
  const key = Buffer.from('unit-test-key-unit-test-key-unit-test-key');
  const claim = { kind: 'EVIDENCED_BY' as const, tenantId: 't', releaseId: 'rel', subjectId: 'lic', path: 'p', sha256: 'h' };
  const stored = { rev: 2, tracks: ['trk-a'], cuts: ['cut-4'] };
  const sig = bindingSig(key, { ...claim, ...stored });
  const holds = (s: object, cl: object, use: object) => bindingHolds(key, { sig, ...stored, ...s }, { ...claim, ...cl }, { currentRev: 2, trackId: 'trk-a', cutId: 'cut-4', ...use });
  assert.equal(holds({}, {}, {}), true);
  assert.equal(holds({}, {}, { currentRev: 3 }), true, 'still valid at a later revision');
  assert.equal(holds({}, {}, { currentRev: 1 }), false, 'not before the revision it was recorded at');
  assert.equal(holds({}, {}, { currentRev: null }), false, 'unparseable release revision');
  assert.equal(holds({}, {}, { trackId: 'trk-b' }), false, 'track not named');
  assert.equal(holds({}, {}, { cutId: 'cut-3' }), false, 'cut not named');
  assert.equal(holds({ rev: 1 }, {}, {}), false, 'revision property edited');
  assert.equal(holds({ tracks: ['trk-a', 'trk-b'] }, {}, { trackId: 'trk-b' }), false, 'track list widened');
  assert.equal(holds({}, { releaseId: 'other' }, {}), false, 'other release');
  assert.equal(holds({}, { subjectId: 'lic2' }, {}), false, 'other license');
  assert.equal(bindingHolds(null, { sig, ...stored }, claim, { currentRev: 2 }), false, 'no key');
});

test('#10 seed refuses to run without an evidence key', async () => {
  await assert.rejects(seedGraph(client, process.cwd(), { evidenceKey: null }), /GRAPH_EVIDENCE_KEY/);
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
