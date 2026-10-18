// Accepted player regression cases retained from exact #56 9ae0956; fixtures are not browser proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AGENT_CONFIGS, GRAPH_OUTAGE_NOTICES } from '../../apps/web/src/scene/dialogue';
import { setAudioMuted, cancelSpeech, cancelSpeechForAgent, getActiveAgentId, enforcePhaseGate,
  speakAuthorizedPhrase, speakAuthorizedClip, speakRecoveryClip, getActiveClipFile } from '../../apps/web/src/scene/audio';
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
const audioInstances: FakeAudioInstance[] = [];

class FakeAudio {
  src: string;
  paused = true;
  currentTime = 0;
  onended: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  constructor(src: string) {
    this.src = src;
    playedSources.push(src);
    audioInstances.push(this);
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


test('23. v037: closed-sibling and stale-timer cancellation is scoped to the owning agent', () => {
  // Default layout: Ava open, Roy/Guz closed. The repo test harness renders
  // without effects, so this test drives the EXACT manager calls each
  // pyramid effect makes: a closed pyramid stops speech via
  // cancelSpeechForAgent(own id), and a stale animation timer does the same.
  // On the pre-fix code these sequences killed another agent's clip within 1 ms (P1)
  // or cut a newer clip at the old timer expiry (P2).
  playedSources.length = 0;
  setAudioMuted(false);

  // P1: Ava greets on READY; Roy/Guz closed-mount effects fire right after.
  speakAuthorizedClip('ava', 'greeting', 'READY');
  assert.equal(getActiveClipFile(), 'ava_01_greeting_v001.wav');
  assert.equal(getActiveAgentId(), 'ava');
  cancelSpeechForAgent('roy');
  assert.equal(getActiveClipFile(), 'ava_01_greeting_v001.wav', 'closed Roy must not cancel Ava greeting');
  assert.equal(getActiveAgentId(), 'ava');
  cancelSpeechForAgent('guz');
  assert.equal(getActiveClipFile(), 'ava_01_greeting_v001.wav', 'closed Guz must not cancel Ava greeting');
  // Closing the owning pyramid still cancels its own clip.
  cancelSpeechForAgent('ava');
  assert.equal(getActiveClipFile(), null, 'own close cancels own clip');
  assert.equal(getActiveAgentId(), null);

  // P2: Roy asks help; Guz asks help 330 ms later and supersedes. Roy's
  // expired animation timer then fires cancelSpeechForAgent('roy').
  speakAuthorizedClip('roy', 'help', 'READY');
  assert.equal(getActiveClipFile(), 'roy_02_help_v001.wav');
  assert.equal(getActiveAgentId(), 'roy');
  speakAuthorizedClip('guz', 'help', 'READY');
  assert.equal(getActiveClipFile(), 'guz_02_help_v001.wav');
  assert.equal(getActiveAgentId(), 'guz');
  cancelSpeechForAgent('roy');
  assert.equal(getActiveClipFile(), 'guz_02_help_v001.wav', 'stale Roy timer must not cut Guz clip');
  assert.equal(getActiveAgentId(), 'guz');

  cancelSpeech();
  setAudioMuted(true);
});

test('24. v037: natural `ended` completes a clip; superseded clips do not fire onEnd', () => {
  // P3: completion is driven by the element `ended` event, not a duration timer.
  setAudioMuted(false);
  audioInstances.length = 0;

  let royEnded = 0;
  speakAuthorizedPhrase('Greetings, Commander', AGENT_CONFIGS.roy, 'READY', () => {
    royEnded++;
  });
  assert.equal(getActiveClipFile(), 'roy_01_greeting_v001.wav');
  const royAudio = audioInstances.at(-1);
  assert.ok(royAudio, 'FakeAudio instance must exist for the started clip');
  royAudio.onended?.();
  assert.equal(royEnded, 1, 'ended must fire onEnd exactly once');
  assert.equal(getActiveClipFile(), null);

  // Supersede: Roy starts, Guz supersedes. Roy's onEnd must not fire.
  let royEnded2 = 0;
  let guzEnded = 0;
  speakAuthorizedPhrase('Greetings, Commander', AGENT_CONFIGS.roy, 'READY', () => {
    royEnded2++;
  });
  speakAuthorizedPhrase('Greetings, Commander', AGENT_CONFIGS.guz, 'READY', () => {
    guzEnded++;
  });
  assert.equal(royEnded2, 0, 'superseded clip must not fire onEnd');
  const guzAudio = audioInstances.at(-1);
  assert.ok(guzAudio, 'FakeAudio instance must exist for the superseding clip');
  guzAudio.onended?.();
  assert.equal(guzEnded, 1);
  assert.equal(getActiveClipFile(), null);

  cancelSpeech();
  setAudioMuted(true);
});


test('all 29 shipped WAV byte hashes match the accepted playback catalog', async () => {
  for (const clip of AUDIO_CLIPS) {
    const bytes = await readFile(new URL(`../../apps/web/public/art/audio/${clip.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, clip.file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF', clip.file);
  }
});
