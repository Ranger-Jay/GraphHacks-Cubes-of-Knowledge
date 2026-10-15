// Independent oracle for the scene phase mapping (deriveScenePhase). It does not copy the implementation's control flow:
// it enumerates EVERY probe-state x read-state pair (9 x 13 = 117 cases), states each expectation declaratively per read
// state, and also checks invariants that must hold for all pairs. DEV/UNIT FIXTURES ONLY: it proves the mapping, not live behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GraphStatusResponse, ScenePhase } from '@cubes/contracts';
import { deriveScenePhase, type AnalysisRead, type GraphProbe } from '../../apps/web/src/sceneState';
import { available, unavailable } from './fixtures';

const st = (over: Partial<GraphStatusResponse>): GraphStatusResponse => ({ status: 'AVAILABLE', ready: true, graphName: 'g', requestId: 'r', checkedAt: '2026-10-15T00:00:00Z', reason: null, ...over });
const down = (reason: GraphStatusResponse['reason']): GraphProbe => ({ state: 'done', result: { kind: 'unavailable', httpStatus: 503, data: st({ status: 'UNAVAILABLE', ready: false, reason }) } });

// ---- probe states (the unauthenticated /api/graph/status probe) ----
type Probe = { name: string; value: GraphProbe; failure: boolean; healthy: boolean; pending: boolean };
const PROBES: Probe[] = [
  { name: 'pending', value: { state: 'loading' }, failure: false, healthy: false, pending: true },
  { name: 'healthy 200 AVAILABLE ready', value: { state: 'done', result: { kind: 'ok', httpStatus: 200, data: st({}) } }, failure: false, healthy: true, pending: false },
  { name: '200 AVAILABLE but ready=false', value: { state: 'done', result: { kind: 'ok', httpStatus: 200, data: st({ ready: false }) } }, failure: false, healthy: false, pending: false },
  { name: '503 CONNECTION_FAILED', value: down('CONNECTION_FAILED'), failure: true, healthy: false, pending: false },
  { name: '503 QUERY_FAILED', value: down('QUERY_FAILED'), failure: true, healthy: false, pending: false },
  { name: '503 NOT_IMPLEMENTED', value: down('NOT_IMPLEMENTED'), failure: false, healthy: false, pending: false },
  { name: '503 reason null', value: down(null), failure: false, healthy: false, pending: false },
  { name: 'network error', value: { state: 'done', result: { kind: 'error', httpStatus: null, message: 'x' } }, failure: false, healthy: false, pending: false },
  { name: '404 route absent', value: { state: 'done', result: { kind: 'not_found', httpStatus: 404, message: 'x' } }, failure: false, healthy: false, pending: false },
];
// ---- analysis read states ----
type Read = { name: string; value: AnalysisRead; failure: boolean; kind: 'none' | 'ok' | 'denied' | 'missing' | 'other' };
const un = (reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'NOT_IMPLEMENTED'): AnalysisRead => ({ kind: 'unavailable', httpStatus: 503, data: unavailable(reason) });
const READS: Read[] = [
  { name: 'not requested / pending', value: null, failure: false, kind: 'none' },
  { name: '200 AVAILABLE', value: { kind: 'ok', httpStatus: 200, data: available('GAP') }, failure: false, kind: 'ok' },
  { name: '200 body status UNAVAILABLE (defensive)', value: { kind: 'ok', httpStatus: 200, data: unavailable('QUERY_FAILED') as never }, failure: false, kind: 'other' },
  { name: '503 CONNECTION_FAILED', value: un('CONNECTION_FAILED'), failure: true, kind: 'other' },
  { name: '503 QUERY_FAILED', value: un('QUERY_FAILED'), failure: true, kind: 'other' },
  { name: '503 NOT_IMPLEMENTED', value: un('NOT_IMPLEMENTED'), failure: false, kind: 'other' },
  { name: '401', value: { kind: 'unauthorized', httpStatus: 401, message: 'x' }, failure: false, kind: 'denied' },
  { name: '403', value: { kind: 'unauthorized', httpStatus: 403, message: 'x' }, failure: false, kind: 'denied' },
  { name: '404', value: { kind: 'not_found', httpStatus: 404, message: 'x' }, failure: false, kind: 'missing' },
  { name: 'network error', value: { kind: 'error', httpStatus: null, message: 'x' }, failure: false, kind: 'other' },
  { name: '502 through the proxy (API process down)', value: { kind: 'error', httpStatus: 502, message: 'x' }, failure: false, kind: 'other' },
  { name: '504 through the proxy', value: { kind: 'error', httpStatus: 504, message: 'x' }, failure: false, kind: 'other' },
  { name: 'invalid body', value: { kind: 'error', httpStatus: 200, message: 'Non-JSON response (HTTP 200).' }, failure: false, kind: 'other' },
];

// ---- the declared expectation, per read state (not derived from the implementation) ----
function expected(p: Probe, r: Read): ScenePhase {
  if (p.failure || r.failure) return 'GRAPH_UNAVAILABLE';          // a proven graph failure from either source always wins
  if (p.pending || r.kind === 'none') return 'CHECKING';            // otherwise both facts must have completed
  switch (r.kind) {
    case 'denied': return 'ACCESS_DENIED';                          // graph not proven down, so this is denial, never an outage
    case 'missing': return p.healthy ? 'NOT_FOUND' : 'UNAVAILABLE'; // "missing release" needs a healthy graph
    case 'ok': return p.healthy ? 'READY' : 'UNAVAILABLE';          // READY needs BOTH a good read and a healthy probe
    default: return 'UNAVAILABLE';                                  // cannot be determined: assert no outage
  }
}

test(`oracle: every probe x read pair maps to its declared phase (${PROBES.length} x ${READS.length})`, () => {
  const bad: string[] = [];
  for (const p of PROBES) for (const r of READS) {
    const got = deriveScenePhase(p.value, r.value), want = expected(p, r);
    if (got !== want) bad.push(`probe[${p.name}] read[${r.name}] expected ${want} got ${got}`);
  }
  assert.deepEqual(bad, []);
});

test('invariants hold for every pair', () => {
  const v: string[] = [];
  for (const p of PROBES) for (const r of READS) {
    const ph = deriveScenePhase(p.value, r.value), id = `probe[${p.name}] read[${r.name}]`;
    if ((ph === 'GRAPH_UNAVAILABLE') !== (p.failure || r.failure)) v.push(`${id}: GRAPH_UNAVAILABLE iff a proven failure (got ${ph})`);
    if (ph === 'READY' && !(p.healthy && r.kind === 'ok')) v.push(`${id}: READY without healthy probe AND good read`);
    if (ph === 'ACCESS_DENIED' && (p.failure || r.failure || p.pending || r.kind !== 'denied')) v.push(`${id}: ACCESS_DENIED outside "denied and graph not proven down and probe complete"`);
    if (ph === 'NOT_FOUND' && !(p.healthy && r.kind === 'missing')) v.push(`${id}: NOT_FOUND without 404 and healthy probe`);
    if (ph === 'CHECKING' && (p.failure || r.failure || !(p.pending || r.kind === 'none'))) v.push(`${id}: CHECKING although everything completed or a failure is proven`);
    if (r.failure === false && p.failure === false && ph === 'GRAPH_UNAVAILABLE') v.push(`${id}: outage asserted without proof`);
  }
  assert.deepEqual(v, []);
});

test('denied access and a graph outage are never confused (the PR 27 P2)', () => {
  const healthy = PROBES[1]!, conn = PROBES[3]!;
  const r401 = READS.find(r => r.name === '401')!;
  assert.equal(deriveScenePhase(healthy.value, r401.value), 'ACCESS_DENIED');
  assert.equal(deriveScenePhase(conn.value, r401.value), 'GRAPH_UNAVAILABLE'); // no token AND graph down: the probe is unauthenticated, so the outage is real
});

test('one real detach produces both failure reasons and both map to the outage phase', () => {
  const conn = READS.find(r => r.name === '503 CONNECTION_FAILED')!, query = PROBES.find(p => p.name === '503 QUERY_FAILED')!;
  assert.equal(deriveScenePhase(query.value, conn.value), 'GRAPH_UNAVAILABLE'); // observed together on a stopped local FalkorDB
});
