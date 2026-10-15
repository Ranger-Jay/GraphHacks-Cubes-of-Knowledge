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
}

/** Persisted receipt, as proposed in #40. Present only when the server confirmed a stored membership. */
export interface ImportReceipt {
  ideaId: string;
  fileHash: string;
  workspaceId: string;
  importedAt: string;
  workspaceRevision: number;
  membershipId: string;
}

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
