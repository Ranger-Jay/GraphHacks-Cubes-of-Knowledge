import { useEffect, useReducer, useRef, useState } from 'react';
import {
  IMPORT_FAILURE_COPY, IMPORT_UNBOUND_COPY, formatUtcDate, importReducer, initialImportState, isCloseKey,
  type IdeaSummary, type ImportIdea, type ImportReceipt, type ImportState,
} from './ideaImport';

export interface IdeaCardProps {
  idea: IdeaSummary;
  /** Injected import adapter (UNPROVEN contract, see ideaImport.ts). Absent: the button is disabled and says so. */
  importIdea?: ImportIdea;
  /** Called once, only after a persisted receipt. The owner of the comet scene decides the transition. */
  onAdded?: (receipt: ImportReceipt) => void;
  onClose: () => void;
  /** Fresh key per card open so a retry of the same card reuses it. */
  newIdempotencyKey?: () => string;
}

const defaultKey = () => (globalThis.crypto?.randomUUID?.() ?? `idea-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Presentational part (also what the static-markup tests render). */
export function IdeaCardView({ idea, state, bound, onAdd, onClose, titleId, bodyId }: {
  idea: IdeaSummary; state: ImportState; bound: boolean; onAdd: () => void; onClose: () => void; titleId: string; bodyId: string;
}) {
  const pending = state.phase === 'pending';
  const added = state.phase === 'added';
  return (
    <section className="idea-card" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId} data-testid="idea-card" data-import-phase={state.phase}>
      <h2 id={titleId} className="idea-card-title" tabIndex={-1}>{idea.filename}</h2>
      <p className="idea-card-tag"><strong>Synthetic demo idea.</strong> A fictional proposal, not a verified fact or a clearance.</p>
      <dl className="idea-card-dates">
        <div><dt>Submitted</dt><dd>{formatUtcDate(idea.submittedAt)}</dd></div>
        <div><dt>Last updated</dt><dd>{formatUtcDate(idea.touchedAt)}</dd></div>
      </dl>
      <p id={bodyId} className="idea-card-text">{idea.text}</p>
      <div className="idea-card-status" role="status" aria-live="polite">
        {pending && 'Adding to the cube...'}
        {added && 'Added to the cube.'}
        {state.phase === 'error' && IMPORT_FAILURE_COPY[state.reason]}
        {!bound && state.phase === 'idle' && IMPORT_UNBOUND_COPY}
      </div>
      <div className="idea-card-actions">
        <button type="button" className="idea-card-add" onClick={onAdd} disabled={!bound || pending || added} aria-busy={pending}>
          {added ? 'Added' : pending ? 'Adding...' : state.phase === 'error' ? 'Retry Add to cube' : 'Add to cube'}
        </button>
        <button type="button" className="idea-card-close" onClick={onClose}>Close</button>
      </div>
    </section>
  );
}

/**
 * Accessible inspect card. Opening it never imports. Focus moves to the title on open and returns to the opener on
 * close. Escape closes. A completion that arrives after close or after the idea changed is discarded.
 * UNPROVEN: focus return and Escape in a real browser/screen reader; the logic is covered by pure tests only.
 */
export function IdeaCard({ idea, importIdea, onAdded, onClose, newIdempotencyKey = defaultKey }: IdeaCardProps) {
  const [state, dispatch] = useReducer(importReducer, initialImportState);
  const [key, setKey] = useState(newIdempotencyKey);
  const openerRef = useRef<Element | null>(null);
  const live = useRef({ ideaId: idea.id, mounted: true });
  live.current.ideaId = idea.id;
  const titleId = `idea-title-${idea.id}`;
  const bodyId = `idea-body-${idea.id}`;

  useEffect(() => {
    openerRef.current = document.activeElement;
    document.getElementById(titleId)?.focus();
    live.current.mounted = true;
    return () => { live.current.mounted = false; (openerRef.current as HTMLElement | null)?.focus?.(); };
  }, [titleId]);
  useEffect(() => { dispatch({ type: 'reset' }); setKey(newIdempotencyKey()); }, [idea.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isCloseKey(e.key)) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!importIdea || state.phase === 'pending' || state.phase === 'added') return;
    const requestId = state.requestId + 1;
    const forIdea = idea.id;
    dispatch({ type: 'submit' });
    importIdea(idea, key).then(
      outcome => {
        // Closed or switched to another idea: the completion is stale for THIS card. The actual membership shows up on
        // the next fresh cube read; no success transition is played from a stale completion.
        if (!live.current.mounted || live.current.ideaId !== forIdea) return;
        dispatch({ type: 'settled', requestId, outcome });
        if (outcome.kind === 'persisted') onAdded?.(outcome.receipt);
      },
      () => { if (live.current.mounted && live.current.ideaId === forIdea) dispatch({ type: 'settled', requestId, outcome: { kind: 'failed' } }); },
    );
  };
  return <IdeaCardView idea={idea} state={state} bound={!!importIdea} onAdd={submit} onClose={onClose} titleId={titleId} bodyId={bodyId} />;
}
