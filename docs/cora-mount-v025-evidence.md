# IdeaVerse mount, v025.13 to v025.19: delivery, evidence, UNPROVEN (Cora, web shell lane)

Status: **DRAFT, reversible candidate.** One `IdeaCard` is mounted behind the READY guard through an **optional** `studio` binding on `Shell`/`App`. `apps/web/src/main.tsx` is unchanged, so **nothing is bound to a real route and nothing is mounted in production wiring.** No merge or deploy authority is claimed. Reviewer and reconciler must not be the author (D-019).

Base: `cora/idea-import-honest-v025b` @ `d74518bc55e8a10feb8574407848d72f62413aba` (PR #49, frozen, untouched). The branch builds on my checklist commit `479458f` (a child of `d74518b`), so v025.12 stays in history. Contract consumed unchanged: PR #50 `buddy/import-contract-v030` v030.01 @ `4abc0cb27e43086cadd5eee6a3f87303841e1220`.

## Commits (one concern each)

| Tag | SHA | Concern |
|---|---|---|
| v025.12 | `479458f` | checklist (earlier, docs only) |
| v025.13 | `2be1687` | merge of PR #50 v030.01, unchanged (docs + transport types; no web code) |
| v025.14 | `f7f5019` | web import types are the PR #50 contract types (compile-time identity test); strict receipt parser (UTC `importedAt`, safe-integer revision) |
| v025.15 | `cf801f0` | immutable `{ideaId, key, expectedRevision}` attempt; outcome model; read-only status-check state; controlled `IdeaCard`; ruled copy |
| v025.16 | `0c35ad0` | HTTP adapter for the four PR #50 routes; strict runtime parsing; no-store; no credential; not bound anywhere |
| v025.17 | `1018559` | `IdeaStudioController`: READY + owner-access guard (fail closed), pinned attempts across retry/reopen, read-only Re-check, stale-callback discard, `onAdded` once, pool refresh after every settled request |
| v025.18 | `7db1650` | `StudioPanel` mounts the single `IdeaCard`; optional `studio` prop on `Shell`/`App`; callbacks bound for bare `onClick` (a defect only the real-browser proof caught, folded into this unpushed commit rather than spending a slot) |
| v025.19 | this commit | evidence and this document (docs only) |

## What the code does (the rulings it implements)

- **One card, one submit path.** `IdeaCard` is controlled. `Add` goes only through the controller. The scene's own "Add to cube" path in Gem's branch is not touched and must not become a second submit path.
- **Tuple.** `createImportAttempt` freezes `{ideaId, key, expectedRevision}`. `Retry` and reopening reuse the same tuple. After `STALE_REVISION` or `KEY_REUSED` the same-tuple Retry is not offered; "Refresh and start a new attempt" does a fresh overview read and mints a new key, and does not auto-submit.
- **Re-check.** Read-only: `import-status` then a fresh overview read. It never POSTs an import. Offered from conflict, ambiguous and receipt-invalid states. A "not found" answer says it does not rule out a request still completing.
- **Guard.** Add is enabled only when the studio is bound AND the shell phase is READY AND effective access is owner. Anything else fails closed with its own reason. Leaving READY mid-flight discards the late completion.
- **Added** is shown only after a fresh `ideaverseOverview` read-back verifies the six-key receipt (no aliases). `onAdded` fires once per idea. The pool is refreshed after every settled request, including one that completed after the card was closed.
- **Copy.** Unclear outcomes say "Could not confirm whether this was saved. Re-check the cube before retrying." The words "Nothing was saved" are never used for an unclear outcome. A refused import says "The server refused this request." If the pre-submit overview read fails, the card says no request was sent.

## Per-commit gate (exact results)

At every commit, in a clean detached worktree: `npm run check`, `npm run build`, tsc for `tests/web` and `tests/scene`, web tests, and `FALKORDB_PORT=6399 npm test`. Every exit code was 0. Raw lines are in `docs/evidence/cora-mount-v025/per-commit.txt`.

| Tag | web tests passed | `npm test` passed |
|---|---|---|
| v025.13 `2be1687` | 90 | 151 |
| v025.14 `f7f5019` | 92 | 153 |
| v025.15 `cf801f0` | 101 | 162 |
| v025.16 `0c35ad0` | 108 | 169 |
| v025.17 `1018559` | 125 | 186 |
| v025.18 `7db1650` | 131 | 192 |
| v025.19 | see the PR body (docs only; counts unchanged from v025.18) | |

Tests include DOM/effect tests (SSR plus controller-level): focus to title, Escape, focus return, `onAdded` once, a bare-callback test, StrictMode-style double mount, and 17 contract-semantics tests against a fake server that implements the PR #50 reply table.

## Real-browser proof

Google Chrome 154 (headless, via playwright-core) at 1920x1080 and 1280x800. Real web UI, real Vite proxy, the shipped API (READY phase), and FalkorDBLite. Run on a fresh disposable stack with test-only generated tokens that are never printed or stored here.

| Pass | Result |
|---|---|
| main 1920x1080 | 64/64 checks |
| main 1280x800 | 64/64 checks |
| outage 1920x1080 (real DB stop and restart mid-flight) | 9/9 checks |

Console errors seen are only the deliberately injected 403/409/502/503 and one 404 (no uncaught page exceptions). Journey covered: open, focus, Add, Added, read-back, pool refresh, keyboard, triple click, lost reply plus Re-check, lost reply plus same-tuple Retry, close mid-flight, reopen unresolved, leave READY mid-flight, refused (POST and pre-read), stale revision and new attempt, reader, StrictMode, DB outage and recovery. Results JSON, scripts and run log are in `docs/evidence/cora-mount-v025/` (TypeScript and mjs are stored as `.txt` so no build or lint picks them up).

Bugs the proof found and I fixed: bare `onClick` lost `this` on controller methods (fixed in v025.18, with a unit test added). Scenario-script defects (clicking a disabled Add, closing before the POST left, reusing an already imported id) were fixed in the script, not the product. One behaviour worth reviewing: closing the card **before** the POST leaves the browser sends no request at all (by design, stale discard); the proof waits for the POST before closing in the in-flight scenarios.

## UNPROVEN (nothing here has evidence)

1. **No real server route exists in this tree.** The proof uses a test-only harness (`studio-server.ts.txt`) that implements the PR #50 reply table over the real graph module (`366eb56`) on FalkorDBLite. The shipped API does not serve `/api/studio/ideas*`. Real-route behaviour (auth, cache headers, error bodies) is UNPROVEN until Mara's route is published.
2. **Effective-access source.** The mount takes `access` from the binding. The proof entry passes it from a query string. How production derives owner/reader/unknown for the browser is UNPROVEN and is the next owner's decision. No credential is sent by the client adapter; how production authenticates is UNPROVEN.
3. **Scene integration.** The comet scene and Gem's own card are not in this tree. The pool list in `StudioPanel` is a stand-in for the selection surface. Focus-return target when the opener is a 3D object is UNPROVEN. Gem's "Add to cube" path was not touched or tested.
4. **S7 UI text.** In the proof, the "Add disabled with the READY copy" assertion is a placeholder `true`; only the no-Added/no-pull and pool-refresh assertions in S7 are real. The READY-copy behaviour is covered by unit tests only.
5. **Not tested:** real screen readers, other browsers, touch or mobile viewports, several tabs or actors racing on one key, and long-running soak.
6. Everything ran on disposable local tokens and a disposable DB; nothing was run against a persistent or shared environment.

## File ownership (outer files touched, with reason)

| File | Owner | Change |
|---|---|---|
| `apps/web/src/studio/*` (IdeaCard, ideaImport, ideaverseClient, studioGuard, studioController, StudioPanel) | Cora | mine |
| `tests/web/*` listed in the PR body | Cora | mine |
| `apps/web/src/App.tsx` | shell lane (Cora), shared | optional `studio` prop, +11/-2 lines |
| `apps/web/src/styles.css` | shell lane (Cora), shared | appended panel/card styles, +9 lines |
| `docs/contracts.md`, `docs/ideaverse-api-v026.md`, `packages/contracts/src/ideaverse.ts`, `packages/contracts/src/index.ts` | Buddy (PR #50) | arrive only through the v025.13 merge, unchanged |
| `docs/cora-mount-adapter-checklist.md` | Cora | v025.12, unchanged |
| `docs/evidence/cora-mount-v025/*`, this file | Cora | v025.19 |

Not touched: Gem's scene files, Claude's graph files, Mara's API files, `apps/web/src/main.tsx`.
