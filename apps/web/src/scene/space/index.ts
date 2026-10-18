import { SpaceSceneAdapter } from './SpaceSceneAdapter.js';
import type { SpaceSceneBridge, SpaceSceneInstance, SpaceSceneMountOptions } from './types.js';
import type { SpaceSceneSnapshot } from '@cubes/contracts';

export * from './types.js';
export { SpaceSceneAdapter } from './SpaceSceneAdapter.js';
export { SolarCorePanel } from './SolarCorePanel.js';
export { SceneThreeRenderer } from './SceneThreeRenderer.js';

/**
 * Mounts the v042 Space Scene Adapter into the specified DOM container.
 *
 * @param container Target HTMLElement
 * @param bridge SpaceSceneBridge with dispatch and optional readCurrent
 * @param initialSnapshot Optional initial snapshot (defaults to bridge.readCurrent() or CHECKING)
 * @param options Audio and server read-back bindings
 */
export function mount(
  container: HTMLElement,
  bridge: SpaceSceneBridge,
  initialSnapshot?: SpaceSceneSnapshot,
  options?: SpaceSceneMountOptions
): SpaceSceneInstance {
  return new SpaceSceneAdapter(container, bridge, initialSnapshot, options);
}

export const mountSpaceScene = mount;
