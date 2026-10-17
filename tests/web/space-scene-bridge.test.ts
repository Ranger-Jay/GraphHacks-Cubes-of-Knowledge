import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_SCENE_PROTOCOL } from '@cubes/contracts';
import type { ScenePhase } from '@cubes/contracts';
import { createSpaceSceneBridge, isSpaceSceneEvent, projectSpaceScene, type SpaceSceneInput } from '../../apps/web/src/spaceSceneBridge';
import { available } from './fixtures';

const input = (changes: Partial<SpaceSceneInput> = {}): SpaceSceneInput => ({
  generation: 7, runtime: { phase: 'READY' }, analysis: available('GAP'), selectedNodeId: 'n2',
  ideaIds: ['idea-1'], reducedMotion: true, audioMuted: true, ...changes,
});
const event = (type: string, fields: Record<string, unknown> = {}) => ({
  protocol: SPACE_SCENE_PROTOCOL, generation: 7, type, ...fields,
});

test('current proof is a detached view, with dangling edges removed and references retained', () => {
  const i = input();
  const view = projectSpaceScene(i);
  assert.equal(view.clearance, 'GAP');
  assert.deepEqual(view.data.edges.map(e => e.id), ['x1']);
  assert.equal(view.data.selectedNodeId, 'n2');
  assert.equal(view.sources[0]?.id, 's1');
  assert.equal(view.recoveryAuthorized, false);
  view.data.nodes[0]!.label = 'Changed by renderer';
  view.sources[0]!.excerpt = 'Changed by renderer';
  assert.equal(i.analysis?.status, 'AVAILABLE');
  if (i.analysis?.status === 'AVAILABLE') {
    assert.equal(i.analysis.nodes[0]?.label, 'Release');
    assert.notEqual(i.analysis.sources[0]?.excerpt, 'Changed by renderer');
  }
});

for (const phase of ['CHECKING', 'GRAPH_UNAVAILABLE', 'ACCESS_DENIED', 'NOT_FOUND', 'UNAVAILABLE'] as ScenePhase[]) {
  test(`${phase} withholds stale AVAILABLE proof, ideas and recovery authorization`, () => {
    const s = projectSpaceScene(input({ runtime: { phase }, recoveryAuthorized: true }));
    assert.equal(s.runtime.phase, phase);
    assert.deepEqual(s.data, { status: 'UNAVAILABLE', nodes: [], edges: [], selectedNodeId: null });
    assert.deepEqual([s.summary, s.clearance, s.evidence, s.sources, s.ideaIds, s.recoveryAuthorized], [null, null, [], [], [], false]);
  });
}

test('missing context and invalid generation never produce ready evidence', () => {
  const i = input(); delete i.runtime;
  assert.equal(projectSpaceScene(i).runtime.phase, 'CHECKING');
  assert.equal(projectSpaceScene(input({ analysis: null })).runtime.phase, 'UNAVAILABLE');
  assert.equal(projectSpaceScene(input({ analysis: null, recoveryAuthorized: true })).recoveryAuthorized, false);
  for (const v of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => projectSpaceScene(input({ generation: v })), /Invalid scene generation/);
  }
});

test('unknown verbs, privilege fields, forged receipts and malformed payloads have no route', () => {
  for (const e of [null, [], event('IMPORT'), event('ADDED', { receipt: {} }), event('REFRESH', { tenantId: 'other' }),
    event('AGENT_TASK_START', { agentId: 'owner' }), event('SET_AUDIO_MUTED', { muted: 'false' }),
    event('SELECT_NODE', { id: '' }), event('SELECT_NODE', { id: 'x'.repeat(257) }),
    event('REFRESH', { generation: -1 }), event('REFRESH', { protocol: 'other' })]) {
    assert.equal(isSpaceSceneEvent(e), false, JSON.stringify(e));
  }
});

test('current member selections reach the application; invented IDs do not', async () => {
  const calls: string[] = [];
  const b = createSpaceSceneBridge(() => projectSpaceScene(input()), {
    onSelectNode: id => { calls.push(`node:${id}`); },
    onSelectSource: id => { calls.push(`source:${id}`); },
    onOpenIdea: id => { calls.push(`idea:${id}`); },
  });
  for (const [type, id] of [['SELECT_NODE', 'n2'], ['SELECT_SOURCE', 's1'], ['OPEN_IDEA', 'idea-1']]) {
    assert.equal(await b.dispatch(event(type!, { id })), 'DISPATCHED');
    assert.equal(await b.dispatch(event(type!, { id: 'invented' })), 'BLOCKED');
  }
  assert.deepEqual(calls, ['node:n2', 'source:s1', 'idea:idea-1']);
});

test('old callbacks re-read phase, generation and membership before acting', async () => {
  let current = input(); let calls = 0;
  const b = createSpaceSceneBridge(() => projectSpaceScene(current), { onSelectNode: () => { calls++; } });
  const saved = event('SELECT_NODE', { id: 'n2' });
  current = input({ runtime: { phase: 'GRAPH_UNAVAILABLE' } });
  assert.equal(await b.dispatch(saved), 'BLOCKED');
  current = input({ generation: 8 });
  assert.equal(await b.dispatch(saved), 'STALE');
  const next = available('GAP'); next.nodes = [];
  current = input({ analysis: next });
  assert.equal(await b.dispatch(saved), 'BLOCKED');
  assert.equal(calls, 0);
});

test('blocked states permit refresh, mute and closing, but not starting an agent task', async () => {
  let current = input({ runtime: { phase: 'ACCESS_DENIED' } });
  const calls: string[] = [];
  const b = createSpaceSceneBridge(() => projectSpaceScene(current), {
    onRefresh: () => { calls.push('refresh'); },
    onSetAudioMuted: muted => { calls.push(`mute:${muted}`); },
    onCloseAgent: id => { calls.push(`close:${id}`); },
    onAgentTaskStart: id => { calls.push(`task:${id}`); },
  });
  assert.equal(await b.dispatch(event('REFRESH')), 'DISPATCHED');
  assert.equal(await b.dispatch(event('SET_AUDIO_MUTED', { muted: true })), 'DISPATCHED');
  assert.equal(await b.dispatch(event('CLOSE_AGENT', { agentId: 'ava' })), 'DISPATCHED');
  assert.equal(await b.dispatch(event('AGENT_TASK_START', { agentId: 'ava' })), 'BLOCKED');
  current = input();
  assert.equal(await b.dispatch(event('AGENT_TASK_START', { agentId: 'ava' })), 'DISPATCHED');
  assert.deepEqual(calls, ['refresh', 'mute:true', 'close:ava', 'task:ava']);
});

test('unbound, invalid, failed and disposed callbacks never imply successful execution', async () => {
  const empty = createSpaceSceneBridge(() => projectSpaceScene(input()), {});
  assert.equal(await empty.dispatch(event('REFRESH')), 'UNBOUND');
  assert.equal(await empty.dispatch(event('IMPORT')), 'INVALID');
  const failed = createSpaceSceneBridge(() => projectSpaceScene(input()), { onRefresh: async () => { throw new Error('offline'); } });
  assert.equal(await failed.dispatch(event('REFRESH')), 'FAILED');
  failed.dispose();
  assert.equal(await failed.dispatch(event('REFRESH')), 'DISPOSED');
});
