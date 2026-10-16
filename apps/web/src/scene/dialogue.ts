import type { AgentId, ScenePhase } from '@cubes/contracts';
import type { AgentVisualConfig, PhraseDefinition, VisemeFrame } from './types';
import {
  findClipByAgentRole,
  outageTranscript,
  type AudioClipRole,
} from './audioClips';

export const AGENT_CONFIGS: Record<AgentId, AgentVisualConfig> = {
  roy: {
    id: 'roy',
    name: 'Roy',
    role: 'Operations & Strategy Agent',
    circuitryColor: '#FFD700',
    secondaryColor: '#FF8F00',
    glowColor: 'rgba(255, 215, 0, 0.45)',
    hairStyle: 'military',
    speechPitch: 0.9,
    speechRate: 0.95,
  },
  ava: {
    id: 'ava',
    name: 'Ava',
    role: 'Graph & Evidence Reasoning Agent',
    circuitryColor: '#B388FF',
    secondaryColor: '#7C4DFF',
    glowColor: 'rgba(179, 136, 255, 0.45)',
    hairStyle: 'asymmetric',
    speechPitch: 1.15,
    speechRate: 1.05,
  },
  guz: {
    id: 'guz',
    name: 'Guz',
    role: 'Verification & Audit Agent',
    circuitryColor: '#00E676',
    secondaryColor: '#00B0FF',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    hairStyle: 'spikes',
    speechPitch: 1.0,
    speechRate: 1.1,
  },
};

function phraseFromRole(agentId: AgentId, role: AudioClipRole): PhraseDefinition {
  const clip = findClipByAgentRole(agentId, role);
  if (!clip) {
    return { phrase: '', expression: 'idle', durationMs: 0, visemes: [] };
  }
  return {
    phrase: clip.transcript,
    expression: clip.expression,
    durationMs: clip.durationMs,
    visemes: clip.visemes as VisemeFrame[],
  };
}

/** Shared-role fallbacks (Roy timings) for callers that still use the old constants. */
export const PHRASE_GREETING: PhraseDefinition = phraseFromRole('roy', 'greeting');
export const PHRASE_HELP: PhraseDefinition = phraseFromRole('roy', 'help');
export const PHRASE_AFFIRMATIVE: PhraseDefinition = phraseFromRole('roy', 'yes');
export const PHRASE_NEGATIVE: PhraseDefinition = phraseFromRole('roy', 'no');
export const PHRASE_TASK_OPTIONAL: PhraseDefinition = phraseFromRole('roy', 'task_optional');

export const TASK_START_CYCLE: readonly PhraseDefinition[] = [
  phraseFromRole('roy', 'task_start_a'),
  phraseFromRole('roy', 'task_start_b'),
  phraseFromRole('roy', 'task_start_c'),
] as const;

/** Per-agent phrase defs from accepted handoff pin fce5110. */
export function agentPhrase(agentId: AgentId, role: AudioClipRole): PhraseDefinition {
  return phraseFromRole(agentId, role);
}

/** Approved outage WAV transcripts (pin fce5110 / Jay attestation). */
export const GRAPH_OUTAGE_NOTICES: Record<AgentId, string> = {
  roy: outageTranscript('roy'),
  ava: outageTranscript('ava'),
  guz: outageTranscript('guz'),
};

const BLOCKED_STATUS_CAPTIONS: Record<Exclude<ScenePhase, 'READY' | 'GRAPH_UNAVAILABLE'>, string> = {
  CHECKING: 'Checking current information.',
  ACCESS_DENIED: 'Access denied.',
  NOT_FOUND: 'The requested release is missing.',
  UNAVAILABLE: 'Current information is unavailable.',
};

export function normalSpeechAllowed(phase: ScenePhase | undefined): boolean {
  return phase === 'READY';
}

export function isApprovedOutageNotice(phrase: string): boolean {
  return (Object.values(GRAPH_OUTAGE_NOTICES) as string[]).includes(phrase);
}

/** Caption for a blocked phase. GRAPH_UNAVAILABLE is the only approved spoken notice. */
export function blockedStatusCaption(agentId: AgentId, phase: ScenePhase | undefined): string | null {
  const resolved = phase ?? 'CHECKING';
  if (resolved === 'READY') return null;
  if (resolved === 'GRAPH_UNAVAILABLE') return GRAPH_OUTAGE_NOTICES[agentId];
  return BLOCKED_STATUS_CAPTIONS[resolved];
}

export function getNextTaskStartPhrase(
  currentIndex: number,
  agentId: AgentId = 'roy'
): {
  phraseDef: PhraseDefinition;
  nextIndex: number;
} {
  const cycle: AudioClipRole[] = ['task_start_a', 'task_start_b', 'task_start_c'];
  const normalizedIndex = Math.abs(currentIndex) % cycle.length;
  return {
    phraseDef: phraseFromRole(agentId, cycle[normalizedIndex]!),
    nextIndex: (normalizedIndex + 1) % cycle.length,
  };
}

export function findVisemeAtTime(visemes: VisemeFrame[], elapsedMs: number): VisemeFrame['viseme'] {
  if (visemes.length === 0) return 'rest';
  let active = visemes[0]!.viseme;
  for (const frame of visemes) {
    if (elapsedMs >= frame.timeMs) {
      active = frame.viseme;
    } else {
      break;
    }
  }
  return active;
}
