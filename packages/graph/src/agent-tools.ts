import { randomUUID } from 'node:crypto';
import type { AgentId, SourceRef } from '@cubes/contracts';
import { GraphUnavailableError, type GraphClient } from './client.js';
import { QUERIES } from './queries.js';
import { analyzeRelease, graphHealth, type AnalyzeOptions } from './analysis.js';
import { SourceFiles } from './verify.js';

/**
 * Bounded agent tools (v009). Each tool is a named, parameterized READ over the graph lane's own
 * operations: no tool accepts Cypher, writes, or reaches outside the caller's tenant. Identity
 * (tenantId, agentId) comes from the server-side context, never from tool arguments. Results carry
 * source references, and graph failures stay UNAVAILABLE. Executing these deterministically is not
 * evidence of LLM agent behavior; a model run must be recorded separately.
 */
export type ToolName = 'graph_status' | 'release_clearance' | 'source_excerpt';
export interface ToolContext { tenantId: string; agentId: AgentId; sourceRoot?: string; evidenceKey?: Buffer | null }
export type ToolStatus = 'OK' | 'UNAVAILABLE' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_ARGUMENTS';
export interface ToolResult {
  callId: string;
  tool: ToolName;
  agentId: AgentId;
  status: ToolStatus;
  /** Plain statement for the model; every claim in it is backed by sourceRefIds/sources. */
  summary: string;
  data: Record<string, unknown> | null;
  sourceRefIds: string[];
  sources: SourceRef[];
  startedAt: string;
  durationMs: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const AGENTS = new Set<AgentId>(['roy', 'ava', 'guz']);

interface ToolSpec {
  description: string;
  parameters: { type: 'object'; properties: Record<string, { type: 'string'; description: string; pattern?: string }>; required: string[]; additionalProperties: false };
}

/** JSON-schema tool definitions (provider-neutral), for a model to call once one is configured. */
export const TOOL_DEFINITIONS: Record<ToolName, ToolSpec> = {
  graph_status: {
    description: 'Report whether the studio graph is reachable and seeded. No arguments.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false }
  },
  release_clearance: {
    description: 'Current-cut music clearance for a release: ESTABLISHED, GAP or UNKNOWN, with per-track evidence and the exact source excerpts behind it. Proposed actions always need human approval.',
    parameters: { type: 'object', properties: { releaseId: { type: 'string', description: 'Release id, e.g. rel-wad', pattern: ID.source } }, required: ['releaseId'], additionalProperties: false }
  },
  source_excerpt: {
    description: 'Return one verified source excerpt (file path, SHA-256, code-point offsets, exact text) by reference id.',
    parameters: { type: 'object', properties: { refId: { type: 'string', description: 'Source reference id', pattern: ID.source } }, required: ['refId'], additionalProperties: false }
  }
};

function validate(tool: ToolName, args: unknown): Record<string, string> | null {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
  const spec = TOOL_DEFINITIONS[tool].parameters;
  const a = args as Record<string, unknown>;
  if (Object.keys(a).some(k => !(k in spec.properties))) return null;
  const out: Record<string, string> = {};
  for (const k of spec.required) {
    const v = a[k];
    if (typeof v !== 'string' || !ID.test(v)) return null;
    out[k] = v;
  }
  return out;
}

/** Execute one tool call. Never throws; every failure is a typed status. */
export async function runTool(client: GraphClient, ctx: ToolContext, tool: string, args: unknown): Promise<ToolResult> {
  const started = Date.now();
  const callId = randomUUID();
  const name = (Object.hasOwn(TOOL_DEFINITIONS, tool) ? tool : 'graph_status') as ToolName;
  const done = (status: ToolStatus, summary: string, data: Record<string, unknown> | null = null, sources: SourceRef[] = []): ToolResult => ({
    callId, tool: name, agentId: ctx.agentId, status, summary, data,
    sourceRefIds: sources.map(s => s.id), sources, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started
  });
  if (!Object.hasOwn(TOOL_DEFINITIONS, tool)) return done('INVALID_ARGUMENTS', `Unknown tool "${String(tool).slice(0, 64)}".`);
  if (!AGENTS.has(ctx.agentId) || !ID.test(ctx.tenantId)) return done('FORBIDDEN', 'Agent identity is not recognized.');
  const params = validate(name, args ?? {});
  if (params === null) return done('INVALID_ARGUMENTS', 'Arguments do not match the tool definition.');
  try {
    const role = (await client.read<{ role: string }>(QUERIES.READ_AGENT_MEMBERSHIP, { agentId: ctx.agentId, tenantId: ctx.tenantId }))[0]?.role;
    if (role !== 'AGENT') return done('FORBIDDEN', 'This agent is not a member of the tenant.');
  } catch (err) {
    return done('UNAVAILABLE', err instanceof GraphUnavailableError ? 'The graph is unavailable; nothing can be asserted.' : 'The graph result could not be interpreted.');
  }

  if (name === 'graph_status') {
    const h = await graphHealth(client);
    return h.ok ? done('OK', `Graph is available with ${h.releases} release(s).`, { releases: h.releases })
      : done('UNAVAILABLE', `Graph is not ready (${h.reason}); nothing can be asserted.`);
  }
  if (name === 'release_clearance') {
    const opts: AnalyzeOptions = { requestId: callId };
    if (ctx.sourceRoot !== undefined) opts.sourceRoot = ctx.sourceRoot;
    if (ctx.evidenceKey !== undefined) opts.evidenceKey = ctx.evidenceKey;
    const a = await analyzeRelease(client, ctx.tenantId, params['releaseId']!, opts);
    if (a === null) return done('NOT_FOUND', `No release "${params['releaseId']}" in this tenant.`);
    if (a.status === 'UNAVAILABLE') return done('UNAVAILABLE', 'The graph is unavailable; clearance cannot be asserted.', { reason: a.reason });
    const lines = a.evidence.map(e => `${e.status}: ${e.statement} [${e.sourceRefIds.join(', ')}]`);
    return done('OK', `${a.summary}\n${lines.join('\n')}`, {
      releaseId: a.releaseId, cutId: a.cutId, revision: a.revision, clearance: a.clearance,
      evidence: a.evidence, proposedActions: a.proposedActions
    }, a.sources);
  }
  // source_excerpt
  try {
    const row = (await client.read<{ id: string; path: string; sha256: string; excerpt: string; startOffset: number; endOffset: number }>(
      QUERIES.READ_SOURCE_REFS, { ids: [params['refId']!], tenantId: ctx.tenantId }))[0];
    if (!row) return done('NOT_FOUND', `No source reference "${params['refId']}" in this tenant.`);
    if (!(await new SourceFiles(ctx.sourceRoot).excerptHolds(row))) {
      return done('NOT_FOUND', `Source reference "${row.id}" does not match its source file; it is not returned.`);
    }
    const s: SourceRef = { id: row.id, path: row.path, sha256: row.sha256, excerpt: row.excerpt, startOffset: row.startOffset, endOffset: row.endOffset };
    return done('OK', `"${s.excerpt}" (${s.path}, code points ${s.startOffset}-${s.endOffset})`, { ref: s }, [s]);
  } catch (err) {
    return done('UNAVAILABLE', err instanceof GraphUnavailableError ? 'The graph is unavailable.' : 'The graph result could not be interpreted.');
  }
}
