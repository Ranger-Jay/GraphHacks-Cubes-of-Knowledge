import type { EvidenceSnapshot, SnapEdge, SnapNode } from './state-ledger.js';

/**
 * In-memory equivalents of the READ_* queries in queries.ts, evaluated over ONE witnessed snapshot
 * (state-ledger.ts readEvidenceSnapshot). Answering from the same rows that were hashed closes the
 * check-then-read gap (#20): no write can land between the witness check and the data used.
 * Semantics follow the Cypher: MATCH = inner join, OPTIONAL MATCH = left join (nulls when absent). Rows are
 * equal on the seeded graphs (tested); with parallel duplicate edges the view may return extra, harmless rows.
 */
type Props = Record<string, unknown>;
const str = (p: Props, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
const num = (p: Props, k: string): number | null => (typeof p[k] === 'number' ? (p[k] as number) : null);
const list = (p: Props, k: string): string[] | null => (Array.isArray(p[k]) ? (p[k] as string[]) : null);
const has = (n: SnapNode, label: string) => n.labels.includes(label);

export class SnapshotView {
  private readonly out = new Map<number, SnapEdge[]>();
  constructor(readonly snap: EvidenceSnapshot) {
    for (const e of snap.edges) {
      const l = this.out.get(e.from.iid) ?? [];
      l.push(e);
      this.out.set(e.from.iid, l);
    }
  }
  private edges(from: SnapNode, type: string, toLabel: string, toWhere: (n: SnapNode) => boolean = () => true): SnapEdge[] {
    return (this.out.get(from.iid) ?? []).filter(e => e.type === type && has(e.to, toLabel) && toWhere(e.to));
  }
  private nodes(label: string, where: (n: SnapNode) => boolean): SnapNode[] {
    return this.snap.nodes.filter(n => has(n, label) && where(n));
  }

  /** READ_RELEASE_CURRENT_CUT */
  currentCut(releaseId: string) {
    const rows = [];
    for (const r of this.nodes('Release', n => n.props['id'] === releaseId)) {
      for (const cc of this.edges(r, 'CURRENT_CUT', 'Cut')) {
        const c = cc.to;
        const sheets = this.edges(c, 'LISTED_IN', 'Source', n => n.props['kind'] === 'cue_sheet');
        for (const ls of sheets.length > 0 ? sheets : [null]) {
          rows.push({
            releaseId: str(r.props, 'id')!, releaseTitle: str(r.props, 'title') ?? '', revision: str(r.props, 'revision') ?? '',
            currentCutEdgeId: str(cc.props, 'id') ?? '', currentCutRefs: list(cc.props, 'sourceRefIds'),
            cutId: str(c.props, 'id') ?? '', cutVersion: num(c.props, 'version') ?? NaN, cutLabel: str(c.props, 'label') ?? '',
            cueSheetId: ls ? str(ls.to.props, 'id') : null, cueSheetPath: ls ? str(ls.to.props, 'path') : null,
            cueSheetSha256: ls ? str(ls.to.props, 'sha256') : null, listedInEdgeId: ls ? str(ls.props, 'id') : null,
            listedInRefs: ls ? list(ls.props, 'sourceRefIds') : null, listedInSig: ls ? str(ls.props, 'sig') : null,
            listedInRev: ls ? ls.props['rev'] : null, listedInTracks: ls ? ls.props['tracks'] : null, listedInCuts: ls ? ls.props['cuts'] : null
          });
        }
      }
    }
    return rows;
  }

  /** READ_CUT_TRACK_LICENSES (ORDER BY trackId, licenseId, validCutId) */
  trackLicenses(cutId: string) {
    const rows = [];
    for (const c of this.nodes('Cut', n => n.props['id'] === cutId)) {
      for (const u of this.edges(c, 'USES_TRACK', 'Track')) {
        const t = u.to;
        const covers = this.snap.edges.filter(e => e.type === 'COVERS' && e.to.iid === t.iid && has(e.from, 'License'));
        for (const cov of covers.length > 0 ? covers : [null]) {
          const lic = cov ? cov.from : null;
          const vfs = lic ? this.edges(lic, 'VALID_FOR', 'Cut') : [];
          const ebs = lic ? this.edges(lic, 'EVIDENCED_BY', 'Source') : [];
          for (const vf of vfs.length > 0 ? vfs : [null]) {
            for (const eb of ebs.length > 0 ? ebs : [null]) {
              rows.push({
                trackId: str(t.props, 'id') ?? '', trackTitle: str(t.props, 'title') ?? '', usesEdgeId: str(u.props, 'id') ?? '', usesRefs: list(u.props, 'sourceRefIds'),
                licenseId: lic ? str(lic.props, 'id') : null, licenseLabel: lic ? str(lic.props, 'label') : null,
                coversEdgeId: cov ? str(cov.props, 'id') : null, coversRefs: cov ? list(cov.props, 'sourceRefIds') : null,
                validCutId: vf ? str(vf.to.props, 'id') : null, validCutLabel: vf ? str(vf.to.props, 'label') : null,
                validCutVersion: vf ? num(vf.to.props, 'version') : null, validForEdgeId: vf ? str(vf.props, 'id') : null,
                validForRefs: vf ? list(vf.props, 'sourceRefIds') : null,
                licenseSourceId: eb ? str(eb.to.props, 'id') : null, licenseSourcePath: eb ? str(eb.to.props, 'path') : null,
                licenseSourceSha256: eb ? str(eb.to.props, 'sha256') : null, evidencedByEdgeId: eb ? str(eb.props, 'id') : null,
                evidenceSig: eb ? str(eb.props, 'sig') : null, evidenceRev: eb ? eb.props['rev'] : null,
                evidenceTracks: eb ? eb.props['tracks'] : null, evidenceCuts: eb ? eb.props['cuts'] : null
              });
            }
          }
        }
      }
    }
    const k = (v: string | null) => v ?? '￿';
    return rows.sort((a, b) => k(a.trackId).localeCompare(k(b.trackId)) || k(a.licenseId).localeCompare(k(b.licenseId)) || k(a.validCutId).localeCompare(k(b.validCutId)));
  }

  /** READ_SOURCE_REFS (ORDER BY id) */
  sourceRefs(ids: string[]) {
    const want = new Set(ids);
    const rows = [];
    for (const sr of this.nodes('SourceRef', n => typeof n.props['id'] === 'string' && want.has(n.props['id'] as string))) {
      for (const x of this.edges(sr, 'EXCERPT_OF', 'Source')) {
        const s = x.to;
        rows.push({ id: str(sr.props, 'id')!, sourceId: str(s.props, 'id') ?? '', path: str(s.props, 'path') ?? '', sha256: str(s.props, 'sha256') ?? '',
          kind: str(s.props, 'kind') ?? '', excerpt: str(sr.props, 'excerpt') ?? '', startOffset: num(sr.props, 'startOffset') ?? NaN, endOffset: num(sr.props, 'endOffset') ?? NaN });
      }
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  }
}
