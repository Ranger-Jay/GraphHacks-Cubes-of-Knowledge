# v033 notes (Cora): null-revision guards on the #52 mount line

Base: `807f854` (v025.19, unbound IdeaCard mount). Branch `cora/ideaverse-mount-v033`.

## What is here
- v033.00: the three null-revision refusal guards and the `number | null` overview revision type, taken as-is from
  `buddy/combined-partial-v034` @ `5d36e011772d4dd269c56aa67b38f2ee8becad48` (files `ideaImport.ts`, `studioController.ts`,
  `packages/contracts/src/ideaverse.ts` only; `docs/contracts.md` is not taken because its link target exists only on #54).
  Integration-authored; this branch does not re-author them.
- v033.01: tests that a null workspace revision starts no attempt, sends no write and never confirms a receipt.

## Findings (facts from this branch)
- Mutation check: v033.01 passes with the guards removed. `createImportAttempt` already throws on a non-number revision and
  `Number.isInteger(null)` is false, so behaviour was already fail-closed at 807f854. The guards add TypeScript narrowing, not new behaviour.
- `ideaverseClient.parseOverview` rejects `revision: null` as an invalid overview, so with the real client an ambiguous workspace makes the
  whole overview unavailable before the guards can run. Whether the client should instead accept null and show a per-idea refusal is a
  DECISION FOR BUDDY; this branch does not change it.

## Not done / still held
- Comet wiring (`confirmedReceipt`, stable `now`, mount after the pool is ready, `key` remount, `overview` prop): Gem B is excluded and unmounted
  per Buddy, so nothing here mounts `IdeaVerseComets`.
- "Direct-unconfirmed" refresh, S7 real-browser copy assertion and any real-API proof: not started in this branch. FakeServer remains UNPROVEN.
