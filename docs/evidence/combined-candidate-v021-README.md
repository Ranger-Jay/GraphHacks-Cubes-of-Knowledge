> **Where this lives:** committed to the repo at v025.03 so the PR #36 body's "evidence README" reference resolves. It is the evidence README for `cora/combined-candidate-draft` @ `229ff67` as written at 8 PM ET Oct 15, 2026; the body below is unchanged apart from this note.
> **Not committed (kept on Cora's box, size / test-only):** `logs/`, `screens/*.png`, `live/` (stack.sh, flite-launcher.py, proof.mjs, highlight.mjs), `results-*.json`. `per-commit.txt` is committed next to this file. The per-commit table there covers the #36 history; v025.xx commits are listed in the body of the `cora/studio-ui-v025` draft PR.
> **Superseded since the text below (branch `cora/studio-ui-v025`, base `229ff67`):** v025.00 changed the Roy/Ava outage notices from "disconnected"/"reconnects" to "unavailable"/"is available again" (finding 4, wording-only, needs Mara/Buddy acceptance); v025.01 makes Start Task read "Task Blocked (Checking)" during CHECKING (finding 1 tail); the "Task Unbound" in the READY row below is still true (no handler is bound).

# Cora combined visual candidate (evidence)

Branch `cora/combined-candidate-draft` @ `229ff67bee82f89696742f8d551319dac16fb137` (code-identical to `1752cefa848e417dcab0258c0c710f014e997374`, where the browser proof ran; the last commit is docs only).
REVERSIBLE CANDIDATE DRAFT for Buddy to reconcile. No existing branch or PR head was altered; nothing merged, deployed or posted. Slots v021.xx are PROPOSED.

## Exact input heads
#33 `cora/visual-shell-v016` bb3bc97a9f736a8c9f7b4f865831b2a5a123e5f5 (branch base) | #31 `mara/scene-gating-v020` 2e5677b1abdb02b3de298b8b899ce9091396434c | #32 `gem/visual-pilot-v017` f3c6b80f64b7534eb801e50e16f698f5dde7aa75 | #35 `cora/web-highlight-replay-v016` b6dfc8c88e385eb009a66a08d15a8662fb52e50c | #34 `claude/phase-oracle` 39fb932b209aeb79ece2b90695998cc04b12bf8c | #30 `buddy/scene-state-v019` 99f915180b66b8f71fed65364aaaa1efc6adf5af (already inside all of them).
Other frozen heads seen, untouched: #26 aa6314272507fbec5bf9c03cf3bbad6538907a90, #27 d8c9938ff82b957ddbdeaf09f799c92ff168e6ec.

## Conflict log
All four merges were clean (no textual conflicts): #31 touched AgentPyramid/audio/dialogue/scene tests; #32 touched CompanyCube/scene.css/pilot model files; #35 touched AnalysisView/styles.css/highlight test; #34 added a test and a doc. No file was edited by two inputs. Semantic overlaps found (not textual) and how they were handled are in "Semantic findings" below.

## Per-commit checks
`per-commit.txt` (run-checks.sh output, one line per commit; FALKORDB_PORT=6399, Node 24 in /tmp). Columns: check, build, `npm run test:web` exit and pass/fail, `tsc -p tests/web`, `tsc -p tests/scene`, `npm run test:scene` exit and pass count.
Web tests 62 (#33 base) -> 69 after #35 -> 73 after #34 (the 4 oracle tests). Scene tests 15 (base) -> 19 (#31) -> 28/29/29/30/31 (my commits) -> 38 at v021.09.
`tsc -p tests/scene` exits 1 on every commit after the #31 merge because of 3 errors in `tests/scene/scene.test.tsx` lines 91-93 that already exist on #31's own head (verified in a clean worktree of `mara/scene-gating-v020`); none are in my files.
Head-level full logs in `logs/head-*.txt`: check 0, build 0, web 73/73, scene 38/38, `tsc -p tests/web` 0, `FALKORDB_PORT=6399 npm test` 0 (7 pass), Claude's oracle alone 4/4 (117 pairs).

## Fails-before proof for the new tests (`logs/*-BEFORE.txt` vs `*-AFTER.txt`; each run on the parent source with only the commit's source change stashed)
| Commit | Tests added | Before | After |
| --- | --- | --- | --- |
| v021.04 wiring | 6 phase-reaches-cube-and-pyramids, fail-closed no-runtime, only-outage-is-outage, speech | 8 of 9 FAIL (the speech test is a unit gate from #31 and passes either way) | 9 of 9 pass |
| v021.05 caption | caption follows phase | 1 FAIL | pass |
| v021.06 UNAVAILABLE visual | non-outage phases never damaged | 1 FAIL | pass |
| v021.07 copy | cube notice per phase, no disconnect/sever | 1 FAIL | pass |
| v021.08 labels | blocked phase named with no handler | 1 FAIL | pass |
| v021.09 guard | shell+scene (7 scenarios) | passes either way (guard is CSS); the browser proof is what justifies removal | pass |

## Real-browser proof (`live/proof.mjs`, `results-head.json`, `screens/head-*.png`)
Headless Google Chrome (Playwright) against the real UI + Vite dev proxy (server-side reader token, never in the bundle) + shipped API (`apps/api/dist`) + disposable FalkorDBLite on port 6391, seeded with `--init-witness`. Test-only tokens generated into /tmp/ccc-live, never printed or stored; all owned processes stopped and /tmp/ccc-live removed afterwards. Speech is observed by a test-only `speechSynthesis` recorder with audio enabled. 1920x1080 and 1280x800 (reduced motion).
| Scenario | Result (all from the DOM) |
| --- | --- |
| READY | shell+cube READY; 10 nodes, 10 edges; clearance + 2 evidence items + 8 source records; cube, agents, result all in viewport; no page scroll at both sizes. Positive control: Ask Help/Affirm/Deny speak ("how may I help", "yes", "no") on all 3 agents. Start Task reads "Task Unbound", disabled (no handler exists). |
| Source jump + highlight (`results-highlight-head.json`) | details open, record focused AND marked (3px outline, "Cited source" label), inside the side pane, no page scroll, route unchanged; Escape/click-away clear it; second jump moves it; keyboard Enter path marks it. Both sizes. |
| 401, healthy graph | ACCESS_DENIED; cube NOT damaged, cube text "ACCESS DENIED / Analysis unauthorized"; status "Access denied (HTTP 401)"; agent buttons "Task Blocked (Access)", disabled; 0 utterances from every Help/Affirm/Deny click; caption "Access denied." Both sizes, no page scroll. |
| Missing release | NOT_FOUND; cube not damaged; "Task Blocked (Not Found)"; 0 utterances. |
| Real outage (our FalkorDB stopped, Re-query) | API 503 on status and analysis; GRAPH_UNAVAILABLE; damaged cube, collapsed grey-black sun, 0 nodes/edges, empty proof, no clearance/evidence/sources; "Task Blocked (Outage)"; only each agent's approved fixed notice is spoken (9 clicks -> 3 distinct notices), no normal speech; outage notice only. Both sizes, no page scroll. |
| Recovery | same database restarted (no reseed), Re-query: READY, 10/10 nodes and edges, `data-recovered=true`, normal speech works again, no stale outage caption. |
| 401 with the graph down | outage wins: GRAPH_UNAVAILABLE, "Task Blocked (Outage)", damaged cube. |
| CHECKING (analysis held 4s by a test route delay) | CHECKING; cube not damaged, "CHECKING THE GRAPH..."; no proof. |
| Wording | `shellTextDisconnectSever` and `cubeTextDisconnectSever` false in every scenario; "Evidence severed" appears nowhere. Agent outage notices (Mara, approved) do contain "disconnected"/"reconnects"; see findings. |
| Page errors | none (a favicon 404 only). |

CSS guard: REMOVED (v021.09). Without it, 401 and 404 show the cube's own neutral notice (not the outage visual), and only GRAPH_UNAVAILABLE gets the damaged cube.

## Semantic findings
1. Mara's `taskButtonLabel` checked `!bound` first, and the shell binds no handler, so the real app showed "Task Unbound" in every phase (v021.08 fixes the order for four settled blocked phases).
2. Gem's cube treated UNAVAILABLE like an outage (v021.06) and drew "Evidence severed" and "Routing cryptographic proof verification..." (v021.07 PROPOSED COPY).
3. The scene caption said "Systems ready" regardless of phase and kept stale lines (v021.05).
4. Approved agent outage notices say "disconnected"/"reconnects" and play for QUERY_FAILED-only too: UNCHANGED, needs Buddy/Jay.
5. Mara's #31 already has captions for CHECKING ("Checking current information.") and UNAVAILABLE ("Current information is unavailable."); Claude's matrix said they were unspecified. My PROPOSED System caption wording ("Checking the graph...", "Graph status unavailable.") differs slightly from Mara's agent-click captions; Buddy should pick one set.
6. The shell StatusArea says "Information unavailable" for UNAVAILABLE while the cube proposes "GRAPH STATUS UNAVAILABLE".
7. With all three pyramids open the page scrolls (1306-1563px tall); default state fits.

## UNPROVEN
Screen readers; Firefox/Safari; the hosted FalkorDB; a QUERY_FAILED-only outage in a real browser (only unit-level and CONNECTION_FAILED+QUERY_FAILED via a real stop); a database lost while the page stays open (known limit); real audio output (speech observed via a recorder); the Gem scene audit and Buddy gate on this exact head; independent review of this head; the visual quality of the READY cube labels (overlapping node labels visible in the READY screenshot, Gem's art).

## Files
`per-commit.txt`, `run-checks.sh`, `logs/`, `live/` (stack.sh, flite-launcher.py, proof.mjs, highlight.mjs), `results-head.json`, `results-highlight-head.json`, `screens/`.
