import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { StudioPanel } from '../../apps/web/src/studio/StudioPanel';
import { createAccessStore, type AccessStore } from '../../apps/web/src/studio/accessLoader';
import type { Fetcher } from '../../apps/web/src/api';
import type { IdeaStudioController } from '../../apps/web/src/studio/studioController';
import { deferred, makeStudio } from './studio-harness';

/**
 * v049 lifecycle regression: the panel's REAL React effects (subscribe + setEnv on store change,
 * refresh/clear on phase, clear on unmount) running against a REAL JSDOM DOM, the REAL controller and
 * the REAL access store. The earlier binding tests render with renderToStaticMarkup (SSR, no effects) and
 * drive exactly the calls the effects perform; they cannot catch a store that outlives the panel while its
 * unmount cleanup bricks it. These tests mount/unmount the panel through createRoot + act and assert the
 * REAL DOM Add button alongside store/controller state.
 *
 * The server side is a SYNTHETIC fixture: a scripted fetcher standing in for the fixture/dev-proxy server.
 * It answers the alias access URL from a mutable mode (OWNER / 403) and counts alias GETs, so a test can
 * flip the server's answer mid-test and prove whether the panel/store performed a fresh GET.
 */

const ownerBody = { access: 'OWNER', canReadIdeas: true, canImportIdeas: true };
const json = (statusCode: number, body: unknown) => new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json' } });
const status = (code: number) => new Response('', { status: code });
const ALIAS = '/api/owner-rehearsal/session/access';

const GLOBAL_KEYS = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'] as const;
interface DomEnv { container: HTMLDivElement; root: Root | null }

/**
 * One real JSDOM window per test, installed as globals (HTTP origin, configurable navigator) and fully
 * torn down afterwards: root unmounted, container removed, window closed, previous globals restored.
 * A leaked window/root would contaminate the other web tests in this process.
 */
function setupDom(t: TestContext): DomEnv {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  // Save full descriptors: Node's global `navigator` is a getter-only property, so plain assignment
  // throws and a value restore would silently change it. defineProperty installs and restores exactly.
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const key of GLOBAL_KEYS) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  const install: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(install)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true, enumerable: true });
  }
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const env: DomEnv = { container, root: null };
  t.after(() => {
    if (env.root) { const r = env.root; env.root = null; act(() => { r.unmount(); }); }
    container.remove();
    dom.window.close();
    const globals = globalThis as unknown as Record<string, unknown>;
    for (const key of GLOBAL_KEYS) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    }
  });
  return env;
}

/** Let chained promise rounds (effects -> fetch -> store emit -> re-render -> controller pool/detail) settle. */
const flush = async (rounds = 40): Promise<void> => { for (let i = 0; i < rounds; i++) await new Promise(r => setImmediate(r)); };

async function mountPanel(env: DomEnv, ctl: IdeaStudioController, store: AccessStore, strict = false): Promise<void> {
  const root = createRoot(env.container);
  env.root = root;
  const panel = <StudioPanel controller={ctl} phase="READY" accessStore={store} />;
  await act(async () => { root.render(strict ? <StrictMode>{panel}</StrictMode> : panel); await flush(); });
}

async function unmountPanel(env: DomEnv): Promise<void> {
  const root = env.root;
  if (!root) return;
  env.root = null;
  await act(async () => { root.unmount(); await flush(); });
}

const addButton = (container: HTMLDivElement): HTMLButtonElement | null =>
  container.querySelector('.idea-card-add') as HTMLButtonElement | null;

const assertAdd = (container: HTMLDivElement, enabled: boolean, label: string): void => {
  const add = addButton(container);
  assert.ok(add, `${label}: Add button renders`);
  assert.equal(add.disabled, !enabled, `${label}: Add ${enabled ? 'enabled' : 'off'}`);
};

/** Open the card through the real DOM: click the first pool item, as a user would. */
async function openCard(container: HTMLDivElement): Promise<void> {
  const item = container.querySelector('.idea-pool-item') as HTMLButtonElement | null;
  assert.ok(item, 'pool item renders so the card can open');
  await act(async () => { item.click(); await flush(); });
}

async function ensureCardOpen(container: HTMLDivElement): Promise<void> {
  if (!addButton(container)) await openCard(container);
  assert.ok(addButton(container), 'card opens with an Add button');
}

/** SYNTHETIC fixture (see header): scripted alias answers + alias GET count + one held GET. */
function scriptedAccess() {
  let mode: 'owner' | 'denied' = 'owner';
  let held: ReturnType<typeof deferred<Response>> | null = null;
  let fetches = 0;
  const fetcher: Fetcher = async input => {
    if (input !== ALIAS) throw new Error(`unexpected fetch: ${input}`);
    fetches++;
    if (held) { const h = held; held = null; return h.promise; }
    return mode === 'owner' ? json(200, ownerBody) : status(403);
  };
  return {
    fetcher,
    setMode: (next: 'owner' | 'denied'): void => { mode = next; },
    /** The next alias GET returns this held promise instead of an immediate answer. */
    holdNext: () => { held = deferred<Response>(); return held; },
    fetches: () => fetches,
  };
}

test('OWNER -> leave route -> server 403 -> return: fresh GET, Add off, no stale OWNER', async t => {
  const env = setupDom(t);
  const access = scriptedAccess();
  const store = createAccessStore(access.fetcher);
  const { ctl } = makeStudio();
  await mountPanel(env, ctl, store);
  assert.equal(store.getSnapshot(), 'OWNER');
  assert.equal(access.fetches(), 1);
  await ensureCardOpen(env.container);
  assertAdd(env.container, true, 'OWNER mount');
  // Leaving the release route unmounts the PANEL; the binding/store outlives it (main.tsx creates it once).
  await unmountPanel(env);
  assert.equal(store.getSnapshot(), 'UNKNOWN', 'unmount clears: it must not keep OWNER and must not brick the store');
  assert.equal(ctl.getSnapshot().env.phase, 'CHECKING');
  // The fixture server now refuses the session.
  access.setMode('denied');
  await mountPanel(env, ctl, store);
  assert.equal(access.fetches(), 2, 'remount performs a FRESH GET; it must not trust the pre-leave OWNER');
  assert.equal(store.getSnapshot(), 'DENIED');
  assert.equal(ctl.getSnapshot().env.access, 'DENIED');
  await ensureCardOpen(env.container);
  assertAdd(env.container, false, 'denied remount');
});

test('valid OWNER return: fresh GET, Add enabled only after the fresh response', async t => {
  const env = setupDom(t);
  const access = scriptedAccess();
  const store = createAccessStore(access.fetcher);
  const { ctl } = makeStudio();
  await mountPanel(env, ctl, store);
  assert.equal(store.getSnapshot(), 'OWNER');
  await ensureCardOpen(env.container);
  assertAdd(env.container, true, 'OWNER mount');
  await unmountPanel(env);
  assert.equal(store.getSnapshot(), 'UNKNOWN');
  await mountPanel(env, ctl, store);
  assert.equal(access.fetches(), 2, 'remount re-resolves from the server even when the answer is the same OWNER');
  assert.equal(store.getSnapshot(), 'OWNER');
  await ensureCardOpen(env.container);
  assertAdd(env.container, true, 'OWNER remount');
});

test('loaded-OWNER permanent disposal: snapshot UNKNOWN, no stale grant, no later fetch', async t => {
  // Store level: dispose() of a loaded OWNER store resets the cached capability.
  const access = scriptedAccess();
  const store = createAccessStore(access.fetcher);
  assert.equal(await store.refresh(), 'OWNER');
  store.dispose();
  assert.equal(store.getSnapshot(), 'UNKNOWN', 'a disposed store must not expose the stale OWNER');
  assert.equal(await store.refresh(), 'UNKNOWN', 'refresh after disposal performs no fetch');
  assert.equal(access.fetches(), 1, 'no fetch after disposal');

  // Effect level: dispose while the panel is mounted fails the UI closed, and a remount stays closed.
  const env = setupDom(t);
  const access2 = scriptedAccess();
  const store2 = createAccessStore(access2.fetcher);
  const { ctl } = makeStudio();
  await mountPanel(env, ctl, store2);
  assert.equal(store2.getSnapshot(), 'OWNER');
  await ensureCardOpen(env.container);
  assertAdd(env.container, true, 'OWNER mount');
  await act(async () => { store2.dispose(); await flush(); });
  assert.equal(store2.getSnapshot(), 'UNKNOWN');
  assert.equal(ctl.getSnapshot().env.access, 'UNKNOWN', 'the mounted panel reports the disposal to the controller');
  assertAdd(env.container, false, 'disposed mount');
  await unmountPanel(env);
  await mountPanel(env, ctl, store2);
  assert.equal(access2.fetches(), 1, 'a disposed store never re-resolves, even on remount');
  assert.equal(store2.getSnapshot(), 'UNKNOWN');
  await ensureCardOpen(env.container);
  assertAdd(env.container, false, 'disposed remount');
});

test('StrictMode setup/cleanup/setup replay stays usable: store re-resolves, Add enabled', async t => {
  const env = setupDom(t);
  const access = scriptedAccess();
  const store = createAccessStore(access.fetcher);
  const { ctl } = makeStudio();
  await mountPanel(env, ctl, store, true);
  assert.equal(store.getSnapshot(), 'OWNER', 'StrictMode replay must not brick the store at UNKNOWN');
  await ensureCardOpen(env.container);
  assertAdd(env.container, true, 'StrictMode mount');
  // Exactly two GETs: setup refresh, cleanup clear, setup refresh. The first response is discarded by
  // the generation guard and the second applies OWNER. (On the pre-fix code the cleanup disposed the
  // store, the second refresh no-op'd, and the snapshot stayed UNKNOWN.)
  assert.equal(access.fetches(), 2, 'StrictMode setup/cleanup/setup replay ran a second capability GET');
});

test('in-flight access refresh abandoned on unmount: a late OWNER never lands', async t => {
  const env = setupDom(t);
  const access = scriptedAccess();
  const held = access.holdNext();
  const store = createAccessStore(access.fetcher);
  const { ctl } = makeStudio();
  await mountPanel(env, ctl, store);
  assert.equal(access.fetches(), 1, 'one capability GET in flight');
  assert.equal(store.getSnapshot(), 'UNKNOWN', 'nothing applied before the response');
  // Leaving the route while the GET is in flight: unmount clears and invalidates the pending response.
  await unmountPanel(env);
  held.resolve(json(200, ownerBody));
  await flush();
  assert.equal(store.getSnapshot(), 'UNKNOWN', 'the late OWNER is discarded by the generation guard');
  // Returning re-resolves from the server.
  await mountPanel(env, ctl, store);
  assert.equal(access.fetches(), 2, 'remount performs a fresh GET');
  assert.equal(store.getSnapshot(), 'OWNER');
});
