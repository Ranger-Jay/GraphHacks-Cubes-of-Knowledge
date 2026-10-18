# Space-scene application boundary — v045

## Scope

This slice starts from `1e6a33cabd6cbee45bf35212c8cc43c42ea9d379` and adds a small
in-process application/scene boundary. The entrypoint is not switched. No visual asset,
API, graph, recorded audio player, dependency or server configuration changes here.
The standalone visualizer's fake query/import behavior must not be presented as live.

Exports from `@cubes/contracts`:

- `SPACE_SCENE_PROTOCOL`: `cubes.space-scene@1`.
- `SpaceSceneSnapshot`: generation, runtime, detached current scene data, summary,
  clearance, evidence, sources, current waiting idea IDs, reduced-motion preference,
  audio mute state and recovery authorization.
- `SpaceSceneEvent`, `SpaceSceneHandlers`, `SpaceSceneDispatchResult`.

Application helpers are `projectSpaceScene` and `createSpaceSceneBridge` in
`apps/web/src/spaceSceneBridge.ts`. The contract is **not** a `postMessage`, iframe,
network, credential or user-authentication protocol. A cross-window host would require
its own exact origin/source validation and lifecycle design before use.

## Projection

The application supplies its existing `deriveScenePhase` result and same-generation
authorized analysis. Do not derive the live phase from a decorative comparison cube,
local visualizer controls, connection captions, or model text.

Call `projectSpaceScene` whenever current shell/controller inputs change. Missing or
invalid runtime means CHECKING. READY without an AVAILABLE analysis becomes UNAVAILABLE.
All non-READY views contain no current graph nodes, edges, selection, source records,
evidence, summary, clearance or waiting idea IDs. Recovery requires explicit application
authorization and an available READY analysis; the default is false. Reduced motion and
mute state survive blocked phases. This helper does not play audio or decide recovery.

The projection reuses `toSceneData`: dangling edges and selections absent from the
returned node set are excluded. It clones the rendering view so the renderer cannot
mutate the shell's source arrays. This does not establish cryptographic provenance;
the graph/API and witness checks retain that responsibility.

Waiting `ideaIds` must come from the reviewed controller's current pool, excluding
already imported entries. This slice implements no IdeaVerse reads or effective-access
discovery. The existing controller/card retains import permission, confirmation,
ambiguity, pinned-retry and read-back ownership.

## Event dispatch

Every event has `protocol`, `generation` and `type`. Use the generation from the view
under which the user acted. Do not relabel a saved old event with the latest generation.

| Event | Additional field | Application handler | Guard |
| --- | --- | --- | --- |
| REFRESH | none | onRefresh | Current generation; requests a new read, never sets READY |
| SELECT_NODE | id | onSelectNode | READY, available proof, ID in current nodes |
| SELECT_SOURCE | id | onSelectSource | READY, available proof, ID in current sources |
| OPEN_IDEA | id | onOpenIdea | READY, available proof, ID in current waiting pool; opens the existing card only |
| AGENT_TASK_START | agentId | onAgentTaskStart | READY and available proof; server/tool authorization still required |
| CLOSE_AGENT | agentId | onCloseAgent | Any current phase, so closing/cancellation remains possible |
| SET_AUDIO_MUTED | muted | onSetAudioMuted | Any current phase; unmuting does not authorize playback |

Only `ava`, `roy`, `guz` are accepted for `agentId`; these select a persona, not an
authenticated identity. Unknown fields and verbs are rejected. There are no role,
tenant, Cypher, receipt, import, ADDED, simulation-state or graph-write event fields.
IDs are nonempty strings up to 256 characters; generation is a nonnegative safe integer.

Dispatch captures the supplied event with `structuredClone` before validation. All
validation, membership checks and callback arguments use that captured copy, so an
accessor cannot change an ID between the check and the call. Proxies, throwing getters
and other uncloneable payloads return INVALID without reading application state or
calling a handler. The exported shape predicate alone does not capture a caller's
object; do not use it to validate an object and later dispatch the original directly.

Create one bridge for a mount, supplying a getter for the **current application-owned
snapshot**, not a getter closing over its first READY view. Each dispatch re-reads that
snapshot, then checks generation, phase and membership. Handlers must use the existing
application/controller logic, including its own async cancellation and server checks.
Do not expose the authoritative getter's mutable state to the renderer as a shared store.

`DISPATCHED` means the handler was called and returned without throwing. It never means
an agent answered, a task succeeded, a graph write committed, or an idea can fade as
success. `UNBOUND` means no handler exists; disable or label that control accordingly.
`INVALID`, `STALE`, `BLOCKED`, `DISPOSED` and `FAILED` are not success or retry authority.
Callbacks receive no implicit retries. Call `dispose()` before unmount; the scene must
also remove its own listeners, render loops and media. In-flight handlers still require
the existing application's async-generation/disposal guards; disposal cannot undo a
request already sent.

## Verification and remaining integration

`tests/web/space-scene-bridge.test.ts` uses explicitly synthetic unit fixtures to attack
stale AVAILABLE data in every blocked phase, detached views, dangling paths, invalid
payloads and privilege fields, unknown IDs, old event generations, phase changes,
unbound callbacks, handler failure and disposal. It is not live graph or browser proof.

The v045.003 fix, v045.004 tests and v045.005 documentation address the independent
review's event accessor/Proxy finding at `7157f8bdc16cc799952954ee5577bb232735ef2c`.
Two added tests cover changing/initially invented IDs for all three selection verbs,
Proxies, revoked Proxies and throwing getters. Both tests fail against that prior
implementation and pass with event capture; the full boundary file has 14 tests.
This is author regression evidence, not independent acceptance.

Mount obligations from that review remain: advance generation on every phase change
(including outage and recovery) so pre-outage events cannot replay after reconnect;
keep authoritative snapshots separate from renderer-mutable views; enforce audio
gesture/mute rules in the shell and accepted player. These are not proved by this slice.

Still required: actual scene renderer/entrypoint binding; accepted audio player and
recovery gate; controller-driven comets/card; accessible keyboard/text and reduced-motion
behavior in the real scene; removal of unbound prototype success paths; independent
exact-head browser/graph reproduction. Cloud connectivity, model execution, persistent
agent memory and deployment remain separate unproved work. No merge/release is implied.
