// CANDIDATE DRAFT (slot v021.04 PROPOSED). Proves scene/index.tsx forwards runtime.phase to the cube and the pyramids.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SceneData, ScenePhase } from '@cubes/contracts';
import { CompanyCubeScene } from '../../apps/web/src/scene/index';
import { AGENT_CONFIGS, PHRASE_GREETING, PHRASE_HELP, PHRASE_AFFIRMATIVE, PHRASE_NEGATIVE, TASK_START_CYCLE, GRAPH_OUTAGE_NOTICES, normalSpeechAllowed } from '../../apps/web/src/scene/dialogue';
import { setAudioMuted, speakAuthorizedPhrase } from '../../apps/web/src/scene/audio';
import { AUDIO_CLIPS } from '../../apps/web/src/scene/audioClips';

// Worst case on purpose: AVAILABLE data with nodes is passed in every phase. Only READY may draw or enable anything from it.
const stale: SceneData = {
  status: 'AVAILABLE',
  nodes: [{ id: 'rel-wad', label: 'Release rel-wad', kind: 'Release', sourceRefIds: [] }, { id: 'track-basement', label: 'Basement Hum', kind: 'Track', sourceRefIds: ['s1'] }],
  edges: [{ id: 'e1', from: 'rel-wad', to: 'track-basement', type: 'INCLUDES', sourceRefIds: [] }],
  selectedNodeId: 'rel-wad',
};
const PHASES: ScenePhase[] = ['CHECKING', 'READY', 'GRAPH_UNAVAILABLE', 'ACCESS_DENIED', 'NOT_FOUND', 'UNAVAILABLE'];
const LABEL: Record<ScenePhase, string> = {
  READY: 'Start Task', GRAPH_UNAVAILABLE: 'Task Blocked (Outage)', ACCESS_DENIED: 'Task Blocked (Access)',
  NOT_FOUND: 'Task Blocked (Not Found)', UNAVAILABLE: 'Task Blocked (Unavailable)', CHECKING: 'Task Blocked (Checking)',
};
const scene = (runtime?: { phase: ScenePhase }) => renderToStaticMarkup(
  <CompanyCubeScene data={stale} onSelectNode={() => {}} reducedMotion={false} onAgentTaskStart={async () => true} {...(runtime ? { runtime } : {})} />);
const taskButton = (html: string) => /<button[^>]*class="pyramid-btn-task"([^>]*)>([^<]*)<\/button>/.exec(html);

for (const phase of PHASES) {
  test(`wiring: runtime.phase=${phase} reaches the cube and the agent pyramids`, () => {
    const html = scene({ phase });
    assert.ok(html.includes(`data-testid="company-cube-view" data-phase="${phase}"`), `cube got ${phase}`);
    const btn = taskButton(html);
    assert.ok(btn, 'Ava is open by default, so her task button renders');
    assert.equal(btn![2], LABEL[phase], `pyramid label for ${phase}`);
    assert.equal(/\bdisabled\b/.test(btn![1] ?? ""), phase !== 'READY', `task button disabled unless READY (${phase})`);
    const drawn = html.includes('graph-proof-edges') && html.includes('Basement Hum');
    assert.equal(drawn, phase === 'READY', `stale nodes are drawn only in READY (${phase})`);
  });
}

test('wiring: no runtime fails closed to CHECKING, never to an outage, and the task button stays blocked', () => {
  const html = scene();
  assert.ok(html.includes('data-phase="CHECKING"'));
  assert.equal(taskButton(html)![2], 'Task Blocked (Checking)');
  assert.ok(!html.includes('GRAPH UNAVAILABLE') && !html.includes('Task Blocked (Outage)'));
  assert.ok(!html.includes('graph-proof-edges'));
});

test('wiring: only GRAPH_UNAVAILABLE is drawn as an outage (denied, missing, checking and undetermined are not)', () => {
  for (const phase of ['ACCESS_DENIED', 'NOT_FOUND', 'UNAVAILABLE', 'CHECKING'] as const) {
    const html = scene({ phase });
    assert.ok(!html.includes('GRAPH UNAVAILABLE') && !html.includes('damaged-cube') && !html.includes('Task Blocked (Outage)'), phase);
  }
  assert.ok(scene({ phase: 'GRAPH_UNAVAILABLE' }).includes('damaged-cube'));
});

test('recorded ordinary clips play only in READY; approved outage clips play only in GRAPH_UNAVAILABLE', () => {
  const played: string[] = [];
  const globals = globalThis as unknown as { Audio?: unknown };
  const previous = globals.Audio;
  globals.Audio = class {
    onended: (() => void) | null = null; onerror: (() => void) | null = null; currentTime = 0;
    constructor(readonly src: string) {}
    play() { played.push(this.src); return Promise.resolve(); }
    pause() {}
  };
  setAudioMuted(false);
  try {
    const ordinary = AUDIO_CLIPS.filter(c => c.agent === 'ava' && c.kind === 'ordinary');
    const outage = AUDIO_CLIPS.find(c => c.agent === 'ava' && c.kind === 'outage')!;
    for (const phase of PHASES) {
      played.length = 0;
      for (const clip of ordinary) speakAuthorizedPhrase(clip.transcript, AGENT_CONFIGS.ava, phase);
      assert.equal(played.length, phase === 'READY' ? ordinary.length : 0, `ordinary WAV count in ${phase}`);
      assert.equal(normalSpeechAllowed(phase), phase === 'READY');
      played.length = 0;
      speakAuthorizedPhrase(outage.transcript, AGENT_CONFIGS.ava, phase);
      assert.equal(played.length, phase === 'GRAPH_UNAVAILABLE' ? 1 : 0, `outage WAV count in ${phase}`);
    }
    played.length = 0;
    speakAuthorizedPhrase('Invented unrecorded answer', AGENT_CONFIGS.ava, 'READY');
    assert.equal(played.length, 0, 'no synthesis fallback for an unrecorded phrase');
  } finally {
    setAudioMuted(true);
    if (previous === undefined) delete globals.Audio; else globals.Audio = previous;
  }
});

test('caption: "Systems ready" is only for READY; a caption written under another phase never lingers', async () => {
  const { resolveCaption, SYSTEM_CAPTIONS } = await import('../../apps/web/src/scene/index');
  for (const phase of PHASES) {
    const html = scene({ phase });
    assert.equal(html.includes('Systems ready. Standing by for command.'), phase === 'READY', `initial caption in ${phase}`);
    assert.ok(html.includes(SYSTEM_CAPTIONS[phase]), `System caption text for ${phase}`);
    assert.ok(html.includes('[System]:'));
  }
  const spoken = { text: 'Greetings, Commander', speaker: 'Ava', phase: 'READY' as const };
  assert.equal(resolveCaption(spoken, 'READY').speaker, 'Ava');
  for (const phase of PHASES.filter(p => p !== 'READY')) {
    const c = resolveCaption(spoken, phase);
    assert.deepEqual(c, { text: SYSTEM_CAPTIONS[phase], speaker: 'System' }, `READY line is replaced in ${phase}`);
    assert.ok(!/disconnect|sever/i.test(c.text));
  }
  const notice = { text: GRAPH_OUTAGE_NOTICES.ava, speaker: 'Ava', phase: 'GRAPH_UNAVAILABLE' as const };
  assert.equal(resolveCaption(notice, 'READY').text, SYSTEM_CAPTIONS.READY, 'an outage notice does not outlive the outage');
  assert.equal(resolveCaption(null, 'READY').speaker, 'System');
});

// v021.07 PROPOSED COPY pending Buddy's ruling.
const CUBE_COPY: Record<ScenePhase, [string, string] | null> = {
  READY: null,
  CHECKING: ['CHECKING THE GRAPH...', 'No proof is shown until the checks finish.'],
  GRAPH_UNAVAILABLE: ['GRAPH UNAVAILABLE', 'Evidence unavailable. No proof is shown.'],
  ACCESS_DENIED: ['ACCESS DENIED', 'Analysis unauthorized. Verify credentials.'],
  NOT_FOUND: ['RELEASE NOT FOUND', 'No matching release found in ledger.'],
  UNAVAILABLE: ['GRAPH STATUS UNAVAILABLE', 'The current state could not be determined.'],
};
test('copy (PROPOSED): cube notice per phase; no "disconnected" or "severed" in any scene copy a QUERY_FAILED-only outage can show', async () => {
  const { SYSTEM_CAPTIONS } = await import('../../apps/web/src/scene/index');
  for (const phase of PHASES) {
    const html = scene({ phase });
    const want = CUBE_COPY[phase];
    if (want) for (const t of want) assert.ok(html.includes(t), `${phase}: "${t}"`);
    else assert.ok(!html.includes('cube-outage-overlay'), 'READY has no notice');
    const cubeAndCaption = html.slice(html.indexOf('company-cube-stage'), html.indexOf('pyramids-deck')) + SYSTEM_CAPTIONS[phase];
    assert.ok(!/disconnect|sever/i.test(cubeAndCaption), `${phase}: no disconnect/sever wording in the cube or System caption`);
  }
  assert.equal(SYSTEM_CAPTIONS.CHECKING, 'Checking the graph...');
  assert.equal(SYSTEM_CAPTIONS.UNAVAILABLE, 'Graph status unavailable.');
});

test('labels: with no task handler bound (as the shell ships today) a blocked phase (settled or CHECKING) is named, never "Task Unbound"; Task Unbound is READY-only', () => {
  const unbound = (phase: ScenePhase) => renderToStaticMarkup(
    <CompanyCubeScene data={stale} onSelectNode={() => {}} reducedMotion={false} runtime={{ phase }} />);
  const want: Record<ScenePhase, string> = {
    GRAPH_UNAVAILABLE: 'Task Blocked (Outage)', ACCESS_DENIED: 'Task Blocked (Access)', NOT_FOUND: 'Task Blocked (Not Found)',
    UNAVAILABLE: 'Task Blocked (Unavailable)', CHECKING: 'Task Blocked (Checking)', READY: 'Task Unbound',
  };
  for (const phase of PHASES) {
    const btn = taskButton(unbound(phase));
    assert.equal(btn![2], want[phase], phase);
    assert.ok(/\bdisabled\b/.test(btn![1] ?? ''), `${phase}: disabled`);
  }
});
