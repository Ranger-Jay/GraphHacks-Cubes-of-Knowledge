// Live studio-slice tests (crew, departments). Require a reachable FalkorDB; no offline substitute.
// Each run uses its own uniquely named graph. Run: node --import tsx --test tests/graph/studio.integration.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeRelease, configFromEnv, evidenceState, GraphClient, parseCrew, parseDepartments, seedGraph, seedStudio, studioOverview } from '../../packages/graph/src/index.ts';

process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';
process.env['GRAPH_WITNESS_DIR'] = mkdtempSync(join(tmpdir(), 'cubes-studio-witness-'));

const graphName = `studio_test_${randomBytes(4).toString('hex')}`;
const client = new GraphClient({ ...configFromEnv(), graphName });
const root = process.cwd();
const count = async (cypher: string, params = {}) => (await client.read<{ n: number }>(cypher, params))[0]?.n ?? -1;
const nodesOf = () => count('MATCH (n) RETURN count(n) AS n');
const edgesOf = () => count('MATCH ()-[e]->() RETURN count(e) AS n');

before(async () => { await seedStudio(client, root); });
after(async () => { await client.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await client.close(); });

const read = (f: string) => readFile(join(root, 'graph/seed/studio', f), 'utf8');

test('fixtures: 20 crew in 10 departments, every required role present, every department staffed', async () => {
  const deps = parseDepartments(await read('departments.txt'));
  const crew = parseCrew(await read('crew-roster.txt'), deps);
  assert.equal(deps.length, 10);
  assert.equal(crew.length, 20);
  const roles = crew.map(c => c.role).join('|');
  for (const need of ['Cinematographer', 'Camera Operator', 'Editor', 'VFX Director', 'Stunt Coordinator', 'Stunt Performer', 'Makeup Artist', 'Writer', 'Producer', 'Assistant Director', 'Director', 'Sound Mixer', 'Production Designer', 'Costume Designer', 'Gaffer', 'Grip', 'Location Manager', 'Script Supervisor']) {
    assert.ok(roles.includes(need), need);
  }
  for (const name of ['Finance Office', 'Catering', 'Production', 'Camera', 'Editorial', 'VFX', 'Sound', 'Art', 'Makeup/Costume', 'Stunts']) assert.ok(deps.some(d => d.name === name), name);
  for (const d of deps) assert.ok(crew.some(c => c.departmentSlug === d.slug), `unstaffed ${d.slug}`);
});

test('grammar refuses malformed, duplicate, miscounted and orphan records', async () => {
  const deps = parseDepartments(await read('departments.txt'));
  const roster = await read('crew-roster.txt');
  assert.throws(() => parseCrew(roster.replace('Crew director | Odalys Brennick | Director | production', 'Crew director | Odalys Brennick | production'), deps), /grammar/);
  assert.throws(() => parseCrew(roster.replace('Crew producer |', 'Crew director |'), deps), /duplicate slug/);
  assert.throws(() => parseCrew(roster.replace('Complete listing: 20 crew', 'Complete listing: 19 crew'), deps), /declared count/);
  assert.throws(() => parseCrew(roster.replace('| catering', '| craft-services'), deps), /unknown department/);
  assert.throws(() => parseDepartments('Department a | A | department\n'), /declared count/);
});

test('seed writes exactly the declared records and no principal, membership or evidence label', async () => {
  assert.equal(await count('MATCH (n:StudioPerson) RETURN count(n) AS n'), 20);
  assert.equal(await count('MATCH (n:Department) RETURN count(n) AS n'), 10);
  assert.equal(await count('MATCH (n:StudioSource) RETURN count(n) AS n'), 2);
  assert.equal(await nodesOf(), 32);
  assert.equal(await edgesOf(), 50); // 10 department DEFINED_IN + 20 WORKS_IN + 20 person DEFINED_IN
  assert.equal(await count('MATCH (n:Principal) RETURN count(n) AS n'), 0);
  assert.equal(await count('MATCH ()-[e:MEMBER_OF]->() RETURN count(e) AS n'), 0);
  for (const l of ['Tenant', 'Source', 'SourceRef', 'Release', 'License']) assert.equal(await count(`MATCH (n:${l}) RETURN count(n) AS n`), 0, l);
});

test('repeat seed is identical: no new nodes or edges', async () => {
  const [n, e] = [await nodesOf(), await edgesOf()];
  const r = await seedStudio(client, root);
  assert.deepEqual([r.people, r.departments, r.sources, r.edges], [20, 10, 2, 50]);
  assert.deepEqual([await nodesOf(), await edgesOf()], [n, e]);
});

test('overview returns the actual graph records, verified, with origin and no license claim', async () => {
  const o = await studioOverview(client, root, 't-wad');
  assert.equal(o.status, 'AVAILABLE');
  if (o.status !== 'AVAILABLE') return;
  assert.deepEqual(o.counts, { people: 20, departments: 10, sources: 2, edges: 50 });
  assert.deepEqual(o.integrity, []);
  assert.equal(o.domain, 'studio');
  assert.deepEqual(o.origin, { kind: 'project-authored synthetic fixture', licenseStatus: 'none claimed', synthetic: true });
  const ids = new Set(o.nodes.map(n => n.id));
  for (const e of o.edges) assert.ok(ids.has(e.from) && ids.has(e.to), e.id);
  const graphIds = (await client.read<{ id: string }>('MATCH (n) RETURN n.id AS id ORDER BY id')).map(r => r.id);
  assert.deepEqual([...ids].sort(), graphIds);
  const dir = o.nodes.find(n => n.id === 'sp-director');
  assert.deepEqual([dir?.name, dir?.detail, dir?.departmentId, dir?.line], ['Odalys Brennick', 'Director', 'dept-production', 6]);
  assert.ok(o.edges.some(e => e.type === 'WORKS_IN' && e.from === 'sp-catering-lead' && e.to === 'dept-catering'));
});

test('tenant isolation: a second tenant has its own copy and cannot affect or read the first', async () => {
  await seedStudio(client, root, { tenantId: 't-other' });
  assert.equal(await nodesOf(), 64);
  await client.write("MATCH (n:StudioPerson {id: 'sp-director', tenantId: 't-other'}) SET n.displayName = 'Tampered'");
  const a = await studioOverview(client, root, 't-wad');
  const b = await studioOverview(client, root, 't-other');
  assert.ok(a.status === 'AVAILABLE' && b.status === 'AVAILABLE');
  if (a.status !== 'AVAILABLE' || b.status !== 'AVAILABLE') return;
  assert.equal(a.nodes.find(n => n.id === 'sp-director')?.name, 'Odalys Brennick');
  assert.equal(a.integrity.length, 0);
  assert.ok(!b.nodes.some(n => n.id === 'sp-director'));
  assert.ok(b.integrity.some(i => i.id === 'sp-director'));
  assert.deepEqual((await studioOverview(client, root, 't-nobody')).status, 'EMPTY');
  await client.write("MATCH (n:StudioPerson {id: 'sp-director', tenantId: 't-other'}) SET n.displayName = 'Odalys Brennick'");
  const fixed = await studioOverview(client, root, 't-other');
  assert.ok(fixed.status === 'AVAILABLE' && fixed.integrity.length === 0);
});

test('a tampered graph copy is withheld with an integrity item; verified records still serve', async () => {
  await client.write("MATCH (n:StudioPerson {id: 'sp-gaffer', tenantId: 't-wad'}) SET n.role = 'Executive Producer'");
  await client.write("MATCH (:StudioPerson {id: 'sp-editor', tenantId: 't-wad'})-[e:DEFINED_IN]->(:StudioSource) SET e.excerpt = 'Crew editor | Lucinda Frayne | Editor | vfx'");
  await client.write("MATCH (n:Department {id: 'dept-vfx', tenantId: 't-wad'}) SET n.name = 'Visual Fantasy'");
  await client.write("MATCH (n:StudioPerson {id: 'sp-writer', tenantId: 't-wad'}) SET n.line = 99");
  await client.write("MATCH (n:Department {id: 'dept-art', tenantId: 't-wad'}) SET n.line = 99");
  const o = await studioOverview(client, root, 't-wad');
  assert.ok(o.status === 'AVAILABLE');
  if (o.status !== 'AVAILABLE') return;
  const withheld = o.integrity.map(i => i.id);
  assert.ok(['sp-gaffer', 'dept-vfx', 'sp-writer', 'dept-art'].every(id => withheld.includes(id)));
  assert.ok(!o.nodes.some(n => n.id === 'sp-gaffer' || n.id === 'dept-vfx'));
  assert.ok(!o.edges.some(e => e.from === 'sp-gaffer' || e.to === 'dept-vfx'), 'no edge touches a withheld node');
  assert.ok(o.edges.every(e => o.nodes.some(n => n.id === e.from) && o.nodes.some(n => n.id === e.to)));
  assert.ok(o.nodes.some(n => n.id === 'sp-editor'), 'the person is served; only the mismatching edge is withheld');
  assert.ok(withheld.includes('e-sp-editor-defined-in') && !o.edges.some(e => e.id === 'e-sp-editor-defined-in'));
  await seedStudio(client, root); // reseed restores the fixture values
  const back = await studioOverview(client, root, 't-wad');
  assert.ok(back.status === 'AVAILABLE' && back.integrity.length === 0 && back.nodes.length === 32);
});

test('a changed fixture file (hash mismatch) withholds every record it defines', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'studio-fixture-'));
  try {
    await cp(join(root, 'graph/seed/studio'), join(tmp, 'graph/seed/studio'), { recursive: true });
    const p = join(tmp, 'graph/seed/studio/crew-roster.txt');
    await writeFile(p, (await readFile(p, 'utf8')).replace('Odalys Brennick', 'Odalys Brennack'));
    const o = await studioOverview(client, tmp, 't-wad');
    assert.ok(o.status === 'AVAILABLE');
    if (o.status !== 'AVAILABLE') return;
    assert.ok(o.integrity.some(i => i.id === 'ssrc-crew-roster'));
    assert.equal(o.counts.people, 0);
    assert.equal(o.counts.departments, 10);
    // An invalid fixture is reported unavailable, never silently served.
    await writeFile(p, (await readFile(p, 'utf8')).replace('Complete listing: 20 crew', 'Complete listing: 21 crew'));
    assert.deepEqual(await studioOverview(client, tmp, 't-wad'), { status: 'UNAVAILABLE', reason: 'FIXTURE_INVALID' });
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('an unreachable graph is UNAVAILABLE, with no records', async () => {
  const dead = new GraphClient({ ...configFromEnv(), port: 1, timeoutMs: 500, graphName });
  try { assert.deepEqual(await studioOverview(dead, root, 't-wad'), { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' }); } finally { await dead.close(); }
});

test('licensing is unaffected: same witness state hash and same analysis with and without the studio seed', async () => {
  const lic = new GraphClient({ ...configFromEnv(), graphName: `${graphName}_lic` });
  try {
    await seedGraph(lic, root, { initWitness: true });
    const before = { state: await evidenceState(lic, 't-wad'), analysis: JSON.stringify(await analyzeRelease(lic, 't-wad', 'rel-wad')).replace(/"requestId":"[^"]*"/, '') };
    await seedStudio(lic, root);
    await seedStudio(lic, root, { tenantId: 't-other' });
    const after = { state: await evidenceState(lic, 't-wad'), analysis: JSON.stringify(await analyzeRelease(lic, 't-wad', 'rel-wad')).replace(/"requestId":"[^"]*"/, '') };
    assert.deepEqual(after, before);
    const a = await analyzeRelease(lic, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE' && a.clearance === 'GAP');
    assert.ok(!a.nodes.some(n => n.id.startsWith('sp-') || n.id.startsWith('dept-')), 'studio records never enter the evidence graph');
    await seedGraph(lic, root); // the witnessed licensing seed still accepts the combined graph
  } finally { await lic.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await lic.close(); }
});
