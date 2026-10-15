import type { AgentId, ScenePhase } from '@cubes/contracts';
import type { AgentVisualConfig, PhraseDefinition, VisemeFrame } from './types';

export const AGENT_CONFIGS: Record<AgentId, AgentVisualConfig> = {
  roy: {
    id: 'roy',
    name: 'Roy',
    role: 'Operations & Strategy Agent',
    circuitryColor: '#FFD700', // Gold circuitry
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
    circuitryColor: '#B388FF', // Purple circuitry
    secondaryColor: '#7C4DFF',
    glowColor: 'rgba(179, 136, 255, 0.45)',
    hairStyle: 'asymmetric', // Approved asymmetric hairstyle
    speechPitch: 1.15,
    speechRate: 1.05,
  },
  guz: {
    id: 'guz',
    name: 'Guz',
    role: 'Verification & Audit Agent',
    circuitryColor: '#00E676', // Green circuitry
    secondaryColor: '#00B0FF',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    hairStyle: 'spikes',
    speechPitch: 1.0,
    speechRate: 1.1,
  },
};

export const PHRASE_GREETING: PhraseDefinition = {
  phrase: 'Greetings, Commander',
  expression: 'smile',
  durationMs: 1350,
  visemes: [
    { timeMs: 0, viseme: 'viseme_narrow' },   // "Gr-"
    { timeMs: 160, viseme: 'viseme_open' },    // "-ee-"
    { timeMs: 380, viseme: 'viseme_narrow' },  // "-tings"
    { timeMs: 550, viseme: 'rest' },           // comma pause
    { timeMs: 650, viseme: 'viseme_round' },   // "Co-"
    { timeMs: 850, viseme: 'viseme_open' },    // "-mma-n-"
    { timeMs: 1100, viseme: 'viseme_narrow' }, // "-der"
    { timeMs: 1300, viseme: 'smile' },         // brief welcoming smile
  ],
};

export const PHRASE_HELP: PhraseDefinition = {
  phrase: 'how may I help',
  expression: 'attentive',
  durationMs: 950,
  visemes: [
    { timeMs: 0, viseme: 'viseme_open' },     // "how"
    { timeMs: 220, viseme: 'viseme_open' },   // "may"
    { timeMs: 420, viseme: 'viseme_narrow' }, // "I"
    { timeMs: 580, viseme: 'viseme_open' },   // "he-"
    { timeMs: 760, viseme: 'viseme_narrow' }, // "-lp"
    { timeMs: 900, viseme: 'rest' },
  ],
};

export const PHRASE_AFFIRMATIVE: PhraseDefinition = {
  phrase: 'yes',
  expression: 'nod',
  durationMs: 480,
  visemes: [
    { timeMs: 0, viseme: 'viseme_narrow' },   // "y-"
    { timeMs: 100, viseme: 'viseme_open' },   // "-es"
    { timeMs: 280, viseme: 'viseme_narrow' }, // "-ss"
    { timeMs: 420, viseme: 'rest' },
  ],
};

export const PHRASE_NEGATIVE: PhraseDefinition = {
  phrase: 'no',
  expression: 'shake',
  durationMs: 480,
  visemes: [
    { timeMs: 0, viseme: 'viseme_narrow' },   // "n-"
    { timeMs: 100, viseme: 'viseme_round' },  // "-o"
    { timeMs: 360, viseme: 'rest' },
  ],
};

export const TASK_START_CYCLE: readonly PhraseDefinition[] = [
  {
    phrase: "I'll get right on it.",
    expression: 'focused',
    durationMs: 1150,
    visemes: [
      { timeMs: 0, viseme: 'viseme_narrow' },   // "I'll"
      { timeMs: 180, viseme: 'viseme_open' },   // "get"
      { timeMs: 380, viseme: 'viseme_narrow' }, // "right"
      { timeMs: 600, viseme: 'viseme_round' },  // "on"
      { timeMs: 820, viseme: 'viseme_narrow' }, // "it."
      { timeMs: 1050, viseme: 'rest' },
    ],
  },
  {
    phrase: 'Task beginning',
    expression: 'focused',
    durationMs: 1050,
    visemes: [
      { timeMs: 0, viseme: 'viseme_narrow' },   // "Ta-"
      { timeMs: 160, viseme: 'viseme_open' },   // "-sk"
      { timeMs: 400, viseme: 'viseme_narrow' }, // "be-"
      { timeMs: 600, viseme: 'viseme_open' },   // "-gin-"
      { timeMs: 820, viseme: 'viseme_narrow' }, // "-ning"
      { timeMs: 1000, viseme: 'rest' },
    ],
  },
  {
    phrase: 'Underway.',
    expression: 'focused',
    durationMs: 850,
    visemes: [
      { timeMs: 0, viseme: 'viseme_round' },    // "Un-"
      { timeMs: 200, viseme: 'viseme_open' },   // "-der-"
      { timeMs: 480, viseme: 'viseme_narrow' }, // "-way."
      { timeMs: 780, viseme: 'rest' },
    ],
  },
] as const;

export const PHRASE_TASK_OPTIONAL: PhraseDefinition = {
  phrase: 'On it.',
  expression: 'focused',
  durationMs: 550,
  visemes: [
    { timeMs: 0, viseme: 'viseme_round' },    // "On"
    { timeMs: 220, viseme: 'viseme_narrow' }, // "it."
    { timeMs: 500, viseme: 'rest' },
  ],
};

/** Approved fixed notices. Apostrophes are U+2019, matching issue #29. */
export const GRAPH_OUTAGE_NOTICES: Record<AgentId, string> = {
  roy: 'FalkorDB is disconnected. Operations are offline.',
  ava: 'I can\u2019t access the company\u2019s knowledge. Information is unavailable until FalkorDB reconnects.',
  guz: 'I can\u2019t verify any sources. I won\u2019t provide an answer without evidence.',
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

export function getNextTaskStartPhrase(currentIndex: number): {
  phraseDef: PhraseDefinition;
  nextIndex: number;
} {
  const normalizedIndex = Math.abs(currentIndex) % TASK_START_CYCLE.length;
  return {
    phraseDef: TASK_START_CYCLE[normalizedIndex]!,
    nextIndex: (normalizedIndex + 1) % TASK_START_CYCLE.length,
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
