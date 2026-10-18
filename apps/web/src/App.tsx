import { useEffect, useMemo, useState, type ComponentType } from 'react';
import type { AnalysisResponse, GraphStatusResponse } from '@cubes/contracts';
import { getAnalysis, getGraphStatus, getHealth, type ApiResult, type Fetcher, type HealthResponse } from './api';
import { HealthPanel, type Loadable } from './components/HealthPanel';
import { AnalysisView } from './components/AnalysisView';
import { SceneMount, toSceneData, type SceneProps } from './components/SceneMount';
import { StatusArea } from './components/StatusArea';
import { currentAnalysis, deriveScenePhase, nextRecovery, toRuntimeContext, type RecoveryState } from './sceneState';
import { nextRoute, parseRoute, type Route } from './route';
import { StudioPanel, type StudioBinding } from './studio/StudioPanel';
import { TalkPanel } from './components/TalkPanel';
export type { StudioBinding } from './studio/StudioPanel';

/** Seeded demo release (graph seed: Release rel-wad, tenant t-wad). */
export const SEEDED_RELEASE_ID = 'rel-wad';

export const IDENTITY = 'Cubes of Knowledge: A company brain built on FalkorDB, with traceable decisions and persistent agent memory.';

export function Shell({ route, health, graph, analysis, Scene, reducedMotion, selected, onSelect, onRequery, recovered = false, generation, studio }: {
  route: Route; health: Loadable<HealthResponse>; graph: Loadable<GraphStatusResponse>;
  analysis: ApiResult<AnalysisResponse> | null; Scene: ComponentType<SceneProps> | null;
  reducedMotion: boolean; selected: string | null; onSelect: (id: string) => void; onRequery?: () => void;
  /** Fresh READY after a settled GRAPH_UNAVAILABLE (see nextRecovery). Never set from a click alone. */
  recovered?: boolean; generation?: number;
  /** The single IdeaVerse card surface. Absent (the production default) = nothing mounted, nothing can import. */
  studio?: StudioBinding;
}) {
  // Phase first: proof reaches the scene only in READY (authorized AVAILABLE read + healthy probe, same generation).
  const phase = route.name === 'release' ? deriveScenePhase(graph, analysis) : null;
  const current = currentAnalysis(phase, analysis);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app-shell" data-phase={phase ?? 'none'} {...(generation !== undefined ? { 'data-generation': generation } : {})}>
        <header className="topbar">
          <div className="brand"><h1><a href="#/">Cubes of Knowledge</a></h1><p className="identity">{IDENTITY}</p></div>
          <HealthPanel health={health} graph={graph} />
          {onRequery && <div className="requery-box"><button type="button" className="requery" onClick={onRequery}>Re-query</button> <span className="muted">Clears shown results and asks the API again.</span></div>}
        </header>
        <main id="main" tabIndex={-1} className="stage">
          {route.name === 'home' && (
            <section className="panel" aria-labelledby="rel-h"><h2 id="rel-h">Releases</h2>
              <p>Open a release analysis: <a href={`#/releases/${SEEDED_RELEASE_ID}`}>{SEEDED_RELEASE_ID}</a>. Results come only from the API.</p></section>)}
          {route.name === 'release' && (
            <div className="stage-grid">
              <SceneMount Scene={Scene} data={toSceneData(current, selected)} onSelectNode={onSelect} reducedMotion={reducedMotion} runtime={toRuntimeContext(phase ?? 'CHECKING')} space={{ generation: generation ?? 0, analysis: current, recovered, ...(onRequery ? { onRefresh: onRequery } : {}), ...(studio ? { studio } : {}) }} />
              <div className="side-col">
                <StatusArea phase={phase ?? 'CHECKING'} releaseId={route.releaseId} analysis={analysis} recovered={recovered} />
                <AnalysisView releaseId={route.releaseId} result={analysis} phase={phase} />
                {current?.status === 'AVAILABLE' && <TalkPanel key={`${generation ?? 0}:${current.releaseId}:${current.revision}`} analysis={current} />}
                {studio && <StudioPanel controller={studio.controller} phase={phase} {...(studio.access ? { access: studio.access } : {})} />}
              </div>
            </div>)}
          {route.name === 'not_found' && (
            <section className="panel" role="alert"><h2>404: page not found</h2><p>No view for <code>{route.path}</code>. <a href="#/">Home</a></p></section>)}
        </main>
      </div>
    </>
  );
}

export type Sinks = {
  setHealth: (v: Loadable<HealthResponse>) => void; setGraph: (v: Loadable<GraphStatusResponse>) => void;
  setAnalysis: (v: ApiResult<AnalysisResponse> | null) => void; setSelected: (v: string | null) => void;
  /** Optional: told which request generation the sinks now belong to (for display and evidence only). */
  setGeneration?: (id: number) => void;
};

/**
 * Request generation. Every load takes the next id; a completion may write only while its id is still the
 * newest one issued for the same sinks. A slow, old success therefore cannot restore READY (or repopulate
 * proof) after a newer request started or failed, even when nobody called the older load's cancel function.
 */
export interface RequestGate { next(): number; isCurrent(id: number): boolean }
export function createRequestGate(): RequestGate {
  let latest = 0;
  return { next: () => ++latest, isCurrent: id => id === latest };
}
const gates = new WeakMap<object, RequestGate>();
/** One gate per sinks object, so the newest load for those sinks wins without any cooperation from callers. */
const gateFor = (s: Sinks): RequestGate => { let g = gates.get(s); if (!g) { g = createRequestGate(); gates.set(s, g); } return g; };

/** Fresh load from the API. Clears every shown result first; nothing is cached between calls. Returns a cancel fn. */
export function loadAll(route: Route, fetcher: Fetcher | undefined, s: Sinks, gate: RequestGate = gateFor(s)): () => void {
  let live = true;
  const id = gate.next();
  const current = () => live && gate.isCurrent(id);
  s.setGeneration?.(id);
  s.setHealth({ state: 'loading' }); s.setGraph({ state: 'loading' });
  s.setAnalysis(null); s.setSelected(null);
  const ps: Promise<unknown>[] = [
    getHealth(fetcher).then(result => { if (current()) s.setHealth({ state: 'done', result }); }),
    getGraphStatus(fetcher).then(result => { if (current()) s.setGraph({ state: 'done', result }); })
  ];
  if (route.name === 'release') ps.push(getAnalysis(route.releaseId, fetcher).then(r => { if (current()) s.setAnalysis(r); }));
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

export function App({ Scene, fetcher, studio }: { Scene: ComponentType<SceneProps> | null; fetcher?: Fetcher; studio?: StudioBinding }) {
  const [route, setRoute] = useState<Route>(() => { const h = window.location.hash; return parseRoute(h.startsWith('#source-') ? '#/' : h); });
  const [health, setHealth] = useState<Loadable<HealthResponse>>({ state: 'loading' });
  const [graph, setGraph] = useState<Loadable<GraphStatusResponse>>({ state: 'loading' });
  const [analysis, setAnalysis] = useState<ApiResult<AnalysisResponse> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => { const h = () => setRoute(prev => nextRoute(prev, window.location.hash)); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const [nonce, setNonce] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [recovery, setRecovery] = useState<RecoveryState>({ settled: null, recovered: false });
  // Stable sinks object: the request gate is keyed to it, so only the newest load may write.
  const sinks = useMemo<Sinks>(() => ({ setHealth, setGraph, setAnalysis, setSelected, setGeneration }), []);
  useEffect(() => loadAll(route, fetcher, sinks), [route, fetcher, nonce, sinks]);

  const phase = route.name === 'release' ? deriveScenePhase(graph, analysis) : null;
  useEffect(() => { setRecovery(prev => { const next = nextRecovery(prev, phase); return next.settled === prev.settled && next.recovered === prev.recovered ? prev : next; }); }, [phase]);
  return <Shell route={route} health={health} graph={graph} analysis={analysis} Scene={Scene}
    reducedMotion={reducedMotion} selected={selected} onSelect={setSelected} onRequery={() => setNonce(n => n + 1)}
    recovered={recovery.recovered && phase === 'READY'} generation={generation} {...(studio ? { studio } : {})} />;
}
