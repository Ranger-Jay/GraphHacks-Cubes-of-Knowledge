import { useEffect, useSyncExternalStore } from 'react';
import type { ScenePhase } from '@cubes/contracts';
import { IdeaCard } from './IdeaCard';
import type { IdeaStudioController } from './studioController';
import { addBlockedReason, type StudioAccess } from './studioGuard';
import type { AccessStore } from './accessLoader';

/** What the shell binds. Absent = nothing is mounted and nothing can import (the production default today). */
export interface StudioBinding {
  controller: IdeaStudioController; access?: StudioAccess;
  /** Live server-derived capability (v049). When present, the panel resolves/clears it and it beats `access`. */
  accessStore?: AccessStore;
  subscribeAdded?: (listener: (ideaId: string) => void) => () => void;
}

export const POOL_WAITING_COPY = 'Ideas can be inspected when the cube is ready.';
export const POOL_UNAVAILABLE_COPY = 'Could not read the ideas right now.';
export const POOL_DENIED_COPY = 'This session is not allowed to read the ideas.';
export const POOL_EMPTY_COPY = 'No ideas are waiting.';

/**
 * The ONE IdeaVerse inspect/import surface in the shell: a pool list (the selection surface the comet scene will
 * replace by calling `controller.open(id)`) and the single `IdeaCard`. Mounted only when a binding exists, and it
 * reads/adds only in READY. The panel reports the live ScenePhase to the controller; until that effect runs it is still
 * fail closed, because the guard below also checks the phase prop of THIS render.
 *
 * With an access store (v049), the panel is the join point between the server capability and the controller: it
 * subscribes to the store, reports the store's live access to the controller, re-resolves on READY, clears the
 * stale capability when leaving READY (re-query included), and CLEARS the store on unmount so a delayed OWNER
 * can never land after the panel is gone. The store outlives the panel (the binding is created once in
 * main.tsx), so unmount must NOT dispose it: dispose() is permanent teardown, and a disposed store never
 * re-resolves. Clear keeps the store reusable, so a later mount performs a fresh GET. Without a store, the
 * static `access` prop is the whole story.
 */
const NO_SUBSCRIBE = () => () => {};
export function StudioPanel({ controller, phase, access = 'UNKNOWN', accessStore }: { controller: IdeaStudioController; phase: ScenePhase | null; access?: StudioAccess; accessStore?: AccessStore }) {
  const storeAccess = useSyncExternalStore(
    accessStore ? accessStore.subscribe : NO_SUBSCRIBE,
    accessStore ? accessStore.getSnapshot : () => access,
    accessStore ? accessStore.getSnapshot : () => access,
  );
  const effectiveAccess = accessStore ? storeAccess : access;
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.setEnv({ phase: phase ?? 'CHECKING', access: effectiveAccess }); }, [controller, phase, effectiveAccess]);
  useEffect(() => {
    if (!accessStore) return;
    if (phase === 'READY') void accessStore.refresh();
    else accessStore.clear();
  }, [accessStore, phase]);
  // Leaving the release view (unmount) must not leave the controller believing the cube is READY, and must
  // not let a delayed access response land after the panel is gone. CLEAR, do not dispose: the store
  // outlives this panel, and the next mount must re-resolve with a fresh GET (dispose is permanent).
  useEffect(() => () => { controller.setEnv({ phase: 'CHECKING', access: 'UNKNOWN' }); accessStore?.clear(); }, [controller, accessStore]);
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
