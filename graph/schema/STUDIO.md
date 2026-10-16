# Studio population slice (v023, issue #38)

Synthetic crew and departments for the fictional Warnings After Dark Studios. **An additive slice, separate from licensing evidence.** The licensing labels, queries, seed, signed bindings and witness are unchanged.

## Labels and relationships

| Label | Key properties | Meaning |
| --- | --- | --- |
| StudioPerson | id `sp-<slug>`, tenantId, slug, displayName, role, departmentId, sourceId, line, synthetic | One fictional crew member |
| Department | id `dept-<slug>`, tenantId, slug, name, kind (`department`/`service`), sourceId, line, synthetic | A department or service (Finance Office, Catering) |
| StudioSource | id `ssrc-*`, tenantId, kind, path, sha256, synthetic, origin, licenseStatus | A fixture file. Deliberately **not** the licensing `Source` label |

`(StudioPerson)-[:WORKS_IN]->(Department)`, `(StudioPerson|Department)-[:DEFINED_IN {line, excerpt}]->(StudioSource)`. Every edge has an `id`. There is **no** `MEMBER_OF` edge to a Tenant and **no** Principal: crew hold no owner, reader or agent rights and cannot authenticate.

Fixtures (project-authored, fictional, no distribution license claimed): `graph/seed/studio/departments.txt` (10) and `crew-roster.txt` (20). Strict grammar: `Department <slug> | <Name> | department|service`, `Crew <slug> | <Display name> | <Role> | <department slug>`, and a declared-count footer. A malformed record, duplicate slug, orphan department or count mismatch refuses the fixture.

## Relationship to the evidence witness (D-020)

The witness hashes only the evidence labels (Release, Cut, Track, License, Source, SourceRef). Studio records are **outside that domain**: the witness neither sees nor vouches for them, and seeding them does not write the ledger. A test asserts the witness state hash and the licensing analysis are identical with and without the studio seed. Studio provenance is checked separately at read time:

1. The stored `StudioSource` must be an allowlisted fixture whose stored path and SHA-256 equal the file on disk (the graph never supplies a path).
2. A person or department is served only if its stored fields and `line` equal the fixture line they cite. Served values are the fixture's.
3. An edge is served only if both endpoints are served and its `WORKS_IN` target or `DEFINED_IN` line and excerpt equal the fixture.

Anything else is **withheld** and listed under `integrity`; it is never served as a fact. Two nodes with one label and id (even an exact copy) are flagged and never served: the read returns the internal node id so the aggregation cannot merge them (v023.15). The domain label is found by membership, not by position (v031.02): a copy with an extra label registered first is still a duplicate, and a node with two studio labels is flagged and dropped. Each served node needs **exactly one** edge of each expected type with the id the seed writes (`e-<node id>-works-in`, `e-<node id>-defined-in`); a duplicate edge, a forged id or an extra edge is withheld and flagged, never served twice or counted (v031.00). An invalid fixture returns `UNAVAILABLE / FIXTURE_INVALID`; an unreachable graph returns `UNAVAILABLE` with the graph reason and no records. An unseeded tenant returns `EMPTY`.

## Operations

`cli.ts seed-studio [tenantId]` (deterministic MERGE on `(id, tenantId)`; a repeat adds nothing) and `cli.ts studio-overview [tenantId]`. There is no database uniqueness constraint, so prefer to seed one tenant at a time; an independent probe (Boons, 4 concurrent studio seeds x 4 trials) saw no duplicates on this engine, which is evidence, not a guarantee. Use a disposable local graph for proof; nothing here seeds a shared or hosted graph.

## Proposed transport (for the integration owner to agree before any consumer uses it)

`studioOverview(client, repoRoot, tenantId)` returns `StudioOverview` (`packages/graph/src/studio.ts`):
`{ status: 'AVAILABLE', tenantId, domain: 'studio', origin: {kind, licenseStatus: 'none claimed', synthetic: true}, nodes: [{id, label, name, detail, departmentId?, sourceId?, line?}], edges: [{id, type, from, to, line?, excerpt?}], counts, integrity: [{id, reason}] }`, or `EMPTY`, or `UNAVAILABLE`. `domain: 'studio'` lets a consumer keep these nodes visually distinct from verified licensing paths; they must never be added to an evidence array.

## Not in this slice yet

Studio facts have no approval, clearance or revision semantics. IdeaFile metadata, the workspace node and the persisted import live in `IDEAVERSE_IMPORT.md` (v023.06 onward). The IdeaVerse manifest `StudioSource` belongs to that slice: `studioOverview` skips it, and `ideaverseOverview` verifies it, so a graph holding both slices shows no studio integrity item for it.
