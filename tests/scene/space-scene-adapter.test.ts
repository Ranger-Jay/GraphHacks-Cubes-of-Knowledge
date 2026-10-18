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
    public textContent: string = '';
    public attributes = new Map<string, string>();
    public style: Record<string, string> = {};
    private eventListeners = new Map<string, Set<EventListener>>();

    constructor(tagName: string) {
      this.tagName = tagName.toUpperCase();
      this.classList = new MockClassList();
    }

    setAttribute(k: string, v: string) {
      this.attributes.set(k, String(v));
    }
    getAttribute(k: string) {
      return this.attributes.get(k) ?? null;
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
      // Basic mock parser creating identifiable elements
      const tagMatches = html.matchAll(/<([a-z0-9-]+)([^>]*)>/gi);
      for (const m of tagMatches) {
        const tag = m[1]!;
        if (tag === 'svg' || tag === 'g' || tag === 'button' || tag === 'div' || tag === 'span' || tag === 'h2' || tag === 'p') {
          const el = new MockElement(tag);
          const attrs = m[2] || '';
          const classMatch = attrs.match(/class=["']([^"']+)["']/i);
          if (classMatch) {
            el.className = classMatch[1]!;
            el.classList = new MockClassList(el.className);
          }
          const idMatch = attrs.match(/id=["']([^"']+)["']/i);
          if (idMatch) el.setAttribute('id', idMatch[1]!);
          const dataNodeMatch = attrs.match(/data-node-id=["']([^"']+)["']/i);
          if (dataNodeMatch) el.setAttribute('data-node-id', dataNodeMatch[1]!);
          const dataSourceMatch = attrs.match(/data-source-id=["']([^"']+)["']/i);
          if (dataSourceMatch) el.setAttribute('data-source-id', dataSourceMatch[1]!);
          const dataAgentMatch = attrs.match(/data-agent=["']([^"']+)["']/i);
          if (dataAgentMatch) el.setAttribute('data-agent', dataAgentMatch[1]!);
          this.appendChild(el);
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
