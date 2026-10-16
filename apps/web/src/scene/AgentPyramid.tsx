import React, { useState, useEffect, useRef } from 'react';
import type { AgentId, SceneData, ScenePhase, SceneRuntimeContext } from '@cubes/contracts';
import type { AgentVisualConfig, ExpressionId, VisemeId } from './types';
import {
  blockedStatusCaption,
  findVisemeAtTime,
  getNextTaskStartPhrase,
  isApprovedOutageNotice,
  normalSpeechAllowed,
  agentPhrase,
} from './dialogue';
import { AgentPortrait } from './AgentPortrait';
import { speakAuthorizedPhrase, cancelSpeechForAgent, getActiveAgentId, enforcePhaseGate } from './audio';
import type { PhraseDefinition } from './types';

// Module-level session greeting set (persists across remounts within the same session)
const SESSION_GREETED_AGENTS = new Set<AgentId>();

export function resetSessionGreetings(): void {
  SESSION_GREETED_AGENTS.clear();
}

/**
 * Pure task execution gate: validates that the scene is in an AVAILABLE state,
 * that an application task handler is bound, that no concurrent task is in flight,
 * and that the handler resolves strictly true before any acknowledgment phrase can play.
 */
export function taskButtonLabel(
  status: SceneData['status'],
  phase: ScenePhase | undefined,
  bound: boolean,
  inFlight: boolean
): string {
  if (inFlight) return 'Starting...';
  if (!bound) return 'Task Unbound';
  const resolved = phase ?? 'CHECKING';
  if (resolved !== 'READY') {
    if (resolved === 'GRAPH_UNAVAILABLE') return 'Task Blocked (Outage)';
    if (resolved === 'ACCESS_DENIED') return 'Task Blocked (Access)';
    if (resolved === 'NOT_FOUND') return 'Task Blocked (Not Found)';
    if (resolved === 'UNAVAILABLE') return 'Task Blocked (Unavailable)';
    return 'Task Blocked (Checking)';
  }
  if (status !== 'AVAILABLE') return 'Task Blocked (Unverified)';
  return 'Start Task';
}

export async function executeAgentTaskStart(
  agentId: AgentId,
  status: SceneData['status'],
  onAgentTaskStart?: ((agentId: AgentId) => Promise<boolean> | boolean) | undefined,
  inFlight = false,
  phase?: ScenePhase
): Promise<boolean> {
  if (phase !== undefined && phase !== 'READY') {
    return false;
  }
  if (status !== 'AVAILABLE' || !onAgentTaskStart || inFlight) {
    return false;
  }
  try {
    return (await onAgentTaskStart(agentId)) === true;
  } catch {
    return false;
  }
}

interface AgentPyramidProps {
  agent: AgentVisualConfig;
  isOpen: boolean;
  onToggleOpen: () => void;
  sceneData: SceneData;
  reducedMotion: boolean;
  staggerIndex: number;
  onSetCaption: (caption: string, agentName: string) => void;
  onAgentTaskStart?: ((agentId: AgentId) => Promise<boolean> | boolean) | undefined;
  onTaskClickHandlerCapture?: ((handler: (e?: { stopPropagation?: () => void }) => Promise<void>) => void) | undefined;
  /** Absent context fails closed to CHECKING. It does not mean the database is down. */
  runtime?: SceneRuntimeContext | undefined;
}

export const AgentPyramid: React.FC<AgentPyramidProps> = ({
  agent,
  isOpen,
  onToggleOpen,
  sceneData,
  reducedMotion,
  staggerIndex,
  onSetCaption,
  onAgentTaskStart,
  onTaskClickHandlerCapture,
  runtime,
}) => {
  const phase: ScenePhase = runtime?.phase ?? 'CHECKING';
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [viseme, setViseme] = useState<VisemeId>('rest');
  const [expression, setExpression] = useState<ExpressionId>('idle');
  const [taskCycleIndex, setTaskCycleIndex] = useState(0);
  const [isTaskStarting, setIsTaskStarting] = useState(false);
  const isTaskStartingRef = useRef(false);

  const animationTimerRef = useRef<number | null>(null);
  const speechCancelRef = useRef<(() => void) | null>(null);

  // Clear timers and cancel this pyramid's own speech only.
  // A global cancel here would kill another agent's clip (closed siblings
  // on mount, or a stale animation timer after a newer clip superseded).
  const stopActiveSpeech = () => {
    if (animationTimerRef.current !== null) {
      clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    if (speechCancelRef.current) {
      speechCancelRef.current();
      speechCancelRef.current = null;
    }
    cancelSpeechForAgent(agent.id);
    setIsSpeaking(false);
    setViseme('rest');
    setExpression('idle');
  };

  // Play a phrase with viseme synchronization and caption.
  // Completion is driven by the audio element's `ended` event (via onEnd),
  // never by a duration timer: the timer only animates visemes, and a
  // stale timer must never cancel a newer clip.
  const playPhrase = (
    phraseDef: PhraseDefinition,
    onFinish?: () => void
  ) => {
    const current = phaseRef.current;
    const outageLine = isApprovedOutageNotice(phraseDef.phrase);
    if (!normalSpeechAllowed(current) && !(current === 'GRAPH_UNAVAILABLE' && outageLine)) {
      return;
    }
    stopActiveSpeech(); // Prevent audio queue buildup

    setIsSpeaking(true);
    setExpression(phraseDef.expression);
    onSetCaption(phraseDef.phrase, agent.name);

    // Speak via audio manager (respects muted state and the phase gate).
    // Natural end (or load error) stops the animation and resets speaking state.
    speechCancelRef.current = speakAuthorizedPhrase(phraseDef.phrase, agent, current, () => {
      stopActiveSpeech();
      if (onFinish) onFinish();
    });

    // Refused clips (muted, gated, no Audio) start nothing: do not leave
    // the pyramid in a speaking state with a dangling timer.
    if (getActiveAgentId() !== agent.id) {
      stopActiveSpeech();
      return;
    }

    const startTime = Date.now();
    animationTimerRef.current = (setInterval as any)(() => {
      // Ownership left this pyramid (cancelled, muted, or superseded by a
      // newer clip): stop animating. Never cancel audio from this timer.
      if (getActiveAgentId() !== agent.id) {
        stopActiveSpeech();
        return;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= phraseDef.durationMs) {
        // Viseme animation is done; the WAV keeps playing until `ended`.
        setViseme('rest');
        return;
      }
      setViseme(findVisemeAtTime(phraseDef.visemes, elapsed));
    }, 40);
  };

  const showBlockedCaption = () => {
    const current = phaseRef.current;
    if (normalSpeechAllowed(current)) return;
    stopActiveSpeech();
    const caption = blockedStatusCaption(agent.id, current);
    if (!caption) return;
    onSetCaption(caption, agent.name);
    if (current === 'GRAPH_UNAVAILABLE') {
      speechCancelRef.current = speakAuthorizedPhrase(caption, agent, current);
    }
  };

  // Trigger 1: First opening an agent's pyramid in the session, only while READY.
  useEffect(() => {
    if (!isOpen) {
      stopActiveSpeech();
      return;
    }
    if (!normalSpeechAllowed(phase)) return;
    if (!SESSION_GREETED_AGENTS.has(agent.id)) {
      SESSION_GREETED_AGENTS.add(agent.id);
      playPhrase(agentPhrase(agent.id, 'greeting'));
    }
    return () => {
      if (!isOpen) stopActiveSpeech();
    };
  }, [isOpen, agent.id, phase]);

  // Phase change: drop clips the new phase does not allow (outage must stop on READY).
  // Blocked phases still show only the approved notice.
  useEffect(() => {
    if (!isOpen) return;
    enforcePhaseGate(phase);
    if (normalSpeechAllowed(phase)) return;
    showBlockedCaption();
  }, [isOpen, phase, agent.id]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopActiveSpeech();
    };
  }, []);

  // Trigger 2: Clicking the avatar once while its pyramid is already open
  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent pyramid toggle
    if (!isOpen) return;
    if (!normalSpeechAllowed(phaseRef.current)) {
      showBlockedCaption();
      return;
    }
    playPhrase(agentPhrase(agent.id, 'help'));
  };

  // Trigger 3: Confirmed affirmative
  const handleAffirmative = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!normalSpeechAllowed(phaseRef.current)) {
      showBlockedCaption();
      return;
    }
    playPhrase(agentPhrase(agent.id, 'yes'));
  };

  // Trigger 4: Confirmed negative
  const handleNegative = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!normalSpeechAllowed(phaseRef.current)) {
      showBlockedCaption();
      return;
    }
    playPhrase(agentPhrase(agent.id, 'no'));
  };

  // Trigger 5: Actual task start (strictly guarded by application truth with synchronous in-flight lock)
  const handleTaskStart = async (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (
      phaseRef.current !== 'READY' ||
      isTaskStartingRef.current ||
      isTaskStarting ||
      sceneData.status !== 'AVAILABLE' ||
      !onAgentTaskStart
    ) {
      // Presentation truth & concurrency lock: ignore rapid synchronous clicks and unverified states
      return;
    }
    isTaskStartingRef.current = true;
    setIsTaskStarting(true);
    try {
      const started = await executeAgentTaskStart(
        agent.id,
        sceneData.status,
        onAgentTaskStart,
        false,
        phaseRef.current
      );
      if (started && phaseRef.current === 'READY') {
        const { phraseDef, nextIndex } = getNextTaskStartPhrase(taskCycleIndex, agent.id);
        setTaskCycleIndex(nextIndex);
        playPhrase(phraseDef);
      }
    } finally {
      isTaskStartingRef.current = false;
      setIsTaskStarting(false);
    }
  };

  if (onTaskClickHandlerCapture) {
    onTaskClickHandlerCapture(handleTaskStart);
  }

  return (
    <article
      className={`agent-pyramid-slot pyramid-${agent.id} ${isOpen ? 'pyramid-open' : 'pyramid-closed'}`}
      data-testid={`pyramid-${agent.id}`}
      style={{
        borderColor: agent.circuitryColor,
        boxShadow: isOpen ? `0 0 16px ${agent.glowColor}` : 'none',
      }}
    >
      {/* Pyramid Header / Toggle Button */}
      <button
        type="button"
        className="pyramid-toggle-btn"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-label={`${agent.name} Pyramid - ${isOpen ? 'Open' : 'Closed'}`}
        style={{ borderBottomColor: isOpen ? agent.circuitryColor : 'transparent' }}
      >
        <span
          className="pyramid-circuit-badge"
          style={{ backgroundColor: agent.circuitryColor }}
          aria-hidden="true"
        />
        <span className="pyramid-agent-title">{agent.name}</span>
        <span className="pyramid-agent-role muted">({agent.role})</span>
        <span className="pyramid-indicator" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Inside the Open Pyramid */}
      {isOpen && (
        <div className="pyramid-interior">
          {/* Avatar Area (Clicking when open triggers 'how may I help') */}
          <button
            type="button"
            className="avatar-interactive-wrapper"
            onClick={handleAvatarClick}
            aria-label={`Interact with ${agent.name}. Ask for assistance.`}
            title="Click avatar for assistance"
          >
            <AgentPortrait
              agent={agent}
              viseme={viseme}
              expression={expression}
              reducedMotion={reducedMotion}
              isSpeaking={isSpeaking}
              staggerIndex={staggerIndex}
            />
          </button>

          {/* Scripted & Verified Action Trigger Buttons */}
          <div className="pyramid-controls">
            <button
              type="button"
              className="pyramid-btn-help"
              onClick={handleAvatarClick}
              title="Trigger help prompt"
            >
              Ask Help
            </button>
            <button
              type="button"
              className="pyramid-btn-affirm"
              onClick={handleAffirmative}
              title="Scripted affirmative expression demo (not an authorization grant)"
            >
              Affirm (Demo)
            </button>
            <button
              type="button"
              className="pyramid-btn-negative"
              onClick={handleNegative}
              title="Scripted negative expression demo (not a recorded denial)"
            >
              Deny (Demo)
            </button>
            <button
              type="button"
              className="pyramid-btn-task"
              onClick={handleTaskStart}
              disabled={
                phase !== 'READY' ||
                sceneData.status !== 'AVAILABLE' ||
                !onAgentTaskStart ||
                isTaskStarting ||
                isTaskStartingRef.current
              }
              title={taskButtonLabel(sceneData.status, phase, Boolean(onAgentTaskStart), isTaskStarting)}
            >
              {taskButtonLabel(sceneData.status, phase, Boolean(onAgentTaskStart), isTaskStarting)}
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
