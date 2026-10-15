# Scene phase to presentation matrix (review spec)

Status: independent spec written for the visual-first milestone. It states what a reviewer will assert on the integrated head; it is not an implementation and grants no acceptance. Sources: the type contract (`docs/scene-state-v019.md`), the shell mapping (`apps/web/src/sceneState.ts`, `docs/web-shell-v016.md`), the speech gating draft (PR #31) and Jay's rule that agents answer only with FalkorDB attached and that an unattached database produces fixed outage notices only.

## 1. Phase precedence (verified)

`deriveScenePhase(probe, read)` is checked by `tests/web/phase-oracle.test.ts`: every probe state (9) against every read state (13), 117 pairs, with a declared expectation per pair plus invariants. First match wins:

1. `GRAPH_UNAVAILABLE`: the probe or the read proves a failure (503 `CONNECTION_FAILED` or `QUERY_FAILED`; one real detach yields both).
2. `CHECKING`: the probe or the read has not completed.
3. `ACCESS_DENIED`: read is 401 or 403 and the graph is not proven down.
4. `NOT_FOUND`: read is 404 and the probe is healthy.
5. `READY`: authorized AVAILABLE read and a healthy probe.
6. `UNAVAILABLE`: anything else; no outage is asserted.

Checked by deliberately broken variants: each of six mutations of the mapping (swapped precedence, denial first, 404 without a healthy probe, READY without the probe, `NOT_IMPLEMENTED` as a failure, ignoring a failing read) makes the oracle fail.

## 2. What each phase must present

"Proof" means clearance, evidence, source records, graph path, and cube nodes, edges and selection.

| Phase | Cube and sun | Proof | Agent speech (greeting, Ask Help, Affirm, Deny, task acknowledgements) | Agent Start Task button | Notice copy |
| --- | --- | --- | --- | --- | --- |
| `READY` | healthy cube; real nodes and edges equal to the API response | shown | allowed (muted by default, captions on) | disabled with an honest label unless an application handler exists | none |
| `GRAPH_UNAVAILABLE` | damaged cube, dying grey-black core, no nodes or edges | none | none; only the approved fixed outage notice | disabled, label names the outage | fixed outage text; says "unavailable"; never "disconnected" or "severed" unless the probe proved it |
| `ACCESS_DENIED` | not the outage visual; no proof | none | none | disabled, label says access | access-denied text; must not say the graph is down |
| `NOT_FOUND` | not the outage visual; no proof | none | none | disabled, label says not found | missing-release text; must not say the graph is down |
| `CHECKING` | neutral loading composition, no proof | none | none | disabled | waiting text |
| `UNAVAILABLE` | not the outage visual; no proof | none | none | disabled | "information unavailable"; no confirmed-outage claim |

Cross-cutting rules for every phase: process liveness (`BOOTSTRAP ready=false`) is not a graph signal; a stale completion never restores `READY` or repopulates proof after a newer request failed; recovery is announced only after a fresh generation reaches `READY` following a settled `GRAPH_UNAVAILABLE`; no phase may claim agent execution, an approval, a recorded license or model reasoning; the text alternative and keyboard access for nodes remain; reduced motion removes decorative animation. A fixture or a toggle is never evidence of a connection.

## 3. Browser assertions on the integrated head

Real browser, shipped API, disposable local FalkorDB (see the `exact-head-review` browser proof): drawn nodes and edges equal the API response in `READY`; a real database stop gives `GRAPH_UNAVAILABLE` with zero nodes and edges, no clearance, no evidence and no ordinary agent speech; a missing token gives `ACCESS_DENIED` with the graph shown as available in the status area and no outage visual; a restart from saved data with no reseed, then a fresh read, returns `READY` and the same proof; Re-query during an outage does not announce recovery; labels in the table above are read from the DOM, and anything marked "to be confirmed by the scene owners" is recorded as an observation, not assumed.

## 4. Open items for the owners

- Labels and copy for `CHECKING` and `UNAVAILABLE` are not specified anywhere yet (PR #31 names Outage, Access and Not Found only).
- A database lost while the page stays open keeps showing `READY` until the next refresh; the film must state or avoid it.
- `scene/index.tsx` does not yet read `runtime`; until it does, the scene cannot use this matrix.
