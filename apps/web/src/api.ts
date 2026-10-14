import type { AnalysisResponse, ApiError, GraphStatusResponse } from '@cubes/contracts';

/** Result of one API call. Never invents a successful graph answer. */
export type ApiResult<T> =
  | { kind: 'ok'; httpStatus: number; data: T }
  | { kind: 'unavailable'; httpStatus: number; data: T }
  | { kind: 'not_found'; httpStatus: 404; message: string }
  | { kind: 'error'; httpStatus: number | null; message: string };

export interface HealthResponse { status: string; ready: boolean; message?: string }
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const arr = (v: unknown): v is unknown[] => Array.isArray(v);

export function isHealth(v: unknown): v is HealthResponse {
  return isObj(v) && typeof v['status'] === 'string' && typeof v['ready'] === 'boolean';
}
export function isGraphStatus(v: unknown): v is GraphStatusResponse {
  return isObj(v) && (v['status'] === 'AVAILABLE' || v['status'] === 'UNAVAILABLE')
    && typeof v['ready'] === 'boolean' && typeof v['requestId'] === 'string';
}
/** Shape check only; trusts the server for authorization, not the client. */
export function isAnalysis(v: unknown): v is AnalysisResponse {
  if (!isObj(v) || typeof v['requestId'] !== 'string') return false;
  const lists = ['evidence', 'nodes', 'edges', 'sources', 'proposedActions'].every(k => arr(v[k]));
  if (!lists) return false;
  if (v['status'] === 'UNAVAILABLE') {
    // Contract: unavailable analysis carries no evidence, paths or actions.
    return ['evidence', 'nodes', 'edges', 'sources', 'proposedActions'].every(k => (v[k] as unknown[]).length === 0)
      && typeof v['reason'] === 'string';
  }
  return v['status'] === 'AVAILABLE' && typeof v['revision'] === 'string'
    && (v['clearance'] === 'ESTABLISHED' || v['clearance'] === 'GAP' || v['clearance'] === 'UNKNOWN');
}

async function getJson<T>(fetcher: Fetcher, url: string, guard: (v: unknown) => v is T, unavailable: (v: T) => boolean): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    return { kind: 'error', httpStatus: null, message: `API unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
  let body: unknown;
  try { body = await response.json(); } catch {
    return { kind: 'error', httpStatus: response.status, message: `Non-JSON response (HTTP ${response.status}).` };
  }
  if (response.status === 404) {
    const msg = isObj(body) && isObj(body['error']) ? String((body as unknown as ApiError).error.message) : 'Not found.';
    return { kind: 'not_found', httpStatus: 404, message: msg };
  }
  if (!guard(body)) {
    const msg = isObj(body) && isObj(body['error']) ? `${(body as unknown as ApiError).error.code}: ${(body as unknown as ApiError).error.message}` : 'Response did not match contract v1.';
    return { kind: 'error', httpStatus: response.status, message: msg };
  }
  if (unavailable(body)) return { kind: 'unavailable', httpStatus: response.status, data: body };
  if (!response.ok) return { kind: 'error', httpStatus: response.status, message: `HTTP ${response.status}.` };
  return { kind: 'ok', httpStatus: response.status, data: body };
}

const defaultFetch: Fetcher = (i, init) => fetch(i, init);
export const getHealth = (f: Fetcher = defaultFetch) => getJson(f, '/api/health', isHealth, h => !h.ready);
export const getGraphStatus = (f: Fetcher = defaultFetch) => getJson(f, '/api/graph/status', isGraphStatus, g => g.status === 'UNAVAILABLE');
export const getAnalysis = (releaseId: string, f: Fetcher = defaultFetch) =>
  getJson(f, `/api/releases/${encodeURIComponent(releaseId)}/analysis`, isAnalysis, a => a.status === 'UNAVAILABLE');
