// Live IdeaVerse metadata + persisted import tests. Require a reachable FalkorDB; no offline substitute.
// Fixtures are generated into a temp repo root (Gem's real 100-file manifest is a separate slice); each run uses its own graph.
// Run: node --import tsx --test tests/graph/ideaverse.integration.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IMPORT_WRITE_QUERY } from '../../packages/graph/src/ideaverse.ts';
import { analyzeRelease, configFromEnv, evidenceState, GraphClient, ideaverseOverview, seedStudio, studioOverview, importIdea, importStatus, loadIdeaManifest, seedGraph, seedIdeaverse, type ImportResult } from '../../packages/graph/src/index.ts';

process.env['GRAPH_EVIDENCE_KEY'] ??= 'test-only-evidence-key-not-a-secret-0123456789';
process.env['GRAPH_WITNESS_DIR'] = mkdtempSync(join(tmpdir(), 'cubes-idea-witness-'));

const graphName = `idea_test_${randomBytes(4).toString('hex')}`;
const client = new GraphClient({ ...configFromEnv(), graphName });
const root = mkdtempSync(join(tmpdir(), 'ideaverse-root-'));
const TEXTS: Record<string, string> = {
  'idea-a': 'A short fictional film about a night-shift projectionist who finds one unlabeled reel every Friday.',
  'idea-b': 'A synthetic studio story where the catering van becomes the only witness to a missing prop.',
  'idea-c': 'An invented sound designer records the sea inside an abandoned cinema and hears a script.',
  'idea-d': 'A fictional stunt crew rehearses a rooftop chase that keeps ending in the same doorway.',
  'idea-e': 'A made-up editor discovers two endings, each shot on a different day, neither credited.',
  'idea-f': 'An imagined costume designer stitches a coat that changes color whenever the cameras stop rolling.'
};
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const writeManifest = async (r: string, mutate?: (e: Record<string, unknown>[]) => void) => {
  await mkdir(join(r, 'graph/seed/ideaverse/files'), { recursive: true });
  const ideas: Record<string, unknown>[] = [];
  let day = 10;
  for (const [id, text] of Object.entries(TEXTS)) {
    const filename = `${id}.txt`; const bytes = Buffer.from(text + '\n');
    await writeFile(join(r, 'graph/seed/ideaverse/files', filename), bytes);
    ideas.push({ id, filename, path: `graph/seed/ideaverse/files/${filename}`, byteCount: bytes.length, sha256: sha(bytes), submittedAt: `2026-10-0${day % 9 + 1}T09:00:00Z`, touchedAt: `2026-10-${day++}T12:00:00Z`, synthetic: true, origin: 'project-authored synthetic idea', licenseStatus: 'none claimed' });
  }
  mutate?.(ideas);
  await writeFile(join(r, 'graph/seed/ideaverse/manifest.json'), JSON.stringify({ version: 'ideaverse@test', ideas }, null, 1));
};
const T = 't-wad';
const req = (ideaId: string, key: string, expectedRevision: number, tenantId = T) => ({ tenantId, ideaId, idempotencyKey: key, expectedRevision });
const count = async (cypher: string, params = {}) => (await client.read<{ n: number }>(cypher, params))[0]?.n ?? -1;
const revision = async (tenantId = T) => (await client.read<{ r: number }>('MATCH (w:Workspace {tenantId: $tenantId}) RETURN w.revision AS r', { tenantId }))[0]?.r ?? -1;
const members = () => count('MATCH ()-[e:IMPORTED_INTO]->() RETURN count(e) AS n');
const receipts = () => count('MATCH (r:ImportReceipt) RETURN count(r) AS n');

before(async () => { await writeManifest(root); await seedIdeaverse(client, root); });
after(async () => { await client.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await client.close(); await rm(root, { recursive: true, force: true }); });

test('manifest loader refuses unsafe, mismatched, over-long and non-UTC entries', async () => {
  const bad = async (mutate: (e: Record<string, unknown>[]) => void, re: RegExp) => {
    const r = mkdtempSync(join(tmpdir(), 'ideaverse-bad-'));
    try { await writeManifest(r, mutate); await assert.rejects(loadIdeaManifest(r), re); } finally { await rm(r, { recursive: true, force: true }); }
  };
  await bad(e => { e[0]!['filename'] = '../x.txt'; }, /unsafe/);
  await bad(e => { e[1]!['id'] = 'idea-a'; }, /duplicate id/);
  await bad(e => { e[0]!['sha256'] = '0'.repeat(64); }, /hash differs/);
  await bad(e => { e[0]!['byteCount'] = 5; }, /byte count/);
  await bad(e => { e[0]!['touchedAt'] = '2026-10-10 12:00'; }, /UTC/);
  await bad(e => { e[0]!['synthetic'] = false; }, /synthetic/);
  const r = mkdtempSync(join(tmpdir(), 'ideaverse-long-'));
  try {
    await writeManifest(r);
    const long = Buffer.from(Array.from({ length: 31 }, (_, i) => `w${i}`).join(' '));
    await writeFile(join(r, 'graph/seed/ideaverse/files/idea-a.txt'), long);
    const m = JSON.parse(await readFile(join(r, 'graph/seed/ideaverse/manifest.json'), 'utf8')); m.ideas[0].byteCount = long.length; m.ideas[0].sha256 = sha(long);
    await writeFile(join(r, 'graph/seed/ideaverse/manifest.json'), JSON.stringify(m));
    await assert.rejects(loadIdeaManifest(r), /31 words/);
  } finally { await rm(r, { recursive: true, force: true }); }
});

test('seed: six ideas, one workspace at revision 0, nothing imported; repeat adds nothing', async () => {
  const [n, e] = [await count('MATCH (n) RETURN count(n) AS n'), await count('MATCH ()-[e]->() RETURN count(e) AS n')];
  const again = await seedIdeaverse(client, root);
  assert.deepEqual([again.ideas, again.workspaceRevision, again.edges], [6, 0, 6]);
  assert.deepEqual([await count('MATCH (n) RETURN count(n) AS n'), await count('MATCH ()-[e]->() RETURN count(e) AS n')], [n, e]);
  assert.equal(await count('MATCH (i:IdeaFile) RETURN count(i) AS n'), 6);
  assert.equal(await members(), 0);
  const o = await ideaverseOverview(client, root, T);
  assert.ok(o.status === 'AVAILABLE');
  if (o.status === 'AVAILABLE') assert.deepEqual([o.counts, o.workspace.revision, o.integrity], [{ ideas: 6, imported: 0 }, 0, []]);
});

let first: Extract<ImportResult, { status: 'IMPORTED' }>;
test('import writes a persisted receipt, a membership edge and revision 1; overview reads it back', async () => {
  const r = await importIdea(client, root, req('idea-a', 'key-a-000001', 0), { now: () => new Date('2026-10-15T20:00:00Z') });
  assert.equal(r.status, 'IMPORTED');
  if (r.status !== 'IMPORTED') return;
  first = r;
  assert.equal(r.replayed, false);
  assert.deepEqual(r.receipt, { ideaId: 'idea-a', sha256: sha(Buffer.from(TEXTS['idea-a'] + '\n')), workspaceId: 'ws-wad-cube', importedAt: '2026-10-15T20:00:00.000Z', workspaceRevision: 1, membershipId: 'member-ws-wad-cube-idea-a' });
  assert.equal(await revision(), 1);
  assert.deepEqual([await members(), await receipts()], [1, 1]);
  const o = await ideaverseOverview(client, root, T);
  assert.ok(o.status === 'AVAILABLE');
  if (o.status !== 'AVAILABLE') return;
  const a = o.ideas.find(i => i.id === 'idea-a');
  assert.deepEqual([a?.imported, a?.importedAt, a?.membershipId], [true, '2026-10-15T20:00:00.000Z', 'member-ws-wad-cube-idea-a']);
  assert.deepEqual([o.counts, o.workspace.revision], [{ ideas: 6, imported: 1 }, 1]);
  assert.deepEqual(await importStatus(client, T, 'key-a-000001'), { status: 'IMPORTED', receipt: r.receipt });
  assert.deepEqual(await importStatus(client, T, 'key-unused-01'), { status: 'NOT_FOUND' });
});

test('retry with the same key replays the same receipt: no new node, edge, timestamp or revision', async () => {
  const [n, e, rev] = [await count('MATCH (n) RETURN count(n) AS n'), await count('MATCH ()-[e]->() RETURN count(e) AS n'), await revision()];
  const r = await importIdea(client, root, req('idea-a', 'key-a-000001', 0), { now: () => new Date('2030-01-01T00:00:00Z') });
  assert.deepEqual(r, { status: 'IMPORTED', replayed: true, receipt: first.receipt });
  assert.deepEqual([await count('MATCH (n) RETURN count(n) AS n'), await count('MATCH ()-[e]->() RETURN count(e) AS n'), await revision()], [n, e, rev]);
});

test('conflicts: key reused for a different idea or revision; stale revision; same idea under a new key', async () => {
  assert.deepEqual(await importIdea(client, root, req('idea-b', 'key-a-000001', 1)), { status: 'CONFLICT', reason: 'KEY_REUSED' });
  assert.deepEqual(await importIdea(client, root, req('idea-a', 'key-a-000001', 7)), { status: 'CONFLICT', reason: 'KEY_REUSED' });
  assert.deepEqual(await importIdea(client, root, req('idea-b', 'key-b-stale01', 0)), { status: 'CONFLICT', reason: 'STALE_REVISION', currentRevision: 1 });
  const dup = await importIdea(client, root, req('idea-a', 'key-a-second01', 1));
  assert.deepEqual(dup, { status: 'CONFLICT', reason: 'ALREADY_IMPORTED', receipt: first.receipt });
  assert.deepEqual([await revision(), await members(), await receipts()], [1, 1, 1]);
});

test('concurrency: identical requests make one import; competing ideas at one revision make one winner', async () => {
  const same = await Promise.all(Array.from({ length: 8 }, () => importIdea(client, root, req('idea-b', 'key-b-race001', 1))));
  assert.ok(same.every(r => r.status === 'IMPORTED'));
  assert.equal(new Set(same.map(r => r.status === 'IMPORTED' ? r.receipt.membershipId + r.receipt.importedAt + r.receipt.workspaceRevision : '')).size, 1);
  assert.equal(same.filter(r => r.status === 'IMPORTED' && !r.replayed).length, 1);
  assert.deepEqual([await revision(), await members(), await receipts()], [2, 2, 2]);
  const rivals = await Promise.all(['idea-c', 'idea-d', 'idea-e'].map(id => importIdea(client, root, req(id, `key-${id}-rival`, 2))));
  assert.equal(rivals.filter(r => r.status === 'IMPORTED').length, 1);
  assert.ok(rivals.filter(r => r.status !== 'IMPORTED').every(r => r.status === 'CONFLICT' && r.reason === 'STALE_REVISION'));
  assert.deepEqual([await revision(), await members(), await receipts()], [3, 3, 3]);
  const loser = ['idea-c', 'idea-d', 'idea-e'].find((_, i) => rivals[i]!.status !== 'IMPORTED')!;
  const dupKeys = await Promise.all(['k-same-1-aaaa', 'k-same-2-bbbb', 'k-same-3-cccc'].map(k => importIdea(client, root, req(loser, k, 3))));
  assert.equal(dupKeys.filter(r => r.status === 'IMPORTED' && !r.replayed).length, 1);
  assert.ok(dupKeys.filter(r => r.status !== 'IMPORTED').every(r => r.status === 'CONFLICT' && r.reason === 'ALREADY_IMPORTED'));
  assert.equal(await members(), 4, 'a, b, one rival winner, and exactly one of the same-idea requests');
});

test('rejections write nothing: invalid request, unknown idea, source mismatch, unseeded tenant', async () => {
  const [rev, m, rc] = [await revision(), await members(), await receipts()];
  assert.deepEqual(await importIdea(client, root, req('Idea A', 'key-invalid-01', 0)), { status: 'REJECTED', reason: 'INVALID_REQUEST' });
  assert.deepEqual(await importIdea(client, root, req('idea-a', 'short', 0)), { status: 'REJECTED', reason: 'INVALID_REQUEST' });
  assert.deepEqual(await importIdea(client, root, req('idea-a', 'key-negative-1', -1)), { status: 'REJECTED', reason: 'INVALID_REQUEST' });
  assert.deepEqual(await importIdea(client, root, req('idea-zzz', 'key-unknown-01', rev)), { status: 'REJECTED', reason: 'UNKNOWN_IDEA' });
  assert.deepEqual(await importIdea(client, root, req('idea-d', 'key-unseeded-1', 0, 't-never-seeded')), { status: 'REJECTED', reason: 'NOT_SEEDED' });
  // The graph's stored hash disagrees with the verified manifest: no import.
  await client.write("MATCH (i:IdeaFile {id: 'idea-f', tenantId: 't-wad'}) SET i.sha256 = $bad", { bad: '1'.repeat(64) });
  assert.deepEqual(await importIdea(client, root, req('idea-f', 'key-mismatch-01', rev)), { status: 'REJECTED', reason: 'SOURCE_MISMATCH' });
  const o = await ideaverseOverview(client, root, T);
  assert.ok(o.status === 'AVAILABLE' && o.integrity.some(i => i.id === 'idea-f') && !o.ideas.some(i => i.id === 'idea-f'));
  await seedIdeaverse(client, root); // reseed restores metadata and does not reset the revision or un-import anything
  assert.deepEqual([await revision(), await members(), await receipts()], [rev, m, rc]);
  // A file that changed on disk is a manifest failure, never an import.
  await writeFile(join(root, 'graph/seed/ideaverse/files/idea-f.txt'), 'Tampered text on disk.\n');
  assert.deepEqual(await importIdea(client, root, req('idea-f', 'key-disk-change1', rev)), { status: 'UNAVAILABLE', reason: 'MANIFEST_INVALID' });
  await writeManifest(root);
  assert.deepEqual([await revision(), await members(), await receipts()], [rev, m, rc]);
});

test('tenant isolation: the same idea can be imported independently per tenant; keys do not cross tenants', async () => {
  await seedIdeaverse(client, root, { tenantId: 't-other' });
  assert.equal(await revision('t-other'), 0);
  const rev = await revision();
  const r = await importIdea(client, root, req('idea-a', 'key-a-000001', 0, 't-other'));
  assert.ok(r.status === 'IMPORTED' && !r.replayed, 'the same key and idea in another tenant is a separate first import');
  assert.deepEqual([await revision('t-other'), await revision()], [1, rev]);
  const mine = await ideaverseOverview(client, root, T); const theirs = await ideaverseOverview(client, root, 't-other');
  assert.ok(mine.status === 'AVAILABLE' && theirs.status === 'AVAILABLE');
  if (mine.status === 'AVAILABLE' && theirs.status === 'AVAILABLE') assert.deepEqual([mine.counts.imported, theirs.counts.imported], [4, 1]);
  assert.equal((await ideaverseOverview(client, root, 't-nobody')).status, 'EMPTY');
});

test('graph failure: an unreachable graph reports UNAVAILABLE and claims no success', async () => {
  const dead = new GraphClient({ ...configFromEnv(), port: 1, timeoutMs: 500, graphName });
  try {
    assert.deepEqual(await importIdea(dead, root, req('idea-d', 'key-outage-001', await revision())), { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' });
    assert.deepEqual(await importStatus(dead, T, 'key-outage-001'), { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' });
    assert.deepEqual(await ideaverseOverview(dead, root, T), { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' });
  } finally { await dead.close(); }
  assert.deepEqual(await importStatus(client, T, 'key-outage-001'), { status: 'NOT_FOUND' });
});

test('licensing is unaffected: import changes neither the witness state hash nor the analysis', async () => {
  const lic = new GraphClient({ ...configFromEnv(), graphName: `${graphName}_lic` });
  try {
    await seedGraph(lic, process.cwd(), { initWitness: true });
    await seedIdeaverse(lic, root);
    const snap = async () => ({ state: await evidenceState(lic, 't-wad'), analysis: JSON.stringify(await analyzeRelease(lic, 't-wad', 'rel-wad')).replace(/"requestId":"[^"]*"/, '') });
    const before = await snap();
    const r = await importIdea(lic, root, req('idea-b', 'key-lic-000001', 0));
    assert.equal(r.status, 'IMPORTED');
    assert.deepEqual(await snap(), before);
    const a = await analyzeRelease(lic, 't-wad', 'rel-wad');
    assert.ok(a && a.status === 'AVAILABLE' && a.clearance === 'GAP' && a.revision === 'rel-wad@r1');
    await seedGraph(lic, process.cwd()); // the witnessed licensing seed still accepts the combined graph
  } finally { await lic.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await lic.close(); }
});

test('each guard of the single import statement blocks on its own (no row, no change)', async () => {
  const g = new GraphClient({ ...configFromEnv(), graphName: `${graphName}_guards` });
  try {
    await seedIdeaverse(g, root);
    const p = (o: Record<string, unknown> = {}) => ({ tenantId: T, workspaceId: 'ws-wad-cube', ideaId: 'idea-c', sha256: sha(Buffer.from(TEXTS['idea-c'] + '\n')), expectedRevision: 0,
      keyHash: 'k'.repeat(64), receiptId: 'rcpt-guard', fingerprint: 'f', filename: 'idea-c.txt', byteCount: Buffer.byteLength(TEXTS['idea-c'] + '\n'), submittedAt: `2026-10-0${12 % 9 + 1}T09:00:00Z`, touchedAt: '2026-10-12T12:00:00Z', importedAt: '2026-10-15T20:00:00.000Z', membershipId: 'member-guard', ...o });
    const rows = (o?: Record<string, unknown>) => g.write<unknown>(IMPORT_WRITE_QUERY, p(o) as Parameters<GraphClient['write']>[1]);
    assert.equal((await rows({ expectedRevision: 1 })).length, 0, 'revision guard');
    assert.equal((await rows({ sha256: '2'.repeat(64) })).length, 0, 'stored-hash guard');
    assert.equal((await rows({ tenantId: 't-elsewhere' })).length, 0, 'tenant guard');
    assert.equal((await rows({ touchedAt: '2026-10-12T12:00:01Z' })).length, 0, 'touchedAt guard');
    assert.equal((await rows({ submittedAt: '2026-01-01T00:00:00Z' })).length, 0, 'submittedAt guard');
    assert.equal((await rows({ filename: 'other.txt' })).length, 0, 'filename guard');
    assert.equal((await rows({ byteCount: 1 })).length, 0, 'byteCount guard');
    assert.equal((await rows({ ideaId: 'idea-missing' })).length, 0, 'unknown idea');
    const rev = async () => (await g.read<{ r: number }>('MATCH (w:Workspace) RETURN w.revision AS r'))[0]!.r;
    assert.equal(await rev(), 0);
    assert.equal((await rows()).length, 1, 'all guards satisfied: one row');
    assert.equal(await rev(), 1);
    assert.equal((await rows({ ideaId: 'idea-d', sha256: sha(Buffer.from(TEXTS['idea-d'] + '\n')), expectedRevision: 1, receiptId: 'rcpt-guard-2', membershipId: 'member-guard-2' })).length, 0, 'key guard: the key is already used');
    assert.equal((await rows({ keyHash: 'j'.repeat(64), expectedRevision: 1, receiptId: 'rcpt-guard-3' })).length, 0, 'member guard: idea already imported');
    assert.equal(await rev(), 1);
    assert.equal((await g.read<{ n: number }>('MATCH (r:ImportReceipt) RETURN count(r) AS n'))[0]!.n, 1);
  } finally { await g.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await g.close(); }
});

// ---- follow-up (v023.09-.12): integrity of import state, scoped studio source, seed refusal, full-field guard ----
const fresh = async (label: string) => {
  const g = new GraphClient({ ...configFromEnv(), graphName: `${graphName}_${label}` });
  await writeManifest(root); await seedIdeaverse(g, root);
  return { g, done: async () => { await g.write('MATCH (n) DETACH DELETE n').catch(() => undefined); await g.close(); } };
};
const ov = async (g: GraphClient) => { const o = await ideaverseOverview(g, root, T); assert.equal(o.status, 'AVAILABLE'); if (o.status !== 'AVAILABLE') throw new Error('unavailable'); return o; };

test('studio overview in a graph holding both slices has no integrity item for the IdeaVerse manifest source', async () => {
  const { g, done } = await fresh('both');
  try {
    await seedStudio(g, process.cwd());
    const s = await studioOverview(g, process.cwd(), T);
    assert.ok(s.status === 'AVAILABLE');
    if (s.status === 'AVAILABLE') { assert.deepEqual(s.integrity, []); assert.deepEqual(s.counts, { people: 20, departments: 10, sources: 2, edges: 50 }); }
    assert.equal((await ov(g)).integrity.length, 0);
  } finally { await done(); }
});

test('a hand-forged membership edge with no receipt is withheld, flagged and not counted as imported', async () => {
  const { g, done } = await fresh('forged');
  try {
    await g.write("MATCH (i:IdeaFile {id: 'idea-a', tenantId: 't-wad'}), (w:Workspace {tenantId: 't-wad'}) CREATE (i)-[:IMPORTED_INTO {id: 'member-ws-wad-cube-idea-a', receiptId: 'rcpt-none'}]->(w)");
    const o = await ov(g);
    assert.deepEqual(o.integrity, [{ id: 'idea-a', reason: 'membership edge without an import receipt' }]);
    assert.ok(!o.ideas.some(i => i.id === 'idea-a'));
    assert.deepEqual(o.counts, { ideas: 5, imported: 0 });
  } finally { await done(); }
});

test('a duplicate receipt or a receipt without its membership is flagged, never double counted', async () => {
  const { g, done } = await fresh('dup');
  try {
    const ok = await importIdea(g, root, req('idea-a', 'key-dup-000001', 0));
    assert.equal(ok.status, 'IMPORTED');
    await g.write("CREATE (:ImportReceipt {id: 'rcpt-extra', tenantId: 't-wad', keyHash: 'x', fingerprint: 'f', ideaId: 'idea-a', sha256: $s, workspaceId: 'ws-wad-cube', importedAt: '2026-10-15T20:00:00.000Z', workspaceRevision: 1, membershipId: 'member-ws-wad-cube-idea-a'})", { s: ok.status === 'IMPORTED' ? ok.receipt.sha256 : '' });
    let o = await ov(g);
    assert.deepEqual(o.integrity, [{ id: 'idea-a', reason: 'duplicate import receipts' }]);
    assert.deepEqual(o.counts, { ideas: 5, imported: 0 });
    await g.write("MATCH (r:ImportReceipt {id: 'rcpt-extra'}) DELETE r");
    await g.write("CREATE (:ImportReceipt {id: 'rcpt-orphan', tenantId: 't-wad', keyHash: 'y', fingerprint: 'f', ideaId: 'idea-b', sha256: 'z', workspaceId: 'ws-wad-cube', importedAt: '2026-10-15T20:00:00.000Z', workspaceRevision: 1, membershipId: 'member-ws-wad-cube-idea-b'})");
    o = await ov(g);
    assert.deepEqual(o.integrity, [{ id: 'idea-b', reason: 'import receipt without a membership edge' }]);
    assert.deepEqual(o.counts, { ideas: 5, imported: 1 });
  } finally { await done(); }
});

test('edge and receipt that name each other inconsistently are flagged', async () => {
  const { g, done } = await fresh('mismatch');
  try {
    assert.equal((await importIdea(g, root, req('idea-a', 'key-mm-0000001', 0))).status, 'IMPORTED');
    await g.write("MATCH (:IdeaFile {id: 'idea-a'})-[m:IMPORTED_INTO]->() SET m.receiptId = 'rcpt-other'");
    assert.deepEqual((await ov(g)).integrity, [{ id: 'idea-a', reason: 'membership edge and receipt do not match' }]);
    await g.write("MATCH (:IdeaFile {id: 'idea-a'})-[m:IMPORTED_INTO]->() MATCH (r:ImportReceipt {ideaId: 'idea-a'}) SET m.receiptId = r.id, r.importedAt = 'yesterday'");
    assert.deepEqual((await ov(g)).integrity, [{ id: 'idea-a', reason: 'receipt timestamp or revision is invalid' }]);
  } finally { await done(); }
});

test('changed content under an imported id: the seed refuses, and the overview never calls the new content imported', async () => {
  const { g, done } = await fresh('stale');
  try {
    const r = await importIdea(g, root, req('idea-c', 'key-stale-00001', 0));
    assert.equal(r.status, 'IMPORTED');
    const before = await ov(g);
    // The idea file and manifest change after the import (a new reviewed content under the same id).
    const newText = Buffer.from('A replacement fictional story about a lighthouse keeper who edits tide tables into verse.\n');
    await writeFile(join(root, 'graph/seed/ideaverse/files/idea-c.txt'), newText);
    const m = JSON.parse(await readFile(join(root, 'graph/seed/ideaverse/manifest.json'), 'utf8'));
    const c = m.ideas.find((i: { id: string }) => i.id === 'idea-c'); c.byteCount = newText.length; c.sha256 = sha(newText);
    await writeFile(join(root, 'graph/seed/ideaverse/manifest.json'), JSON.stringify(m));
    await assert.rejects(seedIdeaverse(g, root), /Refusing to re-seed.*idea-c/);
    // Even if the stored copy is changed directly, the receipt still names the old content: withheld, flagged.
    await g.write("MATCH (i:IdeaFile {id: 'idea-c', tenantId: 't-wad'}) SET i.sha256 = $s, i.byteCount = $b", { s: sha(newText), b: newText.length });
    const o = await ov(g);
    assert.deepEqual(o.integrity, [{ id: 'idea-c', reason: 'imported content differs from the current manifest' }]);
    assert.equal(o.counts.imported, 0);
    assert.ok(before.counts.imported === 1);
    assert.deepEqual(await importIdea(g, root, req('idea-c', 'key-stale-00002', 1)), { status: 'CONFLICT', reason: 'ALREADY_IMPORTED', receipt: (r as Extract<ImportResult, { status: 'IMPORTED' }>).receipt });
  } finally { await writeManifest(root); await done(); }
});

test('a tampered touchedAt is rejected as a source mismatch before any write, not imported then withheld', async () => {
  const { g, done } = await fresh('touched');
  try {
    await g.write("MATCH (i:IdeaFile {id: 'idea-a', tenantId: 't-wad'}) SET i.touchedAt = '2030-01-01T00:00:00Z'");
    assert.deepEqual(await importIdea(g, root, req('idea-a', 'key-touch-00001', 0)), { status: 'REJECTED', reason: 'SOURCE_MISMATCH' });
    assert.equal((await g.read<{ n: number }>('MATCH (r:ImportReceipt) RETURN count(r) AS n'))[0]!.n, 0);
    assert.equal((await g.read<{ r: number }>('MATCH (w:Workspace) RETURN w.revision AS r'))[0]!.r, 0);
  } finally { await done(); }
});
