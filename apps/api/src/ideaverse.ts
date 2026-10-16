import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, sep } from 'node:path';
import {
  GraphClient, ideaverseOverview, importIdea, importStatus, loadIdeaManifest, WORKSPACE_ID,
  type IdeaverseIdea, type IdeaverseOverview, type ImportReceipt, type ImportResult,
} from '@cubes/graph';

/**
 * HTTP adapter for the v030 IdeaVerse contract. It does not authorize a reader proxy,
 * does not retry a write, and does not treat a raw graph receipt as confirmed success.
 * A null workspace revision fails closed. AMBIGUOUS_IDENTITY stays a rejection.
 */
const IDEA_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KEY = /^[A-Za-z0-9_-]{8,64}$/;
const FILES_DIR = 'graph/seed/ideaverse/files';
const MAX_BODY = 16_384;

export interface StudioPrincipal { id: 'kanny' | 'serena' | 'roy' | 'ava' | 'guz'; kind: 'owner' | 'reader' | 'agent' }

type Unavailable = { status: 'UNAVAILABLE'; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' | 'MANIFEST_INVALID' | 'SOURCE_MISMATCH' };
type ImportBody = ImportResult | { status: 'NOT_FOUND' } | { status: 'UNCONFIRMED'; reason: 'RECEIPT_INVALID' | 'READBACK_UNAVAILABLE' | 'READBACK_MISMATCH' | 'INTEGRITY' | 'OUTCOME_UNKNOWN' };
type DetailBody =
  | { status: 'AVAILABLE'; idea: IdeaverseIdea & { text: string } }
  | { status: 'NOT_FOUND' }
  | Unavailable;

export interface IdeaverseGateway {
  overview(): Promise<IdeaverseOverview>;
  detail(ideaId: string): Promise<DetailBody>;
  importIdea(ideaId: string, idempotencyKey: string, expectedRevision: number): Promise<ImportBody>;
  importStatus(ideaId: string, idempotencyKey: string, expectedRevision: number): Promise<ImportBody>;
}

export function createGraphIdeaverse(client: GraphClient, repoRoot: string, tenantId: string): IdeaverseGateway {
  return {
    overview: () => ideaverseOverview(client, repoRoot, tenantId),
    detail: ideaId => readDetail(client, repoRoot, tenantId, ideaId),
    importIdea: (ideaId, idempotencyKey, expectedRevision) => writeThenConfirm(client, repoRoot, tenantId, ideaId, idempotencyKey, expectedRevision),
    importStatus: (ideaId, idempotencyKey, expectedRevision) => confirmLookup(client, repoRoot, tenantId, ideaId, idempotencyKey, expectedRevision),
  };
}

export async function dispatchStudio(
  request: IncomingMessage,
  response: ServerResponse,
  principalOf: () => StudioPrincipal | null,
  ideaverse: IdeaverseGateway | undefined,
  requestId: string,
): Promise<void> {
  const target = matchStudio(request.url ?? '', request.method ?? '');
  if (target === null) {
    sendError(response, 404, 'NOT_FOUND', 'Route not implemented.', requestId);
    return;
  }
  const principal = principalOf();
  if (principal === null) {
    sendError(response, 401, 'UNAUTHENTICATED', 'IdeaVerse was not read. No server session was presented.', requestId);
    return;
  }
  const writing = target.kind === 'import' || target.kind === 'status';
  const owner = principal.id === 'kanny' && principal.kind === 'owner';
  const reader = principal.id === 'serena' && principal.kind === 'reader';
  if (principal.kind === 'agent' || (writing && !owner) || (!writing && !owner && !reader)) {
    const message = writing
      ? 'IdeaVerse was not changed. This session cannot import.'
      : 'IdeaVerse was not read. This session cannot read it.';
    sendError(response, 403, 'FORBIDDEN', message, requestId);
    return;
  }
  if (ideaverse === undefined) {
    send(response, 503, { status: 'UNAVAILABLE', reason: 'QUERY_FAILED' });
    return;
  }
  try {
    if (target.kind === 'list') {
      sendOverview(response, await ideaverse.overview());
      return;
    }
    if (!IDEA_ID.test(target.ideaId)) {
      sendError(response, 400, 'VALIDATION_ERROR', 'IdeaVerse was not read. The idea id is not valid.', requestId);
      return;
    }
    if (target.kind === 'detail') {
      sendDetail(response, await ideaverse.detail(target.ideaId));
      return;
    }
    const parsed = parseImport(await readBody(request));
    if (parsed === null) {
      sendError(response, 400, 'VALIDATION_ERROR', 'IdeaVerse was not changed. The request did not match the import contract.', requestId);
      return;
    }
    const result = target.kind === 'import'
      ? await ideaverse.importIdea(target.ideaId, parsed.idempotencyKey, parsed.expectedRevision)
      : await ideaverse.importStatus(target.ideaId, parsed.idempotencyKey, parsed.expectedRevision);
    send(response, httpForImport(result), result);
  } catch {
    send(response, 503, { status: 'UNCONFIRMED', reason: 'OUTCOME_UNKNOWN' });
  }
}

function matchStudio(url: string, method: string): { kind: 'list' } | { kind: 'detail' | 'import' | 'status'; ideaId: string } | null {
  if (url.includes('?') || url.includes('#')) return null;
  if (url === '/api/studio/ideas') return method === 'GET' ? { kind: 'list' } : null;
  const detail = /^\/api\/studio\/ideas\/([^/]+)$/.exec(url);
  if (detail?.[1] !== undefined) return method === 'GET' ? { kind: 'detail', ideaId: decode(detail[1]) } : null;
  const action = /^\/api\/studio\/ideas\/([^/]+)\/(import|import-status)$/.exec(url);
  if (action?.[1] !== undefined && action[2] !== undefined && method === 'POST') {
    return { kind: action[2] === 'import' ? 'import' : 'status', ideaId: decode(action[1]) };
  }
  return null;
}

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

async function writeThenConfirm(client: GraphClient, repoRoot: string, tenantId: string, ideaId: string, idempotencyKey: string, expectedRevision: number): Promise<ImportBody> {
  const written = await importIdea(client, repoRoot, { tenantId, ideaId, idempotencyKey, expectedRevision });
  if (written.status !== 'IMPORTED') return written;
  return confirmReceipt(client, repoRoot, tenantId, ideaId, expectedRevision, written.receipt, written.replayed);
}

async function confirmLookup(client: GraphClient, repoRoot: string, tenantId: string, ideaId: string, idempotencyKey: string, expectedRevision: number): Promise<ImportBody> {
  const found = await importStatus(client, tenantId, idempotencyKey);
  if (found.status !== 'IMPORTED') return found;
  return confirmReceipt(client, repoRoot, tenantId, ideaId, expectedRevision, found.receipt, true);
}

async function confirmReceipt(
  client: GraphClient, repoRoot: string, tenantId: string, ideaId: string, expectedRevision: number,
  receipt: ImportReceipt, replayed: boolean,
): Promise<ImportBody> {
  if (!receiptAgrees(receipt, ideaId, expectedRevision)) return { status: 'CONFLICT', reason: 'KEY_REUSED' };
  let manifest;
  try { manifest = await loadIdeaManifest(repoRoot); }
  catch { return { status: 'UNAVAILABLE', reason: 'MANIFEST_INVALID' }; }
  const entry = manifest.ideas.find(idea => idea.id === ideaId);
  if (entry === undefined || entry.sha256 !== receipt.sha256) return { status: 'UNCONFIRMED', reason: 'RECEIPT_INVALID' };
  let overview: IdeaverseOverview;
  try { overview = await ideaverseOverview(client, repoRoot, tenantId); }
  catch { return { status: 'UNCONFIRMED', reason: 'READBACK_UNAVAILABLE' }; }
  if (overview.status === 'UNAVAILABLE') return { status: 'UNCONFIRMED', reason: 'READBACK_UNAVAILABLE' };
  if (overview.status !== 'AVAILABLE') return { status: 'UNCONFIRMED', reason: 'READBACK_MISMATCH' };
  if (overview.workspace.id !== receipt.workspaceId || overview.workspace.id !== WORKSPACE_ID) return { status: 'UNCONFIRMED', reason: 'READBACK_MISMATCH' };
  if (overview.workspace.revision === null || overview.workspace.revision < receipt.workspaceRevision) return { status: 'UNCONFIRMED', reason: 'READBACK_MISMATCH' };
  if (overview.integrity.some(item => item.id === ideaId)) return { status: 'UNCONFIRMED', reason: 'INTEGRITY' };
  const rows = overview.ideas.filter(idea => idea.id === ideaId);
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row === undefined || !row.imported || row.sha256 !== receipt.sha256 || row.membershipId !== receipt.membershipId || row.importedAt !== receipt.importedAt) {
    return { status: 'UNCONFIRMED', reason: 'READBACK_MISMATCH' };
  }
  return { status: 'IMPORTED', replayed, receipt };
}

function receiptAgrees(receipt: ImportReceipt, ideaId: string, expectedRevision: number): boolean {
  return receipt.ideaId === ideaId
    && receipt.workspaceId === WORKSPACE_ID
    && Number.isSafeInteger(receipt.workspaceRevision)
    && receipt.workspaceRevision === expectedRevision + 1
    && typeof receipt.sha256 === 'string'
    && typeof receipt.membershipId === 'string'
    && typeof receipt.importedAt === 'string';
}

async function readDetail(client: GraphClient, repoRoot: string, tenantId: string, ideaId: string): Promise<DetailBody> {
  let manifest;
  try { manifest = await loadIdeaManifest(repoRoot); }
  catch { return { status: 'UNAVAILABLE', reason: 'MANIFEST_INVALID' }; }
  const entry = manifest.ideas.find(idea => idea.id === ideaId);
  if (entry === undefined) return { status: 'NOT_FOUND' };
  const text = await verifiedText(repoRoot, entry.path, entry.byteCount, entry.sha256);
  if (text === null) return { status: 'UNAVAILABLE', reason: 'SOURCE_MISMATCH' };
  const overview = await ideaverseOverview(client, repoRoot, tenantId);
  if (overview.status === 'UNAVAILABLE') return overview;
  if (overview.status !== 'AVAILABLE') return { status: 'NOT_FOUND' };
  if (overview.workspace.revision === null || overview.integrity.some(item => item.id === ideaId)) {
    return { status: 'UNAVAILABLE', reason: 'SOURCE_MISMATCH' };
  }
  const rows = overview.ideas.filter(idea => idea.id === ideaId);
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row === undefined || row.sha256 !== entry.sha256) return { status: 'NOT_FOUND' };
  return { status: 'AVAILABLE', idea: { ...row, text } };
}

async function verifiedText(repoRoot: string, path: string, byteCount: number, sha256: string): Promise<string | null> {
  const base = resolve(repoRoot, FILES_DIR);
  const absolute = resolve(repoRoot, path);
  if (!absolute.startsWith(base + sep)) return null;
  let bytes: Buffer;
  try { bytes = await readFile(absolute); } catch { return null; }
  if (bytes.length !== byteCount || createHash('sha256').update(bytes).digest('hex') !== sha256) return null;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 30) return null;
  return text;
}

function parseImport(value: unknown): { idempotencyKey: string; expectedRevision: number } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !('idempotencyKey' in record) || !('expectedRevision' in record)) return null;
  const key = record['idempotencyKey'];
  const revision = record['expectedRevision'];
  if (typeof key !== 'string' || !KEY.test(key)) return null;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return null;
  return { idempotencyKey: key, expectedRevision: revision };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY) return null;
    chunks.push(buffer);
  }
  if (chunks.length === 0) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

function sendOverview(response: ServerResponse, body: IdeaverseOverview): void {
  send(response, body.status === 'UNAVAILABLE' ? 503 : 200, body);
}

function sendDetail(response: ServerResponse, body: DetailBody): void {
  const status = body.status === 'AVAILABLE' ? 200 : body.status === 'NOT_FOUND' ? 404 : 503;
  send(response, status, body);
}

function httpForImport(body: ImportBody): number {
  if (body.status === 'IMPORTED' || body.status === 'NOT_FOUND') return 200;
  if (body.status === 'CONFLICT') return 409;
  if (body.status === 'REJECTED') return 422;
  return 503;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, status: number, code: string, message: string, requestId: string): void {
  send(response, status, { error: { code, message, requestId } });
}
