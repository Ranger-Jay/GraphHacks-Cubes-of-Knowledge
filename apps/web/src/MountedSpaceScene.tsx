import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentId } from '@cubes/contracts';
import type { SceneProps } from './components/SceneMount';
import { focusSource } from './components/AnalysisView';
import { TalkPanel } from './components/TalkPanel';
import { createSpaceSceneHost, waitingSceneIdeaIds } from './spaceSceneHost';
import { mount, type SpaceSceneInstance } from './scene/space';
import { cancelSpeech, cancelSpeechForAgent, enforcePhaseGate, setAudioMuted, speakAuthorizedClip, speakRecoveryClip } from './scene/audio';
import { findClipByAgentRole } from './scene/audioClips';
import type { StudioSnapshot } from './studio/studioController';

const EMPTY_STUDIO: StudioSnapshot = { env: { phase: 'CHECKING', access: 'UNKNOWN' }, pool: { status: 'idle', overview: null, ideas: [] }, open: null };
const noSubscribe = () => () => {};
const emptyStudio = () => EMPTY_STUDIO;
const AGENTS: AgentId[] = ['roy', 'ava', 'guz'];

/** The real shell owns requests, import confirmation and recorded audio; the renderer owns geometry. */
export function MountedSpaceScene(props: SceneProps) {
  const container = useRef<HTMLDivElement>(null);
  const agentHeading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef<SpaceSceneInstance | null>(null);
  const host = useRef<ReturnType<typeof createSpaceSceneHost> | null>(null);
  const latest = useRef(props);
  const [muted, setMuted] = useState(true);
  const [agent, setAgent] = useState<AgentId | null>(null);
  const [caption, setCaption] = useState('');
  const [mountError, setMountError] = useState(false);
  const studio = props.space?.studio;
  const pool = useSyncExternalStore(studio?.controller.subscribe ?? noSubscribe, studio?.controller.getSnapshot ?? emptyStudio, studio?.controller.getSnapshot ?? emptyStudio);
  const phase = props.runtime?.phase ?? 'CHECKING';

  useLayoutEffect(() => { latest.current = props; });
  useLayoutEffect(() => {
    if (!container.current) return;
    setAudioMuted(true);
    const h = createSpaceSceneHost({
      onRefresh: () => latest.current.space?.onRefresh?.(),
      onSelectNode: id => latest.current.onSelectNode(id),
      onSelectSource: id => focusSource({ preventDefault() {} }, id),
      onOpenIdea: id => latest.current.space?.studio?.controller.open(id),
      // Opening the agent never requests a model completion; Explain remains explicit.
      onAgentTaskStart: id => {
        setAgent(id);
        setCaption(findClipByAgentRole(id, 'greeting')?.transcript ?? '');
        speakAuthorizedClip(id, 'greeting', h.view().runtime.phase);
      },
      onCloseAgent: id => { cancelSpeechForAgent(id); setAgent(previous => previous === id ? null : previous); },
      onSetAudioMuted: value => {
        // Unmuting must originate while the browser reports transient user activation.
        if (!value && globalThis.navigator?.userActivation?.isActive !== true) return;
        setAudioMuted(value); setMuted(value);
      },
    });
    host.current = h;
    try {
      // No audioPlayerBinding: the adapter's invented chime/shockwave names are not approved clips.
      mounted.current = mount(container.current, h.bridge, h.view(), {
        onCubeFocusChange: focus => {
          if (focus === 'disconnected') { setAgent(null); setCaption(''); cancelSpeech(); }
        },
        onAddedBinding: listener => latest.current.space?.studio?.subscribeAdded?.(listener) ?? (() => {}),
        onAdded: () => latest.current.space?.onRefresh?.(),
      });
      if (!container.current.querySelector('canvas')) setMountError(true);
    } catch { setMountError(true); }
    return () => {
      h.dispose(); mounted.current?.unmount(); mounted.current = null;
      host.current = null; setAudioMuted(true); cancelSpeech();
    };
  }, []);

  useLayoutEffect(() => {
    const snapshot = host.current?.update({
      generation: props.space?.generation ?? 0,
      ...(props.runtime ? { runtime: props.runtime } : {}),
      analysis: props.space?.analysis ?? null, selectedNodeId: props.data.selectedNodeId,
      ideaIds: waitingSceneIdeaIds(pool),
      reducedMotion: props.reducedMotion, audioMuted: muted,
      recoveryAuthorized: props.space?.recovered === true,
    });
    if (snapshot) { mounted.current?.update(snapshot); enforcePhaseGate(snapshot.runtime.phase, snapshot.recoveryAuthorized); }
  }, [props, muted, pool]);

  useLayoutEffect(() => { setCaption(''); if (phase !== 'READY') setAgent(null); }, [phase]);
  useLayoutEffect(() => { agentHeading.current?.focus(); }, [agent]);

  const closeAgent = () => {
    const h = host.current;
    if (agent && h) void h.bridge.dispatch({ protocol: h.view().protocol, generation: h.view().generation, type: 'CLOSE_AGENT', agentId: agent });
  };
  const preview = (id: AgentId, role: 'greeting' | 'help' | 'outage') => {
    const current = host.current?.view();
    if (!current) return;
    setCaption(findClipByAgentRole(id, role)?.transcript ?? '');
    speakAuthorizedClip(id, role, current.runtime.phase);
  };
  const currentAnalysis = phase === 'READY' && props.space?.analysis?.status === 'AVAILABLE'
    ? props.space.analysis : null;

  return <div className="mounted-space-experience">
    <div ref={container} className="mounted-space-canvas" data-testid="mounted-space-scene" />
    {mountError && <p role="alert">3D rendering is unavailable. Use Solar Core and the graph text view to inspect current information.</p>}
    {agent && <section className="panel agent-preview" aria-label={`${agent} voice preview`} onKeyDown={e => { if (e.key === 'Escape') closeAgent(); }}>
      <h3 ref={agentHeading} tabIndex={-1}>{agent.toUpperCase()}</h3>
      <p>Recorded voice preview. Ask this agent to explain the current graph evidence below; source records remain in the analysis panel.</p>
      {currentAnalysis && <TalkPanel key={`${props.space?.generation ?? 0}:${currentAnalysis.revision}:${agent}`} analysis={currentAnalysis} agent={agent} />}
      <button type="button" onClick={() => preview(agent, 'greeting')}>Greeting</button>{' '}
      <button type="button" onClick={() => preview(agent, 'help')}>Help</button>{' '}
      {props.space?.recovered && agent !== 'guz' && phase === 'READY' && <button type="button" onClick={() => {
        const current = host.current?.view();
        if (current) speakRecoveryClip(agent, current.runtime.phase, current.recoveryAuthorized);
      }}>Hear verified recovery notice</button>}{' '}
      <button type="button" onClick={closeAgent}>Close agent</button>
    </section>}
    {phase === 'GRAPH_UNAVAILABLE' && <div aria-label="Recorded outage notices">{AGENTS.map(id => <button key={id} type="button" onClick={() => preview(id, 'outage')}>{id.toUpperCase()} outage notice</button>)}</div>}
    {caption && <p role="status" className="voice-caption">{caption}</p>}
  </div>;
}
