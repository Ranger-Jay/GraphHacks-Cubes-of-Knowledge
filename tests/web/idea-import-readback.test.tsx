import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdeaCardView } from '../../apps/web/src/studio/IdeaCard';
import {
  IMPORT_FAILURE_COPY, UNCONFIRMED_COPY, UNCONFIRMED_ACTION_COPY, confirmImport, importReducer, initialImportState, parseImportReceipt, verifyImportReadback,
  type IdeaSummary, type IdeaverseIdeaView, type IdeaverseOverviewView, type ImportEvent, type ImportReceipt, type ImportState, type UnconfirmedReason,
} from '../../apps/web/src/studio/ideaImport';

// Fixtures mirror the field names of ImportReceipt / IdeaverseOverview in packages/graph/src/ideaverse.ts at
// claude/studio-data-v023-followup 366eb56c59da7c084d540cee00b86ba041e15600. They are hand-built here because that file is not on
// this branch's base: a run against the REAL loader/importIdea/overview is UNPROVEN in this branch (see PR body).
const HASH = 'a'.repeat(64);
const idea: IdeaSummary = { id: 'idea-001', filename: 'idea-001.txt', submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z', text: 'A fictional fixture idea.', sha256: HASH };
const receipt: ImportReceipt = { ideaId: idea.id, sha256: HASH, workspaceId: 'ws-wad-cube', importedAt: '2026-10-15T23:00:00.000Z', workspaceRevision: 2, membershipId: 'member-ws-wad-cube-idea-001' };
const listed: IdeaverseIdeaView = {
  id: idea.id, filename: idea.filename, sha256: HASH, byteCount: 40, submittedAt: idea.submittedAt, touchedAt: idea.touchedAt, synthetic: true, classification: 'proposal',
  imported: true, importedAt: receipt.importedAt, membershipId: receipt.membershipId,
};
const overview = (over: Partial<Extract<IdeaverseOverviewView, { status: 'AVAILABLE' }>> = {}): IdeaverseOverviewView => ({
  status: 'AVAILABLE', tenantId: 't-wad', domain: 'studio', workspace: { id: 'ws-wad-cube', revision: 2 }, ideas: [listed], counts: { ideas: 1, imported: 1 }, integrity: [], ...over,
});
const view = (state: ImportState) =>
  renderToStaticMarkup(<IdeaCardView idea={idea} state={state} addBlockedReason={null} onAdd={() => {}} onRecheck={() => {}} onNewAttempt={() => {}} onClose={() => {}} titleId="t" bodyId="b" />);
const verifying = (): Extract<ImportState, { phase: 'verifying' }> => {
  const p = importReducer(initialImportState, { type: 'submit' });
  const v = importReducer(p, { type: 'settled', requestId: p.requestId, outcome: { kind: 'persisted', receipt } });
  assert.equal(v.phase, 'verifying');
  return v as Extract<ImportState, { phase: 'verifying' }>;
};

test('receipt contract: the sha256 key is accepted', () => {
  assert.deepEqual(parseImportReceipt({ ...receipt }), receipt);
});

test('receipt contract: fileSha256 (and every other alias) is rejected, never mapped', () => {
  const { sha256: _omit, ...rest } = receipt;
  assert.equal(parseImportReceipt({ ...rest, fileSha256: HASH }), null, 'fileSha256 instead of sha256');
  assert.equal(parseImportReceipt({ ...rest, fileHash: HASH }), null, 'legacy fileHash instead of sha256');
  assert.equal(parseImportReceipt({ ...rest, witnessHash: HASH }), null, 'witnessHash instead of sha256');
  assert.equal(parseImportReceipt({ ...receipt, fileSha256: HASH }), null, 'canonical key plus an alias is still rejected');
  for (const bad of [null, undefined, 'x', 7, [], {}, { ...receipt, sha256: 'xyz' }, { ...receipt, sha256: HASH.toUpperCase() }, { ...receipt, workspaceRevision: 0 }, { ...receipt, workspaceRevision: 1.5 },
    { ...receipt, importedAt: 'soon' }, { ...receipt, membershipId: '' }, { ...receipt, ideaId: 3 }]) assert.equal(parseImportReceipt(bad), null, JSON.stringify(bad));
});

test('persisted outcome whose receipt uses fileSha256 never reaches Added: unconfirmed (receipt-invalid), retry and a read-only status Re-check offered', () => {
  const p = importReducer(initialImportState, { type: 'submit' });
  const { sha256: _omit, ...rest } = receipt;
  const bad = { kind: 'persisted', receipt: { ...rest, fileSha256: HASH } } as unknown as Parameters<typeof importReducer>[1] extends infer E ? (E extends { outcome: infer O } ? O : never) : never;
  const s = importReducer(p, { type: 'settled', requestId: p.requestId, outcome: bad });
  assert.equal(s.phase, 'unconfirmed');
  assert.equal(s.phase === 'unconfirmed' && s.reason, 'receipt-invalid');
  assert.equal(s.phase === 'unconfirmed' && s.receipt, null);
  const html = view(s);
  assert.ok(!html.includes('Added to the cube.') && html.includes('Retry Add to cube') && html.includes('Re-check'), 'no receipt kept: Re-check is the read-only status check, not a read-back of a forged receipt');
  assert.equal(importReducer(s, { type: 'recheck' }), s, 'a read-back Re-check needs a kept valid receipt');
});

test('read-back: exactly one matching entry (receipt, membership, hash) is confirmed', () => {
  assert.deepEqual(verifyImportReadback(idea, receipt, overview()), { ok: true });
  assert.deepEqual(verifyImportReadback((({ sha256: _h, ...noHash }) => noHash)(idea), receipt, overview()), { ok: true }, 'card hash unknown: the receipt/read-back hashes still must agree');
});

test('HTTP success but read-back missing -> not Added (reducer: persisted -> verifying -> unconfirmed)', async () => {
  const cases: Array<[string, IdeaverseOverviewView | 'throw' | 'absent', UnconfirmedReason]> = [
    ['idea absent from the fresh read', overview({ ideas: [], counts: { ideas: 0, imported: 0 } }), 'not-found'],
    ['workspace EMPTY', { status: 'EMPTY', tenantId: 't-wad', domain: 'studio' }, 'readback-empty'],
    ['read UNAVAILABLE', { status: 'UNAVAILABLE', reason: 'CONNECTION_FAILED' }, 'readback-unavailable'],
    ['manifest invalid', { status: 'UNAVAILABLE', reason: 'MANIFEST_INVALID' }, 'readback-unavailable'],
    ['read rejects', 'throw', 'readback-unavailable'],
    ['no reader injected', 'absent', 'readback-unavailable'],
    ['listed but not imported', overview({ ideas: [(({ importedAt: _a, membershipId: _m, ...rest }) => ({ ...rest, imported: false }))(listed)] }), 'not-imported'],
  ];
  for (const [name, ov, reason] of cases) {
    const v = verifying();
    const read = ov === 'absent' ? undefined : async () => { if (ov === 'throw') throw new Error('network'); return ov as IdeaverseOverviewView; };
    const result = await confirmImport(idea, v.receipt, read);
    assert.deepEqual(result, { ok: false, reason }, name);
    const s = importReducer(v, { type: 'verified', requestId: v.requestId, result });
    assert.equal(s.phase, 'unconfirmed', name);
    const html = view(s);
    assert.ok(!html.includes('Added to the cube.') && !/>Added</.test(html), name);
    assert.ok(html.includes(UNCONFIRMED_COPY[reason].replace(/'/g, '&#x27;')) || html.includes(UNCONFIRMED_COPY[reason]), name);
  }
});

test('duplicate receipt/entry -> not Added', () => {
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ ideas: [listed, { ...listed }] })), { ok: false, reason: 'duplicate' }, 'listed twice');
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ ideas: [], integrity: [{ id: idea.id, reason: 'duplicate import receipts' }] })), { ok: false, reason: 'duplicate' }, 'graph withholds with a duplicate-receipts item');
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ integrity: [{ id: idea.id, reason: 'duplicate membership edges' }] })), { ok: false, reason: 'duplicate' }, 'integrity item wins even if an entry is also listed');
});

test('integrity-flagged idea (receipt-less, stale content) -> not Added; an unrelated idea flagged does not block', () => {
  for (const reason of ['membership edge without an import receipt', 'imported content differs from the current manifest', 'stored idea metadata differs from the manifest']) {
    assert.deepEqual(verifyImportReadback(idea, receipt, overview({ integrity: [{ id: idea.id, reason }] })), { ok: false, reason: 'integrity' }, reason);
  }
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ integrity: [{ id: 'some-other-idea', reason: 'duplicate import receipts' }] })), { ok: true });
});

test('hash / membership / timestamp / workspace / idea / revision mismatch -> not Added', () => {
  const mm = { ok: false, reason: 'mismatch' } as const;
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ ideas: [{ ...listed, sha256: 'b'.repeat(64) }] })), mm, 'read-back hash differs from the receipt');
  assert.deepEqual(verifyImportReadback(idea, { ...receipt, sha256: 'b'.repeat(64) }, overview()), mm, 'receipt hash differs from the current read-back hash');
  assert.deepEqual(verifyImportReadback({ ...idea, sha256: 'b'.repeat(64) }, receipt, overview()), mm, 'card hash differs from the current hash');
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ ideas: [{ ...listed, membershipId: 'member-other' }] })), mm, 'membership id');
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ ideas: [{ ...listed, importedAt: '2026-10-15T23:00:01.000Z' }] })), mm, 'importedAt');
  assert.deepEqual(verifyImportReadback(idea, { ...receipt, workspaceId: 'ws-other' }, overview()), mm, 'receipt workspace');
  assert.deepEqual(verifyImportReadback(idea, { ...receipt, ideaId: 'idea-002' }, overview()), mm, 'receipt names a different idea');
  assert.deepEqual(verifyImportReadback(idea, { ...receipt, workspaceRevision: 3 }, overview()), mm, 'workspace revision has not reached the receipt');
  assert.deepEqual(verifyImportReadback(idea, receipt, overview({ ideas: [(({ importedAt: _a, ...rest }) => rest)(listed)] })), { ok: false, reason: 'not-imported' }, 'imported entry without a timestamp');
});

test('reducer: Added is reachable only through verifying + an ok read-back (exhaustive over event sequences up to length 5)', () => {
  const okVerified = (s: ImportState): ImportEvent => ({ type: 'verified', requestId: s.requestId, result: { ok: true } });
  const events = (s: ImportState): Array<{ e: ImportEvent; ok: boolean }> => [
    { e: { type: 'submit' }, ok: false }, { e: { type: 'recheck' }, ok: false }, { e: { type: 'reset' }, ok: false },
    { e: { type: 'settled', requestId: s.requestId, outcome: { kind: 'persisted', receipt } }, ok: false },
    { e: { type: 'settled', requestId: s.requestId, outcome: { kind: 'ambiguous' } }, ok: false },
    { e: { type: 'verified', requestId: s.requestId, result: { ok: false, reason: 'not-found' } }, ok: false },
    { e: okVerified(s), ok: true },
    { e: { type: 'verified', requestId: s.requestId + 1, result: { ok: true } }, ok: false },
  ];
  let reached = 0;
  const walk = (s: ImportState, depth: number, sawOkVerify: boolean, prev: ImportState | null): void => {
    if (s.phase === 'added' && prev?.phase !== 'added') {
      reached++;
      assert.ok(sawOkVerify && prev?.phase === 'verifying', 'added without a preceding verifying + ok read-back');
    }
    if (depth === 5) return;
    for (const { e, ok } of events(s)) {
      const n = importReducer(s, e);
      walk(n, depth + 1, ok && s.phase === 'verifying' ? true : sawOkVerify, s);
    }
  };
  walk(initialImportState, 0, false, null);
  assert.ok(reached > 0, 'the walk must actually reach added through the legitimate path');
});

test('reducer: stale or out-of-phase read-back results are discarded; recheck re-reads without resubmitting', () => {
  const v = verifying();
  const u = importReducer(v, { type: 'verified', requestId: v.requestId, result: { ok: false, reason: 'not-found' } });
  assert.equal(u.phase, 'unconfirmed');
  assert.equal(importReducer(u, { type: 'verified', requestId: v.requestId, result: { ok: true } }), u, 'ok result outside verifying ignored');
  assert.equal(importReducer(v, { type: 'verified', requestId: v.requestId + 7, result: { ok: true } }), v, 'wrong request id ignored');
  const reset = importReducer(v, { type: 'reset' });
  assert.equal(importReducer(reset, { type: 'verified', requestId: v.requestId, result: { ok: true } }), reset, 'late read-back after close ignored');
  assert.equal(importReducer(v, { type: 'submit' }), v, 'no submit while verifying');
  const again = importReducer(u, { type: 'recheck' });
  assert.equal(again.phase, 'verifying');
  assert.equal(again.requestId, u.requestId + 1, 're-check is a new request');
  assert.deepEqual(again.phase === 'verifying' && again.receipt, receipt);
  assert.equal(importReducer(initialImportState, { type: 'recheck' }), initialImportState, 'recheck needs an unconfirmed receipt');
  const added = importReducer(again, { type: 'verified', requestId: again.requestId, result: { ok: true } });
  assert.equal(added.phase, 'added');
});

test('copy: no state ever says "Nothing was saved"; unconfirmed offers Re-check (receipt kept) or same-key Retry', () => {
  for (const [k, text] of Object.entries(IMPORT_FAILURE_COPY)) assert.doesNotMatch(text, /nothing was saved/i, k);
  for (const [k, text] of Object.entries(UNCONFIRMED_COPY)) assert.doesNotMatch(text, /nothing was saved|added to the cube/i, k);
  const v = verifying();
  const u = importReducer(v, { type: 'verified', requestId: v.requestId, result: { ok: false, reason: 'mismatch' } });
  const html = view(u);
  assert.ok(html.includes('data-import-phase="unconfirmed"') && html.includes('Re-check') && html.includes(UNCONFIRMED_ACTION_COPY.recheck));
  assert.doesNotMatch(html, /nothing was saved/i);
  const vv = view(v);
  assert.ok(vv.includes('Confirming with the cube...') && vv.includes('data-import-phase="verifying"') && !vv.includes('Added to the cube.'));
  assert.match(vv, /<button[^>]*class="idea-card-add"[^>]*disabled/);
  const e = view({ phase: 'error', requestId: 1, reason: 'failed' });
  assert.doesNotMatch(e, /nothing was saved/i);
  assert.ok(e.includes('Retry Add to cube'));
});
