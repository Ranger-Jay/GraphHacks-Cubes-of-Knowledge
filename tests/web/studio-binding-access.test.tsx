import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudioPanel } from '../../apps/web/src/studio/StudioPanel';
import { ACCESS_COPY } from '../../apps/web/src/studio/studioGuard';
import { createAccessStore, type AccessStore } from '../../apps/web/src/studio/accessLoader';
import type { Fetcher } from '../../apps/web/src/api';
import { makeStudio, openIdea, phaseOf, ready, settleAll, deferred } from './studio-harness';

/**
 * v049 access-to-UI binding: the server capability flows store -> controller env -> panel Add state.
 * These tests render with renderToStaticMarkup (SSR, no DOM, no effects), so each test drives exactly the
 * calls the panel's effects perform — store.subscribe(apply) + setEnv — and then renders the real panel.
 * The effects themselves now run for real in tests/web/studio-access-lifecycle.test.tsx (JSDOM +
 * createRoot + act), including unmount/remount and StrictMode replay.
 */

const ownerBody = { access: 'OWNER', canReadIdeas: true, canImportIdeas: true };
const readerBody = { access: 'READER', canReadIdeas: true, canImportIdeas: false };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const status = (code: number) => new Response('', { status: code });

/** A store fetcher scripted per URL, mutable mid-test so a test can flip the server's answer. */
function scriptedStore() {
  const replies = new Map<string, () => Promise<Response>>();
  const fetcher: Fetcher = async input => {
    const next = replies.get(input);
    if (!next) throw new Error(`unexpected fetch: ${input}`);
    return next();
  };
  return { fetcher, replies };
}
const ALIAS = '/api/owner-rehearsal/session/access';
const ORDINARY = '/api/session/access';

/** Mirror of the panel's setEnv effect: apply the store's live access to the controller on every change. */
function wire(store: AccessStore, ctl: ReturnType<typeof makeStudio>['ctl'], phase: 'READY' = 'READY') {
  const apply = () => ctl.setEnv({ phase, access: store.getSnapshot() });
  apply();
  return store.subscribe(apply);
}

const panel = (ctl: ReturnType<typeof makeStudio>['ctl'], store: AccessStore) =>
  renderToStaticMarkup(<StudioPanel controller={ctl} phase="READY" accessStore={store} />);
const addEnabled = (html: string) => /<button[^>]*class="idea-card-add"(?![^>]*disabled)[^>]*>/.test(html);
const addDisabled = (html: string) => /<button[^>]*class="idea-card-add"[^>]*disabled/.test(html);

test('real access-to-UI binding: OWNER from the alias enables Add on the one card', async () => {
  const { fetcher, replies } = scriptedStore();
  replies.set(ALIAS, async () => json(200, ownerBody));
  const store = createAccessStore(fetcher);
  const { ctl } = makeStudio();
  wire(store, ctl);
  await ready(ctl, 'UNKNOWN');
  await store.refresh();
  await openIdea(ctl, 'idea-001');
  const html = panel(ctl, store);
  assert.ok(addEnabled(html), 'Add enabled only after the server OWNER capability');
  assert.ok(html.includes('idea-001.txt'));
});

test('READER from the alias keeps Add off with the reader copy', async () => {
  const { fetcher, replies } = scriptedStore();
  replies.set(ALIAS, async () => json(200, readerBody));
  const store = createAccessStore(fetcher);
  const { ctl } = makeStudio();
  wire(store, ctl);
  await ready(ctl, 'UNKNOWN');
  await store.refresh();
  await openIdea(ctl, 'idea-001');
  const html = panel(ctl, store);
  assert.ok(addDisabled(html));
  assert.ok(html.includes(ACCESS_COPY.READER));
});

test('disabled alias falls back to ordinary READER: reads work, Add stays off', async () => {
  const { fetcher, replies } = scriptedStore();
  replies.set(ALIAS, async () => status(404));
  replies.set(ORDINARY, async () => json(200, readerBody));
  const store = createAccessStore(fetcher);
  const { ctl } = makeStudio();
  wire(store, ctl);
  await ready(ctl, 'UNKNOWN');
  assert.equal(await store.refresh(), 'READER');
  await openIdea(ctl, 'idea-001');
  const html = panel(ctl, store);
  assert.ok(addDisabled(html), 'the fallback must never authorize the absent owner transport');
  assert.ok(html.includes(ACCESS_COPY.READER));
});

test('missing token (alias 401) and malformed alias both fail closed: Add off, UNKNOWN copy', async () => {
  for (const [reply, label] of [
    [async () => status(401), 'alias 401: no session presented'],
    [async () => json(200, { access: 'OWNER', canReadIdeas: true, canImportIdeas: false }), 'alias inconsistent'],
    [async () => new Response('not json{', { status: 200 }), 'alias malformed'],
  ] as const) {
    const { fetcher, replies } = scriptedStore();
    replies.set(ALIAS, reply);
    const store = createAccessStore(fetcher);
    const { ctl } = makeStudio();
    wire(store, ctl);
    await ready(ctl, 'UNKNOWN');
    assert.equal(await store.refresh(), 'UNKNOWN', label);
    await openIdea(ctl, 'idea-001');
    const html = panel(ctl, store);
    assert.ok(addDisabled(html), label);
    assert.ok(html.includes(ACCESS_COPY.UNKNOWN), label);
  }
});

test('capability loss during an in-flight import, end to end through the store: no late Added', async () => {
  const { fetcher, replies } = scriptedStore();
  replies.set(ALIAS, async () => json(200, ownerBody));
  const store = createAccessStore(fetcher);
  const { server, ctl, added } = makeStudio();
  wire(store, ctl);
  await ready(ctl, 'UNKNOWN');
  await store.refresh();
  assert.equal(ctl.getSnapshot().env.access, 'OWNER');
  await openIdea(ctl, 'idea-001');
  const hold = deferred<void>();
  server.holdImport = hold;
  ctl.add();
  for (let i = 0; i < 100 && server.calls.imports.length === 0; i++) await new Promise(r => setImmediate(r));
  assert.equal(server.calls.imports.length, 1);
  // The server now refuses the session: the store re-resolves to DENIED and the controller abandons the import.
  replies.set(ALIAS, async () => status(403));
  assert.equal(await store.refresh(), 'DENIED');
  assert.equal(ctl.getSnapshot().env.access, 'DENIED');
  hold.resolve();
  await settleAll();
  assert.equal(added.length, 0, 'no late Added after capability loss');
  assert.notEqual(phaseOf(ctl), 'added');
});

test('late completion after disposal: a delayed OWNER never lands, nothing crashes', async () => {
  const held = deferred<Response>();
  let fetches = 0;
  const fetcher: Fetcher = async () => { fetches++; return held.promise; };
  const store = createAccessStore(fetcher);
  const { ctl } = makeStudio();
  wire(store, ctl);
  await ready(ctl, 'UNKNOWN');
  const pending = store.refresh();
  // Mirror the panel unmount cleanup: dispose the store, reset the controller env.
  store.dispose();
  ctl.setEnv({ phase: 'CHECKING', access: 'UNKNOWN' });
  held.resolve(json(200, ownerBody));
  assert.equal(await pending, 'UNKNOWN');
  assert.equal(store.getSnapshot(), 'UNKNOWN');
  assert.equal(ctl.getSnapshot().env.access, 'UNKNOWN');
  assert.equal(fetches, 1);
});
