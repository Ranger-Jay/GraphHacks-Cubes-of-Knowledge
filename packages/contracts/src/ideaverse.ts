/** v030.00 transport for the v026 IdeaVerse adapter. Planned routes, not implementation.
 * Runtime validation, authorization and fresh graph reconciliation are mandatory.
 * See docs/ideaverse-api-v026.md. No licensing witness is implied by an import.
 */
export interface IdeaImportReceipt {
  ideaId: string;
  sha256: string;
  workspaceId: string;
  importedAt: string;
  workspaceRevision: number;
  membershipId: string;
}
export interface IdeaImportRequest { idempotencyKey: string; expectedRevision: number; }
export interface IdeaverseIdeaView {
  id: string; filename: string; sha256: string; byteCount: number;
  submittedAt: string; touchedAt: string; synthetic: true;
  classification: 'proposal'; imported: boolean;
  importedAt?: string; membershipId?: string;
}
export type IdeaverseUnavailableReason = 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'MANIFEST_INVALID';
export type IdeaverseOverviewResponse =
  | { status: 'AVAILABLE'; tenantId: string; domain: 'studio'; workspace: { id: string; revision: number | null }; ideas: IdeaverseIdeaView[]; counts: { ideas: number; imported: number }; integrity: { id: string; reason: string }[] }
  | { status: 'EMPTY'; tenantId: string; domain: 'studio' }
  | { status: 'UNAVAILABLE'; reason: IdeaverseUnavailableReason };
export type IdeaImportConflict = {
  status: 'CONFLICT'; reason: 'KEY_REUSED' | 'STALE_REVISION' | 'ALREADY_IMPORTED';
  currentRevision?: number; receipt?: IdeaImportReceipt;
};
export type IdeaImportRejection = {
  status: 'REJECTED'; reason: 'INVALID_REQUEST' | 'UNKNOWN_IDEA' | 'SOURCE_MISMATCH' | 'NOT_SEEDED' | 'AMBIGUOUS_IDENTITY';
};
/** Reserved for a candidate reconciled on the SERVER against a new graph overview.
 * Consumers still read back before a success effect. A structural type cannot prove this invariant.
 */
export type IdeaImportConfirmed = { status: 'IMPORTED'; replayed: boolean; receipt: IdeaImportReceipt };
export type IdeaImportUnconfirmed = {
  status: 'UNCONFIRMED'; reason: 'RECEIPT_INVALID' | 'READBACK_UNAVAILABLE' | 'READBACK_MISMATCH' | 'INTEGRITY' | 'OUTCOME_UNKNOWN';
};
export type IdeaImportResponse = IdeaImportConfirmed | IdeaImportConflict | IdeaImportRejection
  | { status: 'UNAVAILABLE'; reason: IdeaverseUnavailableReason } | IdeaImportUnconfirmed;
/** Read only; NOT_FOUND is an observation, never proof that an in-flight write cannot commit. */
export type IdeaImportStatusResponse = IdeaImportResponse | { status: 'NOT_FOUND' };
export type IdeaverseIdeaDetailResponse =
  | { status: 'AVAILABLE'; idea: IdeaverseIdeaView & { text: string } }
  | { status: 'NOT_FOUND' }
  | { status: 'UNAVAILABLE'; reason: IdeaverseUnavailableReason | 'SOURCE_MISMATCH' };
