import React, { useEffect, useState } from 'react';

/**
 * Issue #39 (v024): 100 IdeaVerse ideas, inspectable comets and calm replacement lifecycle.
 *
 * Isolated scene module: does not modify CompanyCube, AgentPyramid, or Mara's speech-gating files.
 * Coordinates with Claude's manifest/import contract (#38/#40) and Cora's IdeaCard (#39/#40).
 */

export const IDEAVERSE_MANIFEST_VERSION = 'wad-ideaverse@1';
export const IDEAVERSE_REFERENCE_NOW_ISO = '2026-10-15T20:00:00Z';
export const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours in ms
export const COMET_FLIGHT_DURATION_MS = 60 * 1000; // 60 seconds active unpaused flight
export const COMET_IMPORT_PULL_DURATION_MS = 900; // Gentle pull toward cube + fade after confirmed receipt
export const MAX_ACTIVE_COMETS = 3;

const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface IdeaVerseCometItem {
  id: string;
  filename: string;
  path?: string;
  byteCount?: number;
  sha256: string;
  submittedAt: string;
  touchedAt: string;
  synthetic: true;
  origin?: string;
  licenseStatus?: string;
  text: string;
  imported?: boolean;
}

/**
 * Persisted workspace-import receipt (#40).
 * Import membership is outside the licensing witness: must carry idea/file hash,
 * workspace and membership identity, imported timestamp, and workspace revision,
 * and must NEVER fabricate a licensing witnessHash.
 */
export interface PersistedImportReceipt {
  receiptId?: string | undefined;
  ideaId: string;
  filename?: string | undefined;
  fileSha256: string;
  workspaceId: string;
  membershipId: string;
  importedAt: string;
  importedByRole?: string | undefined;
  idempotencyKey?: string | undefined;
  workspaceRevision: number;
  replayed?: boolean | undefined;
  witnessHash?: never;
  nodeId?: never;
  edgeId?: never;
}

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

export interface ActiveCometSlot {
  idea: IdeaVerseCometItem;
  laneIndex: 0 | 1 | 2;
  status: 'flying' | 'importing';
  /** Active unpaused flight time in milliseconds (0 .. COMET_FLIGHT_DURATION_MS). */
  activeFlightMs: number;
  /** Progress of the post-receipt pull-toward-cube transition (0 .. COMET_IMPORT_PULL_DURATION_MS). */
  importPullMs: number;
  /** Normalized progress away from cube toward camera (0 .. 1). */
  flightProgress: number;
  /** Normalized pull progress back toward the cube after confirmed import (0 .. 1). */
  pullToCubeProgress: number;
  /** Visual opacity (fades in gently at start and fades out before camera clipping or on import). */
  opacity: number;
}

export interface EligiblePoolSelection {
  eligible: IdeaVerseCometItem[];
  poolSource: 'recent-48h' | 'newest-fallback' | 'empty';
  totalValidUnimported: number;
  allImported: boolean;
}

export interface CometLifecycleState {
  allIdeas: readonly IdeaVerseCometItem[];
  importedIds: ReadonlySet<string>;
  activeComets: readonly ActiveCometSlot[];
  inspectedIdeaId: string | null;
  paused: boolean;
  tabHidden: boolean;
  reducedMotion: boolean;
  lastTickMs: number;
  rotationCursor: number;
  lastRetiredIdeaId: string | null;
  reducedMotionOffset: number;
  poolSource: 'recent-48h' | 'newest-fallback' | 'empty';
  allImported: boolean;
  membershipRefreshCount: number;
  lastImportReceipt: PersistedImportReceipt | null;
}

export function parseStrictUtcMs(iso: unknown): number | null {
  if (typeof iso !== 'string' || !UTC_ISO_RE.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function formatUtcDateLabel(iso: string): string {
  const ms = parseStrictUtcMs(iso);
  if (ms === null) return 'unknown date';
  return `${new Date(ms).toISOString().slice(0, 10)} UTC`;
}

/**
 * Selection clarification (#39):
 * 1. Exclude already imported files and currently visible IDs BEFORE applying the recent-48h pool
 *    and newest-timestamp fallback.
 * 2. Skip future (touchedAt > now) or invalid timestamps; require synthetic === true.
 * 3. Recent pool: now - 48h <= touchedAt <= now (inclusive of exact 48h boundary).
 * 4. If no remaining eligible files fall in the 48h window, fall back to the newest valid past
 *    timestamps among remaining unimported non-visible files.
 * 5. Never report all ideas imported while unimported valid files remain.
 * 6. Stable tie-breaking: newest touchedAt descending, then stable ID ascending.
 */
export function selectEligibleIdeaPool(
  ideas: readonly IdeaVerseCometItem[],
  options: {
    nowMs: number;
    importedIds?: Iterable<string>;
    activeIds?: Iterable<string>;
  }
): EligiblePoolSelection {
  const importedSet = new Set<string>(options.importedIds ?? []);
  const activeSet = new Set<string>(options.activeIds ?? []);
  const windowStartMs = options.nowMs - RECENT_WINDOW_MS;

  const validPastUnimported: Array<{ item: IdeaVerseCometItem; touchedMs: number }> = [];
  for (const item of ideas) {
    if (!item || item.synthetic !== true || !item.id || !item.filename) continue;
    const touchedMs = parseStrictUtcMs(item.touchedAt);
    const submittedMs = parseStrictUtcMs(item.submittedAt);
    if (touchedMs === null || submittedMs === null) continue;
    if (touchedMs > options.nowMs) continue; // Skip future timestamps
    if (item.imported === true || importedSet.has(item.id)) continue; // Exclude imported
    validPastUnimported.push({ item, touchedMs });
  }

  const totalValidUnimported = validPastUnimported.length;
  if (totalValidUnimported === 0) {
    return {
      eligible: [],
      poolSource: 'empty',
      totalValidUnimported: 0,
      allImported: ideas.some(i => i && i.synthetic === true && parseStrictUtcMs(i.touchedAt) !== null),
    };
  }

  const nonVisible = validPastUnimported.filter(entry => !activeSet.has(entry.item.id));
  if (nonVisible.length === 0) {
    return {
      eligible: [],
      poolSource: 'empty',
      totalValidUnimported,
      allImported: false,
    };
  }

  const sortByNewestThenId = (
    a: { item: IdeaVerseCometItem; touchedMs: number },
    b: { item: IdeaVerseCometItem; touchedMs: number }
  ): number => {
    if (b.touchedMs !== a.touchedMs) return b.touchedMs - a.touchedMs;
    return a.item.id.localeCompare(b.item.id);
  };

  const recent48h = nonVisible.filter(
    entry => entry.touchedMs >= windowStartMs && entry.touchedMs <= options.nowMs
  );

  if (recent48h.length > 0) {
    recent48h.sort(sortByNewestThenId);
    return {
      eligible: recent48h.map(e => e.item),
      poolSource: 'recent-48h',
      totalValidUnimported,
      allImported: false,
    };
  }

  const fallbackNewest = [...nonVisible].sort(sortByNewestThenId);
  return {
    eligible: fallbackNewest.map(e => e.item),
    poolSource: 'newest-fallback',
    totalValidUnimported,
    allImported: false,
  };
}

export const COMET_INITIAL_OPACITY = 0.35;
export const COMET_TICK_INTERVAL_MS = 250;

export function computeCometOpacity(flightProgress: number, pullToCubeProgress: number, status: 'flying' | 'importing'): number {
  if (status === 'importing') {
    return Math.max(0, Number((1 - pullToCubeProgress).toFixed(4)));
  }
  const p = Math.max(0, Math.min(1, flightProgress));
  if (p < 0.08) {
    return Number((COMET_INITIAL_OPACITY + (1 - COMET_INITIAL_OPACITY) * (p / 0.08)).toFixed(4));
  }
  if (p > 0.85) return Number(Math.max(0, (1 - p) / 0.15).toFixed(4));
  return 1;
}

function makeCometSlot(idea: IdeaVerseCometItem, laneIndex: 0 | 1 | 2): ActiveCometSlot {
  return {
    idea,
    laneIndex,
    status: 'flying',
    activeFlightMs: 0,
    importPullMs: 0,
    flightProgress: 0,
    pullToCubeProgress: 0,
    opacity: COMET_INITIAL_OPACITY,
  };
}

function fillCometSlots(
  allIdeas: readonly IdeaVerseCometItem[],
  importedIds: ReadonlySet<string>,
  currentActive: readonly ActiveCometSlot[],
  nowMs: number,
  rotationCursor: number,
  lastRetiredIdeaId: string | null
): {
  activeComets: ActiveCometSlot[];
  rotationCursor: number;
  poolSource: 'recent-48h' | 'newest-fallback' | 'empty';
  allImported: boolean;
} {
  const activeComets = [...currentActive];
  const activeIds = new Set(activeComets.map(c => c.idea.id));
  let cursor = rotationCursor;

  const initialCheck = selectEligibleIdeaPool(allIdeas, {
    nowMs,
    importedIds,
    activeIds,
  });

  let poolSource = initialCheck.poolSource;
  const allImported = initialCheck.allImported;

  const usedLanes = new Set<number>(activeComets.map(c => c.laneIndex));
  const availableLanes: Array<0 | 1 | 2> = ([0, 1, 2] as const).filter(l => !usedLanes.has(l));

  for (const lane of availableLanes) {
    if (activeComets.length >= MAX_ACTIVE_COMETS) break;
    const selection = selectEligibleIdeaPool(allIdeas, {
      nowMs,
      importedIds,
      activeIds,
    });
    if (selection.eligible.length === 0) break;
    poolSource = selection.poolSource;

    let candidates = selection.eligible;
    if (lastRetiredIdeaId && candidates.length > 1) {
      const withoutImmediateRepeat = candidates.filter(c => c.id !== lastRetiredIdeaId);
      if (withoutImmediateRepeat.length > 0) {
        candidates = withoutImmediateRepeat;
      }
    }

    const pickIndex = cursor % candidates.length;
    const chosen = candidates[pickIndex]!;
    cursor += 1;
    activeIds.add(chosen.id);
    activeComets.push(makeCometSlot(chosen, lane));
  }

  return {
    activeComets,
    rotationCursor: cursor,
    poolSource,
    allImported,
  };
}

/**
 * Initialize deterministic comet lifecycle state.
 */
export function createCometLifecycle(
  ideas: readonly IdeaVerseCometItem[],
  options: {
    nowMs?: number | undefined;
    importedIds?: Iterable<string> | undefined;
    paused?: boolean | undefined;
    tabHidden?: boolean | undefined;
    reducedMotion?: boolean | undefined;
  } = {}
): CometLifecycleState {
  const nowMs = options.nowMs ?? Date.parse(IDEAVERSE_REFERENCE_NOW_ISO);
  const importedIds = new Set<string>(options.importedIds ?? []);
  for (const idea of ideas) {
    if (idea?.imported === true) importedIds.add(idea.id);
  }

  const filled = fillCometSlots(ideas, importedIds, [], nowMs, 0, null);
  return {
    allIdeas: ideas,
    importedIds,
    activeComets: filled.activeComets,
    inspectedIdeaId: null,
    paused: Boolean(options.paused),
    tabHidden: Boolean(options.tabHidden),
    reducedMotion: Boolean(options.reducedMotion),
    lastTickMs: nowMs,
    rotationCursor: filled.rotationCursor,
    lastRetiredIdeaId: null,
    reducedMotionOffset: 0,
    poolSource: filled.poolSource,
    allImported: filled.allImported,
    membershipRefreshCount: 0,
    lastImportReceipt: null,
  };
}

/**
 * Advance comet flight and import transitions by elapsed active time.
 * - Global pause, hidden tab, or reduced-motion mode freezes elapsed time so resuming never bursts spawns.
 * - Opening a comet's card holds that specific comet and pauses its 60s expiry while read.
 */
export function tickCometLifecycle(state: CometLifecycleState, nowMs: number): CometLifecycleState {
  const rawDelta = Math.max(0, nowMs - state.lastTickMs);
  if (state.paused || state.tabHidden || state.reducedMotion || rawDelta === 0) {
    return {
      ...state,
      lastTickMs: nowMs,
    };
  }

  const surviving: ActiveCometSlot[] = [];
  let lastRetiredIdeaId = state.lastRetiredIdeaId;
  let membershipRefreshCount = state.membershipRefreshCount;

  for (const slot of state.activeComets) {
    if (slot.status === 'importing') {
      const nextPullMs = slot.importPullMs + rawDelta;
      if (nextPullMs >= COMET_IMPORT_PULL_DURATION_MS) {
        // Confirmed import pull-to-cube + fade finished: refresh membership & replace comet
        lastRetiredIdeaId = slot.idea.id;
        membershipRefreshCount += 1;
        continue;
      }
      const pullToCubeProgress = Number((nextPullMs / COMET_IMPORT_PULL_DURATION_MS).toFixed(4));
      surviving.push({
        ...slot,
        importPullMs: nextPullMs,
        pullToCubeProgress,
        opacity: computeCometOpacity(slot.flightProgress, pullToCubeProgress, 'importing'),
      });
      continue;
    }

    // Held comet (card open): pause its expiry while being read
    if (state.inspectedIdeaId === slot.idea.id) {
      surviving.push(slot);
      continue;
    }

    const nextFlightMs = slot.activeFlightMs + rawDelta;
    if (nextFlightMs >= COMET_FLIGHT_DURATION_MS) {
      // Ignored comet flew for 60s of active unpaused flight: retire and replace
      lastRetiredIdeaId = slot.idea.id;
      continue;
    }

    const flightProgress = Number((nextFlightMs / COMET_FLIGHT_DURATION_MS).toFixed(4));
    surviving.push({
      ...slot,
      activeFlightMs: nextFlightMs,
      flightProgress,
      opacity: computeCometOpacity(flightProgress, 0, 'flying'),
    });
  }

  const filled = fillCometSlots(
    state.allIdeas,
    state.importedIds,
    surviving,
    nowMs,
    state.rotationCursor,
    lastRetiredIdeaId
  );

  return {
    ...state,
    activeComets: filled.activeComets,
    lastTickMs: nowMs,
    rotationCursor: filled.rotationCursor,
    lastRetiredIdeaId,
    poolSource: filled.poolSource,
    allImported: filled.allImported,
    membershipRefreshCount,
  };
}

/**
 * Inspecting a comet opens its card and holds/pauses its expiry. Inspection alone NEVER imports.
 */
export function inspectComet(state: CometLifecycleState, ideaId: string): CometLifecycleState {
  const existsInActive = state.activeComets.some(c => c.idea.id === ideaId);
  const existsInAll = state.allIdeas.some(i => i.id === ideaId && !state.importedIds.has(i.id));
  if (!existsInActive && !existsInAll) return state;
  return {
    ...state,
    inspectedIdeaId: ideaId,
  };
}

/**
 * Closing the inspect card resumes the comet's remaining lifetime from where it was held.
 */
export function closeInspectedComet(state: CometLifecycleState): CometLifecycleState {
  if (state.inspectedIdeaId === null) return state;
  return {
    ...state,
    inspectedIdeaId: null,
  };
}

export function setCometPause(state: CometLifecycleState, paused: boolean, nowMs: number): CometLifecycleState {
  return {
    ...state,
    paused,
    lastTickMs: nowMs,
  };
}

export function setCometHiddenTab(state: CometLifecycleState, tabHidden: boolean, nowMs: number): CometLifecycleState {
  return {
    ...state,
    tabHidden,
    lastTickMs: nowMs,
  };
}

/**
 * Pending, denied, outage, conflict or save failure: never play the success transition,
 * never mark imported, and preserve the comet and card for retry.
 */
export function recordNonPersistedImportAttempt(state: CometLifecycleState): CometLifecycleState {
  return state;
}

/**
 * Validate that a receipt matches the persisted workspace-import receipt contract (#40):
 * - Must carry ideaId, 64-hex fileSha256, workspaceId, membershipId, valid UTC importedAt, and integer workspaceRevision >= 1.
 * - Must NEVER carry a licensing witnessHash, nodeId, or edgeId (import membership is outside the licensing witness).
 * - If the idea exists in allIdeas, receipt.fileSha256 must match idea.sha256.
 */
export function isValidWorkspaceImportReceipt(
  receipt: unknown,
  allIdeas?: readonly IdeaVerseCometItem[]
): receipt is PersistedImportReceipt {
  if (!receipt || typeof receipt !== 'object') return false;
  const r = receipt as Record<string, unknown>;
  if ('witnessHash' in r && r.witnessHash !== undefined) return false;
  if ('nodeId' in r && r.nodeId !== undefined) return false;
  if ('edgeId' in r && r.edgeId !== undefined) return false;
  if (typeof r.ideaId !== 'string' || !r.ideaId.trim()) return false;
  if (typeof r.fileSha256 !== 'string' || !SHA256_HEX_RE.test(r.fileSha256)) return false;
  if (typeof r.workspaceId !== 'string' || !r.workspaceId.trim()) return false;
  if (typeof r.membershipId !== 'string' || !r.membershipId.trim()) return false;
  if (parseStrictUtcMs(r.importedAt) === null) return false;
  if (
    typeof r.workspaceRevision !== 'number' ||
    !Number.isInteger(r.workspaceRevision) ||
    r.workspaceRevision < 1
  ) {
    return false;
  }
  if (allIdeas) {
    const matchedIdea = allIdeas.find(i => i.id === r.ideaId);
    if (!matchedIdea || matchedIdea.sha256 !== r.fileSha256) return false;
  }
  return true;
}

/**
 * Confirmed persisted #40 workspace-import receipt ONLY:
 * Marks the idea imported, begins the gentle pull-toward-cube + fade transition on that comet
 * (or immediately refreshes & replaces in reduced-motion mode), and closes the inspect hold.
 */
export function applyConfirmedCometImport(
  state: CometLifecycleState,
  receipt: PersistedImportReceipt | null | undefined,
  nowMs: number
): CometLifecycleState {
  if (!isValidWorkspaceImportReceipt(receipt, state.allIdeas)) {
    return state;
  }

  const targetId = receipt.ideaId;
  const nextImported = new Set(state.importedIds);
  nextImported.add(targetId);

  if (state.reducedMotion) {
    const remaining = state.activeComets.filter(c => c.idea.id !== targetId);
    const filled = fillCometSlots(
      state.allIdeas,
      nextImported,
      remaining,
      nowMs,
      state.rotationCursor,
      targetId
    );
    return {
      ...state,
      importedIds: nextImported,
      activeComets: filled.activeComets,
      inspectedIdeaId: state.inspectedIdeaId === targetId ? null : state.inspectedIdeaId,
      rotationCursor: filled.rotationCursor,
      lastRetiredIdeaId: targetId,
      poolSource: filled.poolSource,
      allImported: filled.allImported,
      membershipRefreshCount: state.membershipRefreshCount + 1,
      lastImportReceipt: receipt,
      lastTickMs: nowMs,
    };
  }

  const updatedComets = state.activeComets.map(slot =>
    slot.idea.id === targetId
      ? {
          ...slot,
          status: 'importing' as const,
          importPullMs: 0,
          pullToCubeProgress: 0,
        }
      : slot
  );

  const check = selectEligibleIdeaPool(state.allIdeas, {
    nowMs,
    importedIds: nextImported,
    activeIds: updatedComets.map(c => c.idea.id),
  });

  return {
    ...state,
    importedIds: nextImported,
    activeComets: updatedComets,
    inspectedIdeaId: state.inspectedIdeaId === targetId ? null : state.inspectedIdeaId,
    allImported: check.allImported,
    lastImportReceipt: receipt,
    lastTickMs: nowMs,
  };
}

/**
 * Manual next/refresh in reduced-motion mode: cycles stationary selectable items without auto-expiry.
 */
export function advanceReducedMotionPage(state: CometLifecycleState, nowMs: number): CometLifecycleState {
  const selection = selectEligibleIdeaPool(state.allIdeas, {
    nowMs,
    importedIds: state.importedIds,
    activeIds: [],
  });
  if (selection.eligible.length === 0) {
    return {
      ...state,
      activeComets: [],
      allImported: selection.allImported,
    };
  }

  const nextOffset = (state.reducedMotionOffset + MAX_ACTIVE_COMETS) % selection.eligible.length;
  const pageItems: ActiveCometSlot[] = [];
  const count = Math.min(MAX_ACTIVE_COMETS, selection.eligible.length);
  for (let i = 0; i < count; i++) {
    const item = selection.eligible[(nextOffset + i) % selection.eligible.length]!;
    pageItems.push(makeCometSlot(item, i as 0 | 1 | 2));
  }

  return {
    ...state,
    activeComets: pageItems,
    reducedMotionOffset: nextOffset,
    poolSource: selection.poolSource,
    allImported: selection.allImported,
    lastTickMs: nowMs,
  };
}

export interface IdeaVerseCometsProps {
  ideas: readonly IdeaVerseCometItem[];
  importedIds?: Iterable<string>;
  reducedMotion?: boolean;
  initialPaused?: boolean;
  now?: () => number;
  onInspectIdea?: (idea: IdeaVerseCometItem) => void;
  onRequestImport?: (idea: IdeaVerseCometItem) => Promise<{
    status: 'IMPORTED' | 'DENIED' | 'UNAVAILABLE' | 'CONFLICT' | 'FAILED';
    receipt?: PersistedImportReceipt;
    message?: string;
  }>;
  onMembershipRefreshed?: (receipt: PersistedImportReceipt) => void;
}

export const IdeaVerseComets: React.FC<IdeaVerseCometsProps> = ({
  ideas,
  importedIds,
  reducedMotion = false,
  initialPaused = false,
  now = () => Date.now(),
  onInspectIdea,
  onRequestImport,
  onMembershipRefreshed,
}) => {
  const [lifecycle, setLifecycle] = useState<CometLifecycleState>(() =>
    createCometLifecycle(ideas, {
      nowMs: now(),
      importedIds,
      paused: initialPaused,
      reducedMotion,
    })
  );
  const [importStatusState, setImportStatusState] = useState<{
    phase: 'idle' | 'pending' | 'added' | 'error';
    message: string;
  }>({ phase: 'idle', message: '' });

  useEffect(() => {
    const onVisChange = () => {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      setLifecycle(prev => setCometHiddenTab(prev, hidden, now()));
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisChange);
      return () => document.removeEventListener('visibilitychange', onVisChange);
    }
    return undefined;
  }, [now]);

  useEffect(() => {
    if (reducedMotion || lifecycle.paused || lifecycle.tabHidden) {
      return undefined;
    }
    const timer = setInterval(() => {
      setLifecycle(prev => tickCometLifecycle(prev, now()));
    }, COMET_TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, lifecycle.paused, lifecycle.tabHidden, now]);

  const inspectedIdea =
    lifecycle.inspectedIdeaId !== null
      ? lifecycle.allIdeas.find(i => i.id === lifecycle.inspectedIdeaId) ?? null
      : null;

  const handleOpenCard = (idea: IdeaVerseCometItem) => {
    setImportStatusState({ phase: 'idle', message: '' });
    setLifecycle(prev => inspectComet(prev, idea.id));
    onInspectIdea?.(idea);
  };

  const handleCloseCard = () => {
    setImportStatusState({ phase: 'idle', message: '' });
    setLifecycle(prev => closeInspectedComet(prev));
  };

  const handleAddToCube = async () => {
    if (!inspectedIdea || importStatusState.phase === 'pending' || importStatusState.phase === 'added') {
      return;
    }
    if (!onRequestImport) {
      setImportStatusState({
        phase: 'error',
        message: 'Adding to the cube requires an authorized import connection. Nothing was saved.',
      });
      return;
    }

    setImportStatusState({ phase: 'pending', message: 'Adding to the cube...' });
    try {
      const res = await onRequestImport(inspectedIdea);
      if (res.status === 'IMPORTED' && res.receipt) {
        setImportStatusState({ phase: 'added', message: 'Added to the cube.' });
        setLifecycle(prev => applyConfirmedCometImport(prev, res.receipt, now()));
        onMembershipRefreshed?.(res.receipt);
      } else {
        const reasonCopy =
          res.message ??
          (res.status === 'DENIED'
            ? 'Adding ideas requires owner access. Nothing was saved.'
            : res.status === 'UNAVAILABLE'
              ? 'FalkorDB is unavailable right now. Nothing was saved.'
              : res.status === 'CONFLICT'
                ? 'Workspace revision changed. Please retry.'
                : 'Could not save this idea. Nothing was saved.');
        setImportStatusState({ phase: 'error', message: reasonCopy });
        setLifecycle(prev => recordNonPersistedImportAttempt(prev));
      }
    } catch {
      setImportStatusState({
        phase: 'error',
        message: 'Could not confirm save. Retry reuses the request safely.',
      });
      setLifecycle(prev => recordNonPersistedImportAttempt(prev));
    }
  };

  const showAllAdded = lifecycle.allImported && lifecycle.activeComets.length === 0;

  return (
    <section
      className="ideaverse-comets-layer"
      aria-label="IdeaVerse synthetic proposal comets"
      data-testid="ideaverse-comets-layer"
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-paused={lifecycle.paused ? 'true' : 'false'}
      data-pool-source={lifecycle.poolSource}
    >
      <div className="ideaverse-controls">
        {!reducedMotion ? (
          <button
            type="button"
            className="ideaverse-pause-btn"
            data-testid="ideaverse-pause-btn"
            aria-pressed={lifecycle.paused}
            onClick={() => setLifecycle(prev => setCometPause(prev, !prev.paused, now()))}
          >
            {lifecycle.paused ? 'Resume comets' : 'Pause comets'}
          </button>
        ) : (
          <button
            type="button"
            className="ideaverse-next-btn"
            data-testid="ideaverse-next-btn"
            disabled={showAllAdded}
            onClick={() => setLifecycle(prev => advanceReducedMotionPage(prev, now()))}
          >
            Next ideas
          </button>
        )}
      </div>

      {showAllAdded ? (
        <div className="ideaverse-all-imported" role="status" data-testid="ideaverse-all-imported">
          All ideas added
        </div>
      ) : (
        <ul
          className={reducedMotion ? 'ideaverse-stationary-list' : 'ideaverse-comet-flight-list'}
          data-testid={reducedMotion ? 'ideaverse-stationary-list' : 'ideaverse-comet-flight-list'}
        >
          {lifecycle.activeComets.map(slot => {
            const isHeld = lifecycle.inspectedIdeaId === slot.idea.id;
            return (
              <li
                key={slot.idea.id}
                className={`ideaverse-comet-item status-${slot.status}${isHeld ? ' is-held' : ''}`}
                data-testid={`ideaverse-comet-${slot.idea.id}`}
                data-comet-status={slot.status}
                data-comet-held={isHeld ? 'true' : 'false'}
                data-flight-progress={slot.flightProgress}
                data-pull-progress={slot.pullToCubeProgress}
                style={
                  reducedMotion
                    ? undefined
                    : {
                        opacity: slot.opacity,
                      }
                }
              >
                <button
                  type="button"
                  className="ideaverse-comet-trigger"
                  data-testid={`ideaverse-comet-btn-${slot.idea.id}`}
                  onClick={() => handleOpenCard(slot.idea)}
                >
                  <span className="ideaverse-comet-filename">{slot.idea.filename}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {inspectedIdea && (
        <section
          className="ideaverse-inspect-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`ideaverse-card-title-${inspectedIdea.id}`}
          data-testid="ideaverse-inspect-card"
        >
          <h3 id={`ideaverse-card-title-${inspectedIdea.id}`} className="ideaverse-card-title">
            {inspectedIdea.filename}
          </h3>
          <p className="ideaverse-card-badge">
            <strong>Synthetic demo idea</strong> — fictional proposal, not verified studio or licensing evidence.
          </p>
          <dl className="ideaverse-card-meta">
            <div>
              <dt>Submitted</dt>
              <dd data-testid="ideaverse-card-submitted">{formatUtcDateLabel(inspectedIdea.submittedAt)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd data-testid="ideaverse-card-touched">{formatUtcDateLabel(inspectedIdea.touchedAt)}</dd>
            </div>
          </dl>
          <p className="ideaverse-card-body" data-testid="ideaverse-card-text">
            {inspectedIdea.text}
          </p>
          {importStatusState.message && (
            <div className="ideaverse-card-status" role="status" data-testid="ideaverse-card-status">
              {importStatusState.message}
            </div>
          )}
          <div className="ideaverse-card-actions">
            <button
              type="button"
              className="ideaverse-card-add-btn"
              data-testid="ideaverse-card-add-btn"
              disabled={importStatusState.phase === 'pending' || importStatusState.phase === 'added'}
              onClick={handleAddToCube}
            >
              {importStatusState.phase === 'added'
                ? 'Added'
                : importStatusState.phase === 'pending'
                  ? 'Adding...'
                  : 'Add to cube'}
            </button>
            <button
              type="button"
              className="ideaverse-card-close-btn"
              data-testid="ideaverse-card-close-btn"
              onClick={handleCloseCard}
            >
              Close
            </button>
          </div>
        </section>
      )}
    </section>
  );
};
