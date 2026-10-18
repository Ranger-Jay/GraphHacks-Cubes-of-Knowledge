# Synthetic seed

`sources/` holds the synthetic cue sheets, license and email. `packages/graph/src/seed.ts` loads them with `MERGE`, so running it twice adds nothing. Story: cut v3 (festival screener) was cleared; current cut v4 reuses "Basement Hum", whose only clearance is an email scoped to v3. "Night Drive" has a license for v4.

Optional evidence bundle `basement-hum-v4-license` (`seedGraph(client, root, { bundles: [...] })`) adds a new synthetic license for cut v4 (`sources/license-basement-hum-v4.txt`) and advances the release revision to `rel-wad@r2`. The base seed does not include it, so the default answer stays GAP.

## IdeaVerse pool (pending v051 setup delta)

From the repository root, with the graph connection configured for a **fresh disposable local** database:

```sh
node --env-file-if-exists=.env --import tsx packages/graph/src/cli.ts seed-ideaverse
```

This calls the existing `seedIdeaverse` operation against `graph/seed/ideaverse/manifest.json`. The loader verifies the recorded byte counts, SHA-256 hashes, text limits and synthetic provenance for all 100 checked-in idea files before writing. A fresh `t-wad` workspace returns:

```json
{"seedVersion":"wad-ideaverse@1","tenantId":"t-wad","ideas":100,"workspaceRevision":0,"edges":100}
```

`seed-ideaverse [tenantId]` defaults to `t-wad`; use the API's configured tenant when rehearsing locally. No alternate manifest, arbitrary query, import or witness/reset flag is exposed. Reruns preserve workspace revision, imported memberships and receipts; changed content under an already imported id is refused. Invalid manifests or graph failures exit nonzero and do not print a successful seed result. Validation precedes the writes; database failure during seeding can leave partial metadata, so inspect the failure and rerun the same verified seed after recovery.

IdeaFile, Workspace and ImportReceipt are studio proposals outside the licensing evidence witness. This command needs no evidence signing key or witness initialization and cannot establish a music license, approval or agent memory. The separate licensing `seed --init-witness` procedure below still applies when demonstrating release analysis. These are operator commands using configured database access, not browser authorization. Never run them against an existing/shared or hosted graph for this rehearsal.

## Evidence witness (D-020)

Seeding writes evidence, so it needs `GRAPH_EVIDENCE_KEY` and `GRAPH_WITNESS_DIR` (a server-only directory outside the graph). First run on a graph: `node --import tsx packages/graph/src/cli.ts seed --init-witness` (refused if a chain exists). Later runs: `seed [basement-hum-v4-license]`. After an interrupted write: `witness-recover` (add `--repair-torn-tail` for a torn final record), or rerun the same seed with `--resume`. Revoke a license with `revoke <licenseId> <newRevision>`; every later seed that carries that license binding is refused (`REVOKED`) until an explicit `'--reinstate=EVIDENCED_BY|<licenseId>|<path>'` (quote the whole argument: unquoted, the shell reads `|` as a pipe and `<`/`>` as redirects), and a seed that would lower the release revision is refused (`--allow-revision-rollback` is an explicit override). Both overrides are recorded in the MAC'd write plan of the PENDING record; the seed CLI also marks them in its intent string (`+reinstate`, `+allow-revision-rollback`) as a convention, not an enforced invariant. Analysis returns UNKNOWN until the graph matches the committed witness. A witness chain written before v004.031 reads CORRUPT and has no automatic migration; keep it and do not re-initialize it. See `graph/schema/README.md`.
