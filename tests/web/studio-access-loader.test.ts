import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fetcher } from '../../apps/web/src/api';
import {
  createAccessStore, ORDINARY_ACCESS_URL, OWNER_ALIAS_ACCESS_URL, parseSessionCapability, resolveSessionAccess,
} from '../../apps/web/src/studio/accessLoader';

const ownerBody = { access: 'OWNER', canReadIdeas: true, canImportIdeas: true };
const readerBody = { access: 'READER', canReadIdeas: true, canImportIdeas: false };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const status = (code: number) => new Response('', { status: code });
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

/** A fetcher scripted per URL: each call consumes the next scripted reply for that URL. */
function scripted(replies: Record<string, Array<() => Promise<Response>>>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: Fetcher = async (input, init) => {
    calls.push({ url: input, init });
    const next = replies[input]?.shift();
    if (!next) throw new Error(`unexpected fetch: ${input}`);
    return next();
  };
  return { fetcher, calls };
}
const once = (statusCode: number, body?: unknown) => async () => body === undefined ? status(statusCode) : json(statusCode, body);
const throws = (message: string) => async (): Promise<Response> => { throw new Error(message); };

test('capability validation: exact consistent shapes pass, every forgery fails', () => {
  assert.deepEqual(parseSessionCapability(ownerBody), ownerBody);
  assert.deepEqual(parseSessionCapability(readerBody), readerBody);
  // Inconsistent booleans are forgeries, not capabilities.
  for (const bad of [
    { access: 'OWNER', canReadIdeas: true, canImportIdeas: false },
    { access: 'OWNER', canReadIdeas: false, canImportIdeas: true },
    { access: 'OWNER', canReadIdeas: false, canImportIdeas: false },
    { access: 'READER', canReadIdeas: true, canImportIdeas: true },
    { access: 'READER', canReadIdeas: false, canImportIdeas: false },
    { access: 'READER', canReadIdeas: false, canImportIdeas: true },
    // Wrong types / missing fields / other access values / non-objects.
    { access: 'OWNER', canReadIdeas: 'yes', canImportIdeas: true },
    { access: 'OWNER', canReadIdeas: true, canImportIdeas: 1 },
    { access: 'OWNER', canReadIdeas: true },
    { access: 'OWNER' },
    { access: 'ADMIN', canReadIdeas: true, canImportIdeas: true },
    { access: 'owner', canReadIdeas: true, canImportIdeas: true },
    null, [], 'OWNER', 42, undefined,
  ]) assert.equal(parseSessionCapability(bad), null, JSON.stringify(bad));
});

test('fetch shape: credential-free GET, no-store, exact alias URL, no body', async () => {
  const { fetcher, calls } = scripted({ [OWNER_ALIAS_ACCESS_URL]: [once(200, ownerBody)] });
  assert.equal(await resolveSessionAccess(fetcher), 'OWNER');
  assert.equal(calls.length, 1);
  const first = calls[0];
  assert.ok(first);
  assert.equal(first.url, OWNER_ALIAS_ACCESS_URL);
  assert.equal(first.init?.method, 'GET');
  assert.equal(first.init?.credentials, 'omit');
  assert.equal(first.init?.cache, 'no-store');
  assert.equal(first.init?.body, undefined);
});

test('alias answers are authoritative: OWNER enables, READER reads only', async () => {
  const owner = scripted({ [OWNER_ALIAS_ACCESS_URL]: [once(200, ownerBody)] });
  assert.equal(await resolveSessionAccess(owner.fetcher), 'OWNER');
  const reader = scripted({ [OWNER_ALIAS_ACCESS_URL]: [once(200, readerBody)] });
  assert.equal(await resolveSessionAccess(reader.fetcher), 'READER');
});

test('alias 404 falls back to ordinary read access, capped at READER', async () => {
  const cases: Array<{ ordinary: Array<() => Promise<Response>>; expected: string; label: string }> = [
    { ordinary: [once(200, readerBody)], expected: 'READER', label: 'ordinary READER' },
    { ordinary: [once(200, ownerBody)], expected: 'UNKNOWN', label: 'ordinary OWNER contradicts its transport' },
    { ordinary: [once(403, {})], expected: 'DENIED', label: 'ordinary 403' },
    { ordinary: [once(401, {})], expected: 'UNKNOWN', label: 'ordinary 401' },
    { ordinary: [once(200, { access: 'OWNER', canReadIdeas: true, canImportIdeas: false })], expected: 'UNKNOWN', label: 'ordinary inconsistent' },
    { ordinary: [async () => new Response('not json{', { status: 200 })], expected: 'UNKNOWN', label: 'ordinary malformed' },
    { ordinary: [throws('connect ECONNREFUSED')], expected: 'UNKNOWN', label: 'ordinary network loss' },
    { ordinary: [once(404, {})], expected: 'UNKNOWN', label: 'ordinary also missing' },
  ];
  for (const c of cases) {
    const { fetcher, calls } = scripted({ [OWNER_ALIAS_ACCESS_URL]: [once(404, {})], [ORDINARY_ACCESS_URL]: c.ordinary });
    assert.equal(await resolveSessionAccess(fetcher), c.expected, c.label);
    assert.deepEqual(calls.map(x => x.url), [OWNER_ALIAS_ACCESS_URL, ORDINARY_ACCESS_URL], c.label);
  }
});

test('alias 401/403/malformed/network fail closed with NO fallback; 401 is no session, 403 is a refusal', async () => {
  for (const [reply, expected, label] of [
    [once(401, {}), 'UNKNOWN', 'alias 401 (missing token: no session presented)'],
    [once(403, {}), 'DENIED', 'alias 403'],
    [once(200, { access: 'OWNER', canReadIdeas: true, canImportIdeas: false }), 'UNKNOWN', 'alias inconsistent'],
    [once(200, { access: 'ADMIN', canReadIdeas: true, canImportIdeas: true }), 'UNKNOWN', 'alias forged role'],
    [async () => new Response('not json{', { status: 200 }), 'UNKNOWN', 'alias malformed'],
    [once(500, {}), 'UNKNOWN', 'alias unexpected status'],
    [throws('connect ECONNREFUSED'), 'UNKNOWN', 'alias network loss'],
  ] as const) {
    const { fetcher, calls } = scripted({ [OWNER_ALIAS_ACCESS_URL]: [reply] });
    assert.equal(await resolveSessionAccess(fetcher), expected, label);
    assert.equal(calls.length, 1, `${label}: must not fall back`);
  }
});

test('store: default UNKNOWN, refresh applies, listeners fire only on change', async () => {
  const { fetcher } = scripted({ [OWNER_ALIAS_ACCESS_URL]: [once(200, ownerBody), once(200, ownerBody), once(200, readerBody), once(200, ownerBody)] });
  const store = createAccessStore(fetcher);
  assert.equal(store.getSnapshot(), 'UNKNOWN');
  let calls = 0;
  const off = store.subscribe(() => { calls++; });
  assert.equal(await store.refresh(), 'OWNER');
  assert.equal(calls, 1);
  assert.equal(await store.refresh(), 'OWNER', 'same value: no re-emit');
  assert.equal(calls, 1);
  assert.equal(await store.refresh(), 'READER');
  assert.equal(calls, 2);
  off();
  assert.equal(await store.refresh(), 'OWNER');
  assert.equal(calls, 2, 'unsubscribed listener stays silent');
});

test('store: concurrent refresh shares one request', async () => {
  const held = deferred<Response>();
  let fetches = 0;
  const fetcher: Fetcher = async () => { fetches++; return held.promise; };
  const store = createAccessStore(fetcher);
  const a = store.refresh();
  const b = store.refresh();
  assert.equal(fetches, 1);
  held.resolve(json(200, ownerBody));
  assert.deepEqual([await a, await b], ['OWNER', 'OWNER']);
  assert.equal(store.getSnapshot(), 'OWNER');
});

test('store: clear invalidates a delayed OWNER; a delayed OWNER never overwrites a newer denial', async () => {
  const held = deferred<Response>();
  const { fetcher, calls } = scripted({
    [OWNER_ALIAS_ACCESS_URL]: [async () => held.promise, once(403, {})],
  });
  const store = createAccessStore(fetcher);
  const first = store.refresh();
  store.clear();
  assert.equal(store.getSnapshot(), 'UNKNOWN');
  assert.equal(await store.refresh(), 'DENIED', 'newer denial applies');
  held.resolve(json(200, ownerBody));
  assert.equal(await first, 'DENIED', 'stale refresh resolves to the current value, not its own');
  assert.equal(store.getSnapshot(), 'DENIED', 'delayed OWNER discarded by the generation guard');
  assert.equal(calls.length, 2);
});

test('store: dispose discards late responses and refuses later fetches', async () => {
  const held = deferred<Response>();
  let fetches = 0;
  const fetcher: Fetcher = async () => { fetches++; return held.promise; };
  const store = createAccessStore(fetcher);
  const pending = store.refresh();
  store.dispose();
  held.resolve(json(200, ownerBody));
  assert.equal(await pending, 'UNKNOWN');
  assert.equal(store.getSnapshot(), 'UNKNOWN');
  assert.equal(await store.refresh(), 'UNKNOWN');
  assert.equal(fetches, 1, 'no fetch after disposal');
});
