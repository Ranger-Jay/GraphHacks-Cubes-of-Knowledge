# Combined visual candidate (v021.xx, CANDIDATE DRAFT)

Reversible candidate for Buddy to reconcile. Not accepted, not merged, no release implied. `scene/index.tsx` is Buddy-owned. Earlier GOs on #26, #30, #31, #32, #33, #34 and #35 apply only to their own exact heads and do not transfer to this head. Slots v021.xx are PROPOSED pending Buddy's allocation.

## Inputs (exact heads)

| PR | Branch | Head |
| --- | --- | --- |
| #33 (base of this branch) | `cora/visual-shell-v016` | `bb3bc97a9f736a8c9f7b4f865831b2a5a123e5f5` |
| #31 | `mara/scene-gating-v020` | `2e5677b1abdb02b3de298b8b899ce9091396434c` |
| #32 | `gem/visual-pilot-v017` | `f3c6b80f64b7534eb801e50e16f698f5dde7aa75` |
| #35 | `cora/web-highlight-replay-v016` | `b6dfc8c88e385eb009a66a08d15a8662fb52e50c` |
| #34 | `claude/phase-oracle` | `39fb932b209aeb79ece2b90695998cc04b12bf8c` |
| #30 (contract, in all of the above) | `buddy/scene-state-v019` | `99f915180b66b8f71fed65364aaaa1efc6adf5af` |

## Commits after the four merges (each one is its own concern, drop any one to revert it)

| Slot | Concern | Owner's file touched |
| --- | --- | --- |
| v021.04 | `runtime` reaches CompanyCube and all AgentPyramids; absent runtime fails closed to CHECKING | `scene/index.tsx` (Buddy) |
| v021.05 | caption follows the phase: no "Systems ready" or stale agent line outside READY | `scene/index.tsx` (Buddy) |
| v021.06 | UNAVAILABLE is not drawn as the outage visual | `scene/CompanyCube.tsx` (Gem), one line |
| v021.07 | PROPOSED COPY: neutral CHECKING / UNAVAILABLE wording, no "severed" | `CompanyCube.tsx` strings (Gem), `scene/index.tsx` |
| v021.08 | a settled blocked phase is named on the task button even with no handler bound | `scene/AgentPyramid.tsx` (Mara), label order only |
| v021.09 | remove the #33 interim outer-CSS guard (the cube now reads `runtime.phase`) | `styles.css`, tests, docs |

## Known open items (not fixed here)

- Mara's approved fixed agent outage notices (issue #29) say "disconnected" and "reconnects". They play for any GRAPH_UNAVAILABLE, including a QUERY_FAILED-only case. Left as approved; Buddy/Jay to rule.
- The cube's own fallback when `runtime` is absent (non-AVAILABLE data reads as GRAPH_UNAVAILABLE) is unchanged. `scene/index.tsx` always passes `runtime` now, so only a direct `<CompanyCube>` render without it is affected.
- The shell binds no task handler, so Start Task is "Task Unbound" in READY (honest: no task action exists).
- With all three pyramids open the page scrolls; the default state (Ava open) fits one screen at 1920x1080 and 1280x800.
- A database lost while the page stays open shows READY until the next Re-query (unchanged).
- `tests/scene` has three type errors in `scene.test.tsx` (lines 91-93) that already exist on #31's head.
