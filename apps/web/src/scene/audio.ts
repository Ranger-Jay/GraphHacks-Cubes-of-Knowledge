import type { ScenePhase } from '@cubes/contracts';
import type { AgentVisualConfig } from './types';
import { isApprovedOutageNotice } from './dialogue';

let audioMuted = true;

export function isAudioMuted(): boolean {
  return audioMuted;
}

export function setAudioMuted(muted: boolean): void {
  audioMuted = muted;
  if (muted) {
    cancelSpeech();
  }
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore synthesis cancellation failure in headless or unsupported environments
    }
  }
}

/** Ready speech, or the approved graph-outage line. Every other phrase is refused. */
export function speakAuthorizedPhrase(
  phrase: string,
  agent: AgentVisualConfig,
  phase: ScenePhase | undefined,
  onEnd?: () => void
): () => void {
  const allowed = phase === 'READY' || (phase === 'GRAPH_UNAVAILABLE' && isApprovedOutageNotice(phrase));
  if (!allowed) return () => {};
  return speakPhrase(phrase, agent, onEnd);
}

export function speakPhrase(
  phrase: string,
  agent: AgentVisualConfig,
  onEnd?: () => void
): () => void {
  // If muted or in non-browser environment, don't synthesize audio, invoke onEnd cleanly
  if (audioMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return () => {};
  }

  try {
    window.speechSynthesis.cancel(); // Prevent audio queue buildup on rapid clicks
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.pitch = agent.speechPitch;
    utterance.rate = agent.speechRate;
    
    // Choose appropriate voice if available
    const voices = window.speechSynthesis.getVoices?.() || [];
    if (voices.length > 0) {
      // Fallback selector by agent characteristic
      if (agent.id === 'ava') {
        const femaleVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha')));
        if (femaleVoice) utterance.voice = femaleVoice;
      } else {
        const maleVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Alex')));
        if (maleVoice) utterance.voice = maleVoice;
      }
    }

    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }

    window.speechSynthesis.speak(utterance);
    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe cancellation
      }
    };
  } catch {
    return () => {};
  }
}
