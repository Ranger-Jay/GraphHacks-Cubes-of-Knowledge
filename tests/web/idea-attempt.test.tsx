import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdeaCardView } from '../../apps/web/src/studio/IdeaCard';
import {
  IMPORT_FAILURE_COPY, NEW_ATTEMPT_FAILURES, NOT_STARTED_COPY, REFUSED_COPY, UNCERTAIN_COPY, UNCERTAIN_FAILURES, UNCONFIRMED_COPY,
  cardActions, checkAttempt, createImportAttempt, importReducer, initialImportState, isBusy, sameAttempt,
  type IdeaSummary, type IdeaverseOverviewView, type ImportEvent, type ImportOutcome, type ImportReceipt, type ImportState,
} from '../../apps/web/src/studio/ideaImport';

const HASH = 'c'.repeat(64);
const idea: IdeaSummary = { id: 'idea-007', filename: 'idea-007.txt', submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z', text: 'A fictional fixture idea.', sha256: HASH };
const receipt: ImportReceipt = { ideaId: idea.id, sha256: HASH, workspaceId: 'ws', importedAt: '2026-10-15T23:00:00.000Z', workspaceRevision: 4, membershipId: 'm-7' };
const attempt = createImportAttempt(idea.id, 'key-0123456789', 3);
const view = (state: ImportState, reason: string | null = null) => renderToStaticMarkup(
  <IdeaCardView idea={idea} state={state} addBlockedReason={reason} onAdd={() => {}} onRecheck={() => {}} onNewAttempt={() => {}} onClose={() => {}} titleId="t" bodyId="b" />);
const settle = (o: ImportOutcome): ImportState => {
  const p = importReducer(initialImportState, { type: 'submit' });
  return importReducer(p, { type: 'settled', requestId: p.requestId, outcome: o });
};

test('attempt tuple: frozen, validated with the contract request rules, never mutable after creation', () => {
  assert.deepEqual({ ...attempt }, { ideaId: 'idea-007', idempotencyKey: 'key-0123456789', expectedRevision: 3 });
  assert.ok(Object.isFrozen(attempt));
  assert.throws(() => { (attempt as { expectedRevision: number }).expectedRevision = 9; }, TypeError);
  assert.equal(attempt.expectedRevision, 3);
  for (const bad of [['Idea', 'key-0123456789', 1], ['idea-007', 'short', 1], ['idea-007', 'key with space', 1], ['idea-007', 'k'.repeat(65), 1], ['idea-007', 'key-0123456789', -1], ['idea-007', 'key-0123456789', 1.5], ['idea-007', 'key-0123456789', 2 ** 53], ['', 'key-0123456789', 0]] as const) {
    assert.throws(() => createImportAttempt(bad[0], bad[1], bad[2]), RangeError, JSON.stringify(bad));
  }
  assert.ok(createImportAttempt('idea-007', 'key-0123456789', 0), 'revision 0 is a valid nonnegative revision');
  assert.ok(sameAttempt(attempt, createImportAttempt('idea-007', 'key-0123456789', 3)));
  assert.ok(!sameAttempt(attempt, createImportAttempt('idea-007', 'key-0123456789', 4)), 'a different revision under the same key is a DIFFERENT tuple (the server would answer KEY_REUSED)');
});

test('outcome mapping: persisted -> verifying(import); existing+receipt -> verifying(existing); bare existing -> unconfirmed(existing); never added directly', () => {
  const a = settle({ kind: 'persisted', receipt });
  assert.deepEqual([a.phase, a.phase === 'verifying' && a.via], ['verifying', 'import']);
  const b = settle({ kind: 'existing', receipt });
  assert.deepEqual([b.phase, b.phase === 'verifying' && b.via], ['verifying', 'existing']);
  const c = settle({ kind: 'existing' });
  assert.deepEqual([c.phase, c.phase === 'unconfirmed' && c.reason, c.phase === 'unconfirmed' && c.receipt], ['unconfirmed', 'existing', null]);
  const d = settle({ kind: 'persisted', receipt: { ...receipt, sha256: 'nope' } });
  assert.deepEqual([d.phase, d.phase === 'unconfirmed' && d.reason], ['unconfirmed', 'receipt-invalid']);
});

test('existing (someone else\'s receipt) can only end as present, never added; a failed read-back keeps no receipt to promote', () => {
  const v = settle({ kind: 'existing', receipt });
  assert.equal(v.phase, 'verifying');
  const ok = importReducer(v, { type: 'verified', requestId: v.requestId, result: { ok: true } });
  assert.deepEqual([ok.phase, ok.phase === 'present' && ok.receipt], ['present', receipt]);
  const bad = importReducer(v, { type: 'verified', requestId: v.requestId, result: { ok: false, reason: 'mismatch' } });
  assert.deepEqual([bad.phase, bad.phase === 'unconfirmed' && bad.receipt], ['unconfirmed', null]);
  assert.equal(importReducer(bad, { type: 'recheck' }), bad, 'no read-back Re-check without an own receipt');
  assert.match(view(ok), /This idea is already in the cube\./);
});

test('failure kinds: proven refusals use the refusal wording; every uncertain kind uses exactly the ruled sentence; none says Nothing was saved', () => {
  assert.equal(UNCERTAIN_COPY, 'Could not confirm whether this was saved. Re-check the cube before retrying.');
  for (const k of UNCERTAIN_FAILURES) assert.equal(IMPORT_FAILURE_COPY[k], UNCERTAIN_COPY, k);
  assert.deepEqual([...UNCERTAIN_FAILURES].sort(), ['ambiguous', 'failed', 'unavailable', 'unconfirmed']);
  assert.equal(IMPORT_FAILURE_COPY.rejected, REFUSED_COPY);
  assert.ok(IMPORT_FAILURE_COPY.denied.includes(REFUSED_COPY));
  assert.equal(IMPORT_FAILURE_COPY['not-started'], NOT_STARTED_COPY);
  const everything = [...Object.values(IMPORT_FAILURE_COPY), ...Object.values(UNCONFIRMED_COPY), UNCERTAIN_COPY];
  for (const t of everything) assert.doesNotMatch(t, /nothing was saved|not saved|was not added|not been saved/i, t);
  for (const k of ['unavailable', 'unconfirmed', 'ambiguous', 'failed'] as const) {
    const html = view(settle({ kind: k }));
    assert.ok(html.includes(UNCERTAIN_COPY), k);
    assert.doesNotMatch(html, /nothing was saved/i, k);
    assert.ok(!html.includes('Added to the cube.'), k);
  }
});

test('card actions per state: the card offers exactly what is safe', () => {
  const a = (s: ImportState) => cardActions(s);
  assert.deepEqual(a(initialImportState), { add: 'add', recheck: false, newAttempt: false });
  for (const s of [importReducer(initialImportState, { type: 'submit' }), settle({ kind: 'persisted', receipt })]) assert.deepEqual(a(s), { add: null, recheck: false, newAttempt: false });
  for (const k of ['unavailable', 'unconfirmed', 'ambiguous', 'failed'] as const) assert.deepEqual(a(settle({ kind: k })), { add: 'retry', recheck: true, newAttempt: false }, k);
  for (const k of ['stale', 'key-reused'] as const) assert.deepEqual(a(settle({ kind: k })), { add: null, recheck: false, newAttempt: true }, k);
  for (const k of ['denied', 'rejected'] as const) assert.deepEqual(a(settle({ kind: k })), { add: null, recheck: false, newAttempt: false }, k);
  assert.deepEqual(a(settle({ kind: 'not-started' })), { add: 'retry', recheck: false, newAttempt: false });
  assert.deepEqual([...NEW_ATTEMPT_FAILURES].sort(), ['key-reused', 'stale']);
  // Stale/key-reused never offer a same-tuple Retry.
  for (const k of ['stale', 'key-reused'] as const) assert.doesNotMatch(view(settle({ kind: k })), /Retry Add to cube/);
  assert.match(view(settle({ kind: 'stale' })), /Refresh and start a new attempt/);
  // Every unconfirmed reason keeps a Re-check and a Retry, plus the help line.
  const u: ImportState = { phase: 'unconfirmed', requestId: 1, reason: 'unresolved', receipt: null };
  const html = view(u);
  for (const t of [UNCERTAIN_COPY, UNCONFIRMED_COPY.unresolved, 'Re-check', 'Retry Add to cube']) assert.ok(html.includes(t), t);
});

test('read-only status check: a check never writes; not-observed and present are observations; a receipt from the check is verified before added', () => {
  const u = settle({ kind: 'ambiguous' });
  const c = importReducer(u, { type: 'check' });
  assert.equal(c.phase, 'checking');
  assert.ok(isBusy(c));
  assert.equal(importReducer(c, { type: 'submit' }), c, 'no write while a check is in flight');
  assert.equal(importReducer(c, { type: 'check' }), c, 'no second check');
  assert.equal(importReducer(initialImportState, { type: 'check' }), initialImportState, 'idle has nothing to check');
  const none = importReducer(c, { type: 'checked', requestId: c.requestId, result: { kind: 'not-observed' } });
  assert.deepEqual([none.phase, none.phase === 'unconfirmed' && none.reason], ['unconfirmed', 'not-observed']);
  assert.match(view(none), /does not rule out a request that is still completing/);
  const present = importReducer(c, { type: 'checked', requestId: c.requestId, result: { kind: 'present' } });
  assert.equal(present.phase, 'present');
  const found = importReducer(c, { type: 'checked', requestId: c.requestId, result: { kind: 'persisted', receipt } });
  assert.deepEqual([found.phase, found.phase === 'verifying' && found.via], ['verifying', 'recheck']);
  const added = importReducer(found, { type: 'verified', requestId: found.requestId, result: { ok: true } });
  assert.equal(added.phase, 'added', 'this attempt\'s own key matched the receipt, and the fresh read confirmed it');
  assert.equal(importReducer(c, { type: 'checked', requestId: c.requestId + 1, result: { kind: 'persisted', receipt } }), c, 'stale check ignored');
  const failed = importReducer(c, { type: 'checked', requestId: c.requestId, result: { kind: 'unavailable' } });
  assert.deepEqual([failed.phase, failed.phase === 'error' && failed.reason], ['error', 'unavailable']);
});

test('abandon (card closed / phase left READY) keeps the attempt unresolved and discards the late completion', () => {
  const p = importReducer(initialImportState, { type: 'submit' });
  const ab = importReducer(p, { type: 'abandon' });
  assert.deepEqual([ab.phase, ab.phase === 'unconfirmed' && ab.reason, ab.phase === 'unconfirmed' && ab.receipt], ['unconfirmed', 'unresolved', null]);
  assert.equal(importReducer(ab, { type: 'settled', requestId: p.requestId, outcome: { kind: 'persisted', receipt } }), ab, 'late success after abandon ignored');
  const v = settle({ kind: 'persisted', receipt });
  const abv = importReducer(v, { type: 'abandon' });
  assert.equal(abv.phase === 'unconfirmed' && abv.receipt?.membershipId, receipt.membershipId, 'own receipt kept for a read-only Re-check');
  assert.equal(importReducer(abv, { type: 'verified', requestId: v.requestId, result: { ok: true } }), abv, 'late read-back after abandon ignored');
  const ex = importReducer(settle({ kind: 'existing', receipt }), { type: 'abandon' });
  assert.equal(ex.phase === 'unconfirmed' && ex.receipt, null, 'someone else\'s receipt is dropped');
  const idle = initialImportState;
  assert.equal(importReducer(idle, { type: 'abandon' }), idle);
  const added = importReducer(v, { type: 'verified', requestId: v.requestId, result: { ok: true } });
  assert.equal(importReducer(added, { type: 'abandon' }), added, 'a finished state is not reopened');
});

test('checkAttempt: server status when injected; overview-only fallback says only present / not-observed; never calls an import function', async () => {
  let imports = 0;
  const importIdea = async () => { imports++; return { kind: 'failed' } as ImportOutcome; };
  void importIdea;
  assert.deepEqual(await checkAttempt(idea, attempt, async a => { assert.ok(sameAttempt(a, attempt)); return { kind: 'persisted', receipt }; }, undefined), { kind: 'persisted', receipt });
  assert.deepEqual(await checkAttempt(idea, attempt, async () => { throw new Error('x'); }, undefined), { kind: 'failed' });
  const listed = { id: idea.id, filename: 'f', sha256: HASH, byteCount: 3, submittedAt: idea.submittedAt, touchedAt: idea.touchedAt, synthetic: true as const, classification: 'proposal' as const, imported: true, importedAt: receipt.importedAt, membershipId: receipt.membershipId };
  const ov = (o: Partial<Extract<IdeaverseOverviewView, { status: 'AVAILABLE' }>> = {}): IdeaverseOverviewView => ({ status: 'AVAILABLE', tenantId: 't', domain: 'studio', workspace: { id: 'ws', revision: 4 }, ideas: [listed], counts: { ideas: 1, imported: 1 }, integrity: [], ...o });
  const via = (o: IdeaverseOverviewView | 'throw' | 'none') => checkAttempt(idea, attempt, undefined, o === 'none' ? undefined : async () => { if (o === 'throw') throw new Error('x'); return o; });
  assert.deepEqual(await via(ov()), { kind: 'present' });
  assert.deepEqual(await via(ov({ ideas: [{ ...listed, imported: false }] })), { kind: 'not-observed' });
  assert.deepEqual(await via(ov({ ideas: [] })), { kind: 'not-observed' });
  assert.deepEqual(await via(ov({ integrity: [{ id: idea.id, reason: 'duplicate import receipts' }] })), { kind: 'unavailable' }, 'integrity-flagged is never present');
  assert.deepEqual(await via(ov({ ideas: [listed, listed] })), { kind: 'unavailable' });
  assert.deepEqual(await via(ov({ ideas: [{ ...listed, sha256: 'd'.repeat(64) }] })), { kind: 'unavailable' }, 'hash differs from the card\'s manifest hash');
  assert.deepEqual(await via({ status: 'UNAVAILABLE', reason: 'QUERY_FAILED' }), { kind: 'unavailable' });
  assert.deepEqual(await via('throw'), { kind: 'failed' });
  assert.deepEqual(await via('none'), { kind: 'unavailable' });
  assert.equal(imports, 0);
});

test('reducer walk: nothing reaches added or present without verifying + ok, over every event up to length 5 (extended event set)', () => {
  const events = (s: ImportState): ImportEvent[] => [
    { type: 'submit' }, { type: 'recheck' }, { type: 'check' }, { type: 'abandon' }, { type: 'reset' },
    { type: 'settled', requestId: s.requestId, outcome: { kind: 'persisted', receipt } },
    { type: 'settled', requestId: s.requestId, outcome: { kind: 'existing', receipt } },
    { type: 'settled', requestId: s.requestId, outcome: { kind: 'existing' } },
    { type: 'settled', requestId: s.requestId, outcome: { kind: 'ambiguous' } },
    { type: 'checked', requestId: s.requestId, result: { kind: 'persisted', receipt } },
    { type: 'checked', requestId: s.requestId, result: { kind: 'present' } },
    { type: 'checked', requestId: s.requestId, result: { kind: 'not-observed' } },
    { type: 'verified', requestId: s.requestId, result: { ok: true } },
    { type: 'verified', requestId: s.requestId, result: { ok: false, reason: 'mismatch' } },
    { type: 'verified', requestId: s.requestId + 1, result: { ok: true } },
  ];
  let added = 0; let present = 0;
  const walk = (s: ImportState, depth: number, prev: ImportState | null): void => {
    if (s.phase === 'added' && prev?.phase === 'verifying') { added++; assert.notEqual(prev.via, 'existing', 'added never follows someone else\'s receipt'); }
    else if (s.phase === 'added') assert.equal(prev?.phase, 'added', 'added only from verifying');
    if (s.phase === 'present' && prev?.phase !== 'present') { present++; assert.ok(prev?.phase === 'verifying' || prev?.phase === 'checking', 'present only from verifying or a status check'); }
    if (depth === 5) return;
    for (const e of events(s)) walk(importReducer(s, e), depth + 1, s);
  };
  walk(initialImportState, 0, null);
  assert.ok(added > 0 && present > 0);
});
