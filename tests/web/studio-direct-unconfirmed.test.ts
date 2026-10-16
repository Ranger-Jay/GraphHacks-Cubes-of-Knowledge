import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNCERTAIN_COPY, type ImportAttempt, type ImportOutcome } from '../../apps/web/src/studio/ideaImport';
import { makeStudio, openIdea, phaseOf, ready, settleAll } from './studio-harness';

/**
 * "Direct unconfirmed": the import reply itself already lands in `unconfirmed` (no `verifying` step), so the verify path's
 * pool refresh never runs. The write may have committed, so the pool must be re-read (a committed idea must leave it) while
 * the card still claims nothing about success and sends no second write. FakeServer is UNPROVEN as a model of the real server.
 */
const ids = ['idea-001', 'idea-002', 'idea-003'];

test('persisted reply with a non-canonical receipt: card is unconfirmed (receipt-invalid), pool is re-read, committed idea leaves it, no Added, no pull, one write', async () => {
  const { server, ctl, added } = makeStudio(ids);
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.importIdea = (async (a: ImportAttempt): Promise<ImportOutcome> => {
    server.calls.imports.push(a);
    server.externalImport(a.ideaId);                               // the server really committed
    return { kind: 'persisted', receipt: { ideaId: a.ideaId, fileSha256: 'x' } as never };   // but the reply is not the canonical receipt
  }) as typeof server.importIdea;
  const overviewBefore = server.calls.overview;
  ctl.add(); await settleAll();
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'unconfirmed' && st.reason, st.phase === 'unconfirmed' && st.receipt], ['unconfirmed', 'receipt-invalid', null]);
  assert.equal(added.length, 0, 'no pull from an unconfirmed reply');
  assert.equal(server.calls.imports.length, 1, 'no second write');
  assert.equal(server.calls.overview, overviewBefore + 2, 'pin read + exactly one pool refresh');
  assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-002', 'idea-003'], 'the committed idea left the pool');
});

test('bare ALREADY_IMPORTED (no receipt): card is unconfirmed (existing), pool is re-read and drops the idea, no Added, no write', async () => {
  const { server, ctl, added } = makeStudio(ids);
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.importIdea = (async (a: ImportAttempt): Promise<ImportOutcome> => {
    server.calls.imports.push(a);
    server.externalImport(a.ideaId);                               // someone else committed after our pin read
    return { kind: 'existing' };
  }) as typeof server.importIdea;
  const overviewBefore = server.calls.overview;
  ctl.add(); await settleAll();
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'unconfirmed' && st.reason], ['unconfirmed', 'existing']);
  assert.equal(added.length, 0);
  assert.equal(server.calls.overview, overviewBefore + 2);
  assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-002', 'idea-003']);
});

test('direct unconfirmed: the card says it could not confirm (never "nothing was saved"), Re-check stays read-only', async () => {
  const { server, ctl } = makeStudio(ids);
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.importIdea = (async (a: ImportAttempt): Promise<ImportOutcome> => { server.calls.imports.push(a); server.externalImport(a.ideaId); return { kind: 'existing' }; }) as typeof server.importIdea;
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'unconfirmed');
  ctl.recheck(); await settleAll();
  assert.equal(server.calls.imports.length, 1, 'Re-check never writes');
  assert.doesNotMatch(UNCERTAIN_COPY, /nothing was saved/i);
});

test('no extra pool read when no request was sent (pin read failed): not-started never refreshes', async () => {
  const { server, ctl } = makeStudio(ids);
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.failOverview = true;
  const before = server.calls.overview;
  ctl.add(); await settleAll();
  assert.equal(server.calls.overview, before + 1, 'only the failed pin read');
  assert.equal(server.calls.imports.length, 0);
});

test('uncertain failures that land in `error` (ambiguous lost reply) still refresh the pool exactly once (unchanged behaviour)', async () => {
  const { server, ctl } = makeStudio(ids);
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.dropReplyOnce = true;
  const before = server.calls.overview;
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'error');
  assert.equal(server.calls.overview, before + 2);
  assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-002', 'idea-003']);
});
