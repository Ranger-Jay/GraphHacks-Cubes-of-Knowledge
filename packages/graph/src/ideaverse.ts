import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { GraphClient } from './client.js';
import { GraphUnavailableError } from './client.js';

/**
 * IdeaVerse metadata and the persisted "Add to cube" import (issues #38, #40).
 *
 * Domain boundary: IdeaFile, Workspace and ImportReceipt are studio labels, outside the licensing
 * evidence witness. The workspace revision is its own counter and never touches a release revision.
 * An idea is a fictional proposal, not a fact, a license or an approval; importing one changes no
 * clearance result. Tenant and actor come from the caller (the server), never from a request body.
 */
export const IDEAVERSE_SEED_VERSION = 'wad-ideaverse@1';
export const DEFAULT_MANIFEST = 'graph/seed/ideaverse/manifest.json';
export const WORKSPACE_ID = 'ws-wad-cube';
const FILES_DIR = 'graph/seed/ideaverse/files/';
const DEFAULT_TENANT = 't-wad';
const MANIFEST_SOURCE_ID = 'ssrc-ideaverse-manifest';
const MAX_WORDS = 30;

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILENAME = /^[a-z0-9][a-z0-9._-]{0,80}\.txt$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const KEY = /^[A-Za-z0-9_-]{8,64}$/;

export interface IdeaManifestEntry {
  id: string; filename: string; path: string; byteCount: number; sha256: string;
  submittedAt: string; touchedAt: string; synthetic: true; origin: string; licenseStatus: string;
}
export interface IdeaManifest { version: string; manifestSha256: string; manifestPath: string; ideas: IdeaManifestEntry[] }

const validUtc = (s: unknown): s is string => typeof s === 'string' && UTC.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Strict manifest loader. Each idea file must exist under the allowlisted directory, match its
 * recorded byte count and SHA-256, be UTF-8 text of at most 30 words with no control characters.
 * Throws on any violation: a manifest that does not verify is never partially trusted.
 */
export async function loadIdeaManifest(repoRoot: string, manifestPath: string = DEFAULT_MANIFEST): Promise<IdeaManifest> {
  const raw = await readFile(join(repoRoot, manifestPath));
  const doc = JSON.parse(raw.toString('utf8')) as { version?: unknown; ideas?: unknown };
  if (typeof doc.version !== 'string' || !Array.isArray(doc.ideas) || doc.ideas.length === 0) throw new Error('manifest: version and a non-empty ideas list are required');
  const base = resolve(repoRoot, FILES_DIR);
  const seen = new Set<string>(); const files = new Set<string>(); const ideas: IdeaManifestEntry[] = [];
  for (const e of doc.ideas as Record<string, unknown>[]) {
    const { id, filename, path, byteCount, sha256, submittedAt, touchedAt, synthetic, origin, licenseStatus } = e;
    if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) throw new Error(`manifest: invalid or duplicate id ${String(id)}`);
    seen.add(id);
    if (typeof filename !== 'string' || !FILENAME.test(filename) || files.has(filename)) throw new Error(`manifest ${id}: unsafe or duplicate filename`);
    files.add(filename);
    if (path !== `${FILES_DIR}${filename}`) throw new Error(`manifest ${id}: path must be ${FILES_DIR}<filename>`);
    if (!validUtc(submittedAt) || !validUtc(touchedAt)) throw new Error(`manifest ${id}: timestamps must be explicit UTC`);
    if (synthetic !== true) throw new Error(`manifest ${id}: synthetic must be true`);
    if (typeof origin !== 'string' || typeof licenseStatus !== 'string' || typeof sha256 !== 'string' || typeof byteCount !== 'number') throw new Error(`manifest ${id}: missing fields`);
    const abs = resolve(repoRoot, path);
    if (!abs.startsWith(base + sep)) throw new Error(`manifest ${id}: path escapes the idea directory`);
    const bytes = await readFile(abs);
    if (bytes.length !== byteCount) throw new Error(`manifest ${id}: byte count differs from the file`);
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`manifest ${id}: hash differs from the file`);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error(`manifest ${id}: control characters in text`);
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (words === 0 || words > MAX_WORDS) throw new Error(`manifest ${id}: ${words} words (1-${MAX_WORDS} allowed)`);
    ideas.push({ id, filename, path, byteCount, sha256, submittedAt, touchedAt, synthetic: true, origin, licenseStatus });
  }
  return { version: doc.version, manifestSha256: createHash('sha256').update(raw).digest('hex'), manifestPath, ideas };
}

export interface IdeaverseSeedResult { seedVersion: string; tenantId: string; ideas: number; workspaceRevision: number; edges: number }

/**
 * Idempotent MERGE of idea metadata plus the workspace node. The workspace revision is set only on
 * creation: a re-seed never resets it and never touches imported membership. Idea metadata is
 * refreshed from the manifest, so a re-seed cannot un-import an idea or alter a receipt.
 */
export async function seedIdeaverse(client: GraphClient, repoRoot: string, options: { tenantId?: string; manifestPath?: string } = {}): Promise<IdeaverseSeedResult> {
  const tenantId = options.tenantId ?? DEFAULT_TENANT;
  const m = await loadIdeaManifest(repoRoot, options.manifestPath);
  // An imported idea's content is what its receipt names. Changing the file under an imported id would
  // make unreviewed content look imported, so a re-seed refuses; publish changed content under a new id.
  // Sent as a write-mode call (read-only Cypher): a read-only call errors on a graph that does not exist yet.
  const imported = await client.write<{ ideaId: string; sha256: string }>('MATCH (r:ImportReceipt {tenantId: $tenantId}) RETURN r.ideaId AS ideaId, r.sha256 AS sha256', { tenantId });
  const changed = m.ideas.filter(i => imported.some(r => r.ideaId === i.id && r.sha256 !== i.sha256)).map(i => i.id);
  if (changed.length > 0) throw new Error(`Refusing to re-seed: imported idea content changed (${changed.join(', ')}). Use a new idea id for changed content.`);
  await client.write('MERGE (n:StudioSource {id: $id, tenantId: $tenantId}) SET n += $props', { id: MANIFEST_SOURCE_ID, tenantId, props: {
    tenantId, kind: 'ideaverse_manifest', path: m.manifestPath, sha256: m.manifestSha256, synthetic: true, origin: 'project-authored synthetic fixture', licenseStatus: 'none claimed'
  } });
  await client.write('MERGE (w:Workspace {id: $id, tenantId: $tenantId}) ON CREATE SET w.revision = 0, w.name = $name, w.synthetic = true', { id: WORKSPACE_ID, tenantId, name: 'Warnings After Dark cube workspace' });
  let edges = 0;
  for (const i of m.ideas) {
    await client.write('MERGE (n:IdeaFile {id: $id, tenantId: $tenantId}) SET n += $props', { id: i.id, tenantId, props: {
      tenantId, filename: i.filename, path: i.path, byteCount: i.byteCount, sha256: i.sha256, submittedAt: i.submittedAt, touchedAt: i.touchedAt,
      synthetic: true, classification: 'proposal', origin: i.origin, licenseStatus: i.licenseStatus, sourceId: MANIFEST_SOURCE_ID
    } });
    const rows = await client.write<{ n: number }>('MATCH (a:IdeaFile {id: $from, tenantId: $tenantId}), (b:StudioSource {id: $to, tenantId: $tenantId}) MERGE (a)-[e:DEFINED_IN {id: $id}]->(b) RETURN count(e) AS n',
      { id: `e-${i.id}-defined-in`, from: i.id, to: MANIFEST_SOURCE_ID, tenantId });
    if (rows[0]?.n !== 1) throw new Error(`IdeaFile edge ${i.id} endpoints missing`);
    edges++;
  }
  const rev = (await client.read<{ r: number }>('MATCH (w:Workspace {id: $id, tenantId: $tenantId}) RETURN w.revision AS r', { id: WORKSPACE_ID, tenantId }))[0]?.r ?? -1;
  return { seedVersion: IDEAVERSE_SEED_VERSION, tenantId, ideas: m.ideas.length, workspaceRevision: rev, edges };
}

export interface ImportReceipt { ideaId: string; sha256: string; workspaceId: string; importedAt: string; workspaceRevision: number; membershipId: string }
export interface ImportRequest { tenantId: string; ideaId: string; idempotencyKey: string; expectedRevision: number }
export type ImportResult =
  | { status: 'IMPORTED'; replayed: boolean; receipt: ImportReceipt }
  | { status: 'CONFLICT'; reason: 'KEY_REUSED' | 'STALE_REVISION' | 'ALREADY_IMPORTED'; currentRevision?: number; receipt?: ImportReceipt }
  | { status: 'REJECTED'; reason: 'INVALID_REQUEST' | 'UNKNOWN_IDEA' | 'SOURCE_MISMATCH' | 'NOT_SEEDED' }
  | { status: 'UNAVAILABLE'; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'MANIFEST_INVALID' };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const RECEIPT_FIELDS = 'r.ideaId AS ideaId, r.sha256 AS sha256, r.workspaceId AS workspaceId, r.importedAt AS importedAt, r.workspaceRevision AS workspaceRevision, r.membershipId AS membershipId, r.fingerprint AS fingerprint';

/**
 * ONE write query. Every precondition is a guard of the same statement that bumps the revision and
 * creates the receipt and the membership edge: tenant on both endpoints, expected workspace revision,
 * every stored field the overview checks (hash, filename, size, timestamps) equal to the verified
 * manifest, idea not yet a member, key not yet used. The graph serializes writes, so concurrent
 * requests cannot both pass the guards. No row means nothing changed.
 */
export const IMPORT_WRITE_QUERY = `
MATCH (w:Workspace {id: $workspaceId, tenantId: $tenantId}), (i:IdeaFile {id: $ideaId, tenantId: $tenantId})
WHERE w.revision = $expectedRevision AND i.sha256 = $sha256 AND i.filename = $filename AND i.byteCount = $byteCount
  AND i.submittedAt = $submittedAt AND i.touchedAt = $touchedAt AND NOT (i)-[:IMPORTED_INTO]->(w)
OPTIONAL MATCH (x:ImportReceipt {tenantId: $tenantId, keyHash: $keyHash})
WITH w, i, x WHERE x IS NULL
SET w.revision = w.revision + 1
CREATE (r:ImportReceipt {id: $receiptId, tenantId: $tenantId, keyHash: $keyHash, fingerprint: $fingerprint, ideaId: $ideaId, sha256: $sha256,
  workspaceId: $workspaceId, importedAt: $importedAt, workspaceRevision: w.revision, membershipId: $membershipId, synthetic: true})
CREATE (i)-[:IMPORTED_INTO {id: $membershipId, receiptId: $receiptId}]->(w)
RETURN r.ideaId AS ideaId, r.sha256 AS sha256, r.workspaceId AS workspaceId, r.importedAt AS importedAt, r.workspaceRevision AS workspaceRevision, r.membershipId AS membershipId`;

type ReceiptRow = ImportReceipt & { fingerprint?: string };
const toReceipt = (r: ReceiptRow): ImportReceipt => ({ ideaId: r.ideaId, sha256: r.sha256, workspaceId: r.workspaceId, importedAt: r.importedAt, workspaceRevision: r.workspaceRevision, membershipId: r.membershipId });

async function receiptByKey(client: GraphClient, tenantId: string, keyHash: string): Promise<ReceiptRow | null> {
  return (await client.read<ReceiptRow>(`MATCH (r:ImportReceipt {tenantId: $tenantId, keyHash: $keyHash}) RETURN ${RECEIPT_FIELDS}`, { tenantId, keyHash }))[0] ?? null;
}

/**
 * Persisted import of one reviewed idea into the cube workspace. Returns a receipt only for a write
 * that is durably in the graph (or a replay of one). The caller (API) has already authenticated an
 * owner; this function trusts nothing from the idea file or the graph without verifying it.
 */
export async function importIdea(client: GraphClient, repoRoot: string, req: ImportRequest, options: { now?: () => Date; manifestPath?: string } = {}): Promise<ImportResult> {
  if (!ID.test(req.ideaId) || !KEY.test(req.idempotencyKey) || !Number.isInteger(req.expectedRevision) || req.expectedRevision < 0 || !req.tenantId) return { status: 'REJECTED', reason: 'INVALID_REQUEST' };
  let manifest: IdeaManifest;
  try { manifest = await loadIdeaManifest(repoRoot, options.manifestPath); } catch { return { status: 'UNAVAILABLE', reason: 'MANIFEST_INVALID' }; }
  const idea = manifest.ideas.find(i => i.id === req.ideaId);
  if (!idea) return { status: 'REJECTED', reason: 'UNKNOWN_IDEA' };
  const keyHash = sha(`${req.tenantId}\n${req.idempotencyKey}`);
  const fingerprint = sha(JSON.stringify([req.tenantId, WORKSPACE_ID, idea.id, idea.sha256, req.expectedRevision]));
  const receiptId = `rcpt-${keyHash.slice(0, 24)}`;
  const membershipId = memberIdOf(idea.id);
  const settle = (existing: ReceiptRow | null): ImportResult | null => existing
    ? (existing.fingerprint === fingerprint ? { status: 'IMPORTED', replayed: true, receipt: toReceipt(existing) } : { status: 'CONFLICT', reason: 'KEY_REUSED' })
    : null;
  try {
    const replay = settle(await receiptByKey(client, req.tenantId, keyHash));
    if (replay) return replay;
    const importedAt = (options.now?.() ?? new Date()).toISOString();
    const rows = await client.write<ImportReceipt>(IMPORT_WRITE_QUERY, {
      tenantId: req.tenantId, workspaceId: WORKSPACE_ID, ideaId: idea.id, sha256: idea.sha256, expectedRevision: req.expectedRevision,
      keyHash, receiptId, fingerprint, importedAt, membershipId,
      filename: idea.filename, byteCount: idea.byteCount, submittedAt: idea.submittedAt, touchedAt: idea.touchedAt
    });
    if (rows[0]) return { status: 'IMPORTED', replayed: false, receipt: toReceipt(rows[0] as ReceiptRow) };
    // No row: nothing changed. Classify why from a fresh read.
    const raced = settle(await receiptByKey(client, req.tenantId, keyHash));
    if (raced) return raced;
    const state = await client.read<{ revision: number | null; props: Record<string, unknown> | null; exists: boolean }>(
      `OPTIONAL MATCH (w:Workspace {id: $workspaceId, tenantId: $tenantId})
       OPTIONAL MATCH (i:IdeaFile {id: $ideaId, tenantId: $tenantId})
       RETURN w.revision AS revision, properties(i) AS props, (w IS NOT NULL AND i IS NOT NULL) AS exists`, { workspaceId: WORKSPACE_ID, ideaId: idea.id, tenantId: req.tenantId });
    const s = state[0];
    if (!s || !s.exists) return { status: 'REJECTED', reason: 'NOT_SEEDED' };
    const p = s.props ?? {};
    if (p['sha256'] !== idea.sha256 || p['filename'] !== idea.filename || p['byteCount'] !== idea.byteCount || p['submittedAt'] !== idea.submittedAt || p['touchedAt'] !== idea.touchedAt) return { status: 'REJECTED', reason: 'SOURCE_MISMATCH' };
    const member = (await client.read<ReceiptRow>(
      `MATCH (:IdeaFile {id: $ideaId, tenantId: $tenantId})-[m:IMPORTED_INTO]->(:Workspace {id: $workspaceId, tenantId: $tenantId})
       MATCH (r:ImportReceipt {tenantId: $tenantId, membershipId: m.id}) RETURN ${RECEIPT_FIELDS}`, { ideaId: idea.id, tenantId: req.tenantId, workspaceId: WORKSPACE_ID }))[0];
    if (member) return { status: 'CONFLICT', reason: 'ALREADY_IMPORTED', receipt: toReceipt(member) };
    return { status: 'CONFLICT', reason: 'STALE_REVISION', ...(s.revision !== null ? { currentRevision: s.revision } : {}) };
  } catch (err) {
    if (err instanceof GraphUnavailableError) return { status: 'UNAVAILABLE', reason: err.reason };
    throw err;
  }
}

/** Reconcile an ambiguous attempt: the persisted receipt for this key, if any. Same tenant-scoped key hash as importIdea. */
export async function importStatus(client: GraphClient, tenantId: string, idempotencyKey: string): Promise<{ status: 'IMPORTED'; receipt: ImportReceipt } | { status: 'NOT_FOUND' } | { status: 'UNAVAILABLE'; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' } | { status: 'REJECTED'; reason: 'INVALID_REQUEST' }> {
  if (!KEY.test(idempotencyKey) || !tenantId) return { status: 'REJECTED', reason: 'INVALID_REQUEST' };
  try {
    const r = await receiptByKey(client, tenantId, sha(`${tenantId}\n${idempotencyKey}`));
    return r ? { status: 'IMPORTED', receipt: toReceipt(r) } : { status: 'NOT_FOUND' };
  } catch (err) {
    if (err instanceof GraphUnavailableError) return { status: 'UNAVAILABLE', reason: err.reason };
    throw err;
  }
}

export interface IdeaverseIdea { id: string; filename: string; sha256: string; byteCount: number; submittedAt: string; touchedAt: string; synthetic: true; classification: 'proposal'; imported: boolean; importedAt?: string; membershipId?: string }
export type IdeaverseOverview =
  | { status: 'AVAILABLE'; tenantId: string; domain: 'studio'; workspace: { id: string; revision: number | null }; ideas: IdeaverseIdea[]; counts: { ideas: number; imported: number }; integrity: { id: string; reason: string }[] }
  | { status: 'EMPTY'; tenantId: string; domain: 'studio' }
  | { status: 'UNAVAILABLE'; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'MANIFEST_INVALID' };

const memberIdOf = (ideaId: string) => `member-${WORKSPACE_ID}-${ideaId}`;

/**
 * Why an idea's import state cannot be trusted, or null when it is exactly one consistent membership
 * and one matching receipt (or neither). An idea is "imported" only when ALL of these hold: one
 * IMPORTED_INTO edge with the id this idea's import writes, one receipt for the idea, the edge's
 * receiptId is that receipt, the receipt names the same membership, workspace and idea, its hash equals
 * the CURRENT verified manifest hash, and its timestamp and revision are well formed.
 */
function importIntegrity(ideaId: string, manifestSha: string, workspaceRevision: number, edges: { id: string; receiptId: unknown }[], receipts: Record<string, unknown>[]): string | null {
  if (edges.length === 0 && receipts.length === 0) return null;
  if (edges.length > 1) return 'duplicate membership edges';
  if (receipts.length > 1) return 'duplicate import receipts';
  if (edges.length === 0) return 'import receipt without a membership edge';
  if (receipts.length === 0) return 'membership edge without an import receipt';
  const e = edges[0]!; const r = receipts[0]!;
  if (e.id !== memberIdOf(ideaId) || r['membershipId'] !== e.id || r['id'] !== e.receiptId) return 'membership edge and receipt do not match';
  if (r['ideaId'] !== ideaId || r['workspaceId'] !== WORKSPACE_ID) return 'receipt names a different idea or workspace';
  if (r['sha256'] !== manifestSha) return 'imported content differs from the current manifest';
  const rev = r['workspaceRevision'];
  if (typeof r['importedAt'] !== 'string' || !UTC.test(r['importedAt']) || typeof rev !== 'number' || !Number.isInteger(rev) || rev < 1 || rev > workspaceRevision) return 'receipt timestamp or revision is invalid';
  return null;
}

/**
 * Read of the tenant's idea metadata and import membership in one query, re-verified against the
 * manifest. The comet pool excludes `imported` ideas. An idea whose metadata differs from the manifest,
 * or whose import state is not exactly one consistent receipt and membership (receipt-less, duplicated,
 * stale-content), is withheld with an integrity item rather than served or counted.
 */
export async function ideaverseOverview(client: GraphClient, repoRoot: string, tenantId: string, options: { manifestPath?: string } = {}): Promise<IdeaverseOverview> {
  let rows: { iid: number | null; wid: number; revision: number; id: string | null; props: Record<string, unknown> | null; edges: [unknown, unknown][]; receipts: Record<string, unknown>[] }[];
  try {
    rows = await client.read(`
MATCH (w:Workspace {id: $workspaceId, tenantId: $tenantId})
OPTIONAL MATCH (i:IdeaFile {tenantId: $tenantId})
OPTIONAL MATCH (i)-[m:IMPORTED_INTO]->(w)
WITH w, i, collect([m.id, m.receiptId]) AS edges
OPTIONAL MATCH (r:ImportReceipt {tenantId: $tenantId, ideaId: i.id})
RETURN id(w) AS wid, id(i) AS iid, w.revision AS revision, i.id AS id, properties(i) AS props, edges, collect(properties(r)) AS receipts`, { workspaceId: WORKSPACE_ID, tenantId });
  } catch (err) {
    if (err instanceof GraphUnavailableError) return { status: 'UNAVAILABLE', reason: err.reason };
    throw err;
  }
  if (rows.length === 0) return { status: 'EMPTY', tenantId, domain: 'studio' };
  let manifest: IdeaManifest;
  try { manifest = await loadIdeaManifest(repoRoot, options.manifestPath); } catch { return { status: 'UNAVAILABLE', reason: 'MANIFEST_INVALID' }; }
  const byId = new Map(manifest.ideas.map(i => [i.id, i]));
  const revision = rows[0]!.revision;
  const integrity: { id: string; reason: string }[] = [];
  const ideas: IdeaverseIdea[] = [];
  // `iid`/`wid` (internal node ids) keep identical nodes as separate rows. More than one workspace node, or two idea nodes with one id,
  // make the import state ambiguous: nothing is served for them and each is flagged once.
  if (new Set(rows.map(r => r.wid)).size > 1) {
    // The workspace identity is ambiguous, so NO revision is served: any value would come from whichever node the row order picked.
    return { status: 'AVAILABLE', tenantId, domain: 'studio', workspace: { id: WORKSPACE_ID, revision: null }, ideas: [], counts: { ideas: 0, imported: 0 }, integrity: [{ id: WORKSPACE_ID, reason: 'more than one workspace node has this id' }] };
  }
  const idCount = new Map<string, number>();
  for (const r of rows) if (r.id !== null) idCount.set(r.id, (idCount.get(r.id) ?? 0) + 1);
  for (const [id, n] of [...idCount].sort()) if (n > 1) integrity.push({ id, reason: 'more than one idea node has this id' });
  for (const r of rows) {
    if (r.id !== null && (idCount.get(r.id) ?? 0) > 1) continue;
    if (r.id === null || r.props === null) continue;
    const m = byId.get(r.id);
    if (!m) { integrity.push({ id: r.id, reason: 'idea is not in the manifest' }); continue; }
    const p = r.props;
    if (p['sha256'] !== m.sha256 || p['filename'] !== m.filename || p['byteCount'] !== m.byteCount || p['submittedAt'] !== m.submittedAt || p['touchedAt'] !== m.touchedAt) {
      integrity.push({ id: r.id, reason: 'stored idea metadata differs from the manifest' }); continue;
    }
    const edges = r.edges.filter(([id]) => typeof id === 'string').map(([id, receiptId]) => ({ id: id as string, receiptId }));
    const bad = importIntegrity(m.id, m.sha256, revision, edges, r.receipts);
    if (bad) { integrity.push({ id: r.id, reason: bad }); continue; }
    const receipt = r.receipts[0];
    ideas.push({ id: m.id, filename: m.filename, sha256: m.sha256, byteCount: m.byteCount, submittedAt: m.submittedAt, touchedAt: m.touchedAt, synthetic: true, classification: 'proposal', imported: !!receipt,
      ...(receipt ? { importedAt: receipt['importedAt'] as string, membershipId: receipt['membershipId'] as string } : {}) });
  }
  ideas.sort((a, b) => a.id.localeCompare(b.id));
  integrity.sort((a, b) => a.id.localeCompare(b.id));
  return { status: 'AVAILABLE', tenantId, domain: 'studio', workspace: { id: WORKSPACE_ID, revision }, ideas, counts: { ideas: ideas.length, imported: ideas.filter(i => i.imported).length }, integrity };
}
