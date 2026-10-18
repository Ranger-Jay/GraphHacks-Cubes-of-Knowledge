import type { Fetcher } from '../api';
import type { StudioAccess } from './studioGuard';

/**
 * Browser-side capability binding (v049): turns the reviewed server access response into the shell's effective
 * access. The browser holds no credential and sends none (`credentials: 'omit'`); identity comes from the
 * server-held token the dev proxy injects, exactly as the import routes do. No browser profile, role, or local
 * flag can grant access: only an exact, consistent OWNER capability from the SAME guarded owner alias used for
 * imports enables Add.
 *
 * Resolution (see docs/session-access-v048.md for the server contract):
 *  - Alias first: GET /api/owner-rehearsal/session/access. A valid OWNER enables Add; a valid READER reads only.
 *  - Alias 404 (missing/disabled alias) falls back to the ordinary GET /api/session/access, CAPPED at READER:
 *    an OWNER claim from the ordinary transport contradicts that transport (it carries only the reader token)
 *    and is treated as malformed. The fallback can therefore never authorize the absent owner transport.
 *  - Alias 401/403/malformed/unexpected/network loss fail closed with NO fallback: 403 is an explicit refusal
 *    (DENIED); anything else is unconfirmed (UNKNOWN). Add stays off in both.
 */

/** The guarded owner alias used for imports (v048.02). Only an OWNER from here may enable Add. */
export const OWNER_ALIAS_ACCESS_URL = '/api/owner-rehearsal/session/access';
/** Ordinary read access. A fallback source only; never an OWNER authority. */
export const ORDINARY_ACCESS_URL = '/api/session/access';

export interface SessionCapability { access: 'OWNER' | 'READER'; canReadIdeas: boolean; canImportIdeas: boolean }

/**
 * Strict shape + boolean-consistency check for a server access response. OWNER must be exactly true/true,
 * READER exactly true/false; anything else (wrong types, missing fields, inconsistent booleans, other access
 * values, non-objects) is `null` and never trusted.
 */
export function parseSessionCapability(raw: unknown): SessionCapability | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { access, canReadIdeas, canImportIdeas } = raw as Record<string, unknown>;
  if (access !== 'OWNER' && access !== 'READER') return null;
  if (typeof canReadIdeas !== 'boolean' || typeof canImportIdeas !== 'boolean') return null;
  if (access === 'OWNER' && !(canReadIdeas && canImportIdeas)) return null;
  if (access === 'READER' && !(canReadIdeas && !canImportIdeas)) return null;
  return { access, canReadIdeas, canImportIdeas };
}

type Resolved =
  | { kind: 'capability'; access: 'OWNER' | 'READER' }
  | { kind: 'missing' }  // HTTP 404: the route is absent/disabled
  | { kind: 'refused' }  // HTTP 403: explicit server refusal
  | { kind: 'unknown' }; // 401, malformed, unexpected status, network loss

async function fetchCapability(fetcher: Fetcher, url: string): Promise<Resolved> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch { return { kind: 'unknown' }; }
  // A refusal is decided before the body is parsed, whatever the body looks like.
  if (response.status === 404) return { kind: 'missing' };
  if (response.status === 403) return { kind: 'refused' };
  if (response.status !== 200) return { kind: 'unknown' };
  let body: unknown = null;
  try { body = await response.json(); } catch { return { kind: 'unknown' }; }
  const capability = parseSessionCapability(body);
  return capability ? { kind: 'capability', access: capability.access } : { kind: 'unknown' };
}

/** One resolution: alias first, ordinary fallback only on alias 404, capped at READER. Never throws. */
export async function resolveSessionAccess(fetcher: Fetcher): Promise<StudioAccess> {
  const alias = await fetchCapability(fetcher, OWNER_ALIAS_ACCESS_URL);
  if (alias.kind === 'capability') return alias.access;
  if (alias.kind === 'refused') return 'DENIED';
  if (alias.kind !== 'missing') return 'UNKNOWN';
  const ordinary = await fetchCapability(fetcher, ORDINARY_ACCESS_URL);
  if (ordinary.kind === 'capability') return ordinary.access === 'READER' ? 'READER' : 'UNKNOWN';
  if (ordinary.kind === 'refused') return 'DENIED';
  return 'UNKNOWN';
}

export interface AccessStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StudioAccess;
  /** Re-resolve from the server. Concurrent calls share one in-flight request. */
  refresh: () => Promise<StudioAccess>;
  /**
   * Forget the capability (phase change / re-query / panel unmount): stale OWNER is gone and old
   * responses are invalidated. REUSABLE: the store stays usable, so a later mount re-resolves with a
   * fresh GET. Never revives a disposed store (a disposed snapshot stays UNKNOWN).
   */
  clear: () => void;
  /**
   * Forget the capability and refuse all later writes: delayed responses after teardown are discarded.
   * PERMANENT teardown (discard the binding, not a route leave): resets the cached capability to
   * UNKNOWN first, so a disposed store never exposes a stale OWNER, and refresh() after disposal
   * performs no fetch. A panel unmount must call clear(), not dispose(), because the store outlives
   * the panel and the next mount must re-resolve.
   */
  dispose: () => void;
}

/**
 * The shell's live capability. Default UNKNOWN. A sequence/generation guard is the staleness authority: every
 * refresh captures the generation at start and applies only while it is still current, so a delayed OWNER can
 * never overwrite a newer denial or clear, and nothing writes after disposal.
 */
export function createAccessStore(fetcher: Fetcher = (input, init) => fetch(input, init)): AccessStore {
  let current: StudioAccess = 'UNKNOWN';
  let generation = 0;
  let disposed = false;
  let inflight: Promise<StudioAccess> | null = null;
  const listeners = new Set<() => void>();
  const emit = (): void => { for (const listener of [...listeners]) listener(); };
  const apply = (next: StudioAccess, gen: number): void => {
    if (disposed || gen !== generation || next === current) return;
    current = next;
    emit();
  };
  return {
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => current,
    refresh: () => {
      if (disposed) return Promise.resolve(current);
      if (inflight) return inflight;
      const gen = ++generation;
      const pending = resolveSessionAccess(fetcher).then(next => { apply(next, gen); return current; });
      inflight = pending;
      return pending.finally(() => { if (inflight === pending) inflight = null; });
    },
    clear: () => {
      generation++;
      // Drop the dedupe marker so the next refresh starts a fresh request; the old response is still
      // discarded by the generation guard. Without this, a phase bounce would leave access stuck UNKNOWN.
      inflight = null;
      // Reusable: a clear never revives a disposed store, but a disposed snapshot is already UNKNOWN
      // (dispose resets it), so there is nothing to forget here.
      if (disposed || current === 'UNKNOWN') return;
      current = 'UNKNOWN';
      emit();
    },
    dispose: () => {
      disposed = true;
      generation++;
      inflight = null;
      // Permanent teardown resets the cached capability FIRST: a disposed store must never expose a
      // stale OWNER to a later mount. Still-subscribed readers are told (UNKNOWN) before they are dropped.
      current = 'UNKNOWN';
      emit();
      listeners.clear();
    },
  };
}
