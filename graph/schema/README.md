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

Graph nodes, edges and properties are **claims**. Two anchors sit outside the graph: the immutable source files under `graph/seed/sources/`, and the server evidence key `GRAPH_EVIDENCE_KEY` (32+ characters, environment only, never stored in the graph). At every analysis:

0. **Signed bindings.** Every `License -[:EVIDENCED_BY]-> Source` and `Cut -[:LISTED_IN]-> cue sheet` edge carries `rev`, `tracks`, `cuts` and `sig = HMAC-SHA256(key, [type, tenant, release, bound node id, file path, file SHA-256, rev, tracks, cuts])`. `rev` is the release revision number the binding was recorded at; `tracks`/`cuts` are what a license covers and is valid for. Analysis checks the HMAC (timing-safe) before reading the bound file, and also requires `rev` ≤ the release's current revision and that the row's track and cut are named. A graph write without the key cannot create, copy, re-point or re-purpose a binding, and renaming a node to a signed id does not help: a binding recorded at a later revision does not hold now (#15). Unbound licenses contribute nothing (UNKNOWN integrity item), and an unbound cue sheet leaves coverage UNKNOWN. With no key configured nothing verifies, so clearance is never ESTABLISHED. Seeding requires the key; recording new evidence is a key-holder (server) action.
   - **Limit (accepted MVP residual, not closed):** signed bindings never expire, and `Release.revision` is unsigned. Anyone who can write the graph and has once read a signed record can copy it back: it holds at its own revision and at **every later revision**, including after the key holder deleted it, and it replays across graphs that share a key. Revocation is not enforced. What cannot happen: a clearance built on a tuple the key holder never signed (tested as `#15 limit`). Operating conditions: graph write credentials stay server-only; each environment uses its own `GRAPH_EVIDENCE_KEY`; no revocation claim is made to users. Closing this needs a ledger or revocation list outside the graph (commercial-version work).

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
