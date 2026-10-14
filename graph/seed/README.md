# Synthetic seed

`sources/` holds the synthetic cue sheets, license and email. `packages/graph/src/seed.ts` loads them with `MERGE`, so running it twice adds nothing. Story: cut v3 (festival screener) was cleared; current cut v4 reuses "Basement Hum", whose only clearance is an email scoped to v3. "Night Drive" has a license for v4.

Optional evidence bundle `basement-hum-v4-license` (`seedGraph(client, root, { bundles: [...] })`) adds a new synthetic license for cut v4 (`sources/license-basement-hum-v4.txt`) and advances the release revision to `rel-wad@r2`. The base seed does not include it, so the default answer stays GAP.

## Evidence witness (D-020)

Seeding writes evidence, so it needs `GRAPH_EVIDENCE_KEY` and `GRAPH_WITNESS_DIR` (a server-only directory outside the graph). First run on a graph: `node --import tsx packages/graph/src/cli.ts seed --init-witness` (refused if a chain exists). Later runs: `seed [basement-hum-v4-license]`. After an interrupted write: `witness-recover`, or rerun the same seed with `--resume`. Analysis returns UNKNOWN until the graph matches the committed witness. See `graph/schema/README.md`.
