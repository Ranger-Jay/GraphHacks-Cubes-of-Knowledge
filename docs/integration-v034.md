# Partial integration candidate v034.00

Status: draft for independent exact-head review. This combines the real manifest and HTTP path now, while the remaining comet/client gates continue. Component GOs do not accept this combined tree. This is not a final visual candidate, release, or deployment.

## Inputs

| Input | Exact preserved head |
| --- | --- |
| API / graph hardening, primary parent | `13f1290a4e200c4a9d0b7a938907404b865c490a` |
| Final display-only profiles (includes provenance fixes) | `928e616cc5c6a8021ba281a449e0ab11af4a4e83` |
| Real 100-file IdeaVerse source pack (original component remains unmounted) | `c33a93bee2fa9645b083378df9964a45c4a5216b` |
| Accepted fixture layout A | `32b94bab177b2420db22f916c60c61c3ce56f946` |
| Import contract and ownership | `4abc0cb27e43086cadd5eee6a3f87303841e1220` |
| Approved Guz “will not” runtime text | `a74668ac3babe7b1c857e07154a6f57a92fc4ac4` |
| Reviewed single-card client/mount slice, still unbound | `807f854274bdd1fa11e8cbd73c7fc77d529281ed` |

The API input contains accepted `547910b19fb90f01faad8c5f2da032527482d9f0` studio/IdeaVerse hardening. Earlier approved source highlighting and neutral Roy/Ava wording are retained through the input ancestry.

## Reconciliation

One conflict in CompanyCube.tsx was resolved by retaining layout A's grey-black core block, visible only for GRAPH_UNAVAILABLE. Its neutral non-READY comment was retained. No other conflicting product logic was discarded. Shared transport now allows null overview workspace revision and AMBIGUOUS_IDENTITY rejection, matching the accepted graph. Three minimal client guards reject null revision before confirmation/new attempt creation; these integration-authored changes need non-author review. A null revision is never a valid import receipt revision or a writable expected revision.

The real manifest hash is `85209bd70ee02f779f907addadd704a84e7867f0f77b3f4f187ecba4e5a41994`; all 100 files must be loaded from the committed repository, not a temporary substitute. Importing does not alter licensing evidence or clearance. Profile roles remain display-only / NOT_ENFORCED; existing server sessions still enforce owner/reader/agent behavior.

## Bounded review target

Run npm ci, npm run check, npm test and npm run build. With pinned FalkorDBLite 0.10.0 installed, run the existing disposable graph launcher: `python3 scripts/ci-graph-tests.py`. Live startup/API tests require `CUBES_STARTUP_GRAPH=1`; missing runtime evidence must not be replaced by a skipped green test.

For the committed manifest through the SHIPPED HTTP server, start a fresh isolated loopback FalkorDB server, select its port through FALKORDB_PORT, and run after build:

```sh
CUBES_PARTIAL_GRAPH=1 node scripts/verify-ideaverse-manifest.mjs
```

The script creates a random graph namespace, verifies the real manifest/hash, seeds 100 ideas, starts apps/api/dist/server.js with ephemeral process-only owner/reader tokens, checks anonymous denial, actual reader detail/read, reader write denial, owner import and new overview agreement, same-key replay and read-only status, no-store, and absence of tokens/repository paths in responses/logs. It removes only its own synthetic graph data. It does not run against or seed a shared application graph, and does not provide browser credentials.

## Explicitly held

- Gem comet repair `025b7bd9758963fb37d5c37638f44cf0094a12ea` is NOT included or mounted. Its Cora/Boons mounted default-clock re-test remains required.
- Cora v033 follow-up has no published input at assembly time. This tree has only the minimal nullable-revision guard reconciliation described above; direct-unconfirmed pool refresh and the actual READY-state S7 browser assertion remain outside this tree.
- The original unmounted IdeaVerse scene from the source-pack ancestry is not the reviewed comet repair. No shell code mounts it. Its local receipt validator is not a persistence acceptance path.
- Production default still has no studio binding. No owner rehearsal proxy, effective-access binding, browser import, comet pull/replacement or audio asset playback is claimed. Normal dev proxy remains reader-only; the private owner session used by the script exists only in its disposable server process.
- The existing client S7 placeholder and other declared limits are not promoted into live evidence by this merge.
- Lost-reply browser recovery, real mounted outage/recovery and integrated audio require the later combined visual head.

Independent review owns the verdict: graph/API reproduction on this exact partial SHA first, full browser journey only after the held inputs and explicit opt-in loopback rehearsal path are reconciled. All source heads stay frozen. No main merge, tag, deployment, paid call or release authorization is implied.

## Assembly checks (author evidence, not independent acceptance)

- npm ci --ignore-scripts, npm run check, npm test, npm run build, script syntax and git diff --check passed on the assembled tree. Unit scope: 204 total, 202 passed, 2 live-startup tests skipped in the ordinary run.
- Disposable vendor FalkorDBLite graph suite: 103/103 passed, zero skips. Launcher: scripts/ci-graph-tests.py with the pinned Python dependency available.
- Committed-manifest/shipped-server script: PASS, 100 ideas, 23-word verified first detail, one imported idea/receipt, reader write 403, same-key replay, read-only re-check, no-store and no observed token/repository-path leakage.
- The attempted mandatory CUBES_STARTUP_GRAPH=1 verify run failed because the existing tests/api/ideaverse.test.mjs redislite Python wrapper could not launch its database in this host. This is NOT a passing live-startup gate. The separate direct vendor launcher succeeded for the graph suite and shipped-server manifest script. The existing wrapper failure remains an explicit independent reproduction item, not a reason to erase its test or claim parity.
- No real browser proof was run on this partial tree. Existing source-branch browser reports remain attributed to their original SHAs.
