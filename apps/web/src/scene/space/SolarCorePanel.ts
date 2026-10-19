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
    modal.hidden = true;

    modal.innerHTML = `
      <div class="solar-core-modal-content relative w-full max-w-4xl max-h-[90vh] bg-slate-950/95 border border-amber-500/60 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 font-mono text-slate-200 overflow-hidden">
        <div class="solar-panel-header flex items-center justify-between border-b border-amber-500/30 pb-3">
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
          <div class="solar-panel-svg-container md:col-span-8 bg-slate-900/80 rounded-2xl border border-slate-800 p-2 flex items-center justify-center relative overflow-hidden">
            <svg class="solar-panel-svg w-full h-full max-h-[420px] select-none" viewBox="0 0 600 600"></svg>
            <div class="solar-panel-phase-overlay hidden absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center" hidden>
              <span class="solar-panel-phase-badge text-sm px-3 py-1 rounded border font-bold mb-2">CHECKING</span>
              <p class="solar-panel-phase-msg text-xs text-slate-400 max-w-sm"></p>
            </div>
          </div>

          <div class="solar-panel-sidebar md:col-span-4 bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4 flex flex-col justify-between overflow-y-auto max-h-[440px] text-xs">
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
    this.modalEl.hidden = false;

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
    this.modalEl.hidden = true;

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
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      this.close();
      return;
    }

    if (e.key === 'Tab' && this.modalEl && this.isOpen) {
      const focusable = Array.from(
        this.modalEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex="0"], a[href], input, select, textarea'
        )
      ).filter((el) => el.tabIndex !== -1);

      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !this.modalEl.contains(document.activeElement)) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last || !this.modalEl.contains(document.activeElement)) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
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
      if (svgEl) svgEl.textContent = '';
      if (titleEl) titleEl.textContent = 'Proof Withheld';
      if (statusTag) {
        statusTag.textContent = snap.runtime.phase;
        statusTag.className =
          snap.runtime.phase === 'GRAPH_UNAVAILABLE'
            ? 'solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-rose-950 text-rose-300 border border-rose-600'
            : 'solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-300';
      }
      if (sourcesList) {
        sourcesList.textContent = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-slate-500 italic';
        emptyDiv.textContent = 'No proof records active.';
        sourcesList.appendChild(emptyDiv);
      }

      if (phaseOverlay && phaseBadge && phaseMsg) {
        phaseOverlay.classList.remove('hidden');
        phaseOverlay.hidden = false;
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
    if (phaseOverlay) {
      phaseOverlay.classList.add('hidden');
      phaseOverlay.hidden = true;
    }
    const nodes = snap.data.nodes;
    const edges = snap.data.edges;
    const sources = snap.sources;

    if (countEl) countEl.textContent = `${nodes.length} NODES`;
    if (statusTag) {
      statusTag.textContent = 'READY / AVAILABLE';
      statusTag.className = 'solar-panel-status-tag text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-600';
    }

    // Render 2D SVG radial topology layout via safe DOM methods (P1-1 zero unescaped innerHTML)
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

      const svgNS = 'http://www.w3.org/2000/svg';
      svgEl.textContent = ''; // Clear previous SVG tree safely

      // Defs & static gradient
      const defs = document.createElementNS(svgNS, 'defs');
      const grad = document.createElementNS(svgNS, 'radialGradient');
      grad.setAttribute('id', 'solar-center-glow');
      grad.setAttribute('cx', '50%');
      grad.setAttribute('cy', '50%');
      grad.setAttribute('r', '50%');

      const stops = [
        { offset: '0%', color: '#ffffff', opacity: '1' },
        { offset: '40%', color: '#fbbf24', opacity: '0.9' },
        { offset: '80%', color: '#ea580c', opacity: '0.7' },
        { offset: '100%', color: '#7c2d12', opacity: '0' },
      ];
      stops.forEach((s) => {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', s.offset);
        stop.setAttribute('stop-color', s.color);
        stop.setAttribute('stop-opacity', s.opacity);
        grad.appendChild(stop);
      });
      defs.appendChild(grad);
      svgEl.appendChild(defs);

      // Background orbits
      const orb1 = document.createElementNS(svgNS, 'circle');
      orb1.setAttribute('cx', String(cx));
      orb1.setAttribute('cy', String(cy));
      orb1.setAttribute('r', '100');
      orb1.setAttribute('fill', 'none');
      orb1.setAttribute('stroke', 'rgba(251,191,36,0.15)');
      orb1.setAttribute('stroke-dasharray', '3,3');
      svgEl.appendChild(orb1);

      const orb2 = document.createElementNS(svgNS, 'circle');
      orb2.setAttribute('cx', String(cx));
      orb2.setAttribute('cy', String(cy));
      orb2.setAttribute('r', '180');
      orb2.setAttribute('fill', 'none');
      orb2.setAttribute('stroke', 'rgba(251,191,36,0.12)');
      orb2.setAttribute('stroke-dasharray', '4,4');
      svgEl.appendChild(orb2);

      // Draw Edges
      edges.forEach((edge) => {
        const p1 = nodeCoords.get(edge.from);
        const p2 = nodeCoords.get(edge.to);
        if (p1 && p2) {
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', p1.x.toFixed(1));
          line.setAttribute('y1', p1.y.toFixed(1));
          line.setAttribute('x2', p2.x.toFixed(1));
          line.setAttribute('y2', p2.y.toFixed(1));
          line.setAttribute('stroke', 'rgba(0,229,255,0.4)');
          line.setAttribute('stroke-width', '1.2');
          svgEl.appendChild(line);
        }
      });

      // Draw Central Sun Core
      const sunGlow = document.createElementNS(svgNS, 'circle');
      sunGlow.setAttribute('cx', String(cx));
      sunGlow.setAttribute('cy', String(cy));
      sunGlow.setAttribute('r', '38');
      sunGlow.setAttribute('fill', 'url(#solar-center-glow)');
      svgEl.appendChild(sunGlow);

      const sunCore = document.createElementNS(svgNS, 'circle');
      sunCore.setAttribute('cx', String(cx));
      sunCore.setAttribute('cy', String(cy));
      sunCore.setAttribute('r', '18');
      sunCore.setAttribute('fill', '#fef08a');
      sunCore.setAttribute('stroke', '#f59e0b');
      sunCore.setAttribute('stroke-width', '2');
      svgEl.appendChild(sunCore);

      const sunText = document.createElementNS(svgNS, 'text');
      sunText.setAttribute('x', String(cx));
      sunText.setAttribute('y', String(cy + 4));
      sunText.setAttribute('fill', '#78350f');
      sunText.setAttribute('font-size', '10');
      sunText.setAttribute('font-weight', 'bold');
      sunText.setAttribute('text-anchor', 'middle');
      sunText.textContent = 'SUN';
      svgEl.appendChild(sunText);

      // Draw Nodes (Safe element creation, keyboard operability P3-2)
      nodes.forEach((n) => {
        const pt = nodeCoords.get(n.id);
        if (!pt) return;
        const isSelected = snap.data.selectedNodeId === n.id || this.selectedNodeId === n.id;
        const color = isSelected ? '#ffffff' : '#f43f5e';
        const stroke = isSelected ? '#38bdf8' : '#fda4af';
        const r = isSelected ? 12 : 9;

        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'solar-node-group cursor-pointer');
        g.setAttribute('data-node-id', n.id);
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', n.label || n.id);

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', pt.x.toFixed(1));
        circle.setAttribute('cy', pt.y.toFixed(1));
        circle.setAttribute('r', String(r));
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', stroke);
        circle.setAttribute('stroke-width', String(isSelected ? 3 : 1.5));
        g.appendChild(circle);

        const labelText = document.createElementNS(svgNS, 'text');
        labelText.setAttribute('x', pt.x.toFixed(1));
        labelText.setAttribute('y', (pt.y - 14).toFixed(1));
        labelText.setAttribute('fill', '#94a3b8');
        labelText.setAttribute('font-size', '9');
        labelText.setAttribute('text-anchor', 'middle');
        labelText.textContent = (n.label || n.id).slice(0, 14);
        g.appendChild(labelText);

        // Click interaction
        g.addEventListener('click', (e) => {
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          this.handleNodeClick(n.id);
        });

        // Keyboard interaction (Enter or Space)
        g.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            this.handleNodeClick(n.id);
          }
        });

        svgEl.appendChild(g);
      });
    }

    // Detail Panel (Safe textContent)
    const activeNode =
      nodes.find((n) => n.id === (this.selectedNodeId || snap.data.selectedNodeId)) || nodes[0];
    if (activeNode) {
      if (titleEl) titleEl.textContent = `${activeNode.label} (${activeNode.kind || 'RECORD'}) [ID: ${activeNode.id}]`;
    }

    // Sources list (Safe DOM element creation, P1-1 XSS prevention)
    if (sourcesList) {
      sourcesList.textContent = '';
      if (sources.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-slate-500 italic';
        emptyDiv.textContent = 'No source citations attached.';
        sourcesList.appendChild(emptyDiv);
      } else {
        sources.forEach((s) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'solar-source-btn w-full text-left p-2 rounded bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-cyan-400 transition cursor-pointer';
          btn.setAttribute('data-source-id', s.id);

          const headerDiv = document.createElement('div');
          headerDiv.className = 'text-[10px] text-cyan-300 font-bold flex items-center justify-between';

          const idSpan = document.createElement('span');
          idSpan.textContent = s.id;

          const pathSpan = document.createElement('span');
          pathSpan.className = 'text-slate-400 text-[9px]';
          pathSpan.textContent = s.path || 'SOURCE';

          headerDiv.appendChild(idSpan);
          headerDiv.appendChild(pathSpan);

          const excerptDiv = document.createElement('div');
          excerptDiv.className = 'text-[10px] text-slate-300 truncate';
          excerptDiv.textContent = s.excerpt || s.path || s.id;

          btn.appendChild(headerDiv);
          btn.appendChild(excerptDiv);

          btn.addEventListener('click', (e) => {
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            this.handleSourceClick(s.id);
          });

          sourcesList.appendChild(btn);
        });
      }
    }
  }

  private async handleNodeClick(nodeId: string): Promise<void> {
    if (!this.currentSnapshot) return;
    // P3-3: Highlight node locally ONLY when dispatch returns DISPATCHED
    const res = await this.bridge.dispatch({
      protocol: SPACE_SCENE_PROTOCOL,
      generation: this.currentSnapshot.generation,
      type: 'SELECT_NODE',
      id: nodeId,
    });
    if (res === 'DISPATCHED') {
      this.selectedNodeId = nodeId;
      this.render();
    }
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
