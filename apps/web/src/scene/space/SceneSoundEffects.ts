import type { ScenePhase } from '@cubes/contracts';
import { getActiveAgentId, isAudioMuted, subscribeAudioMuted } from '../audio.js';

/** Short, local cosmetic sounds. Never speech, workflow feedback, or a network request. */
export class SceneSoundEffects {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  private phase: ScenePhase = 'CHECKING';
  private disposed = false;
  private lastPlayed = -Infinity;
  private monitor: ReturnType<typeof setInterval> | null = null;
  private readonly unsubscribe: () => void;
  private readonly visibility = () => { if (document.hidden) this.stop(); };

  constructor() {
    this.unsubscribe = subscribeAudioMuted(() => { if (isAudioMuted()) this.stop(); });
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', this.visibility);
  }

  update(phase: ScenePhase): void { this.phase = phase; if (phase !== 'READY') this.stop(); }

  private allowed(): boolean {
    return !this.disposed && this.phase === 'READY' && !isAudioMuted() && getActiveAgentId() === null
      && typeof document !== 'undefined' && !document.hidden;
  }

  play(kind: 'aperture' | 'chime'): void {
    if (!this.allowed() || globalThis.navigator?.userActivation?.isActive !== true
      || performance.now() - this.lastPlayed < 120 || this.voices.size > 0) return;
    try {
      const Context = globalThis.AudioContext;
      if (!Context) return;
      const context = this.context ??= new Context();
      if (context.state === 'suspended') void context.resume().catch(() => this.stop());
      this.lastPlayed = performance.now();
      const frequencies = kind === 'aperture' ? [220] : [587.33, 783.99, 1046.5];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const start = context.currentTime + index * 0.055;
        oscillator.type = kind === 'aperture' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        if (kind === 'aperture') oscillator.frequency.exponentialRampToValueAtTime(660, start + 0.3);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.025, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        oscillator.connect(gain); gain.connect(context.destination);
        this.voices.add(oscillator);
        oscillator.onended = () => {
          oscillator.disconnect(); gain.disconnect(); this.voices.delete(oscillator);
          if (!this.voices.size && this.monitor) { clearInterval(this.monitor); this.monitor = null; }
        };
        oscillator.start(start); oscillator.stop(start + 0.42);
      });
      // Recorded or read-aloud speech always takes priority over cosmetic effects.
      this.monitor = setInterval(() => { if (!this.allowed()) this.stop(); }, 25);
    } catch { this.stop(); }
  }

  private stop(): void {
    if (this.monitor) { clearInterval(this.monitor); this.monitor = null; }
    for (const oscillator of this.voices) { try { oscillator.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
    const context = this.context; this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  dispose(): void {
    this.disposed = true; this.stop(); this.unsubscribe();
    if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', this.visibility);
  }
}
