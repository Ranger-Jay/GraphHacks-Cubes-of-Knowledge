import type {
  AgentId,
  SpaceSceneDispatchResult,
  SpaceSceneEvent,
  SpaceSceneSnapshot,
} from '@cubes/contracts';

export interface SpaceSceneBridge {
  dispatch: (event: unknown) => Promise<SpaceSceneDispatchResult>;
  readCurrent?: () => SpaceSceneSnapshot;
}

export interface SpaceSceneAudioPlayerBinding {
  play: (soundName: string) => void;
}

export interface SpaceSceneMountOptions {
  audioPlayerBinding?: SpaceSceneAudioPlayerBinding;
  onAddedBinding?: (listener: (ideaId: string) => void) => () => void;
  /** Direct callback hook for server read-back of completed ingestion */
  onAdded?: (ideaId: string) => void;
  /** Optional container element class or ID */
  className?: string;
}

export interface SpaceSceneInstance {
  update: (snapshot: SpaceSceneSnapshot) => void;
  unmount: () => void;
  getSnapshot: () => SpaceSceneSnapshot;
  openSolarPanel: (openerElement?: HTMLElement | null) => void;
  closeSolarPanel: () => void;
  isMounted: () => boolean;
  getCubeFocus?: () => 'main' | 'disconnected';
  setCubeFocus?: (focus: 'main' | 'disconnected') => void;
  toggleCubeFocus?: () => void;
}
