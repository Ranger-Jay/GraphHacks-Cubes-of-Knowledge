import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StudioReadError, createStudioClient, mapReply, parseDetail, parseOverview } from '../../apps/web/src/studio/ideaverseClient';
import { createImportAttempt, parseImportReceipt, type ImportReceipt } from '../../apps/web/src/studio/ideaImport';

const HASH = 'e'.repeat(64);
const receipt: ImportReceipt = { ideaId: 'idea-009', sha256: HASH, workspaceId: 'ws', importedAt: '2026-10-15T23:00:00.000Z', workspaceRevision: 5, membershipId: 'm-9' };
const attempt = createImportAttempt('idea-009', 'key-abcdefgh01', 4);
const view = { id: 'idea-009', filename: 'idea-009.txt', sha256: HASH, byteCount: 12, submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z', synthetic: true, classification: 'proposal', imported: false };
const overview = { status: 'AVAILABLE', tenantId: 't-wad', domain: 'studio', workspace: { id: 'ws', revision: 4 }, ideas: [view], counts: { ideas: 1, imported: 0 }, integrity: [] };

interface Call { url: string; init: RequestInit }
const fake = (status: number, body: unknown, calls: Call[] = [], opts: { throws?: boolean; text?: string } = {}) => async (url: string, init?: RequestInit) => {
  calls.push({ url, init: init ?? {} });
  if (opts.throws) throw new TypeError('network');
  return new Response(opts.text ?? JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};

test('requests: exact routes, no-store, no query, no Authorization/credentials, POST body is exactly the two contract keys', async () => {
  const calls: Call[] = [];
  const c = createStudioClient(fake(200, { status: 'IMPORTED', replayed: false, receipt }, calls));
  await c.importIdea(attempt);
  await c.checkImport(attempt);
  const g = createStudioClient(fake(200, overview, calls));
  await g.readOverview();
  await createStudioClient(fake(200, { status: 'NOT_FOUND' }, calls)).readDetail('idea-009');
  assert.deepEqual(calls.map(x => `${x.init.method} ${x.url}`), [
    'POST /api/studio/ideas/idea-009/import', 'POST /api/studio/ideas/idea-009/import-status', 'GET /api/studio/ideas', 'GET /api/studio/ideas/idea-009']);
  for (const x of calls) {
    assert.equal(x.init.cache, 'no-store', x.url);
    assert.ok(!x.url.includes('?') && !x.url.includes('key-abcdefgh01'), 'no query string; the key never rides in a URL');
    const h = JSON.stringify(x.init.headers ?? {}).toLowerCase();
    assert.ok(!h.includes('authorization') && !h.includes('token') && x.init.credentials === undefined, `no credential on the client: ${x.url}`);
  }
  for (const x of calls.slice(0, 2)) assert.deepEqual(JSON.parse(String(x.init.body)), { idempotencyKey: 'key-abcdefgh01', expectedRevision: 4 });
  assert.equal(calls[2]!.init.body, undefined);
});

test('status route is read only: import-status never hits /import and import never hits /import-status', async () => {
  const calls: Call[] = [];
  const c = createStudioClient(fake(200, { status: 'NOT_FOUND' }, calls));
  assert.deepEqual(await c.checkImport(attempt), { kind: 'not-observed' });
  assert.ok(calls.every(x => x.url.endsWith('/import-status')));
  const calls2: Call[] = [];
  await createStudioClient(fake(503, { status: 'UNAVAILABLE', reason: 'QUERY_FAILED' }, calls2)).importIdea(attempt);
  assert.ok(calls2.every(x => x.url.endsWith('/import')));
});

test('an invalid tuple sends NOTHING and says so (not-started)', async () => {
  const calls: Call[] = [];
  const c = createStudioClient(fake(200, {}, calls));
  assert.deepEqual(await c.importIdea({ ideaId: 'idea-009', idempotencyKey: 'x', expectedRevision: 4 }), { kind: 'not-started' });
  assert.deepEqual(await c.checkImport({ ideaId: 'Bad Id', idempotencyKey: 'key-abcdefgh01', expectedRevision: 4 }), { kind: 'not-started' });
  assert.equal(calls.length, 0);
});

test('mapReply: every contract response maps to one outcome; IMPORTED passes the RAW receipt on', () => {
  const m = (status: number, body: unknown, st = false) => mapReply({ status, body }, attempt, st);
  assert.deepEqual(m(200, { status: 'IMPORTED', replayed: true, receipt }), { kind: 'persisted', receipt, replayed: true });
  assert.deepEqual(m(200, { status: 'IMPORTED', receipt: { ...receipt, fileSha256: HASH } }).kind, 'persisted', 'passed on raw; the strict parser (not the client) rejects it');
  assert.equal(parseImportReceipt((m(200, { status: 'IMPORTED', receipt: { ...receipt, fileSha256: HASH } }) as { receipt: unknown }).receipt), null);
  assert.deepEqual(m(409, { status: 'CONFLICT', reason: 'STALE_REVISION', currentRevision: 9 }), { kind: 'stale' });
  assert.deepEqual(m(409, { status: 'CONFLICT', reason: 'KEY_REUSED' }), { kind: 'key-reused' });
  assert.deepEqual(m(409, { status: 'CONFLICT', reason: 'ALREADY_IMPORTED', receipt }), { kind: 'existing', receipt });
  assert.deepEqual(m(409, { status: 'CONFLICT', reason: 'ALREADY_IMPORTED' }), { kind: 'existing' });
  assert.deepEqual(m(409, { status: 'CONFLICT', reason: 'ALREADY_IMPORTED', receipt: { ...receipt, workspaceRevision: 0 } }), { kind: 'existing' }, 'malformed carried receipt is dropped');
  assert.deepEqual(m(409, { status: 'CONFLICT', reason: 'ALREADY_IMPORTED', receipt: { ...receipt, ideaId: 'idea-other' } }), { kind: 'existing' }, 'another idea\'s receipt is dropped');
  assert.deepEqual(m(422, { status: 'REJECTED', reason: 'SOURCE_MISMATCH' }), { kind: 'rejected' });
  assert.deepEqual(m(400, { error: 'x' }), { kind: 'rejected' });
  assert.deepEqual(m(503, { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' }), { kind: 'unavailable' });
  assert.deepEqual(m(503, { status: 'UNCONFIRMED', reason: 'OUTCOME_UNKNOWN' }), { kind: 'unconfirmed' });
  assert.deepEqual(m(401, null), { kind: 'denied' });
  assert.deepEqual(m(403, { status: 'IMPORTED', receipt }), { kind: 'denied' }, 'a refusal is a refusal whatever the body says');
  assert.deepEqual(m(200, { status: 'NOT_FOUND' }, true), { kind: 'not-observed' });
  assert.deepEqual(m(200, { status: 'NOT_FOUND' }, false), { kind: 'failed' }, 'NOT_FOUND is only meaningful on the status route');
  for (const [s, b] of [[200, { status: 'CONFLICT' }], [409, { status: 'IMPORTED', receipt }], [500, null], [502, null], [503, { status: 'WHAT' }], [418, {}], [200, null]] as const) {
    assert.deepEqual(m(s, b), { kind: 'failed' }, `${s} ${JSON.stringify(b)}`);
  }
});

test('network loss after the request left is ambiguous, never "not saved"; a non-JSON reply is failed', async () => {
  assert.deepEqual(await createStudioClient(fake(200, null, [], { throws: true })).importIdea(attempt), { kind: 'ambiguous' });
  assert.deepEqual(await createStudioClient(fake(200, null, [], { throws: true })).checkImport(attempt), { kind: 'ambiguous' });
  assert.deepEqual(await createStudioClient(fake(502, null, [], { text: '<html>bad gateway' })).importIdea(attempt), { kind: 'failed' });
});

test('overview read: strict parse; 200/503 must match the view; 401/403/bad shape throw typed errors the read-back treats as unavailable', async () => {
  assert.deepEqual(await createStudioClient(fake(200, overview)).readOverview(), overview);
  assert.deepEqual(await createStudioClient(fake(200, { status: 'EMPTY', tenantId: 't-wad', domain: 'studio' })).readOverview(), { status: 'EMPTY', tenantId: 't-wad', domain: 'studio' });
  assert.deepEqual(await createStudioClient(fake(503, { status: 'UNAVAILABLE', reason: 'QUERY_FAILED' })).readOverview(), { status: 'UNAVAILABLE', reason: 'QUERY_FAILED' });
  const bad = async (status: number, body: unknown, kind: string) => {
    await assert.rejects(createStudioClient(fake(status, body)).readOverview(), (e: unknown) => e instanceof StudioReadError && e.kind === kind, `${status}`);
  };
  await bad(401, null, 'denied'); await bad(403, overview, 'denied');
  await bad(200, { status: 'UNAVAILABLE', reason: 'QUERY_FAILED' }, 'invalid');
  await bad(503, overview, 'invalid');
  await bad(500, overview, 'invalid');
  await bad(200, { ...overview, ideas: [{ ...view, sha256: 'xyz' }] }, 'invalid');
  await bad(200, { ...overview, ideas: [{ ...view, synthetic: false }] }, 'invalid');
  await bad(200, { ...overview, integrity: [{ id: 'x' }] }, 'invalid');
  await assert.rejects(createStudioClient(fake(200, null, [], { throws: true })).readOverview(), (e: unknown) => e instanceof StudioReadError && e.kind === 'unavailable');
  assert.equal(parseOverview({ ...overview, workspace: { id: 'ws', revision: -1 } }), null);
  assert.equal(parseOverview({ ...overview, ideas: [{ ...view, importedAt: 5 }] }), null);
  assert.equal(parseOverview('x'), null);
});

test('detail read: verified text only; missing, bad shape, empty or over 30 words is unavailable (no fallback text)', async () => {
  const ok = { status: 'AVAILABLE', idea: { ...view, text: 'A fictional proposal in ten words or fewer, nothing more.' } };
  const r = await createStudioClient(fake(200, ok)).readDetail('idea-009');
  assert.equal(r.kind, 'ready');
  assert.equal(r.kind === 'ready' && r.idea.text, ok.idea.text);
  for (const [s, b] of [[404, { status: 'NOT_FOUND' }], [503, { status: 'UNAVAILABLE', reason: 'SOURCE_MISMATCH' }], [401, null], [200, { status: 'AVAILABLE', idea: { ...view } }],
    [200, { status: 'AVAILABLE', idea: { ...view, text: '' } }], [200, { status: 'AVAILABLE', idea: { ...view, text: Array(31).fill('w').join(' ') } }], [200, { status: 'AVAILABLE', idea: { ...view, sha256: 'bad', text: 'x' } }]] as const) {
    assert.deepEqual(await createStudioClient(fake(s, b)).readDetail('idea-009'), { kind: 'unavailable' }, `${s}`);
  }
  assert.deepEqual(await createStudioClient(fake(200, null, [], { throws: true })).readDetail('idea-009'), { kind: 'unavailable' });
  assert.equal(parseDetail({ status: 'AVAILABLE', idea: { ...view, text: Array(30).fill('w').join(' ') } }).kind, 'ready');
});
