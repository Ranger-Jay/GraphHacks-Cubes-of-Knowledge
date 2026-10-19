import type { SpaceSceneHandlers, SpaceSceneSnapshot } from '@cubes/contracts';
import { createSpaceSceneBridge, projectSpaceScene, type SpaceSceneInput } from './spaceSceneBridge';
import type { StudioSnapshot } from './studio/studioController';

/** Three recent proposals; a refreshing pool retains its last settled records. */
export function waitingSceneIdeaIds(pool: StudioSnapshot, now = Date.now()): string[] {
  if (pool.env.phase !== 'READY' || (pool.pool.status !== 'ready' && pool.pool.status !== 'loading')) return [];
  const ideas = pool.pool.ideas.filter(i => !i.imported).slice().sort((a, b) => Date.parse(b.touchedAt) - Date.parse(a.touchedAt) || a.id.localeCompare(b.id));
  const recent = ideas.filter(i => { const time = Date.parse(i.touchedAt); return Number.isFinite(time) && time <= now && now - time <= 48 * 60 * 60 * 1000; });
  return (recent.length ? recent : ideas).slice(0, 3).map(i => i.id);
}

/** Keeps bridge authority separate from the mutable renderer view. */
export function createSpaceSceneHost(handlers: SpaceSceneHandlers) {
  let epoch = 0;
  let previous: { generation: number; phase: string } | null = null;
  let current = projectSpaceScene({ generation: 0, analysis: null, selectedNodeId: null, reducedMotion: false, audioMuted: true });
  const bridge = createSpaceSceneBridge(() => structuredClone(current), handlers);
  return {
    bridge,
    update(input: SpaceSceneInput): SpaceSceneSnapshot {
      // Every observed phase transition invalidates old events, including outage -> recovery.
      const projected = projectSpaceScene(input);
      if (!previous || previous.generation !== input.generation || previous.phase !== projected.runtime.phase) epoch++;
      previous = { generation: input.generation, phase: projected.runtime.phase };
      current = { ...projected, generation: epoch };
      return structuredClone(current);
    },
    view: (): SpaceSceneSnapshot => structuredClone(current),
    dispose: () => bridge.dispose(),
  };
}
