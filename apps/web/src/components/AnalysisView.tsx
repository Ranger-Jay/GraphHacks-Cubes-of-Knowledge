import type { AnalysisResponse, AvailableAnalysis, ScenePhase, SourceRef } from '@cubes/contracts';
import type { ApiResult } from '../api';
import { StatusBadge } from './StatusBadge';

// In-page jump to a cited source record; never touches the hash router.
function focusSource(e: { preventDefault: () => void }, id: string) {
  e.preventDefault();
  const el = typeof document !== 'undefined' ? document.getElementById(`source-${id}`) : null;
  if (el) {
    // Evidence details are collapsed by default: open every collapsed ancestor so the record can take focus.
    for (let a = el.parentElement; a; a = a.parentElement) if (a instanceof HTMLDetailsElement) a.open = true;
    el.setAttribute('tabindex', '-1'); el.scrollIntoView({ block: 'center' }); el.focus();
  }
}

function Sources({ ids, byId }: { ids: string[]; byId: Map<string, SourceRef> }) {
  if (ids.length === 0) return <span className="muted">No cited source.</span>;
  return <ul className="sources">{ids.map(id => {
    const s = byId.get(id);
    return <li key={id}>{s
      ? <a href={`#source-${encodeURIComponent(id)}`} onClick={e => focusSource(e, id)}>{s.path} [{s.startOffset}–{s.endOffset}]</a>
      : <span>{id} <StatusBadge value="UNKNOWN" label="source record" /></span>}</li>;
  })}</ul>;
}

function Available({ a }: { a: AvailableAnalysis }) {
  const byId = new Map(a.sources.map(s => [s.id, s] as const));
  return (
    <>
      <p className="clearance">Clearance: <StatusBadge value={a.clearance} /></p>
      <p>{a.summary}</p>
      <p className="muted">Release {a.releaseId}, cut {a.cutId}, revision {a.revision}, request {a.requestId}</p>
      <h3>Evidence by track</h3>
      {a.evidence.length === 0 ? <p>No evidence returned. <StatusBadge value="UNKNOWN" /></p> :
        <ul className="evidence">{a.evidence.map(e => (
          <li key={e.id} data-evidence-status={e.status}>
            <StatusBadge value={e.status} /> {e.statement}
            {e.status === 'STALE' && <span className="note"> Stale evidence is not current clearance.</span>}
            <Sources ids={e.sourceRefIds} byId={byId} />
          </li>))}</ul>}
      <details className="detail" data-section="actions"><summary>Proposed actions ({a.proposedActions.length})</summary>
        {a.proposedActions.length === 0 ? <p>None.</p> :
          <ul className="actions">{a.proposedActions.map(p => (
            <li key={p.id}>
              <strong>{p.label}</strong> ({p.kind}) — <span className="approval">Needs human approval. Not executed.</span>
              <Sources ids={p.sourceRefIds} byId={byId} />
            </li>))}</ul>}
      </details>
      <details className="detail" data-section="path"><summary>Returned graph path ({a.nodes.length} nodes, {a.edges.length} edges)</summary>
        <p className="muted">{a.nodes.length} nodes, {a.edges.length} edges from this response.</p>
        <ul className="edges">{a.edges.map(e => <li key={e.id}>{e.from} —{e.type}→ {e.to}</li>)}</ul>
      </details>
      <details className="detail" data-section="sources"><summary>Source records ({a.sources.length})</summary>
        <ul className="source-records">{a.sources.map(s => (
          <li key={s.id} id={`source-${s.id}`}>
            <code>{s.path}</code> sha256 <code>{s.sha256.slice(0, 12)}…</code> offsets {s.startOffset}–{s.endOffset}
            <blockquote>{s.excerpt}</blockquote>
          </li>))}</ul>
      </details>
    </>
  );
}

/**
 * `phase` (from sceneState.ts) gates proof: evidence and paths render only in READY. In any other phase the panel
 * is empty, even when an 'ok' read exists (a graph failure observed in the same generation blocks it).
 * Without `phase` the view renders the result as given (legacy callers/tests).
 */
export function AnalysisView({ releaseId, result, phase }: { releaseId: string; result: ApiResult<AnalysisResponse> | null; phase?: ScenePhase | null }) {
  // With a phase, only READY shows proof. Every other phase leaves the panel empty; StatusArea explains why.
  if (phase !== undefined && phase !== 'READY') {
    return (
      <section aria-labelledby="analysis-h" className="panel result-pane" aria-busy={phase === 'CHECKING'}>
        <h2 id="analysis-h">Release analysis: {releaseId}</h2>
        {phase === 'CHECKING'
          ? <p>Loading analysis…</p>
          : <p data-proof="empty">No current authorized result. Evidence and paths are not shown.</p>}
      </section>);
  }
  return (
    <section aria-labelledby="analysis-h" className="panel result-pane" aria-busy={result === null}>
      <h2 id="analysis-h">Release analysis: {releaseId}</h2>
      {result === null && <p role="status">Loading analysis…</p>}
      {result?.kind === 'ok' && result.data.status === 'AVAILABLE' && <Available a={result.data} />}
      {result?.kind === 'unavailable' && result.data.status === 'UNAVAILABLE' && (
        <div role="alert" className="unavailable">
          <p><StatusBadge value="UNAVAILABLE" /> <StatusBadge value={result.data.reason} label="reason" /></p>
          <p>{result.data.message}</p>
          <p>No graph answer is shown. Clearance is not asserted.</p>
        </div>)}
      {result?.kind === 'not_found' && (
        <div role="alert"><p><StatusBadge value="NOT_IMPLEMENTED" /> The analysis route returned 404: {result.message}</p>
          <p>No graph answer is shown. Clearance is not asserted.</p></div>)}
      {result?.kind === 'unauthorized' && (
        <div role="alert" className="unauthorized"><p><StatusBadge value="UNAVAILABLE" /> Not authorized (HTTP {result.httpStatus}): {result.message}</p>
          <p>No graph answer is shown. Clearance is not asserted.</p></div>)}
      {result?.kind === 'error' && (
        <div role="alert"><p><StatusBadge value="UNAVAILABLE" /> Request failed{result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}: {result.message}</p>
          <p>No graph answer is shown. Clearance is not asserted.</p></div>)}
    </section>
  );
}
