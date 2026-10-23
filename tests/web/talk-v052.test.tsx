import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isTalkResponse, requestTalk } from '../../apps/web/src/talk';
import { TalkPanel } from '../../apps/web/src/components/TalkPanel';
import { Shell } from '../../apps/web/src/App';
import { available, graphDown, jsonResponse } from './fixtures';

// Offline transport/render tests; SSR does not establish React effects or browser proof.
const a = available('GAP');
const answer = () => ({ status: 'AVAILABLE', requestId: 'r1', persona: 'roy', releaseId: a.releaseId, cutId: a.cutId, revision: a.revision,
  clearance: a.clearance, explanation: 'Fixture explanation', sourceRefIds: ['s1'], model: 'fixture/model', providerRequestId: 'fixture-call', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } });

test('client binds explanation to current scope, clearance, persona and actual source membership', () => {
  assert.equal(isTalkResponse(answer(), a, 'roy'), true);
  for (const change of [{ revision: 'old' }, { cutId: 'other' }, { releaseId: 'other' }, { clearance: 'ESTABLISHED' }, { persona: 'guz' },
    { sourceRefIds: ['forged'] }, { sourceRefIds: ['s1', 's1'] }, { sourceRefIds: [] }, { extra: true }, { usage: { promptTokens: 10, completionTokens: 10, totalTokens: 1 } }]) {
    assert.equal(isTalkResponse({ ...answer(), ...change }, a, 'roy'), false, JSON.stringify(change));
  }
});

test('one explicit request contains no role, caller evidence, browser credential or retry', async () => {
  let count = 0;
  const call = requestTalk(a, 'roy', async (url, init) => {
    count++; assert.equal(url, '/api/talk'); assert.equal(init?.credentials, 'omit');
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(init?.body)), { persona: 'roy', intent: 'release-gap', releaseId: a.releaseId });
    return jsonResponse(200, answer());
  });
  assert.ok(await call.result); assert.equal(count, 1);
});

test('cancel discards a late successful transport even if fetch ignores AbortSignal', async () => {
  let finish!: (v: Response) => void;
  const call = requestTalk(a, 'roy', () => new Promise(resolve => { finish = resolve; }));
  call.cancel(); finish(jsonResponse(200, answer())); assert.equal(await call.result, null);
});

test('client still accepts a current answer after the former 20-second cutoff', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  let finish!: (value: Response) => void;
  const call = requestTalk(a, 'roy', async (_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise(resolve => { finish = resolve; });
  });
  t.mock.timers.tick(26_000);
  finish(jsonResponse(200, answer()));
  assert.ok(await call.result);
  assert.equal(signal?.aborted, false);
});

test('client deadline still aborts and discards a late response from a cancellation-ignoring fetch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  let finish!: (value: Response) => void;
  const call = requestTalk(a, 'roy', async (_url, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise(resolve => { finish = resolve; });
  });
  t.mock.timers.tick(28_000);
  assert.equal(signal?.aborted, true);
  finish(jsonResponse(200, answer()));
  assert.equal(await call.result, null);
});

test('non-200, malformed, refused and stale responses cannot become an answer', async () => {
  for (const status of [201, 401, 403, 409, 503]) {
    assert.equal(await requestTalk(a, 'roy', async () => jsonResponse(status, answer())).result, null);
  }
  assert.equal(await requestTalk(a, 'roy', async () => jsonResponse(200, { ...answer(), revision: 'stale' })).result, null);
  assert.equal(await requestTalk(a, 'roy', async () => new Response('not json')).result, null);
});

test('panel makes no request on render and distinguishes recorded voices from text explanation', () => {
  const html = renderToStaticMarkup(createElement(TalkPanel, { analysis: a }));
  assert.match(html, /Explain the current clearance/); assert.match(html, /Recorded voice previews are separate/);
  assert.doesNotMatch(html, /data-testid="talk-answer"/);
});

test('graph failure suppresses the talk surface even beside an earlier available analysis', () => {
  const html = renderToStaticMarkup(createElement(Shell, { route: { name: 'release', releaseId: a.releaseId },
    health: { state: 'loading' }, graph: { state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: graphDown } },
    analysis: { kind: 'ok', httpStatus: 200, data: a }, Scene: null, reducedMotion: true, selected: null, onSelect: () => {} }));
  assert.doesNotMatch(html, /Explain the current clearance/); assert.doesNotMatch(html, /Fixture explanation/);
});
