import { SPACE_SCENE_PROTOCOL } from '@cubes/contracts';
import type {
  AgentId,
  SpaceSceneDispatchResult,
  SpaceSceneEvent,
  SpaceSceneSnapshot,
} from '@cubes/contracts';
import type { SpaceSceneBridge, SpaceSceneInstance, SpaceSceneMountOptions } from './types.js';
import { SolarCorePanel } from './SolarCorePanel.js';
import { SceneThreeRenderer } from './SceneThreeRenderer.js';

export class SpaceSceneAdapter implements SpaceSceneInstance {
  private container: HTMLElement;
  private bridge: SpaceSceneBridge;
  private options: SpaceSceneMountOptions;
  private snapshot: SpaceSceneSnapshot;

  private rootEl: HTMLElement | null = null;
  private threeContainer: HTMLElement | null = null;
  private hudEl: HTMLElement | null = null;
  private threeRenderer: SceneThreeRenderer | null = null;
  private solarPanel: SolarCorePanel | null = null;

  private unbindAddedListener: (() => void) | null = null;
  private isDestroyed = false;

  // Opener element cache for focus restoration
  private lastSolarOpener: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    bridge: SpaceSceneBridge,
    initialSnapshot?: SpaceSceneSnapshot,
    options: SpaceSceneMountOptions = {}
  ) {
    this.container = container;
    this.bridge = bridge;
    this.options = options;

    // Use initial snapshot or read from bridge if available
    if (initialSnapshot) {
      this.snapshot = initialSnapshot;
    } else if (this.bridge.readCurrent) {
      this.snapshot = this.bridge.readCurrent();
    } else {
      // Default initial snapshot failing-closed to CHECKING
      this.snapshot = {
        protocol: SPACE_SCENE_PROTOCOL,
        generation: 0,
        runtime: { phase: 'CHECKING' },
        data: { status: 'UNAVAILABLE', nodes: [], edges: [], selectedNodeId: null },
        summary: null,
        clearance: null,
        evidence: [],
        sources: [],
        ideaIds: [],
        reducedMotion: false,
        audioMuted: true,
        recoveryAuthorized: false,
      };
    }

    this.mount();
  }

  private mount(): void {
    if (typeof document === 'undefined') {
      // Headless node environment
      return;
    }

    // Root wrapper
    this.rootEl = document.createElement('div');
    this.rootEl.className =
      'space-scene-root relative w-full h-full min-h-[500px] overflow-hidden bg-slate-950 font-mono text-slate-200 select-none';
    this.container.appendChild(this.rootEl);

    // Three.js viewport container
    this.threeContainer = document.createElement('div');
    this.threeContainer.className = 'absolute inset-0 z-0 overflow-hidden';
    this.rootEl.appendChild(this.threeContainer);

    // Top and Bottom HUD DOM Layer
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4';
    this.hudEl.innerHTML = `
      <!-- Top HUD Bar -->
      <div class="flex items-center justify-between gap-3 pointer-events-auto">
        <div class="flex items-center gap-2">
          <!-- Runtime Phase Badge -->
          <div class="space-phase-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-bold shadow">
            <span class="space-phase-dot w-2 h-2 rounded-full bg-slate-400"></span>
            <span class="space-phase-label">CHECKING</span>
          </div>

          <!-- Solar Core Access Button -->
          <button type="button" class="btn-solar-core flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/60 text-amber-300 hover:border-amber-400 hover:bg-amber-900 text-xs font-bold transition shadow cursor-pointer" title="Open Solar Core 2D Topology Panel">
            <span>☀️</span>
            <span>SOLAR CORE</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <!-- Audio Mute Toggle Button -->
          <button type="button" class="btn-mute-toggle px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold transition shadow cursor-pointer">
            <span class="mute-label">MUTED</span>
          </button>

          <!-- Refresh Button -->
          <button type="button" class="btn-refresh px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/60 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900 text-xs font-bold transition shadow cursor-pointer" title="Request Authoritative Graph Refresh">
            <span>🔄 REFRESH</span>
          </button>
        </div>
      </div>

      <!-- Outage Banner (Visible in GRAPH_UNAVAILABLE) -->
      <div class="outage-banner hidden self-center px-4 py-2 rounded-2xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs font-bold shadow-2xl flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
        <span>GRAPH UNAVAILABLE • Zero-Write Audit Lock Active • All Current Proof Cleared</span>
      </div>

      <!-- Bottom Dock / Agent Persona Triggers -->
      <div class="flex items-center justify-between gap-3 pointer-events-auto">
        <div class="flex items-center gap-2">
          <button type="button" class="btn-agent-roy px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/60 text-amber-300 hover:bg-amber-900 text-xs font-bold transition cursor-pointer" data-agent="roy">
            ROY [1]
          </button>
          <button type="button" class="btn-agent-ava px-3 py-1.5 rounded-xl bg-purple-950/80 border border-purple-500/60 text-purple-300 hover:bg-purple-900 text-xs font-bold transition cursor-pointer" data-agent="ava">
            AVA [2]
          </button>
          <button type="button" class="btn-agent-guz px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 hover:bg-emerald-900 text-xs font-bold transition cursor-pointer" data-agent="guz">
            GUZ [3]
          </button>
        </div>

        <div class="text-[10px] text-slate-500">
          <span class="hud-generation">Gen: 0</span>
        </div>
      </div>
    `;
    this.rootEl.appendChild(this.hudEl);

    // Shared 2D Solar Core Panel Modal
    this.solarPanel = new SolarCorePanel(this.rootEl, this.bridge, this.options);

    // Three.js Scene Renderer
    this.threeRenderer = new SceneThreeRenderer(this.threeContainer, {
      onSunClick: () => {
        // Clicking central sun opens the SAME shared 2D panel
        const sunBtn = this.hudEl?.querySelector<HTMLButtonElement>('.btn-solar-core');
        this.openSolarPanel(sunBtn);
      },
      onNodeClick: (nodeId) => {
        this.dispatchNodeSelection(nodeId);
      },
      onAgentClick: (agentId) => {
        this.dispatchAgentTaskStart(agentId);
      },
      onCometClick: (ideaId) => {
        this.dispatchOpenIdea(ideaId);
      },
    });

    // Wire HUD Controls
    this.wireHUDControls();

    // Wire external verified server read-back hook if supplied
    if (this.options.onAddedBinding) {
      this.unbindAddedListener = this.options.onAddedBinding((ideaId) => {
        this.handleVerifiedAdded(ideaId);
      });
    }

    // Initial render
    this.update(this.snapshot);
  }

  private wireHUDControls(): void {
    if (!this.hudEl) return;

    // Solar Core Button -> opens shared 2D panel
    const solarBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-solar-core');
    if (solarBtn) {
      solarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSolarPanel(solarBtn);
      });
    }

    // Refresh Button -> emits REFRESH
    const refreshBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchRefresh();
      });
    }

    // Audio Mute Toggle -> emits SET_AUDIO_MUTED
    const muteBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-mute-toggle');
    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchSetAudioMuted(!this.snapshot.audioMuted);
      });
    }

    // Agent Persona Buttons
    const agentBtns = this.hudEl.querySelectorAll<HTMLButtonElement>('[data-agent]');
    agentBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const agent = btn.getAttribute('data-agent') as AgentId;
        if (agent === 'ava' || agent === 'roy' || agent === 'guz') {
          this.dispatchAgentTaskStart(agent);
        }
      });
    });
  }

  public update(snapshot: SpaceSceneSnapshot): void {
    if (this.isDestroyed) return;
    this.snapshot = snapshot;

    // Update Three.js scene
    if (this.threeRenderer) {
      this.threeRenderer.update(snapshot);
    }

    // Update 2D Solar Panel
    if (this.solarPanel) {
      this.solarPanel.update(snapshot);
    }

    // Update HUD Elements
    if (this.hudEl) {
      const phaseBadge = this.hudEl.querySelector('.space-phase-badge');
      const phaseDot = this.hudEl.querySelector('.space-phase-dot');
      const phaseLabel = this.hudEl.querySelector('.space-phase-label');
      const outageBanner = this.hudEl.querySelector('.outage-banner');
      const muteLabel = this.hudEl.querySelector('.mute-label');
      const genLabel = this.hudEl.querySelector('.hud-generation');

      const phase = snapshot.runtime.phase;
      if (phaseLabel) phaseLabel.textContent = phase;
      if (genLabel) genLabel.textContent = `Gen: ${snapshot.generation}`;
      if (muteLabel) muteLabel.textContent = snapshot.audioMuted ? 'MUTED' : 'UNMUTED';

      if (phase === 'GRAPH_UNAVAILABLE') {
        if (phaseBadge) phaseBadge.className = 'space-phase-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/90 border border-rose-600 text-xs font-bold text-rose-300 shadow';
        if (phaseDot) phaseDot.className = 'space-phase-dot w-2 h-2 rounded-full bg-rose-500 animate-pulse';
        if (outageBanner) outageBanner.classList.remove('hidden');
      } else if (phase === 'READY') {
        if (phaseBadge) phaseBadge.className = 'space-phase-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-600 text-xs font-bold text-emerald-300 shadow';
        if (phaseDot) phaseDot.className = 'space-phase-dot w-2 h-2 rounded-full bg-emerald-400';
        if (outageBanner) outageBanner.classList.add('hidden');
      } else {
        if (phaseBadge) phaseBadge.className = 'space-phase-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-bold text-slate-300 shadow';
        if (phaseDot) phaseDot.className = 'space-phase-dot w-2 h-2 rounded-full bg-slate-400';
        if (outageBanner) outageBanner.classList.add('hidden');
      }
    }
  }

  // --- Strict Event Dispatchers (Protocol Compliant) ---

  public async dispatchRefresh(): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'REFRESH',
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchNodeSelection(id: string): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'SELECT_NODE',
      id,
    };
    const res = await this.bridge.dispatch(event);
    if (res === 'DISPATCHED' && !this.snapshot.audioMuted && this.options.audioPlayerBinding) {
      this.options.audioPlayerBinding.play('chime');
    }
    return res;
  }

  public async dispatchSourceSelection(id: string): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'SELECT_SOURCE',
      id,
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchOpenIdea(id: string): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'OPEN_IDEA',
      id,
    };
    // DISPATCHED only delivers callback; it NEVER triggers ingestion or removal!
    return this.bridge.dispatch(event);
  }

  public async dispatchAgentTaskStart(agentId: AgentId): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'AGENT_TASK_START',
      agentId,
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchCloseAgent(agentId: AgentId): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'CLOSE_AGENT',
      agentId,
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchSetAudioMuted(muted: boolean): Promise<SpaceSceneDispatchResult> {
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'SET_AUDIO_MUTED',
      muted,
    };
    return this.bridge.dispatch(event);
  }

  // --- Verified Server Read-Back Handler ---
  public handleVerifiedAdded(ideaId: string): void {
    // Only called when the controller confirms verified server read-back!
    if (this.options.onAdded) {
      this.options.onAdded(ideaId);
    }
    if (!this.snapshot.audioMuted && this.options.audioPlayerBinding) {
      this.options.audioPlayerBinding.play('shockwave');
    }
  }

  // --- Solar Panel API ---

  public openSolarPanel(opener?: HTMLElement | null): void {
    this.lastSolarOpener = opener ?? null;
    this.solarPanel?.open(opener);
  }

  public closeSolarPanel(): void {
    this.solarPanel?.close();
  }

  public getSnapshot(): SpaceSceneSnapshot {
    return this.snapshot;
  }

  public isMounted(): boolean {
    return !this.isDestroyed;
  }

  public unmount(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.unbindAddedListener) {
      this.unbindAddedListener();
      this.unbindAddedListener = null;
    }

    if (this.solarPanel) {
      this.solarPanel.dispose();
      this.solarPanel = null;
    }

    if (this.threeRenderer) {
      this.threeRenderer.dispose();
      this.threeRenderer = null;
    }

    if (this.rootEl && this.rootEl.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }

    this.rootEl = null;
    this.threeContainer = null;
    this.hudEl = null;
    this.lastSolarOpener = null;
  }
}
