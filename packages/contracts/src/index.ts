/** Shared transport types; the server still validates all inputs at runtime. */
export const CONTRACT_VERSION = '1' as const;
export type AgentId = 'roy' | 'ava' | 'guz';
export type ClearanceStatus = 'ESTABLISHED' | 'GAP' | 'UNKNOWN';
export type EvidenceStatus = 'VERIFIED' | 'MISSING' | 'STALE' | 'UNKNOWN';

export interface SourceRef {
  id: string;
  path: string;
  sha256: string;
  /** Exact source excerpt, never model-generated proof. */
  excerpt: string;
  startOffset: number;
  endOffset: number;
}
export interface GraphNode { id: string; label: string; kind: string; sourceRefIds: string[]; }
export interface GraphEdge { id: string; from: string; to: string; type: string; sourceRefIds: string[]; }
export interface EvidenceItem { id: string; status: EvidenceStatus; statement: string; sourceRefIds: string[]; }
export interface ProposedAction {
  id: string;
  kind: 'REQUEST_CLEARANCE' | 'RECORD_LICENSE_EVIDENCE' | 'SAVE_HANDOFF';
  label: string;
  requiresHumanApproval: true;
  sourceRefIds: string[];
}
export interface GraphStatusResponse {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  ready: boolean;
  graphName: string;
  requestId: string;
  checkedAt: string;
  reason: 'NOT_IMPLEMENTED' | 'CONNECTION_FAILED' | 'QUERY_FAILED' | null;
}
export interface AvailableAnalysis {
  status: 'AVAILABLE';
  requestId: string;
  releaseId: string;
  cutId: string;
  /** Exact revision analyzed; reused on approval to prevent stale writes. */
  revision: string;
  clearance: ClearanceStatus;
  summary: string;
  evidence: EvidenceItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: SourceRef[];
  proposedActions: ProposedAction[];
}
export interface UnavailableAnalysis {
  status: 'UNAVAILABLE';
  requestId: string;
  reason: 'NOT_IMPLEMENTED' | 'CONNECTION_FAILED' | 'QUERY_FAILED';
  message: string;
  /** No cached successful evidence may be displayed as a current answer. */
  evidence: [];
  nodes: [];
  edges: [];
  sources: [];
  proposedActions: [];
}
export type AnalysisResponse = AvailableAnalysis | UnavailableAnalysis;
export interface ApprovalRequest {
  releaseId: string;
  cutId: string;
  expectedRevision: string;
  actionId: string;
  idempotencyKey: string;
  evidenceSourceIds: string[];
  // No actor, role, tenant or approved=true field. Identity is server-authenticated.
}
export interface ApprovalResponse {
  status: 'RECORDED';
  requestId: string;
  auditEventId: string;
  revision: string;
  replayed: boolean;
}
export interface Handoff {
  id: string;
  fromAgentId: AgentId;
  toAgentId: AgentId;
  objective: string;
  approvedNextStep: string;
  sourceRefIds: string[];
  revision: string;
  createdAt: string;
}
export interface HandoffRequest {
  toAgentId: AgentId;
  objective: string;
  proposedNextStep: string;
  sourceRefIds: string[];
  expectedRevision: string;
  idempotencyKey: string;
  // The server derives fromAgentId and checks authorization; never trust caller identity.
}
export interface ApiError {
  error: {
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'STALE_REVISION' | 'IDEMPOTENCY_CONFLICT' | 'GRAPH_UNAVAILABLE' | 'NOT_IMPLEMENTED';
    message: string;
    requestId: string;
  };
}
/** Scene boundary: only current API-returned evidence; decoration kept separate. */
export interface SceneData { status: AnalysisResponse['status']; nodes: GraphNode[]; edges: GraphEdge[]; selectedNodeId: string | null; }
