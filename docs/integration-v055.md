# Early combined owner-capability and talker candidate — v055

This candidate combines the accepted mounted foundation with the independently
reviewed v049 repair and v052 offline/browser talker scope. It is an integration
review candidate, not a release. Accepted #60 remains frozen as a fallback.

## Inputs

| Input | Exact source head | Composition |
|---|---|---|
| Mounted renderer/access foundation #60 | `adacbe736f886c234f4a9ad60383d7d2f8c25578` | Ancestor, unchanged |
| Text-model wiring #61 | `ec1fae2d58919ce1b0bb44e907ecc3f88a6f8fd0` | Parent; offline/browser GO, live provider blocked |
| Repaired studio capability binding v049 | `193c68f6457d2cfd828acf6696c11e5eaa1e23b6` | Twelve v049 commits replayed; earlier v048 replays excluded because #60 already contains that endpoint/transport |

The component v049 GO resolves stale OWNER on panel unmount/remount, terminal
disposal and StrictMode. It does not itself establish the combined import path.
The v052 GO establishes actual browser/API/graph behavior using a labeled provider
double, not a live OpenRouter completion. There is no transfer of exact-head
acceptance to this composition; an independent reviewer must reproduce it.

## Composition resolution

One App.tsx conflict occurred while replaying v049.04: v052 adds the keyed
TalkPanel directly after AnalysisView; v049.04 passes accessStore to StudioPanel
in the adjacent line. The resolution retains BOTH reviewed behaviors. No new
authorization, provider, graph, model or scene logic was introduced. Subsequent
v049 repair commits replayed cleanly. The lockfile is the reviewed v049 lock,
including exact jsdom 26.1.0 and @types/jsdom 27.0.0 development dependencies.
No runtime dependency, root version or script change was introduced by composition.

## Actual scope

- A current authorized READY analysis permits graph/source inspection and a
  user-requested text explanation when a real capped provider is configured.
- The studio capability store now reads the server-derived capability. An
  explicitly opted-in local owner rehearsal may enable Add; ordinary reader
  access remains reader-only. Persona/graph role labels do not grant authority.
- Import success must still pass the controller's receipt and fresh membership
  read-back path. Only its confirmed event reaches the renderer/refresh host.
- Model explanations default to unavailable. Provider secrets remain server-side;
  recorded WAV previews are separate from model execution and generated prose.
- Existing recorded voice mute/phase/recovery behavior remains present.

Not included here: v053 browser read-aloud (#62), v051 reproducible IdeaVerse CLI,
v054 approved-art preservation work, persistent agent memory, hosted connectivity,
production sessions or deployment. The existing IdeaVerse seeding function still
needs the separately reviewed CLI slice before README-only fresh setup populates
the 100 ideas. Do not claim that this head fixes that packaging gap.

## Verification and remaining gates

Author checks:

```sh
npm ci
npm run verify
npx tsc -p tests/web/tsconfig.json --noEmit
git diff --check
```

Separate local real TCP graph regression uses the pinned FalkorDBLite environment
with `scripts/ci-graph-tests.py`. Author bootstrap tests may retain three explicit
AF_UNIX launcher skips on this host; those are not real startup/reconnect proof.
Report actual counts in the publication packet. Independent mandatory startup,
browser/API/graph import and combined model-panel behavior remain required on the
exact published head. Use disposable local data only; never seed a shared/hosted
database to satisfy a test.

Priority browser cases: owner-capability fresh GET across leave/return; reader and
denied access; Add/import pending -> real server read-back -> Added; duplicate and
unclear outcomes; capability loss during import/read-back; graph outage/recovery;
source jump; explicit talk request with scoped citations; late talk cancellation
on re-query/outage; existing voice mute and recovery. A provider double must stay
labeled. Real OpenRouter completion/model slug/usage/latency/quality remain blocked
until one small authorized inference runs on the configured API host.

Record from `http://127.0.0.1:5173`, not a different Origin, and use Vite dev plus
the actual API. Neither vite preview nor a production bundle supplies sessions.
Keep all real credentials outside source, screenshots, logs and comments.

No merge, hosted write, deployment, paid sweep, acceptance or release is implied.
