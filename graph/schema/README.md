# Studio graph schema (v1)

Synthetic company only: Warnings After Dark Studios, tenant `t-wad`.

## Nodes (all keyed by a globally unique `id`)

| Label | Key properties | Meaning |
| --- | --- | --- |
| Tenant | name | Isolation boundary |
| Release | tenantId, title, revision | Distributable title. `revision` changes whenever the current cut changes |
| Cut | tenantId, version, label, status | One edit of a release (`CURRENT` / `SUPERSEDED`) |
| Track | tenantId, title | Music cue used in a cut |
| License | tenantId, label | A clearance claim; facts about it come only from cited sources |
| Source | tenantId, kind, path, sha256, offsetUnit (plus seed-time witness copies) | Record of an immutable source file (`cue_sheet`, `license`, `email`) |
| SourceRef | tenantId, sourceId, role, excerpt, startOffset, endOffset; witness fields by role | Exact excerpt of a Source |
| Principal | kind, displayName | Synthetic humans (Kanny, Serena) and agents (Roy, Ava, Guz) |

## Relationships (each has `id` and `sourceRefIds`)

`(Release)-[:HAS_CUT]->(Cut)`, `(Release)-[:CURRENT_CUT]->(Cut)`, `(Cut)-[:SUPERSEDES]->(Cut)`,
`(Cut)-[:LISTED_IN]->(Source cue_sheet)`, `(Cut)-[:USES_TRACK]->(Track)`, `(License)-[:COVERS]->(Track)`,
`(License)-[:VALID_FOR]->(Cut)`, `(License)-[:EVIDENCED_BY]->(Source)`, `(SourceRef)-[:EXCERPT_OF]->(Source)`,
`(Principal)-[:MEMBER_OF {role}]->(Tenant)`. Roles: `OWNER`, `READER`, `AGENT`. The API lane enforces them; the graph stores them.

## Trust model: verify at read time

Graph nodes, edges and properties are **claims**. Three anchors sit outside the graph: the immutable source files under `graph/seed/sources/`, the server evidence key `GRAPH_EVIDENCE_KEY` (32+ characters, environment only, never stored in the graph), and the evidence state witness under `GRAPH_WITNESS_DIR` (server-only path). At every analysis:

0. **Signed bindings.** Every `License -[:EVIDENCED_BY]-> Source` and `Cut -[:LISTED_IN]-> cue sheet` edge carries `rev`, `tracks`, `cuts` and `sig = HMAC-SHA256(key, [type, tenant, release, bound node id, file path, file SHA-256, rev, tracks, cuts])`. `rev` is the release revision number the binding was recorded at; `tracks`/`cuts` are what a license covers and is valid for. Analysis checks the HMAC (timing-safe) before reading the bound file, and also requires `rev` ≤ the release's current revision and that the row's track and cut are named. A graph write without the key cannot create, copy, re-point or re-purpose a binding, and renaming a node to a signed id does not help: a binding recorded at a later revision does not hold now (#15). Unbound licenses contribute nothing (UNKNOWN integrity item), and an unbound cue sheet leaves coverage UNKNOWN. With no key configured nothing verifies, so clearance is never ESTABLISHED. Seeding requires the key; recording new evidence is a key-holder (server) action.
   - Signed bindings alone cannot stop a copy of a once-valid record coming back (a signature never expires and the revision property is unsigned). The witness below closes that (D-020).

**Evidence state witness (D-020).** Before anything else, analysis checks the graph against an append-only, HMAC-chained ledger kept **outside FalkorDB** (`packages/graph/src/state-ledger.ts`): one JSONL chain per (graph, tenant) at `$GRAPH_WITNESS_DIR/<graph>/<tenant>.jsonl`. Each record is `{seq, type: INIT|PENDING|COMMIT|ABORT, stateHash, revisions, intent, prevMac, mac}`; the MAC chains every record to the previous one with a key derived from `GRAPH_EVIDENCE_KEY`. `stateHash` is SHA-256 over a canonical dump of every evidence-bearing node and edge of the tenant (Release, Cut, Track, License, Source, SourceRef, edges among them, all properties). The head must be COMMIT/INIT, the release revision must equal the witnessed one, and the state hash must match; otherwise clearance is **UNKNOWN** with one `ev-witness-<release>` item and no graph content, sources or actions. The blocked answer is built from fixed text, the requested `releaseId` and ledger values only: no graph title, label, cut id or revision. The witness is checked before anything else, so a release deleted out of band is reported as blocked, not as not-found. So a graph-only snapshot restore, a replayed binding at any revision, a revoked binding copied back, or a binding replayed from another graph all fail closed. A missing, edited, truncated, reordered, foreign or wrong-key chain fails closed.

- **One snapshot (#20):** the check reads the tenant's evidence in a single graph query and analysis answers from those same rows (`snapshot-rows.ts` mirrors the `READ_*` queries; a test asserts equal rows on the seeded graphs. On degenerate graphs with parallel duplicate edges the view can return extra, harmless rows, and such graphs only exist through the witnessed writer). No graph read happens after the check, so a write landing between check and read, even one undone before the response, cannot change the answer.
- **Writes:** seed and evidence bundles are the only writers (`witnessedWrite`). Per (graph, tenant) lock file → head must be valid and the graph must match it (a writer never blesses tampering) → append `PENDING` (fsync) → graph write → append `COMMIT` with the new state (fsync). A failure that left the graph unchanged appends `ABORT`.
- **Crash recovery:** a `PENDING` head fails reads closed. `cli witness-recover` appends `ABORT` if the graph still holds the committed state; if the graph changed, the operator reruns the same write with `seed --resume` (same intent only). A lock left by a killed writer is removed by the operator.
- **Initialization is explicit:** `seed --init-witness` creates a chain and is refused if one exists. A lost chain is never rebuilt from the graph automatically.
- **Revocation is durable.** `revokeEvidence` (CLI `revoke <licenseId> <newRevision>`) deletes the binding, moves the release to a higher revision, and records a tombstone `kind|subject|path` in the COMMIT (no file hash, so an edited or re-encoded copy of the same evidence file stays revoked). Tombstones carry forward in every record (a PENDING/ABORT that changes them is CORRUPT). The revoke/reinstate/rollback **plan is part of the MAC'd PENDING record**: any resume after a crash commits exactly that plan, `revokeEvidence` resumes itself, and a COMMIT whose tombstones differ from its PENDING plan is CORRUPT. The writer refuses, **before any graph change**, a seed whose planned bindings include a tombstoned one (`REVOKED`) or whose revision is lower than the witnessed one (`ROLLBACK`). It re-checks both against the actual result before COMMIT; a violation is left PENDING (reads fail closed) until the operator restores the committed state and recovers. Only an explicit `reinstate` (operator re-grant; CLI `--reinstate=<kind|subject|path>`) lifts a tombstone, and the COMMIT records it; `--allow-revision-rollback` is an explicit operator override, never a default. Overrides are named in the ledger intent (`+reinstate`, `+allow-revision-rollback`). Consequence: after a revoke, every later seed that carries the revoked binding (the base seed and the bundle both do) is refused until an explicit reinstate.
- **What the witness vouches for:** whatever the graph holds when the operator runs `--init-witness`, and whatever a sanctioned write produced at COMMIT. It does not judge content; content is judged at read time by the layers above (files, signatures, grammars).
- **Limit (documented): writes inside a PENDING window.** A second connection with graph-write credentials that writes while a legitimate writer is between PENDING and COMMIT is included in that COMMIT (it passes the tombstone and revision checks, but not human intent). Mitigation: graph-write credentials stay server-only; closing it fully needs database-level write isolation.
- **Torn final append:** a crash mid-append leaves a partial last record (CORRUPT; reads fail closed). `witness-recover --repair-torn-tail` drops it only if every earlier record verifies, and then recovery continues normally (a torn COMMIT shows as PENDING again: rerun the same write with `--resume`). Any other damage is never "repaired".
- **Limit (documented, not solved):** rolling back the whole host, witness directory included, to an older consistent pair is not detected; that needs an external monotonic anchor (post-hackathon). Operating conditions: graph write credentials and the witness directory are server-only; each environment uses its own `GRAPH_EVIDENCE_KEY`.


1. **Excerpt check.** A cited SourceRef counts only when its Source's recorded SHA-256 equals the SHA-256 of the file at `path` (an allowlisted relative path), and its `excerpt` equals that file's text at `[startOffset, endOffset)` in Unicode code points. Unverifiable excerpts are ignored and reported as an UNKNOWN integrity item.
2. **Meaning from text.** Witness facts are re-derived from the verified text with strict grammars (`packages/graph/src/witness.ts`). Stored witness properties (`cueTitle`, `scopeCutVersion`, `declaredCueCount`, `complete`) are seed-time conveniences and are never read by the analysis.

| Grammar | Applied to | Yields |
| --- | --- | --- |
| Whole cue-sheet file: one `Cut: vN …`, lines `Cue N: "Title"`, one `END OF CUE SHEET. Complete listing: N cues.` | the current cut's cue-sheet file (hash-verified) | cut number, cut label, ordered cue list; complete only if count = entries, numbering 1..N, unique titles |
| `Cue N: "Title"` | USES_TRACK excerpts | the cue line the edge claims |
| `Composition: "Title"` | COVERS excerpts | licensed title |
| exactly one `Cut vN`, at most one quoted title | VALID_FOR excerpts | scope cut number (and title) |

The seed refuses an excerpt that does not fit its role grammar, and a cue line without a cited excerpt.

## Evidence rules (current-cut clearance)

- **Coverage:** the cue-sheet file's cut number must equal the cut's version, and the graph's `USES_TRACK` set must equal the file's cue list, each edge citing its own verified cue line. Otherwise an UNKNOWN coverage item.
- **License support:** `COVERS` needs a verified excerpt naming the track; `VALID_FOR` needs a verified scope excerpt naming exactly that cut number (and the track, directly or via the subject), both from the license's own evidence file. Unsupported links to the current cut are reported as UNKNOWN integrity items and never verify anything.
- **VERIFIED / STALE / MISSING / UNKNOWN** per track; **ESTABLISHED** only with complete coverage, every track VERIFIED and no integrity item; **GAP** when coverage is complete and a track is STALE or MISSING; otherwise **UNKNOWN**.
- New license facts require a new source file **and** a binding signed by the server key; a graph write alone cannot add or move evidence.
- An approval is never a license.

## Offsets

`startOffset`/`endOffset` are **Unicode code points**, end-exclusive, into the UTF-8 file text. The seed locates each excerpt in the real file and refuses missing or ambiguous excerpts. `sha256` is of the exact file bytes.
