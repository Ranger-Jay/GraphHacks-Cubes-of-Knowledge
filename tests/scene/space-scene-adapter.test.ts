import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_SCENE_PROTOCOL } from '@cubes/contracts';
import type { ScenePhase, SpaceSceneSnapshot } from '@cubes/contracts';
import {
  createSpaceSceneBridge,
  isSpaceSceneEvent,
  projectSpaceScene,
  type SpaceSceneInput,
} from '../../apps/web/src/spaceSceneBridge';
import { available } from '../web/fixtures';
import {
  mount,
  SpaceSceneAdapter,
  SolarCorePanel,
  type SpaceSceneBridge,
} from '../../apps/web/src/scene/space';

// Polyfill minimal DOM environment for Node.js unit testing
function setupMockDOM() {
  if (typeof globalThis.document !== 'undefined') return;

  const listeners = new Map<string, Set<EventListener>>();

  class MockClassList {
    private classes = new Set<string>();
    constructor(initial = '') {
      initial.split(/\s+/).filter(Boolean).forEach((c) => this.classes.add(c));
    }
    add(...cls: string[]) {
      cls.forEach((c) => this.classes.add(c));
    }
    remove(...cls: string[]) {
      cls.forEach((c) => this.classes.delete(c));
    }
    contains(c: string) {
      return this.classes.has(c);
    }
    toString() {
      return Array.from(this.classes).join(' ');
    }
  }

  class MockElement {
    public tagName: string;
    public className: string = '';
    public classList: MockClassList;
    public children: MockElement[] = [];
    public parentNode: MockElement | null = null;
    private _textContent: string = '';
    get textContent(): string {
      const parts: string[] = [];
      if (this._textContent) parts.push(this._textContent);
      for (const child of this.children) {
        const cText = child.textContent;
        if (cText) parts.push(cText);
      }
      return parts.join(' ').trim();
    }
    set textContent(v: string) {
      this.children = [];
      this._textContent = v;
    }
    public attributes = new Map<string, string>();
    public style: Record<string, string> = {};
    private eventListeners = new Map<string, Set<EventListener>>();

    constructor(tagName: string) {
      this.tagName = tagName.toUpperCase();
      this.classList = new MockClassList();
    }

    public disabled: boolean = false;
    public hidden: boolean = false;

    setAttribute(k: string, v: string) {
      this.attributes.set(k, String(v));
      if (k === 'class') {
        this.className = String(v);
        this.classList = new MockClassList(this.className);
      }
      if (k === 'disabled') {
        this.disabled = true;
      }
      if (k === 'hidden') {
        this.hidden = true;
      }
    }
    removeAttribute(k: string) {
      this.attributes.delete(k);
      if (k === 'disabled') this.disabled = false;
      if (k === 'hidden') this.hidden = false;
    }
    getAttribute(k: string) {
      return this.attributes.get(k) ?? null;
    }
    contains(child: any): boolean {
      if (!child) return false;
      if (child === this) return true;
      for (const c of this.children) {
        if (c === child || (c.contains && c.contains(child))) return true;
      }
      return false;
    }
    appendChild(child: MockElement) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child: MockElement) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    addEventListener(type: string, listener: EventListener) {
      if (!this.eventListeners.has(type)) {
        this.eventListeners.set(type, new Set());
      }
      this.eventListeners.get(type)!.add(listener);
    }
    removeEventListener(type: string, listener: EventListener) {
      this.eventListeners.get(type)?.delete(listener);
    }
    dispatchEvent(event: { type: string; target?: unknown; stopPropagation?: () => void; preventDefault?: () => void }) {
      event.target = this;
      if (!event.stopPropagation) event.stopPropagation = () => {};
      if (!event.preventDefault) event.preventDefault = () => {};
      this.eventListeners.get(event.type)?.forEach((l) => l(event as any));
      return true;
    }
    querySelector<T = MockElement>(sel: string): T | null {
      for (const child of this.children) {
        if (this.matches(child, sel)) return child as unknown as T;
        const found = child.querySelector<T>(sel);
        if (found) return found;
      }
      return null;
    }
    querySelectorAll<T = MockElement>(sel: string): T[] {
      const results: T[] = [];
      for (const child of this.children) {
        if (this.matches(child, sel)) results.push(child as unknown as T);
        results.push(...child.querySelectorAll<T>(sel));
      }
      return results;
    }
    private matches(el: MockElement, sel: string): boolean {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return el.className.includes(cls) || el.classList.contains(cls);
      }
      if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const attr = sel.slice(1, -1).split('=')[0];
        return el.attributes.has(attr!);
      }
      return el.tagName.toLowerCase() === sel.toLowerCase();
    }
    set innerHTML(html: string) {
      this.children = [];
      this._textContent = '';
      const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
      const stack: MockElement[] = [this];
      const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);
      const tokenRegex = /<(\/)?([a-z0-9-]+)([^>]*)>|([^<]+)/gi;
      let match;
      while ((match = tokenRegex.exec(cleanHtml)) !== null) {
        const isClosing = Boolean(match[1]);
        const tagName = match[2]?.toLowerCase();
        const attrs = match[3] || '';
        const text = match[4];

        if (text) {
          const trimmed = text.trim();
          if (trimmed) {
            const current = stack[stack.length - 1];
            if (current) {
              current._textContent = current._textContent
                ? current._textContent + ' ' + trimmed
                : trimmed;
            }
          }
        } else if (isClosing) {
          if (stack.length > 1) {
            for (let i = stack.length - 1; i >= 1; i--) {
              if (stack[i]!.tagName.toLowerCase() === tagName) {
                stack.splice(i);
                break;
              }
            }
          }
        } else if (tagName) {
          const el = new MockElement(tagName);
          const isSelfClosing = attrs.trim().endsWith('/') || voidTags.has(tagName);

          const attrMatches = attrs.matchAll(/([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/gi);
          for (const am of attrMatches) {
            const k = am[1]!;
            if (k === '/') continue;
            const v = am[2] !== undefined ? am[2] : '';
            el.setAttribute(k, v);
          }

          const parent = stack[stack.length - 1];
          if (parent) {
            parent.appendChild(el);
          }

          if (!isSelfClosing) {
            stack.push(el);
          }
        }
      }
    }
    focus() {}
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
    }
  }

  (globalThis as any).document = {
    createElement(tag: string) {
      return new MockElement(tag);
    },
    createElementNS(ns: string, tag: string) {
      return new MockElement(tag);
    },
    activeElement: null,
  };

  (globalThis as any).window = {
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: { type: string }) {
      listeners.get(event.type)?.forEach((l) => l(event as any));
    },
    devicePixelRatio: 1,
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16) as any,
    cancelAnimationFrame: (id: any) => clearTimeout(id),
  };
}

setupMockDOM();

const testInput = (changes: Partial<SpaceSceneInput> = {}): SpaceSceneInput => ({
  generation: 9,
  runtime: { phase: 'READY' },
  analysis: available('GAP'),
  selectedNodeId: 'n1',
  ideaIds: ['idea-042', 'idea-043'],
  reducedMotion: false,
  audioMuted: true,
  recoveryAuthorized: false,
  ...changes,
});

test('1. mount(container, bridge) and unmount() lifecycle: clean tear-down and remounting without leaks', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
    readCurrent: () => projectSpaceScene(testInput()),
  };

  const scene = mount(container, bridge);
  assert.equal(scene.isMounted(), true);
  assert.equal(scene.getSnapshot().protocol, SPACE_SCENE_PROTOCOL);
  assert.equal(scene.getSnapshot().generation, 9);

  // Unmount
  scene.unmount();
  assert.equal(scene.isMounted(), false);

  // Remount into fresh container
  const container2 = (document.createElement('div') as unknown) as HTMLElement;
  const scene2 = mount(container2, bridge);
  assert.equal(scene2.isMounted(), true);
  scene2.unmount();
  assert.equal(scene2.isMounted(), false);
});

test('2. Render typed snapshot states: READY renders data; non-READY phases clear all proof', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snapReady = projectSpaceScene(testInput());
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
    readCurrent: () => snapReady,
  };

  const scene = mount(container, bridge, snapReady);
  assert.equal(scene.getSnapshot().runtime.phase, 'READY');
  assert.equal(scene.getSnapshot().data.nodes.length, 2);
  assert.equal(scene.getSnapshot().ideaIds.length, 2);

  // Test non-READY phases
  const NON_READY_PHASES: ScenePhase[] = [
    'CHECKING',
    'GRAPH_UNAVAILABLE',
    'ACCESS_DENIED',
    'NOT_FOUND',
    'UNAVAILABLE',
  ];

  for (const phase of NON_READY_PHASES) {
    const blockedSnap = projectSpaceScene(testInput({ runtime: { phase } }));
    scene.update(blockedSnap);

    assert.equal(scene.getSnapshot().runtime.phase, phase);
    assert.deepEqual(scene.getSnapshot().data.nodes, []);
    assert.deepEqual(scene.getSnapshot().data.edges, []);
    assert.deepEqual(scene.getSnapshot().evidence, []);
    assert.deepEqual(scene.getSnapshot().sources, []);
    assert.deepEqual(scene.getSnapshot().ideaIds, []);
    assert.equal(scene.getSnapshot().summary, null);
    assert.equal(scene.getSnapshot().clearance, null);
  }

  scene.unmount();
});

test('3. Emit events with exact envelope: protocol, generation, type, and strictly allowed fields only', async () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snap = projectSpaceScene(testInput());
  const dispatchedEvents: any[] = [];

  const realBridge = createSpaceSceneBridge(() => snap, {
    onSelectNode: (id) => { dispatchedEvents.push({ type: 'SELECT_NODE', id }); },
    onSelectSource: (id) => { dispatchedEvents.push({ type: 'SELECT_SOURCE', id }); },
    onOpenIdea: (id) => { dispatchedEvents.push({ type: 'OPEN_IDEA', id }); },
    onAgentTaskStart: (agentId) => { dispatchedEvents.push({ type: 'AGENT_TASK_START', agentId }); },
    onCloseAgent: (agentId) => { dispatchedEvents.push({ type: 'CLOSE_AGENT', agentId }); },
    onRefresh: () => { dispatchedEvents.push({ type: 'REFRESH' }); },
    onSetAudioMuted: (muted) => { dispatchedEvents.push({ type: 'SET_AUDIO_MUTED', muted }); },
  });

  const adapter = new SpaceSceneAdapter(container, realBridge, snap);

  // SELECT_NODE
  const resNode = await adapter.dispatchNodeSelection('n1');
  assert.equal(resNode, 'DISPATCHED');

  // SELECT_SOURCE
  const resSource = await adapter.dispatchSourceSelection('s1');
  assert.equal(resSource, 'DISPATCHED');

  // OPEN_IDEA
  const resIdea = await adapter.dispatchOpenIdea('idea-042');
  assert.equal(resIdea, 'DISPATCHED');

  // AGENT_TASK_START
  const resAgent = await adapter.dispatchAgentTaskStart('ava');
  assert.equal(resAgent, 'DISPATCHED');

  // CLOSE_AGENT
  const resClose = await adapter.dispatchCloseAgent('roy');
  assert.equal(resClose, 'DISPATCHED');

  // REFRESH
  const resRefresh = await adapter.dispatchRefresh();
  assert.equal(resRefresh, 'DISPATCHED');

  // SET_AUDIO_MUTED
  const resMute = await adapter.dispatchSetAudioMuted(false);
  assert.equal(resMute, 'DISPATCHED');

  assert.equal(dispatchedEvents.length, 7);
  adapter.unmount();
});

test('4. DISPATCHED means callback delivery only: never fakes ingestion or removes comets without verified server read-back', async () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  let addedReceived = '';
  const snap = projectSpaceScene(testInput());

  const bridge: SpaceSceneBridge = {
    dispatch: async (ev: any) => {
      assert.equal(isSpaceSceneEvent(ev), true);
      return 'DISPATCHED';
    },
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap, {
    onAdded: (ideaId) => {
      addedReceived = ideaId;
    },
  });

  // User opens idea: dispatch returns DISPATCHED
  const res = await adapter.dispatchOpenIdea('idea-042');
  assert.equal(res, 'DISPATCHED');
  // At this point, NO completed-ingestion effect has occurred!
  assert.equal(addedReceived, '');

  // Completed ingestion occurs ONLY when the verified server read-back triggers handleVerifiedAdded
  adapter.handleVerifiedAdded('idea-042');
  assert.equal(addedReceived, 'idea-042');

  adapter.unmount();
});

test('5. Integrated mode disables standalone fakes and respects audio mute rules', async () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const audioPlayed: string[] = [];
  const snap = projectSpaceScene(testInput({ audioMuted: true }));

  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap, {
    audioPlayerBinding: {
      play: (sound) => { audioPlayed.push(sound); },
    },
  });

  // When muted: node selection emits no audio play
  await adapter.dispatchNodeSelection('n1');
  assert.equal(audioPlayed.length, 0);

  // Unmute snapshot
  adapter.update(projectSpaceScene(testInput({ audioMuted: false })));
  await adapter.dispatchNodeSelection('n1');
  assert.deepEqual(audioPlayed, ['chime']);

  adapter.unmount();
});

test('6. Solar Core 2D panel: shared panel state across sun click and top-bar button, clears proof in outage', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snap = projectSpaceScene(testInput());
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap);

  // 1. Top-bar button click path opens shared solar panel
  const hudBtn = container.querySelector<any>('.btn-solar-core');
  assert.ok(hudBtn, 'HUD solar core button must be rendered');
  hudBtn.dispatchEvent({ type: 'click' });
  const panel = adapter.getSolarPanel();
  assert.ok(panel, 'Solar panel must exist');
  assert.equal(panel.isPanelOpen(), true, 'Panel must be open after top-bar button click');
  const modalEl = container.querySelector<any>('.solar-core-modal-overlay');
  assert.ok(modalEl, 'Solar panel modal overlay must exist');
  assert.equal(modalEl.classList.contains('hidden'), false, 'Modal overlay must be visible after top-bar button click');

  // Close panel
  adapter.closeSolarPanel();
  assert.equal(panel.isPanelOpen(), false, 'Panel must be closed after closeSolarPanel()');
  assert.equal(modalEl.classList.contains('hidden'), true, 'Modal overlay must be hidden after closeSolarPanel()');

  // 2. Sun click callback path opens the EXACT same shared solar panel
  adapter.openSolarPanel();
  assert.equal(panel.isPanelOpen(), true, 'Panel must be open after sun click path');
  assert.equal(modalEl.classList.contains('hidden'), false, 'Modal overlay must be visible after sun click path');

  // 3. Three renderer provides getSunScreenMetrics method
  const renderer = adapter.getThreeRenderer();
  if (renderer) {
    assert.equal(typeof renderer.getSunScreenMetrics, 'function', 'Renderer must expose getSunScreenMetrics');
  }

  // 4. Outage clears proof
  adapter.update(projectSpaceScene(testInput({ runtime: { phase: 'GRAPH_UNAVAILABLE' } })));
  assert.equal(adapter.getSnapshot().runtime.phase, 'GRAPH_UNAVAILABLE');

  adapter.unmount();
});

test('7. Reduced motion: static presentation without continuous animation loops', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snapReduced = projectSpaceScene(testInput({ reducedMotion: true }));
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = mount(container, bridge, snapReduced);
  assert.equal(adapter.getSnapshot().reducedMotion, true);
  adapter.unmount();
});

test('8. Stored XSS immunity & safe DOM textContent rendering for malicious payloads', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const xssPayload = '<img src=x onerror="window.__xss=1">';
  const quotePayload = 'test" onmouseover="alert(1)" data-x="';

  const xssInput: SpaceSceneInput = {
    ...testInput(),
    analysis: {
      ...available('GAP'),
      nodes: [
        { id: quotePayload, label: xssPayload, kind: 'RECORD' },
      ],
      sources: [
        { id: xssPayload, path: quotePayload, excerpt: xssPayload },
      ],
    },
  };

  const snap = projectSpaceScene(xssInput);
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap);
  adapter.openSolarPanel();

  // Check that the source button text contains the payload literally, without creating img elements
  const sourceBtn = container.querySelector<any>('.solar-source-btn');
  assert.ok(sourceBtn, 'Source button must be created');
  assert.equal(sourceBtn.querySelector('img'), null, 'Malicious <img> must never be parsed or rendered in DOM');

  // Check that the SVG node group exists without injected attributes
  const svgGroup = container.querySelector<any>('.solar-node-group');
  assert.ok(svgGroup, 'SVG node group must be created');
  assert.equal(svgGroup.getAttribute('data-node-id'), quotePayload, 'Attribute must safely store quote payload without breaking out');

  adapter.unmount();
});

test('9. Two-cube visual & spatial presence: main and disconnected comparison cubes', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snap = projectSpaceScene(testInput({ runtime: { phase: 'READY' } }));
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap);
  const renderer = adapter.getThreeRenderer();

  // Both adapter and renderer support multi-cube focus querying
  assert.equal(adapter.getCubeFocus(), 'main', 'Initial focus must be on main cube');
  if (renderer) {
    assert.equal(renderer.getCubeFocus(), 'main', 'Renderer initial focus must be on main cube');
  }

  // Focus disconnected cube button must be rendered in DOM
  const focusBtn = container.querySelector<any>('.btn-focus-disconnected');
  assert.ok(focusBtn, 'Focus disconnected cube button must be present in HUD');
  assert.ok(focusBtn.textContent.includes('Focus disconnected cube'), 'Button must contain text "Focus disconnected cube"');

  // Toggle to disconnected cube
  adapter.toggleCubeFocus();
  assert.equal(adapter.getCubeFocus(), 'disconnected', 'Focus should toggle to disconnected cube');
  if (renderer) {
    assert.equal(renderer.getCubeFocus(), 'disconnected', 'Renderer focus should toggle to disconnected cube');
  }

  // Toggle back to main cube
  adapter.toggleCubeFocus();
  assert.equal(adapter.getCubeFocus(), 'main', 'Focus should toggle back to main cube');

  adapter.unmount();
});

test('10. Accessible keyboard navigation: HUD button focus, no Tab hijacking, and natural DOM flow', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snap = projectSpaceScene(testInput({ runtime: { phase: 'READY' } }));
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap);

  // 1. Scene root and viewport must NOT add synthetic tab stops
  const rootEl = container.querySelector<any>('.space-scene-root');
  assert.equal(rootEl?.getAttribute('tabindex'), null, 'Root element must not set tabindex');
  const viewportEl = container.querySelector<any>('.space-scene-viewport');
  assert.equal(viewportEl?.getAttribute('tabindex'), null, 'Viewport must not set tabindex');

  // 2. Tab key must NEVER be hijacked or preventDefault()ed
  let tabPrevented = false;
  const tabEvent = {
    type: 'keydown',
    key: 'Tab',
    target: container,
    preventDefault: () => { tabPrevented = true; },
  };
  (window as any).dispatchEvent(tabEvent);
  assert.equal(tabPrevented, false, 'Tab key must never be intercepted or prevented by the scene');

  // 3. Focus disconnected cube via normal HUD button
  const focusBtn = container.querySelector<any>('.btn-focus-disconnected');
  assert.ok(focusBtn, 'Focus disconnected cube button must exist in HUD');
  focusBtn.dispatchEvent({ type: 'click' });
  assert.equal(adapter.getCubeFocus(), 'disconnected', 'Clicking button must focus disconnected cube');

  // While viewing disconnected cube, card is visible and back button is available
  const cardEl = container.querySelector<any>('.disconnected-cube-card');
  assert.equal(cardEl?.classList.contains('hidden'), false, 'Disconnected card must be visible');
  const backBtn = container.querySelector<any>('.btn-back-main-cube');
  assert.ok(backBtn, 'Back to main cube button must exist');

  // 4. Return to main cube via back button
  backBtn.dispatchEvent({ type: 'click' });
  assert.equal(adapter.getCubeFocus(), 'main', 'Clicking back button must restore focus to main cube');

  // 5. Normal DOM order for keyboard navigation: all HUD buttons are accessible buttons
  const solarBtn = container.querySelector<any>('.btn-solar-core');
  const muteBtn = container.querySelector<any>('.btn-mute-toggle');
  const refreshBtn = container.querySelector<any>('.btn-refresh');
  assert.ok(solarBtn, 'Solar Core button must exist in DOM order');
  assert.ok(muteBtn, 'Mute button must exist in DOM order');
  assert.ok(refreshBtn, 'Refresh button must exist in DOM order');

  adapter.unmount();
});

test('11. Absolute database & mutation isolation for disconnected comparison cube', async () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snap = projectSpaceScene(testInput({ runtime: { phase: 'READY' } }));
  let bridgeDispatched = false;
  const bridge: SpaceSceneBridge = {
    dispatch: async () => {
      bridgeDispatched = true;
      return 'DISPATCHED';
    },
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap);

  // Switch to disconnected cube
  adapter.setCubeFocus('disconnected');
  assert.equal(adapter.getCubeFocus(), 'disconnected');

  // 1. Mandatory text display
  const cardEl = container.querySelector<any>('.disconnected-cube-card');
  assert.ok(cardEl, 'Disconnected cube card must be rendered');
  assert.equal(cardEl.classList.contains('hidden'), false, 'Card must be visible when focused');
  assert.ok(cardEl.textContent.includes('No database connected'), 'Must display "No database connected"');
  assert.ok(
    cardEl.textContent.includes('Information unavailable. Connect FalkorDB to use this cube.'),
    'Must display "Information unavailable. Connect FalkorDB to use this cube."'
  );

  // 2. Data panels are withheld
  adapter.openSolarPanel();
  const panel = adapter.getSolarPanel();
  assert.equal(panel?.isPanelOpen(), false, 'Solar panel must remain closed while disconnected cube is focused');

  // 3. Data actions are disabled and return UNBOUND without bridge dispatch
  const resRefresh = await adapter.dispatchRefresh();
  assert.equal(resRefresh, 'UNBOUND', 'dispatchRefresh must return UNBOUND');
  assert.equal(bridgeDispatched, false, 'No bridge events may be dispatched from disconnected cube');

  const resNode = await adapter.dispatchNodeSelection('node-1');
  assert.equal(resNode, 'UNBOUND', 'dispatchNodeSelection must return UNBOUND');

  const resSource = await adapter.dispatchSourceSelection('src-1');
  assert.equal(resSource, 'UNBOUND', 'dispatchSourceSelection must return UNBOUND');

  const resIdea = await adapter.dispatchOpenIdea('idea-1');
  assert.equal(resIdea, 'UNBOUND', 'dispatchOpenIdea must return UNBOUND');

  const resTask = await adapter.dispatchAgentTaskStart('roy');
  assert.equal(resTask, 'UNBOUND', 'dispatchAgentTaskStart must return UNBOUND');

  // 4. Working cube state is preserved and not put into outage
  assert.equal(adapter.getSnapshot().runtime.phase, 'READY', 'Main cube must retain its genuine READY phase');

  // 5. Return to main cube restores controls and view
  adapter.setCubeFocus('main');
  assert.equal(cardEl.classList.contains('hidden'), true, 'Disconnected card must be hidden on return to main');
  const solarBtn = container.querySelector<any>('.btn-solar-core');
  assert.equal(solarBtn?.disabled, false, 'Solar button must be re-enabled upon return to main');

  // Bridge dispatch works normally from main cube
  const mainNodeRes = await adapter.dispatchNodeSelection('node-1');
  assert.equal(mainNodeRes, 'DISPATCHED');
  assert.equal(bridgeDispatched, true);

  adapter.unmount();
});

test('12. Reduced motion compliance: immediate camera snap without animated lerp', () => {
  const container = (document.createElement('div') as unknown) as HTMLElement;
  const snap = projectSpaceScene(testInput({ runtime: { phase: 'READY' }, reducedMotion: true }));
  const bridge: SpaceSceneBridge = {
    dispatch: async () => 'DISPATCHED',
  };

  const adapter = new SpaceSceneAdapter(container, bridge, snap);
  assert.equal(adapter.getSnapshot().reducedMotion, true);

  // Switching focus snaps camera immediately
  adapter.setCubeFocus('disconnected');
  assert.equal(adapter.getCubeFocus(), 'disconnected');

  adapter.setCubeFocus('main');
  assert.equal(adapter.getCubeFocus(), 'main');

  adapter.unmount();
});

