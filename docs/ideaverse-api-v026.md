# IdeaVerse HTTP contract for the v026 adapter (v030.00)

Status: published integration specification; implementation and independent acceptance remain pending. This document does not expose a route or authorize a deployment. It specifies the resolution for #40 and the mount checklist at `479458f9c6ad6b233377d93f848c3d39d2cd024a`; #40 is not complete through specification alone. Transport declarations are in `packages/contracts/src/ideaverse.ts`. Types do not perform runtime validation or establish persistence.

## Implementation ownership and version allocation (v030.01)

The table records technical lane ownership; active contributor routing remains in the private coordination record. Preserve all reviewed heads and historical version labels. Publish repairs on separate follow-up branches, one concern per commit. A lane author cannot accept their own change.

| Lane / owned paths | Deliverable | Allocated slots / branch | Independent gate |
| --- | --- | --- | --- |
| Scene: `apps/web/src/scene/CompanyCube.tsx`, `scene.css` | Exact-ID fixture layout, readable node/edge labels, bounds; retain deck/core fixes | v029.00–v029.09, `gem/visual-layout-v029`, from `d7da9ea1cc4a608e426b99d9264578c6133d81ff` | Web-lane real browser review at both specified sizes; separate evidence/meta check |
| Scene: `apps/web/src/scene/IdeaVerseComets.tsx`, scene tests | Single-card scene boundary, canonical-only input, confirmed-event animation and elapsed clamp | v029.10–v029.19, `gem/comet-boundary-v029`, from `0883c9217f2bd9e67d3148cae814d5fc30fc5dae` | Web-lane lifecycle/forgery/clock and browser review; separate meta check |
| API: `apps/api/src/`, `tests/api/` | v026 routes/adapters, verified text detail, owner rehearsal credential path, real read-back/retry/denial tests | v026.00–v026.019, `mara/ideaverse-api-v026`; consume this contract and graph `366eb56c59da7c084d540cee00b86ba041e15600` | Graph-lane independent API/live-graph review; separate meta check |
| Web: `apps/web/src/studio/`, `App.tsx`, web adapters/tests | Single card, pinned attempt tuple, read-only Re-check, READY/access guard, stale completion and pool refresh | v025.13–v025.19, `cora/ideaverse-mount-v025`, from `d74518bc55e8a10feb8574407848d72f62413aba`; v025.12 is already occupied by checklist `479458f9c6ad6b233377d93f848c3d39d2cd024a` | Non-author UI/adapter review and combined-head browser proof |
| Graph: `packages/graph/`, graph tests/docs | Bounded read-only key/request/receipt verification and verified text operation if needed by API | v023.15–v023.19, separate follow-up preserving `366eb56c59da7c084d540cee00b86ba041e15600`; coordinate before exhausting slots | Opposing-lane graph review and separate evidence meta-review |
| Integration: `packages/contracts/`, `docs/contracts.md`, candidate manifest | Shared contract, combined-head conflict resolution and reconciliation | v030.00 contract; v030.01 ownership/precision follow-up; subsequent v030 revisions for reconciliation | Non-author exact-head review; combined-head browser/graph proof; final human release authority |

The separate v028 profile lane is outside this import contract. Its unresolved findings do not authorize changing these frozen graph/import inputs. No owner token, production grant or route exposure is established by an assignment.

## Frozen inputs

| Input | Exact reviewed head |
| --- | --- |
| Graph operations | `366eb56c59da7c084d540cee00b86ba041e15600` |
| Single inspect/import card, PR #49 | `d74518bc55e8a10feb8574407848d72f62413aba` |
| Composition needing label repair | `d7da9ea1cc4a608e426b99d9264578c6133d81ff` |
| Comet component needing reconciliation | `0883c9217f2bd9e67d3148cae814d5fc30fc5dae` |
| Approved outage wording, PR #45 | `28bb2897b55cb2bbbdacedb6146184d05175150c` |

The composition/comet heads are NOT accepted for mounting. Earlier posts with different full hashes are superseded. Their matching seven-character prefixes are insufficient evidence of identity.

## Endpoints and scope

All routes authenticate first. Derive tenant, actor and effective access from the server session; reject caller-supplied tenant, role, actor, workspace, path or receipt fields. Use named graph operations only. Return `Cache-Control: no-store` on every response, and clients use `cache: 'no-store'`. No receipt/key cache or earlier overview may satisfy confirmation.

| Method and path | Effective access | Request | Response |
| --- | --- | --- | --- |
| GET `/api/studio/ideas` | Current OWNER or READER | No query/body | 200 graph `AVAILABLE` or `EMPTY` overview, unchanged; 503 graph `UNAVAILABLE` |
| GET `/api/studio/ideas/:ideaId` | Current OWNER or READER | Validated ID only | 200 `AVAILABLE` verified detail including `text`; 404 `NOT_FOUND`; 503 `UNAVAILABLE` |
| POST `/api/studio/ideas/:ideaId/import` | Current OWNER only | `{idempotencyKey, expectedRevision}` | 200 reconciled `IMPORTED`; 409 `CONFLICT`; 422 `REJECTED`; 503 `UNAVAILABLE` or `UNCONFIRMED` |
| POST `/api/studio/ideas/:ideaId/import-status` | Current OWNER only | Same immutable `{idempotencyKey, expectedRevision}` | Read-only reconciliation: 200 reconciled `IMPORTED` or `NOT_FOUND`; 409 key conflict; 422 invalid request; 503 unavailable/unconfirmed |

`import-status` performs no mutation despite POST: the key stays out of URLs, and body/key logging is disabled. `NOT_FOUND` means no matching receipt was observed at that read; it does not prove an earlier in-flight request cannot commit later. Re-check never calls `importIdea`.

401 anonymous / invalid session and 403 disallowed session must perform zero body reads, graph probes, file reads and writes. Validate authorized bodies before graph/file work: JSON only, bounded 16 KiB, exact allowlisted keys, key `/^[A-Za-z0-9_-]{8,64}$/`, idea ID `/^[a-z0-9][a-z0-9-]{0,63}$/`, expectedRevision a nonnegative safe integer. No query parameters on these routes. Malformed requests return 400. The current AGENT session is denied. Intended five-role profile labels do not change effective policy. Serena remains a reader until a separately reviewed migration.

The existing loopback reader proxy cannot authorize import. Never silently replace it with an owner token. A reviewed, explicitly selected loopback owner rehearsal proxy/session may enable Add; normal reader mode must remain unable to write. Production authentication remains outside this contract. This credential path is a required adapter deliverable, not an established capability.

## Receipt and server reconciliation

Accept exactly `{ideaId, sha256, workspaceId, importedAt, workspaceRevision, membershipId}`. Reject extra keys including `fileSha256`, `fileHash`, `witnessHash`, `nodeId`, `edgeId`. Validate lowercase 64-hex hash, strict UTC timestamp, positive safe-integer receipt revision and expected identities. A shape guard is not a persistence check.

The HTTP adapter must not forward raw graph `IMPORTED` as confirmed success. For a new write, replay, or read-only status result:

1. Obtain the candidate from the real tenant-scoped graph operation; never accept a caller-supplied receipt. Reconcile the key against the original idea, hash and expectedRevision fingerprint. The existing `importStatus` is only a receipt lookup and does not validate that fingerprint or membership by itself. Add a bounded read-only graph operation if necessary; do not use an import write as a read-only re-check.
2. After that operation completes, perform a NEW `ideaverseOverview` read in the same authenticated scope, using the verified current manifest. Require `AVAILABLE`, the expected workspace, exactly one entry for this idea, imported true, no integrity item for the idea, and exact agreement on idea ID, hash, membership ID and importedAt. The overview revision must be at least the receipt revision. The graph overview is responsible for exactly one consistent receipt and edge. Verify the candidate against the stored receipt including its own revision; overview revision alone cannot establish that field.
3. Only then return HTTP `IMPORTED`. Preserve the graph receipt verbatim. A replay is the same receipt; never invent a new timestamp, revision or membership. An `ALREADY_IMPORTED` conflict may carry its graph receipt for re-check, but a bare conflict must not trigger animation.
4. If a write may have reached the database but the receipt/read-back is missing, malformed, inconsistent, unavailable or throws, return `UNCONFIRMED` and a bounded reason. Never turn a post-write uncertainty into `REJECTED`, `NOT_FOUND`, or a claim that nothing was saved. No automatic write retries.

The card still performs its own fresh overview read after an HTTP success before `onAdded`. This protects against stale UI responses; it does not replace server authorization or graph integrity checks. Current consistency is established at the completed read, not guaranteed against later database mutations. Raw graph-writer compromise is not solved by receipt shape or hash matching.

## Retry and UI ownership

Capture `{ideaId, idempotencyKey, expectedRevision}` from a fresh overview when creating an attempt. Pin the entire tuple for the life of that attempt, including retries, close/reopen reconciliation and lost replies. Never re-read expectedRevision under an existing key. A new attempt after a stale-revision result requires an explicit fresh overview and a NEW key. Preserve unresolved attempts in the shell/session controller; opening a new card must not silently abandon them and submit again.

Mount one `studio/IdeaCard`, with the reviewed strict parser and fresh-read confirmation. The scene owns comet motion/selection only; suppress/remove its duplicate import card and local import submission. The shell owns adapters and pending attempts. Only `onAdded(receipt)` after confirmation starts the pull/fade. Closing a card or leaving READY discards its stale callbacks; a fresh overview still refreshes membership after completion, so a committed file does not reappear. Emit at most one pull per idea/membership; ordinary already-imported refreshes need no success animation.

Add is allowed only in READY and with effective owner access. The server independently checks graph availability and guarded revision/metadata during import; a healthy probe is not sufficient authorization or a promise that the write will work. Leaving READY disables Add and invalidates late success effects. Read-only inspection may remain available with an honest state.

For uncertain results use: **“Could not confirm whether this was saved. Re-check the cube before retrying.”** Offer read-only Re-check and explicit same-tuple Retry. Remove “Nothing was saved” from the mounted flow. Proven refusal can say “The server refused this request.” Do not accept arbitrary callback-provided success/failure prose as evidence.

## Verified idea text and animation time

Graph overview is metadata, and deliberately has no `text`. The detail route joins an allowlisted manifest entry to its file on the SERVER, checks actual bytes and SHA-256 immediately before returning UTF-8 text (1–30 words), and checks fresh graph metadata/integrity for that ID. No arbitrary path, browser file fetch or generated fallback text. Source mismatch is unavailable and never displays the file as verified. Keep text out of licensing evidence. The shell passes this verified detail to the single card; a missing detail disables import from that card until resolved. This is a new adapter/graph read implementation, not a property already provided by `loadIdeaManifest` (which verifies but does not return text).

Use wall-clock UTC only for the 48-hour selection window. Use a monotonic clock for active flight/pull deltas, clamp each accepted delta to 1000 ms, and reset the baseline on pause, hidden tab, resume and clock discontinuity. A 90-second suspension/jump must not consume 90 seconds of active flight or finish every pull at once. Hidden/paused/reduced-motion states consume zero flight time. Preserve the 60-second ACTIVE flight requirement and inspected-comet hold; reduced motion remains stationary with explicit Next.

## Exact-head acceptance before mounting

Tests must exercise the real graph adapter on a disposable FalkorDBLite database, not a callback that returns invented receipts. Cover happy save, same-key replay, stale revision/new attempt, lost reply after commit, read failure, key reuse, double submit, close/switch/phase change, and restart/re-check. Forged nonpersisted receipt, duplicate receipt, deleted edge, changed workspace/membership/timestamp/hash/revision and alias-only/conflicting-alias payload must never reach Added or pull. Re-check must make zero writes. Prove denied requests make zero probes/body/file reads. Prove no-store and effective reader denial on the actual proxy path.

Browser review on the exact combined head at 1920×1080 and 1280×800 must show accessible single-card inspection, verified text, all agent controls reachable, source highlighting preserved, zero hidden fixture nodes, readable unclipped node/edge labels, real import/read-back/pull/replacement, honest outage/recovery and reduced motion. A fixed position table keyed by exact returned fixture IDs is acceptable; it must not create nodes absent from the response. Arbitrary nodes use a documented fallback without a general collision-free claim.

Independent exact-head review, graph evidence meta-review, combined-candidate reconciliation and human release authority remain required. Unit counts and component GOs do not accept the mounted journey.
