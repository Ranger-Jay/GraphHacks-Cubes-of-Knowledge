import { useEffect, useRef } from 'react';
import {
  IMPORT_FAILURE_COPY, UNCERTAIN_COPY, UNCERTAIN_FAILURES, UNCONFIRMED_ACTION_COPY, UNCONFIRMED_COPY,
  cardActions, formatUtcDate, isBusy, isCloseKey, type IdeaSummary, type ImportState,
} from './ideaImport';

/** Where the verified idea text stands. The text comes from the server detail read, never a browser file fetch or a fallback. */
export type IdeaDetailState = 'loading' | 'ready' | 'unavailable';
export const DETAIL_LOADING_COPY = 'Loading the verified idea text...';
export const DETAIL_UNAVAILABLE_COPY = 'The verified text for this idea is not available, so it cannot be added from here.';

export interface IdeaCardViewProps {
  idea: IdeaSummary;
  state: ImportState;
  detail?: IdeaDetailState;
  /** null = Add is allowed. A string = why it is not (READY / owner-access / binding guard); shown, never hidden. */
  addBlockedReason: string | null;
  onAdd: () => void;
  onRecheck: () => void;
  onNewAttempt: () => void;
  onClose: () => void;
  titleId: string;
  bodyId: string;
}

/** Presentational part (also what the static-markup tests render). It decides nothing: `cardActions` and the guard do. */
export function IdeaCardView({ idea, state, detail = 'ready', addBlockedReason, onAdd, onRecheck, onNewAttempt, onClose, titleId, bodyId }: IdeaCardViewProps) {
  const actions = cardActions(state);
  const busy = isBusy(state);
  const blocked = addBlockedReason !== null || detail !== 'ready';
  const uncertain = state.phase === 'unconfirmed' || (state.phase === 'error' && UNCERTAIN_FAILURES.has(state.reason));
  return (
    <section className="idea-card" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId} data-testid="idea-card" data-import-phase={state.phase}>
      <h2 id={titleId} className="idea-card-title" tabIndex={-1}>{idea.filename}</h2>
      <p className="idea-card-tag"><strong>Synthetic demo idea.</strong> A fictional proposal, not a verified fact or a clearance.</p>
      <dl className="idea-card-dates">
        <div><dt>Submitted</dt><dd>{formatUtcDate(idea.submittedAt)}</dd></div>
        <div><dt>Last updated</dt><dd>{formatUtcDate(idea.touchedAt)}</dd></div>
      </dl>
      <p id={bodyId} className="idea-card-text">{detail === 'ready' ? idea.text : detail === 'loading' ? DETAIL_LOADING_COPY : DETAIL_UNAVAILABLE_COPY}</p>
      <div className="idea-card-status" role="status" aria-live="polite">
        {state.phase === 'pending' && 'Adding to the cube...'}
        {state.phase === 'checking' && 'Checking the cube (read only)...'}
        {state.phase === 'verifying' && 'Confirming with the cube...'}
        {state.phase === 'added' && 'Added to the cube.'}
        {state.phase === 'present' && 'This idea is already in the cube.'}
        {state.phase === 'unconfirmed' && <>{UNCERTAIN_COPY} <span className="idea-card-detail">{UNCONFIRMED_COPY[state.reason]}</span></>}
        {state.phase === 'error' && IMPORT_FAILURE_COPY[state.reason]}
        {state.phase === 'idle' && addBlockedReason !== null && addBlockedReason}
      </div>
      {uncertain && actions.recheck && <p className="idea-card-help">{UNCONFIRMED_ACTION_COPY.recheck} {UNCONFIRMED_ACTION_COPY.retry}</p>}
      <div className="idea-card-actions">
        {actions.add !== null && (
          <button type="button" className="idea-card-add" onClick={onAdd} disabled={blocked || busy} aria-busy={busy}>
            {actions.add === 'retry' ? 'Retry Add to cube' : 'Add to cube'}
          </button>)}
        {actions.add === null && !actions.newAttempt && (state.phase === 'added' || busy) && (
          <button type="button" className="idea-card-add" disabled aria-busy={busy}>{state.phase === 'added' ? 'Added' : state.phase === 'pending' ? 'Adding...' : state.phase === 'checking' ? 'Checking...' : 'Confirming...'}</button>)}
        {actions.recheck && <button type="button" className="idea-card-recheck" onClick={onRecheck} disabled={addBlockedReason !== null}>Re-check</button>}
        {actions.newAttempt && <button type="button" className="idea-card-new-attempt" onClick={onNewAttempt} disabled={addBlockedReason !== null}>Refresh and start a new attempt</button>}
        <button type="button" className="idea-card-close" onClick={onClose}>Close</button>
      </div>
      {addBlockedReason !== null && state.phase !== 'idle' && <p className="idea-card-help">{addBlockedReason}</p>}
    </section>
  );
}

export interface IdeaCardProps extends Omit<IdeaCardViewProps, 'titleId' | 'bodyId'> {
  /** Element id to focus on close when the opener no longer exists (e.g. the pool item left after Added). */
  returnFocusTo?: string;
}

/**
 * Accessible inspect card, CONTROLLED: all import state, attempts and async work live in the studio controller, which
 * outlives the card (close/reopen keeps an unresolved attempt). Opening never imports. Focus moves to the title on
 * open and returns to the opener on close; Escape closes. UNPROVEN until the real-browser proof (see PR body).
 */
export function IdeaCard(props: IdeaCardProps) {
  const { idea, onClose, returnFocusTo, ...viewProps } = props;
  const openerRef = useRef<Element | null>(null);
  const titleId = `idea-title-${idea.id}`;
  const bodyId = `idea-body-${idea.id}`;
  useEffect(() => {
    openerRef.current = document.activeElement;
    document.getElementById(titleId)?.focus();
    return () => {
      const opener = openerRef.current as HTMLElement | null;
      if (opener && opener.isConnected && opener !== document.body) opener.focus?.();
      else if (returnFocusTo) document.getElementById(returnFocusTo)?.focus();
    };
  }, [titleId, returnFocusTo]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isCloseKey(e.key)) { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <IdeaCardView idea={idea} onClose={onClose} {...viewProps} titleId={titleId} bodyId={bodyId} />;
}
