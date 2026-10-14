import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphClient } from './client.js';

/**
 * Evidence state witness (D-020). An append-only, HMAC-chained ledger kept OUTSIDE FalkorDB records the
 * last committed evidence state of each (graph, tenant): a SHA-256 over a canonical dump of every
 * evidence-bearing node and edge, plus each release's revision. Analysis trusts the graph only when it
 * matches the head of the chain, so a graph-only snapshot restore, a replayed binding (at any revision)
 * or a revoked binding copied back all fail closed.
 *
 * Writers (seed / evidence bundles) are serialized by a lock file and use a two-phase order:
 * PENDING (expected pre-state) → graph write → COMMIT (new state). A crash between them leaves a PENDING
 * head; reads fail closed until recovery. A missing chain is never rebuilt from the graph: creating one is
 * an explicit init. Limit: rolling back the whole host, witness directory included, needs an external anchor.
 */
export interface LedgerConfig { dir: string; key: Buffer }
export type RecordType = 'INIT' | 'PENDING' | 'COMMIT' | 'ABORT';
export interface LedgerRecord {
  v: 1; graph: string; tenantId: string; seq: number; type: RecordType;
  /** INIT/COMMIT/ABORT: the committed state. PENDING: the state the write starts from. */
  stateHash: string; revisions: Record<string, string>;
  /** PENDING only: what the write is (resume must match). */
  intent: string; at: string; prevMac: string; mac: string;
}
export interface EvidenceState { stateHash: string; revisions: Record<string, string> }
export type ChainState =
  | { status: 'MISSING' }
  | { status: 'CORRUPT'; reason: string }
  | { status: 'PENDING'; head: LedgerRecord; committed: LedgerRecord }
  | { status: 'COMMITTED'; head: LedgerRecord };
export class WitnessError extends Error {
  constructor(readonly code: 'NO_WITNESS' | 'LOCKED' | 'CORRUPT' | 'PENDING' | 'MISMATCH' | 'EXISTS' | 'MISSING', message: string) {
    super(message);
    this.name = 'WitnessError';
  }
}

/** GRAPH_WITNESS_DIR (server-only path) + the evidence key. Either absent → null (fail closed). */
export function ledgerFromEnv(evidenceKey: Buffer | null, env: NodeJS.ProcessEnv = process.env): LedgerConfig | null {
  const dir = env['GRAPH_WITNESS_DIR'];
  return evidenceKey && typeof dir === 'string' && dir.length > 0 ? { dir, key: evidenceKey } : null;
}

const EVIDENCE_LABELS = ['Release', 'Cut', 'Track', 'License', 'Source', 'SourceRef'];
const isEvidence = `ANY(l IN labels(%) WHERE l IN ${JSON.stringify(EVIDENCE_LABELS).replace(/"/g, "'")})`;

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Canonical evidence state of one tenant in this graph (handoffs and principals are excluded). */
export async function evidenceState(client: GraphClient, tenantId: string): Promise<EvidenceState> {
  const nodes = await client.read<{ labels: string[]; props: Record<string, unknown> }>(
    `MATCH (n) WHERE n.tenantId = $tenantId AND ${isEvidence.replace('%', 'n')} RETURN labels(n) AS labels, properties(n) AS props`, { tenantId });
  const edges = await client.read<{ type: string; from: string; fromLabels: string[]; to: string; toLabels: string[]; props: Record<string, unknown> }>(
    `MATCH (a)-[e]->(b) WHERE a.tenantId = $tenantId AND b.tenantId = $tenantId AND ${isEvidence.replace('%', 'a')} AND ${isEvidence.replace('%', 'b')}
     RETURN type(e) AS type, a.id AS from, labels(a) AS fromLabels, b.id AS to, labels(b) AS toLabels, properties(e) AS props`, { tenantId });
  const lines = [
    ...nodes.map(n => canonical(['N', [...n.labels].sort(), n.props])),
    ...edges.map(e => canonical(['E', e.type, [...e.fromLabels].sort(), e.from, [...e.toLabels].sort(), e.to, e.props]))
  ].sort();
  const revisions: Record<string, string> = {};
  for (const n of nodes) {
    if (n.labels.includes('Release') && typeof n.props['id'] === 'string') revisions[n.props['id']] = String(n.props['revision'] ?? '');
  }
  return { stateHash: createHash('sha256').update(lines.join('\n')).digest('hex'), revisions };
}

const macKey = (key: Buffer) => createHmac('sha256', key).update('cubes-witness-key/v1').digest();
function macOf(key: Buffer, r: Omit<LedgerRecord, 'mac'>): string {
  return createHmac('sha256', macKey(key)).update(canonical(['cubes-witness/v1', r])).digest('hex');
}
const safeSeg = (s: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(s) || s.includes('..')) throw new WitnessError('CORRUPT', `Unsafe witness path segment: ${JSON.stringify(s)}`);
  return s;
};
const chainPath = (cfg: LedgerConfig, graph: string, tenantId: string) => join(cfg.dir, safeSeg(graph), `${safeSeg(tenantId)}.jsonl`);

/** Reads and verifies the whole chain: MACs, links, sequence, grammar. Any defect → CORRUPT. */
export async function readChain(cfg: LedgerConfig, graph: string, tenantId: string): Promise<ChainState> {
  let raw: string;
  try { raw = await readFile(chainPath(cfg, graph, tenantId), 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'MISSING' };
    return { status: 'CORRUPT', reason: 'witness file unreadable' };
  }
  if (raw.length === 0 || !raw.endsWith('\n')) return { status: 'CORRUPT', reason: 'witness file is empty or ends in a partial record' };
  const recs: LedgerRecord[] = [];
  let prevMac = '';
  let committed: LedgerRecord | null = null;
  for (const [i, line] of raw.slice(0, -1).split('\n').entries()) {
    let r: LedgerRecord;
    try { r = JSON.parse(line) as LedgerRecord; } catch { return { status: 'CORRUPT', reason: `record ${i} is not JSON` }; }
    const { mac, ...body } = r;
    const expect = Buffer.from(macOf(cfg.key, body), 'hex');
    if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac) || !timingSafeEqual(expect, Buffer.from(mac, 'hex'))) {
      return { status: 'CORRUPT', reason: `record ${i} fails its MAC` };
    }
    if (r.v !== 1 || r.seq !== i || r.prevMac !== prevMac || r.graph !== graph || r.tenantId !== tenantId) {
      return { status: 'CORRUPT', reason: `record ${i} is out of sequence or for another graph/tenant` };
    }
    const last = recs[recs.length - 1];
    const okType = i === 0 ? r.type === 'INIT'
      : last!.type === 'PENDING' ? r.type === 'COMMIT' || r.type === 'ABORT'
      : r.type === 'PENDING';
    if (!okType) return { status: 'CORRUPT', reason: `record ${i} (${r.type}) is not a valid transition` };
    if (r.type === 'ABORT' && committed && r.stateHash !== committed.stateHash) return { status: 'CORRUPT', reason: `record ${i} ABORT does not restore the committed state` };
    if (r.type !== 'PENDING') committed = r;
    recs.push(r);
    prevMac = r.mac;
  }
  const head = recs[recs.length - 1]!;
  return head.type === 'PENDING' ? { status: 'PENDING', head, committed: committed! } : { status: 'COMMITTED', head };
}

async function append(cfg: LedgerConfig, graph: string, tenantId: string, prev: LedgerRecord | null,
  type: RecordType, state: EvidenceState, intent: string): Promise<LedgerRecord> {
  const body: Omit<LedgerRecord, 'mac'> = {
    v: 1, graph, tenantId, seq: prev ? prev.seq + 1 : 0, type, stateHash: state.stateHash, revisions: state.revisions,
    intent, at: new Date().toISOString(), prevMac: prev ? prev.mac : ''
  };
  const rec: LedgerRecord = { ...body, mac: macOf(cfg.key, body) };
  const fh = await open(chainPath(cfg, graph, tenantId), prev ? 'a' : 'wx');
  try { await fh.write(`${JSON.stringify(rec)}\n`); await fh.datasync(); } finally { await fh.close(); }
  return rec;
}

async function withLock<T>(cfg: LedgerConfig, graph: string, tenantId: string, fn: () => Promise<T>, waitMs = 10_000): Promise<T> {
  const dir = join(cfg.dir, safeSeg(graph));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = `${chainPath(cfg, graph, tenantId)}.lock`;
  const until = Date.now() + waitMs;
  for (;;) {
    try { await (await open(lock, 'wx')).close(); break; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (Date.now() > until) throw new WitnessError('LOCKED', 'Another evidence writer holds the witness lock');
      await new Promise(r => setTimeout(r, 25));
    }
  }
  try { return await fn(); } finally { await unlink(lock).catch(() => undefined); }
}

export interface WitnessedWriteOptions {
  /** Create a new chain. Refused if one exists. The operator vouches for the state the write produces. */
  init?: boolean;
  /** Finish a write left PENDING by a crash: allowed only for the same intent; commits whatever the rerun produces. */
  resume?: boolean;
}

/**
 * The only sanctioned way to change evidence state. Serialized per (graph, tenant). Refuses to write over a
 * graph that does not match the committed witness (it would bless tampering).
 */
export async function witnessedWrite<T>(client: GraphClient, cfg: LedgerConfig | null, tenantId: string, intent: string,
  write: () => Promise<T>, opts: WitnessedWriteOptions = {}): Promise<T> {
  if (!cfg) throw new WitnessError('NO_WITNESS', 'GRAPH_WITNESS_DIR and GRAPH_EVIDENCE_KEY are required to write evidence');
  const graph = client.config.graphName;
  return withLock(cfg, graph, tenantId, async () => {
    const chain = await readChain(cfg, graph, tenantId);
    if (opts.init) {
      if (chain.status !== 'MISSING') throw new WitnessError('EXISTS', 'A witness chain already exists; init is refused');
      const out = await write();
      await append(cfg, graph, tenantId, null, 'INIT', await evidenceState(client, tenantId), intent);
      return out;
    }
    if (chain.status === 'MISSING') throw new WitnessError('MISSING', 'No witness chain: initialization must be explicit');
    if (chain.status === 'CORRUPT') throw new WitnessError('CORRUPT', `Witness chain is corrupt: ${chain.reason}`);
    let pending: LedgerRecord;
    if (chain.status === 'PENDING') {
      if (!opts.resume || chain.head.intent !== intent) throw new WitnessError('PENDING', 'An earlier evidence write did not finish; resume it with the same intent');
      pending = chain.head;
    } else {
      const before = await evidenceState(client, tenantId);
      if (before.stateHash !== chain.head.stateHash) throw new WitnessError('MISMATCH', 'Graph evidence state does not match the witness; refusing to write over it');
      pending = await append(cfg, graph, tenantId, chain.head, 'PENDING', before, intent);
    }
    let out: T;
    try { out = await write(); } catch (e) {
      const now = await evidenceState(client, tenantId).catch(() => null);
      const committed = chain.status === 'PENDING' ? chain.committed : chain.head;
      if (now && now.stateHash === committed.stateHash) await append(cfg, graph, tenantId, pending, 'ABORT', now, intent);
      throw e;
    }
    await append(cfg, graph, tenantId, pending, 'COMMIT', await evidenceState(client, tenantId), intent);
    return out;
  });
}

/** Clears a PENDING head when the graph still holds the committed state (the write never happened). */
export async function recoverWitness(client: GraphClient, cfg: LedgerConfig, tenantId: string): Promise<'NOTHING_TO_DO' | 'ABORTED'> {
  const graph = client.config.graphName;
  return withLock(cfg, graph, tenantId, async () => {
    const chain = await readChain(cfg, graph, tenantId);
    if (chain.status !== 'PENDING') {
      if (chain.status === 'COMMITTED') return 'NOTHING_TO_DO';
      throw new WitnessError(chain.status === 'MISSING' ? 'MISSING' : 'CORRUPT', `Cannot recover: witness ${chain.status.toLowerCase()}`);
    }
    const now = await evidenceState(client, tenantId);
    if (now.stateHash !== chain.committed.stateHash) {
      throw new WitnessError('PENDING', 'The interrupted write changed the graph; rerun it with resume and the same intent');
    }
    await append(cfg, graph, tenantId, chain.head, 'ABORT', now, chain.head.intent);
    return 'ABORTED';
  });
}

export type WitnessCheck = { ok: true } | { ok: false; reason: string };

/** Read-side gate: the graph's current evidence state must equal the committed head of the witness. */
export async function checkWitness(client: GraphClient, cfg: LedgerConfig | null, tenantId: string, releaseId: string): Promise<WitnessCheck> {
  if (!cfg) return { ok: false, reason: 'no evidence witness is configured' };
  let chain: ChainState;
  try { chain = await readChain(cfg, client.config.graphName, tenantId); } catch { return { ok: false, reason: 'the evidence witness could not be read' }; }
  if (chain.status === 'MISSING') return { ok: false, reason: 'no evidence witness exists for this graph' };
  if (chain.status === 'CORRUPT') return { ok: false, reason: `the evidence witness is corrupt (${chain.reason})` };
  if (chain.status === 'PENDING') return { ok: false, reason: 'an evidence write is in progress or did not finish' };
  const now = await evidenceState(client, tenantId);
  const want = chain.head.revisions[releaseId];
  if (want === undefined || now.revisions[releaseId] !== want) {
    return { ok: false, reason: `the graph revision (${now.revisions[releaseId] ?? 'none'}) is not the witnessed revision (${want ?? 'none'})` };
  }
  if (now.stateHash !== chain.head.stateHash) return { ok: false, reason: 'the graph evidence differs from the witnessed state at this revision' };
  return { ok: true };
}

/** Test/ops helper: whether a chain file exists. */
export async function chainExists(cfg: LedgerConfig, graph: string, tenantId: string): Promise<boolean> {
  return stat(chainPath(cfg, graph, tenantId)).then(() => true, () => false);
}
