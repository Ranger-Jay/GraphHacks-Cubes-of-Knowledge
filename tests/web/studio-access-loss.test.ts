import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStudio, openIdea, phaseOf, ready, settleAll, deferred } from './studio-harness';

/**
 * v049: losing OWNER while staying READY must invalidate in-flight imports/read-backs exactly as leaving
 * READY does. A late completion after the loss is discarded: no Added, no onAdded, the attempt stays pinned
 * for a later reconcile. Pool/detail reads are reader data and stay valid.
 */

test('owner access lost during an in-flight import: late completion discarded, no Added', async () => {
  for (const lost of ['READER', 'DENIED', 'UNKNOWN'] as const) {
    const { server, ctl, added } = makeStudio();
    await ready(ctl, 'OWNER'); await openIdea(ctl, 'idea-001');
    const hold = deferred<void>();
    server.holdImport = hold;
    ctl.add();
    // Wait until the import request has actually left (attempt pinned, server holding it) — polling the
    // card phase is not enough, because 'pending' appears at submit, before the attempt is pinned.
    for (let i = 0; i < 100 && server.calls.imports.length === 0; i++) await new Promise(r => setImmediate(r));
    assert.equal(server.calls.imports.length, 1, 'import in flight before access loss');
    ctl.setEnv({ phase: 'READY', access: lost });
    hold.resolve();
    await settleAll();
    assert.equal(added.length, 0, `${lost}: no Added after access loss`);
    assert.notEqual(phaseOf(ctl), 'added', `${lost}: card must not claim Added`);
    assert.ok(ctl.attemptFor('idea-001') !== null, `${lost}: attempt stays pinned for a later reconcile`);
  }
});

test('owner access lost during the verifying read-back: no Added from the fresh read-back', async () => {
  const { server, ctl, added } = makeStudio();
  await ready(ctl, 'OWNER'); await openIdea(ctl, 'idea-001');
  // Hold only the verify read-back: it runs while the card is verifying.
  const origOverview = server.overview.bind(server);
  const hold = deferred<void>();
  let held = false;
  server.overview = async () => {
    if (ctl.getSnapshot().open?.state.phase === 'verifying' && !held) { held = true; await hold.promise; }
    return origOverview();
  };
  ctl.add();
  for (let i = 0; i < 100 && phaseOf(ctl) !== 'verifying'; i++) await new Promise(r => setImmediate(r));
  assert.equal(phaseOf(ctl), 'verifying');
  ctl.setEnv({ phase: 'READY', access: 'READER' });
  hold.resolve();
  await settleAll();
  assert.equal(added.length, 0, 'no Added after access loss during read-back');
  assert.notEqual(phaseOf(ctl), 'added');
  assert.equal(phaseOf(ctl), 'unconfirmed', 'attempt stays unresolved, not silently dropped');
  assert.ok(ctl.hasUnresolved('idea-001'));
});

test('owner access lost with nothing in flight: pool stays (reader data), Add blocks with the new access', async () => {
  const { ctl } = makeStudio();
  await ready(ctl, 'OWNER');
  assert.equal(ctl.getSnapshot().pool.ideas.length, 2);
  ctl.setEnv({ phase: 'READY', access: 'READER' });
  assert.equal(ctl.getSnapshot().pool.ideas.length, 2, 'pool is reader data: not cleared by access loss');
  assert.equal(ctl.getSnapshot().env.access, 'READER');
});

test('access gain does not abandon anything: READER -> OWNER enables Add on the same card', async () => {
  const { ctl } = makeStudio();
  await ready(ctl, 'READER'); await openIdea(ctl, 'idea-001');
  assert.ok(ctl.getSnapshot().open?.addBlockedReason !== null, 'Add blocked as READER');
  ctl.setEnv({ phase: 'READY', access: 'OWNER' });
  assert.equal(ctl.getSnapshot().open?.addBlockedReason, null, 'Add enabled after OWNER, no spurious abandon');
});
