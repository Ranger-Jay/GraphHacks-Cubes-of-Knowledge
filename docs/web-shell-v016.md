# Web shell v016: single-screen layout and true scene state

Owner: web shell (`apps/web/src` outside `scene/`, plus outer `styles.css`). Branch `cora/visual-shell-v016`, built on frozen #27 `d8c9938` plus the type-only contract `99f9151` (`docs/scene-state-v019.md`). This is a candidate, not an acceptance.

## Phase mapping (`apps/web/src/sceneState.ts`)

The shell computes one `ScenePhase` from the CURRENT graph probe (`/api/graph/status`) and the CURRENT analysis read, then passes it across the scene boundary as `runtime: SceneRuntimeContext`. `/api/health` (BOOTSTRAP, `ready=false`) is process liveness and is not an input.

Precedence, first match wins:

| # | Phase | Condition |
| --- | --- | --- |
| 1 | `GRAPH_UNAVAILABLE` | the probe OR the read proves a failure: 503 `UNAVAILABLE` with reason `CONNECTION_FAILED` or `QUERY_FAILED` (one real detach yields both). Wins over 401/403, 404 and over an AVAILABLE read that raced with a failing probe. |
| 2 | `CHECKING` | the probe or the read has not completed, or no read was requested. |
| 3 | `ACCESS_DENIED` | read is 401/403 and the graph is not proven down. |
| 4 | `NOT_FOUND` | read is 404 and the probe is healthy (200 AVAILABLE, ready). |
| 5 | `READY` | authorized AVAILABLE read and a healthy probe, both from the active request generation. |
| 6 | `UNAVAILABLE` | anything else: API/network error, invalid body, `NOT_IMPLEMENTED`, a 404 or success without a healthy probe. No outage is asserted. |

An absent context fails closed to `CHECKING` on the scene side. Proof (evidence, clearance, paths, source records) and scene nodes/edges/selection exist only in `READY`; every other phase renders an empty proof panel and a cleared `SceneData`.

## Status area (`components/StatusArea.tsx`)

One `role="status"` / `aria-live="polite"` area with a text label plus a border style per phase, so meaning is never colour alone. Outage wording is "unavailable". Denied says the graph is not reported as unavailable; missing release says it is missing information, not an outage. The API's own message is shown as detail. "Recovered: a fresh authorized read succeeded after the graph was unavailable" appears only when a fresh generation reaches `READY` after the last SETTLED phase was `GRAPH_UNAVAILABLE` (`nextRecovery`); `CHECKING` is not settled and a Re-query click alone never produces it.

## Request generations (`loadAll`, `createRequestGate`)

Every load takes the next id for its sinks object; a completion may write only while its id is the newest. A slow old success cannot restore `READY` or repopulate proof after a newer request failed, even if the older load was never cancelled. The id is exposed as `data-generation` for review; the contract type carries only `phase`.

## Layout

At 1100px and wider the scene (cube, agents, human authorities) sits beside a side column holding the status area and the current-cut result. Below that the columns stack. A short-screen block (`max-height: 1000px`) tightens outer chrome and the scene's own spacing so everything fits at 1280x800; it selects scene class names from outside and does not edit `scene/`, so a scene CSS rename can break it. Proposed actions, returned path and source records are collapsed `<details>`; the node text alternative is collapsed. A source link opens its collapsed ancestors before focusing the record. The internal graph name, check time and request id live in "Technical details".

Measured with real headless Chrome (see PR): document height equals the viewport (no page scroll) at 1920x1080 and 1280x800 in READY, outage and the other states; cube, agents and the evidence list are inside the viewport. The side column scrolls internally for the collapsed sections, never the page.

## Interim guard (removed on the combined candidate)

The #33 head hid `.cube-outage-overlay` from `styles.css` unless the shell phase was `GRAPH_UNAVAILABLE`, because `CompanyCube` drew its outage overlay for any non-AVAILABLE data. On the combined candidate branch `CompanyCube` reads `runtime.phase` (wired in `scene/index.tsx`), so the guard rule is removed there. On #33 alone it is still required.

## Not done here (other owners) and limits

- `scene/index.tsx` (Buddy) does not declare or consume `runtime` yet; the shell passes it as an extra prop and no scene file was edited. Scene art, agent speech gating and the fixed outage notices (#29, Mara) are separate; agent buttons still render in non-READY phases and the Ava control reads "Task Blocked (Outage)" even when access is denied.
- The phase refreshes on load and Re-query only; a database lost while the page sits open keeps showing `READY` until the next refresh.
- Screen-reader announcements, Firefox and Safari are not tested. Hosted FalkorDB is not exercised.
