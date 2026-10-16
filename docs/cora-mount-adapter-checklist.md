# Mount / adapter checklist: IdeaCard, ImportIdea, ReadOverview (Cora, v025.c, docs only)

Status: **read-only planning doc.** Nothing here binds, mounts or wires anything. Author: Cora (web shell lane). Base: `cora/idea-import-honest-v025b` @ `d74518bc55e8a10feb8574407848d72f62413aba` (PR #49, frozen). Reviewer/reconciler: not the author (D-019). Everything marked **UNPROVEN** has no evidence at this base.

## 0. Purpose and current state

Before `IdeaCard` (`apps/web/src/studio/IdeaCard.tsx`) is mounted anywhere, and before the shell binds `ImportIdea` and `ReadOverview` to a real route, every item below must be true and independently evidenced on the exact head that gets mounted. Earlier GOs do not transfer when a head moves.

| Piece | Where | Today |
|---|---|---|
| `IdeaCard`, `importReducer`, `verifyImportReadback`, `confirmImport` | `apps/web/src/studio/` (PR #41/#49) | Built and unit-tested; **mounted nowhere**; takes injected `importIdea` / `readOverview`; absent props disable Add and it says so |
| Graph `importIdea`, `ideaverseOverview`, `ImportReceipt` | `packages/graph/src/ideaverse.ts` @ Claude `366eb56` | Reviewed GO (Cora + Boons); **no HTTP route exists** |
| Route `POST /api/studio/ideas/:ideaId/import`, `GET` overview | `apps/api` (Mara v026) | **Not started / not published.** Contract not final. Cora's proposal lives in issue #40; Mara/Buddy own the final shape |
| Comet scene `IdeaVerseComets` | `apps/web/src/scene/IdeaVerseComets.tsx` (Gem, `gem/ideaverse-followup-v025` @ `0883c92`) | Unmounted; own inspect card and own receipt validator (see 7) |

## 1. Route contract (owner: Mara + Buddy, v026; Claude for the graph side)

Must be published as a reviewed head, with types shared or mirrored by a test, before any binding.

- [ ] Import route: authenticate and authorize **before** reading the body or probing the graph (zero graph probes on 401/403, proven the way Mara did for #46). Owner role only; agent and reader tokens get 403.
- [ ] Request: `{ idempotencyKey, expectedRevision }` plus the idea id in the path. Key format and length validated; key reuse with a different idea answers `CONFLICT/KEY_REUSED`.
- [ ] Responses map 1:1 to the graph results: `IMPORTED` (with `replayed`), `CONFLICT` (`KEY_REUSED | STALE_REVISION | ALREADY_IMPORTED`), `REJECTED`, `UNAVAILABLE` (`CONNECTION_FAILED | QUERY_FAILED`), 401/403. No invented fields. No `witnessHash`, `nodeId`, `edgeId`.
- [ ] Overview route: returns the graph `IdeaverseOverview` unchanged: `AVAILABLE | EMPTY | UNAVAILABLE`, with `integrity[]`. Read-only GET. Never cached (`Cache-Control: no-store`); the card's confirm step needs a fresh read.
- [ ] The adapter pins `expectedRevision` **per idempotency key** (Claude's #49 P3-1, comment 6207418968): an adapter that re-reads the revision on retry turns a safe same-key retry into `KEY_REUSED`, and the card would then say "cube changed" for an idea that is imported. The card/adapter contract does not carry `expectedRevision` today; spec it before binding.
- [ ] Server enforces the READY rule itself: no import while the graph probe is not healthy (the UI gate in 5 is not a security control).
- [ ] An ambiguous write (timeout/connection loss after the write was sent) is reported as ambiguous or `UNAVAILABLE`, never as "not saved". Retry with the same `idempotencyKey` must be safe and must return the same receipt (`replayed: true`).
- [ ] Tests run against the real graph loader and real receipt type (not a hand-built receipt), live FalkorDBLite, at the exact head.

## 2. Receipt shape (owner: Claude, graph; ruling #40 comment 6206859588)

- [ ] Exactly `{ ideaId, sha256, workspaceId, importedAt, workspaceRevision, membershipId }`. `sha256` is 64 lowercase hex, equal to the manifest hash of the idea file. `workspaceRevision` is an integer >= 1. `importedAt` is strict UTC.
- [ ] No aliases anywhere: no `fileSha256`, `fileHash`, `witnessHash`. The shell parser (`parseImportReceipt`) **rejects** any extra key, so an alias is never silently mapped.
- [ ] Import membership stays outside the licensing witness: a receipt never carries `witnessHash`, `nodeId`, `edgeId`.
- [ ] Open point to settle: Gem's `isValidWorkspaceImportReceipt` (`0883c92`) still accepts `fileSha256` as an alias and accepts a conflicting second key. Whichever component is mounted must be strict (see 7).

## 3. Read-back rules (owner: Cora for the card, Claude for what the overview guarantees)

The card shows **Added** only from `verifying`, via a fresh overview read, via `verifyImportReadback`. An HTTP success or a well-shaped receipt alone is never enough.

- [ ] Fresh read: a NEW `ReadOverview()` call after the receipt arrives, never a cached or earlier overview.
- [ ] Exactly one listed entry for the idea, `imported === true`, with `membershipId`, `importedAt` and `sha256` equal to the receipt's; the card's own manifest `sha256` equal to it when known; `workspace.id` equal to the receipt's; `workspace.revision >= receipt.workspaceRevision`; and **no** `integrity[]` item naming the idea.
- [ ] Anything else is `unconfirmed` with a reason (`receipt-invalid`, `readback-unavailable`, `readback-empty`, `not-found`, `not-imported`, `duplicate`, `integrity`, `mismatch`), never success, never "Nothing was saved". Offer Re-check (read only, no resubmit) or same-key Retry.
- [ ] Proven live on the exact head with the real graph: real receipt confirms; forged never-persisted receipt, forged duplicate, deleted membership (`import receipt without a membership edge`), tampered `workspaceId`/`membershipId`/`importedAt`/`sha256` are all NOT Added. (Cora ran this matrix against Gem's comet validator at `0883c92`: the validator alone accepts every case except a tampered `sha256`. The reconcile has to live in the adapter and the card read-back, not in a shape check.)
- [ ] Open from Claude's #49 review (P3, GO on the unmounted slice at `d74518b`): `conflict` and ambiguous outcomes offer Retry only, not a read-only Re-check, although the graph returns the receipt on `ALREADY_IMPORTED` (P3-2); closing mid-import never announces the result, so the scene owner must refresh the comet pool from a fresh overview itself (P3-3); the "fresh" read being no-store is not enforced by anything (P3-4). Accept or fix before mounting.
- [ ] Stale completions (closed card, different idea, superseded request) are discarded. `onAdded` fires once.

## 4. Copy (owner: Cora; wording that touches Mara's approved lines needs Mara/Buddy acceptance)

- [ ] No state says "Nothing was saved" unless a refused or never-sent request is *proven* not to have written. Denied, unavailable, conflict, ambiguous, failed and every unconfirmed reason use the neutral copy in `ideaImport.ts` (`IMPORT_FAILURE_COPY`, `UNCONFIRMED_COPY`).
- [ ] Outage wording stays the Jay-approved neutral lines (PR #45). Do not reuse "disconnected/reconnects" for a query failure.
- [ ] Idea text is labeled "Synthetic demo idea. A fictional proposal, not a verified fact or a clearance."

## 5. Mount-site guards (owner: Cora shell; Buddy decides where it mounts)

- [ ] The mount site passes the live `ScenePhase`. **Add is available only in READY** (Buddy's condition on #41). In CHECKING, ACCESS_DENIED, NOT_FOUND, UNAVAILABLE and GRAPH_UNAVAILABLE the card may render read-only but Add is disabled with a reason. `IdeaCard` has no phase prop today, so this is new code and needs its own test.
- [ ] Phase change while the card is open (READY to GRAPH_UNAVAILABLE) resets or disables the card; a late completion after the phase left READY is discarded, not shown as Added.
- [ ] The bound `ImportIdea` carries the owner credential the same way the shell's other calls do; **no token in the bundle, URL, logs, commits or evidence**. The browser must not hold an owner token that the reader token does not already imply; decide the real credential path with Mara before binding (UNPROVEN, undecided).
- [ ] The shell binds nothing until the route in 1 is reviewed. Until then the card stays unmounted or visibly unbound.
- [ ] `expectedRevision` comes from the last overview read; a `STALE_REVISION` conflict triggers a fresh read, not a blind retry.

## 6. Accessibility, focus and browser proofs (owner: Cora to run; reviewer is another lane)

Current a11y logic is pure-test only. All of this is UNPROVEN in a real browser or screen reader until run:

- [ ] Opening the card moves focus to the title (`tabIndex=-1`); closing returns focus to the opener; Escape closes; focus never lands on a disabled control or behind the card.
- [ ] `role=dialog`, `aria-modal=false`, labelled/described; the status region (`role=status`, `aria-live=polite`) announces pending, verifying, added, unconfirmed and error exactly once each (no repeated announcements on re-render).
- [ ] Keyboard: Add, Re-check/Retry and Close reachable in a sensible order; Add disabled while pending/verifying/added with `aria-busy`.
- [ ] Reduced motion: no animation required to understand any state.
- [ ] Real Chrome, 1920x1080 and 1280x800, real UI + Vite proxy + shipped API + live FalkorDBLite on the exact mounted head: happy import to Added; real DB stop mid-flight (ambiguous, not "Nothing was saved"); close/reopen mid-flight (stale completion discarded); double click (one submit); 401/403; phase left READY while open.
- [ ] Composition on the mounted tree: the card does not cover the Sun or the cube, does not push the page into overflow, and does not hide the agent deck controls (Gem `d7da9ea` still has stacked nodes and clipped labels, see Tome comment 6207436500; the mounted tree must not inherit that).
- [ ] Trial merge of the exact heads (Gem comets/composition, PR #45, #41/#49, Claude graph) in a scratch worktree: check, build, `test:scene`, `test:web`, `test:graph`, and the browser proof re-run on the merged tree.

## 7. Two cards, two validators (owner: Buddy decides)

`IdeaCard` (Cora, `studio/`) and Gem's inspect card inside `IdeaVerseComets` both implement inspect + Add + receipt validation. Mount exactly one UI. Preferred: Gem's comet scene owns the flight/pull animation; the single card does the verified Add; the scene reacts to `onAdded(receipt)` only after read-back confirmation. If Gem's card is kept instead, it needs the same strict canonical-only parser, the read-back step, the copy fixes in 4, and a documented contract that `onRequestImport` resolves IMPORTED only after reconcile. Never two validators with different strictness on one path.

## 8. File ownership (proposed; Buddy to confirm)

| File / area | Owner | Notes |
|---|---|---|
| `apps/web/src/studio/*`, outer `apps/web/src/styles.css`, shell wiring in `App.tsx` | Cora | Author of the card; independent reviewer required (Claude or Boons) |
| `apps/web/src/scene/*` (CompanyCube, IdeaVerseComets, scene.css) | Gem | Cora re-attacks; never self-review |
| `packages/graph/src/ideaverse.ts`, manifest, seed | Claude | Receipt and overview shape are frozen at `366eb56` unless re-reviewed |
| `apps/api` routes and adapters (v026) | Mara | Not started; Boons or Claude review |
| `apps/web/src/sceneState.ts` and phase mapping | Buddy (PR #30) / Cora mapping | Mount guard in 5 consumes it |
| Reconcile, final gate | Buddy | Then Jay's release authorization |

## 9. Gates before "bind"

1. Route head published and reviewed by a non-author, with live evidence (1, 2).
2. Card head reviewed by a non-author in a real browser (3, 4, 5, 6).
3. Single-card decision (7) and Gem fixes re-tested.
4. Gem audit, then Buddy reconcile on the exact merged head.
5. Jay's release authorization. No merge, deploy, spend or hosted seed from the web lane.

Items intentionally NOT covered here: the cheap-model "talker" binding (#46/#37), synthetic data fill, and audio, which have their own gates.
