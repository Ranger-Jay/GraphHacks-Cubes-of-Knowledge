import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SceneData } from '@cubes/contracts';

import { CompanyCubeScene } from '../../apps/web/src/scene/index';
import { CompanyCube } from '../../apps/web/src/scene/CompanyCube';
import { AgentPortrait } from '../../apps/web/src/scene/AgentPortrait';
import { HumanAvatars, HUMAN_ROLES } from '../../apps/web/src/scene/HumanAvatars';
import {
  AGENT_CONFIGS,
  PHRASE_GREETING,
  PHRASE_HELP,
  PHRASE_AFFIRMATIVE,
  PHRASE_NEGATIVE,
  TASK_START_CYCLE,
  getNextTaskStartPhrase,
  findVisemeAtTime,
} from '../../apps/web/src/scene/dialogue';
import { isAudioMuted, setAudioMuted, cancelSpeech } from '../../apps/web/src/scene/audio';

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
  assert.equal(findVisemeAtTime(visemes, 0), 'viseme_narrow');
  assert.equal(findVisemeAtTime(visemes, 200), 'viseme_open');
  assert.equal(findVisemeAtTime(visemes, 650), 'viseme_round');
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

  // With onAgentTaskStart on AVAILABLE -> enabled with 'Start Task'
  const htmlBound = renderToStaticMarkup(
    <CompanyCubeScene
      data={availableData}
      onSelectNode={() => {}}
      reducedMotion={false}
      onAgentTaskStart={async () => true}
    />
  );
  assert.ok(htmlBound.includes('Start Task'));

  // With onAgentTaskStart on UNAVAILABLE -> disabled with 'Task Blocked (Outage)'
  const htmlOutage = renderToStaticMarkup(
    <CompanyCubeScene
      data={unavailableData}
      onSelectNode={() => {}}
      reducedMotion={false}
      onAgentTaskStart={async () => true}
    />
  );
  assert.ok(htmlOutage.includes('Task Blocked (Outage)'));
  assert.ok(htmlOutage.includes('disabled'));
});
