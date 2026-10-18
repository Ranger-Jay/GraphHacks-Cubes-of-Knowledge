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

const SPACE_SCENE_ADAPTER_STYLES = `
/* Scoped Space Scene & Solar Core Styles (Self-Contained, Zero Tailwind Dependency) */
.space-scene-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
  max-height: 100%;
  overflow: hidden;
  background-color: #020617;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #e2e8f0;
  user-select: none;
  box-sizing: border-box;
}

.space-scene-root *,
.space-scene-root .solar-core-modal-overlay * {
  box-sizing: border-box;
}

.space-scene-root [hidden],
.space-scene-root .hidden,
.space-scene-root .solar-core-modal-overlay[hidden],
.space-scene-root .solar-core-modal-overlay.hidden,
.space-scene-root .solar-panel-phase-overlay[hidden],
.space-scene-root .solar-panel-phase-overlay.hidden {
  display: none !important;
}

.space-scene-root .space-scene-viewport {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.space-scene-root .space-scene-hud {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem;
}

.space-scene-root .space-hud-topbar,
.space-scene-root .space-hud-bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  pointer-events: auto;
}

.space-scene-root .space-hud-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Badges & Scene Hints */
.space-scene-root .space-phase-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
}

.space-scene-root .cube-switch-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
}

.space-scene-root .space-phase-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
}

/* Disconnected Cube Card */
.space-scene-root .disconnected-cube-card {
  position: absolute;
  top: 4.5rem;
  right: 1rem;
  z-index: 20;
  max-width: 22rem;
  padding: 1rem;
  border-radius: 1rem;
  background: rgba(2, 6, 23, 0.95);
  border: 1px solid rgba(225, 29, 72, 0.8);
  color: #fecdd3;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.space-scene-root .btn-back-main-cube {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(22, 78, 99, 0.9);
  border: 1px solid rgba(6, 182, 212, 0.8);
  color: #a5f3fc;
  font-size: 0.75rem;
  font-weight: 700;
  transition: all 0.15s ease;
  cursor: pointer;
}
.space-scene-root .btn-back-main-cube:hover {
  background: rgba(21, 94, 117, 0.95);
  border-color: #22d3ee;
  color: #ffffff;
}

.space-scene-root button:disabled,
.space-scene-root button[disabled] {
  opacity: 0.38 !important;
  cursor: not-allowed !important;
  pointer-events: none !important;
}

/* Outage Banner */
.space-scene-root .outage-banner {
  align-self: center;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 1rem;
  background: rgba(76, 5, 25, 0.95);
  border: 1px solid #e11d48;
  color: #fecdd3;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
  pointer-events: auto;
}

/* Buttons */
.space-scene-root .btn-solar-core {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(69, 26, 3, 0.85);
  border: 1px solid rgba(245, 158, 11, 0.6);
  color: #fcd34d;
  font-size: 0.75rem;
  font-weight: 700;
  transition: all 0.15s ease;
  cursor: pointer;
}
.space-scene-root .btn-solar-core:hover {
  background: rgba(120, 53, 15, 0.95);
  border-color: #fbbf24;
}

.space-scene-root .btn-mute-toggle {
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 0.75rem;
  font-weight: 700;
  transition: all 0.15s ease;
  cursor: pointer;
}
.space-scene-root .btn-mute-toggle:hover {
  color: #ffffff;
  border-color: #64748b;
}

.space-scene-root .btn-refresh {
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(22, 78, 99, 0.8);
  border: 1px solid rgba(6, 182, 212, 0.6);
  color: #67e8f9;
  font-size: 0.75rem;
  font-weight: 700;
  transition: all 0.15s ease;
  cursor: pointer;
}
.space-scene-root .btn-refresh:hover {
  background: rgba(21, 94, 117, 0.9);
  border-color: #22d3ee;
}

.space-scene-root .btn-agent-roy,
.space-scene-root .btn-agent-ava,
.space-scene-root .btn-agent-guz {
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  transition: all 0.15s ease;
  cursor: pointer;
}
.space-scene-root .btn-agent-roy {
  background: rgba(69, 26, 3, 0.8);
  border: 1px solid rgba(245, 158, 11, 0.6);
  color: #fcd34d;
}
.space-scene-root .btn-agent-roy:hover { background: rgba(120, 53, 15, 0.9); }

.space-scene-root .btn-agent-ava {
  background: rgba(59, 7, 100, 0.8);
  border: 1px solid rgba(168, 85, 247, 0.6);
  color: #d8b4fe;
}
.space-scene-root .btn-agent-ava:hover { background: rgba(88, 28, 135, 0.9); }

.space-scene-root .btn-agent-guz {
  background: rgba(6, 78, 59, 0.8);
  border: 1px solid rgba(16, 185, 129, 0.6);
  color: #6ee7b7;
}
.space-scene-root .btn-agent-guz:hover { background: rgba(4, 120, 87, 0.9); }

/* Solar Core Modal Overlay (Fixed, centered, backdrop blurred) */
.space-scene-root .solar-core-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
}

.space-scene-root .solar-core-modal-content {
  position: relative;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  background: rgba(2, 6, 23, 0.98);
  border: 1px solid rgba(245, 158, 11, 0.6);
  border-radius: 1.5rem;
  padding: 1.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-family: ui-monospace, monospace;
  color: #e2e8f0;
  overflow: hidden;
}

.space-scene-root .solar-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
  padding-bottom: 0.75rem;
}

.space-scene-root .solar-panel-close-btn {
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid #334155;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 0.75rem;
  transition: all 0.15s ease;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.space-scene-root .solar-panel-close-btn:hover {
  border-color: #f59e0b;
  color: #ffffff;
}

.space-scene-root .solar-panel-body {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1rem;
  flex: 1 1 auto;
  overflow: hidden;
  min-height: 360px;
}
@media (max-width: 768px) {
  .space-scene-root .solar-panel-body {
    grid-template-columns: 1fr;
  }
}

.space-scene-root .solar-panel-svg-container {
  background: rgba(15, 23, 42, 0.8);
  border-radius: 1rem;
  border: 1px solid #1e293b;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.space-scene-root .solar-panel-svg {
  width: 100%;
  height: 100%;
  max-height: 420px;
  user-select: none;
}

.space-scene-root .solar-panel-phase-overlay {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  text-align: center;
}

.space-scene-root .solar-panel-sidebar {
  background: rgba(15, 23, 42, 0.6);
  border-radius: 1rem;
  border: 1px solid rgba(30, 41, 59, 0.8);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow-y: auto;
  max-height: 440px;
  font-size: 0.75rem;
}

.space-scene-root .solar-source-btn {
  width: 100%;
  text-align: left;
  padding: 0.5rem;
  border-radius: 0.5rem;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #334155;
  transition: all 0.15s ease;
  cursor: pointer;
  margin-bottom: 0.375rem;
}
.space-scene-root .solar-source-btn:hover {
  background: rgba(51, 65, 85, 0.8);
  border-color: #22d3ee;
}
`;

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

  // Multi-Cube Focus State ('main' | 'disconnected')
  private currentCubeFocus: 'main' | 'disconnected' = 'main';
  private handleKeyDownBound: ((e: KeyboardEvent) => void) | null = null;

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
    this.rootEl.setAttribute('tabindex', '0');
    this.container.appendChild(this.rootEl);

    // Injected scoped stylesheet (P1-2 Self-contained, zero Tailwind dependency)
    const styleEl = document.createElement('style');
    styleEl.id = 'space-scene-adapter-styles';
    styleEl.textContent = SPACE_SCENE_ADAPTER_STYLES;
    this.rootEl.appendChild(styleEl);

    // Three.js viewport container
    this.threeContainer = document.createElement('div');
    this.threeContainer.className = 'space-scene-viewport absolute inset-0 z-0 overflow-hidden';
    this.threeContainer.setAttribute('tabindex', '0');
    this.rootEl.appendChild(this.threeContainer);

    // Top and Bottom HUD DOM Layer
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'space-scene-hud absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4';
    this.hudEl.innerHTML = `
      <!-- Top HUD Bar -->
      <div class="space-hud-topbar flex items-center justify-between gap-3 pointer-events-auto">
        <div class="space-hud-group flex items-center gap-2">
          <!-- Runtime Phase Badge -->
          <div class="space-phase-badge flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-bold shadow">
            <span class="space-phase-dot w-2 h-2 rounded-full bg-slate-400"></span>
            <span class="space-phase-label">CHECKING</span>
          </div>

          <!-- Cube Switch Scene Hint -->
          <div class="cube-switch-hint flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-mono text-slate-300 shadow">
            <span>⌨️</span>
            <span>Tab: switch cube</span>
          </div>

          <!-- Solar Core Access Button -->
          <button type="button" class="btn-solar-core flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/60 text-amber-300 hover:border-amber-400 hover:bg-amber-900 text-xs font-bold transition shadow cursor-pointer" title="Open Solar Core 2D Topology Panel">
            <span>☀️</span>
            <span>SOLAR CORE</span>
          </button>
        </div>

        <div class="space-hud-group flex items-center gap-2">
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

      <!-- Disconnected Cube Comparison Card (Shown when inspecting disconnected cube) -->
      <div class="disconnected-cube-card hidden absolute top-16 right-4 z-20 max-w-sm p-4 rounded-2xl bg-slate-950/95 border border-rose-600/80 text-rose-200 shadow-2xl backdrop-blur pointer-events-auto" hidden>
        <div class="flex items-center gap-2 mb-2">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span class="text-[11px] font-bold uppercase tracking-wider text-rose-400">Disconnected Cube</span>
        </div>
        <div class="text-sm font-bold text-white mb-1">No database connected</div>
        <p class="text-xs text-slate-300 leading-relaxed mb-3">
          Information unavailable. Connect FalkorDB to use this cube.
        </p>
        <button type="button" class="btn-back-main-cube px-3 py-1.5 rounded-xl bg-cyan-950/90 border border-cyan-500/80 text-cyan-200 hover:bg-cyan-900 text-xs font-bold transition shadow cursor-pointer">
          ⬅ Back to main cube
        </button>
      </div>

      <!-- Outage Banner (Visible in GRAPH_UNAVAILABLE) -->
      <div class="outage-banner hidden self-center px-4 py-2 rounded-2xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs font-bold shadow-2xl flex items-center gap-2" hidden>
        <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
        <span>GRAPH UNAVAILABLE • Zero-Write Audit Lock Active • All Current Proof Cleared</span>
      </div>

      <!-- Bottom Dock / Agent Persona Triggers -->
      <div class="space-hud-bottombar flex items-center justify-between gap-3 pointer-events-auto">
        <div class="space-hud-group flex items-center gap-2">
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
      onCubeFocusChange: (focus) => {
        this.handleCubeFocusChange(focus);
      },
    });

    // Wire Keyboard Navigation (Canvas-scoped Tab)
    this.handleKeyDownBound = this.handleKeyDown.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDownBound);
    }

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

    // Back to Main Cube Button
    const backBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-back-main-cube');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        this.setCubeFocus('main');
      });
    }

    // Solar Core Button -> opens shared 2D panel
    const solarBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-solar-core');
    if (solarBtn) {
      solarBtn.addEventListener('click', (e) => {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        this.openSolarPanel(solarBtn);
      });
    }

    // Refresh Button -> emits REFRESH
    const refreshBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        this.dispatchRefresh();
      });
    }

    // Audio Mute Toggle -> emits SET_AUDIO_MUTED
    const muteBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-mute-toggle');
    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        this.dispatchSetAudioMuted(!this.snapshot.audioMuted);
      });
    }

    // Agent Persona Buttons
    const agentBtns = this.hudEl.querySelectorAll<HTMLButtonElement>('[data-agent]');
    agentBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
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
        if (phaseBadge) phaseBadge.className = 'space-phase-badge phase-outage flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/90 border border-rose-600 text-xs font-bold text-rose-300 shadow';
        if (phaseDot) phaseDot.className = 'space-phase-dot dot-outage w-2 h-2 rounded-full bg-rose-500 animate-pulse';
        if (outageBanner) {
          outageBanner.classList.remove('hidden');
          (outageBanner as HTMLElement).hidden = false;
        }
      } else if (phase === 'READY') {
        if (phaseBadge) phaseBadge.className = 'space-phase-badge phase-ready flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-600 text-xs font-bold text-emerald-300 shadow';
        if (phaseDot) phaseDot.className = 'space-phase-dot dot-ready w-2 h-2 rounded-full bg-emerald-400';
        if (outageBanner) {
          outageBanner.classList.add('hidden');
          (outageBanner as HTMLElement).hidden = true;
        }
      } else {
        if (phaseBadge) phaseBadge.className = 'space-phase-badge phase-default flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-bold text-slate-300 shadow';
        if (phaseDot) phaseDot.className = 'space-phase-dot dot-default w-2 h-2 rounded-full bg-slate-400';
        if (outageBanner) {
          outageBanner.classList.add('hidden');
          (outageBanner as HTMLElement).hidden = true;
        }
      }

      // If disconnected cube is currently inspected, maintain its overlay and disabled states
      if (this.currentCubeFocus === 'disconnected') {
        const discCard = this.hudEl.querySelector<HTMLElement>('.disconnected-cube-card');
        const solarBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-solar-core');
        const refreshBtn = this.hudEl.querySelector<HTMLButtonElement>('.btn-refresh');
        const agentBtns = this.hudEl.querySelectorAll<HTMLButtonElement>('[data-agent]');
        if (discCard) {
          discCard.classList.remove('hidden');
          discCard.hidden = false;
        }
        if (solarBtn) solarBtn.setAttribute('disabled', 'true');
        if (refreshBtn) refreshBtn.setAttribute('disabled', 'true');
        agentBtns.forEach((b) => b.setAttribute('disabled', 'true'));
      }
    }
  }

  // --- Strict Event Dispatchers (Protocol Compliant & Multi-Cube Isolated) ---

  public async dispatchRefresh(): Promise<SpaceSceneDispatchResult> {
    if (this.currentCubeFocus === 'disconnected') return 'UNBOUND';
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'REFRESH',
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchNodeSelection(id: string): Promise<SpaceSceneDispatchResult> {
    if (this.currentCubeFocus === 'disconnected') return 'UNBOUND';
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
    if (this.currentCubeFocus === 'disconnected') return 'UNBOUND';
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'SELECT_SOURCE',
      id,
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchOpenIdea(id: string): Promise<SpaceSceneDispatchResult> {
    if (this.currentCubeFocus === 'disconnected') return 'UNBOUND';
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'OPEN_IDEA',
      id,
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchAgentTaskStart(agentId: AgentId): Promise<SpaceSceneDispatchResult> {
    if (this.currentCubeFocus === 'disconnected') return 'UNBOUND';
    const event: SpaceSceneEvent = {
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.snapshot.generation,
      type: 'AGENT_TASK_START',
      agentId,
    };
    return this.bridge.dispatch(event);
  }

  public async dispatchCloseAgent(agentId: AgentId): Promise<SpaceSceneDispatchResult> {
    if (this.currentCubeFocus === 'disconnected') return 'UNBOUND';
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

  // --- Verified Server Ingestion Read-Back Hook ---

  public handleVerifiedAdded(ideaId: string): void {
    if (this.isDestroyed) return;

    // Inform caller if direct listener was provided
    if (this.options.onAdded) {
      this.options.onAdded(ideaId);
    }

    if (!this.snapshot.audioMuted && this.options.audioPlayerBinding) {
      this.options.audioPlayerBinding.play('shockwave');
    }
  }

  // --- Multi-Cube Navigation & Focus API ---

  public getCubeFocus(): 'main' | 'disconnected' {
    return this.currentCubeFocus;
  }

  public setCubeFocus(focus: 'main' | 'disconnected'): void {
    if (this.threeRenderer) {
      this.threeRenderer.setCubeFocus(focus);
    }
    this.handleCubeFocusChange(focus);
  }

  public toggleCubeFocus(): void {
    this.setCubeFocus(this.currentCubeFocus === 'main' ? 'disconnected' : 'main');
  }

  private handleCubeFocusChange(focus: 'main' | 'disconnected'): void {
    this.currentCubeFocus = focus;

    const discCard = this.hudEl?.querySelector<HTMLElement>('.disconnected-cube-card');
    const solarBtn = this.hudEl?.querySelector<HTMLButtonElement>('.btn-solar-core');
    const refreshBtn = this.hudEl?.querySelector<HTMLButtonElement>('.btn-refresh');
    const agentBtns = this.hudEl?.querySelectorAll<HTMLButtonElement>('[data-agent]');

    if (focus === 'disconnected') {
      // 1. Withhold main-cube data panels
      if (this.solarPanel?.isPanelOpen()) {
        this.closeSolarPanel();
      }

      // 2. Show disconnected cube comparison card
      if (discCard) {
        discCard.classList.remove('hidden');
        discCard.hidden = false;
      }

      // 3. Disable main-cube data actions
      if (solarBtn) solarBtn.setAttribute('disabled', 'true');
      if (refreshBtn) refreshBtn.setAttribute('disabled', 'true');
      agentBtns?.forEach((b) => b.setAttribute('disabled', 'true'));
    } else {
      // Returning to main cube
      if (discCard) {
        discCard.classList.add('hidden');
        discCard.hidden = true;
      }

      if (solarBtn) solarBtn.removeAttribute('disabled');
      if (refreshBtn) refreshBtn.removeAttribute('disabled');
      agentBtns?.forEach((b) => b.removeAttribute('disabled'));

      // Restore appropriate current view from snapshot
      this.update(this.snapshot);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;

    // Never intercept while typing in an input, textarea, select, or editable element
    const active = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    const target = e.target as HTMLElement | null;

    const isEditable = (el: HTMLElement | null) => {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        el.isContentEditable ||
        el.getAttribute?.('contenteditable') === 'true'
      );
    };

    if (isEditable(target) || isEditable(active)) return;

    // Never intercept inside active dialogs or modals
    if (this.solarPanel?.isPanelOpen()) return;
    if (active?.closest?.('.solar-core-modal-overlay') || active?.closest?.('[role="dialog"]')) return;

    // Only intercept if keyboard focus is within the scene container or canvas
    const isSceneFocused =
      this.container?.contains(active) ||
      this.container === active ||
      this.rootEl?.contains(active) ||
      this.rootEl === active ||
      this.threeContainer?.contains(active) ||
      this.threeContainer === active;

    if (isSceneFocused) {
      e.preventDefault();
      this.toggleCubeFocus();
    }
  }

  // --- Solar Panel API ---

  public openSolarPanel(opener?: HTMLElement | null): void {
    if (this.currentCubeFocus === 'disconnected') return;
    this.lastSolarOpener = opener ?? null;
    this.solarPanel?.open(opener);
  }

  public closeSolarPanel(): void {
    this.solarPanel?.close();
  }

  public getSnapshot(): SpaceSceneSnapshot {
    return this.snapshot;
  }

  public getThreeRenderer(): SceneThreeRenderer | null {
    return this.threeRenderer;
  }

  public getSolarPanel(): SolarCorePanel | null {
    return this.solarPanel;
  }

  public isMounted(): boolean {
    return !this.isDestroyed;
  }

  public unmount(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.handleKeyDownBound && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDownBound);
      this.handleKeyDownBound = null;
    }

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
