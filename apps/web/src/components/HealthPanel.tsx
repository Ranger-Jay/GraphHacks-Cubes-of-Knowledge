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

export function HealthPanel({ health, graph }: { health: Loadable<HealthResponse>; graph: Loadable<GraphStatusResponse> }) {
  return (
    <section aria-labelledby="health-h" className="panel">
      <h2 id="health-h">System status</h2>
      <ul className="plain">
        {health.state === 'done' && (health.result.kind === 'ok' || health.result.kind === 'unavailable')
          ? <li>API process: <StatusBadge value={health.result.data.status} /> ready={String(health.result.data.ready)}
              <span className="muted"> — liveness only, not graph readiness.</span></li>
          : <Line name="API process" value={health} />}
        {graph.state === 'done' && (graph.result.kind === 'ok' || graph.result.kind === 'unavailable')
          ? <li>Graph ({graph.result.data.graphName}): <StatusBadge value={graph.result.data.status} />
              {graph.result.data.reason && <> <StatusBadge value={graph.result.data.reason} label="reason" /></>}
              <span className="muted"> checked {graph.result.data.checkedAt}, request {graph.result.data.requestId}</span></li>
          : <Line name="Graph" value={graph} />}
      </ul>
    </section>
  );
}
