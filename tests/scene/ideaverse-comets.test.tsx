import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COMET_FLIGHT_DURATION_MS,
  COMET_IMPORT_PULL_DURATION_MS,
  COMET_INITIAL_OPACITY,
  IDEAVERSE_MANIFEST_VERSION,
  IDEAVERSE_REFERENCE_NOW_ISO,
  IdeaVerseComets,
  MAX_ACTIVE_COMETS,
  MAX_TICK_CLAMP_MS,
  RECENT_WINDOW_MS,
  UNCONFIRMED_IMPORT_MESSAGE,
  advanceCometActiveClock,
  advanceReducedMotionPage,
  applyConfirmedCometImport,
  closeInspectedComet,
  createCometLifecycle,
  inspectComet,
  isValidWorkspaceImportReceipt,
  recordNonPersistedImportAttempt,
  selectEligibleIdeaPool,
  setCometHiddenTab,
  setCometPause,
  tickCometLifecycle,
  verifyOverviewReceiptMatch,
  type CometLifecycleState,
  type IdeaVerseCometItem,
  type PersistedImportReceipt,
} from '../../apps/web/src/scene/IdeaVerseComets';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = join(REPO_ROOT, 'graph/seed/ideaverse/manifest.json');
const FILES_DIR = join(REPO_ROOT, 'graph/seed/ideaverse/files');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,80}\.txt$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function loadRepoManifestItems(): IdeaVerseCometItem[] {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(raw) as {
    version: string;
    ideas: Array<{
      id: string;
      filename: string;
      path: string;
      byteCount: number;
      sha256: string;
      submittedAt: string;
      touchedAt: string;
      synthetic: true;
      origin: string;
      licenseStatus: string;
    }>;
  };
  return parsed.ideas.map(entry => {
    const fileBytes = readFileSync(join(REPO_ROOT, entry.path));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(fileBytes).trim();
    return {
      ...entry,
      text,
    };
  });
}

test('manifest & 100 files: exact 100 UTF-8 files, 20-30 words each, exact hashes/byteCounts and Claude loader compatibility', () => {
  const rawManifestBytes = readFileSync(MANIFEST_PATH);
  const manifestSha256 = createHash('sha256').update(rawManifestBytes).digest('hex');
  assert.equal(
    manifestSha256,
    '85209bd70ee02f779f907addadd704a84e7867f0f77b3f4f187ecba4e5a41994',
    'manifest.json SHA-256 matches exact committed asset pack'
  );
  const doc = JSON.parse(rawManifestBytes.toString('utf8')) as {
    version: unknown;
    ideas: Array<Record<string, unknown>>;
  };

  assert.equal(doc.version, IDEAVERSE_MANIFEST_VERSION);
  assert.ok(Array.isArray(doc.ideas));
  assert.equal(doc.ideas.length, 100, 'manifest must contain exactly 100 ideas');
  assert.equal(doc.ideas[0]?.filename, 'idea-001-midnight-reel-archive.txt');

  const diskFiles = readdirSync(FILES_DIR).filter(f => f.endsWith('.txt'));
  assert.equal(diskFiles.length, 100, 'files directory must contain exactly 100 .txt files');

  const seenIds = new Set<string>();
  const seenFilenames = new Set<string>();

  for (const entry of doc.ideas) {
    const {
      id,
      filename,
      path,
      byteCount,
      sha256,
      submittedAt,
      touchedAt,
      synthetic,
      origin,
      licenseStatus,
    } = entry;

    assert.equal(typeof id, 'string');
    assert.ok(ID_RE.test(id as string), `valid id format: ${String(id)}`);
    assert.ok(!seenIds.has(id as string), `unique id: ${String(id)}`);
    seenIds.add(id as string);

    assert.equal(typeof filename, 'string');
    assert.ok(FILENAME_RE.test(filename as string), `valid filename format: ${String(filename)}`);
    assert.ok(!seenFilenames.has(filename as string), `unique filename: ${String(filename)}`);
    seenFilenames.add(filename as string);

    assert.equal(path, `graph/seed/ideaverse/files/${String(filename)}`);
    assert.equal(synthetic, true);
    assert.equal(typeof origin, 'string');
    assert.ok((origin as string).length > 0);
    assert.equal(typeof licenseStatus, 'string');
    assert.ok((licenseStatus as string).length > 0);

    assert.equal(typeof submittedAt, 'string');
    assert.equal(typeof touchedAt, 'string');
    assert.ok(UTC_RE.test(submittedAt as string) && !Number.isNaN(Date.parse(submittedAt as string)));
    assert.ok(UTC_RE.test(touchedAt as string) && !Number.isNaN(Date.parse(touchedAt as string)));

    const fileBytes = readFileSync(join(REPO_ROOT, path as string));
    assert.equal(fileBytes.length, byteCount, `byteCount matches for ${String(id)}`);
    const actualSha = createHash('sha256').update(fileBytes).digest('hex');
    assert.equal(actualSha, sha256, `sha256 matches for ${String(id)}`);

    const text = new TextDecoder('utf-8', { fatal: true }).decode(fileBytes);
    assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text), `no control chars in ${String(id)}`);

    const words = text.trim().split(/\s+/).filter(Boolean);
    assert.ok(
      words.length >= 20 && words.length <= 30,
      `${String(id)} must have 20-30 words, got ${words.length}`
    );
  }
});

test('selection: 48h boundary inclusion, active/imported exclusion before fallback, and newest-timestamp fallback', () => {
  const nowMs = Date.parse(IDEAVERSE_REFERENCE_NOW_ISO); // 2026-10-15T20:00:00Z
  const exactBoundaryIso = new Date(nowMs - RECENT_WINDOW_MS).toISOString(); // 2026-10-13T20:00:00.000Z
  const oneMsBeforeBoundaryIso = new Date(nowMs - RECENT_WINDOW_MS - 1).toISOString();
  const futureIso = new Date(nowMs + 60_000).toISOString();

  const makeItem = (id: string, touchedAt: string, imported = false): IdeaVerseCometItem => ({
    id,
    filename: `${id}.txt`,
    sha256: 'a'.repeat(64),
    submittedAt: '2026-10-10T09:00:00Z',
    touchedAt,
    synthetic: true,
    text: 'A fictional camera operator tests anamorphic flares across rain-soaked cobblestones outside Stage Four during a midnight rehearsal.',
    imported,
  });

  const sample: IdeaVerseCometItem[] = [
    makeItem('idea-recent-b', '2026-10-15T18:00:00Z'),
    makeItem('idea-recent-a', '2026-10-15T18:00:00Z'), // same timestamp -> tie-break by id ascending
    makeItem('idea-boundary', exactBoundaryIso), // exact 48h boundary -> INCLUDED in recent pool
    makeItem('idea-old-1', oneMsBeforeBoundaryIso), // 1ms older than 48h -> excluded while recent exists
    makeItem('idea-old-2', '2026-10-05T12:00:00Z'),
    makeItem('idea-future', futureIso), // future -> always skipped
  ];

  // 1. Recent pool includes exact 48h boundary and tie-breaks deterministically by ID
  const sel1 = selectEligibleIdeaPool(sample, { nowMs });
  assert.equal(sel1.poolSource, 'recent-48h');
  assert.equal(sel1.allImported, false);
  assert.deepEqual(
    sel1.eligible.map(i => i.id),
    ['idea-recent-a', 'idea-recent-b', 'idea-boundary']
  );

  // 2. When all recent items are either imported or currently visible, falls back to newest valid past timestamps
  const selFallback = selectEligibleIdeaPool(sample, {
    nowMs,
    importedIds: ['idea-recent-a', 'idea-recent-b'],
    activeIds: ['idea-boundary'],
  });
  assert.equal(selFallback.poolSource, 'newest-fallback');
  assert.equal(selFallback.allImported, false, 'must NOT claim all ideas imported while old unimported ideas remain');
  assert.deepEqual(
    selFallback.eligible.map(i => i.id),
    ['idea-old-1', 'idea-old-2']
  );

  // 3. Only when every valid past idea is imported does allImported become true
  const selAllImported = selectEligibleIdeaPool(sample, {
    nowMs,
    importedIds: ['idea-recent-a', 'idea-recent-b', 'idea-boundary', 'idea-old-1', 'idea-old-2'],
  });
  assert.equal(selAllImported.allImported, true);
  assert.equal(selAllImported.eligible.length, 0);
});

test('lifecycle: 60s active flight expiry, inspect hold/resume, global & hidden-tab pause without burst, and fewer-than-3 pool', () => {
  const items = loadRepoManifestItems();
  const startMs = Date.parse(IDEAVERSE_REFERENCE_NOW_ISO);

  let state = createCometLifecycle(items, { nowMs: startMs });
  assert.equal(state.activeComets.length, MAX_ACTIVE_COMETS);
  const initialIds = state.activeComets.map(c => c.idea.id);
  assert.equal(new Set(initialIds).size, 3, 'no duplicate active comets');

  // Advance 30 seconds: all 3 comets are halfway through their 60s flight
  state = advanceCometActiveClock(state, startMs + 30_000);
  assert.ok(state.activeComets.every(c => c.activeFlightMs === 30_000 && c.flightProgress === 0.5));

  // Open inspect card on the first comet: holds that comet and pauses its expiry
  const heldId = initialIds[0]!;
  state = inspectComet(state, heldId);
  assert.equal(state.inspectedIdeaId, heldId);

  // Advance another 35 seconds (total 65s): the 2 uninspected comets expire at 60s and are replaced,
  // while the held comet remains at 30,000ms of flight!
  state = advanceCometActiveClock(state, startMs + 65_000);
  const heldSlot = state.activeComets.find(c => c.idea.id === heldId);
  assert.ok(heldSlot, 'held comet must not expire while its card is open');
  assert.equal(heldSlot!.activeFlightMs, 30_000);
  const otherIds = state.activeComets.filter(c => c.idea.id !== heldId).map(c => c.idea.id);
  assert.equal(otherIds.length, 2);
  assert.ok(!otherIds.includes(initialIds[1]!) && !otherIds.includes(initialIds[2]!), 'expired comets replaced');

  // Close the card: held comet resumes its remaining 30s lifetime
  state = closeInspectedComet(state);
  assert.equal(state.inspectedIdeaId, null);

  // Global pause and hidden-tab pause do not accumulate a burst of elapsed spawns
  state = setCometPause(state, true, startMs + 65_000);
  state = tickCometLifecycle(state, startMs + 300_000); // 235s while paused
  assert.equal(state.activeComets.find(c => c.idea.id === heldId)?.activeFlightMs, 30_000);
  state = setCometPause(state, false, startMs + 300_000);

  state = setCometHiddenTab(state, true, startMs + 300_000);
  state = tickCometLifecycle(state, startMs + 600_000); // 300s while tab hidden
  assert.equal(state.activeComets.find(c => c.idea.id === heldId)?.activeFlightMs, 30_000);
  state = setCometHiddenTab(state, false, startMs + 600_000);

  // Advance 30s of active unpaused flight: the resumed comet finishes its remaining 30s (30s + 30s = 60s) and retires
  state = advanceCometActiveClock(state, startMs + 600_000 + 30_000);
  assert.ok(!state.activeComets.some(c => c.idea.id === heldId), 'resumed comet retires after remaining lifetime');

  // When only 2 unimported ideas exist, shows 2 comets rather than duplicating
  const twoOnly = items.slice(0, 2);
  const twoState = createCometLifecycle(twoOnly, { nowMs: startMs });
  assert.equal(twoState.activeComets.length, 2);
});

test('import transition: only confirmed persisted receipt triggers pull-to-cube + fade + replacement; failures preserve comet', () => {
  const items = loadRepoManifestItems().slice(0, 5);
  const startMs = Date.parse(IDEAVERSE_REFERENCE_NOW_ISO);

  let state = createCometLifecycle(items, { nowMs: startMs });
  const targetId = state.activeComets[0]!.idea.id;
  const targetSha256 = state.activeComets[0]!.idea.sha256;
  assert.equal(state.activeComets[0]!.opacity, COMET_INITIAL_OPACITY);
  assert.ok(COMET_INITIAL_OPACITY > 0, 'newly spawned comets start with visible opacity');

  // Inspection and failed/denied/outage attempts never import or start the pull transition
  state = inspectComet(state, targetId);
  state = recordNonPersistedImportAttempt(state);
  state = applyConfirmedCometImport(state, null, startMs + 1_000);
  assert.equal(state.importedIds.has(targetId), false);
  assert.equal(state.activeComets.find(c => c.idea.id === targetId)?.status, 'flying');

  // Fabricated witnessHash/nodeId/edgeId or mismatched sha256 is rejected
  const fabricatedWitnessReceipt = {
    ideaId: targetId,
    sha256: targetSha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
    witnessHash: 'f'.repeat(64),
  };
  assert.equal(isValidWorkspaceImportReceipt(fabricatedWitnessReceipt, items), false);
  state = applyConfirmedCometImport(
    state,
    fabricatedWitnessReceipt as unknown as PersistedImportReceipt,
    startMs + 1_500
  );
  assert.equal(state.importedIds.has(targetId), false);

  // Empty sha256 or whitespace is strictly rejected (#40/#48/v030)
  assert.equal(
    isValidWorkspaceImportReceipt(
      {
        ideaId: targetId,
        sha256: '',
        workspaceId: 'ws-wad-cube',
        importedAt: '2026-10-15T20:00:02.000Z',
        workspaceRevision: 1,
        membershipId: `member-ws-wad-cube-${targetId}`,
      },
      items
    ),
    false,
    'empty sha256 is rejected'
  );

  assert.equal(
    isValidWorkspaceImportReceipt(
      {
        ideaId: targetId,
        sha256: '   ',
        workspaceId: 'ws-wad-cube',
        importedAt: '2026-10-15T20:00:02.000Z',
        workspaceRevision: 1,
        membershipId: `member-ws-wad-cube-${targetId}`,
      },
      items
    ),
    false,
    'whitespace sha256 is rejected'
  );

  // fileSha256 alias is strictly rejected (#40/#48/v030)
  const aliasReceipt = {
    ideaId: targetId,
    fileSha256: targetSha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
  };
  assert.equal(isValidWorkspaceImportReceipt(aliasReceipt, items), false, 'fileSha256 alias must be rejected');

  const dualHashReceipt = {
    ideaId: targetId,
    sha256: targetSha256,
    fileSha256: targetSha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
  };
  assert.equal(isValidWorkspaceImportReceipt(dualHashReceipt, items), false, 'receipt carrying fileSha256 must be rejected');

  // Padded sha256 is strictly rejected (no padding allowed)
  const paddedSha256Receipt = {
    ideaId: targetId,
    sha256: ` ${targetSha256} `,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
  };
  assert.equal(isValidWorkspaceImportReceipt(paddedSha256Receipt, items), false, 'padded sha256 must be rejected');

  // Unknown extra fields (receiptId, replayed, idempotencyKey) are strictly rejected (#40/#48/v030)
  const extraFieldsReceipt = {
    ideaId: targetId,
    sha256: targetSha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
    receiptId: 'rcpt-123',
    replayed: false,
    idempotencyKey: 'idem-123',
  };
  assert.equal(isValidWorkspaceImportReceipt(extraFieldsReceipt, items), false, 'receipt with extra fields must be rejected');

  // Confirmed persisted canonical workspace-import receipt produced by Claude's 366eb56 loader
  // Contract: exactly { ideaId, sha256, workspaceId, importedAt, workspaceRevision, membershipId }
  const realClaudeReceipt: PersistedImportReceipt = {
    ideaId: targetId,
    sha256: targetSha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
  };
  assert.equal(isValidWorkspaceImportReceipt(realClaudeReceipt, items), true, 'real Claude 366eb56 receipt passes');
  state = applyConfirmedCometImport(state, realClaudeReceipt, startMs + 2_000);
  assert.equal(state.importedIds.has(targetId), true);
  assert.equal(state.inspectedIdeaId, null);
  assert.equal(state.activeComets.find(c => c.idea.id === targetId)?.status, 'importing');

  // Halfway through pull transition: comet is pulling toward cube and fading
  state = tickCometLifecycle(state, startMs + 2_000 + COMET_IMPORT_PULL_DURATION_MS / 2);
  const pulling = state.activeComets.find(c => c.idea.id === targetId);
  assert.ok(pulling && pulling.pullToCubeProgress === 0.5 && pulling.opacity === 0.5);

  // Completion of pull transition: refreshes membership count, removes imported comet, and spawns replacement
  state = tickCometLifecycle(state, startMs + 2_000 + COMET_IMPORT_PULL_DURATION_MS);
  assert.equal(state.membershipRefreshCount, 1);
  assert.ok(!state.activeComets.some(c => c.idea.id === targetId));
  assert.equal(state.activeComets.length, 3);
});

test('reduced-motion & all-imported markup: stationary list, manual next cycling, and calm all-added state', () => {
  const items = loadRepoManifestItems().slice(0, 6);
  const startMs = Date.parse(IDEAVERSE_REFERENCE_NOW_ISO);

  // Reduced-motion state does not advance or expire on tickCometLifecycle
  let rmState = createCometLifecycle(items, { nowMs: startMs, reducedMotion: true });
  const firstPageIds = rmState.activeComets.map(c => c.idea.id);
  rmState = tickCometLifecycle(rmState, startMs + 120_000);
  assert.deepEqual(rmState.activeComets.map(c => c.idea.id), firstPageIds);

  // Manual next cycles to the next 3 stationary items
  rmState = advanceReducedMotionPage(rmState, startMs + 120_000);
  const secondPageIds = rmState.activeComets.map(c => c.idea.id);
  assert.notDeepEqual(secondPageIds, firstPageIds);

  // Render normal mode vs reduced-motion mode vs all-imported mode
  const normalHtml = renderToStaticMarkup(<IdeaVerseComets ideas={items} reducedMotion={false} />);
  assert.ok(normalHtml.includes('data-testid="ideaverse-comet-flight-list"'));
  assert.ok(normalHtml.includes('data-testid="ideaverse-pause-btn"'));
  assert.ok(normalHtml.includes(`opacity:${COMET_INITIAL_OPACITY}`), 'mounted comets render with visible opacity');

  const reducedHtml = renderToStaticMarkup(<IdeaVerseComets ideas={items} reducedMotion={true} />);
  assert.ok(reducedHtml.includes('data-testid="ideaverse-stationary-list"'));
  assert.ok(reducedHtml.includes('data-testid="ideaverse-next-btn"'));

  const allImportedHtml = renderToStaticMarkup(
    <IdeaVerseComets ideas={items} importedIds={items.map(i => i.id)} reducedMotion={false} />
  );
  assert.ok(allImportedHtml.includes('data-testid="ideaverse-all-imported"'));
  assert.ok(allImportedHtml.includes('All ideas added'));
});

test('clock jump clamp: a 90-second clock jump is clamped to 1000ms so it does not retire all three comets', () => {
  const items = loadRepoManifestItems().slice(0, 10);
  const startMs = Date.parse(IDEAVERSE_REFERENCE_NOW_ISO);

  let state = createCometLifecycle(items, { nowMs: startMs });
  assert.equal(state.activeComets.length, 3);
  const initialIds = state.activeComets.map(c => c.idea.id);

  // Jump clock by 90 seconds (90,000ms) in a single tick
  // Without clamp, all 3 comets would exceed 60,000ms flight duration and be retired at once.
  // With MAX_TICK_CLAMP_MS (1,000ms), elapsed time is clamped to at most 1s:
  state = tickCometLifecycle(state, startMs + 90_000);

  assert.equal(state.activeComets.length, 3);
  const survivingIds = state.activeComets.map(c => c.idea.id);
  assert.deepEqual(survivingIds, initialIds, 'none of the 3 comets are retired on a 90s clock jump');
  assert.ok(
    state.activeComets.every(c => c.activeFlightMs === MAX_TICK_CLAMP_MS),
    `all comets advanced by clamped ${MAX_TICK_CLAMP_MS}ms, not 90,000ms`
  );
});

test('server read-back verification: shape+hash is not proof of Added; fresh ideaverseOverview read-back gates confirmation', () => {
  const items = loadRepoManifestItems().slice(0, 5);
  const idea = items[0]!;
  const realClaudeReceipt: PersistedImportReceipt = {
    ideaId: idea.id,
    sha256: idea.sha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${idea.id}`,
  };

  // 1. Clean overview with exactly one matching receipt:
  const validOverview = {
    status: 'AVAILABLE',
    ideas: [
      { id: idea.id, imported: true, sha256: idea.sha256, membershipId: `member-ws-wad-cube-${idea.id}` },
      { id: items[1]!.id, imported: false, sha256: items[1]!.sha256 },
    ],
    integrity: [],
  };
  const verifiedMatch = verifyOverviewReceiptMatch(realClaudeReceipt, validOverview);
  assert.equal(verifiedMatch.verified, true);
  assert.equal(verifiedMatch.matchingReceiptCount, 1);

  // 2. Overview with integrity issue (forged or mismatched) refuses:
  const integrityFailOverview = {
    status: 'AVAILABLE',
    ideas: [],
    integrity: [{ id: idea.id, reason: 'membership edge without an import receipt' }],
  };
  const integrityMatch = verifyOverviewReceiptMatch(realClaudeReceipt, integrityFailOverview);
  assert.equal(integrityMatch.verified, false);
  assert.ok(integrityMatch.reason?.includes(UNCONFIRMED_IMPORT_MESSAGE));

  // 3. Overview where idea is not marked imported (zero matching receipts):
  const zeroMatchOverview = {
    status: 'AVAILABLE',
    ideas: [{ id: idea.id, imported: false, sha256: idea.sha256 }],
    integrity: [],
  };
  const zeroMatch = verifyOverviewReceiptMatch(realClaudeReceipt, zeroMatchOverview);
  assert.equal(zeroMatch.verified, false);
  assert.ok(zeroMatch.reason?.includes(UNCONFIRMED_IMPORT_MESSAGE));

  // 4. Overview with duplicate matching receipts:
  const dupOverview = {
    status: 'AVAILABLE',
    ideas: [
      { id: idea.id, imported: true, sha256: idea.sha256, membershipId: `member-ws-wad-cube-${idea.id}` },
      { id: idea.id, imported: true, sha256: idea.sha256, membershipId: `member-ws-wad-cube-${idea.id}` },
    ],
    integrity: [],
  };
  const dupMatch = verifyOverviewReceiptMatch(realClaudeReceipt, dupOverview);
  assert.equal(dupMatch.verified, false);
  assert.equal(dupMatch.matchingReceiptCount, 2);
  assert.ok(dupMatch.reason?.includes(UNCONFIRMED_IMPORT_MESSAGE));

  // 5. Overview unavailable:
  const unavailOverview = { status: 'UNAVAILABLE' };
  const unavailMatch = verifyOverviewReceiptMatch(realClaudeReceipt, unavailOverview);
  assert.equal(unavailMatch.verified, false);
  assert.ok(unavailMatch.reason?.includes(UNCONFIRMED_IMPORT_MESSAGE));
});

test('single-card scene boundary: IdeaVerseComets omits duplicate card UI, holds comet on inspect, and animates confirmed event', () => {
  const items = loadRepoManifestItems().slice(0, 5);
  const targetId = items[0]!.id;

  // Ruled copy string requirement:
  assert.equal(
    UNCONFIRMED_IMPORT_MESSAGE,
    'Could not confirm whether this was saved. Re-check the cube before retrying.'
  );

  // 1. Scene renders comet motion & controls only; zero duplicate card UI or local submit buttons:
  const html = renderToStaticMarkup(<IdeaVerseComets ideas={items} />);
  assert.ok(html.includes('data-testid="ideaverse-comets-layer"'));
  assert.ok(!html.includes('data-testid="ideaverse-inspect-card"'), 'scene does NOT render duplicate inspect card');
  assert.ok(!html.includes('data-testid="ideaverse-card-add-btn"'), 'scene does NOT render local add button');
  assert.ok(!html.includes('Nothing was saved'), 'scene eliminates all Nothing was saved copy');

  // 2. Confirmed event triggers pull-toward-cube transition:
  const realReceipt: PersistedImportReceipt = {
    ideaId: targetId,
    sha256: items[0]!.sha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
  };

  const importingHtml = renderToStaticMarkup(
    <IdeaVerseComets ideas={items} confirmedReceipt={realReceipt} />
  );
  assert.ok(importingHtml.includes(`data-testid="ideaverse-comet-${targetId}"`));
  assert.ok(importingHtml.includes('status-importing'));
});

test('mounted component with default clock: confirmed receipt advances through pull and leaves importing state without stuck loop (#40/#48)', async () => {
  const previousEnv = (global as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  (global as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  class MockDOMNode {
    nodeName = 'DIV';
    tagName = 'DIV';
    nodeType = 1;
    children: MockDOMNode[] = [];
    childNodes = this.children;
    style: Record<string, unknown> = {};
    attributes: Record<string, string> = {};
    ownerDocument: unknown = global.document;
    appendChild(child: MockDOMNode) { this.children.push(child); return child; }
    removeChild(child: MockDOMNode) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      return child;
    }
    insertBefore(child: MockDOMNode, ref: MockDOMNode) {
      const idx = this.children.indexOf(ref);
      if (idx === -1) this.children.push(child);
      else this.children.splice(idx, 0, child);
      return child;
    }
    setAttribute(k: string, v: unknown) { this.attributes[k] = String(v); }
    removeAttribute(k: string) { delete this.attributes[k]; }
    getAttribute(k: string) { return this.attributes[k]; }
    addEventListener() {}
    removeEventListener() {}
  }

  const prevDoc = global.document;
  const prevWin = global.window;
  const prevIFrame = (global as unknown as { HTMLIFrameElement?: unknown }).HTMLIFrameElement;
  const prevElem = global.Element;
  const prevNode = global.Node;

  (global as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement = class HTMLIFrameElement extends MockDOMNode {};
  (global as unknown as { HTMLElement: unknown }).HTMLElement = class HTMLElement extends MockDOMNode {};
  global.Element = MockDOMNode as unknown as typeof Element;
  global.Node = MockDOMNode as unknown as typeof Node;

  global.document = {
    createElement: () => new MockDOMNode(),
    createElementNS: () => new MockDOMNode(),
    createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text, textContent: text, ownerDocument: global.document }) as unknown as Text,
    addEventListener: () => {},
    removeEventListener: () => {},
    nodeType: 9,
    defaultView: global,
    activeElement: null,
  } as unknown as Document;
  global.window = global as unknown as Window & typeof globalThis;

  try {
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');

    const items = loadRepoManifestItems().slice(0, 5);
    const targetId = items[0]!.id;
    const realReceipt: PersistedImportReceipt = {
      ideaId: targetId,
      sha256: items[0]!.sha256,
      workspaceId: 'ws-wad-cube',
      membershipId: `member-ws-wad-cube-${targetId}`,
      importedAt: '2026-10-15T20:00:02.000Z',
      workspaceRevision: 1,
    };

    function findAllWithAttr(node: MockDOMNode, attr: string): MockDOMNode[] {
      const result: MockDOMNode[] = [];
      if (node.attributes && node.attributes[attr]) result.push(node);
      for (const ch of node.children) {
        result.push(...findAllWithAttr(ch, attr));
      }
      return result;
    }

    const container = new MockDOMNode();
    const root = createRoot(container as unknown as HTMLElement);

    let refreshedReceipt: PersistedImportReceipt | null = null;
    await act(async () => {
      // NOTE: now prop is deliberately omitted so the production default now = () => Date.now() is exercised!
      root.render(
        <IdeaVerseComets
          ideas={items}
          confirmedReceipt={realReceipt}
          onMembershipRefreshed={r => { refreshedReceipt = r; }}
        />
      );
    });

    // 1. Immediately upon mount: confirmedReceipt starts transition in status 'importing'
    const cometImmediate = findAllWithAttr(container, 'data-testid').find(
      n => n.attributes['data-testid'] === `ideaverse-comet-${targetId}`
    );
    assert.ok(cometImmediate, 'target comet exists immediately after mount');
    assert.equal(cometImmediate.attributes['data-comet-status'], 'importing');
    assert.ok(refreshedReceipt);

    // 2. Wait 1.4s (exceeding COMET_IMPORT_PULL_DURATION_MS = 900ms) with default live clock running
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1400));
    });

    // 3. Comet has left 'importing' status and has retired or been replaced (NOT stuck at pull=0!)
    const cometAfter = findAllWithAttr(container, 'data-testid').find(
      n => n.attributes['data-testid'] === `ideaverse-comet-${targetId}`
    );
    assert.ok(
      !cometAfter || cometAfter.attributes['data-comet-status'] !== 'importing',
      'target comet successfully leaves importing state and does not stay stuck'
    );

    await act(async () => {
      root.unmount();
    });
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    (global as unknown as { HTMLIFrameElement: unknown }).HTMLIFrameElement = prevIFrame;
    global.Element = prevElem;
    global.Node = prevNode;
    (global as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previousEnv;
  }
});
