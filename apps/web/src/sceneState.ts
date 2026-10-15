import type { AnalysisResponse, GraphStatusResponse, SceneRuntimeContext, ScenePhase } from '@cubes/contracts';
import type { ApiResult } from './api';
import type { Loadable } from './components/HealthPanel';

/**
 * Scene phase mapping (web shell). Pure: the same current probe + analysis read always give the same phase.
 *
 * PRECEDENCE, first match wins. Several facts can be true at once, so the order is part of the contract:
 *  1. GRAPH_UNAVAILABLE  the CURRENT graph probe OR the CURRENT analysis read PROVES a graph failure
 *                        (503 UNAVAILABLE with reason CONNECTION_FAILED or QUERY_FAILED; one real detach
 *                        produces both reasons). This wins over 401/403, 404 and even an AVAILABLE read
 *                        that raced with a failing probe: a failure observed in this generation blocks it.
 *  2. CHECKING           the probe or the analysis read has not completed (or no read was requested).
 *  3. ACCESS_DENIED      analysis 401/403 while the graph is not proven down. Never claims an outage.
 *  4. NOT_FOUND          analysis 404 AND a healthy probe: missing release, not an outage.
 *  5. READY              authorized AVAILABLE analysis AND a healthy probe, both from this generation.
 *  6. UNAVAILABLE        anything else (API/network error, invalid body, NOT_IMPLEMENTED, 404/ok without
 *                        a healthy probe): the information cannot be determined; no outage is asserted.
 * Process liveness (/api/health, BOOTSTRAP ready=false) is not an input: it is not a graph signal.
 */
export const GRAPH_FAILURE_REASONS: ReadonlySet<string> = new Set(['CONNECTION_FAILED', 'QUERY_FAILED']);

export type GraphProbe = Loadable<GraphStatusResponse>;
export type AnalysisRead = ApiResult<AnalysisResponse> | null;

/** True only when the completed probe says the graph failed to connect or answer. */
export function probeProvesFailure(graph: GraphProbe): boolean {
  return graph.state === 'done' && graph.result.kind === 'unavailable'
    && graph.result.data.reason !== null && GRAPH_FAILURE_REASONS.has(graph.result.data.reason);
}
/** True only when the completed analysis read is a 503 UNAVAILABLE naming a graph failure. */
export function readProvesFailure(analysis: AnalysisRead): boolean {
  return analysis?.kind === 'unavailable' && analysis.data.status === 'UNAVAILABLE'
    && GRAPH_FAILURE_REASONS.has(analysis.data.reason);
}
/** A healthy probe is a completed 200 AVAILABLE answer. Anything else is "not proven healthy". */
export function probeIsHealthy(graph: GraphProbe): boolean {
  return graph.state === 'done' && graph.result.kind === 'ok'
    && graph.result.data.status === 'AVAILABLE' && graph.result.data.ready;
}

export function deriveScenePhase(graph: GraphProbe, analysis: AnalysisRead): ScenePhase {
  if (probeProvesFailure(graph) || readProvesFailure(analysis)) return 'GRAPH_UNAVAILABLE';
  if (graph.state === 'loading' || analysis === null) return 'CHECKING';
  switch (analysis.kind) {
    case 'unauthorized': return 'ACCESS_DENIED';
    case 'not_found': return probeIsHealthy(graph) ? 'NOT_FOUND' : 'UNAVAILABLE';
    case 'ok': return analysis.data.status === 'AVAILABLE' && probeIsHealthy(graph) ? 'READY' : 'UNAVAILABLE';
    default: return 'UNAVAILABLE';
  }
}

/** The runtime prop handed across the scene boundary. Grants no identity, permission or task authority. */
export const toRuntimeContext = (phase: ScenePhase): SceneRuntimeContext => ({ phase });

/** Current authorized proof may be shown only in READY. Every other phase has an empty proof panel and scene. */
export function currentAnalysis(phase: ScenePhase | null, analysis: AnalysisRead): AnalysisResponse | null {
  if (phase !== 'READY' || analysis === null || analysis.kind !== 'ok') return null;
  return analysis.data;
}

/**
 * Recovery is announced only when a fresh generation reaches READY after the last SETTLED phase was
 * GRAPH_UNAVAILABLE. CHECKING is not a settled phase. A button click alone never produces it.
 */
export interface RecoveryState { settled: ScenePhase | null; recovered: boolean }
export function nextRecovery(prev: RecoveryState, phase: ScenePhase | null): RecoveryState {
  if (phase === null || phase === 'CHECKING') return prev;
  return { settled: phase, recovered: phase === 'READY' && prev.settled === 'GRAPH_UNAVAILABLE' };
}
