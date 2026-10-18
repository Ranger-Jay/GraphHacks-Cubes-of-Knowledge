# Mounted mechanical integration candidate — v046

This candidate mounts the reviewed space adapter in the real React shell. It is a
mechanical integration review head, not the final visual renderer or a release.

## Exact inputs

| Component | Source pin | Composition |
| --- | --- | --- |
| Application boundary | `5fff32ada91a9bd3f044d57821d917e6bf01bd09` | Ancestor of adapter; event capture fix retained |
| Minimal renderer/adapter | `0cce5b6aa9a7906eaca13862c1ed2359b650e2de` | Integration parent; independent adapter GO, carried limits below |
| Shutdown test helper | `79c0e04d34b0db9fbd7dd88b78fbd86266027787` | Three separate source commits replayed; no assertion weakened |
| Recorded player and masters | `9ae0956dfce16a3520b27094ffbb16c7b95ee13e` | Exact audio.ts, audioClips.ts, public/art/audio and AUDIO_RUNTIME_v036.md; legacy scene/UI changes are excluded |
| Final standalone art | `a3c51fd27e76483e28f189c5e8003ed27704fa78` | Preserved reference only; not substituted for the reviewed adapter |

The audio input is a deliberate path selection, not a merge of its older application
snapshot. The accepted player regression cases are retained in a separate composed
test file. All 29 shipped WAV byte hashes match the accepted clip catalog.

## Actual bindings

`main.tsx` supplies `MountedSpaceScene` and a real HTTP-backed `IdeaStudioController`
to `App`. The home page links to `/#/releases/rel-wad`. The shell continues to own
fresh API generations, graph probe, authorized analysis and recovery detection.

- `spaceSceneHost.ts` projects current analysis and keeps authoritative snapshots
  private. Every renderer view is a clone. A new request or any observed phase
  transition advances the event generation, preventing pre-outage replay after
  recovery even if the request counter did not change.
- Graph nodes/edges and source records come from the current returned analysis.
  Node clicks update the shell selection; source clicks use the existing cited-source
  focus/highlight helper. The Sun and Solar Core button open the same reviewed panel.
- Idea inspection uses the ordinary reader HTTP client. Up to three current waiting
  IDs prefer the last 48 hours, otherwise the latest timestamps. A loading pool retains
  settled records. Clicking a comet only opens the reviewed single card.
- The controller alone emits the subscription used for verified `onAdded`. That path
  follows its strict receipt and fresh server read-back checks. The adapter is notified
  and the shell requests fresh analysis. Delivery-only DISPATCHED never confirms a write.
- Owner import/status requests are configured for the opted-in loopback alias. The
  default effective access remains UNKNOWN, so Add is disabled until a reviewed
  server-derived capability response is bound. No browser persona grants authority.
- Recorded WAV playback starts muted. Unmute requires browser transient user
  activation; the existing player enforces clip, phase and recovery gates. Agent
  buttons open a labeled voice preview, not a completed model task. The shell adds
  an actual close control; Escape closes it while focus is inside that panel.
- Approved outage notices are explicitly selectable only in GRAPH_UNAVAILABLE.
  Recovery clips require a fresh authorized READY after an observed graph outage;
  Guz has no recovery master. Phase changes cancel disallowed audio; unmount mutes
  and cancels playback. The adapter's unapproved chime/shockwave binding is absent.
- Missing WebGL canvas produces a visible message directing users to the panel and
  graph text view. Renderer unmount disposes its owned loops/listeners/geometry.

## Reproduction

```sh
npm ci
npm run verify
npx tsc -p tests/web/tsconfig.json --noEmit
git diff --check
```

Configure the server-only reader token, graph connection, evidence key and durable
witness as described in README.md. Do not seed an existing/shared database. Start
the API and Vite dev server, open `/#/releases/rel-wad`, and retain the exact review SHA.
The Vite preview server alone is not a production API or session solution.

Author checks on this tree:

- Bootstrap verify: 243 tests, 240 pass, zero fail, three explicit local graph-launcher
  skips; check and build pass. Web-test typecheck and diff check pass.
- Separate isolated TCP vendor-server graph proof:
  `python3 scripts/ci-graph-tests.py` under FalkorDBLite 0.10.0 passes 103/103,
  zero skips. Runtime reports Redis 8.6.2 and graph module 41803. This is local
  embedded/binary graph proof, not Cloud/Docker parity or a mounted browser journey.
- `CUBES_STARTUP_GRAPH=1 npm run verify` does **not** pass on this host: the Python
  redislite launcher raises RedisLiteServerStartError before the live import/stop
  cases run. A direct socket probe confirms this host denies AF_UNIX creation with
  EPERM; the direct TCP vendor launcher above succeeds. Mandatory startup,
  shutdown/reconnect and exact-head CI still require independent reproduction.
- A local Chromium download failed with a truncated/invalid archive. No local
  mounted browser, playback, click, focus or accessibility pass is claimed.

New host tests exercise phase-generation invalidation and renderer mutation isolation.
The legacy speech-synthesis fixture was reconciled to actual approved WAV playback:
ordinary clips only in READY; outage clips only in GRAPH_UNAVAILABLE; no unrecorded
synthesis fallback. These changes do not weaken an expected status or skip a test.

## Remaining gates

Independent exact-head browser and live startup/outage/reconnect review remains due.
Verify one current Solar panel, node/source inspection, old event rejection, one card,
unconfirmed-import handling, mute/gesture, cancellation/recovery, reduced motion,
keyboard access and mount/unmount in the actual shell. Preserve the final-appearance
port as a separately reviewed delta; the current minimal renderer is not art parity.

Owner capability binding and actual import/fade journey, complete comet timing/labels,
final art, model question execution, durable agent memory recovery, application-to-Cloud
connectivity, Cloud engine parity, production sessions and deployment remain unproved.
No model answer, import success, merge, hosted seed, deployment or release is implied.
