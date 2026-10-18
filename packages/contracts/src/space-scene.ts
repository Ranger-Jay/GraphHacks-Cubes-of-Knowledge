import type { AgentId, AnalysisResponse, EvidenceItem, SceneData, SceneRuntimeContext, SourceRef } from './index.js';

/** In-process application/scene boundary. It is not an authentication or postMessage protocol. */
export const SPACE_SCENE_PROTOCOL = 'cubes.space-scene@1' as const;

export interface SpaceSceneSnapshot {
  protocol: typeof SPACE_SCENE_PROTOCOL;
  /** Shell request generation; events from an older rendered snapshot are rejected. */
  generation: number;
  runtime: SceneRuntimeContext;
  data: SceneData;
  summary: string | null;
  clearance: Extract<AnalysisResponse, { status: 'AVAILABLE' }>['clearance'] | null;
  evidence: EvidenceItem[];
  sources: SourceRef[];
  /** IDs in the current reviewed controller's waiting pool; opening never imports. */
  ideaIds: string[];
  reducedMotion: boolean;
  audioMuted: boolean;
  recoveryAuthorized: boolean;
}

type Envelope = { protocol: typeof SPACE_SCENE_PROTOCOL; generation: number };
export type SpaceSceneEvent = Envelope & (
  | { type: 'REFRESH' }
  | { type: 'SELECT_NODE' | 'SELECT_SOURCE' | 'OPEN_IDEA'; id: string }
  | { type: 'AGENT_TASK_START' | 'CLOSE_AGENT'; agentId: AgentId }
  | { type: 'SET_AUDIO_MUTED'; muted: boolean }
);

/** Callbacks request application behavior. No callback result establishes a graph write or answer. */
export interface SpaceSceneHandlers {
  onRefresh?: () => void | Promise<void>;
  onSelectNode?: (id: string) => void | Promise<void>;
  onSelectSource?: (id: string) => void | Promise<void>;
  onOpenIdea?: (id: string) => void | Promise<void>;
  onAgentTaskStart?: (agentId: AgentId) => void | Promise<void>;
  onCloseAgent?: (agentId: AgentId) => void | Promise<void>;
  onSetAudioMuted?: (muted: boolean) => void | Promise<void>;
}

export type SpaceSceneDispatchResult = 'DISPATCHED' | 'INVALID' | 'STALE' | 'BLOCKED' | 'UNBOUND' | 'DISPOSED' | 'FAILED';
