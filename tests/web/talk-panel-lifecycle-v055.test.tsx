import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { Shell } from '../../apps/web/src/App';
import { setAudioMuted } from '../../apps/web/src/scene/audio';
import { available, graphDown, jsonResponse } from './fixtures';

// Actual React effects in JSDOM; synthetic network/synthesis fixtures, not a native-browser/provider claim.
test('mounted explanation read-aloud is explicit, mute-aware and stopped across graph generations', async () => {
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'SpeechSynthesisUtterance', 'fetch'];
  const saved = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:5173/' });
  const voice = { voiceURI: 'fixture-local', name: 'Fixture local voice', lang: 'en-US', default: true, localService: true };
  let cancels = 0; const spoken: Array<{ text: string }> = [];
  const synth = { getVoices: () => [voice], addEventListener() {}, removeEventListener() {}, cancel() { cancels++; }, speak(u: { text: string }) { spoken.push(u); } };
  Object.defineProperty(dom.window, 'speechSynthesis', { value: synth, configurable: true });
  let fetches = 0; let finish!: (r: Response) => void;
  class Utterance { constructor(public text: string) {} }
  const globals: Record<string, unknown> = { window: dom.window, document: dom.window.document,
    navigator: { userAgent: 'JSDOM fixture', userActivation: { isActive: true } }, HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true, SpeechSynthesisUtterance: Utterance,
    fetch: () => { fetches++; return new Promise<Response>(resolve => { finish = resolve; }); } };
  for (const [k, value] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  const root = createRoot(dom.window.document.getElementById('root')!);
  const a = available('GAP');
  const up = { ...graphDown, status: 'AVAILABLE' as const, ready: true, reason: null };
  const answer = { status: 'AVAILABLE', requestId: 'fixture-request', persona: 'roy', releaseId: a.releaseId, cutId: a.cutId, revision: a.revision,
    clearance: a.clearance, explanation: 'Current fixture explanation', sourceRefIds: ['s1'], model: 'fixture/model', providerRequestId: 'fixture-provider', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 } };
  const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
  const view = (ready: boolean, generation: number) => <StrictMode><Shell route={{ name: 'release', releaseId: a.releaseId }}
    health={{ state: 'loading' }} graph={{ state: 'done', result: ready ? { kind: 'ok', httpStatus: 200, data: up } : { kind: 'unavailable', httpStatus: 503, data: graphDown } }}
    analysis={{ kind: 'ok', httpStatus: 200, data: a }} Scene={null} reducedMotion selected={null} onSelect={() => {}} generation={generation} /></StrictMode>;
  const button = (text: string) => [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === text);
  try {
    setAudioMuted(true);
    await act(async () => { root.render(view(true, 1)); await flush(); });
    assert.equal(fetches, 0); assert.equal(spoken.length, 0);
    await act(async () => { button('Explain the current clearance')!.click(); await flush(); });
    assert.equal(fetches, 1);
    await act(async () => { root.render(view(false, 1)); await flush(); });
    await act(async () => { finish(jsonResponse(200, answer)); await flush(); });
    assert.equal(dom.window.document.body.textContent?.includes(answer.explanation), false);
    assert.equal(button('Read aloud'), undefined);
    await act(async () => { root.render(view(true, 2)); await flush(); });
    await act(async () => { button('Explain the current clearance')!.click(); await flush(); });
    await act(async () => { finish(jsonResponse(200, answer)); await flush(); });
    assert.equal(fetches, 2); assert.equal(spoken.length, 0, 'answer arrival never starts speech');
    assert.equal(button('Read aloud')?.disabled, true, 'global mute is respected');
    await act(async () => { setAudioMuted(false); await flush(); });
    await act(async () => { button('Read aloud')!.click(); await flush(); });
    assert.deepEqual(spoken.map(u => u.text), [answer.explanation]);
    assert.equal(button('Stop reading')?.disabled, false);
    const beforeMute = cancels;
    await act(async () => { setAudioMuted(true); await flush(); });
    assert.ok(cancels > beforeMute); assert.equal(button('Stop reading')?.disabled, true);
    await act(async () => { setAudioMuted(false); await flush(); });
    await act(async () => { button('Read aloud')!.click(); await flush(); });
    assert.equal(spoken.length, 2);
    const beforeNewGeneration = cancels;
    await act(async () => { root.render(view(true, 3)); await flush(); });
    assert.ok(cancels > beforeNewGeneration); assert.equal(dom.window.document.body.textContent?.includes(answer.explanation), false);
    assert.equal(button('Read aloud'), undefined);
  } finally {
    await act(async () => { root.unmount(); }); setAudioMuted(true); dom.window.close();
    for (const [k, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else Reflect.deleteProperty(globalThis, k); }
  }
});
