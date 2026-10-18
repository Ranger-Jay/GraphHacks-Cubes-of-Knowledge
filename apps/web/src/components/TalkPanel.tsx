import { useEffect, useRef, useState } from 'react';
import type { AgentId, AvailableAnalysis, TalkResponse } from '@cubes/contracts';
import { requestTalk } from '../talk';
import { focusSource } from './AnalysisView';

/** Mounted only with current READY analysis, keyed by shell generation/revision. No request on mount. */
export function TalkPanel({ analysis }: { analysis: AvailableAnalysis }) {
  const [persona, setPersona] = useState<AgentId>('roy');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'unavailable'>('idle');
  const [answer, setAnswer] = useState<TalkResponse | null>(null);
  const active = useRef<ReturnType<typeof requestTalk> | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; active.current?.cancel(); active.current = null; }; }, []);
  const ask = async () => {
    if (active.current !== null) return;
    setAnswer(null); setState('pending');
    const call = requestTalk(analysis, persona);
    active.current = call;
    const result = await call.result;
    if (!live.current || active.current !== call) return;
    active.current = null;
    setAnswer(result); setState(result ? 'done' : 'unavailable');
  };
  return <section className="panel talk-panel" aria-labelledby="talk-h">
    <h2 id="talk-h">Explain this release</h2>
    <p>Ask for a text explanation of the current music-clearance evidence.</p>
    <label>Agent style <select value={persona} disabled={state === 'pending'} onChange={e => { setPersona(e.target.value as AgentId); setAnswer(null); setState('idle'); }}>
      <option value="roy">Roy</option><option value="ava">Ava</option><option value="guz">Guz</option>
    </select></label>{' '}
    <button type="button" disabled={state === 'pending'} onClick={() => { void ask(); }}>Explain the current clearance</button>
    {state === 'pending' && <p role="status">Reading current graph evidence and requesting an explanation…</p>}
    {state === 'unavailable' && <p role="status">Model explanation unavailable. It may be unconfigured, busy or unable to return a current answer. The graph analysis above remains authoritative.</p>}
    {answer && <div data-testid="talk-answer">
      <p><strong>AI explanation — verify against the cited evidence.</strong></p>
      <p>{answer.explanation}</p>
      <ul>{answer.sourceRefIds.map(id => { const source = analysis.sources.find(s => s.id === id); return source ? <li key={id}><a href={`#source-${encodeURIComponent(id)}`} onClick={e => focusSource(e, id)}>{source.path}</a></li> : null; })}</ul>
      <p className="muted">Model: {answer.model} · Tokens: {answer.usage.totalTokens} · Graph revision: {answer.revision}</p>
    </div>}
    <p className="muted">Text only. Agent style changes wording, never access or clearance. Recorded voice previews are separate.</p>
  </section>;
}
