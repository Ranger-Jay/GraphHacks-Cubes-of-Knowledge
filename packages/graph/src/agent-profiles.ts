import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
