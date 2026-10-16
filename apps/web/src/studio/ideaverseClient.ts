import type { Fetcher } from '../api';
import {
  createImportAttempt, parseImportReceipt,
  type CheckImport, type IdeaverseIdeaView, type IdeaverseOverviewView, type ImportAttempt, type ImportIdea, type ImportOutcome, type ImportReceipt, type ReadOverview,
} from './ideaImport';

/**
 * HTTP adapter for the PR #50 IdeaVerse contract (docs/ideaverse-api-v026.md, v030.01 4abc0cb):
 *   GET  /api/studio/ideas                       overview (graph overview unchanged)
 *   GET  /api/studio/ideas/:ideaId               verified detail with text
 *   POST /api/studio/ideas/:ideaId/import        {idempotencyKey, expectedRevision}
 *   POST /api/studio/ideas/:ideaId/import-status same tuple, READ ONLY reconciliation
 *
 * UNPROVEN against the shipped API: no such route exists on this branch (Mara v026 owns it). This module is a
 * reversible candidate: nothing in production wiring constructs it. It holds no credential and sends no Authorization
 * header (the dev proxy / session carries identity; an owner token must never be in the bundle). Every request is
 * `cache: 'no-store'`, has no query string, and a POST body is exactly the two contract keys.
 *
 * An HTTP `IMPORTED` is NOT trusted: the receipt is passed on raw so the card's strict parser and fresh read-back
 * decide. Every error shape is mapped to an ImportOutcome that never claims "nothing was saved" for an unclear result.
 */
export const STUDIO_BASE = '/api/studio';

export class StudioReadError extends Error {
  constructor(readonly kind: 'denied' | 'unavailable' | 'invalid', message: string) { super(message); this.name = 'StudioReadError'; }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const SHA = /^[0-9a-f]{64}$/;
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const int = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Runtime guard for one overview entry (the contract's `IdeaverseIdeaView`). Optional import fields must be strings when present. */
export function parseIdeaView(raw: unknown): IdeaverseIdeaView | null {
  if (!isObj(raw)) return null;
  const { id, filename, sha256, byteCount, submittedAt, touchedAt, synthetic, classification, imported, importedAt, membershipId } = raw;
  if (!str(id) || !str(filename) || typeof sha256 !== 'string' || !SHA.test(sha256) || !int(byteCount) || !str(submittedAt) || !str(touchedAt)) return null;
  if (synthetic !== true || classification !== 'proposal' || typeof imported !== 'boolean') return null;
  if ((importedAt !== undefined && !str(importedAt)) || (membershipId !== undefined && !str(membershipId))) return null;
  return { id, filename, sha256, byteCount, submittedAt, touchedAt, synthetic: true, classification: 'proposal', imported,
    ...(importedAt !== undefined ? { importedAt } : {}), ...(membershipId !== undefined ? { membershipId } : {}) };
}

/** Runtime guard for the overview body. Anything that is not exactly the contract shape is `null` (never trusted). */
export function parseOverview(raw: unknown): IdeaverseOverviewView | null {
  if (!isObj(raw)) return null;
  if (raw['status'] === 'UNAVAILABLE') {
    const r = raw['reason'];
    return r === 'CONNECTION_FAILED' || r === 'QUERY_FAILED' || r === 'MANIFEST_INVALID' ? { status: 'UNAVAILABLE', reason: r } : null;
  }
  if (raw['status'] === 'EMPTY') return str(raw['tenantId']) && raw['domain'] === 'studio' ? { status: 'EMPTY', tenantId: raw['tenantId'] as string, domain: 'studio' } : null;
  if (raw['status'] !== 'AVAILABLE') return null;
  const { tenantId, domain, workspace, ideas, counts, integrity } = raw;
  if (!str(tenantId) || domain !== 'studio' || !isObj(workspace) || !str(workspace['id']) || !int(workspace['revision'])) return null;
  if (!Array.isArray(ideas) || !isObj(counts) || !int(counts['ideas']) || !int(counts['imported']) || !Array.isArray(integrity)) return null;
  const views: IdeaverseIdeaView[] = [];
  for (const i of ideas) { const v = parseIdeaView(i); if (!v) return null; views.push(v); }
  const flags: { id: string; reason: string }[] = [];
  for (const f of integrity) { if (!isObj(f) || !str(f['id']) || typeof f['reason'] !== 'string') return null; flags.push({ id: f['id'], reason: f['reason'] }); }
  return { status: 'AVAILABLE', tenantId, domain: 'studio', workspace: { id: workspace['id'] as string, revision: workspace['revision'] as number },
    ideas: views, counts: { ideas: counts['ideas'] as number, imported: counts['imported'] as number }, integrity: flags };
}

/** Verified detail: the metadata view plus the server-read text (1-30 words). */
export type IdeaDetailResult =
  | { kind: 'ready'; idea: IdeaverseIdeaView & { text: string } }
  | { kind: 'unavailable' };
export const MAX_IDEA_WORDS = 30;
export function parseDetail(raw: unknown): IdeaDetailResult {
  if (!isObj(raw) || raw['status'] !== 'AVAILABLE' || !isObj(raw['idea'])) return { kind: 'unavailable' };
  const view = parseIdeaView((({ text: _t, ...rest }) => rest)(raw['idea'] as Record<string, unknown>));
  const text = (raw['idea'] as Record<string, unknown>)['text'];
  if (!view || typeof text !== 'string') return { kind: 'unavailable' };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 1 || words > MAX_IDEA_WORDS) return { kind: 'unavailable' };
  return { kind: 'ready', idea: { ...view, text } };
}

export interface StudioClient {
  readOverview: ReadOverview;
  readDetail: (ideaId: string) => Promise<IdeaDetailResult>;
  importIdea: ImportIdea;
  checkImport: CheckImport;
}

interface Reply { status: number; body: unknown }

export function createStudioClient(fetcher: Fetcher = (i, init) => fetch(i, init), base: string = STUDIO_BASE): StudioClient {
  const path = (ideaId: string, suffix = '') => `${base}/ideas${ideaId ? `/${encodeURIComponent(ideaId)}` : ''}${suffix}`;
  const send = async (url: string, init: RequestInit): Promise<Reply | null> => {
    let res: Response;
    try { res = await fetcher(url, { ...init, cache: 'no-store' }); } catch { return null; }
    // A refusal is a refusal whatever its body looks like: decided before the body is parsed.
    if (res.status === 401 || res.status === 403) return { status: res.status, body: null };
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  };
  const GET: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } };
  const post = (a: ImportAttempt): RequestInit => ({
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: a.idempotencyKey, expectedRevision: a.expectedRevision }),
  });
  const pin = (a: ImportAttempt): ImportAttempt | null => { try { return createImportAttempt(a.ideaId, a.idempotencyKey, a.expectedRevision); } catch { return null; } };

  const readOverview: ReadOverview = async () => {
    const r = await send(path(''), GET);
    if (r === null) throw new StudioReadError('unavailable', 'network');
    if (r.status === 401 || r.status === 403) throw new StudioReadError('denied', `HTTP ${r.status}`);
    const view = parseOverview(r.body);
    // 200 = AVAILABLE|EMPTY, 503 = UNAVAILABLE; a view that disagrees with its HTTP status is not trusted.
    if (!view || (r.status === 200) !== (view.status !== 'UNAVAILABLE') || (r.status !== 200 && r.status !== 503)) throw new StudioReadError('invalid', `HTTP ${r.status}`);
    return view;
  };
  const readDetail = async (ideaId: string): Promise<IdeaDetailResult> => {
    const r = await send(path(ideaId), GET);
    if (r === null || r.status !== 200) return { kind: 'unavailable' };
    return parseDetail(r.body);
  };
  const run = async (a: ImportAttempt, suffix: '/import' | '/import-status'): Promise<ImportOutcome | { kind: 'not-observed' }> => {
    const tuple = pin(a);
    if (!tuple) return { kind: 'not-started' };       // nothing is sent for an invalid tuple
    const r = await send(path(tuple.ideaId, suffix), post(tuple));
    // A lost reply after the request left the browser may still have committed: uncertain, never "not saved".
    if (r === null) return { kind: 'ambiguous' };
    return mapReply(r, tuple, suffix === '/import-status');
  };
  return {
    readOverview, readDetail,
    importIdea: a => run(a, '/import') as Promise<ImportOutcome>,
    checkImport: a => run(a, '/import-status'),
  };
}

/** Pure status/body to outcome mapping (exported for the contract tests). */
export function mapReply(r: Reply, a: ImportAttempt, statusRoute: boolean): ImportOutcome | { kind: 'not-observed' } {
  const body = isObj(r.body) ? r.body : null;
  const status = body ? body['status'] : undefined;
  if (r.status === 401 || r.status === 403) return { kind: 'denied' };
  if (r.status === 200) {
    if (status === 'IMPORTED') {
      const receipt = body!['receipt'];
      // Raw receipt on purpose: the reducer's strict parser and the fresh read-back decide; a bad one becomes `receipt-invalid`.
      return { kind: 'persisted', receipt: receipt as ImportReceipt, replayed: body!['replayed'] === true };
    }
    if (statusRoute && status === 'NOT_FOUND') return { kind: 'not-observed' };
    return { kind: 'failed' };
  }
  if (r.status === 409 && status === 'CONFLICT') {
    switch (body!['reason']) {
      case 'STALE_REVISION': return { kind: 'stale' };
      case 'KEY_REUSED': return { kind: 'key-reused' };
      case 'ALREADY_IMPORTED': {
        const receipt = body!['receipt'] === undefined ? null : parseImportReceipt(body!['receipt']);
        // A malformed carried receipt is dropped: the card then re-checks instead of trusting it.
        return receipt && receipt.ideaId === a.ideaId ? { kind: 'existing', receipt } : { kind: 'existing' };
      }
      default: return { kind: 'failed' };
    }
  }
  if ((r.status === 422 && status === 'REJECTED') || r.status === 400) return { kind: 'rejected' };
  if (r.status === 503 && status === 'UNAVAILABLE') return { kind: 'unavailable' };
  if (r.status === 503 && status === 'UNCONFIRMED') return { kind: 'unconfirmed' };
  return { kind: 'failed' };
}
