// Live agent-profile / display-only role tests. Require a reachable FalkorDB; no offline substitute. Unique graph per test.
// Run: node --import tsx --test tests/graph/agent-profiles.integration.test.ts
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentProfileOverview, analyzeRelease, configFromEnv, effectiveRoleFor, evidenceState, GraphClient, loadAgentFixtures, resolveResource, seedAgentProfiles, seedGraph, seedStudio, studioOverview, type AgentProfileOverview } from '../../packages/graph/src/index.ts';

process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';
process.env['GRAPH_WITNESS_DIR'] = mkdtempSync(join(tmpdir(), 'cubes-agent-witness-'));
const root = process.cwd(); const T = 't-wad'; const run = randomBytes(4).toString('hex');
const clients: GraphClient[] = [];
const fresh = async (label: string, opts: { licensing?: boolean; seed?: boolean } = {}) => {
  const g = new GraphClient({ ...configFromEnv(), graphName: `agent_test_${run}_${label}` }); clients.push(g);
  if (opts.licensing) await seedGraph(g, root, { initWitness: true });
  if (opts.seed !== false) await seedAgentProfiles(g, root);
  return g;
};
after(async () => { for (const g of clients) { await g.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await g.close(); } });
const ov = async (g: GraphClient, rootDir = root, tenant = T): Promise<AgentProfileOverview> => { const o = await agentProfileOverview(g, rootDir, tenant); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') throw new Error(o.status); return o; };
const count = async (g: GraphClient, q: string) => (await g.read<{ n: number }>(q))[0]!.n;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const copyFixtures = async (mutate: (name: string, doc: Record<string, unknown>) => void) => {
  const tmp = await mkdtemp(join(tmpdir(), 'agent-fixtures-')); await cp(join(root, 'graph/seed/agents'), join(tmp, 'graph/seed/agents'), { recursive: true });
  for (const f of ['agent-profiles.json', 'access-roles.json', 'role-assignments.json']) {
    const p = join(tmp, 'graph/seed/agents', f); const doc = JSON.parse(await readFile(p, 'utf8')); const before = JSON.stringify(doc); mutate(f, doc);
    if (JSON.stringify(doc) !== before) await writeFile(p, JSON.stringify(doc, null, 1)); // only a changed file is rewritten, so unchanged ones keep their exact bytes and hash
  }
  return tmp;
};
const roleOf = (o: AgentProfileOverview, key: string) => { const a = o.assignments.find(x => x.principalKey === key)!.access; return a.state === 'ASSIGNED' ? a.role.name : a.state; };

test('fixtures: owner text is verbatim, ids and voices exact, five roles, no Owner for an agent', async () => {
  const f = await loadAgentFixtures(root);
  const by = Object.fromEntries(f.profiles.map(p => [p.actorKey, p]));
  assert.deepEqual(f.profiles.map(p => [p.agentId, p.actorKey, p.name, p.apparentAge, p.color, p.emoji]), [['Agent012', 'ava', 'Ava', 28, '#B388FF', '😸'], ['Agent013', 'roy', 'Roy', 50, '#FFD700', '🐬'], ['Agent014', 'guz', 'Guz', 41, '#00E676', '🦁']]);
  assert.deepEqual([by['ava']!.voice.voiceId, by['roy']!.voice.voiceId, by['guz']!.voice.voiceId], ['XlDdozLmuTofIxK4BjPD', 'fPIfC3elMLbN9tNwMXkw', 'U7wWSnxIJwCjioxt86mk']);
  assert.deepEqual([by['ava']!.voice.voiceName, by['roy']!.voice.voiceName, by['guz']!.voice.voiceName], ['Misa (Asian-American)', 'Viraj (Indian-American)', 'Olaniyi (Nigerian-English)']);
  // The owner's spelling is preserved, not corrected.
  assert.equal(by['ava']!.personality, 'Warm, delightful, & aggreeable.');
  assert.equal(by['roy']!.knownFor, 'Caution and relucant to deviate from source of truth.');
  assert.equal(by['roy']!.assignment, 'Database Administrator of FalkorDb WAD Studios Cube');
  assert.equal(by['ava']!.skills.declaredPath, '..nodes/agents/agent012/skills.md');
  assert.equal(by['ava']!.skills.proposedPath, 'nodes/agents/agent012/skills.md');
  assert.deepEqual(f.profiles.map(p => p.declaredAccessLevel), ['Administrator', 'Administrator', 'Administrator']);
  assert.deepEqual(f.roles.map(r => r.name), ['Owner', 'Administrator', 'Operator', 'Reader', 'CI Auditor']);
  assert.deepEqual(Object.fromEntries(f.assignments.map(a => [a.principalKey, a.roleId])), { kanny: 'role-owner', roy: 'role-administrator', serena: 'role-operator', ava: 'role-reader', guz: 'role-ci-auditor' });
  assert.ok(!f.assignments.some(a => a.roleId === 'role-owner' && ['ava', 'roy', 'guz'].includes(a.principalKey)));
});

test('fixture loader refuses a foreign or traversing resource path, Owner on an agent, an unknown role and an enforced assignment', async () => {
  const bad = async (mutate: (name: string, doc: Record<string, unknown>) => void, re: RegExp) => { const tmp = await copyFixtures(mutate); try { await assert.rejects(loadAgentFixtures(tmp), re); } finally { await rm(tmp, { recursive: true, force: true }); } };
  const prof = (doc: Record<string, unknown>) => (doc['profiles'] as Record<string, unknown>[]);
  await bad((n, d) => { if (n === 'agent-profiles.json') prof(d)[0]!['skillFile'] = '..nodes/agents/agent013/skills.md'; }, /own skills file/);
  await bad((n, d) => { if (n === 'agent-profiles.json') prof(d)[0]!['skillFile'] = '..nodes/agents/agent012/../../x/skills.md'; }, /own skills file/);
  await bad((n, d) => { if (n === 'agent-profiles.json') prof(d)[0]!['memoryFile'] = 'nodes/agents/agent012/memory.md'; }, /own memory file/);
  await bad((n, d) => { if (n === 'role-assignments.json') (d['assignments'] as Record<string, unknown>[])[3]!['roleId'] = 'role-owner'; }, /Owner must not be assigned to a synthetic agent/);
  await bad((n, d) => { if (n === 'role-assignments.json') (d['assignments'] as Record<string, unknown>[])[0]!['roleId'] = 'role-superuser'; }, /invalid assignment/);
  await bad((n, d) => { if (n === 'role-assignments.json') (d['provenance'] as Record<string, unknown>)['enforcement'] = 'ENFORCED'; }, /NOT_ENFORCED/);
  await bad((n, d) => { if (n === 'role-assignments.json') (d['assignments'] as Record<string, unknown>[]).push({ principalKey: 'roy', roleId: 'role-reader' }); }, /one assignment per principal/);
  await bad((n, d) => { if (n === 'access-roles.json') (d['roles'] as Record<string, unknown>[]).reverse(); }, /exactly Owner/);
  await bad((n, d) => { if (n === 'agent-profiles.json') prof(d)[1]!['voice'] = { provider: 'ElevenLabs', voiceId: 'short', voiceName: 'x' }; }, /invalid voice id/);
});

test('seed: exact counts, idempotent, creates no Principal or membership; links existing Principals only', async () => {
  const g = await fresh('seed', { seed: false });
  const r = await seedAgentProfiles(g, root);
  assert.deepEqual([r.profiles, r.roles, r.capabilities, r.assignments, r.edges, r.principalLinks], [3, 5, 13, 5, 48, 0]);
  const [n, e] = [await count(g, 'MATCH (n) RETURN count(n) AS n'), await count(g, 'MATCH ()-[e]->() RETURN count(e) AS n')];
  assert.deepEqual([n, e], [39, 48]);
  assert.equal(await count(g, 'MATCH (p:Principal) RETURN count(p) AS n'), 0);
  assert.equal(await count(g, 'MATCH ()-[m:MEMBER_OF]->() RETURN count(m) AS n'), 0);
  await seedAgentProfiles(g, root);
  assert.deepEqual([await count(g, 'MATCH (n) RETURN count(n) AS n'), await count(g, 'MATCH ()-[e]->() RETURN count(e) AS n')], [n, e]);
  const lic = await fresh('seedlic', { licensing: true });
  assert.equal(await count(lic, 'MATCH (p:Principal) RETURN count(p) AS n'), 5);
  assert.equal(await count(lic, 'MATCH ()-[e:IS_PRINCIPAL|FOR_PRINCIPAL]->(:Principal) RETURN count(e) AS n'), 8);
  assert.equal(await count(lic, 'MATCH ()-[m:MEMBER_OF]->() RETURN count(m) AS n'), 5, 'membership edges are exactly the licensing seed\'s');
  assert.equal(await count(lic, "MATCH (p:Principal) WHERE p.displayName IS NULL RETURN count(p) AS n"), 0, 'no Principal was altered');
});

test('overview: verified profiles, derived display-only roles, honest MISSING resources, provenance-only declared level', async () => {
  const g = await fresh('overview', { licensing: true }); const o = await ov(g);
  assert.deepEqual(o.integrity, []); assert.equal(o.enforcement, 'NOT_ENFORCED'); assert.equal(o.domain, 'studio');
  assert.deepEqual(o.profiles.map(p => [p.agentId, p.name, p.voice.voiceId, p.principal.linked]), [['Agent012', 'Ava', 'XlDdozLmuTofIxK4BjPD', true], ['Agent013', 'Roy', 'fPIfC3elMLbN9tNwMXkw', true], ['Agent014', 'Guz', 'U7wWSnxIJwCjioxt86mk', true]]);
  assert.deepEqual(Object.fromEntries(o.assignments.map(a => [a.principalKey, roleOf(o, a.principalKey)])), { ava: 'Reader', guz: 'CI Auditor', kanny: 'Owner', roy: 'Administrator', serena: 'Operator' });
  assert.ok(o.assignments.every(a => a.access.enforcement === 'NOT_ENFORCED'));
  assert.ok(o.roles.every(r => r.implemented === false && r.intendedCapabilities.every(c => c.implemented === false)));
  assert.equal(o.roles.find(r => r.name === 'Operator')!.cannot.join('|'), 'Assign roles|Change policy');
  for (const p of o.profiles) {
    assert.equal(p.sourceProvenance.declaredAccessLevel, 'Administrator'); assert.equal(p.sourceProvenance.grantsAccess, false);
    assert.deepEqual([p.resources.skills.status, p.resources.memory.status], ['MISSING', 'MISSING']);
    assert.ok(p.resources.skills.declaredPath.startsWith('..nodes/agents/') && p.resources.skills.proposedPath.startsWith('nodes/agents/'));
  }
  const roy = o.profiles.find(p => p.actorKey === 'roy')!;
  assert.equal(roy.access.state === 'ASSIGNED' && roy.access.role.name, 'Administrator', 'Roy is Administrator by assignment');
  assert.equal(o.profiles.find(p => p.actorKey === 'ava')!.sourceProvenance.declaredAccessLevel, 'Administrator', 'while Ava keeps the supplied value as provenance and is only a Reader');
  assert.equal(roleOf(o, 'ava'), 'Reader');
});

test('changing a profile value (declaredAccessLevel) cannot elevate: the profile is withheld and the role is unchanged', async () => {
  const g = await fresh('spoof');
  await g.write("MATCH (n:AgentProfile {id: 'agentprofile-agent012', tenantId: 't-wad'}) SET n.declaredAccessLevel = 'Owner', n.accessLevel = 'Owner', n.role = 'Owner'");
  const o = await ov(g);
  assert.ok(!o.profiles.some(p => p.agentId === 'Agent012'));
  assert.deepEqual(o.integrity, [{ id: 'agentprofile-agent012', reason: 'profile fields differ from the fixture' }]);
  assert.equal(roleOf(o, 'ava'), 'Reader');
  const e = await effectiveRoleFor(g, root, T, 'ava'); assert.ok('state' in e && e.state === 'ASSIGNED' && e.role.name === 'Reader');
});

test('an assignment change shows on a fresh read, survives a re-seed, and a revoke fails closed', async () => {
  const g = await fresh('assign');
  // An authorized change: new role AND matching edge, revision bumped.
  await g.write("MATCH (a:RoleAssignment {id: 'ra-ava-ws-wad-cube', tenantId: 't-wad'})-[e:GRANTS_ROLE]->() DELETE e");
  await g.write("MATCH (a:RoleAssignment {id: 'ra-ava-ws-wad-cube', tenantId: 't-wad'}), (r:AccessRole {id: 'role-operator', tenantId: 't-wad'}) SET a.roleId = 'role-operator', a.revision = 2, a.source = 'test-operation' CREATE (a)-[:GRANTS_ROLE {id: 'e-ra-ava-grants-role-2'}]->(r)");
  let o = await ov(g); assert.equal(roleOf(o, 'ava'), 'Operator'); const a = o.assignments.find(x => x.principalKey === 'ava')!.access; assert.ok(a.state === 'ASSIGNED' && a.revision === 2 && a.source === 'test-operation');
  await seedAgentProfiles(g, root); o = await ov(g); assert.equal(roleOf(o, 'ava'), 'Operator', 're-seed does not revert a later change');
  await g.write("MATCH (a:RoleAssignment {id: 'ra-ava-ws-wad-cube', tenantId: 't-wad'}) SET a.status = 'REVOKED', a.revision = 3");
  o = await ov(g); const rv = o.assignments.find(x => x.principalKey === 'ava')!.access; assert.ok(rv.state === 'UNASSIGNED' && rv.reason === 'revoked');
  assert.ok(o.profiles.find(p => p.actorKey === 'ava')!.access.state === 'UNASSIGNED', 'the profile card reflects the revoke on the next read');
});

test('missing, unknown, conflicting, enforcing or wrong-workspace assignments show no role and no capability', async () => {
  const cases: [string, string, (a: string) => string, RegExp | null][] = [
    ['unknown role', 'unk', () => "MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube'}) SET a.roleId = 'role-superuser'", /unknown or did not verify/],
    ['role changed without its edge', 'noedge', () => "MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube'}) SET a.roleId = 'role-operator'", /edge and role do not agree/],
    ['claims enforcement', 'enf', () => "MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube'}) SET a.enforcement = 'ENFORCED'", /claims enforcement/],
    ['wrong workspace', 'ws', () => "MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube'}) SET a.workspaceId = 'ws-elsewhere'", /not for this workspace/],
    ['bad revision', 'rev', () => "MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube'}) SET a.revision = 0", /revision is invalid/],
    ['duplicate for one principal', 'dup', () => "MATCH (r:AccessRole {id: 'role-owner', tenantId: 't-wad'}) CREATE (:RoleAssignment {id: 'ra-roy-second', tenantId: 't-wad', principalId: 'roy', roleId: 'role-owner', workspaceId: 'ws-wad-cube', status: 'ACTIVE', enforcement: 'NOT_ENFORCED', revision: 1, assignedAt: '2026-10-16T02:39:00Z', assignedBy: 'x', source: 'x'})-[:GRANTS_ROLE {id: 'e-x'}]->(r)", /unexpected assignment id/],
  ];
  for (const [name, label, cypher, re] of cases) {
    const g = await fresh(`bad_${label}`); await g.write(cypher(label)); const o = await ov(g);
    const roy = o.assignments.find(x => x.principalKey === 'roy')!.access;
    assert.ok(roy.state === 'UNKNOWN', `${name}: ${JSON.stringify(roy)}`); assert.ok(!('role' in roy), `${name}: no role shown`);
    if (re) assert.match((roy as { reason: string }).reason, re, name);
    assert.ok(o.integrity.length > 0, name); assert.ok(o.profiles.find(p => p.actorKey === 'roy')!.access.state === 'UNKNOWN', `${name}: card shows no role`);
    assert.equal(roleOf(o, 'kanny'), 'Owner', `${name}: other principals are unaffected`);
  }
  const g = await fresh('gone'); await g.write("MATCH (a:RoleAssignment {id: 'ra-guz-ws-wad-cube'}) DETACH DELETE a");
  const o = await ov(g); const guz = o.assignments.find(x => x.principalKey === 'guz')!.access; assert.ok(guz.state === 'UNASSIGNED' && guz.reason === 'none');
});

test('a role definition that differs from the fixture is withheld and every assignment to it shows no role', async () => {
  const g = await fresh('roledef'); await g.write("MATCH (r:AccessRole {id: 'role-reader', tenantId: 't-wad'}) SET r.intendedScope = 'Everything'");
  const o = await ov(g); assert.ok(o.integrity.some(i => i.id === 'role-reader'));
  assert.ok(!o.roles.some(r => r.id === 'role-reader')); const ava = o.assignments.find(x => x.principalKey === 'ava')!.access; assert.equal(ava.state, 'UNKNOWN');
  const g2 = await fresh('capdef'); await g2.write("MATCH (c:Capability {id: 'cap-inspect-cube', tenantId: 't-wad'}) SET c.implemented = true");
  const o2 = await ov(g2); assert.ok(o2.integrity.some(i => i.id === 'cap-inspect-cube'));
  assert.ok(!o2.roles.some(r => r.name === 'Reader'), 'a capability claiming to be implemented withholds the roles that include it');
});

test('tenant isolation: tampering in another tenant, or its assignments, never reach this tenant', async () => {
  const g = await fresh('tenant'); await seedAgentProfiles(g, root, { tenantId: 't-other' });
  await g.write("MATCH (a:RoleAssignment {id: 'ra-ava-ws-wad-cube', tenantId: 't-other'}) SET a.status = 'REVOKED'");
  await g.write("MATCH (n:AgentProfile {id: 'agentprofile-agent013', tenantId: 't-other'}) SET n.name = 'Tampered'");
  const mine = await ov(g); const theirs = await ov(g, root, 't-other');
  assert.deepEqual(mine.integrity, []); assert.equal(roleOf(mine, 'ava'), 'Reader'); assert.equal(mine.profiles.length, 3);
  assert.equal(theirs.profiles.length, 2); assert.ok(theirs.integrity.some(i => i.id === 'agentprofile-agent013')); assert.equal(roleOf(theirs, 'ava'), 'UNASSIGNED');
  assert.equal((await agentProfileOverview(g, root, 't-nobody')).status, 'EMPTY');
  // A cross-tenant role edge is not accepted.
  await g.write("MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube', tenantId: 't-wad'})-[e:GRANTS_ROLE]->() DELETE e");
  await g.write("MATCH (a:RoleAssignment {id: 'ra-roy-ws-wad-cube', tenantId: 't-wad'}), (r:AccessRole {id: 'role-administrator', tenantId: 't-other'}) CREATE (a)-[:GRANTS_ROLE {id: 'e-cross'}]->(r)");
  assert.equal((await ov(g)).assignments.find(x => x.principalKey === 'roy')!.access.state, 'UNKNOWN');
});

test('a changed fixture file withholds what it defines; an invalid fixture is unavailable, never served', async () => {
  const g = await fresh('fixturehash');
  const tmp = await copyFixtures((n, d) => { if (n === 'agent-profiles.json') (d['profiles'] as Record<string, unknown>[])[0]!['knownFor'] = 'Delivering facts kindly.'; });
  try {
    const o = await ov(g, tmp); assert.ok(o.integrity.some(i => i.id === 'psrc-agent-profiles')); assert.equal(o.profiles.length, 0);
    assert.equal(roleOf(o, 'roy'), 'Administrator', 'the unchanged role and assignment fixtures still verify');
    await writeFile(join(tmp, 'graph/seed/agents/role-assignments.json'), '{"not":"valid"}');
    assert.deepEqual(await agentProfileOverview(g, tmp, T), { status: 'UNAVAILABLE', reason: 'FIXTURE_INVALID' });
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('resource status is by safe resolution: PRESENT only for a real file, never loaded; symlink, directory and oversize are UNVERIFIED', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'agent-res-'));
  try {
    const dir = join(tmp, 'nodes/agents/agent012'); await mkdir(dir, { recursive: true });
    const body = Buffer.from('# skills\nsynthetic placeholder\n'); await writeFile(join(dir, 'skills.md'), body);
    const present = await resolveResource(tmp, '..nodes/agents/agent012/skills.md', 'nodes/agents/agent012/skills.md', 'skills');
    assert.deepEqual([present.status, present.sha256, present.byteCount], ['PRESENT', sha(body), body.length]);
    assert.match(present.note, /not loaded or executed/);
    assert.equal((await resolveResource(tmp, 'x', 'nodes/agents/agent012/memory.md', 'memory')).status, 'MISSING');
    await mkdir(join(dir, 'real'), { recursive: true }); await writeFile(join(tmp, 'secret.txt'), 'outside');
    await rm(join(dir, 'memory.md'), { force: true }); await symlink(join(tmp, 'secret.txt'), join(dir, 'memory.md'));
    assert.equal((await resolveResource(tmp, 'x', 'nodes/agents/agent012/memory.md', 'memory')).status, 'UNVERIFIED');
    await writeFile(join(dir, 'skills.md'), Buffer.alloc(1_048_577, 97));
    assert.equal((await resolveResource(tmp, 'x', 'nodes/agents/agent012/skills.md', 'skills')).status, 'UNVERIFIED');
    await mkdir(join(tmp, 'nodes/agents/agent013/skills.md'), { recursive: true });
    assert.equal((await resolveResource(tmp, 'x', 'nodes/agents/agent013/skills.md', 'skills')).status, 'UNVERIFIED');
    for (const bad of ['nodes/agents/../../secret.txt', '../outside/skills.md', 'nodes/agents/agent012/other.md', '/etc/passwd', 'nodes/agents/agent012/skills.md/../../../../secret.txt']) {
      assert.equal((await resolveResource(tmp, bad, bad, 'skills')).status, 'UNVERIFIED', bad);
    }
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('an unreachable graph is UNAVAILABLE with no profile, role or capability', async () => {
  const dead = new GraphClient({ ...configFromEnv(), port: 1, timeoutMs: 500, graphName: 'x' });
  try { assert.deepEqual(await agentProfileOverview(dead, root, T), { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' }); const e = await effectiveRoleFor(dead, root, T, 'ava'); assert.deepEqual(e, { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' }); } finally { await dead.close(); }
});

test('other slices are unaffected and do not raise false alarms: licensing witness and analysis, studio and IdeaVerse overviews', async () => {
  const g = await fresh('both', { licensing: true, seed: false });
  const snap = async () => ({ state: await evidenceState(g, T), analysis: JSON.stringify(await analyzeRelease(g, T, 'rel-wad')).replace(/"requestId":"[^"]*"/, '') });
  const before = await snap(); await seedStudio(g, root); await seedAgentProfiles(g, root); await seedAgentProfiles(g, root, { tenantId: 't-other' });
  assert.deepEqual(await snap(), before);
  const a = await analyzeRelease(g, T, 'rel-wad'); assert.ok(a && a.status === 'AVAILABLE' && a.clearance === 'GAP');
  assert.ok(!a.nodes.some(n => /^(agentprofile|voice|res|ra|role|cap)-/.test(n.id)), 'profile records never enter the evidence graph');
  await seedGraph(g, root); // the witnessed licensing seed still accepts the combined graph
  const s = await studioOverview(g, root, T); assert.ok(s.status === 'AVAILABLE' && s.integrity.length === 0 && s.counts.people === 20);
  assert.equal((await ov(g)).integrity.length, 0);
});
