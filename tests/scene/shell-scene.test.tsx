// v021.08: the real shell + the real scene together, no outer-CSS guard. Only a proven graph failure may look like an outage.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphStatusResponse, ScenePhase } from '@cubes/contracts';
import { Shell } from '../../apps/web/src/App';
import { CompanyCubeScene } from '../../apps/web/src/scene/index';
import { parseRoute } from '../../apps/web/src/route';
import type { AnalysisRead, GraphProbe } from '../../apps/web/src/sceneState';
import { available, unavailable, graphDown } from '../web/fixtures';

const status = (over: Partial<GraphStatusResponse>): GraphStatusResponse => ({ status: 'AVAILABLE', ready: true, graphName: 'g', requestId: 'r', checkedAt: '2026-10-15T00:00:00Z', reason: null, ...over });
const healthy: GraphProbe = { state: 'done', result: { kind: 'ok', httpStatus: 200, data: status({}) } };
const failing = (reason: 'CONNECTION_FAILED' | 'QUERY_FAILED'): GraphProbe => ({ state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: status({ status: 'UNAVAILABLE', ready: false, reason }) } });
const loading: GraphProbe = { state: 'loading' };
const notImplemented: GraphProbe = { state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: graphDown } };
const ok: AnalysisRead = { kind: 'ok', httpStatus: 200, data: available('GAP') };
const denied: AnalysisRead = { kind: 'unauthorized', httpStatus: 401, message: 'refused' };
const missing: AnalysisRead = { kind: 'not_found', httpStatus: 404, message: 'No such release.' };
const down: AnalysisRead = { kind: 'unavailable', httpStatus: 503, data: unavailable('CONNECTION_FAILED') };
const route = parseRoute('#/releases/rel-wad');
const shell = (graph: GraphProbe, analysis: AnalysisRead) => renderToStaticMarkup(
  <Shell route={route} health={{ state: 'loading' }} graph={graph} analysis={analysis} Scene={CompanyCubeScene} reducedMotion={false} selected={null} onSelect={() => {}} onRequery={() => {}} />);

const CASES: Array<[string, GraphProbe, AnalysisRead | null, ScenePhase, string | null]> = [
  ['loading', loading, null, 'CHECKING', 'CHECKING THE GRAPH...'],
  ['ready', healthy, ok, 'READY', null],
  ['401 + healthy graph', healthy, denied, 'ACCESS_DENIED', 'ACCESS DENIED'],
  ['404 + healthy graph', healthy, missing, 'NOT_FOUND', 'RELEASE NOT FOUND'],
  ['undetermined (not implemented)', notImplemented, ok, 'UNAVAILABLE', 'GRAPH STATUS UNAVAILABLE'],
  ['real outage', failing('QUERY_FAILED'), down, 'GRAPH_UNAVAILABLE', 'GRAPH UNAVAILABLE'],
  ['401 while graph down', failing('CONNECTION_FAILED'), denied, 'GRAPH_UNAVAILABLE', 'GRAPH UNAVAILABLE'],
];
for (const [name, probe, read, phase, headline] of CASES) {
  test(`shell+scene (${name}): shell and cube agree on ${phase}; outage visual only for GRAPH_UNAVAILABLE`, () => {
    const html = shell(probe, read);
    assert.ok(html.includes(`data-phase="${phase}"`) && html.includes(`data-testid="company-cube-view" data-phase="${phase}"`), 'shell and cube phase match');
    assert.equal(html.includes('damaged-cube'), phase === 'GRAPH_UNAVAILABLE');
    assert.equal(html.includes('Task Blocked (Outage)'), phase === 'GRAPH_UNAVAILABLE');
    if (headline) assert.ok(html.includes(headline), `cube headline ${headline}`);
    else assert.ok(!html.includes('cube-outage-overlay'));
    if (phase !== 'GRAPH_UNAVAILABLE') assert.ok(!html.includes('GRAPH UNAVAILABLE'), 'no outage headline outside an outage');
    assert.ok(!/Evidence severed/.test(html));
    if (phase !== 'READY') assert.ok(!html.includes('graph-proof-edges') && !html.includes('graph-evidence-nodes'));
  });
}
