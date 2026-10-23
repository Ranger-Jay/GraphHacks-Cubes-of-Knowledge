import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneSoundEffects } from '../../apps/web/src/scene/space/SceneSoundEffects';
import { setAudioMuted } from '../../apps/web/src/scene/audio';

function environment() {
  const originals = new Map(['document', 'navigator', 'AudioContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map<string, () => void>();
  const document = { hidden: false, addEventListener(k: string, fn: () => void) { listeners.set(k, fn); }, removeEventListener(k: string) { listeners.delete(k); } };
  const activation = { isActive: false };
  const contexts: FakeContext[] = [];
  class FakeContext {
    state = 'running'; currentTime = 1; destination = {}; closed = false;
    frequencies: number[] = []; volumes: number[] = []; stopped = 0;
    constructor() { contexts.push(this); }
    createOscillator() {
      const oscillator = { type: '', frequency: { setValueAtTime: (v: number) => this.frequencies.push(v), exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {}, start() {}, stop: () => { this.stopped++; }, onended: null };
      return oscillator;
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime: (v: number) => this.volumes.push(v) }, connect() {}, disconnect() {} }; }
    async close() { this.closed = true; this.state = 'closed'; }
    async resume() {}
  }
  for (const [key, value] of Object.entries({ document, navigator: { userActivation: activation }, AudioContext: FakeContext })) Object.defineProperty(globalThis, key, { configurable: true, value });
  return { activation, document, listeners, contexts, restore() {
    setAudioMuted(true);
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  } };
}

test('effects default silent, require a gesture and READY, and close on mute', () => {
  const env = environment(), sound = new SceneSoundEffects();
  try {
    setAudioMuted(true); sound.update('READY'); env.activation.isActive = true; sound.play('chime');
    assert.equal(env.contexts.length, 0);
    setAudioMuted(false); env.activation.isActive = false; sound.play('chime'); assert.equal(env.contexts.length, 0);
    env.activation.isActive = true; sound.update('CHECKING'); sound.play('chime'); assert.equal(env.contexts.length, 0);
    sound.update('READY'); sound.play('chime');
    assert.deepEqual(env.contexts[0]!.frequencies, [587.33, 783.99, 1046.5]);
    assert.ok(env.contexts[0]!.volumes.every(v => v <= 0.025));
    sound.play('chime'); assert.equal(env.contexts[0]!.frequencies.length, 3, 'bounded, no sound queue');
    setAudioMuted(true); assert.equal(env.contexts[0]!.closed, true); assert.equal(env.contexts[0]!.stopped, 6);
  } finally { sound.dispose(); env.restore(); }
});

test('outage, hidden page and disposal cancel cosmetic audio without changing global mute', () => {
  for (const action of ['outage', 'hidden', 'dispose']) {
    const env = environment(), sound = new SceneSoundEffects();
    try {
      setAudioMuted(false); env.activation.isActive = true; sound.update('READY'); sound.play('aperture');
      assert.deepEqual(env.contexts[0]!.frequencies, [220]);
      if (action === 'outage') sound.update('GRAPH_UNAVAILABLE');
      if (action === 'hidden') { env.document.hidden = true; env.listeners.get('visibilitychange')!(); }
      if (action === 'dispose') sound.dispose();
      assert.equal(env.contexts[0]!.closed, true);
      sound.play('chime'); assert.equal(env.contexts.length, 1);
    } finally { sound.dispose(); assert.equal(env.listeners.size, 0); env.restore(); }
  }
});
