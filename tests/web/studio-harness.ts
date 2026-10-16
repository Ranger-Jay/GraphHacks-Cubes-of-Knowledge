import { createImportAttempt, type CheckImport, type IdeaverseIdeaView, type IdeaverseOverviewView, type ImportAttempt, type ImportIdea, type ImportOutcome, type ImportReceipt } from '../../apps/web/src/studio/ideaImport';
import { IdeaStudioController, type StudioDeps } from '../../apps/web/src/studio/studioController';
import type { IdeaDetailResult } from '../../apps/web/src/studio/ideaverseClient';

/**
 * In-memory stand-in for the v026 server, enforcing the CONTRACT semantics (PR #50) the UI depends on: key + fingerprint
 * idempotency (same key, other tuple = KEY_REUSED), guarded revision (STALE_REVISION), ALREADY_IMPORTED with receipt,
 * persisted receipts and a read-only status lookup. UNPROVEN as a model of Mara's server: the real-graph proof is separate.
 */
export const HASH = (n: number): string => n.toString(16).padStart(64, '0');
export const settleAll = async (): Promise<void> => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
export function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

export class FakeServer {
  revision: number | null = 3;   // null = an ambiguous workspace serves no revision (accepted graph rule, #54)
  readonly ideas = new Map<string, { n: number; imported: ImportReceipt | null }>();
  readonly keys = new Map<string, { fp: string; receipt: ImportReceipt }>();
  calls = { overview: 0, detail: 0, imports: [] as ImportAttempt[], checks: [] as ImportAttempt[] };
  /** Optional per-call hooks. */
  holdImport: ReturnType<typeof deferred<void>> | null = null;
  dropReplyOnce = false;           // commit, then answer ambiguous (lost reply)
  forgeReceiptOnce: ImportReceipt | null = null;   // answer persisted with this receipt WITHOUT committing
  failOverview = false;
  failOverviewAfter = Infinity;    // fail overview reads once calls.overview exceeds this
  deny = false;
  hideImportedFromOverview = false;   // stale/lying read-back
  integrity: { id: string; reason: string }[] = [];
  constructor(ids: string[]) { ids.forEach((id, i) => this.ideas.set(id, { n: i + 1, imported: null })); }

  view = (id: string): IdeaverseIdeaView => {
    const i = this.ideas.get(id)!;
    return { id, filename: `${id}.txt`, sha256: HASH(i.n), byteCount: 40, submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z', synthetic: true, classification: 'proposal',
      imported: !!i.imported && !this.hideImportedFromOverview, ...(i.imported && !this.hideImportedFromOverview ? { importedAt: i.imported.importedAt, membershipId: i.imported.membershipId } : {}) };
  };
  overview = async (): Promise<IdeaverseOverviewView> => {
    this.calls.overview++;
    if (this.failOverview || this.calls.overview > this.failOverviewAfter) throw new Error('overview down');
    const ideas = [...this.ideas.keys()].map(this.view);
    return { status: 'AVAILABLE', tenantId: 't-wad', domain: 'studio', workspace: { id: 'ws-1', revision: this.revision }, ideas, counts: { ideas: ideas.length, imported: ideas.filter(i => i.imported).length }, integrity: this.integrity };
  };
  detail = async (id: string): Promise<IdeaDetailResult> => {
    this.calls.detail++;
    if (!this.ideas.has(id)) return { kind: 'unavailable' };
    return { kind: 'ready', idea: { ...this.view(id), text: `A fictional proposal for ${id}.` } };
  };
  private fp = (a: ImportAttempt): string => `${a.ideaId}|${a.expectedRevision}`;
  private commit = (a: ImportAttempt): ImportReceipt => {
    const i = this.ideas.get(a.ideaId)!;
    this.revision = (this.revision ?? 0) + 1;
    const r: ImportReceipt = { ideaId: a.ideaId, sha256: HASH(i.n), workspaceId: 'ws-1', importedAt: `2026-10-16T04:0${(this.revision as number) % 10}:00.000Z`, workspaceRevision: this.revision as number, membershipId: `member-${a.ideaId}` };
    i.imported = r; this.keys.set(a.idempotencyKey, { fp: this.fp(a), receipt: r });
    return r;
  };
  /** Someone else imports an idea (workspace revision moves). */
  externalImport = (id: string): ImportReceipt => this.commit(createImportAttempt(id, `external-${id}-key`, this.revision as number));
  importIdea: ImportIdea = async (a): Promise<ImportOutcome> => {
    this.calls.imports.push(a);
    if (this.holdImport) await this.holdImport.promise;
    if (this.deny) return { kind: 'denied' };
    const known = this.keys.get(a.idempotencyKey);
    if (known) return known.fp === this.fp(a) ? { kind: 'persisted', receipt: known.receipt, replayed: true } : { kind: 'key-reused' };
    if (this.forgeReceiptOnce) { const r = this.forgeReceiptOnce; this.forgeReceiptOnce = null; return { kind: 'persisted', receipt: r }; }
    const i = this.ideas.get(a.ideaId);
    if (!i) return { kind: 'rejected' };
    if (i.imported) return { kind: 'existing', receipt: i.imported };
    if (a.expectedRevision !== this.revision) return { kind: 'stale' };
    const r = this.commit(a);
    if (this.dropReplyOnce) { this.dropReplyOnce = false; return { kind: 'ambiguous' }; }
    return { kind: 'persisted', receipt: r, replayed: false };
  };
  checkImport: CheckImport = async a => {
    this.calls.checks.push(a);
    const known = this.keys.get(a.idempotencyKey);
    if (!known) return { kind: 'not-observed' };
    return known.fp === this.fp(a) ? { kind: 'persisted', receipt: known.receipt } : { kind: 'key-reused' };
  };
}

export function makeStudio(ids: string[] = ['idea-001', 'idea-002'], over: Partial<StudioDeps> = {}, opts: { unbound?: boolean } = {}) {
  const server = new FakeServer(ids);
  const added: Array<{ receipt: ImportReceipt; ideaId: string }> = [];
  let k = 0;
  const ctl = new IdeaStudioController({
    // Late-bound so a test can replace a server method after construction.
    readOverview: () => server.overview(), readDetail: id => server.detail(id), checkImport: a => server.checkImport(a),
    ...(opts.unbound ? {} : { importIdea: (a: ImportAttempt) => server.importIdea(a) }),
    newKey: () => `attempt-key-${String(++k).padStart(4, '0')}`, onAdded: (receipt, ideaId) => added.push({ receipt, ideaId }), ...over,
  });
  return { server, ctl, added };
}
export async function ready(ctl: IdeaStudioController, access: 'OWNER' | 'READER' | 'UNKNOWN' = 'OWNER'): Promise<void> {
  ctl.setEnv({ phase: 'READY', access }); await settleAll();
}
export async function openIdea(ctl: IdeaStudioController, id: string): Promise<void> { await ctl.open(id); await settleAll(); }
export const phaseOf = (ctl: IdeaStudioController): string | undefined => ctl.getSnapshot().open?.state.phase;
