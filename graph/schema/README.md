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
| Source | tenantId, kind, path, sha256, complete, offsetUnit | Immutable source file (`cue_sheet`, `license`, `email`) |
| SourceRef | tenantId, sourceId, excerpt, startOffset, endOffset | Exact excerpt of a Source |
| Principal | kind, displayName | Synthetic humans (Kanny, Serena) and agents (Roy, Ava, Guz) |

## Relationships (each has `id` and `sourceRefIds`)

`(Release)-[:HAS_CUT]->(Cut)`, `(Release)-[:CURRENT_CUT]->(Cut)`, `(Cut)-[:SUPERSEDES]->(Cut)`,
`(Cut)-[:LISTED_IN]->(Source cue_sheet)`, `(Cut)-[:USES_TRACK]->(Track)`, `(License)-[:COVERS]->(Track)`,
`(License)-[:VALID_FOR]->(Cut)`, `(License)-[:EVIDENCED_BY]->(Source)`, `(SourceRef)-[:EXCERPT_OF]->(Source)`,
`(Principal)-[:MEMBER_OF {role}]->(Tenant)`. Roles: `OWNER`, `READER`, `AGENT`. The API lane enforces them; the graph stores them.

## Evidence rules (current-cut clearance)

- **VERIFIED:** a License `COVERS` the track **and** is `VALID_FOR` the current cut.
- **STALE:** the track's only licenses are valid for other cuts. Shown as stale, never as clearance.
- **MISSING:** no license covers a track used by the current cut.
- **UNKNOWN:** the current cut has no complete cue sheet (`LISTED_IN` a Source with `complete=true`), so an absence cannot be asserted.
- Release clearance is `ESTABLISHED` only when every track is VERIFIED. It is `GAP` when coverage is complete and any track is STALE or MISSING, and `UNKNOWN` otherwise.
- An approval is never a license. License facts come only from Source excerpts.

## Offsets

`startOffset`/`endOffset` are **Unicode code points**, end-exclusive, into the UTF-8 file text. The seed locates each excerpt in the real file and refuses missing or ambiguous excerpts. `sha256` is of the exact file bytes.
