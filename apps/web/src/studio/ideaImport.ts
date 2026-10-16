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

export type ImportState =
  | { phase: 'idle'; requestId: number }
  | { phase: 'pending'; requestId: number }
  | { phase: 'added'; requestId: number; receipt: ImportReceipt }
  | { phase: 'error'; requestId: number; reason: ImportFailure };

export type ImportEvent =
  | { type: 'submit' }
  | { type: 'settled'; requestId: number; outcome: ImportOutcome }
  /** The card was closed or the idea changed: any in-flight completion is now stale. */
  | { type: 'reset' };

export const initialImportState: ImportState = { phase: 'idle', requestId: 0 };

/**
 * `submit` is ignored while pending or once added (no repeated submits). A completion whose requestId is not the
 * current one is discarded (stale after close/reset). Success only comes from a `persisted` outcome.
 */
export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'submit':
      if (state.phase === 'pending' || state.phase === 'added') return state;
      return { phase: 'pending', requestId: state.requestId + 1 };
    case 'settled':
      if (state.phase !== 'pending' || event.requestId !== state.requestId) return state;
      return event.outcome.kind === 'persisted'
        ? { phase: 'added', requestId: state.requestId, receipt: event.outcome.receipt }
        : { phase: 'error', requestId: state.requestId, reason: event.outcome.kind };
    case 'reset':
      return { phase: 'idle', requestId: state.requestId + 1 };
  }
}

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
