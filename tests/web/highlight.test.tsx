import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as AnalysisViewModule from '../../apps/web/src/components/AnalysisView';

// Gap: after a source-link jump the cited record got focus but no visible mark, because programmatic
// focus draws no ring after a pointer click. These tests use a minimal fake DOM (no new dependency).
type Listener = (event: { key?: string }) => void;
class FakeEl {
  attrs = new Map<string, string>(); calls: string[] = []; listeners = new Map<string, Listener[]>();
  constructor(readonly id: string, private readonly doc: FakeDoc) {}
  setAttribute(n: string, v: string) { this.attrs.set(n, v); }
  removeAttribute(n: string) { this.attrs.delete(n); }
  scrollIntoView() { this.calls.push('scroll'); }
  focus() { this.calls.push('focus'); if (this.doc.active && this.doc.active !== this) this.doc.active.fire('blur'); this.doc.active = this; }
  addEventListener(t: string, l: Listener) { this.listeners.set(t, [...(this.listeners.get(t) ?? []), l]); }
  removeEventListener(t: string, l: Listener) { this.listeners.set(t, (this.listeners.get(t) ?? []).filter(x => x !== l)); }
  count(t: string) { return (this.listeners.get(t) ?? []).length; }
  fire(t: string, ev: { key?: string } = {}) { for (const l of [...(this.listeners.get(t) ?? [])]) l(ev); }
}
class FakeDoc {
  active: FakeEl | null = null; els = new Map<string, FakeEl>();
  constructor(ids: string[]) { for (const i of ids) this.els.set(`source-${i}`, new FakeEl(`source-${i}`, this)); }
  getElementById(id: string) { return this.els.get(id) ?? null; }
  querySelectorAll(sel: string) { return sel === '[data-cited]' ? [...this.els.values()].filter(e => e.attrs.has('data-cited')) : []; }
}
const click = { preventDefault() { click.prevented = true; }, prevented: false };
const jump = (doc: FakeDoc, id: string) => { click.prevented = false; AnalysisViewModule.focusSource(click, id, doc); };
const cited = (doc: FakeDoc) => [...doc.els.values()].filter(e => e.attrs.get('data-cited') === 'true').map(e => e.id);

test('a source jump marks the cited record, scrolls to it and still moves focus to it', () => {
  assert.equal(typeof AnalysisViewModule.focusSource, 'function', 'focusSource is exported');
  const doc = new FakeDoc(['s1', 's2']);
  jump(doc, 's1');
  assert.ok(click.prevented, 'the hash router is not driven');
  assert.deepEqual(cited(doc), ['source-s1']);
  assert.deepEqual(doc.els.get('source-s1')!.calls, ['scroll', 'focus']);
  assert.equal(doc.els.get('source-s1')!.attrs.get('tabindex'), '-1');
  assert.equal(doc.active, doc.els.get('source-s1'));
});

test('only one record is marked: a second jump moves the mark', () => {
  const doc = new FakeDoc(['s1', 's2']);
  jump(doc, 's1'); jump(doc, 's2');
  assert.deepEqual(cited(doc), ['source-s2']);
});

test('Escape on the record and focus leaving it clear the mark; other keys do not', () => {
  const doc = new FakeDoc(['s1']); const el = doc.els.get('source-s1')!;
  jump(doc, 's1'); el.fire('keydown', { key: 'Enter' });
  assert.deepEqual(cited(doc), ['source-s1']);
  el.fire('keydown', { key: 'Escape' });
  assert.deepEqual(cited(doc), []);
  jump(doc, 's1'); el.fire('blur');
  assert.deepEqual(cited(doc), []);
});

test('an unknown source id changes nothing and does not throw', () => {
  const doc = new FakeDoc(['s1']);
  jump(doc, 's1'); jump(doc, 'nope');
  assert.deepEqual(cited(doc), ['source-s1']);
  assert.ok(click.prevented);
});

test('stylesheet gives the marked record an outline, a tint and a text label, and adds no animation', () => {
  const css = readFileSync(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8');
  const rule = /\[data-cited\][^{]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /outline:\s*3px solid/);
  assert.match(rule, /background:/);
  assert.match(css, /\[data-cited\]::before\s*\{[^}]*content:\s*"Cited source"/);
  assert.ok(!/\[data-cited\][^{]*\{[^}]*(animation|transition)/.test(css));
});

const listenerCount = (doc: FakeDoc) => [...doc.els.values()].reduce((n, e) => n + e.count('keydown') + e.count('blur'), 0);

test('listeners do not accumulate: repeated jumps leave one pair, and Escape or blur detach them', () => {
  const doc = new FakeDoc(['s1', 's2']); const s1 = doc.els.get('source-s1')!;
  jump(doc, 's1'); jump(doc, 's1'); jump(doc, 's2'); jump(doc, 's1');
  assert.equal(listenerCount(doc), 2, 'one keydown and one blur listener in total');
  assert.deepEqual(cited(doc), ['source-s1']);
  s1.fire('keydown', { key: 'Escape' });
  assert.equal(listenerCount(doc), 0, 'Escape detaches both listeners');
  jump(doc, 's2'); doc.els.get('source-s2')!.fire('blur');
  assert.equal(listenerCount(doc), 0, 'blur detaches both listeners');
  assert.deepEqual(cited(doc), []);
});
