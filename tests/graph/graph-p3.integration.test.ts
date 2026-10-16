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
