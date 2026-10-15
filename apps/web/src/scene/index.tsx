import React, { useRef, useState } from 'react';
import type { AgentId, SceneData, ScenePhase, SceneRuntimeContext } from '@cubes/contracts';
import { AGENT_CONFIGS } from './dialogue';
import { AgentPyramid } from './AgentPyramid';
import { CompanyCube } from './CompanyCube';
import { HumanAvatars } from './HumanAvatars';
import { isAudioMuted, setAudioMuted } from './audio';
import './scene.css';

export interface SceneProps {
  data: SceneData;
  onSelectNode: (id: string) => void;
  reducedMotion: boolean;
  onAgentTaskStart?: ((agentId: AgentId) => Promise<boolean> | boolean) | undefined;
  /**
   * Derived by the web shell from the current probe + read. Absent fails closed to CHECKING (docs/scene-state-v019.md):
   * no ordinary speech, no proof, and no claim that the database is down.
   */
  runtime?: SceneRuntimeContext | undefined;
}

/**
 * System caption per phase. Used whenever the caption on screen was written under a different phase, so a line spoken
 * in READY (or an outage notice) never lingers after the phase changes, and "Systems ready" is shown only in READY.
 * ACCESS_DENIED and NOT_FOUND reuse PR #31's blocked-phase captions. CHECKING, UNAVAILABLE and GRAPH_UNAVAILABLE are
 * PROPOSED COPY pending Buddy's ruling (v021.07); neutral wording, never "disconnected" or "severed".
 */
export const SYSTEM_CAPTIONS: Record<ScenePhase, string> = {
  READY: 'Systems ready. Standing by for command.',
  CHECKING: 'Checking the graph...',
  ACCESS_DENIED: 'Access denied.',
  NOT_FOUND: 'The requested release is missing.',
  UNAVAILABLE: 'Graph status unavailable.',
  GRAPH_UNAVAILABLE: 'Graph unavailable. Answers and proof are unavailable.',
};
export interface SceneCaption { text: string; speaker: string; phase: ScenePhase }
/** A caption is shown only under the phase that wrote it; otherwise the neutral System caption for the current phase. */
export function resolveCaption(caption: SceneCaption | null, phase: ScenePhase): { text: string; speaker: string } {
  if (caption && caption.phase === phase) return { text: caption.text, speaker: caption.speaker };
  return { text: SYSTEM_CAPTIONS[phase], speaker: 'System' };
}

export const CompanyCubeScene: React.FC<SceneProps> = ({
  data,
  onSelectNode,
  reducedMotion,
  onAgentTaskStart,
  runtime,
}) => {
  // One resolved context for every child, so the cube and the pyramids can never disagree about the phase.
  const sceneRuntime: SceneRuntimeContext = runtime ?? { phase: 'CHECKING' };
  // Agent pyramid open/close states (Ava open by default for immediate interaction)
  const [openPyramids, setOpenPyramids] = useState<Record<AgentId, boolean>>({
    ava: true,
    roy: false,
    guz: false,
  });

  // Audio mute state (Muted by default per specification)
  const [muted, setMutedState] = useState<boolean>(() => isAudioMuted());

  // Live accessible caption state
  const [rawCaption, setRawCaption] = useState<SceneCaption | null>(null);
  // A phase change drops the old caption during render, so a READY line cannot come back after an outage and recovery.
  const [seenPhase, setSeenPhase] = useState<ScenePhase>(sceneRuntime.phase);
  if (seenPhase !== sceneRuntime.phase) {
    setSeenPhase(sceneRuntime.phase);
    setRawCaption(null);
  }
  const phaseRef = useRef<ScenePhase>(sceneRuntime.phase);
  phaseRef.current = sceneRuntime.phase;
  const caption = resolveCaption(rawCaption, sceneRuntime.phase);

  const togglePyramid = (id: AgentId) => {
    setOpenPyramids((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleToggleAudio = () => {
    const nextMuted = !muted;
    setAudioMuted(nextMuted);
    setMutedState(nextMuted);
  };

  const handleSetCaption = (text: string, speaker: string) => {
    setRawCaption({ text, speaker, phase: phaseRef.current });
  };

  const agentsList: AgentId[] = ['ava', 'roy', 'guz'];

  return (
    <section
      className="company-cube-scene-root"
      aria-label="Cubes of Knowledge Interactive Scene"
      data-scene="cube-scene"
      data-status={data.status}
    >
      {/* Top Header & Audio Bar */}
      <div className="scene-top-bar">
        <div className="scene-title-group">
          <h3>Cubes of Knowledge Scene</h3>
          <span className="muted">
            Company brain on FalkorDB • Luminous Blue Lattice &amp; Agent Pyramids
          </span>
        </div>

        <div className="scene-action-bar">
          <button
            type="button"
            className="audio-toggle-btn"
            onClick={handleToggleAudio}
            aria-pressed={!muted}
            aria-label={muted ? 'Enable Agent Voice Audio' : 'Mute Agent Voice Audio'}
          >
            <span
              className={`audio-indicator ${!muted ? 'audio-active' : ''}`}
              aria-hidden="true"
            />
            <span>{muted ? 'Audio Muted (Click to Enable)' : 'Audio Enabled'}</span>
          </button>
        </div>
      </div>

      {/* Accessible Caption Bar */}
      <div
        className="scene-caption-banner"
        role="status"
        aria-live="polite"
        data-testid="scene-caption"
      >
        <span className="caption-speaker">[{caption.speaker}]:</span>
        <span className="caption-text">“{caption.text}”</span>
      </div>

      {/* Main Grid: Company Cube & Agent Pyramids */}
      <div className="scene-layout-grid">
        {/* Left: Company Cube Isometric Space */}
        <div className="cube-panel-col">
          <CompanyCube
            data={data}
            onSelectNode={onSelectNode}
            reducedMotion={reducedMotion}
            runtime={sceneRuntime}
          />
        </div>

        {/* Right: Agent Pyramids Deck */}
        <div className="pyramids-deck" role="region" aria-label="Agent Pyramids">
          {agentsList.map((agentId, index) => {
            const config = AGENT_CONFIGS[agentId];
            return (
              <AgentPyramid
                key={agentId}
                agent={config}
                isOpen={openPyramids[agentId]}
                onToggleOpen={() => togglePyramid(agentId)}
                sceneData={data}
                reducedMotion={reducedMotion}
                staggerIndex={index}
                onSetCaption={handleSetCaption}
                onAgentTaskStart={onAgentTaskStart}
                runtime={sceneRuntime}
              />
            );
          })}
        </div>
      </div>

      {/* Human Authorities Panel (Kanny & Serena) */}
      <HumanAvatars reducedMotion={reducedMotion} />

      {/* Text Alternative for Screen Readers & Non-Visual Access */}
      <nav aria-label="Scene text alternative" className="scene-text-fallback">
        <strong>Graph Proof State:</strong> {data.status} | <strong>Nodes:</strong>{' '}
        {data.status === 'AVAILABLE' ? data.nodes.length : 0} displayed |{' '}
        <strong>Selected Node:</strong>{' '}
        {data.status === 'AVAILABLE' ? (data.selectedNodeId ?? 'None') : 'None'}
      </nav>
    </section>
  );
};

export default CompanyCubeScene;
