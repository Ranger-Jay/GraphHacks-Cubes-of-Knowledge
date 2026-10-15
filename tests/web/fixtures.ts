/** DEV/UNIT FIXTURES ONLY. Synthetic shapes for rendering tests. Not graph evidence; cannot satisfy live acceptance. */
import type { AvailableAnalysis, UnavailableAnalysis, GraphStatusResponse } from '@cubes/contracts';

export const FIXTURE_LABEL = 'dev/unit fixture only';
const src = (id: string, path: string) => ({ id, path, sha256: 'f'.repeat(64), excerpt: `fixture excerpt ${id}`, startOffset: 0, endOffset: 10 });

export const available = (clearance: AvailableAnalysis['clearance']): AvailableAnalysis => ({
  status: 'AVAILABLE', requestId: 'fixture-req', releaseId: 'fixture-release', cutId: 'cut-v4', revision: 'rev-1',
  clearance, summary: `${FIXTURE_LABEL}: summary`,
  evidence: [
    { id: 'e1', status: 'VERIFIED', statement: 'Track A licensed', sourceRefIds: ['s1'] },
    { id: 'e2', status: 'STALE', statement: 'Track B license from old cut', sourceRefIds: ['s2'] },
    { id: 'e3', status: 'UNKNOWN', statement: 'Track C coverage incomplete', sourceRefIds: [] },
    { id: 'e4', status: 'MISSING', statement: 'Track D no license', sourceRefIds: ['s-missing'] }
  ],
  nodes: [{ id: 'n1', label: 'Release', kind: 'Release', sourceRefIds: [] }, { id: 'n2', label: 'Track A', kind: 'Track', sourceRefIds: ['s1'] }],
  edges: [{ id: 'x1', from: 'n1', to: 'n2', type: 'USES', sourceRefIds: ['s1'] }, { id: 'x2', from: 'n1', to: 'ghost', type: 'USES', sourceRefIds: [] }],
  sources: [src('s1', 'graph/seed/sources/a.txt'), src('s2', 'graph/seed/sources/b.txt')],
  proposedActions: [{ id: 'p1', kind: 'REQUEST_CLEARANCE', label: 'Request clearance for Track D', requiresHumanApproval: true, sourceRefIds: ['s2'] }]
});
export const unavailable = (reason: UnavailableAnalysis['reason']): UnavailableAnalysis => ({
  status: 'UNAVAILABLE', requestId: 'fixture-req', reason, message: `${FIXTURE_LABEL}: graph unavailable`,
  evidence: [], nodes: [], edges: [], sources: [], proposedActions: []
});
export const graphDown: GraphStatusResponse = { status: 'UNAVAILABLE', ready: false, graphName: 'wad_studio', requestId: 'r', checkedAt: '2026-10-14T00:00:00Z', reason: 'NOT_IMPLEMENTED' };
export const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
