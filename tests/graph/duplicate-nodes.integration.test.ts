// Live tests: an exact-copy duplicate node must be flagged, never silently merged into the real one by an aggregation.
// Require a reachable FalkorDB. Run: node --import tsx --test tests/graph/duplicate-nodes.integration.test.ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configFromEnv, GraphClient, ideaverseOverview, seedIdeaverse, seedStudio, studioOverview } from '../../packages/graph/src/index.ts';

const run = randomBytes(4).toString('hex'); const root = process.cwd(); const clients: GraphClient[] = [];
const fresh = async (label: string) => { const g = new GraphClient({ ...configFromEnv(), graphName: `dup_test_${run}_${label}` }); clients.push(g); return g; };
after(async () => { for (const g of clients) { await g.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await g.close(); } });
const copyOf = async (g: GraphClient, label: string, id: string) => {
  const p = (await g.read<{ p: Record<string, never> }>(`MATCH (n:${label} {id: $id, tenantId: 't-wad'}) RETURN properties(n) AS p`, { id }))[0]!.p;
  await g.write(`CREATE (m:${label}) SET m = $p`, { p });
  assert.equal((await g.read<{ n: number }>(`MATCH (n:${label} {id: $id}) RETURN count(n) AS n`, { id }))[0]!.n, 2, 'the exact copy exists');
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ideaRoot = async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'dup-ideas-')); await mkdir(join(tmp, 'graph/seed/ideaverse/files'), { recursive: true });
  const ideas = ['idea-a', 'idea-b'].map((id, i) => { const b = Buffer.from(`A short fictional idea number ${i} about a lantern.\n`); return { id, b, filename: `${id}.txt` }; });
  for (const i of ideas) await writeFile(join(tmp, 'graph/seed/ideaverse/files', i.filename), i.b);
  await writeFile(join(tmp, 'graph/seed/ideaverse/manifest.json'), JSON.stringify({ version: 'dup@test', ideas: ideas.map(i => ({ id: i.id, filename: i.filename, path: `graph/seed/ideaverse/files/${i.filename}`, byteCount: i.b.length, sha256: sha(i.b), submittedAt: '2026-10-14T09:00:00Z', touchedAt: '2026-10-15T09:00:00Z', synthetic: true, origin: 'x', licenseStatus: 'none claimed' })) }));
  return tmp;
};

test('studio overview: an exact-copy duplicate person or department is flagged and not served', async () => {
  const g = await fresh('studio'); await seedStudio(g, root);
  await copyOf(g, 'StudioPerson', 'sp-director'); await copyOf(g, 'Department', 'dept-camera');
  const o = await studioOverview(g, root, 't-wad'); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') return;
  assert.ok(o.integrity.some(i => i.id === 'sp-director' && /more than one StudioPerson node/.test(i.reason)));
  assert.ok(o.integrity.some(i => i.id === 'dept-camera' && /more than one Department node/.test(i.reason)));
  assert.ok(!o.nodes.some(n => n.id === 'sp-director' || n.id === 'dept-camera'), 'neither copy is served');
  assert.equal(o.counts.people, 19); assert.equal(o.counts.departments, 9);
  assert.ok(o.edges.every(e => o.nodes.some(n => n.id === e.from) && o.nodes.some(n => n.id === e.to)), 'no edge points at a withheld node');
});

test('IdeaVerse overview: an exact-copy duplicate idea is flagged and not served or counted', async () => {
  const tmp = await ideaRoot(); const g = await fresh('idea');
  try {
    await seedIdeaverse(g, tmp); await copyOf(g, 'IdeaFile', 'idea-a');
    const o = await ideaverseOverview(g, tmp, 't-wad'); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') return;
    assert.deepEqual(o.integrity, [{ id: 'idea-a', reason: 'more than one idea node has this id' }]);
    assert.deepEqual(o.ideas.map(i => i.id), ['idea-b']); assert.deepEqual(o.counts, { ideas: 1, imported: 0 });
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('IdeaVerse overview: a second workspace node makes the state ambiguous: nothing served, one integrity item', async () => {
  const tmp = await ideaRoot(); const g = await fresh('ws');
  try {
    await seedIdeaverse(g, tmp);
    const p = (await g.read<{ p: Record<string, never> }>("MATCH (w:Workspace {id: 'ws-wad-cube', tenantId: 't-wad'}) RETURN properties(w) AS p"))[0]!.p; await g.write('CREATE (w:Workspace) SET w = $p', { p });
    const o = await ideaverseOverview(g, tmp, 't-wad'); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') return;
    assert.deepEqual(o.ideas, []); assert.deepEqual(o.counts, { ideas: 0, imported: 0 }); assert.deepEqual(o.integrity, [{ id: 'ws-wad-cube', reason: 'more than one workspace node has this id' }]);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
