import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ApiError, GraphStatusResponse } from '@cubes/contracts';

export interface Principal {
  id: 'kanny' | 'serena' | 'roy' | 'ava' | 'guz';
  kind: 'owner' | 'reader' | 'agent';
}

export interface SessionStore {
  authenticate(token: string): Principal | null;
}

export type GraphRevision =
  | { state: 'unavailable'; reason: 'NOT_IMPLEMENTED' | 'CONNECTION_FAILED' | 'QUERY_FAILED' }
  | { state: 'available'; revision: string };

/** Read-only stand-in. This slice has no audit writer, so a passing read still cannot record. */
export interface ApprovalGraph {
  currentRevision(releaseId: string, cutId: string): Promise<GraphRevision>;
  storedFingerprint(idempotencyKey: string): Promise<string | null>;
}

const denyAllSessions: SessionStore = { authenticate: () => null };
const unavailableGraph: ApprovalGraph = {
  async currentRevision() { return { state: 'unavailable', reason: 'NOT_IMPLEMENTED' }; },
  async storedFingerprint() { return null; },
};

const allowedFields = new Set(['releaseId', 'cutId', 'expectedRevision', 'actionId', 'idempotencyKey', 'evidenceSourceIds']);

interface ApprovalBody {
  releaseId: string;
  cutId: string;
  expectedRevision: string;
  actionId: string;
  idempotencyKey: string;
  evidenceSourceIds: string[];
}

export function createApiServer(options?: { sessions?: SessionStore; graph?: ApprovalGraph }): Server {
  const sessions = options?.sessions ?? denyAllSessions;
  const graph = options?.graph ?? unavailableGraph;
  return createServer((request, response) => {
    void route(request, response, sessions, graph);
  });
}

async function route(request: IncomingMessage, response: ServerResponse, sessions: SessionStore, graph: ApprovalGraph): Promise<void> {
  const requestId = randomUUID();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (request.method === 'GET' && request.url === '/api/health') {
      send(response, 200, { status: 'BOOTSTRAP', ready: false, message: 'Server alive; graph and product routes are not implemented.' });
      return;
    }
    if (request.method === 'GET' && request.url === '/api/graph/status') {
      const body: GraphStatusResponse = {
        status: 'UNAVAILABLE', ready: false, reason: 'NOT_IMPLEMENTED',
        requestId, graphName: process.env['FALKORDB_GRAPH'] ?? 'wad_studio', checkedAt: new Date().toISOString(),
      };
      send(response, 503, body);
      return;
    }
    if (request.method === 'POST' && request.url === '/api/approvals') {
      await postApproval(request, response, requestId, sessions, graph);
      return;
    }
    sendError(response, 404, 'NOT_FOUND', 'Route not implemented.', requestId);
  } catch {
    sendError(response, 503, 'GRAPH_UNAVAILABLE', 'Approval was not recorded. The request failed closed.', requestId);
  }
}

async function postApproval(
  request: IncomingMessage, response: ServerResponse, requestId: string, sessions: SessionStore, graph: ApprovalGraph,
): Promise<void> {
  const principal = principalFrom(request, sessions);
  if (principal === null) {
    sendError(response, 401, 'UNAUTHENTICATED', 'Approval was not recorded. No server session was presented.', requestId);
    return;
  }
  if (principal.id !== 'kanny' || principal.kind !== 'owner') {
    sendError(response, 403, 'FORBIDDEN', 'Approval was not recorded. This session cannot approve.', requestId);
    return;
  }
  const parsed = parseApproval(await readJson(request));
  if (parsed === null) {
    sendError(response, 400, 'VALIDATION_ERROR', 'Approval was not recorded. The request did not match the approval contract.', requestId);
    return;
  }
  const revision = await graph.currentRevision(parsed.releaseId, parsed.cutId);
  if (revision.state === 'unavailable') {
    sendError(response, 503, 'GRAPH_UNAVAILABLE', 'Approval was not recorded. The graph is unavailable.', requestId);
    return;
  }
  if (revision.revision !== parsed.expectedRevision) {
    sendError(response, 409, 'STALE_REVISION', 'Approval was not recorded. The cut revision changed.', requestId);
    return;
  }
  const stored = await graph.storedFingerprint(parsed.idempotencyKey);
  const fingerprint = JSON.stringify({
    releaseId: parsed.releaseId, cutId: parsed.cutId, expectedRevision: parsed.expectedRevision,
    actionId: parsed.actionId, evidenceSourceIds: parsed.evidenceSourceIds,
  });
  if (stored !== null && stored !== fingerprint) {
    sendError(response, 409, 'IDEMPOTENCY_CONFLICT', 'Approval was not recorded. This idempotency key was already used for a different request.', requestId);
    return;
  }
  sendError(response, 503, 'NOT_IMPLEMENTED', 'Approval was not recorded. No durable audit writer is configured.', requestId);
}

function principalFrom(request: IncomingMessage, sessions: SessionStore): Principal | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9._~-]{8,256})$/.exec(header);
  if (match?.[1] === undefined) return null;
  return sessions.authenticate(match[1]);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 16_384) return null;
    chunks.push(buffer);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function parseApproval(value: unknown): ApprovalBody | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !allowedFields.has(key))) return null;
  const releaseId = boundedText(record['releaseId'], 128);
  const cutId = boundedText(record['cutId'], 128);
  const expectedRevision = boundedText(record['expectedRevision'], 256);
  const actionId = boundedText(record['actionId'], 128);
  const idempotencyKey = boundedText(record['idempotencyKey'], 128);
  const evidenceSourceIds = boundedList(record['evidenceSourceIds']);
  if (releaseId === null || cutId === null || expectedRevision === null || actionId === null || idempotencyKey === null || evidenceSourceIds === null) return null;
  return { releaseId, cutId, expectedRevision, actionId, idempotencyKey, evidenceSourceIds };
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) return null;
  return value;
}

function boundedList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return null;
  const items: string[] = [];
  for (const item of value) {
    const text = boundedText(item, 128);
    if (text === null) return null;
    items.push(text);
  }
  return items;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, status: number, code: ApiError['error']['code'], message: string, requestId: string): void {
  send(response, status, { error: { code, message, requestId } } satisfies ApiError);
}
