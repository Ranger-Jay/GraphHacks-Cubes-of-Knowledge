import { useEffect, useState, type ComponentType } from 'react';
import type { AnalysisResponse, GraphStatusResponse } from '@cubes/contracts';
import { getAnalysis, getGraphStatus, getHealth, type ApiResult, type Fetcher, type HealthResponse } from './api';
import { HealthPanel, type Loadable } from './components/HealthPanel';
import { AnalysisView } from './components/AnalysisView';
import { SceneMount, toSceneData, type SceneProps } from './components/SceneMount';
import { nextRoute, parseRoute, type Route } from './route';

/** Seeded demo release (graph seed: Release rel-wad, tenant t-wad). */
export const SEEDED_RELEASE_ID = 'rel-wad';

export const IDENTITY = 'Cubes of Knowledge: A company brain built on FalkorDB, with traceable decisions and persistent agent memory.';

export function Shell({ route, health, graph, analysis, Scene, reducedMotion, selected, onSelect, onRequery }: {
  route: Route; health: Loadable<HealthResponse>; graph: Loadable<GraphStatusResponse>;
  analysis: ApiResult<AnalysisResponse> | null; Scene: ComponentType<SceneProps> | null;
  reducedMotion: boolean; selected: string | null; onSelect: (id: string) => void; onRequery?: () => void;
}) {
  const current = analysis && (analysis.kind === 'ok' || analysis.kind === 'unavailable') ? analysis.data : null;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header><h1><a href="#/">Cubes of Knowledge</a></h1><p>{IDENTITY}</p></header>
      <main id="main" tabIndex={-1}>
        <HealthPanel health={health} graph={graph} />
        {onRequery && <p><button type="button" className="requery" onClick={onRequery}>Re-query</button> <span className="muted">Clears shown results and asks the API again.</span></p>}
        {route.name === 'home' && (
          <section className="panel" aria-labelledby="rel-h"><h2 id="rel-h">Releases</h2>
            <p>Open a release analysis: <a href={`#/releases/${SEEDED_RELEASE_ID}`}>{SEEDED_RELEASE_ID}</a>. Results come only from the API.</p></section>)}
        {route.name === 'release' && <>
          <AnalysisView releaseId={route.releaseId} result={analysis} />
          <SceneMount Scene={Scene} data={toSceneData(current, selected)} onSelectNode={onSelect} reducedMotion={reducedMotion} />
        </>}
        {route.name === 'not_found' && (
          <section className="panel" role="alert"><h2>404: page not found</h2><p>No view for <code>{route.path}</code>. <a href="#/">Home</a></p></section>)}
      </main>
    </>
  );
}

export type Sinks = {
  setHealth: (v: Loadable<HealthResponse>) => void; setGraph: (v: Loadable<GraphStatusResponse>) => void;
  setAnalysis: (v: ApiResult<AnalysisResponse> | null) => void; setSelected: (v: string | null) => void;
};
/** Fresh load from the API. Clears every shown result first; nothing is cached between calls. Returns a cancel fn. */
export function loadAll(route: Route, fetcher: Fetcher | undefined, s: Sinks): () => void {
  let live = true;
  s.setHealth({ state: 'loading' }); s.setGraph({ state: 'loading' });
  s.setAnalysis(null); s.setSelected(null);
  const ps: Promise<unknown>[] = [
    getHealth(fetcher).then(result => { if (live) s.setHealth({ state: 'done', result }); }),
    getGraphStatus(fetcher).then(result => { if (live) s.setGraph({ state: 'done', result }); })
  ];
  if (route.name === 'release') ps.push(getAnalysis(route.releaseId, fetcher).then(r => { if (live) s.setAnalysis(r); }));
  loadAll.last = Promise.all(ps);
  return () => { live = false; };
}
loadAll.last = Promise.resolve() as Promise<unknown>;

function useReducedMotion(): boolean {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [v, setV] = useState(q?.matches ?? false);
  useEffect(() => { if (!q) return; const h = () => setV(q.matches); q.addEventListener('change', h); return () => q.removeEventListener('change', h); }, [q]);
  return v;
}

export function App({ Scene, fetcher }: { Scene: ComponentType<SceneProps> | null; fetcher?: Fetcher }) {
  const [route, setRoute] = useState<Route>(() => { const h = window.location.hash; return parseRoute(h.startsWith('#source-') ? '#/' : h); });
  const [health, setHealth] = useState<Loadable<HealthResponse>>({ state: 'loading' });
  const [graph, setGraph] = useState<Loadable<GraphStatusResponse>>({ state: 'loading' });
  const [analysis, setAnalysis] = useState<ApiResult<AnalysisResponse> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => { const h = () => setRoute(prev => nextRoute(prev, window.location.hash)); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const [nonce, setNonce] = useState(0);
  useEffect(() => loadAll(route, fetcher, { setHealth, setGraph, setAnalysis, setSelected }), [route, fetcher, nonce]);

  return <Shell route={route} health={health} graph={graph} analysis={analysis} Scene={Scene}
    reducedMotion={reducedMotion} selected={selected} onSelect={setSelected} onRequery={() => setNonce(n => n + 1)} />;
}
