import type { ComponentType } from 'react';
import type { AnalysisResponse, SceneData } from '@cubes/contracts';

export interface SceneProps { data: SceneData; onSelectNode: (id: string) => void; reducedMotion: boolean }

/** Only current AVAILABLE analysis paths reach the scene. Anything else clears proof edges. */
export function toSceneData(a: AnalysisResponse | null, selectedNodeId: string | null): SceneData {
  if (!a || a.status !== 'AVAILABLE') return { status: 'UNAVAILABLE', nodes: [], edges: [], selectedNodeId: null };
  const ids = new Set(a.nodes.map(n => n.id));
  return { status: 'AVAILABLE', nodes: a.nodes, edges: a.edges.filter(e => ids.has(e.from) && ids.has(e.to)),
    selectedNodeId: selectedNodeId && ids.has(selectedNodeId) ? selectedNodeId : null };
}

export function SceneMount({ Scene, data, onSelectNode, reducedMotion }: SceneProps & { Scene: ComponentType<SceneProps> | null }) {
  return (
    <section aria-labelledby="scene-h" className="panel">
      <h2 id="scene-h">Company Cube</h2>
      {Scene ? <Scene data={data} onSelectNode={onSelectNode} reducedMotion={reducedMotion} />
        : <p className="muted" data-scene="pending">Scene module not available yet. Text view above is the full record.</p>}
      {data.nodes.length > 0 && (
        <nav aria-label="Graph nodes (text alternative)"><ul className="plain">{data.nodes.map(n => (
          <li key={n.id}><button type="button" aria-pressed={data.selectedNodeId === n.id} onClick={() => onSelectNode(n.id)}>{n.label} ({n.kind})</button></li>))}</ul></nav>)}
    </section>
  );
}
