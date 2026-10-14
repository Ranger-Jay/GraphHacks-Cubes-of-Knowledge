import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Server-held evidence key. Graph writers without it cannot create or re-point an evidence binding:
 * each binding (License -[:EVIDENCED_BY]-> Source, Cut -[:LISTED_IN]-> cue sheet) carries an HMAC over
 * (binding type, tenant, bound node id, file path, file SHA-256). The key never enters the graph.
 */
export type BindingKind = 'EVIDENCED_BY' | 'LISTED_IN';

/** GRAPH_EVIDENCE_KEY: at least 32 characters. Absent or short → null (nothing verifies; fail closed). */
export function evidenceKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env['GRAPH_EVIDENCE_KEY'];
  return typeof raw === 'string' && raw.length >= 32 ? Buffer.from(raw, 'utf8') : null;
}

export function bindingSig(key: Buffer, kind: BindingKind, tenantId: string, subjectId: string, path: string, sha256: string): string {
  return createHmac('sha256', key).update(JSON.stringify(['cubes-evidence-binding/v1', kind, tenantId, subjectId, path, sha256])).digest('hex');
}

export function bindingHolds(key: Buffer | null, sig: unknown, kind: BindingKind, tenantId: string, subjectId: string | null, path: string | null, sha256: string | null): boolean {
  if (!key || typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig) || !subjectId || !path || !sha256) return false;
  const expected = Buffer.from(bindingSig(key, kind, tenantId, subjectId, path, sha256), 'hex');
  return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}
