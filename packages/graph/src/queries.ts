/**
 * Named, parameterized Cypher catalog. Callers pick a name; they never supply Cypher.
 * READ_* run through GRAPH.RO_QUERY. Seed writes live in seed.ts (fixed-label idempotent MERGE).
 */
export const QUERIES = {
  /** Readiness: the named graph exists, answers a read, and holds seeded releases. */
  HEALTH: 'MATCH (r:Release) RETURN count(r) AS releases',

  /** Release in the caller's tenant, its current cut, and that cut's cue-sheet coverage source. */
  READ_RELEASE_CURRENT_CUT: `
MATCH (r:Release {id: $releaseId, tenantId: $tenantId})-[cc:CURRENT_CUT]->(c:Cut {tenantId: $tenantId})
OPTIONAL MATCH (c)-[ls:LISTED_IN]->(cs:Source {kind: 'cue_sheet', tenantId: $tenantId})
RETURN r.id AS releaseId, r.title AS releaseTitle, r.revision AS revision, cc.id AS currentCutEdgeId,
       cc.sourceRefIds AS currentCutRefs, c.id AS cutId, c.version AS cutVersion, c.label AS cutLabel,
       cs.id AS cueSheetId, cs.path AS cueSheetPath, cs.sha256 AS cueSheetSha256,
       ls.id AS listedInEdgeId, ls.sourceRefIds AS listedInRefs, ls.sig AS listedInSig, ls.rev AS listedInRev, ls.tracks AS listedInTracks, ls.cuts AS listedInCuts`,

  /** Every track the cut uses, with every license that covers it and every cut that license is valid for (all tenant-scoped). */
  READ_CUT_TRACK_LICENSES: `
MATCH (c:Cut {id: $cutId, tenantId: $tenantId})-[u:USES_TRACK]->(t:Track {tenantId: $tenantId})
OPTIONAL MATCH (lic:License {tenantId: $tenantId})-[cov:COVERS]->(t)
OPTIONAL MATCH (lic)-[vf:VALID_FOR]->(vc:Cut {tenantId: $tenantId})
OPTIONAL MATCH (lic)-[eb:EVIDENCED_BY]->(ls:Source {tenantId: $tenantId})
RETURN t.id AS trackId, t.title AS trackTitle, u.id AS usesEdgeId, u.sourceRefIds AS usesRefs,
       lic.id AS licenseId, lic.label AS licenseLabel, cov.id AS coversEdgeId, cov.sourceRefIds AS coversRefs,
       vc.id AS validCutId, vc.label AS validCutLabel, vc.version AS validCutVersion, vf.id AS validForEdgeId, vf.sourceRefIds AS validForRefs,
       ls.id AS licenseSourceId, ls.path AS licenseSourcePath, ls.sha256 AS licenseSourceSha256, eb.id AS evidencedByEdgeId, eb.sig AS evidenceSig,
       eb.rev AS evidenceRev, eb.tracks AS evidenceTracks, eb.cuts AS evidenceCuts
ORDER BY trackId, licenseId, validCutId`,

  /** Exact stored excerpts for the given reference IDs, with their immutable source record. */
  READ_SOURCE_REFS: `
MATCH (sr:SourceRef {tenantId: $tenantId})-[:EXCERPT_OF]->(s:Source {tenantId: $tenantId})
WHERE sr.id IN $ids
RETURN sr.id AS id, s.id AS sourceId, s.path AS path, s.sha256 AS sha256, s.kind AS kind,
       sr.excerpt AS excerpt, sr.startOffset AS startOffset, sr.endOffset AS endOffset
ORDER BY id`
} as const;

export type QueryName = keyof typeof QUERIES;
