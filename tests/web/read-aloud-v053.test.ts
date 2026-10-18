import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelSpeech, cancelSpeechForAgent, enforcePhaseGate, isAudioMuted, localReadAloudVoices,
  readCurrentExplanation, setAudioMuted, speakAuthorizedClip, subscribeAudioMuted } from '../../apps/web/src/scene/audio';

// Offline speech/audio doubles. These checks do not prove a device can produce audible speech.
const voice = { voiceURI: 'fixture-local-en', name: 'Fixture local voice', lang: 'en-US', localService: true, default: true } as SpeechSynthesisVoice;
class Utterance {
  voice: SpeechSynthesisVoice | null = null; lang = ''; rate = 1; pitch = 1;
  onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
class AudioDouble {
  static all: AudioDouble[] = [];
  onended: (() => void) | null = null; onerror: (() => void) | null = null;
  currentTime = 0; paused = false;
  constructor(public src: string) { AudioDouble.all.push(this); }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}

test('local read-aloud respects activation, phase, ownership, mute and recorded audio', async t => {
  const previous = new Map(['window', 'navigator', 'SpeechSynthesisUtterance', 'Audio'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let voices = [voice, { ...voice, voiceURI: 'remote', localService: false } as SpeechSynthesisVoice];
  let cancelled = 0; const spoken: Utterance[] = [];
  const synth = { getVoices: () => voices, cancel: () => { cancelled++; }, speak: (u: Utterance) => { spoken.push(u); } };
  const activation = { isActive: true };
  for (const [k, value] of Object.entries({ window: { speechSynthesis: synth }, navigator: { userActivation: activation }, SpeechSynthesisUtterance: Utterance, Audio: AudioDouble })) {
    Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  }
  const start = (done?: () => void) => readCurrentExplanation('Current fixture evidence.', 'roy', voice.voiceURI, 'READY', done);
  try {
    await t.test('muted, unactivated, non-READY and unbounded text all refuse speech', () => {
      setAudioMuted(true); assert.equal(start().started, false);
      setAudioMuted(false); activation.isActive = false; assert.equal(start().started, false); activation.isActive = true;
      for (const phase of ['CHECKING', 'GRAPH_UNAVAILABLE', 'ACCESS_DENIED', 'UNAVAILABLE', 'NOT_FOUND'] as const) {
        assert.equal(readCurrentExplanation('text', 'roy', voice.voiceURI, phase).started, false);
      }
      for (const text of ['', '   ', 'x'.repeat(1201)]) assert.equal(readCurrentExplanation(text, 'roy', voice.voiceURI, 'READY').started, false);
      assert.equal(spoken.length, 0);
    });
    await t.test('only present local voices may speak; no silent remote/default fallback', () => {
      assert.deepEqual(localReadAloudVoices().map(v => v.voiceURI), [voice.voiceURI]);
      assert.equal(readCurrentExplanation('text', 'roy', 'remote', 'READY').started, false);
      assert.equal(readCurrentExplanation('text', 'roy', 'removed', 'READY').started, false);
      voices = []; assert.equal(start().started, false); voices = [voice];
      assert.equal(spoken.length, 0);
    });
    await t.test('accepted text and selected voice preserved, no punctuation rewriting', () => {
      const phrase = '“Basement Hum” is v3-only; it will not cover v4.';
      const call = readCurrentExplanation(phrase, 'roy', voice.voiceURI, 'READY');
      assert.equal(call.started, true); const u = spoken.at(-1); assert.ok(u);
      assert.equal(u.text, phrase); assert.equal(u.voice, voice); assert.equal(u.lang, 'en-US'); call.stop();
    });
    await t.test('mute stops active speech, callback fires once and subscribers track mute', () => {
      let ended = 0; let changes = 0; const unsub = subscribeAudioMuted(() => { changes++; });
      const call = start(() => { ended++; }); const u = spoken.at(-1); assert.ok(u); const staleEnd = u.onend;
      const before = cancelled; setAudioMuted(true);
      assert.equal(isAudioMuted(), true); assert.equal(cancelled, before + 1); assert.equal(ended, 1);
      staleEnd?.(); call.stop(); assert.equal(ended, 1); assert.equal(changes, 1);
      unsub(); setAudioMuted(false); assert.equal(changes, 1);
    });
    await t.test('phase loss stops speech even with no active WAV', () => {
      let ended = 0; start(() => { ended++; }); enforcePhaseGate('READY'); assert.equal(ended, 0);
      enforcePhaseGate('GRAPH_UNAVAILABLE'); assert.equal(ended, 1);
    });
    await t.test('sibling agent close does not stop speech; owning agent close does', () => {
      let ended = 0; start(() => { ended++; }); cancelSpeechForAgent('ava'); assert.equal(ended, 0);
      cancelSpeechForAgent('roy'); assert.equal(ended, 1);
    });
    await t.test('stale owner stop cannot cancel a newer reading', () => {
      let firstEnded = 0; let nextEnded = 0;
      const first = start(() => { firstEnded++; }); const next = start(() => { nextEnded++; });
      assert.equal(firstEnded, 1); const before = cancelled; first.stop();
      assert.equal(cancelled, before); assert.equal(nextEnded, 0); next.stop(); assert.equal(nextEnded, 1);
    });
    await t.test('WAV and read-aloud preempt each other without overlapping', () => {
      speakAuthorizedClip('roy', 'greeting', 'READY'); const wav = AudioDouble.all.at(-1); assert.ok(wav);
      let ended = 0; start(() => { ended++; }); assert.equal(wav.paused, true);
      speakAuthorizedClip('ava', 'greeting', 'READY'); assert.equal(ended, 1); cancelSpeech();
    });
    await t.test('natural completion releases ownership and stale stops leave later WAV alone', () => {
      let ended = 0; const call = start(() => { ended++; }); const u = spoken.at(-1); assert.ok(u); u.onend?.();
      assert.equal(ended, 1); speakAuthorizedClip('roy', 'greeting', 'READY');
      const wav = AudioDouble.all.at(-1); assert.ok(wav); call.stop(); assert.equal(wav.paused, false); cancelSpeech();
    });
  } finally {
    setAudioMuted(true); cancelSpeech();
    for (const [k, d] of previous) { if (d) Object.defineProperty(globalThis, k, d); else Reflect.deleteProperty(globalThis, k); }
  }
});
