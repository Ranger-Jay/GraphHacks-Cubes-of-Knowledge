import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IdeaImportReceipt, IdeaverseIdeaView as ContractIdea, IdeaverseOverviewResponse } from '@cubes/contracts';
import { parseImportReceipt, type IdeaverseIdeaView, type IdeaverseOverviewView, type ImportReceipt } from '../../apps/web/src/studio/ideaImport';

// Compile-time identity with the PR #50 contract (v030.01). `tsc -p tests/web` fails if the web types drift from it.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const sameReceipt: Equal<ImportReceipt, IdeaImportReceipt> = true;
const sameIdea: Equal<IdeaverseIdeaView, ContractIdea> = true;
const sameOverview: Equal<IdeaverseOverviewView, IdeaverseOverviewResponse> = true;

const HASH = 'b'.repeat(64);
const good: ImportReceipt = { ideaId: 'idea-001', sha256: HASH, workspaceId: 'ws', importedAt: '2026-10-15T23:00:00.000Z', workspaceRevision: 3, membershipId: 'm-1' };

test('web import types are the PR #50 contract types (compile-time identity)', () => {
  assert.deepEqual([sameReceipt, sameIdea, sameOverview], [true, true, true]);
});

test('contract receipt: exactly six canonical keys, strict UTC importedAt, positive safe-integer revision', () => {
  assert.deepEqual(parseImportReceipt(good), good);
  assert.deepEqual(parseImportReceipt({ ...good, importedAt: '2026-10-15T23:00:00Z' }), { ...good, importedAt: '2026-10-15T23:00:00Z' });
  for (const importedAt of ['2026-10-15T19:00:00-04:00', '2026-10-15', '2026-10-15 23:00:00Z', 'Thu Oct 15 2026', '2026-10-15T23:00:00']) {
    assert.equal(parseImportReceipt({ ...good, importedAt }), null, importedAt);
  }
  for (const workspaceRevision of [0, -1, 2 ** 53, Number.NaN, Infinity, '3']) assert.equal(parseImportReceipt({ ...good, workspaceRevision }), null, String(workspaceRevision));
  for (const extra of ['witnessHash', 'nodeId', 'edgeId', 'fileSha256', 'fileHash']) assert.equal(parseImportReceipt({ ...good, [extra]: HASH }), null, extra);
});
