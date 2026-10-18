import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpaceSceneHost, waitingSceneIdeaIds } from '../../apps/web/src/spaceSceneHost';
import { SPACE_SCENE_PROTOCOL } from '@cubes/contracts';
import type { SpaceSceneInput } from '../../apps/web/src/spaceSceneBridge';
import type { StudioSnapshot } from '../../apps/web/src/studio/studioController';
import { available } from './fixtures';

const input = (changes: Partial<SpaceSceneInput> = {}): SpaceSceneInput => ({
  generation: 1, runtime: { phase: 'READY' }, analysis: available('GAP'), selectedNodeId: null,
  ideaIds: ['idea-1'], reducedMotion: false, audioMuted: true, ...changes,
});

test('host invalidates pre-outage events after recovery even with unchanged request generation', async () => {
  const calls: string[] = [];
  const host = createSpaceSceneHost({ onSelectNode: id => { calls.push(id); } });
  const before = host.update(input());
  const event = { protocol: SPACE_SCENE_PROTOCOL, generation: before.generation, type: 'SELECT_NODE', id: 'n2' };
  assert.equal(await host.bridge.dispatch(event), 'DISPATCHED');
  const down = host.update(input({ runtime: { phase: 'GRAPH_UNAVAILABLE' } }));
  assert.ok(down.generation > before.generation);
  assert.deepEqual(down.data.nodes, []);
  const recovered = host.update(input({ recoveryAuthorized: true }));
  assert.ok(recovered.generation > down.generation);
  assert.equal(recovered.recoveryAuthorized, true);
  assert.equal(await host.bridge.dispatch(event), 'STALE');
  assert.deepEqual(calls, ['n2']);
});

test('renderer edits cannot forge the host membership or restore removed proof', async () => {
  const calls: string[] = [];
  const host = createSpaceSceneHost({ onOpenIdea: id => { calls.push(id); } });
  const view = host.update(input());
  view.ideaIds.push('forged');
  view.data.nodes.length = 0;
  assert.equal(host.view().data.nodes.length, 2);
  const another = host.view();
  another.ideaIds.push('forged');
  assert.equal(await host.bridge.dispatch({ protocol: view.protocol, generation: view.generation, type: 'OPEN_IDEA', id: 'forged' }), 'BLOCKED');
  assert.deepEqual(calls, []);
  host.dispose();
  assert.equal(await host.bridge.dispatch({ protocol: view.protocol, generation: view.generation, type: 'REFRESH' }), 'DISPOSED');
});

test('fresh request invalidates events, but selection-only render keeps current events usable', async () => {
  const host = createSpaceSceneHost({ onSelectNode() {} });
  const first = host.update(input());
  const selected = host.update(input({ selectedNodeId: 'n2' }));
  assert.equal(selected.generation, first.generation);
  const next = host.update(input({ generation: 2 }));
  assert.ok(next.generation > first.generation);
  assert.equal(await host.bridge.dispatch({ protocol: first.protocol, generation: first.generation, type: 'SELECT_NODE', id: 'n2' }), 'STALE');
});

test('comets prefer the last 48 hours, fall back to latest timestamps, and retain loading pool IDs', () => {
  const now = Date.parse('2026-10-18T06:00:00Z');
  const ideas = [80, 1, 2, 3, 4].map(hours => ({
    id: `idea-${hours}`, filename: `${hours}.txt`, touchedAt: new Date(now - hours * 3600000).toISOString(),
    submittedAt: '2026-10-01T00:00:00Z', sha256: 'a'.repeat(64), byteCount: 20,
    synthetic: true as const, classification: 'proposal' as const, imported: false,
  }));
  const pool: StudioSnapshot = { env: { phase: 'READY', access: 'UNKNOWN' }, pool: { status: 'ready', overview: null, ideas }, open: null };
  assert.deepEqual(waitingSceneIdeaIds(pool, now), ['idea-1', 'idea-2', 'idea-3']);
  pool.pool.status = 'loading';
  assert.deepEqual(waitingSceneIdeaIds(pool, now), ['idea-1', 'idea-2', 'idea-3']);
  assert.deepEqual(waitingSceneIdeaIds(pool, now + 100 * 3600000), ['idea-1', 'idea-2', 'idea-3']);
  pool.env.phase = 'GRAPH_UNAVAILABLE';
  assert.deepEqual(waitingSceneIdeaIds(pool, now), []);
});
