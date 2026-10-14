import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Server-held evidence key. Graph writers without it cannot create, re-point or re-purpose an evidence
 * binding (License -[:EVIDENCED_BY]-> Source, Cut -[:LISTED_IN]-> cue sheet). Each binding carries an
 * HMAC over the whole claim it supports: binding type, tenant, release, bound node id, file path, file
 * SHA-256, the release revision it was recorded at, and the tracks and cuts it speaks for. The key
 * never enters the graph.
 *
 * Limit (accepted MVP residual): signed bindings never expire and Release.revision is unsigned. A
 * signed record copied back into the graph holds at its own revision and at every later one, even after
 * the key holder removed it: revocation is not enforced. No claim the key holder never signed verifies.
 * Revocation and rollback protection need a ledger outside the graph.
 */
export type BindingKind = 'EVIDENCED_BY' | 'LISTED_IN';

export interface BindingClaim {
  kind: BindingKind; tenantId: string; releaseId: string; subjectId: string; path: string; sha256: string;
  /** Release revision number the binding was recorded at (rel-x@rN → N). */
  rev: number;
  /** Track ids this binding speaks for (EVIDENCED_BY: tracks the license covers). */
  tracks: string[];
  /** Cut ids this binding speaks for (EVIDENCED_BY: cuts the license is valid for). */
  cuts: string[];
}

/** GRAPH_EVIDENCE_KEY: at least 32 characters. Absent or short → null (nothing verifies; fail closed). */
export function evidenceKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env['GRAPH_EVIDENCE_KEY'];
  return typeof raw === 'string' && raw.length >= 32 ? Buffer.from(raw, 'utf8') : null;
}

/** `rel-wad@r2` → 2 for release `rel-wad`; anything else → null. */
export function revisionNumber(releaseId: string, revision: unknown): number | null {
  if (typeof revision !== 'string' || !revision.startsWith(`${releaseId}@r`)) return null;
  const n = revision.slice(releaseId.length + 2);
  return /^[1-9][0-9]{0,8}$/.test(n) ? Number(n) : null;
}

export function bindingSig(key: Buffer, c: BindingClaim): string {
  return createHmac('sha256', key).update(JSON.stringify(['cubes-evidence-binding/v2', c.kind, c.tenantId, c.releaseId,
    c.subjectId, c.path, c.sha256, c.rev, [...c.tracks].sort(), [...c.cuts].sort()])).digest('hex');
}

const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : null);

/**
 * True only if the stored binding is signed for this exact claim, was recorded at or before the
 * release's current revision, and names the track and cut it is being used for (when given).
 */
export function bindingHolds(key: Buffer | null, stored: { sig: unknown; rev: unknown; tracks: unknown; cuts: unknown },
  claim: { kind: BindingKind; tenantId: string; releaseId: string; subjectId: string | null; path: string | null; sha256: string | null },
  use: { currentRev: number | null; trackId?: string; cutId?: string }): boolean {
  const { sig, rev } = stored;
  const tracks = strList(stored.tracks);
  const cuts = strList(stored.cuts);
  if (!key || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig) || !claim.subjectId || !claim.path || !claim.sha256) return false;
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 1 || use.currentRev === null || rev > use.currentRev) return false;
  if (!tracks || !cuts) return false;
  if (use.trackId !== undefined && !tracks.includes(use.trackId)) return false;
  if (use.cutId !== undefined && !cuts.includes(use.cutId)) return false;
  const expected = Buffer.from(bindingSig(key, { ...claim, subjectId: claim.subjectId, path: claim.path, sha256: claim.sha256, rev, tracks, cuts }), 'hex');
  return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}
