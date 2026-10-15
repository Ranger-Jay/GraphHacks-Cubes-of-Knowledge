import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AgentId, Handoff } from '@cubes/contracts';

/** Transport handoff with its verified release scope (contract v003.003 makes `releaseId` required on Handoff). */
export type ScopedHandoff = Handoff & { releaseId: string };
import { GraphUnavailableError, type GraphClient } from './client.js';
import { evidenceKeyFromEnv } from './evidence-key.js';
import { TOOL_DEFINITIONS } from './agent-tools.js';
import { SourceFiles } from './verify.js';

/**
 * Durable graph-backed handoff (v010). An agent leaves a scoped, signed note for another agent in the
 * same tenant; it survives reconnects, process restarts and fresh sessions because it lives in FalkorDB.
 *  - Identity: fromAgentId/tenantId come from the server context, never the request.
 *  - Scope: both agents must be MEMBER_OF the tenant as AGENT; only those two agents can read it.
 *  - Guarded: written only if the release revision equals expectedRevision (single atomic query);
 *    the idempotency key is unique per tenant; same key + same request replays, else conflicts.
 *  - Approval: a proposed next step becomes approvedNextStep only when it is a bounded read-only tool
 *    call (`tool:<name>:<id>`); anything else is stored as pending and approvedNextStep is "NONE".
 *  - Integrity: the record is HMAC-signed with the server evidence key; recovery refuses tampered or
 *    unsigned records. Cited sources must be verified excerpts in the tenant.
 */
export interface HandoffContext { tenantId: string; agentId: AgentId; sourceRoot?: string; evidenceKey?: Buffer | null }
export interface SaveHandoffInput {
  releaseId: string;
  toAgentId: AgentId;
  objective: string;
  proposedNextStep: string;
  sourceRefIds: string[];
  expectedRevision: string;
  idempotencyKey: string;
}
export type HandoffOutcome =
  | { status: 'CREATED' | 'REPLAYED'; handoff: ScopedHandoff; pendingNextStep: string | null }
  | { status: 'FOUND'; handoff: ScopedHandoff; pendingNextStep: string | null; currentRevision: string | null; stale: boolean }
  | { status: 'INVALID' | 'FORBIDDEN' | 'NOT_FOUND' | 'STALE_REVISION' | 'IDEMPOTENCY_CONFLICT' | 'INTEGRITY_FAILED' | 'UNAVAILABLE'; message: string };

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const KEY = /^[A-Za-z0-9._~-]{8,128}$/;
const AGENTS = new Set<AgentId>(['roy', 'ava', 'guz']);
const STEP = /^tool:([a-z_]{1,32}):([A-Za-z0-9][A-Za-z0-9._-]{0,63})?$/;

const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v && !/[\u0000-\u001f]/.test(v);

/** A next step is approvable only if it is a bounded, read-only tool call this lane defines. */
export function approvableStep(step: string): boolean {
  const m = STEP.exec(step);
  if (!m) return false;
  const tool = m[1]!;
  if (!Object.hasOwn(TOOL_DEFINITIONS, tool)) return false;
  const needsArg = TOOL_DEFINITIONS[tool as keyof typeof TOOL_DEFINITIONS].parameters.required.length > 0;
  return needsArg ? m[2] !== undefined : m[2] === undefined;
}

interface Signed { id: string; tenantId: string; releaseId: string; fromAgentId: string; toAgentId: string; objective: string;
  approvedNextStep: string; pendingNextStep: string; sourceRefIds: string[]; revision: string; createdAt: string; fingerprint: string }

function canonical(h: Signed): string {
  return JSON.stringify(['cubes-handoff/v1', h.id, h.tenantId, h.releaseId, h.fromAgentId, h.toAgentId, h.objective,
    h.approvedNextStep, h.pendingNextStep, h.sourceRefIds, h.revision, h.createdAt, h.fingerprint]);
}
const sign = (key: Buffer, h: Signed) => createHmac('sha256', key).update(canonical(h)).digest('hex');
function sigHolds(key: Buffer | null, h: Signed, sig: unknown): boolean {
  if (!key || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return timingSafeEqual(Buffer.from(sign(key, h), 'hex'), Buffer.from(sig, 'hex'));
}

function toContract(h: Signed): ScopedHandoff {
  // releaseId comes from the signed, verified record, never from the caller.
  const out: ScopedHandoff = { id: h.id, releaseId: h.releaseId, fromAgentId: h.fromAgentId as AgentId, toAgentId: h.toAgentId as AgentId, objective: h.objective,
    approvedNextStep: h.approvedNextStep, sourceRefIds: h.sourceRefIds, revision: h.revision, createdAt: h.createdAt };
  return out;
}

const MEMBERS = `
MATCH (a:Principal {kind: 'agent'})-[m:MEMBER_OF {role: 'AGENT'}]->(:Tenant {id: $tenantId})
WHERE a.id IN $agents RETURN collect(a.id) AS ids`;

const VERIFY_REFS = `
MATCH (sr:SourceRef {tenantId: $tenantId})-[:EXCERPT_OF]->(s:Source {tenantId: $tenantId})
WHERE sr.id IN $ids
RETURN sr.id AS id, s.path AS path, s.sha256 AS sha256, sr.excerpt AS excerpt, sr.startOffset AS startOffset, sr.endOffset AS endOffset`;

/** Atomic guarded create: revision must match; idempotency key is unique per tenant (MERGE). */
const CREATE_HANDOFF = `
MATCH (r:Release {id: $releaseId, tenantId: $tenantId})
WITH r, r.revision AS current
OPTIONAL MATCH (existing:Handoff {tenantId: $tenantId, idempotencyKey: $idempotencyKey})
WITH r, current, existing
WHERE existing IS NOT NULL OR current = $expectedRevision
MERGE (h:Handoff {tenantId: $tenantId, idempotencyKey: $idempotencyKey})
ON CREATE SET h += $props, h.createdNow = true
ON MATCH SET h.createdNow = false
WITH r, current, h
OPTIONAL MATCH (f:Principal {id: $fromAgentId}), (t:Principal {id: $toAgentId})
FOREACH (_ IN CASE WHEN h.createdNow THEN [1] ELSE [] END |
  MERGE (f)-[:LEFT_HANDOFF]->(h) MERGE (h)-[:FOR_AGENT]->(t) MERGE (h)-[:ABOUT]->(r))
RETURN h AS h, h.createdNow AS created, current AS current`;

const READ_HANDOFF = `
MATCH (h:Handoff {id: $id, tenantId: $tenantId})
OPTIONAL MATCH (r:Release {id: h.releaseId, tenantId: $tenantId})
RETURN h AS h, r.revision AS current`;

const READ_INBOX = `
MATCH (h:Handoff {tenantId: $tenantId, toAgentId: $agentId})
RETURN h.id AS id ORDER BY h.createdAt DESC, h.id LIMIT 20`;

const unavailable = (err: unknown): HandoffOutcome => ({ status: 'UNAVAILABLE', message: err instanceof GraphUnavailableError ? 'The graph is unavailable; nothing was saved or read.' : 'The graph result could not be interpreted.' });

function fromNode(n: unknown): (Signed & { sig: unknown }) | null {
  const p = (n && typeof n === 'object' && 'properties' in n ? (n as { properties: Record<string, unknown> }).properties : n) as Record<string, unknown> | null;
  if (!p) return null;
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  return { id: s('id'), tenantId: s('tenantId'), releaseId: s('releaseId'), fromAgentId: s('fromAgentId'), toAgentId: s('toAgentId'),
    objective: s('objective'), approvedNextStep: s('approvedNextStep'), pendingNextStep: s('pendingNextStep'),
    sourceRefIds: Array.isArray(p['sourceRefIds']) ? (p['sourceRefIds'] as unknown[]).map(String) : [],
    revision: s('revision'), createdAt: s('createdAt'), fingerprint: s('fingerprint'), sig: p['sig'] };
}

export async function saveHandoff(client: GraphClient, ctx: HandoffContext, input: SaveHandoffInput): Promise<HandoffOutcome> {
  const key = ctx.evidenceKey !== undefined ? ctx.evidenceKey : evidenceKeyFromEnv();
  const i = input as Partial<SaveHandoffInput> & Record<string, unknown>;
  const allowed = new Set(['releaseId', 'toAgentId', 'objective', 'proposedNextStep', 'sourceRefIds', 'expectedRevision', 'idempotencyKey']);
  if (Object.keys(i).some(k => !allowed.has(k))) return { status: 'INVALID', message: 'Unexpected field.' };
  if (!AGENTS.has(ctx.agentId) || !ID.test(ctx.tenantId)) return { status: 'FORBIDDEN', message: 'Caller is not a recognized agent.' };
  if (!text(i.releaseId, 64) || !ID.test(i.releaseId!) || !AGENTS.has(i.toAgentId as AgentId) || i.toAgentId === ctx.agentId
    || !text(i.objective, 500) || !text(i.proposedNextStep, 200) || !text(i.expectedRevision, 128)
    || typeof i.idempotencyKey !== 'string' || !KEY.test(i.idempotencyKey)
    || !Array.isArray(i.sourceRefIds) || i.sourceRefIds.length > 32 || !i.sourceRefIds.every(r => typeof r === 'string' && ID.test(r))) {
    return { status: 'INVALID', message: 'Request does not match the handoff contract.' };
  }
  if (!key) return { status: 'INTEGRITY_FAILED', message: 'No evidence key is configured; handoffs cannot be signed.' };
  const req = input;
  const refIds = [...new Set(req.sourceRefIds)].sort();
  try {
    const ids = (await client.read<{ ids: string[] }>(MEMBERS, { tenantId: ctx.tenantId, agents: [ctx.agentId, req.toAgentId] }))[0]?.ids ?? [];
    if (!ids.includes(ctx.agentId) || !ids.includes(req.toAgentId)) return { status: 'FORBIDDEN', message: 'Both agents must be members of this tenant.' };
    if (refIds.length > 0) {
      const rows = await client.read<{ id: string; path: string; sha256: string; excerpt: string; startOffset: number; endOffset: number }>(VERIFY_REFS, { tenantId: ctx.tenantId, ids: refIds });
      const files = new SourceFiles(ctx.sourceRoot);
      for (const id of refIds) {
        const row = rows.find(r => r.id === id);
        if (!row || !(await files.excerptHolds(row))) return { status: 'INVALID', message: `Source reference "${id}" is not a verified excerpt in this tenant.` };
      }
    }
    const approved = approvableStep(req.proposedNextStep);
    const fingerprint = createHash('sha256').update(JSON.stringify([ctx.agentId, req.releaseId, req.toAgentId, req.objective, req.proposedNextStep, refIds, req.expectedRevision])).digest('hex');
    const rec: Signed = { id: `ho-${randomUUID()}`, tenantId: ctx.tenantId, releaseId: req.releaseId, fromAgentId: ctx.agentId, toAgentId: req.toAgentId,
      objective: req.objective, approvedNextStep: approved ? req.proposedNextStep : 'NONE',
      pendingNextStep: approved ? '' : req.proposedNextStep, sourceRefIds: refIds, revision: req.expectedRevision,
      createdAt: new Date().toISOString(), fingerprint };
    const props = { ...rec, idempotencyKey: req.idempotencyKey, sig: sign(key, rec) };
    const row = (await client.write<{ h: unknown; created: boolean | null; current: string | null }>(CREATE_HANDOFF, {
      tenantId: ctx.tenantId, releaseId: req.releaseId, expectedRevision: req.expectedRevision, idempotencyKey: req.idempotencyKey,
      fromAgentId: ctx.agentId, toAgentId: req.toAgentId, props }))[0];
    if (!row) {
      const exists = (await client.read<{ n: number }>('MATCH (r:Release {id: $releaseId, tenantId: $tenantId}) RETURN count(r) AS n', { releaseId: req.releaseId, tenantId: ctx.tenantId }))[0]?.n ?? 0;
      return exists > 0 ? { status: 'STALE_REVISION', message: 'The release revision changed; nothing was saved.' } : { status: 'NOT_FOUND', message: 'No such release in this tenant.' };
    }
    const stored = fromNode(row.h);
    if (!stored || !sigHolds(key, stored, stored.sig)) return { status: 'INTEGRITY_FAILED', message: 'Stored handoff failed its integrity check.' };
    if (row.created) return { status: 'CREATED', handoff: toContract(stored), pendingNextStep: stored.pendingNextStep || null };
    if (stored.fingerprint !== fingerprint) return { status: 'IDEMPOTENCY_CONFLICT', message: 'This idempotency key was used for a different handoff.' };
    return { status: 'REPLAYED', handoff: toContract(stored), pendingNextStep: stored.pendingNextStep || null };
  } catch (err) {
    return unavailable(err);
  }
}

/** Recover one handoff. Only its sender or recipient (same tenant) may read it; tampered records are refused. */
export async function getHandoff(client: GraphClient, ctx: HandoffContext, handoffId: string): Promise<HandoffOutcome> {
  const key = ctx.evidenceKey !== undefined ? ctx.evidenceKey : evidenceKeyFromEnv();
  if (!AGENTS.has(ctx.agentId) || !ID.test(ctx.tenantId)) return { status: 'FORBIDDEN', message: 'Caller is not a recognized agent.' };
  if (typeof handoffId !== 'string' || !/^ho-[0-9a-f-]{36}$/.test(handoffId)) return { status: 'INVALID', message: 'Malformed handoff id.' };
  try {
    const row = (await client.read<{ h: unknown; current: string | null }>(READ_HANDOFF, { id: handoffId, tenantId: ctx.tenantId }))[0];
    const h = row ? fromNode(row.h) : null;
    if (!h || (h.fromAgentId !== ctx.agentId && h.toAgentId !== ctx.agentId)) return { status: 'NOT_FOUND', message: 'No handoff visible to this agent.' };
    if (!sigHolds(key, h, h.sig)) return { status: 'INTEGRITY_FAILED', message: 'Handoff record failed its integrity check; it is not returned.' };
    const current = row!.current ?? null;
    return { status: 'FOUND', handoff: toContract(h), pendingNextStep: h.pendingNextStep || null, currentRevision: current, stale: current !== h.revision };
  } catch (err) {
    return unavailable(err);
  }
}

/** Fresh-session recovery: the newest handoffs addressed to this agent (ids only; read each with getHandoff). */
export async function handoffInbox(client: GraphClient, ctx: HandoffContext): Promise<{ status: 'OK'; ids: string[] } | { status: 'FORBIDDEN' | 'UNAVAILABLE'; message: string }> {
  if (!AGENTS.has(ctx.agentId) || !ID.test(ctx.tenantId)) return { status: 'FORBIDDEN', message: 'Caller is not a recognized agent.' };
  try {
    return { status: 'OK', ids: (await client.read<{ id: string }>(READ_INBOX, { tenantId: ctx.tenantId, agentId: ctx.agentId })).map(r => r.id) };
  } catch (err) {
    const u = unavailable(err);
    return { status: 'UNAVAILABLE', message: 'message' in u ? u.message : 'unavailable' };
  }
}
