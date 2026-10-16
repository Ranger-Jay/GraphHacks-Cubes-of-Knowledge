/**
 * IdeaVerse card import state (v025.05). PURE, no network, no DOM.
 *
 * UNPROVEN ADAPTER BOUNDARY: the types below mirror the PROPOSED contract in issue #40
 * (POST /api/studio/ideas/:ideaId/import with idempotencyKey + expected workspace revision, persisted receipt).
 * No such route, manifest or shared transport type exists in the repo at this base, and Mara/Buddy own the final
 * contract. The card therefore takes an injected `ImportIdea` function and never calls fetch itself. Until that
 * function is bound to a real, reviewed route the shell binds none and the card says so honestly.
 */

/** Fields #39 puts on the card. `text` is a short fictional proposal, never a verified fact. */
export interface IdeaSummary {
  id: string;
  filename: string;
  /** Manifest-authoritative UTC timestamps (ISO 8601). */
  submittedAt: string;
  touchedAt: string;
  text: string;
  /** Manifest SHA-256 of the idea file, when the card source knows it (checked against the read-back when present). */
  sha256?: string;
}

/**
 * Persisted receipt. Field names mirror `ImportReceipt` in packages/graph/src/ideaverse.ts at claude/studio-data-v023-followup
 * 366eb56c59da7c084d540cee00b86ba041e15600 EXACTLY. Integration ruling (issue #40, comment 6206859588): the canonical
 * receipt hash field is `sha256`. No `fileHash`, `fileSha256`, `witnessHash` or other alias exists, and none is accepted.
 */
export interface ImportReceipt {
  ideaId: string;
  sha256: string;
  workspaceId: string;
  importedAt: string;
  workspaceRevision: number;
  membershipId: string;
}

const RECEIPT_KEYS = ['ideaId', 'sha256', 'workspaceId', 'importedAt', 'workspaceRevision', 'membershipId'] as const;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Runtime guard for a receipt that crosses the adapter boundary (types alone cannot stop an adapter that returns an
 * incompatible shape). Returns the receipt, or null if any canonical field is missing or malformed, or if the object
 * carries a non-canonical key (so a `fileSha256` or other alias is rejected, never silently mapped).
 */
export function parseImportReceipt(raw: unknown): ImportReceipt | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some(k => !(RECEIPT_KEYS as readonly string[]).includes(k))) return null;
  const { ideaId, sha256, workspaceId, importedAt, workspaceRevision, membershipId } = o;
  if (typeof ideaId !== 'string' || !ideaId || typeof workspaceId !== 'string' || !workspaceId || typeof membershipId !== 'string' || !membershipId) return null;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  if (typeof importedAt !== 'string' || !Number.isFinite(Date.parse(importedAt))) return null;
  if (typeof workspaceRevision !== 'number' || !Number.isInteger(workspaceRevision) || workspaceRevision < 1) return null;
  return { ideaId, sha256, workspaceId, importedAt, workspaceRevision, membershipId };
}

/**
 * Read-back shapes. Mirror `IdeaverseIdea` / `IdeaverseOverview` in packages/graph/src/ideaverse.ts at 366eb56 (the
 * overview already withholds any idea whose import state is not exactly one consistent receipt + membership + current
 * manifest hash, and lists it under `integrity`). UNPROVEN until a server adapter returns this over a reviewed route.
 */
export interface IdeaverseIdeaView {
  id: string;
  filename: string;
  sha256: string;
  byteCount: number;
  submittedAt: string;
  touchedAt: string;
  synthetic: true;
  classification: 'proposal';
  imported: boolean;
  importedAt?: string;
  membershipId?: string;
}
export type IdeaverseOverviewView =
  | { status: 'AVAILABLE'; tenantId: string; domain: 'studio'; workspace: { id: string; revision: number }; ideas: IdeaverseIdeaView[]; counts: { ideas: number; imported: number }; integrity: { id: string; reason: string }[] }
  | { status: 'EMPTY'; tenantId: string; domain: 'studio' }
  | { status: 'UNAVAILABLE'; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'MANIFEST_INVALID' };

/** Fresh read of the studio overview (a NEW read, never a cached one). Injected like `ImportIdea`; the shell binds none. */
export type ReadOverview = () => Promise<IdeaverseOverviewView>;

/** Everything an import attempt can end as. Only `persisted` may ever play a success transition. */
export type ImportOutcome =
  | { kind: 'persisted'; receipt: ImportReceipt }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'conflict' }
  | { kind: 'ambiguous' }
  | { kind: 'failed' };

export type ImportIdea = (idea: IdeaSummary, idempotencyKey: string) => Promise<ImportOutcome>;

export type ImportFailure = Exclude<ImportOutcome['kind'], 'persisted'>;

/**
 * Why a completed-looking import is NOT shown as Added. `receipt-invalid`: the adapter's receipt is not the canonical
 * shape. `readback-*`: the fresh overview read failed or has no workspace. `not-found` / `not-imported`: the fresh
 * read has no imported entry for this idea. `duplicate` / `integrity`: the read-back lists the idea twice or withholds
 * it with an integrity item. `mismatch`: id, workspace, membership, timestamp, revision or hash disagree.
 */
export type UnconfirmedReason =
  | 'receipt-invalid' | 'readback-unavailable' | 'readback-empty'
  | 'not-found' | 'not-imported' | 'duplicate' | 'integrity' | 'mismatch';

export type VerifyResult = { ok: true } | { ok: false; reason: UnconfirmedReason };

/**
 * Join a receipt to a FRESH `ideaverseOverview` read (issue #40 ruling, comment 6206859588). An HTTP success or a
 * receipt alone never counts. The overview exposes no receipt rows, so "exactly one matching receipt" is what the graph
 * enforces before it will list an idea as imported at all (it withholds duplicate/receipt-less/stale-hash ideas under
 * `integrity`); here we require: exactly one listed entry, flagged imported, with the receipt's membershipId,
 * importedAt and sha256, the card's own sha256 when known, the receipt's workspace, a workspace revision that has
 * reached the receipt's, and no integrity item naming the idea. Anything else is unconfirmed, never success.
 */
export function verifyImportReadback(idea: IdeaSummary, receipt: ImportReceipt, overview: IdeaverseOverviewView): VerifyResult {
  if (overview.status === 'UNAVAILABLE') return { ok: false, reason: 'readback-unavailable' };
  if (overview.status !== 'AVAILABLE') return { ok: false, reason: 'readback-empty' };
  if (receipt.ideaId !== idea.id || receipt.workspaceId !== overview.workspace.id) return { ok: false, reason: 'mismatch' };
  const flagged = overview.integrity.filter(i => i.id === idea.id);
  if (flagged.length > 0) return { ok: false, reason: flagged.some(i => /duplicate/i.test(i.reason)) ? 'duplicate' : 'integrity' };
  const listed = overview.ideas.filter(i => i.id === idea.id);
  if (listed.length === 0) return { ok: false, reason: 'not-found' };
  if (listed.length > 1) return { ok: false, reason: 'duplicate' };
  const m = listed[0]!;
  if (m.imported !== true || typeof m.membershipId !== 'string' || typeof m.importedAt !== 'string') return { ok: false, reason: 'not-imported' };
  if (m.membershipId !== receipt.membershipId || m.importedAt !== receipt.importedAt || m.sha256 !== receipt.sha256) return { ok: false, reason: 'mismatch' };
  if (idea.sha256 !== undefined && idea.sha256 !== m.sha256) return { ok: false, reason: 'mismatch' };
  if (!Number.isInteger(overview.workspace.revision) || overview.workspace.revision < receipt.workspaceRevision) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

/**
 * `verifying`: the server reported a persisted receipt; a fresh overview read is in flight. NOT a success state.
 * `unconfirmed`: the outcome is not proven. `receipt` is kept (when the adapter's receipt was valid) so a re-check can
 * read again without resubmitting.
 */
export type ImportState =
  | { phase: 'idle'; requestId: number }
  | { phase: 'pending'; requestId: number }
  | { phase: 'verifying'; requestId: number; receipt: ImportReceipt }
  | { phase: 'added'; requestId: number; receipt: ImportReceipt }
  | { phase: 'unconfirmed'; requestId: number; reason: UnconfirmedReason; receipt: ImportReceipt | null }
  | { phase: 'error'; requestId: number; reason: ImportFailure };

export type ImportEvent =
  | { type: 'submit' }
  | { type: 'settled'; requestId: number; outcome: ImportOutcome }
  /** Result of the fresh read-back for the current `verifying` request. */
  | { type: 'verified'; requestId: number; result: VerifyResult }
  /** Read the overview again for a kept receipt, without resubmitting. */
  | { type: 'recheck' }
  /** The card was closed or the idea changed: any in-flight completion is now stale. */
  | { type: 'reset' };

export const initialImportState: ImportState = { phase: 'idle', requestId: 0 };

/**
 * `submit` is ignored while pending, verifying or once added (no repeated submits). A completion whose requestId is not
 * the current one is discarded (stale after close/reset). `added` is reachable ONLY from `verifying` through a
 * `verified` event whose result is ok; a `persisted` outcome only moves to `verifying` (or `unconfirmed` when the
 * receipt is not the canonical shape).
 */
export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'submit':
      if (state.phase === 'pending' || state.phase === 'verifying' || state.phase === 'added') return state;
      return { phase: 'pending', requestId: state.requestId + 1 };
    case 'settled': {
      if (state.phase !== 'pending' || event.requestId !== state.requestId) return state;
      if (event.outcome.kind !== 'persisted') return { phase: 'error', requestId: state.requestId, reason: event.outcome.kind };
      const receipt = parseImportReceipt(event.outcome.receipt);
      return receipt
        ? { phase: 'verifying', requestId: state.requestId, receipt }
        : { phase: 'unconfirmed', requestId: state.requestId, reason: 'receipt-invalid', receipt: null };
    }
    case 'verified':
      if (state.phase !== 'verifying' || event.requestId !== state.requestId) return state;
      return event.result.ok
        ? { phase: 'added', requestId: state.requestId, receipt: state.receipt }
        : { phase: 'unconfirmed', requestId: state.requestId, reason: event.result.reason, receipt: state.receipt };
    case 'recheck':
      if (state.phase !== 'unconfirmed' || state.receipt === null) return state;
      return { phase: 'verifying', requestId: state.requestId + 1, receipt: state.receipt };
    case 'reset':
      return { phase: 'idle', requestId: state.requestId + 1 };
  }
}

/** Plain-language reasons an import is not shown as Added. None of them claims it was or was not saved. */
export const UNCONFIRMED_COPY: Record<UnconfirmedReason, string> = {
  'receipt-invalid': 'The server reply was not in the expected form, so this could not be confirmed.',
  'readback-unavailable': 'Could not re-read the cube to confirm this right now.',
  'readback-empty': 'The cube has no workspace to confirm this against yet.',
  'not-found': 'The cube does not list this idea yet, so it is not confirmed.',
  'not-imported': 'The cube lists this idea but not as added, so it is not confirmed.',
  duplicate: 'The cube shows this idea more than once, so it is not confirmed.',
  integrity: 'The cube flagged this idea for a consistency problem, so it is not confirmed.',
  mismatch: 'The cube record does not match the receipt, so it is not confirmed.',
};

/** Honest, plain-language reasons. None of them claims anything was saved. */
export const IMPORT_FAILURE_COPY: Record<ImportFailure, string> = {
  denied: 'Adding ideas needs owner access. Nothing was saved.',
  unavailable: 'The cube data is unavailable right now. Nothing was saved.',
  conflict: 'The cube changed since this card opened. Close it, look again, then retry. Nothing was saved.',
  ambiguous: 'Could not confirm whether this was saved. Retry reuses the same request key, so it cannot add a second copy.',
  failed: 'Could not save this idea. Nothing was saved.',
};

/** Shown when no import function is bound (the shell binds none today). */
export const IMPORT_UNBOUND_COPY = 'Adding to the cube is not connected yet.';

/** Deterministic UTC calendar date for the card ("2026-10-14 UTC"); invalid input never throws or shows "NaN". */
export function formatUtcDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'unknown date';
  return `${new Date(t).toISOString().slice(0, 10)} UTC`;
}

/** Escape closes the card; nothing else does. */
export function isCloseKey(key: string): boolean {
  return key === 'Escape' || key === 'Esc';
}
