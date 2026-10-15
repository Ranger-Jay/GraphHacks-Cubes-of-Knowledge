import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConfigEnv, UserConfig, UserConfigFnObject } from 'vite';
import viteConfig from '../../apps/web/vite.config';
import { bearerInjector, readerTokenFrom, readerTokenProblem, type ProxyRequestLike } from '../../apps/web/dev-proxy';
import { AnalysisView } from '../../apps/web/src/components/AnalysisView';
import { HealthPanel } from '../../apps/web/src/components/HealthPanel';
import { getAnalysis, getGraphStatus, getHealth, type Fetcher } from '../../apps/web/src/api';
import { available, graphDown, jsonResponse } from './fixtures';

const NO_ANSWER = 'No graph answer is shown. Clearance is not asserted.';
const unauthenticated = { error: { code: 'UNAUTHENTICATED', message: 'Release analysis was not read. No server session was presented.', requestId: 'x' } };
const opaque = () => randomBytes(24).toString('base64url');

/** A proxy request that records headers the way node:http would. */
function fakeRequest(initial: Record<string, string> = {}) {
  const headers = new Map(Object.entries(initial).map(([k, v]) => [k.toLowerCase(), v] as const));
  const request: ProxyRequestLike = {
    setHeader: (n, v) => headers.set(n.toLowerCase(), v),
    removeHeader: n => headers.delete(n.toLowerCase()),
  };
  return { request, headers };
}
function runInjector(token: string | null, initial: Record<string, string> = {}) {
  const sent = fakeRequest(initial);
  bearerInjector(token)({ on: (_event, listener) => { listener(sent.request); } });
  return sent.headers;
}

test('401 is its own not-authorized state, never an answer, an empty graph or a generic failure', async () => {
  const r = await getAnalysis('rel-wad', async () => jsonResponse(401, unauthenticated));
  assert.equal(r.kind, 'unauthorized');
  assert.equal(r.httpStatus, 401);
  const html = renderToStaticMarkup(<AnalysisView releaseId="rel-wad" result={r} />);
  assert.ok(html.includes('Not authorized (HTTP 401)') && html.includes('API_READER_TOKEN') && html.includes(NO_ANSWER));
  assert.ok(!html.includes('Clearance:') && !html.includes('Evidence by track'));
  // A refusal is not softened by whatever body comes with it.
  assert.equal((await getAnalysis('rel-wad', async () => jsonResponse(401, available('ESTABLISHED')))).kind, 'unauthorized');
  assert.equal((await getAnalysis('rel-wad', async () => new Response('denied', { status: 401 }))).kind, 'unauthorized');
});

test('403 reads as forbidden, and the health panel shows a refusal as unavailable', async () => {
  const r = await getAnalysis('rel-wad', async () => jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'no', requestId: 'x' } }));
  assert.deepEqual([r.kind, r.httpStatus], ['unauthorized', 403]);
  assert.ok(renderToStaticMarkup(<AnalysisView releaseId="r" result={r} />).includes('Not authorized (HTTP 403)'));
  const g = await getGraphStatus(async () => jsonResponse(401, unauthenticated));
  const h = await getHealth(async () => jsonResponse(401, unauthenticated));
  const html = renderToStaticMarkup(<HealthPanel health={{ state: 'done', result: h }} graph={{ state: 'done', result: g }} />);
  assert.equal((html.match(/data-status="UNAVAILABLE"/g) ?? []).length, 2);
  assert.ok(html.includes('HTTP 401'));
});

test('network failure and a dead upstream behind the dev proxy are distinct, honest errors', async () => {
  const down = await getAnalysis('rel-wad', async () => { throw new Error('connect ECONNREFUSED'); });
  assert.deepEqual([down.kind, down.httpStatus], ['error', null]);
  const html = renderToStaticMarkup(<AnalysisView releaseId="rel-wad" result={down} />);
  assert.ok(html.includes('API unreachable') && html.includes(NO_ANSWER));
  for (const status of [502, 504]) {
    const f: Fetcher = async () => new Response('', { status });
    const r = await getAnalysis('rel-wad', f);
    assert.equal(r.kind, 'error');
    assert.ok(r.kind === 'error' && r.message.includes(`HTTP ${status}`) && r.message.includes('unreachable'));
  }
});

test('proxy injection: the reader token is added server-side and a browser Authorization never survives', () => {
  const token = opaque();
  assert.equal(runInjector(token).get('authorization'), `Bearer ${token}`);
  assert.equal(runInjector(token, { Authorization: 'Bearer attacker-chosen-token' }).get('authorization'), `Bearer ${token}`);
  // With no usable token the browser's own header is still dropped, and none is invented.
  assert.equal(runInjector(null, { Authorization: 'Bearer attacker-chosen-token' }).has('authorization'), false);
});

test('reader token must match the API token shape, and the warning never carries the value', () => {
  const good = opaque();
  assert.equal(readerTokenFrom({ API_READER_TOKEN: good }), good);
  for (const bad of [undefined, '', 'short', 'has space in it', 'x'.repeat(257)]) {
    assert.equal(readerTokenFrom({ API_READER_TOKEN: bad }), null);
    const problem = readerTokenProblem({ API_READER_TOKEN: bad });
    assert.ok(problem !== null && problem.includes('API_READER_TOKEN'));
    if (bad) assert.ok(!problem.includes(bad));
  }
  assert.equal(readerTokenProblem({ API_READER_TOKEN: good }), null);
});

test('vite.config wires the injector into /api and keeps the token out of the client bundle', () => {
  const token = opaque();
  const before = process.env['API_READER_TOKEN'];
  process.env['API_READER_TOKEN'] = token;
  try {
    const config = (viteConfig as UserConfigFnObject)({ mode: 'development', command: 'serve', isSsrBuild: false, isPreview: false } satisfies ConfigEnv) as UserConfig;
    const entry = (config.server?.proxy as Record<string, { target: string; configure: (p: { on: (e: string, l: (r: ProxyRequestLike) => void) => void }) => void }>)['/api'];
    assert.equal(entry?.target, 'http://127.0.0.1:8787');
    const sent = fakeRequest({ authorization: 'Bearer attacker-chosen-token' });
    entry!.configure({ on: (_e, l) => l(sent.request) });
    assert.equal(sent.headers.get('authorization'), `Bearer ${token}`);
    // No define/envPrefix route to the browser: the secret exists only in this Node process.
    assert.equal(config.define, undefined);
    assert.equal(config.envPrefix, undefined);
    assert.equal(JSON.stringify(config.server ?? {}).includes(token), false);
  } finally {
    if (before === undefined) delete process.env['API_READER_TOKEN']; else process.env['API_READER_TOKEN'] = before;
  }
});
