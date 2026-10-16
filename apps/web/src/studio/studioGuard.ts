import type { ScenePhase } from '@cubes/contracts';
import { IMPORT_UNBOUND_COPY } from './ideaImport';

/**
 * Effective access for THIS session as far as the web shell can know it. The shell cannot read its own role from any
 * shipped route, so the default is UNKNOWN and Add stays off. The server remains the only authority: a 401/403 from the
 * import route flips the controller to DENIED. The existing reader proxy can never import (contract, PR #50).
 */
export type StudioAccess = 'OWNER' | 'READER' | 'UNKNOWN' | 'DENIED';

export interface StudioEnv { phase: ScenePhase | null | undefined; access: StudioAccess }

export const READY_REQUIRED_COPY = 'Adding ideas is available only when the cube is ready.';
export const ACCESS_COPY: Record<Exclude<StudioAccess, 'OWNER'>, string> = {
  UNKNOWN: 'Owner access is not confirmed for this session, so adding is off.',
  READER: 'This session can read ideas but needs owner access to add them.',
  DENIED: 'The server refused owner access for this session, so adding is off.',
};

/**
 * Why Add is not allowed right now, or null when it is. FAIL CLOSED: an absent or unknown phase counts as not READY, an
 * absent binding counts as unbound, unknown access counts as no access. Order: binding, READY, access.
 */
export function addBlockedReason(env: StudioEnv | null | undefined, bound: boolean): string | null {
  if (!bound) return IMPORT_UNBOUND_COPY;
  if (!env || env.phase !== 'READY') return READY_REQUIRED_COPY;
  if (env.access !== 'OWNER') return ACCESS_COPY[env.access === 'READER' || env.access === 'DENIED' ? env.access : 'UNKNOWN'];
  return null;
}
