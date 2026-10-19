# Integration candidate v015

This is a separate review candidate. Main stays at `e12f9aa1ed32b87a586ca012e0c8e3479eca7abb`. Component review decisions do not certify the combined tree. The candidate requires independent exact-head browser proof, evidence meta-review, technical reconciliation and human release authority.

## Preserved source ancestry

| Component | Frozen source SHA |
| --- | --- |
| Root configuration/test harness | `e3f2f564975783abd59381b57ea59f3997fbc2d6` |
| Graph P3 | `dd30ee6d02a43ce97e5ddd42b4bac80cdb80fb95` |
| API/session/status | `420b66a5f892bf2e07ee689cc56cdc3b80c31871` |
| Web reader binding | `f1758cf843ba51f4a73ec7f6dc2e18a346256937` |
| Company Cube scene | `5b0225c5a93cbdc9a53b932e50e099e3c9ddc4c9` |

Four separate merge commits preserve these component histories. Conflict resolutions retain the API's strict anonymous approval rejection (`401`, not the earlier bootstrap `404 or 401`) and the root suite-discovery harness. Graph, API, web and scene implementation files are unchanged from their specified pins. Root README/environment proposals from the web branch are reconciled here; dependency resolution and integrity entries are unchanged.

Integration v015.004 sets root package/lock version metadata to 15.4.0, adds the server tenant/timeout example, removes the unused SESSION_SECRET example and requires the shipped live API startup case in graph-live CI. v015.005 documents the actual combined scope and current contract behavior. No implementation from optional source-highlight PR #26, agent-tools/handoff branches or standalone art prototypes is included.

## Author verification, 2026-10-15

Node 24.19.0, npm 11.9.0; Linux disposable host. These are integration-author results, not independent acceptance.

| Check | Observed result |
| --- | --- |
| `npm ci` | Exit 0; 54 packages installed |
| `npm run verify` without Python graph launcher on PATH | Exit 0; check/build passed; 61 tests passed, 1 live API startup test explicitly skipped |
| Bootstrap / harness | 1/1 and 3/3 |
| API without live startup | 19/19 |
| Web | 23/23 |
| Scene runtime assertions | **15/15**, actual count on this tree; no earlier 16-test count is adopted |
| `python3 scripts/ci-graph-tests.py` with pinned FalkorDBLite 0.10.0 installed | Exit 0; real TCP Redis 8.6.2 + FalkorDB 4.18.3; graph 47/47, zero skipped |
| `CUBES_STARTUP_GRAPH=1 npm run verify` with Python launcher installed | Exit 1 at shipped API launcher: this host denies its Unix socket (`Operation not permitted`); no API assertion ran in that attempt |
| Temporary TCP-only launcher adaptation of the shipped API startup test | 1/1 passed, zero skipped; every API assertion unchanged; original tracked test unchanged |
| `tsc -p tests/web --noEmit` | Exit 0 |
| Additional `tsc -p tests/scene --noEmit` | Exit 1: pre-existing TS2532 at scene.test.tsx lines 87–89 (array indexing); scene test file is byte-identical to source pin |

The TCP launcher adaptation started the same vendor redis-server/module directly, with loopback binding and appendonly/appendfsync-always, using a new disposable data directory. The shipped test's seed, authenticated reads, tenant isolation, 200/401/403/404/503, no 201, witness/graph equality, stop/restart and fresh-request assertions were retained. This is supplemental runtime proof, **not** an exact run of the original Python/Unix-socket launcher. CI and an independent supported host must reproduce the unmodified required test. All temporary server processes were terminated by their owning test harnesses.

The runtime/build checks preceded the final documentation-only commit; runtime source and package metadata did not change afterward. Full command outputs remain local to the author session; the counts above summarize observed executions. No browser, screen-reader, hosted database, Docker/WSL parity or model-provider proof was produced by this integration session.

## Reproduction on a supported host

```sh
npm ci
python3 -m pip install falkordblite==0.10.0
CUBES_STARTUP_GRAPH=1 npm run verify
python3 scripts/ci-graph-tests.py
```

These suites create and mutate disposable local graphs only. Read the root README before starting the manual seeded app. Do not point acceptance tests at a shared/hosted database. A green build with a skipped startup test does not satisfy the required live API gate.

## Independent review and capture gates

- Verify all five source SHAs are ancestors of the published candidate, and record the full combined head before testing.
- Render the actual Company Cube module in a real browser through the shipped API and Vite reader proxy, using a disposable real graph.
- Verify current-cut GAP, stale/current evidence, readable citations, source-link navigation, node selection, keyboard/text alternatives and reduced motion.
- Stop/restart the actual database: clear current evidence/scene edges on unavailability, recover without reseeding, and record fresh request IDs. Test both CONNECTION_FAILED and QUERY_FAILED behavior where applicable.
- Verify absent/malformed proxy token, forbidden agent, missing release and tenant isolation without exposing secrets. No approval may return 201 or mutate graph/witness.
- Reproduce the unmodified shipped startup test on a supported host; reconcile the separate scene-test type-check errors in the scene lane.
- Review root environment/contracts/CI changes independently. Keep the explicit unauthenticated graph-name disclosure boundary in scope.

For capture, API `BOOTSTRAP ready=false` is process liveness, not a failed graph probe. The adjacent graph probe carries graph availability; do not relabel liveness to imply full readiness. Named-query footage may show `graph/queries` and an actual graph CLI result, accurately described as a deterministic named graph query rather than a model call. Optional PR #26 remains separate until its remaining review gates complete.

Whole-host rollback of graph plus witness plus signed records remains an unsolved residual limitation. Approval is not a music license. No agent/model execution, durable agent handoff, release, merge, deployment or hosted seed is authorized or certified by this candidate.
