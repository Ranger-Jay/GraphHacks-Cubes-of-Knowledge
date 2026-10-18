import {
  cardActions, checkAttempt, confirmImport, createImportAttempt, importReducer, initialImportState, isBusy,
  type CheckImport, type IdeaSummary, type IdeaverseIdeaView, type IdeaverseOverviewView, type ImportAttempt, type ImportEvent, type ImportIdea,
  type ImportOutcome, type ImportReceipt, type ImportState, type ReadOverview,
} from './ideaImport';
import { addBlockedReason, type StudioAccess, type StudioEnv } from './studioGuard';
import type { IdeaDetailResult } from './ideaverseClient';
import { StudioReadError } from './ideaverseClient';
import type { IdeaDetailState } from './IdeaCard';

/**
 * Session controller for the single IdeaVerse card (framework-free, so every rule is unit-testable without a DOM).
 * It OWNS: the pool (last fresh overview), per-idea import state, pinned attempts, the READY / owner-access guard and
 * stale-completion handling. It outlives the card: closing and reopening never abandons an unresolved attempt and never
 * silently starts a second one.
 *
 * Rules (contract docs/ideaverse-api-v026.md, v030.01):
 *  - An attempt {ideaId, key, expectedRevision} is created ONLY from a fresh overview read and is never changed. Retries,
 *    Re-check and reopen reuse it. A stale/key-reused result discards it; a new one needs a fresh read and a NEW key.
 *  - Add runs only in READY with OWNER access. Leaving READY or closing the card abandons any in-flight request: its late
 *    completion is discarded (no Added, no onAdded) and the attempt stays unresolved.
 *  - `onAdded(receipt)` fires at most once per idea+membership, only on the verifying->added transition (fresh read-back).
 *  - After every settled request (applied or stale) the pool is refreshed from a fresh overview, so a committed idea
 *    leaves the pool even when its card was closed.
 *  - Re-check never calls importIdea.
 */
export interface StudioDeps {
  readOverview: ReadOverview;
  readDetail: (ideaId: string) => Promise<IdeaDetailResult>;
  importIdea?: ImportIdea;
  checkImport?: CheckImport;
  /** Fresh unique key per attempt (contract: /^[A-Za-z0-9_-]{8,64}$/). */
  newKey?: () => string;
  /** The scene owner decides the pull/fade. Called once, only after the fresh read-back confirmed the receipt. */
  onAdded?: (receipt: ImportReceipt, ideaId: string) => void;
}

export type PoolStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'denied';
export interface PoolState { status: PoolStatus; overview: IdeaverseOverviewView | null; /** not-yet-imported ideas, in overview order */ ideas: IdeaverseIdeaView[] }
export interface OpenCard {
  idea: IdeaSummary; detail: IdeaDetailState; state: ImportState; addBlockedReason: string | null;
  /** True when an attempt tuple is pinned for this idea (kept across close/reopen). */
  hasAttempt: boolean;
}
export interface StudioSnapshot { env: StudioEnv; pool: PoolState; open: OpenCard | null }

interface Session { attempt: ImportAttempt | null; state: ImportState }

const defaultKey = (): string => `idea-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
const EMPTY_POOL: PoolState = { status: 'idle', overview: null, ideas: [] };

export class IdeaStudioController {
  private env: StudioEnv = { phase: 'CHECKING', access: 'UNKNOWN' };
  private deniedLocal = false;
  private pool: PoolState = EMPTY_POOL;
  private poolSeq = 0;
  private openId: string | null = null;
  private openSeq = 0;
  private detail: { state: IdeaDetailState; idea: IdeaSummary | null } = { state: 'loading', idea: null };
  private readonly sessions = new Map<string, Session>();
  private readonly pulled = new Set<string>();
  private disposed = false;
  private listeners = new Set<() => void>();
  private snap: StudioSnapshot;

  constructor(private readonly deps: StudioDeps) {
    // These are handed to React as bare callbacks (onClick={controller.add}); an unbound `this` would throw in the browser.
    this.open = this.open.bind(this); this.close = this.close.bind(this); this.add = this.add.bind(this);
    this.recheck = this.recheck.bind(this); this.newAttempt = this.newAttempt.bind(this); this.refreshPool = this.refreshPool.bind(this);
    this.setEnv = this.setEnv.bind(this); this.setAccess = this.setAccess.bind(this);
    this.snap = this.build();
  }

  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = (): StudioSnapshot => this.snap;
  dispose(): void { this.disposed = true; this.listeners.clear(); }

  private bound(): boolean { return !!this.deps.importIdea; }
  private effectiveEnv(): StudioEnv { return { phase: this.env.phase, access: this.deniedLocal ? 'DENIED' : this.env.access }; }
  private ready(): boolean { return this.env.phase === 'READY'; }
  private session(id: string): Session { let s = this.sessions.get(id); if (!s) { s = { attempt: null, state: initialImportState }; this.sessions.set(id, s); } return s; }
  private build(): StudioSnapshot {
    const env = this.effectiveEnv();
    let open: OpenCard | null = null;
    if (this.openId !== null && this.detail.idea !== null) {
      const s = this.session(this.openId);
      const blocked = addBlockedReason(env, this.bound());
      open = { idea: this.detail.idea, detail: this.detail.state, state: s.state, addBlockedReason: blocked, hasAttempt: s.attempt !== null };
    }
    // Outside READY the pool is withheld: nothing to inspect or add (fail closed), and an old pool must never look current.
    return { env, pool: this.ready() ? this.pool : EMPTY_POOL, open };
  }
  private emit(): void { if (this.disposed) return; this.snap = this.build(); for (const l of [...this.listeners]) l(); }
  private dispatch(id: string, e: ImportEvent): ImportState {
    const s = this.session(id);
    s.state = importReducer(s.state, e);
    return s.state;
  }
  /** A completion is current only while its request id is still the session's, the controller lives and the phase is still READY. */
  private current(id: string, requestId: number): boolean { return !this.disposed && this.ready() && this.session(id).state.requestId === requestId; }

  /** The shell reports the live ScenePhase and what it knows about access. Absent/unknown = CHECKING / UNKNOWN (fail closed). */
  setEnv(env: StudioEnv): void {
    const phase = env.phase ?? 'CHECKING';
    const was = this.env;
    if (was.phase === phase && was.access === env.access) return;
    const leftReady = was.phase === 'READY' && phase !== 'READY';
    // Owner access lost while staying READY (v049): a capability is not a one-way latch. An in-flight import
    // or read-back started under OWNER must not complete as Added after the loss. Abandon the import
    // sessions exactly as leaving READY does, so their late completions are discarded and the attempts stay
    // unresolved. Pool/detail reads are reader data and stay valid, so their sequences are untouched.
    const lostOwner = was.phase === 'READY' && phase === 'READY' && was.access === 'OWNER' && env.access !== 'OWNER';
    this.env = { phase, access: env.access };
    if (was.access !== env.access) this.deniedLocal = false;
    if (leftReady) {
      // Invalidate every in-flight request: late completions are discarded, attempts stay unresolved.
      this.poolSeq++; this.openSeq++;
      for (const id of this.sessions.keys()) this.dispatch(id, { type: 'abandon' });
      this.pool = EMPTY_POOL;
    } else if (lostOwner) {
      for (const id of this.sessions.keys()) this.dispatch(id, { type: 'abandon' });
    }
    this.emit();
    if (phase === 'READY' && was.phase !== 'READY') void this.refreshPool();
  }

  /** Fresh pool read. A stale completion (newer read started, or phase left READY) is discarded. */
  async refreshPool(): Promise<void> {
    if (!this.ready() || this.disposed) return;
    const seq = ++this.poolSeq;
    this.pool = { ...this.pool, status: 'loading' };
    this.emit();
    let next: PoolState;
    try {
      const ov = await this.deps.readOverview();
      next = ov.status === 'AVAILABLE'
        ? { status: 'ready', overview: ov, ideas: ov.ideas.filter(i => !i.imported) }
        : ov.status === 'EMPTY' ? { status: 'ready', overview: ov, ideas: [] } : { status: 'unavailable', overview: ov, ideas: [] };
    } catch (e) { next = { status: e instanceof StudioReadError && e.kind === 'denied' ? 'denied' : 'unavailable', overview: null, ideas: [] }; }
    if (seq !== this.poolSeq || !this.ready() || this.disposed) return;
    this.pool = next;
    this.emit();
  }

  /** Open the single card for an idea in the current pool. Opening never imports. Only in READY. */
  async open(ideaId: string): Promise<void> {
    if (!this.ready() || this.disposed) return;
    const entry = this.pool.ideas.find(i => i.id === ideaId);
    if (!entry) return;
    if (this.openId !== null && this.openId !== ideaId) this.abandonOpen();
    this.openId = ideaId;
    const seq = ++this.openSeq;
    this.session(ideaId);
    this.detail = { state: 'loading', idea: summaryOf(entry, '') };
    this.emit();
    let result: IdeaDetailResult;
    try { result = await this.deps.readDetail(ideaId); } catch { result = { kind: 'unavailable' }; }
    if (seq !== this.openSeq || this.openId !== ideaId || this.disposed) return;
    // The detail must be the same file the overview lists (same id and manifest hash) or it is not shown as verified.
    this.detail = result.kind === 'ready' && result.idea.id === entry.id && result.idea.sha256 === entry.sha256
      ? { state: 'ready', idea: summaryOf(result.idea, result.idea.text) }
      : { state: 'unavailable', idea: summaryOf(entry, '') };
    this.emit();
  }

  /** Close the card. An in-flight request is abandoned (late completion discarded); the attempt stays pinned for reopen. */
  close(): void {
    if (this.openId === null) return;
    this.abandonOpen();
    this.openId = null; this.openSeq++;
    this.detail = { state: 'loading', idea: null };
    this.emit();
  }
  private abandonOpen(): void { if (this.openId !== null) this.dispatch(this.openId, { type: 'abandon' }); }

  private openContext(): { id: string; ses: Session; idea: IdeaSummary } | null {
    if (this.openId === null || this.detail.state !== 'ready' || this.detail.idea === null) return null;
    return { id: this.openId, ses: this.session(this.openId), idea: this.detail.idea };
  }

  /** Add / Retry. Reuses the pinned attempt; pins a new one only from a fresh overview read. One submit at a time. */
  add(): void {
    const ctx = this.openContext();
    const importIdea = this.deps.importIdea;
    if (!ctx || !importIdea || addBlockedReason(this.effectiveEnv(), true) !== null) return;
    const before = ctx.ses.state;
    // Only what the card state offers: no same-tuple Retry after stale/key-reused/denied/rejected, none while busy or finished.
    if (cardActions(before).add === null) return;
    const after = this.dispatch(ctx.id, { type: 'submit' });
    if (after === before) return;                      // busy / added / present: reducer ignored it
    this.emit();
    void this.runAdd(ctx.id, ctx.idea, after.requestId, importIdea);
  }

  private async runAdd(id: string, idea: IdeaSummary, requestId: number, importIdea: ImportIdea): Promise<void> {
    const ses = this.session(id);
    if (ses.attempt === null) {
      // Pin from a FRESH overview. If this read fails, NO request was sent and the card says exactly that.
      let ov: IdeaverseOverviewView | null = null;
      try { ov = await this.deps.readOverview(); } catch { ov = null; }
      if (!this.current(id, requestId)) return;        // nothing was sent
      const entry = ov?.status === 'AVAILABLE' ? ov.ideas.find(i => i.id === id) : undefined;
      if (!ov || ov.status !== 'AVAILABLE' || !entry || ov.integrity.some(f => f.id === id)) { this.settle(id, requestId, { kind: 'not-started' }, idea); return; }
      if (entry.imported) { this.dispatch(id, { type: 'observed-present', requestId }); this.emit(); void this.refreshPool(); return; }
      if (typeof ov.workspace.revision !== 'number') { this.settle(id, requestId, { kind: 'not-started' }, idea); return; }
      try { ses.attempt = createImportAttempt(id, (this.deps.newKey ?? defaultKey)(), ov.workspace.revision); }
      catch { this.settle(id, requestId, { kind: 'not-started' }, idea); return; }
      this.emit();
    }
    const attempt = ses.attempt;
    if (!this.current(id, requestId)) return;
    let outcome: ImportOutcome;
    try { outcome = await importIdea(attempt); } catch { outcome = { kind: 'failed' }; }
    this.settle(id, requestId, outcome, idea);
  }

  /** Apply an import completion, or discard it when stale (and still refresh the pool so a committed idea leaves it). */
  private settle(id: string, requestId: number, outcome: ImportOutcome, idea: IdeaSummary): void {
    if (this.disposed) return;
    if (!this.current(id, requestId)) { void this.refreshPool(); return; }
    if (outcome.kind === 'denied') this.deniedLocal = true;
    const next = this.dispatch(id, { type: 'settled', requestId, outcome });
    this.emit();
    if (next.phase === 'verifying') void this.verify(id, idea, next.requestId, next.receipt);
    else if (next.phase === 'error' && outcome.kind !== 'not-started') void this.refreshPool();
  }

  private async verify(id: string, idea: IdeaSummary, requestId: number, receipt: ImportReceipt): Promise<void> {
    const result = await confirmImport(idea, receipt, this.deps.readOverview);
    if (!this.current(id, requestId)) { void this.refreshPool(); return; }
    const next = this.dispatch(id, { type: 'verified', requestId, result });
    if (next.phase === 'added') {
      const k = `${id}:${next.receipt.membershipId}`;
      if (!this.pulled.has(k)) { this.pulled.add(k); this.deps.onAdded?.(next.receipt, id); }
      this.session(id).attempt = null;                 // resolved: a later add needs a NEW attempt (it would be ALREADY_IMPORTED)
    }
    this.emit();
    if (next.phase === 'added' || next.phase === 'present' || next.phase === 'unconfirmed') void this.refreshPool();
  }

  /** READ-ONLY Re-check. Never calls importIdea. With a kept own receipt: a fresh read-back. Otherwise: a status check of the pinned tuple. */
  recheck(): void {
    const ctx = this.openContext();
    if (!ctx || addBlockedReason(this.effectiveEnv(), this.bound()) !== null) return;
    const st = ctx.ses.state;
    if (st.phase === 'unconfirmed' && st.receipt !== null) {
      const next = this.dispatch(ctx.id, { type: 'recheck' });
      this.emit();
      if (next.phase === 'verifying') void this.verify(ctx.id, ctx.idea, next.requestId, next.receipt);
      return;
    }
    const next = this.dispatch(ctx.id, { type: 'check' });
    if (next.phase !== 'checking') return;
    this.emit();
    void this.runCheck(ctx.id, ctx.idea, next.requestId, ctx.ses.attempt);
  }

  private async runCheck(id: string, idea: IdeaSummary, requestId: number, attempt: ImportAttempt | null): Promise<void> {
    const result = await checkAttempt(idea, attempt, this.deps.checkImport, this.deps.readOverview);
    if (!this.current(id, requestId)) { void this.refreshPool(); return; }
    if (result.kind === 'denied') this.deniedLocal = true;
    const next = this.dispatch(id, { type: 'checked', requestId, result });
    this.emit();
    if (next.phase === 'verifying') void this.verify(id, idea, next.requestId, next.receipt);
    else void this.refreshPool();
  }

  /** After STALE_REVISION / KEY_REUSED: discard the old tuple, read fresh, pin a NEW key + revision. The user then presses Add. */
  newAttempt(): void {
    const ctx = this.openContext();
    if (!ctx || addBlockedReason(this.effectiveEnv(), this.bound()) !== null) return;
    if (ctx.ses.state.phase !== 'error') return;
    const reason = ctx.ses.state.reason;
    if (reason !== 'stale' && reason !== 'key-reused') return;
    ctx.ses.attempt = null;
    const after = this.dispatch(ctx.id, { type: 'submit' });
    if (after.phase !== 'pending') return;
    this.emit();
    void this.runNewAttempt(ctx.id, ctx.idea, after.requestId);
  }

  private async runNewAttempt(id: string, idea: IdeaSummary, requestId: number): Promise<void> {
    let ov: IdeaverseOverviewView | null = null;
    try { ov = await this.deps.readOverview(); } catch { ov = null; }
    if (!this.current(id, requestId)) return;
    const entry = ov?.status === 'AVAILABLE' ? ov.ideas.find(i => i.id === id) : undefined;
    if (!ov || ov.status !== 'AVAILABLE' || !entry || ov.integrity.some(f => f.id === id)) { this.settle(id, requestId, { kind: 'not-started' }, idea); return; }
    if (entry.imported) { this.dispatch(id, { type: 'observed-present', requestId }); this.emit(); void this.refreshPool(); return; }
    if (typeof ov.workspace.revision !== 'number') { this.settle(id, requestId, { kind: 'not-started' }, idea); return; }
    try { this.session(id).attempt = createImportAttempt(id, (this.deps.newKey ?? defaultKey)(), ov.workspace.revision); }
    catch { this.settle(id, requestId, { kind: 'not-started' }, idea); return; }
    this.dispatch(id, { type: 'reset' });
    this.emit();
    void this.refreshPool();
  }

  /** Test/evidence hook: the pinned tuple for an idea (frozen), or null. */
  attemptFor(ideaId: string): ImportAttempt | null { return this.sessions.get(ideaId)?.attempt ?? null; }
  /** Used by the mount to know whether anything is unresolved (never silently abandoned). */
  hasUnresolved(ideaId: string): boolean { const s = this.sessions.get(ideaId); return !!s && (s.state.phase === 'unconfirmed' || (s.state.phase === 'error' && s.attempt !== null)); }
  setAccess(access: StudioAccess): void { this.setEnv({ phase: this.env.phase, access }); }
  isBusyFor(ideaId: string): boolean { const s = this.sessions.get(ideaId); return !!s && isBusy(s.state); }
}

function summaryOf(v: IdeaverseIdeaView, text: string): IdeaSummary {
  return { id: v.id, filename: v.filename, submittedAt: v.submittedAt, touchedAt: v.touchedAt, text, sha256: v.sha256 };
}
