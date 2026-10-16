import type { ApiError } from '@cubes/contracts';

/** Server principal only. The requested persona is not an authorization input. */
export interface TalkPrincipal {
  id: string;
  kind: string;
}

/** Presence flags only. This slice never stores a key or a spend amount. */
export interface TalkerConfig {
  keyPresent: boolean;
  capConfigured: boolean;
}

export interface TalkerAssessment {
  status: 400 | 401 | 403 | 503;
  code: ApiError['error']['code'];
  message: string;
  modelCalled: false;
}

const talkFields = new Set(['persona', 'intent', 'releaseId']);
const personas = new Set(['roy', 'ava', 'guz']);
const intents = new Set(['release-gap']);

const absentConfig: TalkerConfig = { keyPresent: false, capConfigured: false };

export function defaultTalkerConfig(): TalkerConfig {
  return absentConfig;
}

export function assessTalk(
  principal: TalkPrincipal | null,
  body: unknown,
  ready: boolean,
  config: TalkerConfig,
): TalkerAssessment {
  if (principal === null) {
    return refused(401, 'UNAUTHENTICATED', 'The model was not called. No server session was presented.');
  }
  const canAsk = (principal.id === 'kanny' && principal.kind === 'owner')
    || (principal.id === 'serena' && principal.kind === 'reader');
  if (!canAsk) {
    return refused(403, 'FORBIDDEN', 'The model was not called. This session cannot ask.');
  }
  if (parseTalk(body) === null) {
    return refused(400, 'VALIDATION_ERROR', 'The model was not called. The request did not match the talk contract.');
  }
  if (!ready) {
    return refused(503, 'GRAPH_UNAVAILABLE', 'The model was not called. The graph is not ready.');
  }
  if (!config.keyPresent || !config.capConfigured) {
    return refused(503, 'NOT_IMPLEMENTED', 'The model was not called. No provider key and enforceable spend cap are configured.');
  }
  return refused(503, 'NOT_IMPLEMENTED', 'The model was not called. This slice has no completion client.');
}

function refused(status: TalkerAssessment['status'], code: TalkerAssessment['code'], message: string): TalkerAssessment {
  return { status, code, message, modelCalled: false };
}

function parseTalk(value: unknown): { persona: string; intent: string; releaseId: string } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !talkFields.has(key))) return null;
  const persona = boundedText(record['persona'], 16);
  const intent = boundedText(record['intent'], 32);
  const releaseId = boundedText(record['releaseId'], 128);
  if (persona === null || intent === null || releaseId === null) return null;
  if (!personas.has(persona) || !intents.has(intent)) return null;
  return { persona, intent, releaseId };
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) return null;
  return value;
}
