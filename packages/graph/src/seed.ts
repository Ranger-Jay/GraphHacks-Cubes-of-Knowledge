import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphClient, ParamValue } from './client.js';

/**
 * Synthetic studio seed. Source text lives in graph/seed/sources/. Every excerpt is located in the
 * real file text at seed time; SHA-256 is of the exact file bytes; offsets are Unicode code points,
 * end-exclusive. A missing excerpt aborts the seed (no fabricated reference).
 */
type Label = 'Tenant' | 'Release' | 'Cut' | 'Track' | 'License' | 'Source' | 'SourceRef' | 'Principal';
type RelType = 'HAS_CUT' | 'CURRENT_CUT' | 'SUPERSEDES' | 'LISTED_IN' | 'USES_TRACK' | 'COVERS' | 'VALID_FOR'
  | 'EVIDENCED_BY' | 'EXCERPT_OF' | 'MEMBER_OF';

interface SourceSpec { id: string; file: string; kind: 'cue_sheet' | 'license' | 'email'; complete?: boolean }
interface RefSpec { id: string; source: string; excerpt: string }
interface NodeSpec { label: Exclude<Label, 'Source' | 'SourceRef'>; id: string; props: Record<string, ParamValue> }
interface EdgeSpec { id: string; type: RelType; from: string; to: string; refs?: string[]; props?: Record<string, ParamValue> }

export const SEED_VERSION = 'wad-studio-seed@1';
const TENANT = 't-wad';

const SOURCES: SourceSpec[] = [
  { id: 'src-cue-v3', file: 'cue-sheet-cut-v3.txt', kind: 'cue_sheet', complete: true },
  { id: 'src-cue-v4', file: 'cue-sheet-cut-v4.txt', kind: 'cue_sheet', complete: true },
  { id: 'src-lic-night-drive', file: 'license-night-drive.txt', kind: 'license' },
  { id: 'src-mail-basement-hum', file: 'email-basement-hum.txt', kind: 'email' }
];

const REFS: RefSpec[] = [
  { id: 'ref-cue-v3-cut', source: 'src-cue-v3', excerpt: 'Cut: v3 (festival screener)' },
  { id: 'ref-cue-v3-night-drive', source: 'src-cue-v3', excerpt: 'Cue 1: "Night Drive"' },
  { id: 'ref-cue-v3-basement-hum', source: 'src-cue-v3', excerpt: 'Cue 2: "Basement Hum"' },
  { id: 'ref-cue-v3-complete', source: 'src-cue-v3', excerpt: 'END OF CUE SHEET. Complete listing: 2 cues.' },
  { id: 'ref-cue-v4-cut', source: 'src-cue-v4', excerpt: 'Cut: v4 (current distribution cut)' },
  { id: 'ref-cue-v4-night-drive', source: 'src-cue-v4', excerpt: 'Cue 1: "Night Drive"' },
  { id: 'ref-cue-v4-basement-hum', source: 'src-cue-v4', excerpt: 'Cue 2: "Basement Hum"' },
  { id: 'ref-cue-v4-complete', source: 'src-cue-v4', excerpt: 'END OF CUE SHEET. Complete listing: 2 cues.' },
  { id: 'ref-lic-nd-composition', source: 'src-lic-night-drive', excerpt: 'Composition: "Night Drive"' },
  { id: 'ref-lic-nd-grant', source: 'src-lic-night-drive', excerpt: 'Grant: Synchronization rights for the motion picture WAD, Cut v4 (current distribution cut).' },
  { id: 'ref-mail-bh-scope', source: 'src-mail-basement-hum', excerpt: 'Confirmed: "Basement Hum" is cleared for WAD Cut v3 (festival screener) only.' },
  { id: 'ref-mail-bh-later', source: 'src-mail-basement-hum', excerpt: 'Any later cut or distribution release requires a new license.' }
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

/** Code-point offsets of the first occurrence; throws if absent or ambiguous. */
export function locateExcerpt(text: string, excerpt: string): { startOffset: number; endOffset: number } {
  const at = text.indexOf(excerpt);
  if (at < 0) throw new Error(`Excerpt not found in source text: ${JSON.stringify(excerpt.slice(0, 40))}`);
  if (text.indexOf(excerpt, at + 1) >= 0) throw new Error(`Excerpt is ambiguous in source text: ${JSON.stringify(excerpt.slice(0, 40))}`);
  const startOffset = Array.from(text.slice(0, at)).length;
  return { startOffset, endOffset: startOffset + Array.from(excerpt).length };
}

const NODE_MERGE: Record<NodeSpec['label'] | 'Source' | 'SourceRef', string> = {
  Tenant: 'MERGE (n:Tenant {id: $id}) SET n += $props',
  Release: 'MERGE (n:Release {id: $id}) SET n += $props',
  Cut: 'MERGE (n:Cut {id: $id}) SET n += $props',
  Track: 'MERGE (n:Track {id: $id}) SET n += $props',
  License: 'MERGE (n:License {id: $id}) SET n += $props',
  Source: 'MERGE (n:Source {id: $id}) SET n += $props',
  SourceRef: 'MERGE (n:SourceRef {id: $id}) SET n += $props',
  Principal: 'MERGE (n:Principal {id: $id}) SET n += $props'
};

function edgeMerge(type: RelType): string {
  // type comes from the RelType allowlist above, never from input.
  return `MATCH (a {id: $from}), (b {id: $to}) MERGE (a)-[e:${type} {id: $id}]->(b) SET e += $props RETURN count(e) AS n`;
}

export interface SeedResult { seedVersion: string; sources: number; refs: number; nodes: number; edges: number }

export async function seedGraph(client: GraphClient, repoRoot: string): Promise<SeedResult> {
  const sourceDir = join(repoRoot, 'graph', 'seed', 'sources');
  const texts = new Map<string, string>();
  for (const s of SOURCES) {
    const bytes = await readFile(join(sourceDir, s.file));
    texts.set(s.id, bytes.toString('utf8'));
    await client.write(NODE_MERGE.Source, { id: s.id, props: {
      tenantId: TENANT, kind: s.kind, path: `graph/seed/sources/${s.file}`,
      sha256: createHash('sha256').update(bytes).digest('hex'), complete: s.complete ?? false, offsetUnit: 'unicode-code-point'
    } });
  }
  for (const r of REFS) {
    const text = texts.get(r.source);
    if (text === undefined) throw new Error(`Unknown source ${r.source}`);
    const { startOffset, endOffset } = locateExcerpt(text, r.excerpt);
    await client.write(NODE_MERGE.SourceRef, { id: r.id, props: { tenantId: TENANT, sourceId: r.source, excerpt: r.excerpt, startOffset, endOffset } });
  }
  for (const n of NODES) await client.write(NODE_MERGE[n.label], { id: n.id, props: n.props });
  let edges = 0;
  const all: EdgeSpec[] = [
    ...EDGES,
    ...REFS.map(r => ({ id: `e-${r.id}-excerpt-of`, type: 'EXCERPT_OF' as const, from: r.id, to: r.source }))
  ];
  for (const e of all) {
    for (const ref of e.refs ?? []) if (!REFS.some(r => r.id === ref)) throw new Error(`Edge ${e.id} cites unknown ref ${ref}`);
    const rows = await client.write<{ n: number }>(edgeMerge(e.type), { id: e.id, from: e.from, to: e.to, props: { ...(e.props ?? {}), sourceRefIds: e.refs ?? [] } });
    if (rows[0]?.n !== 1) throw new Error(`Edge ${e.id} endpoints missing`);
    edges++;
  }
  return { seedVersion: SEED_VERSION, sources: SOURCES.length, refs: REFS.length, nodes: NODES.length + SOURCES.length + REFS.length, edges };
}
