import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { Shell } from '../../apps/web/src/App';
import { MountedSpaceScene } from '../../apps/web/src/MountedSpaceScene';
import { setAudioMuted } from '../../apps/web/src/scene/audio';
import { available, graphDown, jsonResponse } from './fixtures';

// Actual mounted React/adapter boundary. Network responses are fixtures; no WebGL/provider claim.
test('scene-selected agent explains only on click and cancels on comparison focus or a new graph generation', async () => {
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
  const saved = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:5173/' });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
  const requests: Array<{ body: { persona: string }; signal: AbortSignal; finish: (response: Response) => void }> = [];
  const globals: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    navigator: { userActivation: { isActive: true } }, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: (_url: unknown, init: RequestInit) => new Promise<Response>(finish => requests.push({
      body: JSON.parse(String(init.body)), signal: init.signal as AbortSignal, finish,
    })),
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const root = createRoot(dom.window.document.getElementById('root')!);
  const a = available('GAP');
  const up = { ...graphDown, status: 'AVAILABLE' as const, ready: true, reason: null };
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
  const render = (ready: boolean, generation: number) => <StrictMode><Shell
    route={{ name: 'release', releaseId: a.releaseId }} health={{ state: 'loading' }}
    graph={{ state: 'done', result: ready ? { kind: 'ok', httpStatus: 200, data: up } : { kind: 'unavailable', httpStatus: 503, data: graphDown } }}
    analysis={{ kind: 'ok', httpStatus: 200, data: a }} Scene={MountedSpaceScene}
    reducedMotion selected={null} onSelect={() => {}} generation={generation} /></StrictMode>;
  const answer = (persona: string) => ({ status: 'AVAILABLE', requestId: 'fixture-request', persona,
    releaseId: a.releaseId, cutId: a.cutId, revision: a.revision, clearance: a.clearance,
    explanation: `Fixture current answer for ${persona}`, sourceRefIds: ['s1'], model: 'fixture/model',
    providerRequestId: 'fixture-provider', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } });
  const click = async (element: Element | null) => {
    assert.ok(element, 'expected control exists');
    await act(async () => { (element as HTMLElement).click(); await flush(); });
  };
  try {
    setAudioMuted(true);
    await act(async () => { root.render(render(true, 1)); await flush(); });
    await click(dom.window.document.querySelector('[data-agent="ava"]'));
    assert.equal(requests.length, 0, 'opening an agent never calls the model');
    const card = dom.window.document.querySelector('[aria-label="ava voice preview"]')!;
    assert.ok(card);
    const style = card.querySelector('select')!;
    assert.equal(style.value, 'ava'); assert.equal(style.disabled, true);
    await click([...card.querySelectorAll('button')].find(b => b.textContent === 'Explain the current clearance')!);
    assert.equal(requests.length, 1); assert.equal(requests[0]!.body.persona, 'ava');
    await click(dom.window.document.querySelector('.btn-focus-disconnected'));
    assert.equal(requests[0]!.signal.aborted, true, 'comparison focus cancels the current main-cube explanation');
    await act(async () => { requests[0]!.finish(jsonResponse(200, answer('ava'))); await flush(); });
    assert.equal(dom.window.document.querySelector('.agent-preview'), null);
    assert.equal(dom.window.document.body.textContent?.includes('Fixture current answer for ava'), false);
    assert.equal(dom.window.document.querySelector('.app-shell')?.getAttribute('data-phase'), 'READY');
    await click(dom.window.document.querySelector('.btn-back-main-cube'));
    await click(dom.window.document.querySelector('[data-agent="roy"]'));
    const roy = dom.window.document.querySelector('[aria-label="roy voice preview"]')!;
    await click([...roy.querySelectorAll('button')].find(b => b.textContent === 'Explain the current clearance')!);
    assert.equal(requests.length, 2); assert.equal(requests[1]!.body.persona, 'roy');
    await act(async () => { requests[1]!.finish(jsonResponse(200, answer('roy'))); await flush(); });
    assert.ok(roy.textContent?.includes('Fixture current answer for roy'));
    const headings = [...dom.window.document.querySelectorAll('.talk-panel h2')].map(h => h.id);
    assert.equal(new Set(headings).size, headings.length, 'each mounted explanation has its own accessible label');
    await act(async () => { root.render(render(true, 2)); await flush(); });
    assert.equal(dom.window.document.body.textContent?.includes('Fixture current answer for roy'), false, 'new graph generation clears the answer');
    await act(async () => { root.render(render(false, 3)); await flush(); });
    assert.equal(dom.window.document.querySelector('.agent-preview'), null);
    assert.equal(dom.window.document.querySelector('.talk-panel'), null);
  } finally {
    await act(async () => { root.unmount(); }); setAudioMuted(true); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
});
