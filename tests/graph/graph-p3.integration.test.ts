// Live tests for the hardening P3s on 621ba5a (v031): edge ids/cardinality, label-order-independent duplicate keys,
// no attacker-selected workspace revision, and an import write that refuses duplicate identities before mutating.
// Require a reachable FalkorDB. Run: node --import tsx --test tests/graph/graph-p3.integration.test.ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv, GraphClient, ideaverseOverview, importIdea, seedIdeaverse, seedStudio, studioOverview } from '../../packages/graph/src/index.ts';

const run = randomBytes(4).toString('hex'); const root = process.cwd(); const clients: GraphClient[] = [];
const fresh = async (label: string) => { const g = new GraphClient({ ...configFromEnv(), graphName: `p3_test_${run}_${label}` }); clients.push(g); return g; };
after(async () => { for (const g of clients) { await g.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await g.close(); } });
const count = async (g: GraphClient, q: string, params = {}) => (await g.read<{ n: number }>(q, params))[0]!.n;
const studio = async (g: GraphClient) => { const o = await studioOverview(g, root, 't-wad'); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') throw new Error('unavailable'); return o; };

test('studio edges: a duplicate edge (same id) is not served twice or counted; the person edges are withheld and flagged', async () => {
  const g = await fresh('dupedge'); await seedStudio(g, root);
  await g.write("MATCH (p:StudioPerson {id: 'sp-director', tenantId: 't-wad'})-[e:WORKS_IN]->(d) CREATE (p)-[:WORKS_IN {id: e.id}]->(d)");
  assert.equal(await count(g, "MATCH (:StudioPerson {id: 'sp-director'})-[e:WORKS_IN]->() RETURN count(e) AS n"), 2, 'the duplicate edge exists');
  const o = await studio(g);
  assert.ok(o.integrity.some(i => i.id === 'e-sp-director-works-in'));
  assert.ok(!o.edges.some(e => e.type === 'WORKS_IN' && e.from === 'sp-director'), 'neither copy of the edge is served');
  assert.equal(o.counts.edges, 49, 'the count never exceeds the 50 seeded edges (one withheld)');
  assert.ok(o.edges.length <= 50);
});

test('studio edges: a forged edge id, an extra edge or an extra type is withheld even when its endpoints and content match', async () => {
  const g = await fresh('forgedid'); await seedStudio(g, root);
  // Replace the real WORKS_IN edge with one that has the right endpoints but a forged id.
  await g.write("MATCH (:StudioPerson {id: 'sp-editor', tenantId: 't-wad'})-[e:WORKS_IN]->() DELETE e");
  await g.write("MATCH (p:StudioPerson {id: 'sp-editor', tenantId: 't-wad'}), (d:Department {id: 'dept-editorial', tenantId: 't-wad'}) CREATE (p)-[:WORKS_IN {id: 'e-forged'}]->(d)");
  // An additional, differently identified DEFINED_IN edge with correct content.
  await g.write("MATCH (p:StudioPerson {id: 'sp-writer', tenantId: 't-wad'})-[e:DEFINED_IN]->(s) CREATE (p)-[:DEFINED_IN {id: 'e-second', line: e.line, excerpt: e.excerpt}]->(s)");
  const o = await studio(g);
  assert.ok(o.integrity.some(i => i.id === 'e-forged' && /fixture id e-sp-editor-works-in/.test(i.reason)));
  assert.ok(!o.edges.some(e => e.id === 'e-forged' || e.from === 'sp-editor' && e.type === 'WORKS_IN'));
  assert.ok(o.integrity.some(i => i.id === 'e-second') && o.integrity.some(i => i.id === 'e-sp-writer-defined-in'));
  assert.ok(!o.edges.some(e => e.from === 'sp-writer' && e.type === 'DEFINED_IN'), 'both writer DEFINED_IN edges are withheld');
  assert.ok(o.nodes.some(n => n.id === 'sp-editor') && o.nodes.some(n => n.id === 'sp-writer'), 'the people themselves are still served');
  assert.equal((await studio(await (async () => { const h = await fresh('clean'); await seedStudio(h, root); return h; })())).integrity.length, 0, 'a clean graph is unaffected');
});

test('duplicate keys do not depend on label order: an extra first label or a second studio label cannot hide a duplicate', async () => {
  const g = await fresh('labels');
  await g.write("CREATE (:Extra {id: 'label-registered-first'})"); // the engine orders labels() by label id, so an earlier-registered label comes first
  await seedStudio(g, root);
  const real = (await g.read<{ p: Record<string, never> }>("MATCH (n:StudioPerson {id: 'sp-director', tenantId: 't-wad'}) RETURN properties(n) AS p"))[0]!.p;
  await g.write('CREATE (m:Extra:StudioPerson) SET m = $p', { p: real }); // domain label is second
  const realEd = (await g.read<{ p: Record<string, never> }>("MATCH (n:StudioPerson {id: 'sp-editor', tenantId: 't-wad'}) RETURN properties(n) AS p"))[0]!.p;
  await g.write('CREATE (m:StudioSource:StudioPerson) SET m = $p', { p: realEd }); // two studio labels
  const labelsOf = async (id: string) => (await g.read<{ l: string[] }>('MATCH (n {id: $id, tenantId: $t}) RETURN labels(n) AS l', { id, t: 't-wad' })).map(r => r.l.join(':')).sort();
  assert.deepEqual(await labelsOf('sp-director'), ['Extra:StudioPerson', 'StudioPerson']);
  const o = await studio(g);
  assert.ok(o.integrity.some(i => i.id === 'sp-director' && /more than one StudioPerson node/.test(i.reason)), 'the Extra-first copy is detected as a duplicate');
  assert.ok(!o.nodes.some(n => n.id === 'sp-director'), 'neither copy of the director is served');
  assert.ok(o.integrity.some(i => i.id === 'sp-editor' && /more than one studio label/.test(i.reason)), 'a node with two studio labels is flagged');
  assert.ok(o.nodes.some(n => n.id === 'sp-editor' && n.name === 'Lucinda Frayne'), 'the real, single-label editor is still served with its fixture values');
  assert.equal(o.counts.people, 19);
});

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ideaRoot = async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'p3-ideas-')); await mkdir(join(tmp, 'graph/seed/ideaverse/files'), { recursive: true });
  const ideas = ['idea-a', 'idea-b'].map((id, i) => ({ id, filename: `${id}.txt`, b: Buffer.from(`A short fictional idea number ${i} about a compass.\n`) }));
  for (const i of ideas) await writeFile(join(tmp, 'graph/seed/ideaverse/files', i.filename), i.b);
  await writeFile(join(tmp, 'graph/seed/ideaverse/manifest.json'), JSON.stringify({ version: 'p3@test', ideas: ideas.map(i => ({ id: i.id, filename: i.filename, path: `graph/seed/ideaverse/files/${i.filename}`, byteCount: i.b.length, sha256: sha(i.b), submittedAt: '2026-10-14T09:00:00Z', touchedAt: '2026-10-15T09:00:00Z', synthetic: true, origin: 'x', licenseStatus: 'none claimed' })) }));
  return tmp;
};
const req = (ideaId: string, key: string, expectedRevision: number) => ({ tenantId: 't-wad', ideaId, idempotencyKey: key, expectedRevision });

test('an ambiguous workspace serves no revision (never an attacker-chosen one), whichever duplicate comes first', async () => {
  const tmp = await ideaRoot(); const g = await fresh('wsrev');
  try {
    await seedIdeaverse(g, tmp);
    await g.write("CREATE (w:Workspace {id: 'ws-wad-cube', tenantId: 't-wad', revision: 999, name: 'forged', synthetic: true})");
    const o = await ideaverseOverview(g, tmp, 't-wad'); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') return;
    assert.equal(o.workspace.revision, null); assert.deepEqual(o.ideas, []); assert.deepEqual(o.integrity, [{ id: 'ws-wad-cube', reason: 'more than one workspace node has this id' }]);
    const g2 = await fresh('wsrev2'); await seedIdeaverse(g2, tmp); // the forged node created BEFORE the real revision moved still gives null
    await g2.write("MATCH (w:Workspace {id: 'ws-wad-cube'}) SET w.revision = 5"); await g2.write("CREATE (w:Workspace {id: 'ws-wad-cube', tenantId: 't-wad', revision: 0})");
    const o2 = await ideaverseOverview(g2, tmp, 't-wad'); assert.ok(o2.status === 'AVAILABLE' && o2.workspace.revision === null);
    const clean = await fresh('wsclean'); await seedIdeaverse(clean, tmp); const c = await ideaverseOverview(clean, tmp, 't-wad'); assert.ok(c.status === 'AVAILABLE' && c.workspace.revision === 0, 'the unambiguous path still serves the revision');
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

import { IMPORT_WRITE_QUERY } from '../../packages/graph/src/ideaverse.ts';
test('the import write refuses a duplicate idea or workspace identity before mutating: no revision jump, no twin receipts', async () => {
  const tmp = await ideaRoot();
  try {
    for (const which of ['idea', 'workspace'] as const) {
      const g = await fresh(`dupwrite_${which}`); await seedIdeaverse(g, tmp);
      if (which === 'idea') { const p = (await g.read<{ p: Record<string, never> }>("MATCH (n:IdeaFile {id: 'idea-a', tenantId: 't-wad'}) RETURN properties(n) AS p"))[0]!.p; await g.write('CREATE (m:IdeaFile) SET m = $p', { p }); }
      else { const p = (await g.read<{ p: Record<string, never> }>("MATCH (n:Workspace {id: 'ws-wad-cube', tenantId: 't-wad'}) RETURN properties(n) AS p"))[0]!.p; await g.write('CREATE (m:Workspace) SET m = $p', { p }); }
      const r = await importIdea(g, tmp, req('idea-a', `key-dupwrite-${which}`, 0));
      assert.deepEqual(r, { status: 'REJECTED', reason: 'AMBIGUOUS_IDENTITY' }, which);
      assert.equal(await count(g, 'MATCH (r:ImportReceipt) RETURN count(r) AS n'), 0, `${which}: no receipt`);
      assert.equal(await count(g, 'MATCH ()-[e:IMPORTED_INTO]->() RETURN count(e) AS n'), 0, `${which}: no membership`);
      assert.equal(await count(g, 'MATCH (w:Workspace) WHERE w.revision <> 0 RETURN count(w) AS n'), 0, `${which}: revision unchanged`);
      // The statement itself, not only the pre-check, refuses: run it directly.
      const rows = await g.write<unknown>(IMPORT_WRITE_QUERY, { tenantId: 't-wad', workspaceId: 'ws-wad-cube', ideaId: 'idea-a', sha256: sha(Buffer.from('A short fictional idea number 0 about a compass.\n')), expectedRevision: 0, keyHash: 'k'.repeat(64), receiptId: 'r1', fingerprint: 'f', importedAt: '2026-10-16T00:00:00.000Z', membershipId: 'm1', filename: 'idea-a.txt', byteCount: 49, submittedAt: '2026-10-14T09:00:00Z', touchedAt: '2026-10-15T09:00:00Z' } as Parameters<GraphClient['write']>[1]);
      assert.equal(rows.length, 0, `${which}: the guarded statement returns no row`);
    }
    const ok = await fresh('dupwrite_ok'); await seedIdeaverse(ok, tmp); assert.equal((await importIdea(ok, tmp, req('idea-a', 'key-dupwrite-ok1', 0))).status, 'IMPORTED', 'a clean graph still imports');
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
