# Cypher queries and graph algorithms

The product uses FalkorDB relationship traversal and deterministic evidence checks. The optional language model explains the resulting facts. It does not choose Cypher or determine clearance.

## Submission description

Cubes of Knowledge follows Release → CURRENT_CUT → Cut → USES_TRACK → Track. It follows License → COVERS → Track and License → VALID_FOR → Cut to check that each used track is licensed for the current edit. SourceRef → EXCERPT_OF → Source connects claims to immutable file excerpts. The API reads one tenant-scoped evidence snapshot from FalkorDB and verifies its state against a separate signed witness. It then checks file SHA-256 values, Unicode code-point excerpt offsets, signed evidence bindings, and the licensed cut version. Only complete, verified coverage can establish clearance. A v3 license does not clear v4. Graph failure withholds current proof. The optional explanation receives verified facts and citation IDs, then undergoes a fresh evidence check before display.

This is a deterministic traversal and validation algorithm. No PageRank, vector search, or model-written query is required.

## Current release analysis: one consistent snapshot

This is the actual query issued by readEvidenceSnapshot. All later clearance traversal uses these same returned nodes and edges in memory. Reading the licensing facts in separate queries would create a gap between checking evidence and using it.


```cypher
MATCH (n) WHERE n.tenantId = $tenantId AND ANY(l IN labels(n) WHERE l IN ['Release','Cut','Track','License','Source','SourceRef'])
OPTIONAL MATCH (n)-[e]->(b) WHERE b.tenantId = $tenantId AND ANY(l IN labels(b) WHERE l IN ['Release','Cut','Track','License','Source','SourceRef'])
WITH n, collect([type(e), id(b), labels(b), properties(b), properties(e)]) AS out
RETURN id(n) AS iid, labels(n) AS labels, properties(n) AS props, out
```

The snapshot is hashed canonically. The hash and release revision must equal the committed witness. A missing, corrupt, pending, mismatched, or revoked evidence state cannot establish clearance.

## Named query catalog

These are the exact exported query strings. The current clearance implementation uses the single snapshot above and SnapshotView equivalents of the relationship traversals. The release query also supports the scoped existence check. The catalog is not a claim that every listed query runs separately on every page load.

### HEALTH


```cypher
MATCH (r:Release) RETURN count(r) AS releases
```

### READ_RELEASE_CURRENT_CUT


```cypher
MATCH (r:Release {id: $releaseId, tenantId: $tenantId})-[cc:CURRENT_CUT]->(c:Cut {tenantId: $tenantId})
OPTIONAL MATCH (c)-[ls:LISTED_IN]->(cs:Source {kind: 'cue_sheet', tenantId: $tenantId})
RETURN r.id AS releaseId, r.title AS releaseTitle, r.revision AS revision, cc.id AS currentCutEdgeId,
       cc.sourceRefIds AS currentCutRefs, c.id AS cutId, c.version AS cutVersion, c.label AS cutLabel,
       cs.id AS cueSheetId, cs.path AS cueSheetPath, cs.sha256 AS cueSheetSha256,
       ls.id AS listedInEdgeId, ls.sourceRefIds AS listedInRefs, ls.sig AS listedInSig, ls.rev AS listedInRev, ls.tracks AS listedInTracks, ls.cuts AS listedInCuts
```

### READ_CUT_TRACK_LICENSES


```cypher
MATCH (c:Cut {id: $cutId, tenantId: $tenantId})-[u:USES_TRACK]->(t:Track {tenantId: $tenantId})
OPTIONAL MATCH (lic:License {tenantId: $tenantId})-[cov:COVERS]->(t)
OPTIONAL MATCH (lic)-[vf:VALID_FOR]->(vc:Cut {tenantId: $tenantId})
OPTIONAL MATCH (lic)-[eb:EVIDENCED_BY]->(ls:Source {tenantId: $tenantId})
RETURN t.id AS trackId, t.title AS trackTitle, u.id AS usesEdgeId, u.sourceRefIds AS usesRefs,
       lic.id AS licenseId, lic.label AS licenseLabel, cov.id AS coversEdgeId, cov.sourceRefIds AS coversRefs,
       vc.id AS validCutId, vc.label AS validCutLabel, vc.version AS validCutVersion, vf.id AS validForEdgeId, vf.sourceRefIds AS validForRefs,
       ls.id AS licenseSourceId, ls.path AS licenseSourcePath, ls.sha256 AS licenseSourceSha256, eb.id AS evidencedByEdgeId, eb.sig AS evidenceSig,
       eb.rev AS evidenceRev, eb.tracks AS evidenceTracks, eb.cuts AS evidenceCuts
ORDER BY trackId, licenseId, validCutId
```

### READ_SOURCE_REFS


```cypher
MATCH (sr:SourceRef {tenantId: $tenantId})-[:EXCERPT_OF]->(s:Source {tenantId: $tenantId})
WHERE sr.id IN $ids
RETURN sr.id AS id, s.id AS sourceId, s.path AS path, s.sha256 AS sha256, s.kind AS kind,
       sr.excerpt AS excerpt, sr.startOffset AS startOffset, sr.endOffset AS endOffset
ORDER BY id
```

### READ_STUDIO_OVERVIEW


```cypher
MATCH (n {tenantId: $tenantId}) WHERE n:StudioPerson OR n:Department OR (n:StudioSource AND n.kind <> 'ideaverse_manifest')
OPTIONAL MATCH (n)-[e]->(b {tenantId: $tenantId})
RETURN id(n) AS iid, n.id AS id, labels(n) AS labels, properties(n) AS props,
       collect([e.id, type(e), b.id, properties(e)]) AS out
```

## IdeaVerse overview

This read retrieves workspace revision, idea metadata, memberships, and receipts together. File bytes and hashes are checked against the repository manifest. Ambiguous IDs, duplicate receipts, missing memberships, or altered metadata are withheld.


```cypher
MATCH (w:Workspace {id: $workspaceId, tenantId: $tenantId})
OPTIONAL MATCH (i:IdeaFile {tenantId: $tenantId})
OPTIONAL MATCH (i)-[m:IMPORTED_INTO]->(w)
WITH w, i, collect([m.id, m.receiptId]) AS edges
OPTIONAL MATCH (r:ImportReceipt {tenantId: $tenantId, ideaId: i.id})
RETURN id(w) AS wid, id(i) AS iid, w.revision AS revision, i.id AS id, properties(i) AS props, edges, collect(properties(r)) AS receipts
```

## IdeaVerse receipt lookup

The server hashes the tenant-scoped idempotency key before this lookup. An existing receipt still needs independent membership and manifest read-back before the UI may show Added.


```cypher
MATCH (r:ImportReceipt {tenantId: $tenantId, keyHash: $keyHash}) RETURN r.ideaId AS ideaId, r.sha256 AS sha256, r.workspaceId AS workspaceId, r.importedAt AS importedAt, r.workspaceRevision AS workspaceRevision, r.membershipId AS membershipId, r.fingerprint AS fingerprint
```

## IdeaVerse atomic import: local owner rehearsal only

The API authenticates an owner before this statement can run. One serialized write checks unique identities, expected revision, verified file metadata, unused key, and absent membership. It then increments the workspace revision and creates the receipt and membership together. The API performs a fresh read-back afterward. The Vercel public reader denies this route.


```cypher
MATCH (w0:Workspace {id: $workspaceId, tenantId: $tenantId}) WITH count(w0) AS wc WHERE wc = 1
MATCH (i0:IdeaFile {id: $ideaId, tenantId: $tenantId}) WITH count(i0) AS ic WHERE ic = 1
MATCH (w:Workspace {id: $workspaceId, tenantId: $tenantId}), (i:IdeaFile {id: $ideaId, tenantId: $tenantId})
WHERE w.revision = $expectedRevision AND i.sha256 = $sha256 AND i.filename = $filename AND i.byteCount = $byteCount
  AND i.submittedAt = $submittedAt AND i.touchedAt = $touchedAt AND NOT (i)-[:IMPORTED_INTO]->(w)
OPTIONAL MATCH (x:ImportReceipt {tenantId: $tenantId, keyHash: $keyHash})
WITH w, i, x WHERE x IS NULL
SET w.revision = w.revision + 1
CREATE (r:ImportReceipt {id: $receiptId, tenantId: $tenantId, keyHash: $keyHash, fingerprint: $fingerprint, ideaId: $ideaId, sha256: $sha256,
  workspaceId: $workspaceId, importedAt: $importedAt, workspaceRevision: w.revision, membershipId: $membershipId, synthetic: true})
CREATE (i)-[:IMPORTED_INTO {id: $membershipId, receiptId: $receiptId}]->(w)
RETURN r.ideaId AS ideaId, r.sha256 AS sha256, r.workspaceId AS workspaceId, r.importedAt AS importedAt, r.workspaceRevision AS workspaceRevision, r.membershipId AS membershipId
```

## Clearance evaluation steps

1. Select the tenant on the server. Accept only a supported release ID.
2. Read one real FalkorDB evidence snapshot.
3. Verify the separate signed witness, snapshot hash, and release revision.
4. Resolve the current cut and its complete cue-sheet track set.
5. Verify source hashes, exact excerpt offsets, and signed source bindings.
6. Match covering licenses to the same current cut. Re-derive scope from verified source text.
7. Return VERIFIED, STALE, or MISSING track evidence. Integrity or incomplete scope stays UNKNOWN.
8. Return ESTABLISHED only for complete verified coverage. Return GAP for complete coverage with stale or missing clearance.
9. On graph failure, return UNAVAILABLE and clear proof. Never substitute cached or decorative results.
10. If requested, send scoped facts to the text model. Check citation IDs and re-read current graph evidence before accepting its answer.

## Parameters and execution

Values such as $tenantId, $releaseId, $cutId, $ids, and import metadata are passed as parameters. Browser input never becomes Cypher text. Reads, including the HEALTH readiness query, use GRAPH.RO_QUERY. The readiness query requires at least one Release and does not seed a graph.

Source: packages/graph/src/queries.ts, state-ledger.ts, analysis.ts, snapshot-rows.ts, ideaverse.ts, and apps/api/src/ideaverse.ts.

This document prints operational read/import queries and the decision algorithm. Seed/schema writes and optional agent-profile fixture queries remain in their respective source modules. Query-text extraction is offline documentation generation; it is not evidence of a successful database run.

Regenerate after building with: node scripts/print-graph-queries.mjs
