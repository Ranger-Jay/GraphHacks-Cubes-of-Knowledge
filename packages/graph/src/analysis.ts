import { randomUUID } from 'node:crypto';
import type {
  AnalysisResponse, AvailableAnalysis, ClearanceStatus, EvidenceItem, GraphEdge, GraphNode, ProposedAction,
  SourceRef, UnavailableAnalysis
} from '@cubes/contracts';
import { GraphUnavailableError, type GraphClient } from './client.js';
import { QUERIES } from './queries.js';

interface CurrentCutRow {
  releaseId: string; releaseTitle: string; revision: string; currentCutEdgeId: string; currentCutRefs: string[] | null;
  cutId: string; cutVersion: number; cutLabel: string;
  cueSheetId: string | null; cueSheetComplete: boolean | null; listedInEdgeId: string | null; listedInRefs: string[] | null;
}
interface TrackRow {
  trackId: string; trackTitle: string; usesEdgeId: string; usesRefs: string[] | null;
  licenseId: string | null; licenseLabel: string | null; coversEdgeId: string | null; coversRefs: string[] | null;
  validCutId: string | null; validCutLabel: string | null; validForEdgeId: string | null; validForRefs: string[] | null;
  licenseSourceId: string | null; evidencedByEdgeId: string | null;
}
interface RefRow { id: string; path: string; sha256: string; excerpt: string; startOffset: number; endOffset: number }

export function unavailable(reason: UnavailableAnalysis['reason'], message: string, requestId = randomUUID()): UnavailableAnalysis {
  return { status: 'UNAVAILABLE', requestId, reason, message, evidence: [], nodes: [], edges: [], sources: [], proposedActions: [] };
}

const refs = (v: string[] | null | undefined): string[] => (Array.isArray(v) ? v : []);

/**
 * Current-cut music clearance from the graph only. Returns null when the release is not in the
 * caller's tenant (the API maps that to 404). Any graph failure returns UNAVAILABLE with no evidence.
 * Rules: a track is VERIFIED only by a license that COVERS it and is VALID_FOR the current cut;
 * STALE when its only licenses are valid for other cuts; MISSING when none covers it. Without a
 * complete cue sheet for the current cut, track coverage is not established: clearance is UNKNOWN.
 */
export async function analyzeRelease(client: GraphClient, tenantId: string, releaseId: string, requestId = randomUUID()): Promise<AnalysisResponse | null> {
  try {
    const head = (await client.read<CurrentCutRow>(QUERIES.READ_RELEASE_CURRENT_CUT, { tenantId, releaseId }))[0];
    if (!head) return null;
    const rows = await client.read<TrackRow>(QUERIES.READ_CUT_TRACK_LICENSES, { cutId: head.cutId, tenantId });

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const addNode = (id: string, label: string, kind: string, sourceRefIds: string[] = []) => {
      if (!nodes.has(id)) nodes.set(id, { id, label, kind, sourceRefIds });
    };
    const addEdge = (id: string | null, from: string, to: string, type: string, sourceRefIds: string[]) => {
      if (id && !edges.has(id)) edges.set(id, { id, from, to, type, sourceRefIds });
    };

    addNode(head.releaseId, head.releaseTitle, 'Release');
    addNode(head.cutId, head.cutLabel, 'Cut');
    addEdge(head.currentCutEdgeId, head.releaseId, head.cutId, 'CURRENT_CUT', refs(head.currentCutRefs));
    const coverageComplete = head.cueSheetId !== null && head.cueSheetComplete === true;
    if (head.cueSheetId) {
      addNode(head.cueSheetId, 'Cue sheet', 'Source');
      addEdge(head.listedInEdgeId, head.cutId, head.cueSheetId, 'LISTED_IN', refs(head.listedInRefs));
    }

    const tracks = new Map<string, { title: string; usesRefs: string[]; current: string[]; stale: string[]; staleCuts: Set<string> }>();
    for (const r of rows) {
      let t = tracks.get(r.trackId);
      if (!t) {
        t = { title: r.trackTitle, usesRefs: refs(r.usesRefs), current: [], stale: [], staleCuts: new Set() };
        tracks.set(r.trackId, t);
        addNode(r.trackId, r.trackTitle, 'Track');
        addEdge(r.usesEdgeId, head.cutId, r.trackId, 'USES_TRACK', t.usesRefs);
      }
      if (!r.licenseId || !r.validCutId) continue;
      addNode(r.licenseId, r.licenseLabel ?? r.licenseId, 'License');
      addEdge(r.coversEdgeId, r.licenseId, r.trackId, 'COVERS', refs(r.coversRefs));
      if (r.validCutId !== head.cutId) addNode(r.validCutId, r.validCutLabel ?? r.validCutId, 'Cut');
      addEdge(r.validForEdgeId, r.licenseId, r.validCutId, 'VALID_FOR', refs(r.validForRefs));
      if (r.licenseSourceId) {
        addNode(r.licenseSourceId, 'License evidence', 'Source');
        addEdge(r.evidencedByEdgeId, r.licenseId, r.licenseSourceId, 'EVIDENCED_BY', []);
      }
      const cited = [...refs(r.coversRefs), ...refs(r.validForRefs)];
      if (r.validCutId === head.cutId) t.current.push(...cited);
      else { t.stale.push(...cited); t.staleCuts.add(r.validCutLabel ?? r.validCutId); }
    }

    const evidence: EvidenceItem[] = [];
    const proposedActions: ProposedAction[] = [];
    const listedRefs = refs(head.listedInRefs);
    for (const [trackId, t] of tracks) {
      if (t.current.length > 0) {
        evidence.push({ id: `ev-${trackId}`, status: 'VERIFIED', statement: `"${t.title}" is licensed for ${head.cutLabel}.`, sourceRefIds: [...new Set([...t.usesRefs, ...t.current])] });
        continue;
      }
      if (!coverageComplete) {
        evidence.push({ id: `ev-${trackId}`, status: 'UNKNOWN', statement: `No current-cut license found for "${t.title}", but cue-sheet coverage for ${head.cutLabel} is not established.`, sourceRefIds: t.usesRefs });
        continue;
      }
      const status = t.stale.length > 0 ? 'STALE' : 'MISSING';
      const statement = status === 'STALE'
        ? `"${t.title}" is cleared only for ${[...t.staleCuts].join(', ')}; no license is valid for ${head.cutLabel}.`
        : `"${t.title}" is used in ${head.cutLabel} and no license covers it.`;
      const cite = [...new Set([...t.usesRefs, ...listedRefs, ...t.stale])];
      evidence.push({ id: `ev-${trackId}`, status, statement, sourceRefIds: cite });
      proposedActions.push({ id: `act-clear-${trackId}-${head.cutId}`, kind: 'REQUEST_CLEARANCE', label: `Request clearance of "${t.title}" for ${head.cutLabel}`, requiresHumanApproval: true, sourceRefIds: cite });
    }

    let clearance: ClearanceStatus;
    if (!coverageComplete) clearance = 'UNKNOWN';
    else if (evidence.length > 0 && evidence.every(e => e.status === 'VERIFIED')) clearance = 'ESTABLISHED';
    else clearance = evidence.length === 0 ? 'UNKNOWN' : 'GAP';

    const allRefIds = new Set<string>();
    for (const e of evidence) e.sourceRefIds.forEach(id => allRefIds.add(id));
    for (const e of edges.values()) e.sourceRefIds.forEach(id => allRefIds.add(id));
    const sources: SourceRef[] = allRefIds.size === 0 ? [] : (await client.read<RefRow>(QUERIES.READ_SOURCE_REFS, { ids: [...allRefIds], tenantId }))
      .map(r => ({ id: r.id, path: r.path, sha256: r.sha256, excerpt: r.excerpt, startOffset: r.startOffset, endOffset: r.endOffset }));
    const missingRefs = [...allRefIds].filter(id => !sources.some(s => s.id === id));
    if (missingRefs.length > 0) return unavailable('QUERY_FAILED', 'Cited source references are missing from the graph', requestId);

    const gaps = evidence.filter(e => e.status !== 'VERIFIED').length;
    const summary = clearance === 'ESTABLISHED'
      ? `${head.cutLabel}: all ${evidence.length} tracks have current-cut license evidence.`
      : clearance === 'GAP'
        ? `${head.cutLabel} cannot ship: ${gaps} of ${evidence.length} tracks lack a license valid for this cut.`
        : `${head.cutLabel}: clearance cannot be established from the available sources.`;
    const result: AvailableAnalysis = {
      status: 'AVAILABLE', requestId, releaseId: head.releaseId, cutId: head.cutId, revision: head.revision,
      clearance, summary, evidence, nodes: [...nodes.values()], edges: [...edges.values()], sources, proposedActions
    };
    return result;
  } catch (err) {
    if (err instanceof GraphUnavailableError) return unavailable(err.reason, err.message, requestId);
    return unavailable('QUERY_FAILED', 'Graph result could not be interpreted', requestId);
  }
}

export type GraphHealth = { ok: true; releases: number } | { ok: false; reason: 'CONNECTION_FAILED' | 'QUERY_FAILED' };

/** Real read against the named graph. An absent/empty graph or zero releases is not ready. */
export async function graphHealth(client: GraphClient): Promise<GraphHealth> {
  try {
    const releases = (await client.read<{ releases: number }>(QUERIES.HEALTH))[0]?.releases ?? 0;
    return releases > 0 ? { ok: true, releases } : { ok: false, reason: 'QUERY_FAILED' };
  } catch (err) {
    return { ok: false, reason: err instanceof GraphUnavailableError ? err.reason : 'QUERY_FAILED' };
  }
}
