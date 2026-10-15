# Scene speech gate v020

Branch `mara/scene-gating-v020` starts at scene-state `99f915180b66b8f71fed65364aaaa1efc6adf5af`, which contains frozen PR #27 `d8c9938ff82b957ddbdeaf09f799c92ff168e6ec`. This revision does not move those heads.

Owned behavior is `AgentPyramid.tsx`, `audio.ts`, and `dialogue.ts`.

- Normal greeting, help, affirm, deny, and task-start speech run only when `runtime.phase` is `READY`.
- A missing `runtime` prop fails closed to `CHECKING`. That is not a database-outage claim and it does not permit speech.
- `GRAPH_UNAVAILABLE` cancels current speech and shows only the approved per-agent notice from issue #29. Captions still appear when audio is muted.
- `ACCESS_DENIED`, `NOT_FOUND`, `UNAVAILABLE`, and `CHECKING` cancel normal speech and use their own short captions. They do not say FalkorDB is disconnected.
- A task acknowledgement plays only if the phase is still `READY` after the handler returns.
- `scene/index.tsx` is not wired here. Buddy owns passing `runtime` through that boundary.

No new endpoint, merge, deployment, or hosted seed.
