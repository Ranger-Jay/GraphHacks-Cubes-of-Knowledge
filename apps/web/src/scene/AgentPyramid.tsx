import React, { useState, useEffect, useRef } from 'react';
import type { AgentId, SceneData } from '@cubes/contracts';
import type { AgentVisualConfig, ExpressionId, VisemeId } from './types';
import {
  PHRASE_GREETING,
  PHRASE_HELP,
  PHRASE_AFFIRMATIVE,
  PHRASE_NEGATIVE,
  getNextTaskStartPhrase,
  findVisemeAtTime,
} from './dialogue';
import { AgentPortrait } from './AgentPortrait';
import { speakPhrase, cancelSpeech } from './audio';

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
export async function executeAgentTaskStart(
  agentId: AgentId,
  status: SceneData['status'],
  onAgentTaskStart?: ((agentId: AgentId) => Promise<boolean> | boolean) | undefined,
  inFlight = false
): Promise<boolean> {
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
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [viseme, setViseme] = useState<VisemeId>('rest');
  const [expression, setExpression] = useState<ExpressionId>('idle');
  const [taskCycleIndex, setTaskCycleIndex] = useState(0);
  const [isTaskStarting, setIsTaskStarting] = useState(false);
  const isTaskStartingRef = useRef(false);

  const animationTimerRef = useRef<number | null>(null);
  const speechCancelRef = useRef<(() => void) | null>(null);

  // Clear timers and cancel speech
  const stopActiveSpeech = () => {
    if (animationTimerRef.current !== null) {
      window.clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    if (speechCancelRef.current) {
      speechCancelRef.current();
      speechCancelRef.current = null;
    }
    cancelSpeech();
    setIsSpeaking(false);
    setViseme('rest');
    setExpression('idle');
  };

  // Play a phrase with viseme synchronization and caption
  const playPhrase = (
    phraseDef: typeof PHRASE_GREETING,
    onFinish?: () => void
  ) => {
    stopActiveSpeech(); // Prevent audio queue buildup

    setIsSpeaking(true);
    setExpression(phraseDef.expression);
    onSetCaption(phraseDef.phrase, agent.name);

    // Speak via audio manager (respects muted state)
    speechCancelRef.current = speakPhrase(phraseDef.phrase, agent, () => {
      // Audio finished
    });

    const startTime = Date.now();
    animationTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= phraseDef.durationMs) {
        stopActiveSpeech();
        if (onFinish) onFinish();
      } else {
        const nextViseme = findVisemeAtTime(phraseDef.visemes, elapsed);
        setViseme(nextViseme);
      }
    }, 40);
  };

  // Trigger 1: First opening an agent's pyramid in the session (persists across component remounts)
  useEffect(() => {
    if (isOpen && !SESSION_GREETED_AGENTS.has(agent.id)) {
      SESSION_GREETED_AGENTS.add(agent.id);
      playPhrase(PHRASE_GREETING);
    } else if (!isOpen) {
      stopActiveSpeech();
    }
    // Cleanup on unmount or close
    return () => {
      if (!isOpen) stopActiveSpeech();
    };
  }, [isOpen, agent.id]);

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
    playPhrase(PHRASE_HELP);
  };

  // Trigger 3: Confirmed affirmative
  const handleAffirmative = (e: React.MouseEvent) => {
    e.stopPropagation();
    playPhrase(PHRASE_AFFIRMATIVE);
  };

  // Trigger 4: Confirmed negative
  const handleNegative = (e: React.MouseEvent) => {
    e.stopPropagation();
    playPhrase(PHRASE_NEGATIVE);
  };

  // Trigger 5: Actual task start (strictly guarded by application truth with synchronous in-flight lock)
  const handleTaskStart = async (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (isTaskStartingRef.current || isTaskStarting || sceneData.status !== 'AVAILABLE' || !onAgentTaskStart) {
      // Presentation truth & concurrency lock: ignore rapid synchronous clicks and unverified states
      return;
    }
    isTaskStartingRef.current = true;
    setIsTaskStarting(true);
    try {
      const started = await executeAgentTaskStart(agent.id, sceneData.status, onAgentTaskStart, false);
      if (started) {
        const { phraseDef, nextIndex } = getNextTaskStartPhrase(taskCycleIndex);
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
              disabled={sceneData.status !== 'AVAILABLE' || !onAgentTaskStart || isTaskStarting || isTaskStartingRef.current}
              title={
                sceneData.status !== 'AVAILABLE'
                  ? 'Task start blocked: database offline or unverified'
                  : !onAgentTaskStart
                  ? 'Task start disabled: no application task handler configured'
                  : isTaskStarting || isTaskStartingRef.current
                  ? 'Task execution in flight...'
                  : 'Trigger verified task start cycle'
              }
            >
              {sceneData.status !== 'AVAILABLE'
                ? 'Task Blocked (Outage)'
                : !onAgentTaskStart
                ? 'Task Unbound'
                : isTaskStarting || isTaskStartingRef.current
                ? 'Starting...'
                : 'Start Task'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
