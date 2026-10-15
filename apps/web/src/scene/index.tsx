import React, { useState } from 'react';
import type { AgentId, SceneData, SceneRuntimeContext } from '@cubes/contracts';
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
  const [caption, setCaption] = useState<{ text: string; speaker: string }>({
    text: 'Systems ready. Standing by for command.',
    speaker: 'System',
  });

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
    setCaption({ text, speaker });
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
