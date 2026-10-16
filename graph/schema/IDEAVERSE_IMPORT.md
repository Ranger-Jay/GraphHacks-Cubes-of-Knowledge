# IdeaVerse metadata and persisted import (v023, issues #38 and #40)

Graph-lane operation only. The API route, owner authorization, and the comet/card UI belong to other lanes. Studio-domain labels, outside the licensing evidence witness.

## Manifest contract (proposed to the asset owner; the loader enforces it)

`graph/seed/ideaverse/manifest.json`: `{ "version": string, "ideas": [ { id, filename, path, byteCount, sha256, submittedAt, touchedAt, synthetic: true, origin, licenseStatus } ] }`.
- `id`: `^[a-z0-9][a-z0-9-]{0,63}$`, unique. `filename`: `^[a-z0-9][a-z0-9._-]{0,80}\.txt$`, unique. `path` must equal `graph/seed/ideaverse/files/<filename>`.
- `submittedAt`/`touchedAt`: explicit UTC `YYYY-MM-DDTHH:MM:SS[.mmm]Z`. These are authoritative; reading, animating or importing never changes them.
- The file must exist, match `byteCount` and `sha256`, be UTF-8 with no control characters and have 1 to 30 words. Any violation rejects the whole manifest (`MANIFEST_INVALID`); nothing is partially trusted. The loader does not require exactly 100 ideas; that count is the asset owner's test.

## Graph model

| Label | Role |
| --- | --- |
| IdeaFile | Metadata of one idea (id, filename, path, byteCount, sha256, submittedAt, touchedAt, `classification: 'proposal'`, synthetic). Not a fact, license or approval |
| Workspace | The cube workspace `ws-wad-cube` with its own integer `revision` (starts 0). Never a release revision |
| ImportReceipt | The persisted result of one import (keyHash, request fingerprint, ideaId, sha256, importedAt, workspaceRevision, membershipId) |

`(IdeaFile)-[:DEFINED_IN]->(StudioSource ideaverse manifest)` and `(IdeaFile)-[:IMPORTED_INTO {id, receiptId}]->(Workspace)`. Importing adds only membership; the idea keeps its single identity and no file is copied. `seedIdeaverse` sets the revision only when it creates the workspace, so a re-seed never resets the revision, never un-imports an idea and never edits a receipt.

## `importIdea(client, repoRoot, {tenantId, ideaId, idempotencyKey, expectedRevision})`

Tenant comes from the server's session, never the request. The request names an allowlisted idea id only: no text, path, tenant or actor. The function loads and verifies the manifest and the file, then issues **one write statement** whose guards are: tenant on both endpoints, `workspace.revision = expectedRevision`, every stored field the overview checks (hash, filename, byte count, `submittedAt`, `touchedAt`) equals the verified manifest, idea not already a member, key not already used. The same statement bumps the revision, creates the receipt and the membership edge. The graph serializes writes, so concurrent requests cannot both pass the guards; no row returned means nothing changed.

| Result | Meaning |
| --- | --- |
| `IMPORTED` (`replayed` false/true) | Durably persisted; `replayed: true` returns the original receipt, with no new node, edge, timestamp or revision |
| `CONFLICT KEY_REUSED` | Same key with a different idea or expected revision |
| `CONFLICT STALE_REVISION` (+`currentRevision`) | The workspace moved; refresh and retry with a new key |
| `CONFLICT ALREADY_IMPORTED` (+ receipt) | The idea is already a member under another key |
| `REJECTED` | `INVALID_REQUEST`, `UNKNOWN_IDEA`, `SOURCE_MISMATCH` (any stored field differs from the manifest), `NOT_SEEDED` |
| `UNAVAILABLE` | `CONNECTION_FAILED`, `QUERY_FAILED` or `MANIFEST_INVALID`; never a success |

An ambiguous attempt (timeout, dropped connection) is reconciled with `importStatus(tenantId, key)` (the persisted receipt, or `NOT_FOUND`) and a fresh `ideaverseOverview`; a retry with the same key replays. `ideaverseOverview` reads metadata, membership and workspace revision in one query, re-verified against the manifest: a stored hash or metadata that differs withholds that idea with an integrity item. The comet pool must exclude `imported` ideas.

**When an idea counts as `imported`.** Only when it has exactly one `IMPORTED_INTO` edge with the id the import writes and exactly one `ImportReceipt` for the idea; the edge's `receiptId` is that receipt and the receipt names the same membership, workspace and idea; the receipt's hash equals the **current** verified manifest hash; and its `importedAt` and `workspaceRevision` are well formed. Two idea nodes with one id, or a second workspace node, make the state ambiguous: they are flagged, never served or counted (v023.16; the read returns internal node ids so identical nodes are not merged by the aggregation). A membership without a receipt, a receipt without a membership, duplicate edges or receipts, mismatched ids and a receipt for different content are each withheld with a specific integrity reason and never counted. `seedIdeaverse` refuses (throws, naming the ids) when a manifest hash differs from an existing receipt for that idea; changed content needs a new idea id.

## Boundaries and limits

- **Not the licensing witness.** The workspace revision is separate from the release revision; imports leave the evidence witness state hash, signed bindings and every licensing answer unchanged (tested). Nothing here bypasses or resets the witness.
- **Authorization is the caller's.** The graph operation assumes an authenticated owner. Reader and agent denial, and any "browser role" field, are API behavior and must be tested there.
- **Receipts are not MAC'd.** A party with graph write credentials could forge a membership or receipt. That matches the existing trust model for studio data (server-only graph credentials); it is not protected by the ledger. Signing receipts with the evidence key is possible later and is not claimed here.
- **Seeding.** There is no database uniqueness constraint; prefer one seeder per tenant. An independent probe saw no duplicates under concurrent seeds, which is evidence, not a guarantee.
- **Independently verified so far (Boons, `f750ae0`):** guarded-write behavior, graceful restart persistence and three hard-kill trials with no torn state; residual UNKNOWN is the sub-second acknowledged-write window of the engine's AOF default. The follow-up fixes (v023.09-.12) need their own independent review. Not proven here: API wiring, UI.
