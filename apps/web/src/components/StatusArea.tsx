import type { AnalysisResponse, ScenePhase } from '@cubes/contracts';
import type { ApiResult } from '../api';

/**
 * One status area for every state the shell can be in. It is the text twin of the scene's presentation:
 * wording is chosen from the phase (sceneState.ts), never from the scene art. Outage wording is "unavailable";
 * denied and missing-release say plainly that the graph is NOT reported as down.
 */
interface Copy { label: string; text: string }
function copyFor(phase: ScenePhase, releaseId: string, analysis: ApiResult<AnalysisResponse> | null): Copy {
  switch (phase) {
    case 'CHECKING': return { label: 'Checking', text: 'Checking the graph and this session’s access. No result or proof is shown until both checks finish.' };
    case 'READY': return { label: 'Ready', text: 'Current result loaded. Graph check passed; read authorized.' };
    case 'GRAPH_UNAVAILABLE': return { label: 'Graph unavailable', text: 'The latest graph check or read could not reach or query the graph, so information is unavailable. No result, evidence or path is shown. Use Re-query once it is restored.' };
    case 'ACCESS_DENIED': return { label: `Access denied${analysis?.kind === 'unauthorized' ? ` (HTTP ${analysis.httpStatus})` : ''}`, text: 'This session is not allowed to read this analysis. The graph is not reported as unavailable. No result is shown.' };
    case 'NOT_FOUND': return { label: 'Release not found', text: `No analysis exists for release ${releaseId} (HTTP 404). This is missing information, not an outage. No result is shown.` };
    case 'UNAVAILABLE': return { label: 'Information unavailable', text: 'The request failed or returned an unusable answer, so the current result cannot be determined. The graph’s own state is not confirmed either way. No result is shown.' };
  }
}
/** API-supplied detail for the non-ready phases; never contains evidence (the API contract forbids it). */
function detailFor(phase: ScenePhase, analysis: ApiResult<AnalysisResponse> | null): string | null {
  if (!analysis || phase === 'READY' || phase === 'CHECKING') return null;
  if (analysis.kind === 'unauthorized' || analysis.kind === 'not_found' || analysis.kind === 'error') return analysis.message;
  if (analysis.kind === 'unavailable' && analysis.data.status === 'UNAVAILABLE') return `${analysis.data.reason}: ${analysis.data.message}`;
  return null;
}

export function StatusArea({ phase, releaseId, analysis, recovered }: {
  phase: ScenePhase; releaseId: string; analysis: ApiResult<AnalysisResponse> | null; recovered: boolean;
}) {
  const c = copyFor(phase, releaseId, analysis);
  const detail = detailFor(phase, analysis);
  return (
    <section className="status-area" role="status" aria-live="polite" aria-atomic="true" aria-labelledby="status-h" data-phase={phase} data-recovered={recovered ? 'true' : 'false'}>
      <h2 id="status-h" className="status-label"><span className="status-tag">{c.label}</span></h2>
      <p className="status-text">{recovered && phase === 'READY' ? 'Recovered: a fresh authorized read succeeded after the graph was unavailable. ' : ''}{c.text}</p>
      {detail && <p className="muted status-detail">{detail}</p>}
    </section>
  );
}
