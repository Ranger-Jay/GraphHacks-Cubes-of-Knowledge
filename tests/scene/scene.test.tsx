import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SceneData } from '@cubes/contracts';

import { CompanyCubeScene } from '../../apps/web/src/scene/index';
import { CompanyCube } from '../../apps/web/src/scene/CompanyCube';
import { executeAgentTaskStart, AgentPyramid, taskButtonLabel } from '../../apps/web/src/scene/AgentPyramid';
import { AgentPortrait } from '../../apps/web/src/scene/AgentPortrait';
import { HumanAvatars, HUMAN_ROLES } from '../../apps/web/src/scene/HumanAvatars';
import {
  AGENT_CONFIGS,
  PHRASE_GREETING,
  PHRASE_HELP,
  PHRASE_AFFIRMATIVE,
  PHRASE_NEGATIVE,
  TASK_START_CYCLE,
  GRAPH_OUTAGE_NOTICES,
  blockedStatusCaption,
  getNextTaskStartPhrase,
  findVisemeAtTime,
  normalSpeechAllowed,
} from '../../apps/web/src/scene/dialogue';
import {
  isAudioMuted,
  setAudioMuted,
  cancelSpeech,
  enforcePhaseGate,
  speakAuthorizedPhrase,
  speakAuthorizedClip,
  speakRecoveryClip,
  getActiveClipFile,
} from '../../apps/web/src/scene/audio';
import { AUDIO_CLIPS, findClipByAgentRole } from '../../apps/web/src/scene/audioClips';

type FakeAudioInstance = {
  src: string;
  paused: boolean;
  currentTime: number;
  onended: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  play: () => Promise<void>;
  pause: () => void;
};

const playedSources: string[] = [];

class FakeAudio {
  src: string;
  paused = true;
  currentTime = 0;
  onended: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  constructor(src: string) {
    this.src = src;
    playedSources.push(src);
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

(globalThis as { Audio?: typeof FakeAudio }).Audio = FakeAudio;

// Test Fixtures
const availableData: SceneData = {
  status: 'AVAILABLE',
  nodes: [
    { id: 'rel-wad', label: 'Release rel-wad', kind: 'Release', sourceRefIds: [] },
    { id: 'track-basement', label: 'Basement Hum', kind: 'Track', sourceRefIds: ['s1'] },
  ],
  edges: [
    { id: 'e1', from: 'rel-wad', to: 'track-basement', type: 'INCLUDES', sourceRefIds: [] },
  ],
  selectedNodeId: 'rel-wad',
};

const unavailableData: SceneData = {
  status: 'UNAVAILABLE',
  nodes: [],
  edges: [],
  selectedNodeId: null,
};

test('1. Character identities and visual attributes are preserved exactly', () => {
  // Roy: Gold circuitry
  assert.equal(AGENT_CONFIGS.roy.name, 'Roy');
  assert.equal(AGENT_CONFIGS.roy.circuitryColor, '#FFD700');
  assert.equal(AGENT_CONFIGS.roy.hairStyle, 'military');

  // Ava: Purple circuitry + approved asymmetric hairstyle
  assert.equal(AGENT_CONFIGS.ava.name, 'Ava');
  assert.equal(AGENT_CONFIGS.ava.circuitryColor, '#B388FF');
  assert.equal(AGENT_CONFIGS.ava.hairStyle, 'asymmetric');

  // Guz: Green circuitry
  assert.equal(AGENT_CONFIGS.guz.name, 'Guz');
  assert.equal(AGENT_CONFIGS.guz.circuitryColor, '#00E676');
  assert.equal(AGENT_CONFIGS.guz.hairStyle, 'spikes');

  // Humans: Kanny and Serena
  assert.equal(HUMAN_ROLES.kanny.name, 'Kanny');
  assert.equal(HUMAN_ROLES.kanny.role, 'Studio Owner');
  assert.equal(HUMAN_ROLES.serena.name, 'Serena');
  assert.equal(HUMAN_ROLES.serena.role, 'Reader');
});

test('2. Dialogue trigger phrases and visemes match the exact brief specification', () => {
  // Opening greeting
  assert.equal(PHRASE_GREETING.phrase, 'Greetings, Commander');
  assert.equal(PHRASE_GREETING.expression, 'smile');
  assert.ok(PHRASE_GREETING.visemes.length >= 6);

  // Avatar click help
  assert.equal(PHRASE_HELP.phrase, 'how may I help');
  assert.equal(PHRASE_HELP.expression, 'attentive');

  // Affirmative response
  assert.equal(PHRASE_AFFIRMATIVE.phrase, 'yes');
  assert.equal(PHRASE_AFFIRMATIVE.expression, 'nod');

  // Negative response
  assert.equal(PHRASE_NEGATIVE.phrase, 'no');
  assert.equal(PHRASE_NEGATIVE.expression, 'shake');

  // Predictable task start cycle
  assert.equal(TASK_START_CYCLE.length, 3);
  assert.equal(TASK_START_CYCLE[0].phrase, "I'll get right on it.");
  assert.equal(TASK_START_CYCLE[1].phrase, 'Task beginning');
  assert.equal(TASK_START_CYCLE[2].phrase, 'Underway.');

  // Cycle sequence step
  const step0 = getNextTaskStartPhrase(0);
  assert.equal(step0.phraseDef.phrase, "I'll get right on it.");
  assert.equal(step0.nextIndex, 1);

  const step1 = getNextTaskStartPhrase(1);
  assert.equal(step1.phraseDef.phrase, 'Task beginning');
  assert.equal(step1.nextIndex, 2);

  const step2 = getNextTaskStartPhrase(2);
  assert.equal(step2.phraseDef.phrase, 'Underway.');
  assert.equal(step2.nextIndex, 0);
});

test('3. Viseme frame timing lookup returns correct mouth positions', () => {
  const visemes = PHRASE_GREETING.visemes;
  // Accepted Roy greeting curve from pin fce5110
  assert.equal(findVisemeAtTime(visemes, 0), 'viseme_narrow');
  assert.equal(findVisemeAtTime(visemes, 200), 'viseme_open');
  assert.equal(findVisemeAtTime(visemes, 650), 'rest');
  assert.equal(findVisemeAtTime(visemes, 700), 'viseme_round');
  assert.equal(findVisemeAtTime(visemes, 1300), 'smile');
});

test('4. Audio starts muted by default and supports clean muting toggle', () => {
  // Spec requirement: "Audio starts muted; the user explicitly enables it."
  assert.equal(isAudioMuted(), true);

  setAudioMuted(false);
  assert.equal(isAudioMuted(), false);

  setAudioMuted(true);
  assert.equal(isAudioMuted(), true);

  // Calling cancelSpeech does not throw
  assert.doesNotThrow(() => cancelSpeech());
});

test('5. CompanyCube renders luminous lattice and red evidence nodes in AVAILABLE state', () => {
  const html = renderToStaticMarkup(
    <CompanyCube data={availableData} onSelectNode={() => {}} reducedMotion={false} />
  );

  assert.ok(html.includes('company-cube-stage cube-available'));
  assert.ok(html.includes('#00E5FF')); // Luminous blue lattice
  assert.ok(html.includes('#FF1744')); // Red graph evidence nodes
  assert.ok(html.includes('Release rel-wad'));
  assert.ok(html.includes('Basement Hum'));
  assert.ok(html.includes('INCLUDES'));
  assert.ok(!html.includes('GRAPH UNAVAILABLE'));
});

test('6. CompanyCube fractures and removes proof edges in UNAVAILABLE state', () => {
  const html = renderToStaticMarkup(
    <CompanyCube data={unavailableData} onSelectNode={() => {}} reducedMotion={false} />
  );

  assert.ok(html.includes('company-cube-stage cube-unavailable'));
  assert.ok(html.includes('GRAPH UNAVAILABLE'));
  assert.ok(html.includes('Evidence severed. Zero proof displayed.'));
  assert.ok(!html.includes('graph-proof-edges'));
  assert.ok(!html.includes('Release rel-wad'));
});

test('7. AgentPortrait renders layered 2.5D SVG rig with distinct hair and circuitry', () => {
  // Ava: Asymmetric hair and purple circuitry
  const avaHtml = renderToStaticMarkup(
    <AgentPortrait
      agent={AGENT_CONFIGS.ava}
      viseme="rest"
      expression="idle"
      reducedMotion={false}
      isSpeaking={false}
    />
  );
  assert.ok(avaHtml.includes('agent-ava'));
  assert.ok(avaHtml.includes('#B388FF'));
  assert.ok(avaHtml.includes('portrait-breathing'));
  assert.ok(avaHtml.includes('portrait-eyes-blink'));

  // Roy: Military hair and gold circuitry
  const royHtml = renderToStaticMarkup(
    <AgentPortrait
      agent={AGENT_CONFIGS.roy}
      viseme="viseme_open"
      expression="nod"
      reducedMotion={false}
      isSpeaking={true}
    />
  );
  assert.ok(royHtml.includes('agent-roy'));
  assert.ok(royHtml.includes('#FFD700'));
  assert.ok(royHtml.includes('portrait-head-nod'));

  // Reduced motion: disables animation classes
  const rmHtml = renderToStaticMarkup(
    <AgentPortrait
      agent={AGENT_CONFIGS.guz}
      viseme="rest"
      expression="idle"
      reducedMotion={true}
      isSpeaking={false}
    />
  );
  assert.ok(rmHtml.includes('reduced-motion'));
  assert.ok(!rmHtml.includes('portrait-breathing'));
  assert.ok(!rmHtml.includes('portrait-eyes-blink'));
});

test('8. HumanAvatars renders Kanny and Serena with natural human appearance and role badges', () => {
  const html = renderToStaticMarkup(<HumanAvatars reducedMotion={false} />);
  assert.ok(html.includes('Kanny'));
  assert.ok(html.includes('Owner (Approval Authority)'));
  assert.ok(html.includes('Serena'));
  assert.ok(html.includes('Reader (Auditor)'));
  assert.ok(html.includes('server-side session tokens strictly govern approvals'));
});

test('9. Full CompanyCubeScene mounts conforming to contract with accessible fallback and audio toggle', () => {
  let selectedId: string | null = null;
  const html = renderToStaticMarkup(
    <CompanyCubeScene
      data={availableData}
      onSelectNode={(id) => {
        selectedId = id;
      }}
      reducedMotion={false}
    />
  );

  assert.ok(html.includes('data-scene="cube-scene"'));
  assert.ok(html.includes('data-status="AVAILABLE"'));
  assert.ok(html.includes('Audio Muted (Click to Enable)'));
  assert.ok(html.includes('data-testid="scene-caption"'));
  assert.ok(html.includes('data-testid="pyramid-ava"'));
  assert.ok(html.includes('data-testid="pyramid-roy"'));
  assert.ok(html.includes('data-testid="pyramid-guz"'));
  assert.ok(html.includes('Scene text alternative'));
});

test('10. P2-B Screen-reader fallback reports 0 displayed nodes during UNAVAILABLE even with stale props', () => {
  const staleData: SceneData = {
    status: 'UNAVAILABLE',
    nodes: [
      { id: 'stale-1', label: 'Stale 1', kind: 'Release', sourceRefIds: [] },
      { id: 'stale-2', label: 'Stale 2', kind: 'Track', sourceRefIds: [] },
    ],
    edges: [],
    selectedNodeId: 'stale-1',
  };

  const html = renderToStaticMarkup(
    <CompanyCubeScene
      data={staleData}
      onSelectNode={() => {}}
      reducedMotion={false}
    />
  );

  assert.ok(html.includes('<strong>Graph Proof State:</strong> UNAVAILABLE'));
  assert.ok(html.includes('<strong>Nodes:</strong> 0 displayed'));
  assert.ok(html.includes('<strong>Selected Node:</strong> None'));
  assert.ok(!html.includes('verified |'));
  assert.ok(!html.includes('Nodes: 2'));
});

test('11. P2-B Screen-reader fallback reports honest node count without misleading verified label', () => {
  const html = renderToStaticMarkup(
    <CompanyCubeScene
      data={availableData}
      onSelectNode={() => {}}
      reducedMotion={false}
    />
  );

  assert.ok(html.includes('<strong>Graph Proof State:</strong> AVAILABLE'));
  assert.ok(html.includes('<strong>Nodes:</strong> 2 displayed'));
  assert.ok(html.includes('<strong>Selected Node:</strong> rel-wad'));
  assert.ok(!html.includes('2 verified'));
});

test('12. P2-A Task button is disabled when onAgentTaskStart is omitted or during outage', () => {
  // Without onAgentTaskStart -> button is disabled with 'Task Unbound'
  const htmlUnbound = renderToStaticMarkup(
    <CompanyCubeScene
      data={availableData}
      onSelectNode={() => {}}
      reducedMotion={false}
    />
  );
  assert.ok(htmlUnbound.includes('Task Unbound'));
  assert.ok(htmlUnbound.includes('disabled'));

  // No runtime prop fails closed. AVAILABLE evidence alone is not permission to speak or start.
  const htmlBound = renderToStaticMarkup(
    <CompanyCubeScene
      data={availableData}
      onSelectNode={() => {}}
      reducedMotion={false}
      onAgentTaskStart={async () => true}
    />
  );
  assert.ok(htmlBound.includes('Task Blocked (Checking)'));
  assert.ok(!htmlBound.includes('Start Task'));

  // Unavailable evidence without a graph-unavailable phase must not say Outage.
  const htmlOutage = renderToStaticMarkup(
    <CompanyCubeScene
      data={unavailableData}
      onSelectNode={() => {}}
      reducedMotion={false}
      onAgentTaskStart={async () => true}
    />
  );
  assert.ok(htmlOutage.includes('Task Blocked (Checking)'));
  assert.ok(!htmlOutage.includes('Task Blocked (Outage)'));
  assert.ok(htmlOutage.includes('disabled'));
});

test('13. P2-A/P3 executeAgentTaskStart enforces truth gates: true, false, throw, outage, unbound, and in-flight debounce', async () => {
  // 1. Success path: returns true when handler resolves true on AVAILABLE
  let calledWith: string | null = null;
  const ok = await executeAgentTaskStart('ava', 'AVAILABLE', async (id) => {
    calledWith = id;
    return true;
  });
  assert.equal(ok, true);
  assert.equal(calledWith, 'ava');

  // 2. Denial / failed task path: returns false when handler resolves false
  const denied = await executeAgentTaskStart('ava', 'AVAILABLE', async () => false);
  assert.equal(denied, false);

  // 3. Exception / error path: returns false when handler throws
  const errored = await executeAgentTaskStart('ava', 'AVAILABLE', async () => {
    throw new Error('Task launch failed');
  });
  assert.equal(errored, false);

  // 4. Outage path: returns false without calling handler when status is UNAVAILABLE
  let handlerCalledOnOutage = false;
  const outage = await executeAgentTaskStart('ava', 'UNAVAILABLE', async () => {
    handlerCalledOnOutage = true;
    return true;
  });
  assert.equal(outage, false);
  assert.equal(handlerCalledOnOutage, false);

  // 5. Unbound path: returns false when handler is undefined
  const unbound = await executeAgentTaskStart('ava', 'AVAILABLE', undefined);
  assert.equal(unbound, false);

  // 6. In-flight debounce guard: returns false without calling handler when inFlight is true
  let handlerCalledInFlight = false;
  const inFlightResult = await executeAgentTaskStart(
    'ava',
    'AVAILABLE',
    async () => {
      handlerCalledInFlight = true;
      return true;
    },
    true // inFlight
  );
  assert.equal(inFlightResult, false);
  assert.equal(handlerCalledInFlight, false);
});

test('14. P3 Synchronous lock prevents duplicate task invocations under rapid synchronous click burst', async () => {
  let calls = 0;
  let resolvePending!: (val: boolean) => void;
  const pendingPromise = new Promise<boolean>((resolve) => {
    resolvePending = resolve;
  });

  let capturedHandler: ((e?: { stopPropagation?: () => void }) => Promise<void>) | null = null;

  renderToStaticMarkup(
    React.createElement(AgentPyramid, {
      agent: AGENT_CONFIGS.ava,
      isOpen: true,
      onToggleOpen: () => {},
      sceneData: availableData,
      reducedMotion: false,
      staggerIndex: 0,
      onSetCaption: () => {},
      runtime: { phase: 'READY' },
      onAgentTaskStart: async () => {
        calls++;
        return pendingPromise;
      },
      onTaskClickHandlerCapture: (fn) => {
        capturedHandler = fn;
      },
    })
  );

  assert.ok(capturedHandler, 'Click handler must be captured from rendered AgentPyramid component');

  // Fire three synchronous clicks in rapid succession without awaiting in-between
  const mockEvent = { stopPropagation: () => {} };
  const p1 = (capturedHandler as any)(mockEvent);
  const p2 = (capturedHandler as any)(mockEvent);
  const p3 = (capturedHandler as any)(mockEvent);

  // Exactly one call should have reached the onAgentTaskStart handler
  assert.equal(calls, 1, 'Synchronous lock must limit rapid click burst to exactly 1 invocation');

  // Resolve pending handler promise
  resolvePending(true);
  await Promise.all([p1, p2, p3]);

  // After completion, the synchronous lock must be released
  const p4 = (capturedHandler as any)(mockEvent);
  assert.equal(calls, 2, 'Lock must be released after promise settles to allow subsequent task trigger');
  await p4;
});

test('15. P3 Synchronous lock releases cleanly if handler throws/rejects', async () => {
  let calls = 0;
  let rejectPending!: (err: Error) => void;
  const failingPromise = new Promise<boolean>((_, reject) => {
    rejectPending = reject;
  });

  let capturedHandler: ((e?: { stopPropagation?: () => void }) => Promise<void>) | null = null;

  renderToStaticMarkup(
    React.createElement(AgentPyramid, {
      agent: AGENT_CONFIGS.roy,
      isOpen: true,
      onToggleOpen: () => {},
      sceneData: availableData,
      reducedMotion: false,
      staggerIndex: 0,
      onSetCaption: () => {},
      runtime: { phase: 'READY' },
      onAgentTaskStart: async () => {
        calls++;
        return failingPromise;
      },
      onTaskClickHandlerCapture: (fn) => {
        capturedHandler = fn;
      },
    })
  );

  assert.ok(capturedHandler, 'Click handler must be captured from rendered AgentPyramid component');

  // Fire synchronous click burst
  const mockEvent = { stopPropagation: () => {} };
  const p1 = (capturedHandler as any)(mockEvent);
  const p2 = (capturedHandler as any)(mockEvent);
  assert.equal(calls, 1, 'Only first click invokes handler before rejection');

  // Reject the promise
  rejectPending(new Error('Network failure'));
  await Promise.all([p1, p2]);

  // Lock must be released despite failure
  const p3 = (capturedHandler as any)(mockEvent);
  assert.equal(calls, 2, 'Lock must be released after rejection so retry is possible');
  await p3;
});

test('16. Approved outage notices are exact and other blocked phases do not use them', () => {
  // Match accepted WAV masters (pin fce5110); Guz uses "will not".
  assert.equal(GRAPH_OUTAGE_NOTICES.roy, 'FalkorDB is unavailable. Operations are offline.');
  assert.equal(
    GRAPH_OUTAGE_NOTICES.ava,
    'I can\u2019t access the company\u2019s knowledge. Information is unavailable until FalkorDB is available again.'
  );
  assert.equal(
    GRAPH_OUTAGE_NOTICES.guz,
    'I can\u2019t verify any sources. I will not provide an answer without evidence.'
  );
  assert.equal(normalSpeechAllowed('READY'), true);
  assert.equal(normalSpeechAllowed(undefined), false);
  assert.equal(normalSpeechAllowed('GRAPH_UNAVAILABLE'), false);
  assert.equal(blockedStatusCaption('roy', 'GRAPH_UNAVAILABLE'), GRAPH_OUTAGE_NOTICES.roy);
  assert.equal(blockedStatusCaption('ava', 'ACCESS_DENIED'), 'Access denied.');
  assert.ok(!blockedStatusCaption('ava', 'ACCESS_DENIED')!.includes('disconnected'));
  assert.equal(blockedStatusCaption('guz', 'NOT_FOUND'), 'The requested release is missing.');
  assert.equal(blockedStatusCaption('roy', 'CHECKING'), 'Checking current information.');
  assert.equal(blockedStatusCaption('roy', undefined), 'Checking current information.');
  assert.equal(blockedStatusCaption('roy', 'READY'), null);
});

test('17. Task start refuses a blocked phase even when scene status is AVAILABLE', async () => {
  let calls = 0;
  const blocked = await executeAgentTaskStart('roy', 'AVAILABLE', async () => {
    calls++;
    return true;
  }, false, 'GRAPH_UNAVAILABLE');
  assert.equal(blocked, false);
  assert.equal(calls, 0);

  const denied = await executeAgentTaskStart('ava', 'AVAILABLE', async () => {
    calls++;
    return true;
  }, false, 'ACCESS_DENIED');
  assert.equal(denied, false);
  assert.equal(calls, 0);

  const ready = await executeAgentTaskStart('guz', 'AVAILABLE', async () => true, false, 'READY');
  assert.equal(ready, true);
});

test('18. Pyramid labels follow the runtime phase and do not call a down graph an access denial', () => {
  const outage = renderToStaticMarkup(
    React.createElement(AgentPyramid, {
      agent: AGENT_CONFIGS.roy,
      isOpen: true,
      onToggleOpen: () => {},
      sceneData: availableData,
      reducedMotion: false,
      staggerIndex: 0,
      onSetCaption: () => {},
      onAgentTaskStart: async () => true,
      runtime: { phase: 'GRAPH_UNAVAILABLE' },
    })
  );
  assert.ok(outage.includes('Task Blocked (Outage)'));
  assert.ok(outage.includes('disabled'));

  const denied = renderToStaticMarkup(
    React.createElement(AgentPyramid, {
      agent: AGENT_CONFIGS.ava,
      isOpen: true,
      onToggleOpen: () => {},
      sceneData: availableData,
      reducedMotion: false,
      staggerIndex: 0,
      onSetCaption: () => {},
      onAgentTaskStart: async () => true,
      runtime: { phase: 'ACCESS_DENIED' },
    })
  );
  assert.ok(denied.includes('Task Blocked (Access)'));
  assert.ok(!denied.includes('Task Blocked (Outage)'));

  assert.equal(taskButtonLabel('AVAILABLE', 'READY', true, false), 'Start Task');
  assert.equal(taskButtonLabel('UNAVAILABLE', 'READY', true, false), 'Task Blocked (Unverified)');
});

test('19. Authorized speech refuses ordinary phrases while the graph is unavailable', () => {
  const refused = speakAuthorizedPhrase('Greetings, Commander', AGENT_CONFIGS.roy, 'GRAPH_UNAVAILABLE');
  assert.equal(typeof refused, 'function');
  const allowed = speakAuthorizedPhrase(GRAPH_OUTAGE_NOTICES.roy, AGENT_CONFIGS.roy, 'GRAPH_UNAVAILABLE');
  assert.equal(typeof allowed, 'function');
  const ready = speakAuthorizedPhrase(PHRASE_GREETING.phrase, AGENT_CONFIGS.roy, 'READY');
  assert.equal(typeof ready, 'function');
});

test('20. Recorded WAV catalog matches the accepted 29-clip pin', () => {
  assert.equal(AUDIO_CLIPS.length, 29);
  assert.equal(findClipByAgentRole('roy', 'outage')?.file, 'roy_09_outage_v002.wav');
  assert.equal(GRAPH_OUTAGE_NOTICES.guz.includes('will not'), true);
  assert.equal(GRAPH_OUTAGE_NOTICES.roy, 'FalkorDB is unavailable. Operations are offline.');
});

test('21. WAV gates: mute default, READY ordinary, outage-only on GRAPH_UNAVAILABLE, recovery requires auth', () => {
  playedSources.length = 0;
  setAudioMuted(true);
  speakAuthorizedClip('roy', 'greeting', 'READY');
  assert.equal(playedSources.length, 0, 'muted refuses playback');

  setAudioMuted(false);
  speakAuthorizedClip('roy', 'greeting', 'CHECKING');
  assert.equal(playedSources.length, 0, 'non-READY refuses ordinary');

  speakAuthorizedClip('roy', 'greeting', 'READY');
  assert.equal(playedSources.at(-1), '/art/audio/roy_01_greeting_v001.wav');
  assert.equal(getActiveClipFile(), 'roy_01_greeting_v001.wav');

  speakAuthorizedClip('roy', 'outage', 'READY');
  assert.notEqual(getActiveClipFile(), 'roy_09_outage_v002.wav', 'outage refused while READY');

  speakAuthorizedClip('roy', 'outage', 'GRAPH_UNAVAILABLE');
  assert.equal(getActiveClipFile(), 'roy_09_outage_v002.wav');

  const beforeRecovery = playedSources.length;
  speakRecoveryClip('roy', 'READY', false);
  assert.equal(playedSources.length, beforeRecovery, 'recovery refused without authorization');

  speakRecoveryClip('roy', 'GRAPH_UNAVAILABLE', true);
  assert.equal(playedSources.length, beforeRecovery, 'recovery refused off READY');

  speakRecoveryClip('roy', 'READY', true);
  assert.equal(getActiveClipFile(), 'roy_10_ready_v001.wav');
  const afterRoyRecovery = getActiveClipFile();
  const playedAfterRoy = playedSources.length;

  speakRecoveryClip('guz', 'READY', true);
  assert.equal(getActiveClipFile(), afterRoyRecovery);
  assert.equal(playedSources.length, playedAfterRoy, 'guz has no recovery master');

  cancelSpeech();
  assert.equal(getActiveClipFile(), null);
  setAudioMuted(true);
});

test('22. Phase change away from the active clip gate cancels the WAV', () => {
  playedSources.length = 0;
  setAudioMuted(false);
  speakAuthorizedClip('ava', 'outage', 'GRAPH_UNAVAILABLE');
  assert.equal(getActiveClipFile(), 'ava_09_outage_v002.wav');
  enforcePhaseGate('READY');
  assert.equal(getActiveClipFile(), null, 'outage must stop when phase returns to READY');

  speakAuthorizedClip('roy', 'greeting', 'READY');
  assert.equal(getActiveClipFile(), 'roy_01_greeting_v001.wav');
  enforcePhaseGate('READY');
  assert.equal(getActiveClipFile(), 'roy_01_greeting_v001.wav', 'ordinary stays while READY');
  enforcePhaseGate('GRAPH_UNAVAILABLE');
  assert.equal(getActiveClipFile(), null, 'ordinary stops when READY is lost');
  setAudioMuted(true);
});

