import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentId, AvailableAnalysis, TalkResponse } from '@cubes/contracts';
import { requestTalk } from '../talk';
import { focusSource } from './AnalysisView';
import { isAudioMuted, localReadAloudVoices, readCurrentExplanation, subscribeAudioMuted } from '../scene/audio';

/** Mounted only with current READY analysis, keyed by shell generation/revision. No request on mount. */
export function TalkPanel({ analysis }: { analysis: AvailableAnalysis }) {
  const [persona, setPersona] = useState<AgentId>('roy');
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'unavailable'>('idle');
  const [answer, setAnswer] = useState<TalkResponse | null>(null);
  const active = useRef<ReturnType<typeof requestTalk> | null>(null);
  const live = useRef(true);
  const reading = useRef<{ stop: () => void } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechMessage, setSpeechMessage] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const muted = useSyncExternalStore(subscribeAudioMuted, isAudioMuted, () => true);
  const stopReading = () => { reading.current?.stop(); reading.current = null; setSpeaking(false); };
  useEffect(() => {
    live.current = true;
    const updateVoices = () => { const next = localReadAloudVoices(); setVoices(next); setVoiceURI(previous => next.some(v => v.voiceURI === previous) ? previous : (next.find(v => v.default)?.voiceURI ?? next.find(v => v.lang.startsWith('en'))?.voiceURI ?? next[0]?.voiceURI ?? '')); };
    updateVoices();
    const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
    synth?.addEventListener('voiceschanged', updateVoices);
    return () => { live.current = false; active.current?.cancel(); active.current = null; reading.current?.stop(); reading.current = null; synth?.removeEventListener('voiceschanged', updateVoices); };
  }, []);
  const ask = async () => {
    if (active.current !== null) return;
    stopReading(); setSpeechMessage('');
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
    <label>Agent style <select value={persona} disabled={state === 'pending'} onChange={e => { stopReading(); setSpeechMessage(''); setPersona(e.target.value as AgentId); setAnswer(null); setState('idle'); }}>
      <option value="roy">Roy</option><option value="ava">Ava</option><option value="guz">Guz</option>
    </select></label>{' '}
    <button type="button" disabled={state === 'pending'} onClick={() => { void ask(); }}>Explain the current clearance</button>
    {state === 'pending' && <p role="status">Reading current graph evidence and requesting an explanation…</p>}
    {state === 'unavailable' && <p role="status">Model explanation unavailable. It may be unconfigured, busy or unable to return a current answer. The graph analysis above remains authoritative.</p>}
    {answer && <div data-testid="talk-answer">
      <p><strong>AI explanation — verify against the cited evidence.</strong></p>
      <p>{answer.explanation}</p>
      <div className="read-aloud-controls">
        <label>Device voice <select value={voiceURI} disabled={speaking || voices.length === 0} onChange={e => setVoiceURI(e.target.value)}>
          {voices.length === 0 && <option value="">No local voice available</option>}
          {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
        </select></label>{' '}
        <button type="button" disabled={muted || !voiceURI || speaking} onClick={() => {
          setSpeechMessage('');
          const call = readCurrentExplanation(answer.explanation, answer.persona, voiceURI, 'READY', () => { reading.current = null; if (live.current) setSpeaking(false); });
          if (!call.started) { setSpeechMessage('Read-aloud could not start. Check the device voice and audio setting.'); return; }
          reading.current = call; setSpeaking(true);
        }}>Read aloud</button>{' '}
        <button type="button" disabled={!speaking} onClick={stopReading}>Stop reading</button>
        {muted && <p>Unmute the scene audio before using read-aloud.</p>}
        {voices.length === 0 && <p>No local browser voice is available on this device. The text remains readable.</p>}
        {speechMessage && <p role="status">{speechMessage}</p>}
      </div>
      <ul>{answer.sourceRefIds.map(id => { const source = analysis.sources.find(s => s.id === id); return source ? <li key={id}><a href={`#source-${encodeURIComponent(id)}`} onClick={e => focusSource(e, id)}>{source.path}</a></li> : null; })}</ul>
      <p className="muted">Model: {answer.model} · Tokens: {answer.usage.totalTokens} · Graph revision: {answer.revision}</p>
    </div>}
    <p className="muted">Optional read-aloud uses a local device voice. Agent style changes wording, never access or clearance. Recorded voice previews are separate.</p>
  </section>;
}
