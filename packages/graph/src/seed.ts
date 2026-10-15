import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphClient, ParamValue } from './client.js';
import { cueEntryOf, parseCueSheet, scopeOf, subjectOf } from './witness.js';
import { bindingSig, evidenceKeyFromEnv, revisionNumber } from './evidence-key.js';
import { bindingKey, ledgerFromEnv, witnessedWrite, type LedgerConfig } from './state-ledger.js';

/**
 * Synthetic studio seed. Source text lives in graph/seed/sources/. Every excerpt is located in the
 * real file text at seed time; SHA-256 is of the exact file bytes; offsets are Unicode code points,
 * end-exclusive. A missing excerpt aborts the seed (no fabricated reference).
 */
type Label = 'Tenant' | 'Release' | 'Cut' | 'Track' | 'License' | 'Source' | 'SourceRef' | 'Principal';
type RelType = 'HAS_CUT' | 'CURRENT_CUT' | 'SUPERSEDES' | 'LISTED_IN' | 'USES_TRACK' | 'COVERS' | 'VALID_FOR'
  | 'EVIDENCED_BY' | 'EXCERPT_OF' | 'MEMBER_OF';

interface SourceSpec { id: string; file: string; kind: 'cue_sheet' | 'license' | 'email' }
/** Role of an excerpt; structured witness fields are parsed from the excerpt with a strict grammar. */
export type RefRole = 'cue_cut' | 'cue_entry' | 'cue_count' | 'license_subject' | 'license_scope' | 'note';
interface RefSpec { id: string; source: string; role: RefRole; excerpt: string }
interface NodeSpec { label: Exclude<Label, 'Source' | 'SourceRef'>; id: string; props: Record<string, ParamValue> }
interface EdgeSpec { id: string; type: RelType; from: string; to: string; refs?: string[]; props?: Record<string, ParamValue> }

export const SEED_VERSION = 'wad-studio-seed@6';
const TENANT = 't-wad';
const RELEASE = 'rel-wad';

const SOURCES: SourceSpec[] = [
  { id: 'src-cue-v3', file: 'cue-sheet-cut-v3.txt', kind: 'cue_sheet' },
  { id: 'src-cue-v4', file: 'cue-sheet-cut-v4.txt', kind: 'cue_sheet' },
  { id: 'src-lic-night-drive', file: 'license-night-drive.txt', kind: 'license' },
  { id: 'src-mail-basement-hum', file: 'email-basement-hum.txt', kind: 'email' }
];

const REFS: RefSpec[] = [
  { id: 'ref-cue-v3-cut', source: 'src-cue-v3', role: 'cue_cut', excerpt: 'Cut: v3 (festival screener)' },
  { id: 'ref-cue-v3-night-drive', source: 'src-cue-v3', role: 'cue_entry', excerpt: 'Cue 1: "Night Drive"' },
  { id: 'ref-cue-v3-basement-hum', source: 'src-cue-v3', role: 'cue_entry', excerpt: 'Cue 2: "Basement Hum"' },
  { id: 'ref-cue-v3-complete', source: 'src-cue-v3', role: 'cue_count', excerpt: 'END OF CUE SHEET. Complete listing: 2 cues.' },
  { id: 'ref-cue-v4-cut', source: 'src-cue-v4', role: 'cue_cut', excerpt: 'Cut: v4 (current distribution cut)' },
  { id: 'ref-cue-v4-night-drive', source: 'src-cue-v4', role: 'cue_entry', excerpt: 'Cue 1: "Night Drive"' },
  { id: 'ref-cue-v4-basement-hum', source: 'src-cue-v4', role: 'cue_entry', excerpt: 'Cue 2: "Basement Hum"' },
  { id: 'ref-cue-v4-complete', source: 'src-cue-v4', role: 'cue_count', excerpt: 'END OF CUE SHEET. Complete listing: 2 cues.' },
  { id: 'ref-lic-nd-composition', source: 'src-lic-night-drive', role: 'license_subject', excerpt: 'Composition: "Night Drive"' },
  { id: 'ref-lic-nd-grant', source: 'src-lic-night-drive', role: 'license_scope', excerpt: 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).' },
  { id: 'ref-mail-bh-scope', source: 'src-mail-basement-hum', role: 'license_scope', excerpt: 'Confirmed: "Basement Hum" is cleared for WAD Cut v3 (festival screener) only.' },
  { id: 'ref-mail-bh-later', source: 'src-mail-basement-hum', role: 'note', excerpt: 'Any later cut or distribution release requires a new license.' }
];

const NODES: NodeSpec[] = [
  { label: 'Tenant', id: TENANT, props: { name: 'Warnings After Dark Studios (synthetic)' } },
  { label: 'Release', id: 'rel-wad', props: { tenantId: TENANT, title: 'WAD', revision: 'rel-wad@r1' } },
  { label: 'Cut', id: 'cut-wad-v3', props: { tenantId: TENANT, version: 3, label: 'Cut v3 (festival screener)', status: 'SUPERSEDED' } },
  { label: 'Cut', id: 'cut-wad-v4', props: { tenantId: TENANT, version: 4, label: 'Cut v4 (current distribution cut)', status: 'CURRENT' } },
  { label: 'Track', id: 'trk-night-drive', props: { tenantId: TENANT, title: 'Night Drive' } },
  { label: 'Track', id: 'trk-basement-hum', props: { tenantId: TENANT, title: 'Basement Hum' } },
  { label: 'License', id: 'lic-night-drive-v4', props: { tenantId: TENANT, label: 'Night Drive sync license' } },
  { label: 'License', id: 'lic-basement-hum-v3', props: { tenantId: TENANT, label: 'Basement Hum festival clearance (email)' } },
  { label: 'Principal', id: 'kanny', props: { kind: 'human', displayName: 'Kanny' } },
  { label: 'Principal', id: 'serena', props: { kind: 'human', displayName: 'Serena' } },
  { label: 'Principal', id: 'roy', props: { kind: 'agent', displayName: 'Roy' } },
  { label: 'Principal', id: 'ava', props: { kind: 'agent', displayName: 'Ava' } },
  { label: 'Principal', id: 'guz', props: { kind: 'agent', displayName: 'Guz' } }
];

const EDGES: EdgeSpec[] = [
  { id: 'e-rel-hascut-v3', type: 'HAS_CUT', from: 'rel-wad', to: 'cut-wad-v3' },
  { id: 'e-rel-hascut-v4', type: 'HAS_CUT', from: 'rel-wad', to: 'cut-wad-v4' },
  { id: 'e-rel-current-cut', type: 'CURRENT_CUT', from: 'rel-wad', to: 'cut-wad-v4', refs: ['ref-cue-v4-cut'] },
  { id: 'e-v4-supersedes-v3', type: 'SUPERSEDES', from: 'cut-wad-v4', to: 'cut-wad-v3' },
  { id: 'e-v3-listed-in', type: 'LISTED_IN', from: 'cut-wad-v3', to: 'src-cue-v3', refs: ['ref-cue-v3-complete'] },
  { id: 'e-v4-listed-in', type: 'LISTED_IN', from: 'cut-wad-v4', to: 'src-cue-v4', refs: ['ref-cue-v4-complete'] },
  { id: 'e-v3-uses-night-drive', type: 'USES_TRACK', from: 'cut-wad-v3', to: 'trk-night-drive', refs: ['ref-cue-v3-night-drive'] },
  { id: 'e-v3-uses-basement-hum', type: 'USES_TRACK', from: 'cut-wad-v3', to: 'trk-basement-hum', refs: ['ref-cue-v3-basement-hum'] },
  { id: 'e-v4-uses-night-drive', type: 'USES_TRACK', from: 'cut-wad-v4', to: 'trk-night-drive', refs: ['ref-cue-v4-night-drive'] },
  { id: 'e-v4-uses-basement-hum', type: 'USES_TRACK', from: 'cut-wad-v4', to: 'trk-basement-hum', refs: ['ref-cue-v4-basement-hum'] },
  { id: 'e-lic-nd-covers', type: 'COVERS', from: 'lic-night-drive-v4', to: 'trk-night-drive', refs: ['ref-lic-nd-composition'] },
  { id: 'e-lic-nd-valid-v4', type: 'VALID_FOR', from: 'lic-night-drive-v4', to: 'cut-wad-v4', refs: ['ref-lic-nd-grant'] },
  { id: 'e-lic-nd-evidence', type: 'EVIDENCED_BY', from: 'lic-night-drive-v4', to: 'src-lic-night-drive' },
  { id: 'e-lic-bh-covers', type: 'COVERS', from: 'lic-basement-hum-v3', to: 'trk-basement-hum', refs: ['ref-mail-bh-scope'] },
  { id: 'e-lic-bh-valid-v3', type: 'VALID_FOR', from: 'lic-basement-hum-v3', to: 'cut-wad-v3', refs: ['ref-mail-bh-scope', 'ref-mail-bh-later'] },
  { id: 'e-lic-bh-evidence', type: 'EVIDENCED_BY', from: 'lic-basement-hum-v3', to: 'src-mail-basement-hum' },
  { id: 'e-kanny-member', type: 'MEMBER_OF', from: 'kanny', to: TENANT, props: { role: 'OWNER' } },
  { id: 'e-serena-member', type: 'MEMBER_OF', from: 'serena', to: TENANT, props: { role: 'READER' } },
  { id: 'e-roy-member', type: 'MEMBER_OF', from: 'roy', to: TENANT, props: { role: 'AGENT' } },
  { id: 'e-ava-member', type: 'MEMBER_OF', from: 'ava', to: TENANT, props: { role: 'AGENT' } },
  { id: 'e-guz-member', type: 'MEMBER_OF', from: 'guz', to: TENANT, props: { role: 'AGENT' } }
];

/**
 * Optional evidence bundles, applied after the base seed only when requested. They model new source
 * documents arriving later (for example a current-cut license) and bump the release revision.
 */
interface Bundle { sources: SourceSpec[]; refs: RefSpec[]; nodes: NodeSpec[]; edges: EdgeSpec[] }
export const BUNDLES: Record<string, Bundle> = {
  'basement-hum-v4-license': {
    sources: [{ id: 'src-lic-basement-hum-v4', file: 'license-basement-hum-v4.txt', kind: 'license' }],
    refs: [
      { id: 'ref-lic-bh4-composition', source: 'src-lic-basement-hum-v4', role: 'license_subject', excerpt: 'Composition: "Basement Hum"' },
      { id: 'ref-lic-bh4-grant', source: 'src-lic-basement-hum-v4', role: 'license_scope', excerpt: 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).' }
    ],
    nodes: [
      { label: 'License', id: 'lic-basement-hum-v4', props: { tenantId: TENANT, label: 'Basement Hum sync license (v4)' } },
      { label: 'Release', id: 'rel-wad', props: { tenantId: TENANT, title: 'WAD', revision: 'rel-wad@r2' } }
    ],
    edges: [
      { id: 'e-lic-bh4-covers', type: 'COVERS', from: 'lic-basement-hum-v4', to: 'trk-basement-hum', refs: ['ref-lic-bh4-composition'] },
      { id: 'e-lic-bh4-valid-v4', type: 'VALID_FOR', from: 'lic-basement-hum-v4', to: 'cut-wad-v4', refs: ['ref-lic-bh4-grant'] },
      { id: 'e-lic-bh4-evidence', type: 'EVIDENCED_BY', from: 'lic-basement-hum-v4', to: 'src-lic-basement-hum-v4' }
    ]
  }
};

/** Code-point offsets of the first occurrence; throws if absent or ambiguous. */
export function locateExcerpt(text: string, excerpt: string): { startOffset: number; endOffset: number } {
  const at = text.indexOf(excerpt);
  if (at < 0) throw new Error(`Excerpt not found in source text: ${JSON.stringify(excerpt.slice(0, 40))}`);
  if (text.indexOf(excerpt, at + 1) >= 0) throw new Error(`Excerpt is ambiguous in source text: ${JSON.stringify(excerpt.slice(0, 40))}`);
  const startOffset = Array.from(text.slice(0, at)).length;
  return { startOffset, endOffset: startOffset + Array.from(excerpt).length };
}

export { parseCueSheet } from './witness.js';

/** Structured witness fields for one excerpt, by role. Throws when the excerpt does not fit its grammar. */
export function refWitness(role: RefRole, excerpt: string): Record<string, ParamValue> {
  // Seed-time convenience copy of the witness. Analysis never reads these fields; it re-derives
  // them from the verified excerpt text with the same grammars (witness.ts).
  const bad = (what: string) => new Error(`${what} excerpt does not match grammar: ${JSON.stringify(excerpt.slice(0, 40))}`);
  if (role === 'cue_entry') {
    const e = cueEntryOf(excerpt);
    if (!e) throw bad('cue_entry');
    return { cueIndex: e.index, cueTitle: e.title };
  }
  if (role === 'license_subject') {
    const t = subjectOf(excerpt);
    if (t === null) throw bad('license_subject');
    return { subjectTitle: t };
  }
  if (role === 'license_scope') {
    const sc = scopeOf(excerpt);
    if (!sc) throw new Error(`license_scope excerpt must name exactly one cut and at most one title: ${JSON.stringify(excerpt.slice(0, 40))}`);
    return { scopeCutVersion: sc.cutVersion, scopeTitle: sc.title };
  }
  return {};
}

// Tenant-owned labels merge on (id, tenantId) so a same-id node of another tenant is never overwritten.
const NODE_MERGE: Record<NodeSpec['label'] | 'Source' | 'SourceRef', string> = {
  Tenant: 'MERGE (n:Tenant {id: $id}) SET n += $props',
  Release: 'MERGE (n:Release {id: $id, tenantId: $tenantId}) SET n += $props',
  Cut: 'MERGE (n:Cut {id: $id, tenantId: $tenantId}) SET n += $props',
  Track: 'MERGE (n:Track {id: $id, tenantId: $tenantId}) SET n += $props',
  License: 'MERGE (n:License {id: $id, tenantId: $tenantId}) SET n += $props',
  Source: 'MERGE (n:Source {id: $id, tenantId: $tenantId}) SET n += $props',
  SourceRef: 'MERGE (n:SourceRef {id: $id, tenantId: $tenantId}) SET n += $props',
  Principal: 'MERGE (n:Principal {id: $id}) SET n += $props'
};
const TENANT_OWNED = new Set(['Release', 'Cut', 'Track', 'License', 'Source', 'SourceRef']);

type AnyLabel = NodeSpec['label'] | 'Source' | 'SourceRef';

function edgeMerge(labels: Map<string, AnyLabel>, type: RelType, from: string, to: string): string {
  // Labels and type come from the fixed manifest above, never from input; endpoints matched by label + id.
  const la = labels.get(from);
  const lb = labels.get(to);
  if (!la || !lb) throw new Error(`Edge endpoint not declared in seed: ${!la ? from : to}`);
  const ta = TENANT_OWNED.has(la) ? ', tenantId: $tenantId' : '';
  const tb = TENANT_OWNED.has(lb) ? ', tenantId: $tenantId' : '';
  return `MATCH (a:${la} {id: $from${ta}}), (b:${lb} {id: $to${tb}}) MERGE (a)-[e:${type} {id: $id}]->(b) SET e += $props RETURN count(e) AS n`;
}

export interface SeedResult { seedVersion: string; sources: number; refs: number; nodes: number; edges: number }

export interface SeedOptions {
  bundles?: string[];
  /** Server evidence key used to sign EVIDENCED_BY / LISTED_IN bindings. Default: GRAPH_EVIDENCE_KEY. */
  evidenceKey?: Buffer | null;
  /** Evidence state witness. Default: GRAPH_WITNESS_DIR + evidence key. Required (seeding without one is refused). */
  witness?: LedgerConfig | null;
  /** Create a new witness chain (explicit; refused if one exists). */
  initWitness?: boolean;
  /** Finish this same seed after a crash left the witness PENDING. */
  resumeWitness?: boolean;
  /** Operator override: allow the release revision to go backwards (never a default). */
  allowRevisionRollback?: boolean;
  /** Operator re-grant: lift these revocation tombstones (binding keys) in this write. */
  reinstate?: string[];
}

export async function seedGraph(client: GraphClient, repoRoot: string, options: SeedOptions = {}): Promise<SeedResult> {
  const chosen = (options.bundles ?? []).map(name => {
    const b = BUNDLES[name];
    if (!b) throw new Error(`Unknown seed bundle: ${name}`);
    return b;
  });
  const SOURCES_ALL = [...SOURCES, ...chosen.flatMap(b => b.sources)];
  const REFS_ALL = [...REFS, ...chosen.flatMap(b => b.refs)];
  const NODES_ALL = [...NODES, ...chosen.flatMap(b => b.nodes)];
  const EDGES_ALL = [...EDGES, ...chosen.flatMap(b => b.edges)];
  const labels = new Map<string, AnyLabel>([
    ...NODES_ALL.map(n => [n.id, n.label] as [string, AnyLabel]),
    ...SOURCES_ALL.map(x => [x.id, 'Source'] as [string, AnyLabel]),
    ...REFS_ALL.map(r => [r.id, 'SourceRef'] as [string, AnyLabel])
  ]);
  // Bindings are recorded at the release revision this seed (with its bundles) produces.
  const releaseRevision = [...NODES_ALL].reverse().find(n => n.label === 'Release' && n.id === RELEASE)?.props['revision'];
  const rev = revisionNumber(RELEASE, releaseRevision);
  if (rev === null) throw new Error(`Seed release ${RELEASE} has no valid revision`);
  const key = options.evidenceKey !== undefined ? options.evidenceKey : evidenceKeyFromEnv();
  if (!key) throw new Error('GRAPH_EVIDENCE_KEY (32+ characters) is required to seed signed evidence bindings');
  const witness = options.witness !== undefined ? options.witness : ledgerFromEnv(key);
  // Overrides are visible in the ledger: the intent names them.
  const intent = `seed:${SEED_VERSION}:${(options.bundles ?? []).join('+') || 'base'}`
    + (options.allowRevisionRollback ? '+allow-revision-rollback' : '') + ((options.reinstate ?? []).length > 0 ? '+reinstate' : '');
  // What this seed will write, checked against the witness before any graph change: the release revision
  // (never backwards) and the evidence bindings (never a revoked one).
  const plannedFiles = new Map<string, { path: string; sha256: string }>();
  for (const src of SOURCES_ALL) {
    const bytes = await readFile(join(repoRoot, 'graph', 'seed', 'sources', src.file));
    plannedFiles.set(src.id, { path: `graph/seed/sources/${src.file}`, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const plannedBindings = EDGES_ALL.filter(e => e.type === 'EVIDENCED_BY' || e.type === 'LISTED_IN')
    .map(e => bindingKey(e.type, e.from, plannedFiles.get(e.to)?.path));
  const edges = await witnessedWrite(client, witness, TENANT, intent, async () => {
    const sourceDir = join(repoRoot, 'graph', 'seed', 'sources');
    const texts = new Map<string, string>();
    const fileOf = new Map<string, { path: string; sha256: string }>();
    for (const s of SOURCES_ALL) {
      const bytes = await readFile(join(sourceDir, s.file));
      texts.set(s.id, bytes.toString('utf8'));
      const text = bytes.toString('utf8');
      let cueWitness: Record<string, ParamValue> = { complete: false };
      if (s.kind === 'cue_sheet') {
        const cue = parseCueSheet(text);
        // Every cue line in the file must be cited by a cue_entry excerpt, or the seed is incomplete.
        const cited = new Set(REFS_ALL.filter(r => r.source === s.id && r.role === 'cue_entry').map(r => r.excerpt));
        for (const e of cue.entries) {
          if (!cited.has(`Cue ${e.index}: "${e.title}"`)) throw new Error(`Seed manifest misses cue ${e.index} of ${s.id}`);
        }
        cueWitness = { complete: cue.complete, cutVersion: cue.cutVersion, declaredCueCount: cue.declaredCueCount, cueEntryCount: cue.entries.length };
      }
      const path = `graph/seed/sources/${s.file}`;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      fileOf.set(s.id, { path, sha256 });
      await client.write(NODE_MERGE.Source, { id: s.id, tenantId: TENANT, props: {
        tenantId: TENANT, kind: s.kind, path, sha256, offsetUnit: 'unicode-code-point', ...cueWitness
      } });
    }
    for (const r of REFS_ALL) {
      const text = texts.get(r.source);
      if (text === undefined) throw new Error(`Unknown source ${r.source}`);
      const { startOffset, endOffset } = locateExcerpt(text, r.excerpt);
      await client.write(NODE_MERGE.SourceRef, { id: r.id, tenantId: TENANT, props: {
        tenantId: TENANT, sourceId: r.source, role: r.role, excerpt: r.excerpt, startOffset, endOffset, ...refWitness(r.role, r.excerpt)
      } });
    }
    for (const n of NODES_ALL) await client.write(NODE_MERGE[n.label], { id: n.id, tenantId: TENANT, props: n.props });
    let edges = 0;
    const all: EdgeSpec[] = [
      ...EDGES_ALL,
      ...REFS_ALL.map(r => ({ id: `e-${r.id}-excerpt-of`, type: 'EXCERPT_OF' as const, from: r.id, to: r.source }))
    ];
    for (const e of all) {
      for (const ref of e.refs ?? []) if (!REFS_ALL.some(r => r.id === ref)) throw new Error(`Edge ${e.id} cites unknown ref ${ref}`);
      const props: Record<string, ParamValue> = { ...(e.props ?? {}), sourceRefIds: e.refs ?? [] };
      if (e.type === 'EVIDENCED_BY' || e.type === 'LISTED_IN') {
        const f = fileOf.get(e.to);
        if (!f) throw new Error(`Binding ${e.id} targets an undeclared source`);
        // The signature covers the whole claim: what the license covers and is valid for, at this revision.
        const tracks = e.type === 'EVIDENCED_BY' ? EDGES_ALL.filter(x => x.type === 'COVERS' && x.from === e.from).map(x => x.to).sort() : [];
        const cuts = e.type === 'EVIDENCED_BY' ? EDGES_ALL.filter(x => x.type === 'VALID_FOR' && x.from === e.from).map(x => x.to).sort() : [e.from];
        props['rev'] = rev;
        props['tracks'] = tracks;
        props['cuts'] = cuts;
        props['sig'] = bindingSig(key, { kind: e.type, tenantId: TENANT, releaseId: RELEASE, subjectId: e.from, path: f.path, sha256: f.sha256, rev, tracks, cuts });
      }
      const rows = await client.write<{ n: number }>(edgeMerge(labels, e.type, e.from, e.to), { id: e.id, from: e.from, to: e.to, tenantId: TENANT, props });
      if (rows[0]?.n !== 1) throw new Error(`Edge ${e.id} endpoints missing`);
      edges++;
    }
    return edges;
  }, {
    init: options.initWitness === true, resume: options.resumeWitness === true,
    planned: { revisions: { [RELEASE]: String(releaseRevision) }, bindings: plannedBindings },
    allowRevisionRollback: options.allowRevisionRollback === true, ...(options.reinstate ? { reinstate: options.reinstate } : {})
  });
  return { seedVersion: SEED_VERSION, sources: SOURCES_ALL.length, refs: REFS_ALL.length, nodes: new Set(labels.keys()).size, edges };
}
