# Synthetic seed

`sources/` holds the synthetic cue sheets, license and email. `packages/graph/src/seed.ts` loads them with `MERGE`, so running it twice adds nothing. Story: cut v3 (festival screener) was cleared; current cut v4 reuses "Basement Hum", whose only clearance is an email scoped to v3. "Night Drive" has a license for v4.

Optional evidence bundle `basement-hum-v4-license` (`seedGraph(client, root, { bundles: [...] })`) adds a new synthetic license for cut v4 (`sources/license-basement-hum-v4.txt`) and advances the release revision to `rel-wad@r2`. The base seed does not include it, so the default answer stays GAP.

## Evidence witness (D-020)

Seeding writes evidence, so it needs `GRAPH_EVIDENCE_KEY` and `GRAPH_WITNESS_DIR` (a server-only directory outside the graph). First run on a graph: `node --import tsx packages/graph/src/cli.ts seed --init-witness` (refused if a chain exists). Later runs: `seed [basement-hum-v4-license]`. After an interrupted write: `witness-recover` (add `--repair-torn-tail` for a torn final record), or rerun the same seed with `--resume`. Revoke a license with `revoke <licenseId> <newRevision>`; every later seed that carries that license binding is refused (`REVOKED`) until an explicit `'--reinstate=EVIDENCED_BY|<licenseId>|<path>'` (quote the whole argument: unquoted, the shell reads `|` as a pipe and `<`/`>` as redirects), and a seed that would lower the release revision is refused (`--allow-revision-rollback` is an explicit override). Both overrides are named in the ledger intent. Analysis returns UNKNOWN until the graph matches the committed witness. A witness chain written before v004.031 reads CORRUPT and has no automatic migration; keep it and do not re-initialize it. See `graph/schema/README.md`.
