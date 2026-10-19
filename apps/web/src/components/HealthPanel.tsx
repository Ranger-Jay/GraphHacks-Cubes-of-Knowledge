import type { GraphStatusResponse } from '@cubes/contracts';
import type { ApiResult, HealthResponse } from '../api';
import { StatusBadge } from './StatusBadge';

export type Loadable<T> = { state: 'loading' } | { state: 'done'; result: ApiResult<T> };

function Line({ name, value }: { name: string; value: Loadable<unknown> }) {
  if (value.state === 'loading') return <li>{name}: <span role="status">Checking…</span></li>;
  const r = value.result;
  if (r.kind === 'error' || r.kind === 'not_found' || r.kind === 'unauthorized') return <li>{name}: <StatusBadge value="UNAVAILABLE" /> <span className="muted">{r.message}</span></li>;
  return null;
}

/** Compact status strip. The graph is named neutrally; internal graph name, check time and request id sit in collapsed details. */
export function HealthPanel({ health, graph }: { health: Loadable<HealthResponse>; graph: Loadable<GraphStatusResponse> }) {
  const graphOk = graph.state === 'done' && (graph.result.kind === 'ok' || graph.result.kind === 'unavailable') ? graph.result.data : null;
  return (
    <section aria-labelledby="health-h" className="panel health-strip">
      <h2 id="health-h" className="strip-title">System status</h2>
      <ul className="plain strip-list">
        {health.state === 'done' && (health.result.kind === 'ok' || health.result.kind === 'unavailable')
          ? <li>API process: <StatusBadge value={health.result.data.status === 'BOOTSTRAP' ? 'ONLINE' : health.result.data.status} />
              <span className="muted"> — liveness only.</span>
              <span className="sr-only">BOOTSTRAP ready={String(health.result.data.ready)}</span></li>
          : <Line name="API process" value={health} />}
        {graphOk
          ? <li>Graph: <StatusBadge value={graphOk.status} />
              {graphOk.reason && <> <StatusBadge value={graphOk.reason} label="reason" /></>}</li>
          : <Line name="Graph" value={graph} />}
      </ul>
      {graphOk && (
        <details className="tech-details"><summary>Technical details</summary>
          <p className="muted">API process status is BOOTSTRAP ready=false (liveness only, not graph readiness). Graph {graphOk.graphName}, checked {graphOk.checkedAt}, request {graphOk.requestId}</p></details>)}
    </section>
  );
}
