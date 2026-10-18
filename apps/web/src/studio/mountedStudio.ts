import type { Fetcher } from '../api';
import { createStudioClient } from './ideaverseClient';
import { IdeaStudioController } from './studioController';
import type { StudioBinding } from './StudioPanel';

/** Reader inspection is live. Add remains off until a server-derived capability is bound. */
export function createMountedStudio(fetcher?: Fetcher): StudioBinding {
  const reads = createStudioClient(fetcher);
  const owner = createStudioClient(fetcher, '/api/owner-rehearsal/studio');
  const listeners = new Set<(ideaId: string) => void>();
  const controller = new IdeaStudioController({
    readOverview: reads.readOverview, readDetail: reads.readDetail,
    importIdea: owner.importIdea, checkImport: owner.checkImport,
    onAdded: (_receipt, ideaId) => { for (const listener of [...listeners]) listener(ideaId); },
  });
  return {
    controller, access: 'UNKNOWN',
    subscribeAdded: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
