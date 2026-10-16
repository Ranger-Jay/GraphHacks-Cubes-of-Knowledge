import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyImportReadback, type IdeaSummary, type IdeaverseIdeaView, type IdeaverseOverviewView, type ImportReceipt } from '../../apps/web/src/studio/ideaImport';
import { parseOverview } from '../../apps/web/src/studio/ideaverseClient';
import { deferred, makeStudio, openIdea, phaseOf, ready, settleAll, HASH } from './studio-harness';

/**
 * Tests for the three null-revision refusal guards taken from #54 v034.00 (5d36e01): an ambiguous workspace serves
 * `revision: null` (accepted graph rule) and the web client must then start NO attempt and send NO write.
 * The guards were authored by Buddy; these tests are by Cora (non-author). The FakeServer is UNPROVEN as a model of the real server.
 * FINDING (mutation check): these tests ALSO pass with the three guards removed (807f854 code), because createImportAttempt already throws
 * on a non-number revision and Number.isInteger(null) is false. The guards are TypeScript narrowing for number|null; the tests pin the
 * fail-closed BEHAVIOUR, they do not prove the guard lines themselves.
 */

test('guard 1 (first Add): a null workspace revision pins NO attempt, sends NO import, never says Added; a numeric revision afterwards works', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.revision = null;
  ctl.add(); await settleAll();
  assert.deepEqual([server.calls.imports.length, server.calls.checks.length, ctl.attemptFor('idea-001'), added.length], [0, 0, null, 0]);
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'error' && st.reason], ['error', 'not-started']);
  server.revision = 3;
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1); assert.equal(server.calls.imports.length, 1);
});

test('guard 2 (New attempt after a stale revision): a null revision pins nothing, sends nothing; the old tuple is not reused', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  const hold = deferred<void>(); server.holdImport = hold;
  ctl.add(); await settleAll();
  server.holdImport = null; server.externalImport('idea-002'); hold.resolve(); await settleAll();
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'error' && st.reason], ['error', 'stale']);
  const sent = server.calls.imports.length;
  server.revision = null;
  ctl.newAttempt(); await settleAll();
  assert.equal(server.calls.imports.length, sent, 'no write');
  assert.equal(added.length, 0);
  const after = ctl.getSnapshot().open!.state;
  assert.notEqual(after.phase, 'added');
  assert.notEqual(after.phase, 'idle', 'a null revision must not leave a fresh pinned attempt ready to submit');
  assert.deepEqual([after.phase, after.phase === 'error' && after.reason], ['error', 'not-started']);
  server.revision = 4;
  ctl.add(); await settleAll();      // not-started: Add pins again from a fresh numeric read
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1);
  assert.deepEqual([server.calls.imports.length, server.calls.imports[sent]!.expectedRevision], [sent + 1, 4]);
});

test('guard 3 (read-back): a null workspace revision never confirms a persisted receipt', () => {
  const idea: IdeaSummary = { id: 'idea-001', filename: 'idea-001.txt', submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z', text: 'x', sha256: HASH(1) };
  const receipt: ImportReceipt = { ideaId: 'idea-001', sha256: HASH(1), workspaceId: 'ws-1', importedAt: '2026-10-16T04:00:00.000Z', workspaceRevision: 2, membershipId: 'member-idea-001' };
  const listed: IdeaverseIdeaView = { id: 'idea-001', filename: 'idea-001.txt', sha256: HASH(1), byteCount: 40, submittedAt: idea.submittedAt, touchedAt: idea.touchedAt, synthetic: true, classification: 'proposal', imported: true, importedAt: receipt.importedAt, membershipId: receipt.membershipId };
  const ov = (revision: number | null): IdeaverseOverviewView => ({ status: 'AVAILABLE', tenantId: 't-wad', domain: 'studio', workspace: { id: 'ws-1', revision }, ideas: [listed], counts: { ideas: 1, imported: 1 }, integrity: [] });
  assert.deepEqual(verifyImportReadback(idea, receipt, ov(2)), { ok: true });
  assert.deepEqual(verifyImportReadback(idea, receipt, ov(null)), { ok: false, reason: 'mismatch' });
});

test('client parse (documents current behaviour): an overview with revision null is rejected as invalid, so the studio fails closed before the guards', () => {
  const view = { id: 'idea-001', filename: 'idea-001.txt', sha256: HASH(1), byteCount: 40, submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z', synthetic: true, classification: 'proposal', imported: false };
  const body = (revision: unknown) => ({ status: 'AVAILABLE', tenantId: 't-wad', domain: 'studio', workspace: { id: 'ws-1', revision }, ideas: [view], counts: { ideas: 1, imported: 0 }, integrity: [] });
  assert.notEqual(parseOverview(body(3)), null);
  assert.equal(parseOverview(body(null)), null, 'DECISION FOR BUDDY: the contract type allows null (#54) but the client parser rejects it; failing closed here makes the three guards defence in depth');
});
