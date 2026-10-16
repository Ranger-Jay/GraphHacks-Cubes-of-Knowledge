/**
 * IdeaVerse card import state. PURE, no network, no DOM.
 *
 * Transport types come from `@cubes/contracts` (PR #50 `buddy/import-contract-v030` v030.01 4abc0cb, merged unchanged at
 * v025.13). Those are transport declarations, not runtime validation: every value that crosses the adapter boundary is
 * still parsed here (`parseImportReceipt`) and joined to a FRESH overview read (`verifyImportReadback`). No shipped route
 * implements the contract yet (Mara v026), so the card takes injected functions and the shell binds none.
 */
import type {
  IdeaImportReceipt, IdeaverseIdeaView as ContractIdeaView, IdeaverseOverviewResponse,
} from '@cubes/contracts';

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
 * Persisted receipt: exactly the six canonical fields of the contract's `IdeaImportReceipt` (graph `ImportReceipt` at
 * 366eb56). Integration ruling (issue #40, comment 6206859588): the hash field is `sha256`. No `fileHash`, `fileSha256`,
 * `witnessHash`, `nodeId` or `edgeId` exists, and none is accepted.
 */
export type ImportReceipt = IdeaImportReceipt;

const RECEIPT_KEYS = ['ideaId', 'sha256', 'workspaceId', 'importedAt', 'workspaceRevision', 'membershipId'] as const;
const SHA256 = /^[0-9a-f]{64}$/;
/** Strict UTC instant, as the graph writes it (`2026-10-15T23:00:00.000Z`). Offsets and bare dates are refused. */
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

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
  if (typeof importedAt !== 'string' || !STRICT_UTC.test(importedAt) || !Number.isFinite(Date.parse(importedAt))) return null;
  if (typeof workspaceRevision !== 'number' || !Number.isSafeInteger(workspaceRevision) || workspaceRevision < 1) return null;
  return { ideaId, sha256, workspaceId, importedAt, workspaceRevision, membershipId };
}

/**
 * Read-back shapes: the contract's `IdeaverseOverviewResponse` (the graph `ideaverseOverview` unchanged). The overview
 * already withholds any idea whose import state is not exactly one consistent receipt + membership + current manifest
 * hash, and lists it under `integrity`. Metadata only: it deliberately has no idea `text`.
 */
export type IdeaverseIdeaView = ContractIdeaView;
export type IdeaverseOverviewView = IdeaverseOverviewResponse;

/** Fresh read of the studio overview (a NEW read, never a cached one). Injected like `ImportIdea`; the shell binds none. */
export type ReadOverview = () => Promise<IdeaverseOverviewView>;

/**
 * One import ATTEMPT is the immutable tuple {ideaId, idempotencyKey, expectedRevision} (contract: "Capture ... from a fresh
 * overview when creating an attempt. Pin the entire tuple for the life of that attempt, including retries, close/reopen
 * reconciliation and lost replies. Never re-read expectedRevision under an existing key."). A retry after a stale-revision
 * result is a NEW attempt (fresh overview, new key), never the same key with a new revision (that is KEY_REUSED).
 */
export interface ImportAttempt {
  readonly ideaId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
}
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;
const IDEA_ID_FORMAT = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Frozen tuple, validated with the contract's request rules. Throws RangeError on an invalid field (never sends a bad request). */
export function createImportAttempt(ideaId: string, idempotencyKey: string, expectedRevision: number): ImportAttempt {
  if (typeof ideaId !== 'string' || !IDEA_ID_FORMAT.test(ideaId)) throw new RangeError('invalid idea id');
  if (typeof idempotencyKey !== 'string' || !KEY_FORMAT.test(idempotencyKey)) throw new RangeError('invalid idempotency key');
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RangeError('invalid expected revision');
  return Object.freeze({ ideaId, idempotencyKey, expectedRevision });
}
export const sameAttempt = (a: ImportAttempt, b: ImportAttempt): boolean =>
  a.ideaId === b.ideaId && a.idempotencyKey === b.idempotencyKey && a.expectedRevision === b.expectedRevision;

/**
 * Everything an import request can end as, mapped from the contract's responses by the client (ideaverseClient.ts).
 * Only `persisted` (and `existing` with a receipt) can reach a success view, and only through the fresh read-back.
 *  - persisted:   IMPORTED (receipt still parsed and read back by the card; the server's word alone is not enough)
 *  - existing:    CONFLICT/ALREADY_IMPORTED, with the graph receipt when the server carried one
 *  - stale:       CONFLICT/STALE_REVISION   - the tuple's revision is out of date: needs a NEW attempt
 *  - key-reused:  CONFLICT/KEY_REUSED       - needs a NEW attempt
 *  - rejected:    REJECTED or 400/422       - a proven refusal ("The server refused this request.")
 *  - denied:      401/403
 *  - unavailable: 503 UNAVAILABLE           - a write may or may not have reached the database: UNCERTAIN
 *  - unconfirmed: 503 UNCONFIRMED           - UNCERTAIN
 *  - ambiguous / failed: network loss, unparsable body, unknown status: UNCERTAIN
 */
export type ImportOutcome =
  | { kind: 'persisted'; receipt: ImportReceipt; replayed?: boolean }
  | { kind: 'existing'; receipt?: ImportReceipt }
  | { kind: 'stale' }
  | { kind: 'key-reused' }
  | { kind: 'rejected' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'unconfirmed' }
  | { kind: 'ambiguous' }
  | { kind: 'failed' }
  /** Local only: the attempt could not be pinned (the fresh overview read failed), so NO request was sent. */
  | { kind: 'not-started' };

/** Writes. Receives the WHOLE pinned tuple; the adapter must send exactly {idempotencyKey, expectedRevision} for `ideaId`. */
export type ImportIdea = (attempt: ImportAttempt) => Promise<ImportOutcome>;
/** Read-only reconciliation of the SAME tuple (contract `import-status`). Never writes. `not-observed` is an observation, not proof. */
export type CheckImport = (attempt: ImportAttempt) => Promise<ImportOutcome | { kind: 'not-observed' }>;

export type ImportFailure = Exclude<ImportOutcome['kind'], 'persisted' | 'existing'>;
/** Failures after which the write may or may not have happened: copy is "Could not confirm ..." and Re-check is offered. */
export const UNCERTAIN_FAILURES: ReadonlySet<ImportFailure> = new Set(['unavailable', 'unconfirmed', 'ambiguous', 'failed']);
/** Failures that mean "start a new attempt" (fresh overview + new key). */
export const NEW_ATTEMPT_FAILURES: ReadonlySet<ImportFailure> = new Set(['stale', 'key-reused']);

/**
 * Why a completed-looking import is NOT shown as Added. `receipt-invalid`: the adapter's receipt is not the canonical
 * shape. `readback-*`: the fresh overview read failed or has no workspace. `not-found` / `not-imported`: the fresh
 * read has no imported entry for this idea. `duplicate` / `integrity`: the read-back lists the idea twice or withholds
 * it with an integrity item. `mismatch`: id, workspace, membership, timestamp, revision or hash disagree.
 * `unresolved`: an earlier attempt for this idea was interrupted (card closed, phase left READY). `not-observed`: the
 * read-only status check saw no matching receipt (not proof that a request in flight cannot still commit). `existing`:
 * the server says the idea is already in the cube but gave no receipt to confirm.
 */
export type UnconfirmedReason =
  | 'receipt-invalid' | 'readback-unavailable' | 'readback-empty'
  | 'not-found' | 'not-imported' | 'duplicate' | 'integrity' | 'mismatch'
  | 'unresolved' | 'not-observed' | 'existing';

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
 * One fresh read-back for a persisted receipt: the pure async part of the card's `verifying` step. A missing reader, a
 * rejected read or a thrown error is `readback-unavailable`; it never resolves to success without `verifyImportReadback`.
 */
export async function confirmImport(idea: IdeaSummary, receipt: ImportReceipt, readOverview: ReadOverview | undefined): Promise<VerifyResult> {
  if (!readOverview) return { ok: false, reason: 'readback-unavailable' };
  try { return verifyImportReadback(idea, receipt, await readOverview()); }
  catch { return { ok: false, reason: 'readback-unavailable' }; }
}

/**
 * `verifying`: a receipt exists (from IMPORTED, ALREADY_IMPORTED or a read-only status check) and a fresh overview read
 * is in flight. NOT a success state. `via` says where the receipt came from: only `import` and `recheck` (this attempt's
 * own key) may end as `added`; `existing` (someone else's receipt) ends as `present`.
 * `checking`: a read-only status check is in flight (no write is possible from here).
 * `present`: the cube confirms the idea is already in it. No success animation: nothing was added by this card.
 * `unconfirmed`: the outcome is not proven. `receipt` is kept (when valid) so a re-check can read again without resubmitting.
 */
export type VerifyVia = 'import' | 'existing' | 'recheck';
export type ImportState =
  | { phase: 'idle'; requestId: number }
  | { phase: 'pending'; requestId: number }
  | { phase: 'checking'; requestId: number }
  | { phase: 'verifying'; requestId: number; receipt: ImportReceipt; via: VerifyVia }
  | { phase: 'added'; requestId: number; receipt: ImportReceipt }
  | { phase: 'present'; requestId: number; receipt: ImportReceipt | null }
  | { phase: 'unconfirmed'; requestId: number; reason: UnconfirmedReason; receipt: ImportReceipt | null }
  | { phase: 'error'; requestId: number; reason: ImportFailure };

/** Result of a read-only status check. `present` is the overview-only fallback: the fresh read lists the idea as imported. */
export type CheckResult = ImportOutcome | { kind: 'not-observed' } | { kind: 'present' };

export type ImportEvent =
  | { type: 'submit' }
  | { type: 'settled'; requestId: number; outcome: ImportOutcome }
  /** Result of the fresh read-back for the current `verifying` request. */
  | { type: 'verified'; requestId: number; result: VerifyResult }
  /** Read the overview again for a kept receipt, without resubmitting. */
  | { type: 'recheck' }
  /** Start a read-only status check (no receipt known yet). Never writes. */
  | { type: 'check' }
  | { type: 'checked'; requestId: number; result: CheckResult }
  /** The fresh overview read that pins an attempt (or a status check) shows the idea already in the cube. Nothing was added by this card. */
  | { type: 'observed-present'; requestId: number }
  /** The card was closed or the phase left READY while a request was in flight: the completion is stale, the attempt stays unresolved. */
  | { type: 'abandon' }
  /** A NEW attempt starts from scratch (explicit fresh overview + new key happened outside this reducer). */
  | { type: 'reset' };

export const initialImportState: ImportState = { phase: 'idle', requestId: 0 };
const IN_FLIGHT = new Set<ImportState['phase']>(['pending', 'checking', 'verifying']);
export const isBusy = (s: ImportState): boolean => IN_FLIGHT.has(s.phase);

/**
 * `submit` is ignored while busy or once added/present (no repeated submits). A completion whose requestId is not the
 * current one is discarded (stale after abandon/reset). `added` is reachable ONLY from `verifying` (via `import` or
 * `recheck`) through a `verified` event whose result is ok; a `persisted` outcome only moves to `verifying` (or
 * `unconfirmed` when the receipt is not the canonical shape). `existing` can only end as `present`, never `added`.
 */
export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'submit':
      if (isBusy(state) || state.phase === 'added' || state.phase === 'present') return state;
      return { phase: 'pending', requestId: state.requestId + 1 };
    case 'settled': {
      if (state.phase !== 'pending' || event.requestId !== state.requestId) return state;
      return fromOutcome(state.requestId, event.outcome, 'import');
    }
    case 'check':
      if (isBusy(state) || state.phase === 'added' || state.phase === 'present' || state.phase === 'idle') return state;
      return { phase: 'checking', requestId: state.requestId + 1 };
    case 'checked': {
      if (state.phase !== 'checking' || event.requestId !== state.requestId) return state;
      const r = event.result;
      if (r.kind === 'not-observed') return { phase: 'unconfirmed', requestId: state.requestId, reason: 'not-observed', receipt: null };
      if (r.kind === 'present') return { phase: 'present', requestId: state.requestId, receipt: null };
      // A status check returns THIS attempt's receipt as `persisted`; an `existing` receipt is someone else's.
      return fromOutcome(state.requestId, r, 'recheck');
    }
    case 'verified':
      if (state.phase !== 'verifying' || event.requestId !== state.requestId) return state;
      // Only this attempt's own receipt is kept for a read-only Re-check; someone else's (`existing`) is never promoted to `added`.
      if (!event.result.ok) return { phase: 'unconfirmed', requestId: state.requestId, reason: event.result.reason, receipt: state.via === 'existing' ? null : state.receipt };
      return state.via === 'existing'
        ? { phase: 'present', requestId: state.requestId, receipt: state.receipt }
        : { phase: 'added', requestId: state.requestId, receipt: state.receipt };
    case 'recheck':
      if (state.phase !== 'unconfirmed' || state.receipt === null) return state;
      return { phase: 'verifying', requestId: state.requestId + 1, receipt: state.receipt, via: 'recheck' };
    case 'observed-present':
      if ((state.phase !== 'pending' && state.phase !== 'checking') || event.requestId !== state.requestId) return state;
      return { phase: 'present', requestId: state.requestId, receipt: null };
    case 'abandon':
      if (!isBusy(state)) return state;
      return { phase: 'unconfirmed', requestId: state.requestId + 1, reason: 'unresolved', receipt: state.phase === 'verifying' && state.via !== 'existing' ? state.receipt : null };
    case 'reset':
      return { phase: 'idle', requestId: state.requestId + 1 };
  }
}

function fromOutcome(requestId: number, outcome: ImportOutcome, via: VerifyVia): ImportState {
  if (outcome.kind === 'persisted' || outcome.kind === 'existing') {
    const receipt = outcome.receipt === undefined ? null : parseImportReceipt(outcome.receipt);
    if (receipt) return { phase: 'verifying', requestId, receipt, via: outcome.kind === 'existing' ? 'existing' : via };
    // A bare ALREADY_IMPORTED conflict must not trigger animation; it can only be re-checked.
    return { phase: 'unconfirmed', requestId, reason: outcome.kind === 'existing' && outcome.receipt === undefined ? 'existing' : 'receipt-invalid', receipt: null };
  }
  return { phase: 'error', requestId, reason: outcome.kind };
}

/**
 * Honest copy for every uncertain result (Buddy ruling, Tome 6207559470; contract docs/ideaverse-api-v026.md). Exactly this
 * sentence, never "Nothing was saved", for any result where a write may have reached the database.
 */
export const UNCERTAIN_COPY = 'Could not confirm whether this was saved. Re-check the cube before retrying.';
/** A proven refusal may say so. */
export const REFUSED_COPY = 'The server refused this request.';

/** Plain-language detail for an unconfirmed reason. None claims that anything was or was not saved. */
export const UNCONFIRMED_COPY: Record<UnconfirmedReason, string> = {
  'receipt-invalid': 'The server reply was not in the expected form.',
  'readback-unavailable': 'The cube could not be re-read just now.',
  'readback-empty': 'The cube has no workspace to confirm this against yet.',
  'not-found': 'The cube does not list this idea yet.',
  'not-imported': 'The cube lists this idea but not as added.',
  duplicate: 'The cube shows this idea more than once.',
  integrity: 'The cube flagged this idea for a consistency problem.',
  mismatch: 'The cube record does not match the receipt.',
  unresolved: 'An earlier attempt for this idea was interrupted and has not been resolved.',
  'not-observed': 'The status check saw no matching receipt. That does not rule out a request that is still completing.',
  existing: 'The server reports this idea is already in the cube, but sent nothing to confirm it with.',
};

/** Shown when the card could not start an attempt at all (the fresh overview read needed to pin the revision failed: no request was sent). */
export const NOT_STARTED_COPY = 'Could not read the cube to start this add, so no request was sent.';

/** What failed, per failure kind. Uncertain kinds lead with UNCERTAIN_COPY in the card; proven ones do not. */
export const IMPORT_FAILURE_COPY: Record<ImportFailure, string> = {
  denied: `Adding ideas needs owner access. ${REFUSED_COPY}`,
  rejected: REFUSED_COPY,
  stale: 'The cube changed after this card read it. Refresh to start a new attempt with a new request key.',
  'key-reused': 'This request key was already used for a different request. Refresh to start a new attempt with a new request key.',
  unavailable: UNCERTAIN_COPY,
  unconfirmed: UNCERTAIN_COPY,
  ambiguous: UNCERTAIN_COPY,
  failed: UNCERTAIN_COPY,
  'not-started': NOT_STARTED_COPY,
};

/** Appended to an uncertain state: what the actions do. */
export const UNCONFIRMED_ACTION_COPY = {
  recheck: 'Re-check reads the cube again and adds nothing.',
  retry: 'Retry reuses the same request key and revision, so it cannot add a second copy.',
} as const;

/** Shown when no import function is bound (the shell binds none today). */
export const IMPORT_UNBOUND_COPY = 'Adding to the cube is not connected yet.';

/**
 * One read-only status check for an attempt that has no receipt yet. With an injected `checkImport` (contract
 * `import-status`) the SERVER reconciles the key; without one the fallback is a fresh overview read, which can only
 * say `present` (the idea is listed as imported, cleanly) or `not-observed`. It never calls an import function.
 */
export async function checkAttempt(
  idea: IdeaSummary, attempt: ImportAttempt | null, checkImport: CheckImport | undefined, readOverview: ReadOverview | undefined,
): Promise<CheckResult> {
  try {
    if (checkImport && attempt) return await checkImport(attempt);
    if (!readOverview) return { kind: 'unavailable' };
    const o = await readOverview();
    if (o.status !== 'AVAILABLE') return { kind: o.status === 'EMPTY' ? 'not-observed' : 'unavailable' };
    if (o.integrity.some(i => i.id === idea.id)) return { kind: 'unavailable' };
    const listed = o.ideas.filter(i => i.id === idea.id);
    if (listed.length !== 1) return { kind: listed.length === 0 ? 'not-observed' : 'unavailable' };
    const m = listed[0]!;
    if (!m.imported) return { kind: 'not-observed' };
    if (typeof m.membershipId !== 'string' || typeof m.importedAt !== 'string') return { kind: 'unavailable' };
    if (idea.sha256 !== undefined && idea.sha256 !== m.sha256) return { kind: 'unavailable' };
    return { kind: 'present' };
  } catch { return { kind: 'failed' }; }
}

/** Which buttons a card state offers. The card renders exactly these; nothing else can start a write or a read. */
export interface CardActions { add: 'add' | 'retry' | null; recheck: boolean; newAttempt: boolean }
export function cardActions(state: ImportState): CardActions {
  switch (state.phase) {
    case 'idle': return { add: 'add', recheck: false, newAttempt: false };
    case 'pending': case 'checking': case 'verifying': case 'added': case 'present': return { add: null, recheck: false, newAttempt: false };
    case 'unconfirmed': return { add: 'retry', recheck: true, newAttempt: false };
    case 'error':
      if (NEW_ATTEMPT_FAILURES.has(state.reason)) return { add: null, recheck: false, newAttempt: true };
      if (UNCERTAIN_FAILURES.has(state.reason)) return { add: 'retry', recheck: true, newAttempt: false };
      if (state.reason === 'not-started') return { add: 'retry', recheck: false, newAttempt: false };
      return { add: null, recheck: false, newAttempt: false };
  }
}

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
