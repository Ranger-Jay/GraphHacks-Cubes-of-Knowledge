import { SPACE_SCENE_PROTOCOL } from '@cubes/contracts';
import type { SpaceSceneBridge, SpaceSceneMountOptions } from './types.js';
import type { SpaceSceneSnapshot } from '@cubes/contracts';

export class SolarCorePanel {
  private container: HTMLElement;
  private bridge: SpaceSceneBridge;
  private options: SpaceSceneMountOptions;
  private modalEl: HTMLElement | null = null;
  private currentSnapshot: SpaceSceneSnapshot | null = null;
  private selectedNodeId: string | null = null;
  private lastOpener: HTMLElement | null = null;
  private isOpen = false;
  private handleKeyDownBound: (e: KeyboardEvent) => void;

  constructor(
    container: HTMLElement,
    bridge: SpaceSceneBridge,
    options: SpaceSceneMountOptions = {}
  ) {
    this.container = container;
    this.bridge = bridge;
    this.options = options;
    this.handleKeyDownBound = this.handleKeyDown.bind(this);
    this.buildDOM();
  }

  private buildDOM(): void {
    if (typeof document === 'undefined') return;

    const modal = document.createElement('div');
    modal.className =
      'solar-core-modal-overlay hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-opacity duration-200';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Solar Core 2D Constellation Graph');

    modal.innerHTML = `
      <div class="solar-core-modal-content relative w-full max-w-4xl max-h-[90vh] bg-slate-950/95 border border-amber-500/60 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 font-mono text-slate-200 overflow-hidden">
        <div class="flex items-center justify-between border-b border-amber-500/30 pb-3">
          <div class="flex items-center gap-3">
            <span class="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_#ffb300]"></span>
            <div>
              <div class="text-[10px] uppercase tracking-widest text-amber-400 font-bold">FalkorDB • 2D Topology</div>
              <h2 class="text-base font-black text-white flex items-center gap-2">
                <span>Solar Core &amp; Constellation</span>
                <span class="solar-panel-node-count text-xs px-2 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500/40">0 NODES</span>
              </h2>
            </div>
          </div>
          <button type="button" class="solar-panel-close-btn px-3 py-1.5 rounded-xl border border-slate-700 hover:border-amber-400 bg-slate-900 text-xs text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5" title="Close Panel [ESC]">
            <span>✕</span>
            <span>CLOSE</span>
          </button>
        </div>

        <div class="solar-panel-body grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 overflow-hidden min-h-[360px]">
          <div class="md:col-span-8 bg-slate-900/80 rounded-2xl border border-slate-800 p-2 flex items-center justify-center relative overflow-hidden">
            <svg class="solar-panel-svg w-full h-full max-h-[420px] select-none" viewBox="0 0 600 600"></svg>
            <div class="solar-panel-phase-overlay hidden absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
              <span class="solar-panel-phase-badge text-sm px-3 py-1 rounded border font-bold mb-2">CHECKING</span>
              <p class="solar-panel-phase-msg text-xs text-slate-400 max-w-sm"></p>
            </div>
          </div>

          <div class="md:col-span-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col justify-between overflow-y-auto max-h-[440px] text-xs">
            <div class="space-y-3">
              <div class="flex items-center justify-between border-b border-slate-800 pb-2">
                <span class="text-[11px] font-bold text-cyan-400 uppercase">Selected Proof</span>
                <span class="solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-300">NONE</span>
              </div>
              <div>
                <div class="text-[10px] text-slate-400 uppercase">Node ID / Label:</div>
                <div class="solar-panel-detail-title font-bold text-white text-sm">Central Solar Core</div>
              </div>
              <div>
                <div class="text-[10px] text-slate-400 uppercase">Supporting Sources:</div>
                <div class="solar-panel-sources-list space-y-1.5 mt-1 max-h-36 overflow-y-auto"></div>
              </div>
            </div>
            <div class="solar-panel-generation text-[9px] text-slate-500 pt-2 border-t border-slate-800/80">
              Generation: 0
            </div>
          </div>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    const closeBtn = modal.querySelector<HTMLButtonElement>('.solar-panel-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    this.container.appendChild(modal);
    this.modalEl = modal;
  }

  public update(snapshot: SpaceSceneSnapshot): void {
    this.currentSnapshot = snapshot;
    if (this.isOpen) {
      this.render();
    }
  }

  public open(opener?: HTMLElement | null): void {
    if (!this.modalEl) return;
    this.lastOpener = opener ?? (document.activeElement as HTMLElement) ?? null;
    this.isOpen = true;
    this.modalEl.classList.remove('hidden');

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDownBound);
    }

    this.render();

    const closeBtn = this.modalEl.querySelector<HTMLButtonElement>('.solar-panel-close-btn');
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  public close(): void {
    if (!this.modalEl || !this.isOpen) return;
    this.isOpen = false;
    this.modalEl.classList.add('hidden');

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDownBound);
    }

    if (this.lastOpener && typeof this.lastOpener.focus === 'function') {
      this.lastOpener.focus();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  private render(): void {
    if (!this.modalEl || !this.currentSnapshot) return;
    const snap = this.currentSnapshot;
    const isReady = snap.runtime.phase === 'READY' && snap.data.status === 'AVAILABLE';

    const countEl = this.modalEl.querySelector('.solar-panel-node-count');
    const phaseOverlay = this.modalEl.querySelector<HTMLElement>('.solar-panel-phase-overlay');
    const phaseBadge = this.modalEl.querySelector<HTMLElement>('.solar-panel-phase-badge');
    const phaseMsg = this.modalEl.querySelector<HTMLElement>('.solar-panel-phase-msg');
    const svgEl = this.modalEl.querySelector<SVGSVGElement>('.solar-panel-svg');
    const genEl = this.modalEl.querySelector('.solar-panel-generation');
    const titleEl = this.modalEl.querySelector('.solar-panel-detail-title');
    const statusTag = this.modalEl.querySelector('.solar-panel-status-tag');
    const sourcesList = this.modalEl.querySelector('.solar-panel-sources-list');

    if (genEl) genEl.textContent = `Generation: ${snap.generation} • Protocol: ${snap.protocol}`;

    if (!isReady) {
      // In any non-READY phase, clear all current proof and show the real state
      if (countEl) countEl.textContent = '0 NODES';
      if (svgEl) svgEl.innerHTML = '';
      if (titleEl) titleEl.textContent = 'Proof Withheld';
      if (statusTag) {
        statusTag.textContent = snap.runtime.phase;
        statusTag.className =
          snap.runtime.phase === 'GRAPH_UNAVAILABLE'
            ? 'solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-rose-950 text-rose-300 border border-rose-600'
            : 'solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-300';
      }
      if (sourcesList) sourcesList.innerHTML = '<div class="text-slate-500 italic">No proof records active.</div>';

      if (phaseOverlay && phaseBadge && phaseMsg) {
        phaseOverlay.classList.remove('hidden');
        phaseBadge.textContent = snap.runtime.phase;
        if (snap.runtime.phase === 'GRAPH_UNAVAILABLE') {
          phaseBadge.className = 'solar-panel-phase-badge text-sm px-3 py-1 rounded border font-bold mb-2 bg-rose-950 text-rose-300 border-rose-500';
          phaseMsg.textContent = 'FalkorDB graph cluster is unavailable. Real-time topology proof is cleared and fail-closed.';
        } else if (snap.runtime.phase === 'CHECKING') {
          phaseBadge.className = 'solar-panel-phase-badge text-sm px-3 py-1 rounded border font-bold mb-2 bg-amber-950 text-amber-300 border-amber-500';
          phaseMsg.textContent = 'Probing authoritative graph runtime...';
        } else if (snap.runtime.phase === 'ACCESS_DENIED') {
          phaseBadge.className = 'solar-panel-phase-badge text-sm px-3 py-1 rounded border font-bold mb-2 bg-purple-950 text-purple-300 border-purple-500';
          phaseMsg.textContent = 'Graph access denied. Proof withheld.';
        } else {
          phaseBadge.className = 'solar-panel-phase-badge text-sm px-3 py-1 rounded border font-bold mb-2 bg-slate-900 text-slate-300 border-slate-700';
          phaseMsg.textContent = `Graph state: ${snap.runtime.phase}. All current proof cleared.`;
        }
      }
      return;
    }

    // In READY: render actual nodes, edges, and sources from returned snapshot
    if (phaseOverlay) phaseOverlay.classList.add('hidden');
    const nodes = snap.data.nodes;
    const edges = snap.data.edges;
    const sources = snap.sources;

    if (countEl) countEl.textContent = `${nodes.length} NODES`;
    if (statusTag) {
      statusTag.textContent = 'READY / AVAILABLE';
      statusTag.className = 'solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-600';
    }

    // Render 2D SVG radial topology layout
    if (svgEl) {
      const cx = 300;
      const cy = 300;
      const radius = 180;
      const nodeCoords = new Map<string, { x: number; y: number }>();

      // Layout nodes radially around central sun
      const nodeCount = Math.max(1, nodes.length);
      nodes.forEach((n, idx) => {
        const angle = (idx / nodeCount) * Math.PI * 2;
        const dist = radius * (0.55 + 0.45 * ((idx % 3) / 2));
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        nodeCoords.set(n.id, { x, y });
      });

      let svgContent = `
        <defs>
          <radialGradient id="solar-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
            <stop offset="40%" stop-color="#fbbf24" stop-opacity="0.9" />
            <stop offset="80%" stop-color="#ea580c" stop-opacity="0.7" />
            <stop offset="100%" stop-color="#7c2d12" stop-opacity="0" />
          </radialGradient>
        </defs>
        <!-- Background Orbits -->
        <circle cx="${cx}" cy="${cy}" r="100" fill="none" stroke="rgba(251,191,36,0.15)" stroke-dasharray="3,3" />
        <circle cx="${cx}" cy="${cy}" r="180" fill="none" stroke="rgba(251,191,36,0.12)" stroke-dasharray="4,4" />
      `;

      // Draw Edges
      edges.forEach((edge) => {
        const p1 = nodeCoords.get(edge.from);
        const p2 = nodeCoords.get(edge.to);
        if (p1 && p2) {
          svgContent += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="rgba(0,229,255,0.4)" stroke-width="1.2" />`;
        }
      });

      // Draw Central Sun Core
      svgContent += `
        <circle cx="${cx}" cy="${cy}" r="38" fill="url(#solar-center-glow)" />
        <circle cx="${cx}" cy="${cy}" r="18" fill="#fef08a" stroke="#f59e0b" stroke-width="2" />
        <text x="${cx}" y="${cy + 4}" fill="#78350f" font-size="10" font-weight="bold" text-anchor="middle">SUN</text>
      `;

      // Draw Nodes
      nodes.forEach((n) => {
        const pt = nodeCoords.get(n.id);
        if (!pt) return;
        const isSelected = snap.data.selectedNodeId === n.id || this.selectedNodeId === n.id;
        const color = isSelected ? '#ffffff' : '#f43f5e';
        const stroke = isSelected ? '#38bdf8' : '#fda4af';
        const r = isSelected ? 12 : 9;

        svgContent += `
          <g class="solar-node-group cursor-pointer" data-node-id="${n.id}">
            <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="${isSelected ? 3 : 1.5}" />
            <text x="${pt.x.toFixed(1)}" y="${(pt.y - 14).toFixed(1)}" fill="#94a3b8" font-size="9" text-anchor="middle">${n.label.slice(0, 14)}</text>
          </g>
        `;
      });

      svgEl.innerHTML = svgContent;

      // Wire SVG Node click listeners
      const groups = svgEl.querySelectorAll<SVGGElement>('.solar-node-group');
      groups.forEach((g) => {
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          const nodeId = g.getAttribute('data-node-id');
          if (nodeId) {
            this.handleNodeClick(nodeId);
          }
        });
      });
    }

    // Detail Panel
    const activeNode =
      nodes.find((n) => n.id === (this.selectedNodeId || snap.data.selectedNodeId)) || nodes[0];
    if (activeNode) {
      if (titleEl) titleEl.textContent = `${activeNode.label} (${activeNode.kind || 'RECORD'}) [ID: ${activeNode.id}]`;
    }

    // Sources list
    if (sourcesList) {
      if (sources.length === 0) {
        sourcesList.innerHTML = '<div class="text-slate-500 italic">No source citations attached.</div>';
      } else {
        sourcesList.innerHTML = sources
          .map(
            (s) => `
          <button type="button" class="solar-source-btn w-full text-left p-2 rounded bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-cyan-400 transition cursor-pointer" data-source-id="${s.id}">
            <div class="text-[10px] text-cyan-300 font-bold flex items-center justify-between">
              <span>${s.id}</span>
              <span class="text-slate-400 text-[9px]">${s.path || 'SOURCE'}</span>
            </div>
            <div class="text-[10px] text-slate-300 truncate">${s.excerpt || s.path || s.id}</div>
          </button>
        `
          )
          .join('');

        const sourceBtns = sourcesList.querySelectorAll<HTMLButtonElement>('.solar-source-btn');
        sourceBtns.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sid = btn.getAttribute('data-source-id');
            if (sid) this.handleSourceClick(sid);
          });
        });
      }
    }
  }

  private handleNodeClick(nodeId: string): void {
    if (!this.currentSnapshot) return;
    this.selectedNodeId = nodeId;
    // Dispatch exact SELECT_NODE envelope
    this.bridge.dispatch({
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.currentSnapshot.generation,
      type: 'SELECT_NODE',
      id: nodeId,
    });
    this.render();
  }

  private handleSourceClick(sourceId: string): void {
    if (!this.currentSnapshot) return;
    // Dispatch exact SELECT_SOURCE envelope
    this.bridge.dispatch({
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.currentSnapshot.generation,
      type: 'SELECT_SOURCE',
      id: sourceId,
    });
  }

  public getModalElement(): HTMLElement | null {
    return this.modalEl;
  }

  public isPanelOpen(): boolean {
    return this.isOpen;
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDownBound);
    }
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
    this.currentSnapshot = null;
    this.lastOpener = null;
  }
}
