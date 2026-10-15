import type { AgentId, SceneData } from '@cubes/contracts';

export type VisemeId = 'rest' | 'smile' | 'viseme_open' | 'viseme_round' | 'viseme_narrow';

export type ExpressionId = 'idle' | 'smile' | 'attentive' | 'nod' | 'shake' | 'focused';

export interface VisemeFrame {
  timeMs: number;
  viseme: VisemeId;
}

export interface PhraseDefinition {
  phrase: string;
  expression: ExpressionId;
  durationMs: number;
  visemes: VisemeFrame[];
}

export interface AgentVisualConfig {
  id: AgentId;
  name: string;
  role: string;
  circuitryColor: string;
  secondaryColor: string;
  glowColor: string;
  hairStyle: 'asymmetric' | 'military' | 'spikes';
  speechPitch: number;
  speechRate: number;
}

export interface AgentDialogueState {
  hasGreetedSession: boolean;
  isSpeaking: boolean;
  activePhrase: string | null;
  activeViseme: VisemeId;
  activeExpression: ExpressionId;
  taskStartCycleIndex: number;
}

export interface SceneInteractionProps {
  data: SceneData;
  onSelectNode: (id: string) => void;
  reducedMotion: boolean;
  onAgentTaskStart?: ((agentId: AgentId) => Promise<boolean> | boolean) | undefined;
}
