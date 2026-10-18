import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphStatusResponse, ScenePhase } from '@cubes/contracts';
import { Shell, loadAll, createRequestGate, type Sinks } from '../../apps/web/src/App';
import { SceneMount, type SceneProps } from '../../apps/web/src/components/SceneMount';
import { deriveScenePhase, nextRecovery, currentAnalysis, type AnalysisRead, type GraphProbe, type RecoveryState } from '../../apps/web/src/sceneState';
import { parseRoute } from '../../apps/web/src/route';
import type { Fetcher } from '../../apps/web/src/api';
import { available, unavailable, graphDown, jsonResponse } from './fixtures';

// ---- fixtures: every state the shell can be in, built from API-shaped results (dev/unit fixtures only) ----
const status = (over: Partial<GraphStatusResponse>): GraphStatusResponse => ({ status: 'AVAILABLE', ready: true, graphName: 'internal_graph_name', requestId: 'r', checkedAt: '2026-10-15T00:00:00Z', reason: null, ...over });
const healthy: GraphProbe = { state: 'done', result: { kind: 'ok', httpStatus: 200, data: status({}) } };
const failing = (reason: 'CONNECTION_FAILED' | 'QUERY_FAILED'): GraphProbe => ({ state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: status({ status: 'UNAVAILABLE', ready: false, reason }) } });
const notImplemented: GraphProbe = { state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: graphDown } };
const probeUnreachable: GraphProbe = { state: 'done', result: { kind: 'error', httpStatus: null, message: 'API unreachable: x' } };
const loading: GraphProbe = { state: 'loading' };
const okRead: AnalysisRead = { kind: 'ok', httpStatus: 200, data: available('GAP') };
const denied = (code: 401 | 403): AnalysisRead => ({ kind: 'unauthorized', httpStatus: code, message: `refused ${code}` });
const missing: AnalysisRead = { kind: 'not_found', httpStatus: 404, message: 'No such release.' };
const readDown = (reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'NOT_IMPLEMENTED'): AnalysisRead => ({ kind: 'unavailable', httpStatus: 503, data: unavailable(reason) });
const netError: AnalysisRead = { kind: 'error', httpStatus: null, message: 'API unreachable: x' };

// ---- the precedence table ----
const TABLE: Array<[string, GraphProbe, AnalysisRead, ScenePhase]> = [
  ['loading: nothing completed', loading, null, 'CHECKING'],
  ['probe done, read pending', healthy, null, 'CHECKING'],
  ['read done, probe pending', loading, okRead, 'CHECKING'],
  ['success: healthy probe + authorized AVAILABLE read', healthy, okRead, 'READY'],
  ['401 + failing probe (CONNECTION_FAILED) -> outage first', failing('CONNECTION_FAILED'), denied(401), 'GRAPH_UNAVAILABLE'],
  ['401 + failing probe (QUERY_FAILED) -> outage first', failing('QUERY_FAILED'), denied(401), 'GRAPH_UNAVAILABLE'],
  ['403 + failing probe -> outage first', failing('QUERY_FAILED'), denied(403), 'GRAPH_UNAVAILABLE'],
  ['404 + failing probe -> outage first', failing('CONNECTION_FAILED'), missing, 'GRAPH_UNAVAILABLE'],
  ['401 + healthy probe -> access denied', healthy, denied(401), 'ACCESS_DENIED'],
  ['403 + healthy probe -> access denied', healthy, denied(403), 'ACCESS_DENIED'],
  ['404 + healthy probe -> missing release', healthy, missing, 'NOT_FOUND'],
  ['404 + probe not proven healthy -> unavailable, not missing', notImplemented, missing, 'UNAVAILABLE'],
  ['read 503 CONNECTION_FAILED -> outage', healthy, readDown('CONNECTION_FAILED'), 'GRAPH_UNAVAILABLE'],
  ['read 503 QUERY_FAILED -> outage', healthy, readDown('QUERY_FAILED'), 'GRAPH_UNAVAILABLE'],
  ['read 503 CONNECTION_FAILED while probe pending -> outage', loading, readDown('CONNECTION_FAILED'), 'GRAPH_UNAVAILABLE'],
  ['probe failing while read still pending -> outage', failing('CONNECTION_FAILED'), null, 'GRAPH_UNAVAILABLE'],
  ['AVAILABLE read raced with a failing probe: failure wins', failing('QUERY_FAILED'), okRead, 'GRAPH_UNAVAILABLE'],
  ['read NOT_IMPLEMENTED proves nothing about the graph', healthy, readDown('NOT_IMPLEMENTED'), 'UNAVAILABLE'],
  ['probe NOT_IMPLEMENTED is not a proven failure', notImplemented, okRead, 'UNAVAILABLE'],
  ['network error with a healthy probe -> unavailable', healthy, netError, 'UNAVAILABLE'],
  ['network error everywhere does not assert an outage', probeUnreachable, netError, 'UNAVAILABLE'],
  ['AVAILABLE read without a healthy probe is not READY', probeUnreachable, okRead, 'UNAVAILABLE'],
];
for (const [name, probe, read, want] of TABLE) {
  test(`phase: ${name}`, () => assert.equal(deriveScenePhase(probe, read), want));
}

// ---- what the shell actually hands the scene and shows the viewer ----
const route = parseRoute('#/releases/rel-wad');
function render(probe: GraphProbe, read: AnalysisRead, extra: { recovered?: boolean } = {}) {
  let got: SceneProps | null = null;
  const Fake = (p: SceneProps) => { got = p; return <div data-fake-scene>scene</div>; };
  const html = renderToStaticMarkup(<Shell route={route} health={{ state: 'loading' }} graph={probe} analysis={read} Scene={Fake}
    reducedMotion={false} selected={'n1'} onSelect={() => {}} onRequery={() => {}} {...extra} />);
  return { html, scene: got as SceneProps | null };
}
const NO_PROOF = ['Evidence by track', 'Clearance:', 'Returned graph path', 'Source records', 'data-evidence-status'];
const SCENARIOS: Array<[string, GraphProbe, AnalysisRead, ScenePhase, RegExp]> = [
  ['loading', loading, null, 'CHECKING', /Checking the graph/],
  ['401 + healthy graph', healthy, denied(401), 'ACCESS_DENIED', /Access denied \(HTTP 401\)/],
  ['404 + healthy graph', healthy, missing, 'NOT_FOUND', /Release not found/],
  ['real outage (probe QUERY_FAILED, read CONNECTION_FAILED)', failing('QUERY_FAILED'), readDown('CONNECTION_FAILED'), 'GRAPH_UNAVAILABLE', /Graph unavailable/],
  ['401 while the graph is down', failing('CONNECTION_FAILED'), denied(401), 'GRAPH_UNAVAILABLE', /Graph unavailable/],
  ['unusable API answer', healthy, netError, 'UNAVAILABLE', /Information unavailable/],
];
for (const [name, probe, read, phase, label] of SCENARIOS) {
  test(`shell (${name}): scene gets runtime.phase=${phase}, cleared data, empty proof`, () => {
    const { html, scene } = render(probe, read);
    assert.equal(scene?.runtime?.phase, phase);
    assert.deepEqual([scene?.data.status, scene?.data.nodes.length, scene?.data.edges.length, scene?.data.selectedNodeId], ['UNAVAILABLE', 0, 0, null]);
    assert.match(html, label);
    assert.ok(html.includes(`data-phase="${phase}"`));
    for (const t of NO_PROOF) assert.ok(!html.includes(t), `no "${t}" in ${phase}`);
    assert.ok(html.includes('data-proof="empty"') || phase === 'CHECKING');
  });
}
test('shell: 401 with a healthy graph never claims an outage; real outage never claims denial', () => {
  const d = render(healthy, denied(401)).html;
  assert.ok(!d.includes('Graph unavailable') && d.includes('The graph is not reported as unavailable'));
  const m = render(healthy, missing).html;
  assert.ok(!m.includes('Graph unavailable') && m.includes('not an outage'));
  const o = render(failing('CONNECTION_FAILED'), denied(401)).html;
  assert.ok(o.includes('Graph unavailable') && !o.includes('Access denied'));
});
test('shell: outage wording is "unavailable", never "disconnected" or "severed"', () => {
  for (const [, probe, read] of SCENARIOS) {
    const { html } = render(probe, read);
    assert.ok(!/disconnect|sever/i.test(html), 'no disconnect/sever wording');
  }
  assert.ok(!/disconnect|sever/i.test(render(healthy, okRead).html));
});
test('shell: READY shows the result and the scene gets nodes; an AVAILABLE read with a failing probe shows nothing', () => {
  const ready = render(healthy, okRead);
  assert.equal(ready.scene?.runtime?.phase, 'READY');
  assert.deepEqual([ready.scene?.data.status, ready.scene?.data.nodes.length, ready.scene?.data.selectedNodeId], ['AVAILABLE', 2, 'n1']);
  assert.ok(ready.html.includes('Evidence by track') && ready.html.includes('Clearance:'));
  const raced = render(failing('QUERY_FAILED'), okRead);
  assert.equal(raced.scene?.data.nodes.length, 0);
  for (const t of NO_PROOF) assert.ok(!raced.html.includes(t));
  assert.equal(currentAnalysis('GRAPH_UNAVAILABLE', okRead), null);
  assert.ok(currentAnalysis('READY', okRead));
});
test('scene boundary: runtime is forwarded when present and omitted (fail closed) when absent', () => {
  let got: SceneProps | null = null;
  const Fake = (p: SceneProps) => { got = p; return <div />; };
  const data = { status: 'UNAVAILABLE' as const, nodes: [], edges: [], selectedNodeId: null };
  renderToStaticMarkup(<SceneMount Scene={Fake} data={data} onSelectNode={() => {}} reducedMotion={false} runtime={{ phase: 'ACCESS_DENIED' }} />);
  assert.deepEqual((got as SceneProps | null)?.runtime, { phase: 'ACCESS_DENIED' });
  renderToStaticMarkup(<SceneMount Scene={Fake} data={data} onSelectNode={() => {}} reducedMotion={false} />);
  assert.equal('runtime' in ((got as SceneProps | null) ?? {}), false);
});

// ---- layout / disclosure ----
test('layout: evidence details are collapsed, graph name and check time are not prominent, UNKNOWN stays distinct from GAP', () => {
  const { html } = render(healthy, okRead);
  assert.ok(!/<details[^>]*\sopen/.test(html), 'no details element starts open');
  for (const s of ['actions', 'path', 'sources']) assert.ok(html.includes(`data-section="${s}"`), s);
  assert.ok(!html.includes('Graph (internal_graph_name)'));
  const visible = html.replace(/<details[\s\S]*?<\/details>/g, '');
  assert.ok(!visible.includes('internal_graph_name') && !visible.includes('2026-10-15T00:00:00Z'), 'name/time only inside collapsed details');
  assert.ok(html.includes('Technical details') && html.includes('internal_graph_name'));
  const gap = renderToStaticMarkup(<Shell route={route} health={{ state: 'loading' }} graph={healthy} analysis={{ kind: 'ok', httpStatus: 200, data: available('GAP') }} Scene={null} reducedMotion={false} selected={null} onSelect={() => {}} />);
  const unk = renderToStaticMarkup(<Shell route={route} health={{ state: 'loading' }} graph={healthy} analysis={{ kind: 'ok', httpStatus: 200, data: available('UNKNOWN') }} Scene={null} reducedMotion={false} selected={null} onSelect={() => {}} />);
  assert.match(gap, /Clearance: <span class="badge badge-bad"[^>]*data-status="GAP"/);
  assert.match(unk, /Clearance: <span class="badge badge-unknown"[^>]*data-status="UNKNOWN"/);
  assert.ok(html.includes('role="status"') && html.includes('aria-live="polite"'));
});

// ---- stale completions and recovery ----

function deferredFetcher() {
  const pending: Array<{ url: string; resolve: (r: Response) => void }> = [];
  const f: Fetcher = url => new Promise<Response>(resolve => { pending.push({ url, resolve }); });
  const answer = (batch: Array<{ url: string; resolve: (r: Response) => void }>, w: { graph: () => Response; analysis: () => Response }) => {
    for (const p of batch) p.resolve(p.url.endsWith('/health') ? jsonResponse(200, { status: 'BOOTSTRAP', ready: false }) : p.url.endsWith('/graph/status') ? w.graph() : w.analysis());
  };
  return { f, pending, answer };
}
function liveSinks() {
  const s = { health: { state: 'loading' } as unknown, graph: { state: 'loading' } as GraphProbe, analysis: null as AnalysisRead, selected: null as string | null, gen: 0 };
  const sinks: Sinks = {
    setHealth: v => { s.health = v; }, setGraph: v => { s.graph = v as GraphProbe; },
    setAnalysis: v => { s.analysis = v as AnalysisRead; }, setSelected: v => { s.selected = v; }, setGeneration: g => { s.gen = g; }
  };
  return { s, sinks };
}
const upGraph = () => jsonResponse(200, status({}));
const downGraph = (reason: string) => jsonResponse(503, status({ status: 'UNAVAILABLE', ready: false, reason: reason as GraphStatusResponse['reason'] }));

test('stale: a slow old success cannot restore READY after a newer request failed (older load never cancelled)', async () => {
  const net = deferredFetcher(); const { s, sinks } = liveSinks();
  loadAll(route, net.f, sinks);                       // generation A, left pending
  const a = net.pending.splice(0);
  loadAll(route, net.f, sinks);                       // generation B (Re-query); A's cancel function is never called
  const b = net.pending.splice(0);
  net.answer(b, { graph: () => downGraph('CONNECTION_FAILED'), analysis: () => jsonResponse(503, unavailable('CONNECTION_FAILED')) });
  await loadAll.last;
  assert.equal(deriveScenePhase(s.graph, s.analysis), 'GRAPH_UNAVAILABLE');
  net.answer(a, { graph: upGraph, analysis: () => jsonResponse(200, available('GAP')) });   // the old success arrives late
  await new Promise(r => setTimeout(r, 20));
  assert.equal(deriveScenePhase(s.graph, s.analysis), 'GRAPH_UNAVAILABLE', 'still unavailable');
  assert.equal(currentAnalysis(deriveScenePhase(s.graph, s.analysis), s.analysis), null, 'no repopulated proof');
  assert.equal(s.gen, 2);
});
test('stale: an old denial or outage cannot overwrite a newer READY', async () => {
  const net = deferredFetcher(); const { s, sinks } = liveSinks();
  loadAll(route, net.f, sinks); const a = net.pending.splice(0);
  loadAll(route, net.f, sinks); const b = net.pending.splice(0);
  net.answer(b, { graph: upGraph, analysis: () => jsonResponse(200, available('GAP')) });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(deriveScenePhase(s.graph, s.analysis), 'READY');
  net.answer(a, { graph: () => downGraph('QUERY_FAILED'), analysis: () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' } }) });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(deriveScenePhase(s.graph, s.analysis), 'READY');
});
test('stale: gates are per sinks object and an explicit gate can be shared', async () => {
  const g = createRequestGate();
  const first = g.next(); const second = g.next();
  assert.deepEqual([g.isCurrent(first), g.isCurrent(second)], [false, true]);
  const one = liveSinks(); const two = liveSinks(); const net = deferredFetcher();
  loadAll(route, net.f, one.sinks); loadAll(route, net.f, two.sinks);   // different sinks: neither cancels the other
  net.answer(net.pending.splice(0), { graph: upGraph, analysis: () => jsonResponse(200, available('GAP')) });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(deriveScenePhase(one.s.graph, one.s.analysis), 'READY');
  assert.equal(deriveScenePhase(two.s.graph, two.s.analysis), 'READY');
});
test('recovery: outage, then a fresh generation reaches READY; Re-query itself does not claim recovery', async () => {
  let up = false; const { s, sinks } = liveSinks();
  const f: Fetcher = async u => u.endsWith('/health') ? jsonResponse(200, { status: 'BOOTSTRAP', ready: false })
    : u.endsWith('/graph/status') ? (up ? upGraph() : downGraph('CONNECTION_FAILED'))
    : up ? jsonResponse(200, available('GAP')) : jsonResponse(503, unavailable('CONNECTION_FAILED'));
  let rec: RecoveryState = { settled: null, recovered: false };
  const step = async () => { loadAll(route, f, sinks); await loadAll.last; const p = deriveScenePhase(s.graph, s.analysis); rec = nextRecovery(rec, p); return p; };
  assert.equal(await step(), 'GRAPH_UNAVAILABLE'); assert.equal(rec.recovered, false);
  assert.equal(await step(), 'GRAPH_UNAVAILABLE'); assert.equal(rec.recovered, false);   // Re-query while still down
  loadAll(route, f, sinks);                                                                 // click: state cleared, still down in the wire
  assert.equal(deriveScenePhase(s.graph, s.analysis), 'CHECKING');
  rec = nextRecovery(rec, 'CHECKING'); assert.equal(rec.recovered, false);                  // CHECKING never counts as recovery
  await loadAll.last;
  up = true;
  assert.equal(await step(), 'READY'); assert.equal(rec.recovered, true);
  assert.equal(await step(), 'READY'); assert.equal(rec.recovered, false, 'a later healthy refresh is not a recovery');
  const html = renderToStaticMarkup(<Shell route={route} health={{ state: 'loading' }} graph={s.graph} analysis={s.analysis} Scene={null}
    reducedMotion={false} selected={null} onSelect={() => {}} recovered={true} />);
  assert.ok(html.includes('Recovered: a fresh authorized read succeeded'));
  assert.ok(!render(healthy, okRead).html.includes('Recovered:'));
});
test('recovery is not claimed after denial, missing release or ordinary loading', () => {
  let r: RecoveryState = { settled: 'GRAPH_UNAVAILABLE', recovered: false };
  r = nextRecovery(r, 'ACCESS_DENIED'); assert.deepEqual(r, { settled: 'ACCESS_DENIED', recovered: false });
  r = nextRecovery(r, 'READY'); assert.equal(r.recovered, false);
  assert.deepEqual(nextRecovery({ settled: 'READY', recovered: false }, null), { settled: 'READY', recovered: false });
});

test('interim CSS guard is gone: the shell no longer hides the cube overlay by class name (scene reads runtime.phase)', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8');
  assert.ok(!css.includes('cube-outage-overlay'), 'no outer-CSS rule targets the cube overlay');
  assert.ok(render(healthy, denied(401)).html.includes('class="app-shell" data-phase="ACCESS_DENIED"'));
});
