import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisView } from '../../apps/web/src/components/AnalysisView';
import { HealthPanel } from '../../apps/web/src/components/HealthPanel';
import { SceneMount, toSceneData, type SceneProps } from '../../apps/web/src/components/SceneMount';
import { Shell, IDENTITY, SEEDED_RELEASE_ID } from '../../apps/web/src/App';
import { getAnalysis, getGraphStatus, getHealth, type Fetcher } from '../../apps/web/src/api';
import { parseRoute, nextRoute } from '../../apps/web/src/route';
import { available, unavailable, graphDown, jsonResponse } from './fixtures';

const ok = (data: ReturnType<typeof available>) => ({ kind: 'ok' as const, httpStatus: 200, data });
const NO_ANSWER = 'No graph answer is shown. Clearance is not asserted.';

for (const c of ['ESTABLISHED', 'GAP', 'UNKNOWN'] as const) {
  test(`AVAILABLE renders clearance ${c}`, () => {
    const html = renderToStaticMarkup(<AnalysisView releaseId="r" result={ok(available(c))} />);
    assert.match(html, new RegExp(`Clearance: <span[^>]*data-status="${c}"`));
  });
}

test('per-track statuses render with cited sources; unknown source id stays UNKNOWN', () => {
  const html = renderToStaticMarkup(<AnalysisView releaseId="r" result={ok(available('GAP'))} />);
  for (const s of ['VERIFIED', 'STALE', 'UNKNOWN', 'MISSING']) assert.ok(html.includes(`data-evidence-status="${s}"`), s);
  assert.ok(html.includes('graph/seed/sources/a.txt [0–10]'));
  assert.ok(html.includes('Stale evidence is not current clearance.'));
  assert.ok(html.includes('No cited source.'));
  assert.ok(html.includes('s-missing'));
});

test('actions requiring approval are shown as needing approval and offer no execute control', () => {
  const html = renderToStaticMarkup(<AnalysisView releaseId="r" result={ok(available('GAP'))} />);
  assert.ok(html.includes('Needs human approval. Not executed.'));
  assert.ok(!/<button/.test(html));
});

for (const reason of ['NOT_IMPLEMENTED', 'CONNECTION_FAILED', 'QUERY_FAILED'] as const) {
  test(`UNAVAILABLE ${reason} shows no evidence or clearance`, () => {
    const html = renderToStaticMarkup(<AnalysisView releaseId="r" result={{ kind: 'unavailable', httpStatus: 503, data: unavailable(reason) }} />);
    assert.ok(html.includes(reason) && html.includes(NO_ANSWER));
    assert.ok(!html.includes('Clearance:'));
  });
}

test('loading, 404 and network error states are distinct and honest', () => {
  assert.ok(renderToStaticMarkup(<AnalysisView releaseId="r" result={null} />).includes('Loading analysis'));
  const nf = renderToStaticMarkup(<AnalysisView releaseId="r" result={{ kind: 'not_found', httpStatus: 404, message: 'Route not implemented.' }} />);
  assert.ok(nf.includes('NOT_IMPLEMENTED') && nf.includes(NO_ANSWER));
  const err = renderToStaticMarkup(<AnalysisView releaseId="r" result={{ kind: 'error', httpStatus: null, message: 'API unreachable: x' }} />);
  assert.ok(err.includes('API unreachable') && err.includes(NO_ANSWER));
});

test('health panel: liveness is not graph readiness; graph down shows reason', () => {
  const html = renderToStaticMarkup(<HealthPanel
    health={{ state: 'done', result: { kind: 'unavailable', httpStatus: 200, data: { status: 'BOOTSTRAP', ready: false } } }}
    graph={{ state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: graphDown } }} />);
  assert.ok(html.includes('BOOTSTRAP') && html.includes('not graph readiness'));
  assert.ok(html.includes('data-status="UNAVAILABLE"') && html.includes('NOT_IMPLEMENTED'));
  assert.ok(renderToStaticMarkup(<HealthPanel health={{ state: 'loading' }} graph={{ state: 'loading' }} />).includes('Checking'));
});

test('scene data: only AVAILABLE paths, dangling edges dropped, outage clears proof', () => {
  const d = toSceneData(available('GAP'), 'n2');
  assert.deepEqual(d.edges.map(e => e.id), ['x1']);
  assert.equal(d.selectedNodeId, 'n2');
  assert.equal(toSceneData(available('GAP'), 'nope').selectedNodeId, null);
  const down = toSceneData(unavailable('CONNECTION_FAILED'), 'n2');
  assert.deepEqual([down.status, down.nodes.length, down.edges.length], ['UNAVAILABLE', 0, 0]);
  assert.equal(toSceneData(null, null).status, 'UNAVAILABLE');
});

test('scene mount passes contract props and has a text fallback', () => {
  let got: SceneProps | null = null;
  const Fake = (p: SceneProps) => { got = p; return <div>scene</div>; };
  renderToStaticMarkup(<SceneMount Scene={Fake} data={toSceneData(available('GAP'), null)} onSelectNode={() => {}} reducedMotion={true} />);
  assert.equal((got as SceneProps | null)?.reducedMotion, true);
  const pending = renderToStaticMarkup(<SceneMount Scene={null} data={toSceneData(null, null)} onSelectNode={() => {}} reducedMotion={false} />);
  assert.ok(pending.includes('data-scene="pending"'));
});

test('shell shows identity and 404 route', () => {
  const html = renderToStaticMarkup(<Shell route={parseRoute('#/nope')} health={{ state: 'loading' }} graph={{ state: 'loading' }}
    analysis={null} Scene={null} reducedMotion={false} selected={null} onSelect={() => {}} />);
  assert.ok(html.includes(IDENTITY.replace(/:/g, ':')) && html.includes('404: page not found'));
  assert.deepEqual(parseRoute('#/releases/night-drive'), { name: 'release', releaseId: 'night-drive' });
  assert.equal(parseRoute('#/releases/../x').name, 'not_found');
});

test('api client: maps 503 UNAVAILABLE, 404, network failure and contract violations honestly', async () => {
  const f = (status: number, body: unknown): Fetcher => async () => jsonResponse(status, body);
  assert.equal((await getAnalysis('r', f(503, unavailable('NOT_IMPLEMENTED')))).kind, 'unavailable');
  assert.equal((await getAnalysis('r', f(200, available('GAP')))).kind, 'ok');
  assert.equal((await getAnalysis('r', f(404, { error: { code: 'NOT_FOUND', message: 'Route not implemented.', requestId: 'x' } }))).kind, 'not_found');
  assert.equal((await getAnalysis('r', async () => { throw new Error('down'); })).kind, 'error');
  // UNAVAILABLE carrying evidence violates contract and must not render as an answer.
  assert.equal((await getAnalysis('r', f(503, { ...unavailable('QUERY_FAILED'), evidence: [{ id: 'e' }] }))).kind, 'error');
  // AVAILABLE body with error HTTP status is not trusted as success.
  assert.equal((await getAnalysis('r', f(500, available('ESTABLISHED')))).kind, 'error');
  assert.equal((await getGraphStatus(f(503, graphDown))).kind, 'unavailable');
  assert.equal((await getHealth(f(200, { status: 'BOOTSTRAP', ready: false }))).kind, 'unavailable');
  let url = '';
  await getAnalysis('a/b', async u => { url = u; return jsonResponse(404, {}); });
  assert.equal(url, '/api/releases/a%2Fb/analysis');
});

test('P2-A: clicking a cited source keeps the release view (no 404)', () => {
  const rel = parseRoute('#/releases/rel-wad');
  assert.deepEqual(nextRoute(rel, '#source-ref-mail-bh-scope'), rel);
  assert.deepEqual(nextRoute(rel, '#source-s1'), rel);
  assert.equal(nextRoute(rel, '#/nope').name, 'not_found');
  const html = renderToStaticMarkup(<AnalysisView releaseId="r" result={ok(available('GAP'))} />);
  for (const m of html.matchAll(/href="(#source-[^"]+)"/g)) {
    assert.ok(html.includes(`id="${decodeURIComponent(m[1]!.slice(1))}"`), `target exists for ${m[1]}`);
    assert.deepEqual(nextRoute(rel, m[1]!), rel);
  }
});

test('P2-B: home links to the seeded release rel-wad, not a track name', () => {
  const html = renderToStaticMarkup(<Shell route={parseRoute('#/')} health={{ state: 'loading' }} graph={{ state: 'loading' }}
    analysis={null} Scene={null} reducedMotion={false} selected={null} onSelect={() => {}} />);
  assert.equal(SEEDED_RELEASE_ID, 'rel-wad');
  assert.ok(html.includes('href="#/releases/rel-wad"'));
  assert.ok(!html.includes('night-drive'));
  assert.deepEqual(parseRoute('#/releases/rel-wad'), { name: 'release', releaseId: 'rel-wad' });
});
