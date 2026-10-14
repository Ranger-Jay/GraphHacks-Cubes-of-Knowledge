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
  cueSheetId: string | null; cueSheetComplete: boolean | null; cueSheetCutVersion: number | null; declaredCueCount: number | null;
  listedInEdgeId: string | null; listedInRefs: string[] | null;
}
interface TrackRow {
  trackId: string; trackTitle: string; usesEdgeId: string; usesRefs: string[] | null;
  licenseId: string | null; licenseLabel: string | null; coversEdgeId: string | null; coversRefs: string[] | null;
  validCutId: string | null; validCutLabel: string | null; validCutVersion: number | null; validForEdgeId: string | null; validForRefs: string[] | null;
  licenseSourceId: string | null; evidencedByEdgeId: string | null;
}
interface WitnessRow { id: string; sourceId: string; role: string; subjectTitle: string | null; scopeTitle: string | null; scopeCutVersion: number | null }
interface CueEntryRow { id: string; cueIndex: number; cueTitle: string }
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
    const sheetValid = head.cueSheetId !== null && head.cueSheetComplete === true && head.cueSheetCutVersion === head.cutVersion;
    const cueEntries = head.cueSheetId
      ? await client.read<CueEntryRow>(QUERIES.READ_CUE_ENTRIES, { sourceId: head.cueSheetId, tenantId })
      : [];
    if (head.cueSheetId) {
      addNode(head.cueSheetId, 'Cue sheet', 'Source');
      addEdge(head.listedInEdgeId, head.cutId, head.cueSheetId, 'LISTED_IN', refs(head.listedInRefs));
    }

    // License-scope witness (#9): a COVERS/VALID_FOR link counts only when excerpts from the license's
    // own evidence source name this track and this exact cut. Unsupported links never verify anything.
    const citedIds = [...new Set(rows.flatMap(r => [...refs(r.coversRefs), ...refs(r.validForRefs)]))];
    const witness = new Map((citedIds.length === 0 ? [] : await client.read<WitnessRow>(QUERIES.READ_REF_WITNESSES, { ids: citedIds, tenantId }))
      .map(w => [w.id, w] as const));
    const fromSource = (ids: string[], sourceId: string | null) =>
      ids.map(id => witness.get(id)).filter((w): w is WitnessRow => w !== undefined && sourceId !== null && w.sourceId === sourceId);
    const unsupportedCurrent: { edgeId: string; license: string; title: string; refs: string[]; scopes: number[] }[] = [];

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
      const covW = fromSource(refs(r.coversRefs), r.licenseSourceId);
      const vfW = fromSource(refs(r.validForRefs), r.licenseSourceId);
      const coversOk = covW.some(w => w.subjectTitle === t!.title || w.scopeTitle === t!.title);
      const scopeOk = vfW.some(w => w.role === 'license_scope' && w.scopeCutVersion === r.validCutVersion
        && (w.scopeTitle === t!.title || (w.scopeTitle === null && coversOk)));
      const cited = [...refs(r.coversRefs), ...refs(r.validForRefs)];
      if (!(coversOk && scopeOk)) {
        if (r.validCutId === head.cutId) {
          unsupportedCurrent.push({ edgeId: r.validForEdgeId ?? r.licenseId, license: r.licenseLabel ?? r.licenseId, title: t.title, refs: cited,
            scopes: vfW.map(w => w.scopeCutVersion).filter((v): v is number => v !== null) });
        }
        continue;
      }
      if (r.validCutId === head.cutId) t.current.push(...cited);
      else { t.stale.push(...cited); t.staleCuts.add(r.validCutLabel ?? r.validCutId); }
    }

    // Coverage witness (#8): the cue sheet's parsed entries must match the graph's USES_TRACK set
    // exactly, and every USES_TRACK must cite the cue entry for that same title. Graph edges alone
    // never prove coverage; any mismatch leaves absence unasserted (UNKNOWN).
    const entryById = new Map(cueEntries.map(e => [e.id, e]));
    const supportedTitles = new Set<string>();
    const unsupportedTracks: string[] = [];
    for (const t of tracks.values()) {
      const cites = t.usesRefs.map(id => entryById.get(id)).filter(e => e !== undefined && e.cueTitle === t.title);
      if (cites.length > 0) supportedTitles.add(t.title); else unsupportedTracks.push(t.title);
    }
    const unlinked = cueEntries.filter(e => !supportedTitles.has(e.cueTitle));
    const coverageComplete = sheetValid && cueEntries.length > 0 && cueEntries.length === head.declaredCueCount
      && unlinked.length === 0 && unsupportedTracks.length === 0;

    const evidence: EvidenceItem[] = [];
    const integrity: EvidenceItem[] = [];
    const proposedActions: ProposedAction[] = [];
    const listedRefs = refs(head.listedInRefs);
    if (!coverageComplete) {
      const parts: string[] = [];
      if (!head.cueSheetId) parts.push(`no cue sheet is linked to ${head.cutLabel}`);
      else if (!sheetValid) parts.push(`the linked cue sheet is not a complete listing for ${head.cutLabel}`);
      else if (cueEntries.length !== head.declaredCueCount) parts.push(`the cue sheet declares ${head.declaredCueCount ?? '?'} cue(s) but ${cueEntries.length} are recorded`);
      if (unlinked.length > 0) parts.push(`not linked in the graph: ${unlinked.map(e => `"${e.cueTitle}"`).join(', ')}`);
      if (unsupportedTracks.length > 0) parts.push(`linked without cue-sheet support: ${unsupportedTracks.map(t => `"${t}"`).join(', ')}`);
      integrity.push({ id: `ev-coverage-${head.cutId}`, status: 'UNKNOWN',
        statement: `Track coverage for ${head.cutLabel} is not established: ${parts.join('; ')}.`,
        sourceRefIds: [...new Set([...listedRefs, ...unlinked.map(e => e.id)])] });
    }
    for (const u of unsupportedCurrent) {
      const scope = u.scopes.length > 0 ? `its cited source scope is Cut v${[...new Set(u.scopes)].join(', v')}` : 'its cited source states no matching scope';
      integrity.push({ id: `ev-unsupported-${u.edgeId}`, status: 'UNKNOWN',
        statement: `"${u.license}" is linked to ${head.cutLabel} for "${u.title}", but ${scope}. The link is not counted as clearance.`,
        sourceRefIds: [...new Set(u.refs)] });
    }
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

    // ESTABLISHED only with complete, witnessed coverage, every track VERIFIED and no integrity issue.
    // GAP only when coverage is complete and a track is STALE/MISSING. Everything else is UNKNOWN.
    let clearance: ClearanceStatus;
    if (coverageComplete && evidence.some(e => e.status === 'STALE' || e.status === 'MISSING')) clearance = 'GAP';
    else if (coverageComplete && integrity.length === 0 && evidence.length > 0 && evidence.every(e => e.status === 'VERIFIED')) clearance = 'ESTABLISHED';
    else clearance = 'UNKNOWN';
    evidence.push(...integrity);

    const allRefIds = new Set<string>();
    for (const e of evidence) e.sourceRefIds.forEach(id => allRefIds.add(id));
    for (const e of edges.values()) e.sourceRefIds.forEach(id => allRefIds.add(id));
    const sources: SourceRef[] = allRefIds.size === 0 ? [] : (await client.read<RefRow>(QUERIES.READ_SOURCE_REFS, { ids: [...allRefIds], tenantId }))
      .map(r => ({ id: r.id, path: r.path, sha256: r.sha256, excerpt: r.excerpt, startOffset: r.startOffset, endOffset: r.endOffset }));
    const missingRefs = [...allRefIds].filter(id => !sources.some(s => s.id === id));
    if (missingRefs.length > 0) return unavailable('QUERY_FAILED', 'Cited source references are missing from the graph', requestId);

    const gaps = evidence.filter(e => e.status === 'STALE' || e.status === 'MISSING').length;
    const trackCount = tracks.size;
    const summary = clearance === 'ESTABLISHED'
      ? `${head.cutLabel}: all ${trackCount} tracks have current-cut license evidence.`
      : clearance === 'GAP'
        ? `${head.cutLabel} cannot ship: ${gaps} of ${trackCount} tracks lack a license valid for this cut.`
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
