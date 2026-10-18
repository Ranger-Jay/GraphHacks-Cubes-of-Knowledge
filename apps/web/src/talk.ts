import type { AgentId, AvailableAnalysis, TalkResponse } from '@cubes/contracts';
import type { Fetcher } from './api';

const obj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const token = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000;

/** Scope and citation binding, not an attempt to certify generated prose as factual. */
export function isTalkResponse(v: unknown, a: AvailableAnalysis, persona: AgentId): v is TalkResponse {
  if (!obj(v) || Object.keys(v).sort().join(',') !== 'clearance,cutId,explanation,model,persona,providerRequestId,releaseId,requestId,revision,sourceRefIds,status,usage') return false;
  const ids = new Set(a.sources.map(s => s.id));
  const u = v['usage'];
  return v['status'] === 'AVAILABLE' && v['releaseId'] === a.releaseId && v['cutId'] === a.cutId
    && v['revision'] === a.revision && v['clearance'] === a.clearance && v['persona'] === persona
    && str(v['requestId'], 256) && str(v['providerRequestId'], 256) && str(v['model'], 256) && str(v['explanation'], 1_200)
    && Array.isArray(v['sourceRefIds']) && v['sourceRefIds'].length > 0 && v['sourceRefIds'].length <= 8
    && new Set(v['sourceRefIds']).size === v['sourceRefIds'].length && v['sourceRefIds'].every((id: unknown) => typeof id === 'string' && ids.has(id))
    && obj(u) && Object.keys(u).sort().join(',') === 'completionTokens,promptTokens,totalTokens'
    && token(u['promptTokens']) && token(u['completionTokens']) && token(u['totalTokens'])
    && u['totalTokens'] === u['promptTokens'] + u['completionTokens'];
}

/** One cancelable request, no retries, no browser credentials or provider configuration. */
export function requestTalk(a: AvailableAnalysis, persona: AgentId, fetcher: Fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const result = (async (): Promise<TalkResponse | null> => {
    try {
      const response = await fetcher('/api/talk', { method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ persona, intent: 'release-gap', releaseId: a.releaseId }) });
      if (controller.signal.aborted || response.status !== 200) return null;
      const body: unknown = await response.json();
      return !controller.signal.aborted && isTalkResponse(body, a, persona) ? body : null;
    } catch { return null; }
    finally { clearTimeout(timeout); }
  })();
  return { result, cancel: () => { clearTimeout(timeout); controller.abort(); } };
}
