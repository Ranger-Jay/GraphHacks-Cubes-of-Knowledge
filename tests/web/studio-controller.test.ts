import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBlockedReason, ACCESS_COPY, READY_REQUIRED_COPY } from '../../apps/web/src/studio/studioGuard';
import { IMPORT_UNBOUND_COPY, createImportAttempt, type ImportReceipt } from '../../apps/web/src/studio/ideaImport';
import { IdeaStudioController } from '../../apps/web/src/studio/studioController';
import { FakeServer, deferred, makeStudio, openIdea, phaseOf, ready, settleAll, HASH } from './studio-harness';
import type { ScenePhase } from '@cubes/contracts';

const PHASES: ScenePhase[] = ['CHECKING', 'ACCESS_DENIED', 'NOT_FOUND', 'UNAVAILABLE', 'GRAPH_UNAVAILABLE', 'READY'];

test('guard: Add is allowed only when bound AND READY AND owner; absent runtime/unknown access fail closed', () => {
  for (const phase of PHASES) for (const access of ['OWNER', 'READER', 'UNKNOWN', 'DENIED'] as const) {
    const r = addBlockedReason({ phase, access }, true);
    assert.equal(r === null, phase === 'READY' && access === 'OWNER', `${phase}/${access}`);
  }
  assert.equal(addBlockedReason({ phase: 'READY', access: 'OWNER' }, false), IMPORT_UNBOUND_COPY);
  assert.equal(addBlockedReason(null, true), READY_REQUIRED_COPY);
  assert.equal(addBlockedReason(undefined, true), READY_REQUIRED_COPY);
  assert.equal(addBlockedReason({ phase: undefined, access: 'OWNER' }, true), READY_REQUIRED_COPY);
  assert.equal(addBlockedReason({ phase: 'READY', access: 'READER' }, true), ACCESS_COPY.READER);
  assert.equal(addBlockedReason({ phase: 'READY', access: 'bogus' as never }, true), ACCESS_COPY.UNKNOWN);
  for (const t of [READY_REQUIRED_COPY, ...Object.values(ACCESS_COPY)]) assert.doesNotMatch(t, /disconnect|reconnect|outage|nothing was saved/i);
});

test('guard in the controller: outside READY, or without owner access, Add makes ZERO reads and ZERO writes', async () => {
  for (const [phase, access] of [['CHECKING', 'OWNER'], ['GRAPH_UNAVAILABLE', 'OWNER'], ['ACCESS_DENIED', 'OWNER'], ['READY', 'READER'], ['READY', 'UNKNOWN']] as const) {
    const { server, ctl } = makeStudio();
    await ready(ctl, 'OWNER'); await openIdea(ctl, 'idea-001');
    ctl.setEnv({ phase, access }); await settleAll();
    const before = server.calls.overview;
    ctl.add(); ctl.recheck(); ctl.newAttempt(); await settleAll();
    assert.equal(server.calls.imports.length, 0, `${phase}/${access}`);
    assert.equal(server.calls.checks.length, 0, `${phase}/${access}`);
    assert.ok(server.calls.overview <= before + 1, 'only a pool refresh on returning to READY may read');
  }
  // Fresh controller that was never told the phase: CHECKING + UNKNOWN.
  const { server, ctl } = makeStudio();
  await ctl.open('idea-001'); ctl.add(); await settleAll();
  assert.deepEqual([ctl.getSnapshot().env.phase, ctl.getSnapshot().open, server.calls.imports.length, server.calls.overview], ['CHECKING', null, 0, 0]);
});

test('guard: the pool is withheld outside READY and an unbound controller never adds', async () => {
  const { ctl } = makeStudio();
  await ready(ctl);
  assert.equal(ctl.getSnapshot().pool.ideas.length, 2);
  ctl.setEnv({ phase: 'GRAPH_UNAVAILABLE', access: 'OWNER' });
  assert.equal(ctl.getSnapshot().pool.ideas.length, 0, 'old pool must not look current outside READY');
  const { server, ctl: c2 } = makeStudio(['idea-001'], {}, { unbound: true });
  await ready(c2); await openIdea(c2, 'idea-001');
  assert.equal(c2.getSnapshot().open?.addBlockedReason, IMPORT_UNBOUND_COPY);
  c2.add(); await settleAll();
  assert.equal(server.calls.imports.length, 0);
});

test('happy path: attempt pinned from a fresh read, one import call, fresh read-back, Added, onAdded exactly once, pool refreshed', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  const snap = ctl.getSnapshot();
  assert.deepEqual([snap.pool.ideas.map(i => i.id), snap.open?.detail, snap.open?.state.phase, snap.open?.addBlockedReason], [['idea-001', 'idea-002'], 'ready', 'idle', null]);
  assert.equal(server.calls.imports.length, 0, 'opening never imports');
  ctl.add(); ctl.add(); ctl.add();                       // double/triple click
  await settleAll();
  assert.equal(server.calls.imports.length, 1, 'one submit');
  assert.deepEqual({ ...server.calls.imports[0]! }, { ideaId: 'idea-001', idempotencyKey: 'attempt-key-0001', expectedRevision: 3 });
  assert.equal(phaseOf(ctl), 'added');
  assert.equal(added.length, 1);
  assert.equal(added[0]!.receipt.membershipId, 'member-idea-001');
  assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-002'], 'pool refreshed after Added');
  ctl.add(); ctl.recheck(); await settleAll();
  assert.equal(server.calls.imports.length, 1); assert.equal(added.length, 1, 'no second pull');
});

test('lost reply after a real commit: Retry reuses the SAME pinned tuple (revision NOT re-read) and replays; Added once', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.dropReplyOnce = true;
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'error');
  assert.match(JSON.stringify(ctl.getSnapshot().open?.state), /ambiguous/);
  assert.equal(server.revision, 4, 'the write really committed');
  const first = server.calls.imports[0]!;
  // The workspace moves (someone else imports) while the card is uncertain.
  server.externalImport('idea-002');
  assert.equal(server.revision, 5);
  const overviewBefore = server.calls.overview;
  ctl.add(); await settleAll();
  assert.equal(server.calls.imports.length, 2);
  assert.deepEqual({ ...server.calls.imports[1]! }, { ...first }, 'identical tuple: same key AND the original expectedRevision');
  assert.equal(server.calls.imports[1]!.expectedRevision, 3, 'not re-read from the moved workspace (5)');
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1);
  assert.ok(server.calls.overview - overviewBefore <= 3, 'retry reads only for read-back + pool, never to re-pin');
  // Negative control: the failure mode this prevents. Same key with a re-read revision is KEY_REUSED on the server.
  const wrong = createImportAttempt('idea-001', first.idempotencyKey, 5);
  assert.deepEqual(await server.importIdea(wrong), { kind: 'key-reused' });
});

test('stale revision: Retry is NOT offered; New attempt needs a fresh overview and a NEW key (never the old key with a new revision)', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  const hold = deferred<void>(); server.holdImport = hold;
  ctl.add(); await settleAll();
  server.holdImport = null;
  server.externalImport('idea-002');                      // revision 3 -> 4 after the tuple was pinned at 3
  hold.resolve(); await settleAll();
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'error' && st.reason], ['error', 'stale']);
  const old = server.calls.imports[0]!;
  ctl.add(); await settleAll();
  assert.equal(server.calls.imports.length, 1, 'no same-tuple Retry after a stale revision');
  ctl.newAttempt(); await settleAll();
  assert.equal(phaseOf(ctl), 'idle', 'a new attempt is pinned but never auto-submitted');
  const fresh = ctl.attemptFor('idea-001')!;
  assert.deepEqual({ ...fresh }, { ideaId: 'idea-001', idempotencyKey: 'attempt-key-0002', expectedRevision: 4 });
  assert.notEqual(fresh.idempotencyKey, old.idempotencyKey);
  assert.equal(server.calls.imports.length, 1);
  ctl.add(); await settleAll();
  assert.deepEqual({ ...server.calls.imports[1]! }, { ...fresh });
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1);
});

test('close mid-flight: late completion is discarded (no Added, no onAdded), the pool is refreshed, the attempt stays pinned for reopen', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  const hold = deferred<void>(); server.holdImport = hold;
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'pending');
  ctl.close();
  assert.equal(ctl.getSnapshot().open, null);
  hold.resolve(); await settleAll();                      // the write commits and a receipt arrives, for a closed card
  assert.equal(added.length, 0, 'closing discards the stale completion: no pull');
  assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-002'], 'the committed idea leaves the pool without a card');
  assert.equal(server.calls.imports.length, 1);
});

test('close mid-flight then reopen: the unresolved attempt is reused, never a second silent attempt; Re-check is read only; Retry is the same tuple', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  const hold = deferred<void>(); server.holdImport = hold;
  server.dropReplyOnce = false;
  ctl.add(); await settleAll();
  const pinned = ctl.attemptFor('idea-001')!;
  ctl.close(); await openIdea(ctl, 'idea-001');
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'unconfirmed' && st.reason], ['unconfirmed', 'unresolved']);
  assert.equal(ctl.attemptFor('idea-001'), pinned, 'the very same frozen tuple');
  assert.equal(server.calls.imports.length, 1, 'reopening does not submit');
  // Server has not committed yet (still held): the read-only check observes nothing, and says it proves nothing.
  ctl.recheck(); await settleAll();
  assert.equal(server.calls.imports.length, 1, 'Re-check never writes'); assert.equal(server.calls.checks.length, 1);
  assert.deepEqual({ ...server.calls.checks[0]! }, { ...pinned });
  assert.match(JSON.stringify(ctl.getSnapshot().open?.state), /not-observed/);
  hold.resolve(); await settleAll();
  assert.equal(added.length, 0, 'the first request\'s late completion is stale');
  // Retry: same tuple. The server already committed under that key, so it replays and the fresh read confirms.
  server.holdImport = null;
  await ctl.refreshPool(); await settleAll();
  assert.equal(ctl.getSnapshot().open?.state.phase, 'unconfirmed');
  ctl.add(); await settleAll();
  assert.equal(server.calls.imports.length, 2);
  assert.deepEqual({ ...server.calls.imports[1]! }, { ...pinned });
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1, 'exactly one pull for the membership');
});

test('Re-check makes ZERO writes in every uncertain state; own receipt re-reads, no receipt checks status', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.hideImportedFromOverview = true;                 // the fresh read does not show the committed idea yet
  ctl.add(); await settleAll();
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'unconfirmed' && st.reason, st.phase === 'unconfirmed' && st.receipt !== null], ['unconfirmed', 'not-imported', true]);
  assert.equal(added.length, 0);
  ctl.recheck(); await settleAll();
  assert.equal(phaseOf(ctl), 'unconfirmed', 'still not shown');
  assert.equal(server.calls.imports.length, 1, 'read-back Re-check never calls importIdea');
  assert.equal(server.calls.checks.length, 0, 'with a kept own receipt the fresh overview read IS the re-check');
  server.hideImportedFromOverview = false;
  ctl.recheck(); await settleAll();
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1); assert.equal(server.calls.imports.length, 1);
  ctl.recheck(); await settleAll();
  assert.equal(added.length, 1, 'onAdded fires once');
});

test('forged receipts never reach Added or onAdded: never persisted, tampered membership/hash/workspace, duplicate', async () => {
  const forged = (over: Partial<ImportReceipt>): ImportReceipt => ({ ideaId: 'idea-001', sha256: HASH(1), workspaceId: 'ws-1', importedAt: '2026-10-16T04:00:00.000Z', workspaceRevision: 4, membershipId: 'member-idea-001', ...over });
  for (const [name, r] of [['never persisted', forged({})], ['wrong membership', forged({ membershipId: 'member-x' })], ['wrong hash', forged({ sha256: HASH(9) })], ['wrong workspace', forged({ workspaceId: 'ws-evil' })],
    ['other idea', forged({ ideaId: 'idea-002' })], ['alias key', { ...forged({}), fileSha256: HASH(1) } as unknown as ImportReceipt], ['revision from the future', forged({ workspaceRevision: 99 })]] as const) {
    const { server, ctl, added } = makeStudio();
    await ready(ctl); await openIdea(ctl, 'idea-001');
    server.forgeReceiptOnce = r;
    ctl.add(); await settleAll();
    assert.notEqual(phaseOf(ctl), 'added', name);
    assert.equal(added.length, 0, name);
    assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-001', 'idea-002'], `${name}: nothing was committed, the pool still lists it`);
  }
  // Duplicate / integrity: the graph withholds the idea with an integrity item; the read-back never says Added.
  for (const reason of ['duplicate import receipts', 'membership edge without an import receipt', 'imported content differs from the current manifest']) {
    const { server, ctl, added } = makeStudio();
    await ready(ctl); await openIdea(ctl, 'idea-001');
    server.integrity = [{ id: 'idea-001', reason }];
    ctl.add(); await settleAll();
    assert.notEqual(phaseOf(ctl), 'added', reason);
    assert.equal(added.length, 0, reason);
  }
});

test('ALREADY_IMPORTED with a receipt confirms as present (no pull); the pin read showing the idea imported is present too', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.externalImport('idea-001');                      // committed by another actor after the pool was read
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'present');
  assert.equal(added.length, 0);
  assert.equal(server.calls.imports.length, 0, 'the fresh pin read already shows it imported: nothing is sent');
  // existing-with-receipt path: pin read happens before the other actor commits.
  const b = makeStudio(); await ready(b.ctl); await openIdea(b.ctl, 'idea-001');
  const hold = deferred<void>(); b.server.holdImport = hold;
  b.ctl.add(); await settleAll();
  b.server.externalImport('idea-001'); b.server.holdImport = null; hold.resolve(); await settleAll();
  assert.equal(phaseOf(b.ctl), 'present');
  assert.equal(b.added.length, 0, 'someone else\'s receipt is never a pull');
});

test('pin read failure: NO request is sent and the card says so; Retry pins again', async () => {
  const { server, ctl } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.failOverview = true;
  ctl.add(); await settleAll();
  assert.deepEqual([server.calls.imports.length, ctl.attemptFor('idea-001')], [0, null]);
  const st = ctl.getSnapshot().open!.state;
  assert.deepEqual([st.phase, st.phase === 'error' && st.reason], ['error', 'not-started']);
  server.failOverview = false;
  ctl.add(); await settleAll();
  assert.equal(phaseOf(ctl), 'added');
});

test('denied (401/403) turns Add off for the session until access is re-reported; rejected offers nothing', async () => {
  const { server, ctl } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.deny = true;
  ctl.add(); await settleAll();
  assert.equal(ctl.getSnapshot().env.access, 'DENIED');
  assert.equal(ctl.getSnapshot().open?.addBlockedReason, ACCESS_COPY.DENIED);
  server.deny = false;
  ctl.add(); await settleAll();
  assert.equal(server.calls.imports.length, 1, 'no further attempts while denied');
  ctl.setEnv({ phase: 'READY', access: 'READER' }); ctl.setEnv({ phase: 'READY', access: 'OWNER' });
  assert.equal(ctl.getSnapshot().env.access, 'OWNER');
});

test('leaving READY mid-flight: the late completion is discarded (no Added, no onAdded); on return the pool is fresh and the attempt unresolved', async () => {
  for (const when of ['pending', 'verifying'] as const) {
    const { server, ctl, added } = makeStudio();
    await ready(ctl); await openIdea(ctl, 'idea-001');
    const hold = deferred<void>();
    if (when === 'pending') server.holdImport = hold;
    const readHold = deferred<void>();
    if (when === 'verifying') { const real = server.overview; let n = 0; (server as { overview: typeof real }).overview = async () => { n++; if (n === 2) await readHold.promise; return real(); }; }
    ctl.add(); await settleAll();
    assert.equal(ctl.getSnapshot().open?.state.phase, when, 'the request is in flight when the phase leaves READY');
    ctl.setEnv({ phase: 'GRAPH_UNAVAILABLE', access: 'OWNER' });
    const st = ctl.getSnapshot();
    assert.equal(st.pool.ideas.length, 0, when);
    hold.resolve(); readHold.resolve(); await settleAll();
    assert.equal(added.length, 0, `${when}: stale completion after leaving READY`);
    assert.notEqual(ctl.getSnapshot().open?.state.phase, 'added', when);
    assert.equal(ctl.getSnapshot().open?.addBlockedReason, READY_REQUIRED_COPY);
    ctl.setEnv({ phase: 'READY', access: 'OWNER' }); await settleAll();
    assert.ok(ctl.getSnapshot().pool.status === 'ready' || ctl.getSnapshot().pool.status === 'unavailable', when);
    assert.equal(added.length, 0);
  }
});

test('detail must match the overview (id + manifest hash) or the text is unavailable and Add is off; no fallback text', async () => {
  const { server, ctl } = makeStudio();
  server.detail = async id => ({ kind: 'ready', idea: { ...server.view(id), sha256: HASH(77), text: 'A different file.' } });
  await ready(ctl); await openIdea(ctl, 'idea-001');
  const o = ctl.getSnapshot().open!;
  assert.deepEqual([o.detail, o.idea.text], ['unavailable', '']);
  ctl.add(); await settleAll();
  assert.equal(server.calls.imports.length, 0);
});

test('pool refresh: an older read that finishes last is discarded; a failing read is unavailable, never an old pool', async () => {
  const { server, ctl } = makeStudio();
  const slow = deferred<void>(); const real = server.overview; let n = 0;
  (server as { overview: typeof real }).overview = async () => { n++; if (n === 2) { const r = await real(); await slow.promise; return r; } return real(); };
  await ready(ctl);                                                    // read 1
  const first = ctl.refreshPool(); await settleAll();                  // read 2 (slow, stale snapshot)
  server.externalImport('idea-001');
  await ctl.refreshPool(); await settleAll();                          // read 3 (newer, idea-001 imported)
  slow.resolve(); await first; await settleAll();
  assert.deepEqual(ctl.getSnapshot().pool.ideas.map(i => i.id), ['idea-002'], 'the stale read did not overwrite the newer pool');
  server.failOverview = true; await ctl.refreshPool(); await settleAll();
  assert.deepEqual([ctl.getSnapshot().pool.status, ctl.getSnapshot().pool.ideas.length], ['unavailable', 0]);
});

test('attempt tuples are frozen and exposed read-only', async () => {
  const { ctl, server } = makeStudio();
  await ready(ctl); await openIdea(ctl, 'idea-001');
  server.dropReplyOnce = true; ctl.add(); await settleAll();
  const a = ctl.attemptFor('idea-001')!;
  assert.ok(Object.isFrozen(a));
  assert.throws(() => { (a as { expectedRevision: number }).expectedRevision = 99; }, TypeError);
  assert.equal(ctl.hasUnresolved('idea-001'), true);
  assert.ok(ctl instanceof IdeaStudioController && !(ctl as unknown as { disposed: boolean }).disposed);
  void FakeServer;
});

test('callbacks work when handed to React unbound (onClick={controller.add}): a bare method call must not lose `this`', async () => {
  const { ctl, server, added } = makeStudio();
  const { open, close, add, recheck, newAttempt, setEnv } = ctl;
  setEnv({ phase: 'READY', access: 'OWNER' }); await settleAll();
  await open('idea-001'); await settleAll();
  add(); await settleAll();
  assert.equal(phaseOf(ctl), 'added'); assert.equal(added.length, 1); assert.equal(server.calls.imports.length, 1);
  recheck(); newAttempt(); close(); await settleAll();
  assert.equal(ctl.getSnapshot().open, null);
});
