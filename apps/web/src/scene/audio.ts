import type { AgentId, ScenePhase } from '@cubes/contracts';
import type { AgentVisualConfig } from './types';
import {
  AUDIO_BASE_PATH,
  findClipByAgentRole,
  findClipByAgentTranscript,
  findClipByFile,
  normalizeTranscript,
  type AudioClip,
  type AudioClipRole,
} from './audioClips';

let audioMuted = true;
let activeAudio: HTMLAudioElement | null = null;
let activeClipFile: string | null = null;
/** Agent that owns the active clip. Cancellation is scoped to this owner. */
let activeAgentId: AgentId | null = null;
let activeReadAloud: { utterance: SpeechSynthesisUtterance; agentId: AgentId; onEnd?: () => void } | null = null;
const muteListeners = new Set<() => void>();

export function subscribeAudioMuted(listener: () => void): () => void {
  muteListeners.add(listener);
  return () => { muteListeners.delete(listener); };
}

export type SpeakOptions = {
  onEnd?: () => void;
  /** Required for recovery clips. Ordinary/outage clips ignore this flag. */
  recoveryAuthorized?: boolean;
};

export function isAudioMuted(): boolean {
  return audioMuted;
}

export function getActiveClipFile(): string | null {
  return activeClipFile;
}

/** Agent that owns the active clip, or null when nothing is playing. */
export function getActiveAgentId(): AgentId | null {
  return activeAgentId;
}

/** Presentation-only query: cosmetic effects must yield to both recorded and local read-aloud speech. */
export function isSpeechActive(): boolean {
  return activeAudio !== null || activeReadAloud !== null;
}

export function setAudioMuted(muted: boolean): void {
  const changed = audioMuted !== muted;
  audioMuted = muted;
  if (muted) {
    cancelSpeech();
  }
  if (changed) for (const listener of [...muteListeners]) listener();
}

/** Stop browser synthesis leftovers and any active WAV element. */
export function cancelSpeech(): void {
  const reading = activeReadAloud;
  activeReadAloud = null;
  if (reading) {
    reading.utterance.onend = null;
    reading.utterance.onerror = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore synthesis cancellation failure in headless or unsupported environments
    }
  }
  cancelActiveAudioElement();
  reading?.onEnd?.();
}

/** Only installed/local-service voices; never silently route live company text to a remote TTS service. */
export function localReadAloudVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  try { return window.speechSynthesis.getVoices().filter(v => v.localService === true); }
  catch { return []; }
}

/** Explicit read-aloud, separate from recorded persona clips. The caller supplies current READY text. */
export function readCurrentExplanation(text: string, agentId: AgentId, voiceURI: string, phase: ScenePhase,
  onEnd?: () => void): { started: boolean; stop: () => void } {
  const refused = { started: false, stop: () => {} };
  if (audioMuted || phase !== 'READY' || typeof window === 'undefined' || !window.speechSynthesis
    || typeof SpeechSynthesisUtterance === 'undefined' || globalThis.navigator?.userActivation?.isActive !== true
    || text.trim().length === 0 || text.length > 1_200) return refused;
  // Re-resolve at click time: the selected device voice may have disappeared since the menu rendered.
  const voice = localReadAloudVoices().find(v => v.voiceURI === voiceURI);
  if (!voice) return refused;
  cancelSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = voice.lang;
  utterance.rate = 1; utterance.pitch = 1;
  const reading = { utterance, agentId, ...(onEnd ? { onEnd } : {}) };
  activeReadAloud = reading;
  const finish = () => {
    if (activeReadAloud !== reading) return;
    activeReadAloud = null;
    onEnd?.();
  };
  utterance.onend = finish; utterance.onerror = finish;
  try { window.speechSynthesis.speak(utterance); }
  catch { finish(); return refused; }
  return { started: true, stop: () => { if (activeReadAloud === reading) cancelSpeech(); } };
}

/** Cancel the active WAV element only. Synthesis leftovers are not agent-owned. */
function cancelActiveAudioElement(): void {
  if (activeAudio) {
    try {
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Safe cancellation
    }
    activeAudio = null;
  }
  activeClipFile = null;
  activeAgentId = null;
}

/**
 * Cancel the active clip only when it belongs to `agentId`.
 * A closed sibling pyramid or a stale timer for another agent must never
 * cancel a clip it does not own.
 */
export function cancelSpeechForAgent(agentId: AgentId): void {
  if (activeReadAloud?.agentId === agentId) { cancelSpeech(); return; }
  if (activeAgentId !== agentId) return;
  cancelActiveAudioElement();
}

function clipUrl(clip: AudioClip): string {
  return `${AUDIO_BASE_PATH}/${clip.file}`;
}

function gateAllows(clip: AudioClip, phase: ScenePhase | undefined, recoveryAuthorized: boolean): boolean {
  if (clip.kind === 'ordinary') {
    return phase === 'READY';
  }
  if (clip.kind === 'outage') {
    return phase === 'GRAPH_UNAVAILABLE';
  }
  // recovery
  return phase === 'READY' && recoveryAuthorized === true;
}

/** Cancel the active WAV when the current phase no longer allows that clip. */
export function enforcePhaseGate(phase: ScenePhase | undefined, recoveryAuthorized = false): void {
  if (activeReadAloud && phase !== 'READY') cancelSpeech();
  if (!activeClipFile) return;
  const clip = findClipByFile(activeClipFile);
  if (!clip || !gateAllows(clip, phase, recoveryAuthorized)) {
    cancelSpeech();
  }
}

function playClip(clip: AudioClip, agentId: AgentId, onEnd?: () => void): () => void {
  // WAV playback needs Audio; headless tests inject FakeAudio. Mute still refuses.
  if (audioMuted || typeof Audio === 'undefined') {
    return () => {};
  }

  cancelSpeech();

  try {
    const audio = new Audio(clipUrl(clip));
    activeAudio = audio;
    activeClipFile = clip.file;
    activeAgentId = agentId;

    const finish = () => {
      // Cancelled or superseded clips must not fire onEnd (AbortError after pause).
      if (activeAudio !== audio) return;
      activeAudio = null;
      activeClipFile = null;
      activeAgentId = null;
      onEnd?.();
    };

    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(() => {
      finish();
    });

    return () => {
      if (activeAudio === audio) {
        cancelSpeech();
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * Ready ordinary WAV, approved outage WAV on GRAPH_UNAVAILABLE, or recovery WAV when
 * recoveryAuthorized is true after a real recovery / fresh authorized analysis.
 */
export function speakAuthorizedPhrase(
  phrase: string,
  agent: AgentVisualConfig,
  phase: ScenePhase | undefined,
  onEndOrOptions?: (() => void) | SpeakOptions
): () => void {
  const options: SpeakOptions =
    typeof onEndOrOptions === 'function' ? { onEnd: onEndOrOptions } : onEndOrOptions ?? {};
  const clip = findClipByAgentTranscript(agent.id, phrase);
  if (!clip) return () => {};
  if (!gateAllows(clip, phase, options.recoveryAuthorized === true)) return () => {};
  return playClip(clip, agent.id, options.onEnd);
}

/** Resolve and play by accepted clip role. Same phase/recovery gates as speakAuthorizedPhrase. */
export function speakAuthorizedClip(
  agentId: AgentId,
  role: AudioClipRole,
  phase: ScenePhase | undefined,
  options: SpeakOptions = {}
): () => void {
  const clip = findClipByAgentRole(agentId, role);
  if (!clip) return () => {};
  if (!gateAllows(clip, phase, options.recoveryAuthorized === true)) return () => {};
  return playClip(clip, agentId, options.onEnd);
}

/** Recovery-only entry: refuses unless READY and recoveryAuthorized. */
export function speakRecoveryClip(
  agentId: AgentId,
  phase: ScenePhase | undefined,
  recoveryAuthorized: boolean,
  onEnd?: () => void
): () => void {
  if (!recoveryAuthorized || phase !== 'READY') return () => {};
  // Guz has no recovery master in the accepted 29; refuse rather than invent.
  if (agentId === 'guz') return () => {};
  const role: AudioClipRole = agentId === 'ava' ? 'reconnect_check' : 'ready';
  const options: SpeakOptions = { recoveryAuthorized: true };
  if (onEnd) options.onEnd = onEnd;
  return speakAuthorizedClip(agentId, role, phase, options);
}

export function isApprovedOutageTranscript(agentId: AgentId, phrase: string): boolean {
  const clip = findClipByAgentRole(agentId, 'outage');
  if (!clip) return false;
  return normalizeTranscript(clip.transcript) === normalizeTranscript(phrase);
}

/** @deprecated Prefer WAV path; kept so older call sites cancel cleanly. */
export function speakPhrase(
  _phrase: string,
  agent: AgentVisualConfig,
  onEnd?: () => void
): () => void {
  // No ungated synthesis fallback: recorded masters only.
  void _phrase;
  void agent;
  void onEnd;
  return () => {};
}
