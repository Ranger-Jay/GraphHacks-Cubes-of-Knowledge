import { randomUUID } from 'node:crypto';
import type {
  AnalysisResponse, AvailableAnalysis, ClearanceStatus, EvidenceItem, GraphEdge, GraphNode, ProposedAction,
  SourceRef, UnavailableAnalysis
} from '@cubes/contracts';
import { GraphUnavailableError, type GraphClient } from './client.js';
import { QUERIES } from './queries.js';
import { SourceFiles } from './verify.js';
import { cueEntryOf, parseCueSheet, scopeOf, subjectOf } from './witness.js';
import { bindingHolds, evidenceKeyFromEnv, revisionNumber } from './evidence-key.js';
import { ledgerFromEnv, witnessedSnapshot, type LedgerConfig } from './state-ledger.js';
import { SnapshotView } from './snapshot-rows.js';

interface CurrentCutRow {
  releaseId: string; releaseTitle: string; revision: string; currentCutEdgeId: string; currentCutRefs: string[] | null;
  cutId: string; cutVersion: number; cutLabel: string;
  cueSheetId: string | null; cueSheetPath: string | null; cueSheetSha256: string | null;
  listedInEdgeId: string | null; listedInRefs: string[] | null; listedInSig: string | null;
  listedInRev: unknown; listedInTracks: unknown; listedInCuts: unknown;
}
interface TrackRow {
  trackId: string; trackTitle: string; usesEdgeId: string; usesRefs: string[] | null;
  licenseId: string | null; licenseLabel: string | null; coversEdgeId: string | null; coversRefs: string[] | null;
  validCutId: string | null; validCutLabel: string | null; validCutVersion: number | null; validForEdgeId: string | null; validForRefs: string[] | null;
  licenseSourceId: string | null; licenseSourcePath: string | null; licenseSourceSha256: string | null; evidencedByEdgeId: string | null; evidenceSig: string | null;
  evidenceRev: unknown; evidenceTracks: unknown; evidenceCuts: unknown;
}
interface RefRow { id: string; sourceId: string; path: string; sha256: string; excerpt: string; startOffset: number; endOffset: number }

export interface AnalyzeOptions {
  requestId?: string;
  /** Directory containing graph/seed/sources (the trusted source files). Default: process.cwd(). */
  sourceRoot?: string;
  /** Server evidence key (verifies binding HMACs). Default: GRAPH_EVIDENCE_KEY. Absent → nothing verifies. */
  evidenceKey?: Buffer | null;
  /** Evidence state witness (outside the graph). Default: GRAPH_WITNESS_DIR + evidence key. Absent → fail closed. */
  witness?: LedgerConfig | null;
}

export function unavailable(reason: UnavailableAnalysis['reason'], message: string, requestId: string = randomUUID()): UnavailableAnalysis {
  return { status: 'UNAVAILABLE', requestId, reason, message, evidence: [], nodes: [], edges: [], sources: [], proposedActions: [] };
}

const refs = (v: string[] | null | undefined): string[] => (Array.isArray(v) ? v : []);

/**
 * Current-cut music clearance. Returns null when the release is not in the caller's tenant (API: 404);
 * any graph failure returns UNAVAILABLE with no evidence.
 *
 * Trust model: graph nodes, edges and properties are claims. Facts come only from the immutable source
 * files: a cited excerpt counts only if the file's SHA-256 matches the graph record and the excerpt is
 * the exact file text at its code-point offsets; its meaning is re-derived from that text with the
 * strict grammars in witness.ts. Stored witness properties are never read.
 *  - Coverage: the current cut's cue-sheet FILE is re-parsed; its cut number must equal the cut, and the
 *    graph's USES_TRACK set must equal the file's cue list, each edge citing its own verified cue line.
 *  - License: COVERS needs a verified excerpt naming the track; VALID_FOR needs a verified scope excerpt
 *    naming exactly this cut number; both from the license's own evidence file.
 *  - Witness (D-020): the graph's evidence state must equal the committed head of the outside-graph
 *    witness chain (state-ledger.ts); otherwise clearance is UNKNOWN and no graph content is returned.
 *  - ESTABLISHED requires complete coverage, every track VERIFIED and no integrity item; GAP requires
 *    complete coverage and a STALE/MISSING track; everything else is UNKNOWN.
 */
export async function analyzeRelease(client: GraphClient, tenantId: string, releaseId: string, opts: AnalyzeOptions | string = {}): Promise<AnalysisResponse | null> {
  const o: AnalyzeOptions = typeof opts === 'string' ? { requestId: opts } : opts;
  const requestId: string = o.requestId ?? randomUUID();
  const files = new SourceFiles(o.sourceRoot);
  const key = o.evidenceKey !== undefined ? o.evidenceKey : evidenceKeyFromEnv();
  try {
    const probe = (await client.read<CurrentCutRow>(QUERIES.READ_RELEASE_CURRENT_CUT, { tenantId, releaseId }))[0];
    if (!probe) return null;

    // D-020: trust nothing in the graph unless its evidence state is the committed witness head. Every
    // row below comes from that one witnessed snapshot, never from a later query (#20).
    const witness = await witnessedSnapshot(client, o.witness !== undefined ? o.witness : ledgerFromEnv(key), tenantId, releaseId);
    const head: CurrentCutRow | undefined = witness.ok ? new SnapshotView(witness.snapshot).currentCut(releaseId)[0] : probe;
    if (!head) return null;
    if (!witness.ok) {
      const blocked: AvailableAnalysis = {
        status: 'AVAILABLE', requestId, releaseId: head.releaseId, cutId: head.cutId, revision: head.revision, clearance: 'UNKNOWN',
        summary: `${head.cutLabel}: clearance cannot be established because the graph is not the witnessed evidence state.`,
        evidence: [{ id: `ev-witness-${head.releaseId}`, status: 'UNKNOWN',
          statement: `Graph evidence was not used: ${witness.reason}. Nothing in this graph is counted until it matches the evidence witness.`, sourceRefIds: [] }],
        nodes: [{ id: head.releaseId, label: head.releaseTitle, kind: 'Release', sourceRefIds: [] }], edges: [], sources: [], proposedActions: []
      };
      return blocked;
    }
    const view = new SnapshotView(witness.snapshot);
    const rows: TrackRow[] = view.trackLicenses(head.cutId);

    // Fetch and verify every excerpt the graph cites for this cut.
    const cited = new Set<string>([...refs(head.currentCutRefs), ...refs(head.listedInRefs)]);
    for (const r of rows) for (const id of [...refs(r.usesRefs), ...refs(r.coversRefs), ...refs(r.validForRefs)]) cited.add(id);
    const refRows: RefRow[] = cited.size === 0 ? [] : view.sourceRefs([...cited]);
    const verified = new Map<string, RefRow>();
    for (const r of refRows) if (await files.excerptHolds(r)) verified.set(r.id, r);
    const failedRefs = [...cited].filter(id => !verified.has(id));
    const ok = (ids: string[]) => ids.filter(id => verified.has(id));
    const fromFile = (ids: string[], path: string | null) => ok(ids).map(id => verified.get(id)!).filter(r => path !== null && r.path === path);

    // Coverage from the verified cue-sheet file itself.
    // The cue-sheet binding must be signed by the server evidence key for this tenant, release, cut, path
    // and hash, recorded at or before the release's current revision.
    const currentRev = revisionNumber(head.releaseId, head.revision);
    const sheetBound = bindingHolds(key, { sig: head.listedInSig, rev: head.listedInRev, tracks: head.listedInTracks, cuts: head.listedInCuts },
      { kind: 'LISTED_IN', tenantId, releaseId: head.releaseId, subjectId: head.cutId, path: head.cueSheetPath, sha256: head.cueSheetSha256 },
      { currentRev, cutId: head.cutId });
    const sheetText = sheetBound ? await files.text(head.cueSheetPath, head.cueSheetSha256) : null;
    const sheet = sheetText === null ? null : parseCueSheet(sheetText);
    const sheetValid = sheet !== null && sheet.complete && sheet.cutVersion === head.cutVersion;
    const cutName = sheetValid && sheet.cutLabel ? sheet.cutLabel : head.cutLabel;

    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    const addNode = (id: string, label: string, kind: string) => { if (!nodes.has(id)) nodes.set(id, { id, label, kind, sourceRefIds: [] }); };
    const addEdge = (id: string | null, from: string, to: string, type: string, sourceRefIds: string[]) => {
      if (id && !edges.has(id)) edges.set(id, { id, from, to, type, sourceRefIds: ok(sourceRefIds) });
    };
    addNode(head.releaseId, head.releaseTitle, 'Release');
    addNode(head.cutId, cutName, 'Cut');
    addEdge(head.currentCutEdgeId, head.releaseId, head.cutId, 'CURRENT_CUT', refs(head.currentCutRefs));
    if (head.cueSheetId) {
      addNode(head.cueSheetId, 'Cue sheet', 'Source');
      addEdge(head.listedInEdgeId, head.cutId, head.cueSheetId, 'LISTED_IN', refs(head.listedInRefs));
    }

    type T = { title: string; usesRefs: string[]; current: string[]; stale: string[]; staleCuts: Set<string> };
    const tracks = new Map<string, T>();
    const unsupportedCurrent: { edgeId: string; license: string; title: string; refs: string[]; scopes: number[] }[] = [];
    const unboundLicenses = new Set<string>();
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
      // The license -> evidence-file binding must be signed for this tenant, release, license, path and
      // hash, at or before the current revision, and must name this track and this cut.
      const bound = bindingHolds(key, { sig: r.evidenceSig, rev: r.evidenceRev, tracks: r.evidenceTracks, cuts: r.evidenceCuts },
        { kind: 'EVIDENCED_BY', tenantId, releaseId: head.releaseId, subjectId: r.licenseId, path: r.licenseSourcePath, sha256: r.licenseSourceSha256 },
        { currentRev, trackId: r.trackId, cutId: r.validCutId });
      if (!bound) unboundLicenses.add(r.licenseLabel ?? r.licenseId);
      const covText = bound ? fromFile(refs(r.coversRefs), r.licenseSourcePath) : [];
      const vfText = bound ? fromFile(refs(r.validForRefs), r.licenseSourcePath) : [];
      const coversOk = covText.some(x => subjectOf(x.excerpt) === t!.title || scopeOf(x.excerpt)?.title === t!.title);
      const scopes = vfText.map(x => scopeOf(x.excerpt)).filter(x => x !== null);
      const scopeOk = scopes.some(sc => sc.cutVersion === r.validCutVersion && (sc.title === t!.title || (sc.title === null && coversOk)));
      const citedOk = [...ok(refs(r.coversRefs)), ...ok(refs(r.validForRefs))];
      const isCurrent = r.validCutId === head.cutId && r.validCutVersion === head.cutVersion;
      if (!(coversOk && scopeOk)) {
        if (r.validCutId === head.cutId) {
          unsupportedCurrent.push({ edgeId: r.validForEdgeId ?? r.licenseId, license: r.licenseLabel ?? r.licenseId, title: t.title,
            refs: citedOk, scopes: scopes.map(sc => sc.cutVersion) });
        }
        continue;
      }
      if (isCurrent) t.current.push(...citedOk);
      else { t.stale.push(...citedOk); t.staleCuts.add(r.validCutLabel ?? r.validCutId); }
    }

    // Coverage: graph USES_TRACK set must equal the verified file's cue list, each edge citing its own cue line.
    const supportedTitles = new Set<string>();
    const unsupportedTracks: string[] = [];
    for (const t of tracks.values()) {
      const lines = fromFile(t.usesRefs, head.cueSheetPath).map(x => cueEntryOf(x.excerpt)).filter(x => x !== null);
      if (sheetValid && lines.some(l => l.title === t.title && sheet!.entries.some(e => e.index === l.index && e.title === l.title))) supportedTitles.add(t.title);
      else unsupportedTracks.push(t.title);
    }
    const expected = sheetValid ? sheet!.entries : [];
    const unlinked = expected.filter(e => !supportedTitles.has(e.title));
    const coverageComplete = sheetValid && expected.length > 0 && unlinked.length === 0 && unsupportedTracks.length === 0;

    const evidence: EvidenceItem[] = [];
    const integrity: EvidenceItem[] = [];
    const proposedActions: ProposedAction[] = [];
    const listedRefs = ok(refs(head.listedInRefs));
    if (!coverageComplete) {
      const parts: string[] = [];
      if (!head.cueSheetId) parts.push(`no cue sheet is linked to ${cutName}`);
      else if (!sheetBound) parts.push(key ? 'the cue-sheet binding is not signed by the evidence key for this cut at this revision' : 'no evidence key is configured, so no binding can be verified');
      else if (sheet === null) parts.push('the linked cue-sheet file is missing or does not match its recorded hash');
      else if (!sheet.complete) parts.push('the cue-sheet file is not a complete, consistent listing');
      else if (sheet.cutVersion !== head.cutVersion) parts.push(`the cue-sheet file is for Cut v${sheet.cutVersion}, not this cut`);
      if (unlinked.length > 0) parts.push(`listed in the cue sheet but not linked in the graph: ${unlinked.map(e => `"${e.title}"`).join(', ')}`);
      if (unsupportedTracks.length > 0) parts.push(`linked without a matching verified cue line: ${unsupportedTracks.map(t => `"${t}"`).join(', ')}`);
      integrity.push({ id: `ev-coverage-${head.cutId}`, status: 'UNKNOWN',
        statement: `Track coverage for ${cutName} is not established: ${parts.join('; ')}.`, sourceRefIds: listedRefs });
    }
    for (const u of unsupportedCurrent) {
      const scope = u.scopes.length > 0 ? `its cited source text scopes it to Cut v${[...new Set(u.scopes)].join(', v')}` : 'its cited source text does not support that scope';
      integrity.push({ id: `ev-unsupported-${u.edgeId}`, status: 'UNKNOWN',
        statement: `"${u.license}" is linked to ${cutName} for "${u.title}", but ${scope}. The link is not counted as clearance.`,
        sourceRefIds: [...new Set(u.refs)] });
    }
    if (unboundLicenses.size > 0) {
      integrity.push({ id: `ev-unbound-licenses-${head.cutId}`, status: 'UNKNOWN',
        statement: `${key ? 'Evidence binding is not signed by the evidence key for this track, cut and revision' : 'No evidence key is configured'} for: ${[...unboundLicenses].sort().map(l => `"${l}"`).join(', ')}. Their sources were not used.`, sourceRefIds: [] });
    }
    if (failedRefs.length > 0) {
      integrity.push({ id: `ev-unverified-refs-${head.cutId}`, status: 'UNKNOWN',
        statement: `${failedRefs.length} cited excerpt(s) do not match their source files and were ignored: ${failedRefs.sort().join(', ')}.`, sourceRefIds: [] });
    }

    for (const [trackId, t] of tracks) {
      const uses = ok(t.usesRefs);
      if (t.current.length > 0) {
        evidence.push({ id: `ev-${trackId}`, status: 'VERIFIED', statement: `"${t.title}" is licensed for ${cutName}.`, sourceRefIds: [...new Set([...uses, ...t.current])] });
        continue;
      }
      if (!coverageComplete) {
        evidence.push({ id: `ev-${trackId}`, status: 'UNKNOWN', statement: `No current-cut license found for "${t.title}", but track coverage for ${cutName} is not established.`, sourceRefIds: uses });
        continue;
      }
      const status = t.stale.length > 0 ? 'STALE' : 'MISSING';
      const statement = status === 'STALE'
        ? `"${t.title}" is cleared only for ${[...t.staleCuts].join(', ')}; no license is valid for ${cutName}.`
        : `"${t.title}" is used in ${cutName} and no license covers it.`;
      const cite = [...new Set([...uses, ...listedRefs, ...t.stale])];
      evidence.push({ id: `ev-${trackId}`, status, statement, sourceRefIds: cite });
      proposedActions.push({ id: `act-clear-${trackId}-${head.cutId}`, kind: 'REQUEST_CLEARANCE', label: `Request clearance of "${t.title}" for ${cutName}`, requiresHumanApproval: true, sourceRefIds: cite });
    }

    let clearance: ClearanceStatus;
    if (coverageComplete && evidence.some(e => e.status === 'STALE' || e.status === 'MISSING')) clearance = 'GAP';
    else if (coverageComplete && integrity.length === 0 && evidence.length > 0 && evidence.every(e => e.status === 'VERIFIED')) clearance = 'ESTABLISHED';
    else clearance = 'UNKNOWN';
    evidence.push(...integrity);

    const used = new Set<string>();
    for (const e of evidence) e.sourceRefIds.forEach(id => used.add(id));
    for (const e of edges.values()) e.sourceRefIds.forEach(id => used.add(id));
    const sources: SourceRef[] = [...used].sort().map(id => verified.get(id)!)
      .map(r => ({ id: r.id, path: r.path, sha256: r.sha256, excerpt: r.excerpt, startOffset: r.startOffset, endOffset: r.endOffset }));

    const gaps = evidence.filter(e => e.status === 'STALE' || e.status === 'MISSING').length;
    const summary = clearance === 'ESTABLISHED'
      ? `${cutName}: all ${tracks.size} tracks have current-cut license evidence.`
      : clearance === 'GAP'
        ? `${cutName} cannot ship: ${gaps} of ${tracks.size} tracks lack a license valid for this cut.`
        : `${cutName}: clearance cannot be established from the available sources.`;
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
