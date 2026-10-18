import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../../apps/api/dist/app.js';
import { talkerFromEnv } from '../../apps/api/dist/talker.js';

// OFFLINE fixtures only. These tests never contact OpenRouter or a graph database.
const key = 'sk-or-v1-unit-fixture-key-not-real';
const model = 'mistralai/mistral-nemo';
const env = { LLM_ENABLED: 'true', LLM_PROVIDER: 'openrouter', LLM_API_KEY: key, LLM_MODEL: model };
const analysis = () => ({ status: 'AVAILABLE', requestId: 'fixture-request', releaseId: 'rel-wad', cutId: 'cut-v4', revision: 'r1', clearance: 'GAP',
  summary: 'Synthetic fixture: current cut has a gap.', evidence: [{ id: 'e1', status: 'STALE', statement: 'v3 only', sourceRefIds: ['s1'] }],
  sources: [{ id: 's1', path: 'fixture.txt', sha256: 'f'.repeat(64), excerpt: 'v3 only', startOffset: 0, endOffset: 7 }], nodes: [], edges: [], proposedActions: [] });
const capped = () => ({ data: { limit: 1, limit_remaining: 0.99, limit_reset: null, include_byok_in_limit: true } });
const completion = () => ({ id: 'fixture-provider-request', model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ explanation: 'The v3 evidence does not cover v4.', sourceRefIds: ['s1'] }) } }], usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 } });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
function provider(keyBody = capped(), answer = completion()) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return url.endsWith('/key') ? reply(keyBody) : reply(answer);
  };
  return { calls, talker: talkerFromEnv(env, fetcher) };
}

test('default/invalid config cannot make any provider call', () => {
  let calls = 0;
  const f = async () => { calls++; throw new Error('must not call'); };
  for (const e of [{}, { ...env, LLM_ENABLED: 'false' }, { ...env, LLM_API_KEY: '' }, { ...env, LLM_MODEL: 'https://attacker.invalid' }]) {
    assert.equal(talkerFromEnv(e, f), undefined);
  }
  assert.equal(calls, 0);
});

test('provider request is bounded, single-model, credential-separated and returns actual metadata', async () => {
  const p = provider();
  const a = analysis();
  const result = await p.talker.explain(a, 'roy', new AbortController().signal);
  assert.equal(p.calls.length, 2);
  assert.equal(result.clearance, 'GAP');
  assert.equal(result.model, model);
  assert.equal(result.providerRequestId, 'fixture-provider-request');
  assert.equal(result.usage.totalTokens, 40);
  const call = p.calls[1];
  const b = JSON.parse(call.init.body);
  assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(call.init.redirect, 'error');
  assert.equal(b.model, model);
  assert.equal(b.max_tokens, 320);
  assert.equal(b.provider.allow_fallbacks, false);
  assert.deepEqual(b.provider.max_price, { prompt: 0.1, completion: 0.5, request: 0 });
  assert.equal(b.response_format.json_schema.strict, true);
  assert.equal(JSON.stringify(b).includes(key), false);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('uncapped, resetting, exhausted, excessive and BYOK-excluded keys cannot reach completions', async () => {
  for (const data of [
    { limit: null }, { limit: 2 }, { limit_remaining: 0 }, { limit_reset: 'daily' },
    { include_byok_in_limit: false }, { limit_remaining: 2 }, { limit: '1' },
  ]) {
    const p = provider({ data: { ...capped().data, ...data } });
    await assert.rejects(p.talker.explain(analysis(), 'ava', new AbortController().signal));
    assert.equal(p.calls.length, 1);
  }
});

test('forged/duplicate citations, extra payload keys, bad usage, truncation and wrong model are refused', async () => {
  const cases = [
    c => { c.choices[0].message.content = JSON.stringify({ explanation: 'forged', sourceRefIds: ['not-in-graph'] }); },
    c => { c.choices[0].message.content = JSON.stringify({ explanation: 'duplicate', sourceRefIds: ['s1', 's1'] }); },
    c => { c.choices[0].message.content = JSON.stringify({ explanation: 'extra', sourceRefIds: ['s1'], clearance: 'ESTABLISHED' }); },
    c => { c.usage.total_tokens = 1; }, c => { c.choices[0].finish_reason = 'length'; },
    c => { c.model = 'unselected/model'; },
    c => { c.choices[0].message.content = JSON.stringify({ explanation: key, sourceRefIds: ['s1'] }); },
  ];
  for (const change of cases) {
    const c = completion(); change(c);
    const p = provider(capped(), c);
    await assert.rejects(p.talker.explain(analysis(), 'guz', new AbortController().signal));
    assert.equal(p.calls.length, 2);
  }
});

test('aborted/oversized/evidenceless inputs produce zero network calls', async () => {
  for (const mode of ['abort', 'size', 'sources']) {
    const p = provider(); const a = analysis(); const c = new AbortController();
    if (mode === 'abort') c.abort();
    if (mode === 'size') a.summary = 'x'.repeat(30_000);
    if (mode === 'sources') a.sources = [];
    await assert.rejects(p.talker.explain(a, 'roy', c.signal));
    assert.equal(p.calls.length, 0);
  }
});

test('concurrent requests are refused rather than queued or retried', async () => {
  let finish; let calls = 0;
  const f = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const t = talkerFromEnv(env, f);
  const first = t.explain(analysis(), 'roy', new AbortController().signal);
  await assert.rejects(t.explain(analysis(), 'roy', new AbortController().signal));
  assert.equal(calls, 1);
  finish(reply({}, 503));
  await assert.rejects(first);
  assert.equal(calls, 1);
});

const sessions = { authenticate: token => ({ 'fixture-owner': { id: 'kanny', kind: 'owner' }, 'fixture-reader': { id: 'serena', kind: 'reader' }, 'fixture-agent': { id: 'roy', kind: 'agent' } })[token] ?? null };
async function withApi(options, run) {
  const s = createApiServer({ sessions, ...options }); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  try { await run(`http://127.0.0.1:${s.address().port}`); }
  finally { const closed = once(s, 'close'); s.close(); s.closeAllConnections(); await closed; }
}
const body = { persona: 'roy', intent: 'release-gap', releaseId: 'rel-wad' };
async function post(origin, data = body, token = 'fixture-reader', extra = {}, path = '/api/talk') {
  return fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: JSON.stringify(data) });
}

test('API denies anonymous/agent/cross-site/malformed requests without querying or calling model', async () => {
  let reads = 0; let calls = 0;
  await withApi({ analysis: { async analyze() { reads++; return analysis(); } }, talker: { async explain() { calls++; } } }, async origin => {
    assert.equal((await post(origin, body, null)).status, 401);
    assert.equal((await post(origin, body, 'fixture-agent')).status, 403);
    assert.equal((await post(origin, body, 'fixture-reader', { origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await post(origin, body, 'fixture-reader', { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(origin, { ...body, role: 'owner' })).status, 400);
    assert.equal((await post(origin, { ...body, intent: 'arbitrary-query' })).status, 400);
    assert.equal((await post(origin, body, 'fixture-reader', { 'content-type': 'text/plain' })).status, 400);
    assert.equal((await post(origin, body, 'fixture-reader', {}, '/api/talk?ready=true')).status, 404);
    assert.equal(reads, 0); assert.equal(calls, 0);
  });
});

test('API cannot call model for unconfigured, missing or unavailable graph analysis', async () => {
  let calls = 0;
  const t = { async explain() { calls++; } };
  for (const result of [null, { status: 'UNAVAILABLE' }]) {
    await withApi({ analysis: { async analyze() { return result; } }, talker: t }, async origin => {
      const r = await post(origin); assert.equal(r.status, result ? 503 : 404);
    });
  }
  await withApi({ analysis: { async analyze() { return analysis(); } } }, async origin => { assert.equal((await post(origin)).status, 503); });
  assert.equal(calls, 0);
});

test('API discards generated text when graph fails or evidence changes during the call', async () => {
  for (const mode of ['outage', 'revision', 'same-revision-tamper']) {
    let reads = 0;
    const p = provider();
    await withApi({ talker: p.talker, analysis: { async analyze() {
      reads++; const a = analysis();
      if (reads === 2) {
        if (mode === 'outage') return { status: 'UNAVAILABLE' };
        if (mode === 'revision') a.revision = 'r2'; else a.sources[0].excerpt = 'changed without revision';
      }
      return a;
    } } }, async origin => {
      const r = await post(origin); assert.equal(r.status, mode === 'outage' ? 503 : 409);
      assert.equal((await r.text()).includes('The v3 evidence does not cover v4.'), false);
      assert.equal(reads, 2);
    });
  }
});

test('API reader and owner can receive a fresh graph-bound explanation; persona grants no authority', async () => {
  for (const token of ['fixture-reader', 'fixture-owner']) {
    let reads = 0; const p = provider();
    await withApi({ talker: p.talker, analysis: { async analyze() { reads++; return analysis(); } } }, async origin => {
      const r = await post(origin, { ...body, persona: 'ava' }, token);
      assert.equal(r.status, 200); const answer = await r.json();
      assert.equal(answer.persona, 'ava'); assert.equal(answer.clearance, 'GAP');
      assert.equal(reads, 2); assert.equal(p.calls.length, 2);
    });
  }
});
