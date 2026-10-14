# Named query catalog

Source of truth: `packages/graph/src/queries.ts`. Callers choose a name and parameters; they never supply Cypher. Reads run via `GRAPH.RO_QUERY`.

| Name | Parameters | Returns |
| --- | --- | --- |
| HEALTH | none | `releases` count (ready only when > 0) |
| READ_RELEASE_CURRENT_CUT | releaseId, tenantId | release, revision, current cut, cue-sheet coverage |
| READ_CUE_ENTRIES | sourceId, tenantId | parsed cue entries (index, title) of one cue sheet |
| READ_REF_WITNESSES | ids[], tenantId | role, source and parsed subject/scope of cited excerpts |
| READ_CUT_TRACK_LICENSES | cutId, tenantId | each track with every covering license and the cuts it is valid for |
| READ_SOURCE_REFS | ids[], tenantId | exact excerpts with path, sha256, offsets |

Writes: only the idempotent seed (`seed.ts`, fixed labels and relationship types). Approval, license-evidence and handoff mutations will be added as explicit narrow operations, never as generated Cypher.

## Commands (from repo root, server reachable via `FALKORDB_*`)

```bash
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts seed
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts health
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts analyze rel-wad
node --env-file-if-exists=.env --import tsx --test tests/graph/*.test.ts
```

The tests fail (they do not skip) when the graph is unreachable.
