import { SPACE_SCENE_PROTOCOL } from '@cubes/contracts';
import type { AnalysisResponse, ScenePhase, SceneRuntimeContext, SpaceSceneDispatchResult, SpaceSceneEvent, SpaceSceneHandlers, SpaceSceneSnapshot } from '@cubes/contracts';
import { toSceneData } from './components/SceneMount';

const PHASES: readonly ScenePhase[] = ['CHECKING', 'READY', 'GRAPH_UNAVAILABLE', 'ACCESS_DENIED', 'NOT_FOUND', 'UNAVAILABLE'];
const agents = new Set(['ava', 'roy', 'guz']);
const identifier = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;
const generation = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Inputs come from the shell's current generation and controller, never from the visualizer. */
export interface SpaceSceneInput {
  generation: number;
  runtime?: SceneRuntimeContext;
  analysis: AnalysisResponse | null;
  selectedNodeId: string | null;
  ideaIds?: readonly string[];
  reducedMotion: boolean;
  audioMuted: boolean;
  recoveryAuthorized?: boolean;
}

/** Clears all current proof outside READY, including contradictory AVAILABLE data left by a caller. */
export function projectSpaceScene(input: SpaceSceneInput): SpaceSceneSnapshot {
  if (!generation(input.generation)) throw new Error('Invalid scene generation');
  const candidate = input.runtime?.phase;
  const proposed = candidate && PHASES.includes(candidate) ? candidate : 'CHECKING';
  const phase = proposed === 'READY' && input.analysis?.status !== 'AVAILABLE' ? 'UNAVAILABLE' : proposed;
  const analysis = phase === 'READY' && input.analysis?.status === 'AVAILABLE' ? input.analysis : null;
  // The scene gets a detached rendering view; changes to it cannot mutate the shell's analysis arrays.
  return structuredClone({
    protocol: SPACE_SCENE_PROTOCOL,
    generation: input.generation,
    runtime: { phase },
    data: toSceneData(analysis, input.selectedNodeId),
    summary: analysis?.summary ?? null,
    clearance: analysis?.clearance ?? null,
    evidence: analysis?.evidence ?? [],
    sources: analysis?.sources ?? [],
    ideaIds: analysis ? [...new Set((input.ideaIds ?? []).filter(identifier))] : [],
    reducedMotion: input.reducedMotion,
    audioMuted: input.audioMuted,
    recoveryAuthorized: analysis !== null && input.recoveryAuthorized === true,
  });
}

/** Strict event shape: role/tenant/Cypher/receipt fields are not part of this boundary. */
export function isSpaceSceneEvent(raw: unknown): raw is SpaceSceneEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const e = raw as Record<string, unknown>;
  if (e['protocol'] !== SPACE_SCENE_PROTOCOL || !generation(e['generation'])) return false;
  let fields: string[];
  switch (e['type']) {
    case 'REFRESH': fields = []; break;
    case 'SELECT_NODE': case 'SELECT_SOURCE': case 'OPEN_IDEA':
      if (!identifier(e['id'])) return false;
      fields = ['id']; break;
    case 'AGENT_TASK_START': case 'CLOSE_AGENT':
      if (typeof e['agentId'] !== 'string' || !agents.has(e['agentId'])) return false;
      fields = ['agentId']; break;
    case 'SET_AUDIO_MUTED':
      if (typeof e['muted'] !== 'boolean') return false;
      fields = ['muted']; break;
    default: return false;
  }
  const allowed = new Set(['protocol', 'generation', 'type', ...fields]);
  return Object.keys(e).every(k => allowed.has(k));
}

/**
 * Re-reads shell state for EVERY event; no READY snapshot is captured at creation. DISPATCHED means
 * only that the application callback ran. The callback/controller owns async results, authorization,
 * request invalidation, receipts and audio completion. There is deliberately no IMPORT/ADDED event.
 */
export function createSpaceSceneBridge(readCurrent: () => SpaceSceneSnapshot, handlers: SpaceSceneHandlers) {
  let disposed = false;
  return {
    dispose(): void { disposed = true; },
    async dispatch(raw: unknown): Promise<SpaceSceneDispatchResult> {
      if (disposed) return 'DISPOSED';
      if (!isSpaceSceneEvent(raw)) return 'INVALID';
      try {
        const current = readCurrent();
        if (current.protocol !== SPACE_SCENE_PROTOCOL || raw.generation !== current.generation) return 'STALE';
        const ready = current.runtime.phase === 'READY' && current.data.status === 'AVAILABLE';
        let call: (() => void | Promise<void>) | undefined;
        switch (raw.type) {
          case 'REFRESH': call = handlers.onRefresh; break;
          case 'SET_AUDIO_MUTED':
            if (handlers.onSetAudioMuted) call = () => handlers.onSetAudioMuted!(raw.muted);
            break;
          case 'CLOSE_AGENT':
            if (handlers.onCloseAgent) call = () => handlers.onCloseAgent!(raw.agentId);
            break;
          case 'SELECT_NODE':
            if (!ready || !current.data.nodes.some(n => n.id === raw.id)) return 'BLOCKED';
            if (handlers.onSelectNode) call = () => handlers.onSelectNode!(raw.id);
            break;
          case 'SELECT_SOURCE':
            if (!ready || !current.sources.some(s => s.id === raw.id)) return 'BLOCKED';
            if (handlers.onSelectSource) call = () => handlers.onSelectSource!(raw.id);
            break;
          case 'OPEN_IDEA':
            if (!ready || !current.ideaIds.includes(raw.id)) return 'BLOCKED';
            if (handlers.onOpenIdea) call = () => handlers.onOpenIdea!(raw.id);
            break;
          case 'AGENT_TASK_START':
            if (!ready) return 'BLOCKED';
            if (handlers.onAgentTaskStart) call = () => handlers.onAgentTaskStart!(raw.agentId);
            break;
        }
        if (!call) return 'UNBOUND';
        await call();
        return 'DISPATCHED';
      } catch { return 'FAILED'; }
    },
  };
}
