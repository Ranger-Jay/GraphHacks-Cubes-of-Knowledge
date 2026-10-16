import { useEffect, useSyncExternalStore } from 'react';
import type { ScenePhase } from '@cubes/contracts';
import { IdeaCard } from './IdeaCard';
import type { IdeaStudioController } from './studioController';
import { addBlockedReason, type StudioAccess } from './studioGuard';

/** What the shell binds. Absent = nothing is mounted and nothing can import (the production default today). */
export interface StudioBinding { controller: IdeaStudioController; access?: StudioAccess }

export const POOL_WAITING_COPY = 'Ideas can be inspected when the cube is ready.';
export const POOL_UNAVAILABLE_COPY = 'Could not read the ideas right now.';
export const POOL_DENIED_COPY = 'This session is not allowed to read the ideas.';
export const POOL_EMPTY_COPY = 'No ideas are waiting.';

/**
 * The ONE IdeaVerse inspect/import surface in the shell: a pool list (the selection surface the comet scene will
 * replace by calling `controller.open(id)`) and the single `IdeaCard`. Mounted only when a binding exists, and it
 * reads/adds only in READY. The panel reports the live ScenePhase to the controller; until that effect runs it is still
 * fail closed, because the guard below also checks the phase prop of THIS render.
 */
export function StudioPanel({ controller, phase, access = 'UNKNOWN' }: { controller: IdeaStudioController; phase: ScenePhase | null; access?: StudioAccess }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.setEnv({ phase: phase ?? 'CHECKING', access }); }, [controller, phase, access]);
  // Leaving the release view (unmount) must not leave the controller believing the cube is READY.
  useEffect(() => () => { controller.setEnv({ phase: 'CHECKING', access: 'UNKNOWN' }); }, [controller]);
  const ready = phase === 'READY' && snap.env.phase === 'READY';
  const open = snap.open;
  // Either the controller's guard or THIS render's phase may block; both must allow.
  const blocked = open ? (open.addBlockedReason ?? addBlockedReason({ phase: phase ?? 'CHECKING', access: snap.env.access }, true)) : null;
  return (
    <section className="panel studio-panel" aria-labelledby="idea-pool-h" data-testid="studio-panel" data-studio-ready={ready ? 'true' : 'false'}>
      <h2 id="idea-pool-h" tabIndex={-1}>IdeaVerse ideas</h2>
      {!ready && <p className="muted" data-testid="studio-waiting">{POOL_WAITING_COPY}</p>}
      {ready && snap.pool.status === 'loading' && snap.pool.ideas.length === 0 && <p className="muted" role="status">Loading ideas...</p>}
      {ready && snap.pool.status === 'unavailable' && <p role="status">{POOL_UNAVAILABLE_COPY}</p>}
      {ready && snap.pool.status === 'denied' && <p role="status">{POOL_DENIED_COPY}</p>}
      {ready && snap.pool.status === 'ready' && snap.pool.ideas.length === 0 && <p className="muted">{POOL_EMPTY_COPY}</p>}
      {ready && snap.pool.ideas.length > 0 && (
        <ul className="plain idea-pool" aria-label="Ideas waiting to be added">
          {snap.pool.ideas.map(i => (
            <li key={i.id}><button type="button" className="idea-pool-item" aria-pressed={open?.idea.id === i.id} onClick={() => { void controller.open(i.id); }}>{i.filename}</button></li>))}
        </ul>)}
      {open && (
        <IdeaCard key={open.idea.id} idea={open.idea} state={open.state} detail={open.detail} addBlockedReason={blocked}
          onAdd={controller.add} onRecheck={controller.recheck} onNewAttempt={controller.newAttempt} onClose={controller.close} returnFocusTo="idea-pool-h" />)}
    </section>
  );
}
