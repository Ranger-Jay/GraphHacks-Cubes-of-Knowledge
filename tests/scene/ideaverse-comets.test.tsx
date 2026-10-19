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
  IDEAVERSE_MANIFEST_VERSION,
  IDEAVERSE_REFERENCE_NOW_ISO,
  IdeaVerseComets,
  MAX_ACTIVE_COMETS,
  RECENT_WINDOW_MS,
  advanceReducedMotionPage,
  applyConfirmedCometImport,
  closeInspectedComet,
  createCometLifecycle,
  inspectComet,
  recordNonPersistedImportAttempt,
  selectEligibleIdeaPool,
  setCometHiddenTab,
  setCometPause,
  tickCometLifecycle,
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
  const doc = JSON.parse(rawManifestBytes.toString('utf8')) as {
    version: unknown;
    ideas: Array<Record<string, unknown>>;
  };

  assert.equal(doc.version, IDEAVERSE_MANIFEST_VERSION);
  assert.ok(Array.isArray(doc.ideas));
  assert.equal(doc.ideas.length, 100, 'manifest must contain exactly 100 ideas');

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
  state = tickCometLifecycle(state, startMs + 30_000);
  assert.ok(state.activeComets.every(c => c.activeFlightMs === 30_000 && c.flightProgress === 0.5));

  // Open inspect card on the first comet: holds that comet and pauses its expiry
  const heldId = initialIds[0]!;
  state = inspectComet(state, heldId);
  assert.equal(state.inspectedIdeaId, heldId);

  // Advance another 35 seconds (total 65s): the 2 uninspected comets expire at 60s and are replaced,
  // while the held comet remains at 30,000ms of flight!
  state = tickCometLifecycle(state, startMs + 65_000);
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
  state = tickCometLifecycle(state, startMs + 600_000 + 30_000);
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

  // Inspection and failed/denied/outage attempts never import or start the pull transition
  state = inspectComet(state, targetId);
  state = recordNonPersistedImportAttempt(state);
  state = applyConfirmedCometImport(state, null, startMs + 1_000);
  assert.equal(state.importedIds.has(targetId), false);
  assert.equal(state.activeComets.find(c => c.idea.id === targetId)?.status, 'flying');

  // Confirmed persisted receipt starts gentle pull toward cube + fade
  const receipt: PersistedImportReceipt = {
    ideaId: targetId,
    sha256: state.activeComets[0]!.idea.sha256,
    workspaceId: 'ws-wad-cube',
    importedAt: '2026-10-15T20:00:02.000Z',
    workspaceRevision: 1,
    membershipId: `member-ws-wad-cube-${targetId}`,
  };
  state = applyConfirmedCometImport(state, receipt, startMs + 2_000);
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

  const reducedHtml = renderToStaticMarkup(<IdeaVerseComets ideas={items} reducedMotion={true} />);
  assert.ok(reducedHtml.includes('data-testid="ideaverse-stationary-list"'));
  assert.ok(reducedHtml.includes('data-testid="ideaverse-next-btn"'));

  const allImportedHtml = renderToStaticMarkup(
    <IdeaVerseComets ideas={items} importedIds={items.map(i => i.id)} reducedMotion={false} />
  );
  assert.ok(allImportedHtml.includes('data-testid="ideaverse-all-imported"'));
  assert.ok(allImportedHtml.includes('All ideas added'));
});
