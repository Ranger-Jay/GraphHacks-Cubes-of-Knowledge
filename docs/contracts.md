# Shared contract v1

Development-only v038 adds an opted-in loopback owner alias for the existing IdeaVerse HTTP
routes; it does not change API authorization or the default reader proxy. See
[owner-rehearsal transport](owner-rehearsal-v038.md). Effective access is served by
`GET /api/session/access` (see [session access](session-access-v048.md)); UI binding remains held.

The v026 IdeaVerse read/import/reconciliation endpoints are specified in [IdeaVerse HTTP contract](ideaverse-api-v026.md), with exported transport types in `packages/contracts/src/ideaverse.ts`. Partial candidate v034 includes the reviewed API adapter and real manifest, but keeps the browser import binding disabled. Transport is reconciled with the accepted graph: an ambiguous workspace has `revision: null`, and imports may reject `AMBIGUOUS_IDENTITY`. A raw graph receipt or local shape check is not confirmed HTTP success. See [partial candidate status](integration-v034.md).

Types: packages/contracts/src/index.ts. These are transport types, not runtime input validation or authorization. Coordinate contract/dependency edits before changing a consumer. The table distinguishes shipped candidate routes from planned writes/recovery. The types alone do not prove implementation or combined-head acceptance.

| Route | Contract | Success | Failure / enforcement |
| --- | --- | --- | --- |
| GET /api/health | Bootstrap metadata | 200 BOOTSTRAP, ready=false | Process liveness only; never graph readiness |
| GET /api/graph/status | GraphStatusResponse; shipped, unauthenticated | 200 AVAILABLE after real query | 503 UNAVAILABLE / CONNECTION_FAILED or QUERY_FAILED; exposes graphName but no release/evidence/token fields. Factory without a probe retains NOT_IMPLEMENTED |
| GET /api/session/access | Session access; shipped | 200 OWNER (canReadIdeas, canImportIdeas) / READER (canReadIdeas only) | 401 anonymous, 403 agent/other; no token, principal id, tenant, or caller-supplied field returned |
| GET /api/releases/:releaseId/analysis | AnalysisResponse; shipped | 200 AVAILABLE, clearance ESTABLISHED/GAP/UNKNOWN | 503 UNAVAILABLE; empty current evidence/paths/actions; scoped reads |
| POST /api/approvals | ApprovalRequest → ApprovalResponse; writer disabled | Planned: 201 RECORDED / matching replay, not shipped | Shipped: 401 anonymous, 403 reader/agent, 503 owner fail-closed; no approval is recorded |
| POST /api/handoffs | HandoffRequest → Handoff; planned, currently 404 | 201 with server-derived identity, scoped approved state | 401/403/409/503; unauthorized proposed next step must not become approved |
| GET /api/handoffs/:handoffId | Handoff; planned, currently 404 | 200 authorized session recovery | 401/403/404/503; server enforces tenant/agent/human scope |

Identity is server-authenticated and not accepted from a caller-supplied role, actor, or tenant field. Kanny is synthetic owner; Serena is limited reader; Roy/Ava/Guz are scoped agents. Shipped session slots bind configured opaque tokens to Kanny/owner, Serena/reader and Roy/agent. Owner/reader can read analysis; the agent slot is authenticated but denied that read. Analysis tenant comes only from API_TENANT_ID. These are local server-configured sessions, not a production login/issuance system. The Vite dev proxy injects only the server-side reader token; production web authentication remains unimplemented. Missing route is 404, not a fabricated product result.

Handoff requests and returned handoffs require `releaseId`. The API validates a nonempty identifier and authorizes that release under the server-derived tenant and agent scope before saving or recovering state. Recovery returns the same release scope alongside its revision; possession of an ID never grants access. Earlier payloads without this field must be rejected by runtime validation rather than assigned a default release. Consumer branches must reconcile this required-field change before integration.

Every mutation needs an expected revision and bounded idempotency key. Same key + same authorized request replays safely; same key + different request rejects. Current cut changes invalidate old approvals. Atomic compare/update or equivalent tested serialization must protect concurrent writers. Approval decisions never establish music license facts by themselves.

Evidence sources include immutable SHA-256 plus exact excerpt/offsets. The graph lane chooses and documents offset units consistently (recommended Unicode code-point offsets). UI displays those source records; model text cannot substitute for them. Coverage must support any asserted missing path: incomplete source coverage stays UNKNOWN. STALE evidence can be shown as stale, never current clearance.

Available analysis returns actual graph node/edge IDs, typed relationships and source reference IDs. Unavailable analysis contains no live-success paths, evidence or actions. If a request fails, clear current scene evidence; retain only clearly labeled historical views if separately designed later. Selecting a node must inspect a source or path actually returned in the analysis.

## Scene boundary

The scene lane exports a component from apps/web/src/scene/index.tsx named CompanyCubeScene. Props: `{ data: SceneData; onSelectNode: (id: string) => void; reducedMotion: boolean }`. The UI lane owns fetch/session/error panels and passes sanitized current data. Scene owns 3D/render interaction only; it does not query FalkorDB, issue privileged mutations or invent evidence. Types are in @cubes/contracts. Decorative particles may remain on outage; graph proof edges may not.

## Space-scene integration boundary

The v045 space-scene integration slice adds an **unmounted in-process** snapshot/event boundary:
`SpaceSceneSnapshot`, `SpaceSceneEvent` and `SpaceSceneHandlers` from `@cubes/contracts`, with
projection and dispatch in `apps/web/src/spaceSceneBridge.ts`. It does not replace the existing
`CompanyCubeScene` entrypoint yet. See [space-scene boundary](space-scene-boundary-v045.md).
Its generation and membership guards are presentation defenses, not server authorization or
an authenticated cross-window transport. No import or successful-write event is accepted.

## Graph boundary

packages/graph belongs to the graph lane. Implement named parameterized read operations (health and release analysis first); privileged mutations use explicit narrow graph operations, never arbitrary model-produced Cypher. Use the installed official client and verify its actual API against its version; the existing Python embedded demonstration is a separate runtime, not proof of TypeScript/Docker parity. Document clean runtime errors and close behavior.

## Agent boundary

Real model calls are disabled in default configuration. Tools execute bounded named queries, return source-linked results, and preserve UNKNOWN/UNAVAILABLE. Agent tool execution, model identity, memory persistence and authorization require actual evidence. An unconfigured model is an explicit not-implemented state, never a synthetic conversational success. Offline unit fixtures remain labeled and cannot satisfy live graph/agent acceptance.
