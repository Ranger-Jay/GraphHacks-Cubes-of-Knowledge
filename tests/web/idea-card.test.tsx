import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdeaCardView } from '../../apps/web/src/studio/IdeaCard';
import {
  IMPORT_FAILURE_COPY, IMPORT_UNBOUND_COPY, formatUtcDate, importReducer, initialImportState, isCloseKey,
  type IdeaSummary, type ImportOutcome, type ImportReceipt, type ImportState,
} from '../../apps/web/src/studio/ideaImport';

// Dev/unit fixtures only: an invented fictional idea, not a manifest row and not evidence.
const idea: IdeaSummary = {
  id: 'idea-fixture-001', filename: 'fixture-idea.txt', submittedAt: '2026-10-14T03:30:00Z', touchedAt: '2026-10-15T22:05:00Z',
  text: 'A fictional fixture idea used only by the unit tests.',
};
const receipt: ImportReceipt = { ideaId: idea.id, fileHash: 'f'.repeat(64), workspaceId: 'ws', importedAt: '2026-10-15T23:00:00Z', workspaceRevision: 2, membershipId: 'm1' };
const view = (state: ImportState, bound = true) =>
  renderToStaticMarkup(<IdeaCardView idea={idea} state={state} bound={bound} onAdd={() => {}} onClose={() => {}} titleId="t" bodyId="b" />);
const FAILURES: Array<Exclude<ImportOutcome['kind'], 'persisted'>> = ['denied', 'unavailable', 'conflict', 'ambiguous', 'failed'];

test('card: inspection shows filename, both dates, the synthetic tag and the text, and never imports', () => {
  const html = view(initialImportState);
  for (const t of ['fixture-idea.txt', '2026-10-14 UTC', '2026-10-15 UTC', 'Synthetic demo idea', 'not a verified fact', idea.text, 'Add to cube', 'Close']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('role="dialog"') && html.includes('aria-labelledby="t"') && html.includes('aria-describedby="b"'));
  assert.ok(html.includes('data-import-phase="idle"'));
  assert.ok(!html.includes('Added') && !html.includes('disabled'));
});

test('card: unbound adapter disables Add and says so (the shell binds none today)', () => {
  const html = view(initialImportState, false);
  assert.ok(html.includes(IMPORT_UNBOUND_COPY));
  assert.match(html, /<button[^>]*class="idea-card-add"[^>]*disabled/);
});

test('reducer: submit -> pending disables repeated submits; persisted receipt -> added', () => {
  const p = importReducer(initialImportState, { type: 'submit' });
  assert.equal(p.phase, 'pending');
  assert.equal(importReducer(p, { type: 'submit' }), p, 'repeated submit ignored while pending');
  const html = view(p);
  assert.match(html, /<button[^>]*class="idea-card-add"[^>]*disabled/);
  assert.ok(html.includes('aria-busy="true"') && html.includes('Adding to the cube...'));
  const a = importReducer(p, { type: 'settled', requestId: p.requestId, outcome: { kind: 'persisted', receipt } });
  assert.equal(a.phase, 'added');
  assert.equal(importReducer(a, { type: 'submit' }), a, 'no second submit after added');
  assert.ok(view(a).includes('Added to the cube.'));
});

test('reducer: every non-persisted outcome is an error with its own honest copy and never "added"', () => {
  for (const kind of FAILURES) {
    const p = importReducer(initialImportState, { type: 'submit' });
    const e = importReducer(p, { type: 'settled', requestId: p.requestId, outcome: { kind } });
    assert.equal(e.phase, 'error', kind);
    const html = view(e);
    assert.ok(html.includes(IMPORT_FAILURE_COPY[kind].replace(/'/g, '&#x27;')) || html.includes(IMPORT_FAILURE_COPY[kind]), kind);
    assert.ok(!html.includes('Added to the cube.'), kind);
    assert.ok(html.includes('Retry Add to cube'), 'card preserved for retry');
    assert.notEqual(importReducer(e, { type: 'submit' }).phase, 'error', 'retry allowed');
  }
  for (const kind of ['denied', 'unavailable', 'failed'] as const) assert.match(IMPORT_FAILURE_COPY[kind], /Nothing was saved/);
});

test('reducer: a completion for a stale request, after reset, or outside pending is discarded', () => {
  const p = importReducer(initialImportState, { type: 'submit' });
  const reset = importReducer(p, { type: 'reset' });
  assert.equal(reset.phase, 'idle');
  assert.equal(importReducer(reset, { type: 'settled', requestId: p.requestId, outcome: { kind: 'persisted', receipt } }), reset, 'late success after reset ignored');
  const p2 = importReducer(reset, { type: 'submit' });
  assert.equal(importReducer(p2, { type: 'settled', requestId: p.requestId, outcome: { kind: 'persisted', receipt } }), p2, 'old request id ignored');
  assert.equal(importReducer(initialImportState, { type: 'settled', requestId: 0, outcome: { kind: 'persisted', receipt } }).phase, 'idle', 'no success without a submit');
});

test('helpers: deterministic UTC dates, invalid input safe, only Escape closes', () => {
  assert.equal(formatUtcDate('2026-10-14T23:59:59Z'), '2026-10-14 UTC');
  assert.equal(formatUtcDate('2026-10-14T23:59:59-04:00'), '2026-10-15 UTC');
  assert.equal(formatUtcDate('not a date'), 'unknown date');
  assert.equal(formatUtcDate(''), 'unknown date');
  assert.ok(isCloseKey('Escape') && !isCloseKey('Enter') && !isCloseKey(' '));
});
