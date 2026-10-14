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
| Source | tenantId, kind, path, sha256, offsetUnit; cue sheets also complete, cutVersion, declaredCueCount, cueEntryCount | Immutable source file (`cue_sheet`, `license`, `email`) |
| SourceRef | tenantId, sourceId, role, excerpt, startOffset, endOffset; witness fields by role | Exact excerpt of a Source |
| Principal | kind, displayName | Synthetic humans (Kanny, Serena) and agents (Roy, Ava, Guz) |

## Relationships (each has `id` and `sourceRefIds`)

`(Release)-[:HAS_CUT]->(Cut)`, `(Release)-[:CURRENT_CUT]->(Cut)`, `(Cut)-[:SUPERSEDES]->(Cut)`,
`(Cut)-[:LISTED_IN]->(Source cue_sheet)`, `(Cut)-[:USES_TRACK]->(Track)`, `(License)-[:COVERS]->(Track)`,
`(License)-[:VALID_FOR]->(Cut)`, `(License)-[:EVIDENCED_BY]->(Source)`, `(SourceRef)-[:EXCERPT_OF]->(Source)`,
`(Principal)-[:MEMBER_OF {role}]->(Tenant)`. Roles: `OWNER`, `READER`, `AGENT`. The API lane enforces them; the graph stores them.

## Source witnesses (strict grammar, no NLP)

The seed parses structured facts from the source text; the graph stores them on Source/SourceRef.

| Role | Grammar | Witness fields |
| --- | --- | --- |
| cue sheet (whole file) | one `Cut: vN`, lines `Cue N: "Title"`, one `END OF CUE SHEET. Complete listing: N cues.` | `complete` only if exactly one cut, count = entries, numbering 1..N, unique titles |
| cue_entry | `Cue N: "Title"` | cueIndex, cueTitle |
| license_subject | `Composition: "Title"` | subjectTitle |
| license_scope | exactly one `Cut vN`, at most one quoted title | scopeCutVersion, scopeTitle |

The seed refuses a cue line without a cited cue_entry excerpt, and any excerpt that does not fit its role grammar.

## Evidence rules (current-cut clearance)

- **Coverage:** the current cut's complete cue sheet (matching cut version) must list exactly the tracks the graph links with `USES_TRACK`, and each such edge must cite the cue_entry for its own title. A missing, extra or unsupported link produces an UNKNOWN coverage item.
- **License support:** `COVERS` counts only when an excerpt from the license's own evidence source names the track. `VALID_FOR` counts only when a license_scope excerpt from that same source names the exact cut version (and the track, directly or through the subject). Unsupported links to the current cut are reported as UNKNOWN integrity items; they never verify anything.
- **VERIFIED:** supported coverage plus a supported license for the current cut. **STALE:** supported licenses only for other cuts. **MISSING:** none covers the track. **UNKNOWN:** coverage not established.
- **Release clearance:** `GAP` when coverage is complete and any track is STALE or MISSING. `ESTABLISHED` only when coverage is complete, every track is VERIFIED and there is no integrity item. Otherwise `UNKNOWN`.
- An approval is never a license. License facts come only from source excerpts.

## Offsets

`startOffset`/`endOffset` are **Unicode code points**, end-exclusive, into the UTF-8 file text. The seed locates each excerpt in the real file and refuses missing or ambiguous excerpts. `sha256` is of the exact file bytes.
