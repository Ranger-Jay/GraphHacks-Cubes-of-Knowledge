import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphClient } from './client.js';

/**
 * Synthetic studio population (crew and departments). Deliberately outside the licensing evidence
 * domain: its own labels (StudioPerson, Department, StudioSource), no Tenant MEMBER_OF edge and no
 * Principal, so crew hold no rights and the evidence witness (which hashes only the evidence labels)
 * neither sees nor vouches for these records. Their provenance is checked on its own at read time:
 * the fixture file hash and the exact line each record claims.
 */
export const STUDIO_SEED_VERSION = 'wad-studio-people@1';
const DEFAULT_TENANT = 't-wad';
const ORIGIN = { kind: 'project-authored synthetic fixture', licenseStatus: 'none claimed', synthetic: true } as const;

/** Allowlisted fixture files; the graph never supplies a path. */
const FIXTURES = {
  'ssrc-departments': { file: 'departments.txt', kind: 'studio_departments' },
  'ssrc-crew-roster': { file: 'crew-roster.txt', kind: 'studio_crew_roster' }
} as const;
type FixtureId = keyof typeof FIXTURES;
const fixturePath = (id: FixtureId) => `graph/seed/studio/${FIXTURES[id].file}`;

export interface DepartmentRow { slug: string; name: string; kind: 'department' | 'service'; line: number; excerpt: string }
export interface CrewRow { slug: string; displayName: string; role: string; departmentSlug: string; line: number; excerpt: string }

const FIELD = '([^|\\n]*[^|\\s\\n])';
const DEPARTMENT_LINE = new RegExp(`^Department ([a-z0-9-]+) \\| ${FIELD} \\| (department|service)$`);
const CREW_LINE = new RegExp(`^Crew ([a-z0-9-]+) \\| ${FIELD} \\| ${FIELD} \\| ([a-z0-9-]+)$`);
const DEPARTMENT_CANDIDATE = /^Department \S+ \|/;
const CREW_CANDIDATE = /^Crew \S+ \|/;
const DEPARTMENT_COUNT = /^END OF DEPARTMENTS\. Complete listing: (\d+) departments\.$/gm;
const CREW_COUNT = /^END OF ROSTER\. Complete listing: (\d+) crew\.$/gm;

function rowsOf<T>(text: string, candidate: RegExp, strict: RegExp, make: (m: RegExpExecArray, line: number, excerpt: string) => T, what: string): T[] {
  const out: T[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (!candidate.test(line)) return;
    const m = strict.exec(line);
    if (!m) throw new Error(`${what} line ${i + 1} does not match the studio grammar`);
    out.push(make(m, i + 1, line));
  });
  return out;
}

function declaredCount(text: string, re: RegExp): number | null {
  const all = [...text.matchAll(re)].map(m => Number(m[1]));
  return all.length === 1 ? all[0]! : null;
}

/** Whole-file departments grammar. Throws on a malformed record, duplicate slug or count mismatch. */
export function parseDepartments(text: string): DepartmentRow[] {
  const rows = rowsOf(text, DEPARTMENT_CANDIDATE, DEPARTMENT_LINE, (m, line, excerpt): DepartmentRow => ({
    slug: m[1]!, name: m[2]!, kind: m[3] as DepartmentRow['kind'], line, excerpt }), 'departments');
  if (new Set(rows.map(r => r.slug)).size !== rows.length) throw new Error('departments: duplicate slug');
  if (declaredCount(text, DEPARTMENT_COUNT) !== rows.length) throw new Error('departments: declared count does not match the listing');
  return rows;
}

/** Whole-file crew grammar. Every crew line must name a department that exists in `departments`. */
export function parseCrew(text: string, departments: DepartmentRow[]): CrewRow[] {
  const rows = rowsOf(text, CREW_CANDIDATE, CREW_LINE, (m, line, excerpt): CrewRow => ({
    slug: m[1]!, displayName: m[2]!, role: m[3]!, departmentSlug: m[4]!, line, excerpt }), 'crew');
  if (new Set(rows.map(r => r.slug)).size !== rows.length) throw new Error('crew: duplicate slug');
  if (declaredCount(text, CREW_COUNT) !== rows.length) throw new Error('crew: declared count does not match the listing');
  const known = new Set(departments.map(d => d.slug));
  for (const r of rows) if (!known.has(r.departmentSlug)) throw new Error(`crew ${r.slug}: unknown department ${r.departmentSlug}`);
  return rows;
}

export const personId = (slug: string) => `sp-${slug}`;
export const departmentId = (slug: string) => `dept-${slug}`;

interface LoadedFixtures {
  files: Record<FixtureId, { path: string; sha256: string; kind: string }>;
  departments: DepartmentRow[];
  crew: CrewRow[];
}

async function loadFixtures(repoRoot: string): Promise<LoadedFixtures> {
  const files = {} as LoadedFixtures['files'];
  const texts = {} as Record<FixtureId, string>;
  for (const id of Object.keys(FIXTURES) as FixtureId[]) {
    const bytes = await readFile(join(repoRoot, fixturePath(id)));
    texts[id] = bytes.toString('utf8');
    files[id] = { path: fixturePath(id), sha256: createHash('sha256').update(bytes).digest('hex'), kind: FIXTURES[id].kind };
  }
  const departments = parseDepartments(texts['ssrc-departments']);
  return { files, departments, crew: parseCrew(texts['ssrc-crew-roster'], departments) };
}

export interface StudioSeedResult { seedVersion: string; tenantId: string; sources: number; departments: number; people: number; edges: number }

/**
 * Deterministic, idempotent MERGE on (id, tenantId) for a fixed manifest. Not part of the licensing
 * seed or its witness. Run serialized: there is no database-level uniqueness constraint, so two
 * concurrent first-time seeds of one tenant could create duplicates.
 */
export async function seedStudio(client: GraphClient, repoRoot: string, options: { tenantId?: string } = {}): Promise<StudioSeedResult> {
  const tenantId = options.tenantId ?? DEFAULT_TENANT;
  const f = await loadFixtures(repoRoot);
  for (const id of Object.keys(FIXTURES) as FixtureId[]) {
    await client.write('MERGE (n:StudioSource {id: $id, tenantId: $tenantId}) SET n += $props', { id, tenantId, props: {
      tenantId, kind: f.files[id].kind, path: f.files[id].path, sha256: f.files[id].sha256, synthetic: true, origin: ORIGIN.kind, licenseStatus: ORIGIN.licenseStatus
    } });
  }
  for (const d of f.departments) {
    await client.write('MERGE (n:Department {id: $id, tenantId: $tenantId}) SET n += $props', { id: departmentId(d.slug), tenantId, props: {
      tenantId, slug: d.slug, name: d.name, kind: d.kind, synthetic: true, sourceId: 'ssrc-departments', line: d.line
    } });
  }
  for (const p of f.crew) {
    await client.write('MERGE (n:StudioPerson {id: $id, tenantId: $tenantId}) SET n += $props', { id: personId(p.slug), tenantId, props: {
      tenantId, slug: p.slug, displayName: p.displayName, role: p.role, departmentId: departmentId(p.departmentSlug), synthetic: true, sourceId: 'ssrc-crew-roster', line: p.line
    } });
  }
  let edges = 0;
  const edge = async (cypher: string, params: Record<string, string | number>) => {
    const rows = await client.write<{ n: number }>(cypher, { ...params, tenantId });
    if (rows[0]?.n !== 1) throw new Error(`Studio edge ${String(params['id'])} endpoints missing`);
    edges++;
  };
  const DEFINED_IN = (label: 'StudioPerson' | 'Department') =>
    `MATCH (a:${label} {id: $from, tenantId: $tenantId}), (b:StudioSource {id: $to, tenantId: $tenantId}) MERGE (a)-[e:DEFINED_IN {id: $id}]->(b) SET e.line = $line, e.excerpt = $excerpt RETURN count(e) AS n`;
  for (const d of f.departments) {
    await edge(DEFINED_IN('Department'), { id: `e-${departmentId(d.slug)}-defined-in`, from: departmentId(d.slug), to: 'ssrc-departments', line: d.line, excerpt: d.excerpt });
  }
  for (const p of f.crew) {
    await edge('MATCH (a:StudioPerson {id: $from, tenantId: $tenantId}), (b:Department {id: $to, tenantId: $tenantId}) MERGE (a)-[e:WORKS_IN {id: $id}]->(b) RETURN count(e) AS n',
      { id: `e-${personId(p.slug)}-works-in`, from: personId(p.slug), to: departmentId(p.departmentSlug) });
    await edge(DEFINED_IN('StudioPerson'), { id: `e-${personId(p.slug)}-defined-in`, from: personId(p.slug), to: 'ssrc-crew-roster', line: p.line, excerpt: p.excerpt });
  }
  return { seedVersion: STUDIO_SEED_VERSION, tenantId, sources: 2, departments: f.departments.length, people: f.crew.length, edges };
}
