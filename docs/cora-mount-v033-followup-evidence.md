# v033 follow-up (Cora): direct-unconfirmed pool refresh, real-Chrome S7, isolated Gem B wiring prep

Branch `cora/ideaverse-mount-v033-followup`, from `13ad19f08a1c0e69d5f462bae520e6a14c08df11` (v033.02). Frozen inputs are untouched: #52 `807f854`, v033.02 `13ad19f`.
Parse-null ruling kept: `parseOverview` still rejects `revision: null` (fail closed). Nothing here serves a null workspace revision; receipt and attempt revisions stay strict.

## Commits (one fix, one tag)
| Tag | Kind | What |
| --- | --- | --- |
| v033.03 | product | `IdeaStudioController.settle`: a direct `unconfirmed` import reply (non-canonical receipt, or a bare ALREADY_IMPORTED) now re-reads the pool. No success effect, no pull, no second write. `not-started` still never refreshes. |
| v033.04 | test | `tests/web/studio-direct-unconfirmed.test.ts` (5 tests). The first two failed before v033.03 (pool read count 2, expected 3) and pass after. |
| v033.05 | test | Real-Chrome S7 harness and script (`s7-entry.tsx.txt`, `s7-proof.mjs.txt`). Replaces the v025 placeholder `true` for "Add disabled with the READY copy". |
| v033.06 | test | Isolated wiring-prep harness for accepted Gem B (`wire-entry.tsx.txt`, `wire-proof.mjs.txt`, `gate-probe.mjs.txt`). Evidence only. |
| v033.07 | docs | This file and the result JSON. |

## Direct-unconfirmed, in plain terms
When the import reply itself already ends in `unconfirmed` there is no read-back step, so the pool was never re-read. A write may still have committed, so the committed idea stayed listed. v033.03 re-reads the pool in that case. The card still says "Could not confirm whether this was saved..." and Re-check stays read-only.

## Real-Chrome results (headless Chrome, 1920x1080 and 1280x800, FakeServer)
- S7a leave READY with the import in flight, then return: pool withheld outside READY; card shows the READY requirement with no enabled Add/Retry/Re-check; shows could-not-confirm, never "Nothing was saved"; the late completion gives no Added and no pull and still one POST; on return the pool is re-read without the committed idea; the card is still unconfirmed with a read-only Re-check; Re-check confirms Added with one pull and still one POST.
- S7b card open and idle, then phase leaves READY: Add disabled, status region equals the READY copy exactly, a forced click makes zero reads and zero writes, and Add works again in READY.
- S10 direct unconfirmed (bare ALREADY_IMPORTED, non-canonical receipt): card unconfirmed, pool re-read in the DOM without the committed idea, no pull, one POST.
- Totals: S7 23/23 at both sizes (`results-s7-*.json`). Mutation control with v033.03 removed: 21/23, both S10 pool assertions fail (`results-s7-MUTATION-without-v033.03-1280x800.json`).

## Gem B wiring prep (isolated; NOT a mounted-product GO)
Real StudioPanel + IdeaCard + controller of this branch with the accepted Gem B component (`025b7bd`, component scope) in a scratch harness. 15/15 at both sizes (`results-wire-prep-*.json`).
- Mount once, only after the pool is settled; pass the controller's fresh overview as `overview`; one `onAdded` makes one confirmed pull.
- Own Add needs no remount: the pool already matches what the comets expect.
- Remount via `key` only on pool drift (for example another actor imported an idea). Never while a request is in flight and never during a pull. An external import also moves the revision, so a request held in flight ends STALE; that is real server semantics, not a wiring bug.
- FINDING: gating the comets on `pool.status === 'ready'` unmounts them whenever a pool refresh is in flight, which happens right after every Add. The in-flight pull is then lost and the comet vanishes instead of fading (`logs/gate-control-1280x800.txt`: REMOVED at about 100 ms with no `importing` step). The rule that works is "mounted while a settled overview exists and status is `ready` or `loading` with ideas".

## UNPROVEN / not claimed
- Nothing in the app mounts `IdeaVerseComets`. This is harness wiring only.
- The server is `FakeServer` from `tests/web/studio-harness.ts`. The real v026 route with an owner credential, the opt-in loopback owner rehearsal and the effective-access source were not exercised.
- Screen readers, other browsers and devices, hosted FalkorDB and integrated audio were not tested. Headless Chrome only.
- #54 `5d36e01` is review scope only. No final visual acceptance and no merge.
