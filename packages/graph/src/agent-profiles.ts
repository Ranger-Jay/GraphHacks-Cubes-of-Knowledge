import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { GraphClient } from './client.js';
import { GraphUnavailableError } from './client.js';
import { WORKSPACE_ID } from './ideaverse.js';

/**
 * Agent profiles, voice bindings, resource references and DISPLAY-ONLY role assignments (issue #48, v028).
 *
 * Domain boundary: studio labels, outside the licensing evidence witness. Nothing here is an authorization
 * input. `declaredAccessLevel` is source provenance only, every capability is intended (never implemented),
 * and a role assignment is shown as intended/not enforced until a reviewed server-policy migration exists.
 * Existing Principals (ava, roy, guz, kanny, serena) are linked by key and never created or renamed.
 */
export const AGENT_PROFILES_SEED_VERSION = 'wad-agent-profiles@1';
export const PROFILE_SOURCE_IDS = { profiles: 'psrc-agent-profiles', roles: 'psrc-access-roles', assignments: 'psrc-role-assignments' } as const;
export const PROFILE_ORIGIN = { kind: 'project-authored synthetic fixture', licenseStatus: 'none claimed', synthetic: true } as const;
const FILES = { profiles: 'agent-profiles.json', roles: 'access-roles.json', assignments: 'role-assignments.json' } as const;
type FixtureKey = keyof typeof FILES;
const fixturePath = (k: FixtureKey) => `graph/seed/agents/${FILES[k]}`;
export const DISPLAY_ROLE_NAMES = ['Owner', 'Administrator', 'Operator', 'Reader', 'CI Auditor'] as const;

const AGENT_ID = /^Agent\d{3}$/;
const KEY = /^[a-z][a-z0-9-]{1,30}$/;
const SLUG = /^[a-z][a-z0-9-]{1,63}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DECLARED_RESOURCE = /^\.\.(nodes\/agents\/(agent\d{3})\/(skills|memory)\.md)$/;

export interface VoiceFixture { provider: 'ElevenLabs'; voiceId: string; voiceName: string }
export interface ResourceFixture { kind: 'skills' | 'memory'; declaredPath: string; proposedPath: string }
export interface AgentProfileFixture {
  agentId: string; actorKey: string; name: string; gender: string; species: string; apparentAge: number; color: string; emoji: string; emojiName: string;
  role: string; personality: string; assignment: string; knownFor: string; declaredAccessLevel: string;
  voice: VoiceFixture; skills: ResourceFixture; memory: ResourceFixture;
}
export interface CapabilityFixture { id: string; description: string }
export interface RoleFixture { id: string; name: string; intendedScope: string; capabilities: string[]; cannot: string[] }
export interface AssignmentFixture { principalKey: string; roleId: string }
export interface AgentFixtures {
  files: Record<FixtureKey, { path: string; sha256: string }>;
  profiles: AgentProfileFixture[]; capabilities: CapabilityFixture[]; roles: RoleFixture[];
  assignments: AssignmentFixture[]; assignmentProvenance: { source: string; decidedAt: string; enforcement: 'NOT_ENFORCED' };
}

export const profileNodeId = (agentId: string) => `agentprofile-${agentId.toLowerCase()}`;
export const voiceNodeId = (voiceId: string) => `voice-${voiceId}`;
export const resourceNodeId = (agentId: string, kind: 'skills' | 'memory') => `res-${agentId.toLowerCase()}-${kind}`;
export const assignmentNodeId = (principalKey: string) => `ra-${principalKey}-${WORKSPACE_ID}`;

const text = (v: unknown, what: string, max = 240): string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > max || v.trim() !== v) throw new Error(`agent fixture: ${what} must be a non-empty trimmed string up to ${max} characters`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) throw new Error(`agent fixture: ${what} contains control characters`);
  return v;
};
const list = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v)) throw new Error(`agent fixture: ${what} must be a list`);
  return v.map((x, i) => text(x, `${what}[${i}]`));
};

/**
 * The supplied resource strings (`..nodes/agents/agent012/skills.md`) are kept verbatim as `declaredPath`. The
 * proposed repo-relative path drops exactly the leading `..` and must name the SAME agent's own skills or memory
 * file under `nodes/agents/`. Anything else is refused: no traversal, no other agent's folder, no other file name.
 */
export function normalizeResourcePath(declared: string, agentId: string, kind: 'skills' | 'memory'): string {
  const m = DECLARED_RESOURCE.exec(declared);
  if (!m || m[2] !== agentId.toLowerCase() || m[3] !== kind) throw new Error(`agent fixture: resource path ${JSON.stringify(declared)} is not ${agentId}'s own ${kind} file`);
  return m[1]!;
}

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`agent fixture: ${what} must be an object`);
  return v as Record<string, unknown>;
};

/**
 * Strict loader for the three owner-authored fixtures. Throws on any violation (nothing is partially trusted).
 * Returns each file's SHA-256 so the read side can re-verify the stored copy against the file on disk.
 */
export async function loadAgentFixtures(repoRoot: string): Promise<AgentFixtures> {
  const files = {} as AgentFixtures['files']; const docs = {} as Record<FixtureKey, Record<string, unknown>>;
  for (const k of Object.keys(FILES) as FixtureKey[]) {
    const bytes = await readFile(join(repoRoot, fixturePath(k)));
    files[k] = { path: fixturePath(k), sha256: createHash('sha256').update(bytes).digest('hex') };
    docs[k] = obj(JSON.parse(bytes.toString('utf8')), fixturePath(k));
  }
  if (!Array.isArray(docs.profiles['profiles']) || docs.profiles['profiles'].length === 0) throw new Error('agent fixture: profiles must be a non-empty list');
  const profiles: AgentProfileFixture[] = (docs.profiles['profiles'] as unknown[]).map((raw, i) => {
    const p = obj(raw, `profiles[${i}]`);
    const agentId = text(p['agentId'], 'agentId', 12); if (!AGENT_ID.test(agentId)) throw new Error(`agent fixture: invalid agentId ${agentId}`);
    const actorKey = text(p['actorKey'], 'actorKey', 31); if (!KEY.test(actorKey)) throw new Error(`agent fixture: invalid actorKey ${actorKey}`);
    const color = text(p['color'], 'color', 7); if (!COLOR.test(color)) throw new Error(`agent fixture: invalid color for ${agentId}`);
    const age = p['apparentAge']; if (typeof age !== 'number' || !Number.isInteger(age) || age < 1 || age > 120) throw new Error(`agent fixture: invalid apparentAge for ${agentId}`);
    const v = obj(p['voice'], `${agentId} voice`);
    if (v['provider'] !== 'ElevenLabs') throw new Error(`agent fixture: ${agentId} voice provider must be ElevenLabs`);
    const voiceId = text(v['voiceId'], 'voiceId', 40); if (!VOICE_ID.test(voiceId)) throw new Error(`agent fixture: invalid voice id for ${agentId}`);
    const skillDeclared = text(p['skillFile'], 'skillFile', 120); const memoryDeclared = text(p['memoryFile'], 'memoryFile', 120);
    return {
      agentId, actorKey, name: text(p['name'], 'name', 40), gender: text(p['gender'], 'gender', 40), species: text(p['species'], 'species', 40), apparentAge: age, color,
      emoji: text(p['emoji'], 'emoji', 16), emojiName: text(p['emojiName'], 'emojiName', 80), role: text(p['role'], 'role'), personality: text(p['personality'], 'personality'),
      assignment: text(p['assignment'], 'assignment'), knownFor: text(p['knownFor'], 'knownFor'), declaredAccessLevel: text(p['declaredAccessLevel'], 'declaredAccessLevel', 40),
      voice: { provider: 'ElevenLabs', voiceId, voiceName: text(v['voiceName'], 'voiceName', 80) },
      skills: { kind: 'skills', declaredPath: skillDeclared, proposedPath: normalizeResourcePath(skillDeclared, agentId, 'skills') },
      memory: { kind: 'memory', declaredPath: memoryDeclared, proposedPath: normalizeResourcePath(memoryDeclared, agentId, 'memory') }
    };
  });
  if (new Set(profiles.map(p => p.agentId)).size !== profiles.length || new Set(profiles.map(p => p.actorKey)).size !== profiles.length) throw new Error('agent fixture: duplicate agentId or actorKey');

  const rolesDoc = docs.roles;
  const capabilities: CapabilityFixture[] = (Array.isArray(rolesDoc['capabilities']) ? rolesDoc['capabilities'] : []).map((raw, i) => {
    const c = obj(raw, `capabilities[${i}]`); const id = text(c['id'], 'capability id', 64); if (!SLUG.test(id) || !id.startsWith('cap-')) throw new Error(`agent fixture: invalid capability id ${id}`);
    return { id, description: text(c['description'], 'capability description') };
  });
  if (capabilities.length === 0 || new Set(capabilities.map(c => c.id)).size !== capabilities.length) throw new Error('agent fixture: capabilities must be unique and non-empty');
  const known = new Set(capabilities.map(c => c.id));
  const roles: RoleFixture[] = (Array.isArray(rolesDoc['roles']) ? rolesDoc['roles'] : []).map((raw, i) => {
    const r = obj(raw, `roles[${i}]`); const id = text(r['id'], 'role id', 64); if (!SLUG.test(id) || !id.startsWith('role-')) throw new Error(`agent fixture: invalid role id ${id}`);
    const caps = list(r['capabilities'], `${id} capabilities`); for (const c of caps) if (!known.has(c)) throw new Error(`agent fixture: ${id} names unknown capability ${c}`);
    return { id, name: text(r['name'], 'role name', 40), intendedScope: text(r['intendedScope'], 'intendedScope', 400), capabilities: caps, cannot: list(r['cannot'], `${id} cannot`) };
  });
  if (roles.map(r => r.name).join('|') !== DISPLAY_ROLE_NAMES.join('|')) throw new Error(`agent fixture: roles must be exactly ${DISPLAY_ROLE_NAMES.join(', ')} in that order`);
  if (new Set(roles.map(r => r.id)).size !== roles.length) throw new Error('agent fixture: duplicate role id');

  const aDoc = docs.assignments;
  if (aDoc['workspaceId'] !== WORKSPACE_ID) throw new Error(`agent fixture: assignments must target ${WORKSPACE_ID}`);
  const prov = obj(aDoc['provenance'], 'assignment provenance');
  if (prov['enforcement'] !== 'NOT_ENFORCED') throw new Error('agent fixture: assignments must be marked NOT_ENFORCED');
  const decidedAt = text(prov['decidedAt'], 'decidedAt', 40); if (!UTC.test(decidedAt) || Number.isNaN(Date.parse(decidedAt))) throw new Error('agent fixture: decidedAt must be UTC');
  const roleIds = new Set(roles.map(r => r.id));
  const assignments: AssignmentFixture[] = (Array.isArray(aDoc['assignments']) ? aDoc['assignments'] : []).map((raw, i) => {
    const a = obj(raw, `assignments[${i}]`); const principalKey = text(a['principalKey'], 'principalKey', 31); const roleId = text(a['roleId'], 'roleId', 64);
    if (!KEY.test(principalKey) || !roleIds.has(roleId)) throw new Error(`agent fixture: invalid assignment ${principalKey} -> ${roleId}`);
    return { principalKey, roleId };
  });
  if (assignments.length === 0 || new Set(assignments.map(a => a.principalKey)).size !== assignments.length) throw new Error('agent fixture: one assignment per principal, at least one');
  // The owner's rule: Owner is never assigned to a synthetic agent.
  const agentKeys = new Set(profiles.map(p => p.actorKey));
  if (assignments.some(a => a.roleId === 'role-owner' && agentKeys.has(a.principalKey))) throw new Error('agent fixture: Owner must not be assigned to a synthetic agent');
  return { files, profiles, capabilities, roles, assignments, assignmentProvenance: { source: text(prov['source'], 'provenance source'), decidedAt, enforcement: 'NOT_ENFORCED' } };
}


export interface AgentProfilesSeedResult {
  seedVersion: string; tenantId: string; profiles: number; roles: number; capabilities: number; assignments: number; edges: number;
  /** Edges to the EXISTING Principal nodes (IS_PRINCIPAL, FOR_PRINCIPAL). 0 when the licensing seed has not created them: nothing is invented. */
  principalLinks: number;
}

/**
 * Deterministic idempotent seed on (id, tenantId). Profile, voice, resource, role and capability nodes are refreshed
 * from the fixtures. A RoleAssignment is created once; a re-seed applies an owner fixture change only to a row the fixture still
 * manages (source 'fixture', untouched since seeding) and never touches a row an authorized change has taken over. The workspace is created only if absent (revision untouched). No Principal
 * is created, renamed or given membership.
 */
export async function seedAgentProfiles(client: GraphClient, repoRoot: string, options: { tenantId?: string } = {}): Promise<AgentProfilesSeedResult> {
  const tenantId = options.tenantId ?? 't-wad';
  const f = await loadAgentFixtures(repoRoot);
  let edges = 0; let principalLinks = 0;
  const merge = (label: string, id: string, props: Record<string, string | number | boolean | string[]>) =>
    client.write(`MERGE (n:${label} {id: $id, tenantId: $tenantId}) SET n += $props`, { id, tenantId, props: { tenantId, ...props } });
  const link = async (fromLabel: string, from: string, type: string, toLabel: string, to: string, id: string, props: Record<string, string> = {}) => {
    const rows = await client.write<{ n: number }>(`MATCH (a:${fromLabel} {id: $from, tenantId: $tenantId}), (b:${toLabel} {id: $to, tenantId: $tenantId}) MERGE (a)-[e:${type} {id: $id}]->(b) SET e += $props RETURN count(e) AS n`, { from, to, id, tenantId, props });
    if (rows[0]?.n !== 1) throw new Error(`Agent profile edge ${id} endpoints missing`);
    edges++;
  };
  const linkPrincipal = async (fromLabel: string, from: string, type: string, key: string, id: string) => {
    const rows = await client.write<{ n: number }>(`MATCH (a:${fromLabel} {id: $from, tenantId: $tenantId}), (p:Principal {id: $key}) MERGE (a)-[e:${type} {id: $id}]->(p) RETURN count(e) AS n`, { from, key, id, tenantId });
    const n = rows[0]?.n ?? 0; edges += n; principalLinks += n;
  };
  const srcFor = { profiles: PROFILE_SOURCE_IDS.profiles, roles: PROFILE_SOURCE_IDS.roles, assignments: PROFILE_SOURCE_IDS.assignments };
  const kinds = { profiles: 'agent_profiles', roles: 'access_roles', assignments: 'role_assignments' } as const;
  for (const k of Object.keys(srcFor) as FixtureKey[]) {
    await merge('ProfileSource', srcFor[k], { kind: kinds[k], path: f.files[k].path, sha256: f.files[k].sha256, synthetic: true, origin: PROFILE_ORIGIN.kind, licenseStatus: PROFILE_ORIGIN.licenseStatus });
  }
  // Same statement as seedIdeaverse: created once, the revision is never reset by seeding order.
  await client.write('MERGE (w:Workspace {id: $id, tenantId: $tenantId}) ON CREATE SET w.revision = 0, w.name = $name, w.synthetic = true', { id: WORKSPACE_ID, tenantId, name: 'Warnings After Dark cube workspace' });

  for (const c of f.capabilities) await merge('Capability', c.id, { description: c.description, implemented: false, synthetic: true, sourceId: srcFor.roles });
  for (const r of f.roles) await merge('AccessRole', r.id, { name: r.name, intendedScope: r.intendedScope, cannot: r.cannot, implemented: false, synthetic: true, sourceId: srcFor.roles });
  for (const r of f.roles) {
    await link('AccessRole', r.id, 'DEFINED_IN', 'ProfileSource', srcFor.roles, `e-${r.id}-defined-in`);
    for (const c of r.capabilities) await link('AccessRole', r.id, 'HAS_CAPABILITY', 'Capability', c, `e-${r.id}-has-${c}`);
  }
  for (const p of f.profiles) {
    const id = profileNodeId(p.agentId);
    await merge('AgentProfile', id, {
      agentId: p.agentId, actorKey: p.actorKey, name: p.name, gender: p.gender, species: p.species, apparentAge: p.apparentAge, color: p.color, emoji: p.emoji, emojiName: p.emojiName,
      role: p.role, personality: p.personality, assignment: p.assignment, knownFor: p.knownFor, declaredAccessLevel: p.declaredAccessLevel, synthetic: true, sourceId: srcFor.profiles
    });
    await merge('VoiceProfile', voiceNodeId(p.voice.voiceId), { provider: p.voice.provider, externalVoiceId: p.voice.voiceId, voiceName: p.voice.voiceName, synthetic: true, sourceId: srcFor.profiles });
    for (const res of [p.skills, p.memory]) await merge('ResourceRef', resourceNodeId(p.agentId, res.kind), { kind: res.kind, agentId: p.agentId, declaredPath: res.declaredPath, proposedPath: res.proposedPath, synthetic: true, sourceId: srcFor.profiles });
    await link('AgentProfile', id, 'DEFINED_IN', 'ProfileSource', srcFor.profiles, `e-${id}-defined-in`);
    await link('AgentProfile', id, 'USES_VOICE', 'VoiceProfile', voiceNodeId(p.voice.voiceId), `e-${id}-uses-voice`);
    await link('AgentProfile', id, 'HAS_SKILLS', 'ResourceRef', resourceNodeId(p.agentId, 'skills'), `e-${id}-has-skills`);
    await link('AgentProfile', id, 'HAS_MEMORY', 'ResourceRef', resourceNodeId(p.agentId, 'memory'), `e-${id}-has-memory`);
    await link('AgentProfile', id, 'ASSIGNED_TO', 'Workspace', WORKSPACE_ID, `e-${id}-assigned-to`);
    await linkPrincipal('AgentProfile', id, 'IS_PRINCIPAL', p.actorKey, `e-${id}-is-principal`);
  }
  // Fixture-managed rows: source 'fixture' and untouched since the seed (revision equals fixtureRevision; a row seeded
  // before this field existed counts as managed at revision 1). An authorized change bumps the revision and sets its own
  // source, which makes the row unmanaged: a re-seed then never touches the row or its edges.
  const MANAGED = "n.source = 'fixture' AND coalesce(n.fixtureRevision, 1) = n.revision";
  for (const a of f.assignments) {
    const id = assignmentNodeId(a.principalKey);
    await client.write('MERGE (n:RoleAssignment {id: $id, tenantId: $tenantId}) ON CREATE SET n += $props', { id, tenantId, props: {
      tenantId, principalId: a.principalKey, roleId: a.roleId, workspaceId: WORKSPACE_ID, status: 'ACTIVE', enforcement: 'NOT_ENFORCED', revision: 1, fixtureRevision: 1,
      assignedAt: f.assignmentProvenance.decidedAt, assignedBy: 'owner decision (fixture)', source: 'fixture', sourceId: srcFor.assignments, synthetic: true
    } });
    // The owner changed the fixture: apply it to a row the fixture still manages (a later authorized change is left alone).
    await client.write(`MATCH (n:RoleAssignment {id: $id, tenantId: $tenantId}) WHERE ${MANAGED} AND (n.roleId <> $roleId OR n.assignedAt <> $at OR n.status <> 'ACTIVE')
      SET n.roleId = $roleId, n.assignedAt = $at, n.status = 'ACTIVE', n.revision = n.revision + 1 WITH n SET n.fixtureRevision = n.revision`, { id, tenantId, roleId: a.roleId, at: f.assignmentProvenance.decidedAt });
    const managed = (await client.write<{ n: number }>(`MATCH (n:RoleAssignment {id: $id, tenantId: $tenantId}) WHERE ${MANAGED} RETURN count(n) AS n`, { id, tenantId }))[0]?.n === 1;
    if (!managed) continue; // an authorized change owns this row and its edges
    await client.write("MATCH (:RoleAssignment {id: $id, tenantId: $tenantId})-[e:GRANTS_ROLE]->(r) WHERE r.id <> $roleId DELETE e", { id, tenantId, roleId: a.roleId });
    await link('RoleAssignment', id, 'GRANTS_ROLE', 'AccessRole', a.roleId, `e-${id}-grants-role`);
    await link('RoleAssignment', id, 'IN_WORKSPACE', 'Workspace', WORKSPACE_ID, `e-${id}-in-workspace`);
    await link('RoleAssignment', id, 'DEFINED_IN', 'ProfileSource', srcFor.assignments, `e-${id}-defined-in`);
    await linkPrincipal('RoleAssignment', id, 'FOR_PRINCIPAL', a.principalKey, `e-${id}-for-principal`);
  }
  // A principal the owner removed from the fixture: revoke the row the fixture manages. Never deletes, never touches an authorized row.
  await client.write(`MATCH (n:RoleAssignment {tenantId: $tenantId}) WHERE ${MANAGED} AND NOT n.principalId IN $keys AND n.status <> 'REVOKED'
    SET n.status = 'REVOKED', n.revision = n.revision + 1 WITH n SET n.fixtureRevision = n.revision`, { tenantId, keys: f.assignments.map(a => a.principalKey) });
  return { seedVersion: AGENT_PROFILES_SEED_VERSION, tenantId, profiles: f.profiles.length, roles: f.roles.length, capabilities: f.capabilities.length, assignments: f.assignments.length, edges, principalLinks };
}

// ---------------------------------------------------------------------------------------------------------------
// Read side (v028.04): one query per tenant, every served fact re-verified against the fixtures on disk.
// ---------------------------------------------------------------------------------------------------------------

export const READ_AGENT_PROFILES = `
MATCH (n {tenantId: $tenantId}) WHERE n:AgentProfile OR n:VoiceProfile OR n:ResourceRef OR n:AccessRole OR n:Capability OR n:RoleAssignment OR n:ProfileSource
OPTIONAL MATCH (n)-[e]->(b)
RETURN labels(n) AS labels, properties(n) AS props, collect([e.id, type(e), b.id, labels(b), b.tenantId]) AS out`;

export type ResourceStatus = 'PRESENT' | 'MISSING' | 'UNVERIFIED';
export interface ResourceView { kind: 'skills' | 'memory'; declaredPath: string; proposedPath: string; status: ResourceStatus; sha256?: string; byteCount?: number; note: string }
export interface IntendedCapabilityView { id: string; description: string; implemented: false }
export interface RoleView { id: string; name: string; intendedScope: string; intendedCapabilities: IntendedCapabilityView[]; cannot: string[]; implemented: false }
export type EffectiveRole =
  | { state: 'ASSIGNED'; enforcement: 'NOT_ENFORCED'; role: RoleView; assignmentId: string; revision: number; assignedAt: string; assignedBy: string; source: string; note: string }
  | { state: 'UNASSIGNED'; enforcement: 'NOT_ENFORCED'; reason: 'none' | 'revoked'; note: string }
  | { state: 'UNKNOWN'; enforcement: 'NOT_ENFORCED'; reason: string; note: string };
export interface AgentProfileView {
  id: string; agentId: string; actorKey: string; name: string; gender: string; species: string; apparentAge: number; color: string; emoji: string; emojiName: string;
  role: string; personality: string; assignmentText: string; knownFor: string;
  /** The owner's supplied access text. Source provenance only: it grants nothing and no consumer may render it as access. */
  sourceProvenance: { declaredAccessLevel: string; grantsAccess: false };
  voice: VoiceFixture; resources: { skills: ResourceView; memory: ResourceView };
  principal: { key: string; linked: boolean };
  workspaceId: string;
  access: EffectiveRole;
}
export interface AgentProfileOverview {
  status: 'AVAILABLE'; tenantId: string; domain: 'studio'; origin: typeof PROFILE_ORIGIN; enforcement: 'NOT_ENFORCED';
  profiles: AgentProfileView[]; roles: RoleView[]; assignments: { principalKey: string; access: EffectiveRole }[];
  integrity: { id: string; reason: string }[];
}
export type AgentProfileResult =
  | AgentProfileOverview
  | { status: 'EMPTY'; tenantId: string; domain: 'studio' }
  | { status: 'UNAVAILABLE'; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'FIXTURE_INVALID' };

const NOTE_DISPLAY_ONLY = 'Intended assignment for display. Not enforced: session rights are unchanged.';
const RESOURCE_PATH = /^nodes\/agents\/agent\d{3}\/(skills|memory)\.md$/;
const MAX_RESOURCE_BYTES = 1_048_576;

/**
 * Status of a proposed resource path at read time. The file is only hashed, never executed, loaded or interpreted.
 * A path outside the allowlist, a symlink, or anything that resolves outside `nodes/agents/` under the repository is UNVERIFIED.
 */
export async function resolveResource(repoRoot: string, declaredPath: string, proposedPath: string, kind: 'skills' | 'memory'): Promise<ResourceView> {
  const base = { kind, declaredPath, proposedPath };
  const unverified = (note: string): ResourceView => ({ ...base, status: 'UNVERIFIED', note });
  if (!RESOURCE_PATH.test(proposedPath)) return unverified('Path is outside the allowed resource folder; not opened.');
  const root = resolve(repoRoot); const abs = resolve(root, proposedPath);
  if (!abs.startsWith(resolve(root, 'nodes/agents') + sep)) return unverified('Path resolves outside the allowed resource folder; not opened.');
  try {
    const st = await lstat(abs);
    if (st.isSymbolicLink() || !st.isFile()) return unverified('Not a regular file; not opened.');
    if (st.size > MAX_RESOURCE_BYTES) return unverified('File is larger than the 1 MiB inspection limit; not opened.');
    const real = await realpath(abs); const realRoot = await realpath(root);
    if (!real.startsWith(realRoot + sep)) return unverified('File resolves outside the repository; not opened.');
    const bytes = await readFile(real);
    return { ...base, status: 'PRESENT', sha256: createHash('sha256').update(bytes).digest('hex'), byteCount: bytes.length, note: 'File exists. Its content is not loaded or executed.' };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return { ...base, status: 'MISSING', note: 'File not found. No skill or memory is loaded.' };
    return unverified('Could not be inspected.');
  }
}

interface Row { labels: string[]; props: Record<string, unknown>; out: unknown[][] }
interface Edge { id: string; type: string; to: string; toLabels: string[]; toTenant: unknown }
const edgesOf = (r: Row): Edge[] => r.out.filter(([id, type, to]) => typeof id === 'string' && typeof type === 'string' && typeof to === 'string')
  .map(([id, type, to, labels, tenant]) => ({ id: id as string, type: type as string, to: to as string, toLabels: (labels as string[] | null) ?? [], toTenant: tenant }));
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/**
 * Named read of one tenant's agent profiles and display-only role assignments in ONE graph query, re-verified against
 * the fixtures (hash of each source, every field, every edge). Anything that does not verify is withheld and listed
 * under `integrity`; a role is never inferred from `declaredAccessLevel`, and no assignment is ever reported as enforced.
 */
export async function agentProfileOverview(client: GraphClient, repoRoot: string, tenantId: string): Promise<AgentProfileResult> {
  let rows: Row[];
  try { rows = await client.read<Row>(READ_AGENT_PROFILES, { tenantId }); }
  catch (err) { if (err instanceof GraphUnavailableError) return { status: 'UNAVAILABLE', reason: err.reason }; throw err; }
  if (rows.length === 0) return { status: 'EMPTY', tenantId, domain: 'studio' };
  let f: AgentFixtures;
  try { f = await loadAgentFixtures(repoRoot); } catch { return { status: 'UNAVAILABLE', reason: 'FIXTURE_INVALID' }; }
  const integrity: { id: string; reason: string }[] = [];
  const flag = (id: string, reason: string) => { integrity.push({ id, reason }); };
  const by = (label: string) => rows.filter(r => r.labels[0] === label);
  const node = (label: string, id: string) => by(label).find(r => r.props['id'] === id);
  const inTenant = (e: Edge) => e.toTenant === tenantId;

  // Sources: stored path and hash must equal the fixture file on disk.
  const sourceOk = new Set<string>();
  for (const k of Object.keys(PROFILE_SOURCE_IDS) as FixtureKey[]) {
    const id = PROFILE_SOURCE_IDS[k]; const s = node('ProfileSource', id);
    if (!s) { flag(id, 'fixture source is not in the graph'); continue; }
    if (s.props['sha256'] !== f.files[k].sha256 || s.props['path'] !== f.files[k].path) { flag(id, 'stored source hash or path differs from the fixture file'); continue; }
    sourceOk.add(id);
  }

  // Roles: node fields and capability edges must equal the fixture; capabilities must match too.
  const capDesc = new Map(f.capabilities.map(c => [c.id, c.description]));
  const capOk = new Set<string>();
  for (const c of f.capabilities) {
    const n = node('Capability', c.id);
    if (n && sourceOk.has(PROFILE_SOURCE_IDS.roles) && n.props['description'] === c.description && n.props['implemented'] === false && n.props['sourceId'] === PROFILE_SOURCE_IDS.roles) capOk.add(c.id);
    else flag(c.id, 'capability is missing or differs from the fixture');
  }
  const roles = new Map<string, RoleView>();
  for (const r of f.roles) {
    const n = node('AccessRole', r.id);
    if (!n) { flag(r.id, 'role is not in the graph'); continue; }
    const p = n.props; const e = edgesOf(n);
    const caps = e.filter(x => x.type === 'HAS_CAPABILITY' && x.toLabels[0] === 'Capability' && inTenant(x)).map(x => x.to);
    const defined = e.filter(x => x.type === 'DEFINED_IN');
    if (!sourceOk.has(PROFILE_SOURCE_IDS.roles) || p['name'] !== r.name || p['intendedScope'] !== r.intendedScope || p['implemented'] !== false || !Array.isArray(p['cannot']) || !sameSet(p['cannot'] as string[], r.cannot)
      || !sameSet(caps, r.capabilities) || !r.capabilities.every(c => capOk.has(c)) || defined.length !== 1 || defined[0]!.to !== PROFILE_SOURCE_IDS.roles) {
      flag(r.id, 'role or its capabilities differ from the fixture'); continue;
    }
    roles.set(r.id, { id: r.id, name: r.name, intendedScope: r.intendedScope, implemented: false, cannot: r.cannot,
      intendedCapabilities: r.capabilities.map(c => ({ id: c, description: capDesc.get(c)!, implemented: false as const })) });
  }

  // Assignments: validated against the verified role table. The assignment row is the live source of the displayed
  // tag (it may legitimately differ from the seed fixture after an authorized change), but it is never trusted blindly.
  const UTC_RE = UTC; const KEY_RE = KEY;
  const assignmentRows = by('RoleAssignment');
  interface Assn { id: string; principalKey: string; reason: string | null; status: string; roleId: string; revision: number; assignedAt: string; assignedBy: string; source: string }
  const assns: Assn[] = assignmentRows.map(r => {
    const p = r.props; const e = edgesOf(r); const id = String(p['id']); const principalKey = typeof p['principalId'] === 'string' ? p['principalId'] : '';
    const roleId = typeof p['roleId'] === 'string' ? p['roleId'] : ''; const status = typeof p['status'] === 'string' ? p['status'] : '';
    let reason: string | null = null;
    if (!KEY_RE.test(principalKey)) reason = 'assignment has no valid principal';
    else if (id !== assignmentNodeId(principalKey)) reason = 'unexpected assignment id (possible duplicate or conflicting assignment)';
    else if (!roles.has(roleId)) reason = 'assignment names a role that is unknown or did not verify';
    else if (p['workspaceId'] !== WORKSPACE_ID || !e.some(x => x.type === 'IN_WORKSPACE' && x.to === WORKSPACE_ID && inTenant(x))) reason = 'assignment is not for this workspace';
    else if (!e.some(x => x.type === 'GRANTS_ROLE' && x.to === roleId && inTenant(x))) reason = 'assignment edge and role do not agree';
    else if (p['enforcement'] !== 'NOT_ENFORCED') reason = 'assignment claims enforcement, which no server policy implements';
    else if (status !== 'ACTIVE' && status !== 'REVOKED') reason = 'assignment status is invalid';
    else if (typeof p['revision'] !== 'number' || !Number.isInteger(p['revision']) || p['revision'] < 1) reason = 'assignment revision is invalid';
    else if (typeof p['assignedAt'] !== 'string' || !UTC_RE.test(p['assignedAt'])) reason = 'assignment timestamp is invalid';
    if (reason) flag(id, reason);
    return { id, principalKey, reason, status, roleId, revision: typeof p['revision'] === 'number' ? p['revision'] : 0, assignedAt: String(p['assignedAt'] ?? ''), assignedBy: String(p['assignedBy'] ?? ''), source: String(p['source'] ?? '') };
  });
  const effective = (principalKey: string): EffectiveRole => {
    const mine = assns.filter(a => a.principalKey === principalKey);
    if (mine.length === 0) return { state: 'UNASSIGNED', enforcement: 'NOT_ENFORCED', reason: 'none', note: 'No role assignment. This grants no access and changes no session right.' };
    const bad = mine.filter(a => a.reason !== null);
    if (bad.length > 0) return { state: 'UNKNOWN', enforcement: 'NOT_ENFORCED', reason: bad[0]!.reason!, note: 'The assignment could not be verified, so no role or capability is shown.' };
    const active = mine.filter(a => a.status === 'ACTIVE');
    if (active.length > 1) { flag(principalKey, 'more than one active assignment for one principal'); return { state: 'UNKNOWN', enforcement: 'NOT_ENFORCED', reason: 'more than one active assignment', note: 'Conflicting assignments, so no role or capability is shown.' }; }
    if (active.length === 0) return { state: 'UNASSIGNED', enforcement: 'NOT_ENFORCED', reason: 'revoked', note: 'The assignment was revoked. This grants no access.' };
    const a = active[0]!;
    return { state: 'ASSIGNED', enforcement: 'NOT_ENFORCED', role: roles.get(a.roleId)!, assignmentId: a.id, revision: a.revision, assignedAt: a.assignedAt, assignedBy: a.assignedBy, source: a.source, note: NOTE_DISPLAY_ONLY };
  };

  // Profiles: served only when the profile, its voice, both resource refs and every edge verify.
  const profiles: AgentProfileView[] = [];
  for (const p of f.profiles) {
    const id = profileNodeId(p.agentId); const n = node('AgentProfile', id);
    if (!n) { flag(id, 'profile is not in the graph'); continue; }
    const q = n.props; const e = edgesOf(n);
    const fields: [string, unknown][] = [['agentId', p.agentId], ['actorKey', p.actorKey], ['name', p.name], ['gender', p.gender], ['species', p.species], ['apparentAge', p.apparentAge], ['color', p.color], ['emoji', p.emoji], ['emojiName', p.emojiName], ['role', p.role], ['personality', p.personality], ['assignment', p.assignment], ['knownFor', p.knownFor], ['declaredAccessLevel', p.declaredAccessLevel], ['sourceId', PROFILE_SOURCE_IDS.profiles]];
    if (!sourceOk.has(PROFILE_SOURCE_IDS.profiles) || fields.some(([k, v]) => q[k] !== v)) { flag(id, 'profile fields differ from the fixture'); continue; }
    const one = (type: string, to: string, label?: string) => e.filter(x => x.type === type).length === 1 && e.some(x => x.type === type && x.to === to && inTenant(x) && (label === undefined || x.toLabels[0] === label));
    const vid = voiceNodeId(p.voice.voiceId); const v = node('VoiceProfile', vid);
    const sk = node('ResourceRef', resourceNodeId(p.agentId, 'skills')); const mem = node('ResourceRef', resourceNodeId(p.agentId, 'memory'));
    const resOk = (r: Row | undefined, x: ResourceFixture) => !!r && r.props['kind'] === x.kind && r.props['agentId'] === p.agentId && r.props['declaredPath'] === x.declaredPath && r.props['proposedPath'] === x.proposedPath && r.props['sourceId'] === PROFILE_SOURCE_IDS.profiles;
    if (!v || v.props['provider'] !== p.voice.provider || v.props['externalVoiceId'] !== p.voice.voiceId || v.props['voiceName'] !== p.voice.voiceName || v.props['sourceId'] !== PROFILE_SOURCE_IDS.profiles) { flag(id, 'voice binding differs from the fixture'); continue; }
    if (!resOk(sk, p.skills) || !resOk(mem, p.memory)) { flag(id, 'resource references differ from the fixture'); continue; }
    if (!one('USES_VOICE', vid, 'VoiceProfile') || !one('HAS_SKILLS', resourceNodeId(p.agentId, 'skills'), 'ResourceRef') || !one('HAS_MEMORY', resourceNodeId(p.agentId, 'memory'), 'ResourceRef')
      || !one('ASSIGNED_TO', WORKSPACE_ID, 'Workspace') || !one('DEFINED_IN', PROFILE_SOURCE_IDS.profiles, 'ProfileSource')) { flag(id, 'profile relationships differ from the fixture'); continue; }
    const linked = e.some(x => x.type === 'IS_PRINCIPAL' && x.to === p.actorKey && x.toLabels[0] === 'Principal');
    profiles.push({
      id, agentId: p.agentId, actorKey: p.actorKey, name: p.name, gender: p.gender, species: p.species, apparentAge: p.apparentAge, color: p.color, emoji: p.emoji, emojiName: p.emojiName,
      role: p.role, personality: p.personality, assignmentText: p.assignment, knownFor: p.knownFor,
      sourceProvenance: { declaredAccessLevel: p.declaredAccessLevel, grantsAccess: false },
      voice: p.voice,
      resources: { skills: await resolveResource(repoRoot, p.skills.declaredPath, p.skills.proposedPath, 'skills'), memory: await resolveResource(repoRoot, p.memory.declaredPath, p.memory.proposedPath, 'memory') },
      principal: { key: p.actorKey, linked }, workspaceId: WORKSPACE_ID, access: effective(p.actorKey)
    });
  }
  const keys = [...new Set([...assns.map(a => a.principalKey).filter(k => KEY_RE.test(k)), ...f.profiles.map(p => p.actorKey)])].sort();
  const assignments = keys.map(principalKey => ({ principalKey, access: effective(principalKey) }));
  integrity.sort((a, b) => a.id.localeCompare(b.id) || a.reason.localeCompare(b.reason));
  return { status: 'AVAILABLE', tenantId, domain: 'studio', origin: PROFILE_ORIGIN, enforcement: 'NOT_ENFORCED', profiles, roles: [...roles.values()], assignments, integrity };
}

/** Fresh read of one principal's display-only role. Never cached; any privileged operation must re-read (and must not use this as authorization). */
export async function effectiveRoleFor(client: GraphClient, repoRoot: string, tenantId: string, principalKey: string): Promise<EffectiveRole | { status: 'UNAVAILABLE'; reason: string }> {
  const o = await agentProfileOverview(client, repoRoot, tenantId);
  if (o.status === 'UNAVAILABLE') return o;
  if (o.status === 'EMPTY') return { state: 'UNASSIGNED', enforcement: 'NOT_ENFORCED', reason: 'none', note: 'No role assignment. This grants no access and changes no session right.' };
  return o.assignments.find(a => a.principalKey === principalKey)?.access ?? { state: 'UNASSIGNED', enforcement: 'NOT_ENFORCED', reason: 'none', note: 'No role assignment. This grants no access and changes no session right.' };
}
