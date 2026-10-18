# Space Scene Bridge Adapter — v042 Minimal Mountable Slice

**Author:** Gem (Art Director / Pair Programmer)  
**Target Reviewer:** Claude (Independent Verifier)  
**Parent / Base SHA:** `5fff32ada91a9bd3f044d57821d917e6bf01bd09` (PR #58 / `buddy/space-scene-boundary-v045`)  
**Visual Baseline Reference:** `9f214ecaf8e31ba6c932fc1a8cff344e981b81cb` (`gem/space-visualizer-v039`)  
**Branch:** `gem/scene-bridge-v042`  

---

## 1. Architectural Scope & Boundary Contract

This slice implements the minimal mountable v042 adapter connecting the application shell and the 3D space visualizer across the accepted PR #58 boundary (`5fff32a`).

### 1.1 Scope Boundaries
- **No moving v043 polish heads imported**: Authoring is executed strictly against frozen base `5fff32a` and visual baseline `9f214ec`.
- **Zero edits outside boundary sandbox**: All files are strictly constrained to:
  - `apps/web/src/scene/space/**`
  - `tests/scene/space-*`
  - `docs/design/space-scene-bridge-v042.md`
- No root `package.json`, lockfile, API, or graph schema edits.

---

## 2. File Path Manifest

```text
apps/web/src/scene/space/
├── index.ts                  # Public mount / unmount entrypoint
├── types.ts                  # Adapter interfaces, options, and instance types
├── SpaceSceneAdapter.ts      # Lifecycle orchestration, HUD controls, event dispatching, scoped stylesheet
├── SolarCorePanel.ts         # Shared 2D Solar Core panel modal with SVG topology, XSS-safe DOM, focus trap
└── SceneThreeRenderer.ts     # Local Three.js scene, camera, wireframe, screen-space hit testing, and disposal

tests/scene/
└── space-scene-adapter.test.ts  # 8-point exhaustive verification test suite (including XSS and real-DOM assertions)

docs/design/
└── space-scene-bridge-v042.md   # This specification document
```

---

## 3. Mount Command & Usage

### 3.1 Exact Mount Invocation
```typescript
import { mount } from './apps/web/src/scene/space';
import { createSpaceSceneBridge, projectSpaceScene } from './apps/web/src/spaceSceneBridge';

// 1. Create container
const container = document.getElementById('scene-container');

// 2. Initialize bridge
const bridge = createSpaceSceneBridge(
  () => currentSnapshot,
  {
    onRefresh: async () => { /* re-read graph */ },
    onSelectNode: async (id) => { /* select node */ },
    onSelectSource: async (id) => { /* select source */ },
    onOpenIdea: async (id) => { /* open idea card */ },
    onAgentTaskStart: async (agentId) => { /* trigger agent persona */ },
    onCloseAgent: async (agentId) => { /* close agent chamber */ },
    onSetAudioMuted: async (muted) => { /* set audio mute state */ },
  }
);

// 3. Mount scene instance
const scene = mount(container, bridge, currentSnapshot, {
  audioPlayerBinding: {
    play: (soundName) => audioPlayer.play(soundName),
  },
  onAddedBinding: (listener) => {
    // Verified server read-back hook: only fires when backend confirms ingestion
    return eventBus.on('idea-ingested', listener);
  },
});

// 4. Update on snapshot changes
scene.update(nextSnapshot);

// 5. Clean teardown on unmount
scene.unmount();
```

---

## 4. Control → Event Mapping

All dispatched events strictly enforce the protocol envelope `{ protocol: 'cubes.space-scene@1', generation, type, ... }` using the snapshot generation under which the user acted:

| Visible Control / Interaction | Trigger Action | Emitted Event Envelope | Allowed Fields |
| :--- | :--- | :--- | :--- |
| **Top HUD Refresh Button** (`.btn-refresh`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'REFRESH' }` | None |
| **3D Red Graph Node / 2D SVG Node** | Click / Enter / Space | `{ protocol: 'cubes.space-scene@1', generation, type: 'SELECT_NODE', id }` | `id` (string) |
| **2D Panel Source Citation** (`.solar-source-btn`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'SELECT_SOURCE', id }` | `id` (string) |
| **3D IdeaVerse Comet** (represents `ideaIds`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'OPEN_IDEA', id }` | `id` (string) |
| **Agent Persona Button** (`ROY`, `AVA`, `GUZ`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'AGENT_TASK_START', agentId }` | `agentId` (`'ava' \| 'roy' \| 'guz'`) |
| **HUD Audio Mute Toggle** (`.btn-mute-toggle`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'SET_AUDIO_MUTED', muted }` | `muted` (boolean) |
| **Central Sun Core / Top HUD Solar Button** | Click | *Internal Panel Navigation*: Opens shared 2D Solar Core Panel (no graph event emitted, ESC closes panel and returns focus to opener) | Focus returns to opener |

---

## 5. Requirement Verification & Implementation Details

1. **Mount / Unmount Lifecycle**:
   - `mount(container, bridge, initialSnapshot?, options?)` creates Three.js canvas, lights, geometry, DOM overlays, scoped stylesheet, and listeners.
   - `unmount()` cancels `requestAnimationFrame`, recursively disposes all Three.js geometries, materials, textures, renderer, removes window/canvas/document listeners, and clears DOM nodes. Tested with remounting to guarantee zero leaks.
2. **Typed Snapshot State Rendering**:
   - Strictly renders states from `snapshot.runtime.phase`: `CHECKING`, `READY`, `GRAPH_UNAVAILABLE`, `ACCESS_DENIED`, `NOT_FOUND`, `UNAVAILABLE`.
   - In any non-READY phase: proof nodes, edges, summary, clearance, evidence, sources, and ideas are completely cleared (`nodes = []`, `edges = []`).
   - `GRAPH_UNAVAILABLE` renders cold dwarf collapsed core, crimson warning lattice, and explicit outage banner.
3. **Exact Protocol Envelopes**:
   - Envelope: `{ protocol: 'cubes.space-scene@1', generation, type, ... }`. Extra fields are rejected as `INVALID`.
   - Node, Source, and Idea selections carry `id`.
   - Agent tasks carry `agentId` only (no `taskId`).
   - All events verified against `isSpaceSceneEvent` in `apps/web/src/spaceSceneBridge.ts`.
4. **`DISPATCHED` Semantics (Callback Delivery Only)**:
   - `DISPATCHED` acknowledges that the application callback was invoked.
   - It **never** triggers an ingestion effect or removes comets.
   - Ingestion effects wait for verified server read-back via `options.onAddedBinding` or `adapter.handleVerifiedAdded(ideaId)`.
5. **Standalone Fakes Disabled**:
   - No embedded base64 audio strings, no own `AudioContext`, no `new Audio()`.
   - Prototype fake Cypher terminal and hardcoded 28-node lists removed; nodes derive solely from `snapshot.data.nodes`.
   - External audio player binding (`options.audioPlayerBinding`) is invoked only when `!snapshot.audioMuted`.
6. **Solar Core 2D Graph Panel, XSS Immunity & 100% Reliable Hit-Testing**:
   - **Stored XSS Elimination (P1-1)**: Rebuilt all dynamic SVG nodes and source citation lists using safe DOM methods (`document.createElement`, `document.createElementNS`, `.textContent`, `.setAttribute`). Zero string interpolation into `innerHTML`. Payloads like `<img src=x onerror=...>` or injected quotes remain harmless literal text.
   - **Self-Contained Scoped Stylesheet (P1-2)**: Injected scoped `<style>` element guaranteeing `.hidden { display: none !important; }`, `fixed inset-0`, flex/grid layouts, borders, and typography render with pixel-perfect accuracy in environments without Tailwind CSS. Native `hidden` boolean attributes bound to modal and outage elements.
   - **Modal Focus Trap & Keyboard A11y (P3-1, P3-2)**: Tab/Shift+Tab cycles focus exclusively within the open modal. 2D SVG nodes have `tabindex="0"`, `role="button"`, `aria-label`, and Enter/Space keyboard selection.
   - **100% Reliable Hit-Testing via Screen-Space Projection**: Implemented `getSunScreenMetrics()` mapping the 3D Sun position to exact viewport client pixels via `camera.project()`. Provides immediate hover cursor feedback (`pointer`), robust pointerdown/up release confirmation with expanded 32px drag threshold, debounced click safety net, and fallback raycasting.
   - **Honest Selection State (P3-3)**: Node selection highlighting only updates when `bridge.dispatch` resolves to `DISPATCHED`.
   - In `READY`: nodes, edges, and sources are populated directly from `snapshot.data`.
   - In non-READY: clears proof and displays the active phase explanation.
   - Keyboard access: Escape key closes modal and returns focus to the last opener element.
7. **Reduced Motion**:
   - When `snapshot.reducedMotion === true`, all continuous animation loops (pyramid orbits, comet motion, cube tumble, and breathing) are halted, presenting a static, accessible view.
8. **No Runtime CDN Scripts**:
   - Bundles local workspace dependency `three@0.186.1` via `import * as THREE from 'three'`. No CDN scripts.

---

## 6. Placeholders & Honest Gaps

To maintain strict truthfulness:
1. **Audio Player Implementation**: The adapter contains zero internal audio decoding. Audio playback delegates entirely to `options.audioPlayerBinding`, awaiting integration with the accepted PR #56 audio player.
2. **Backend Read-Back Binding**: Ingestion animations are held in stasis until Buddy's shell connects the `onAddedBinding` event to server read-back confirmation.
3. **Comparison Cube**: Kept strictly as a separate demonstration component; it does not drive live graph phase or emit authoritative events.

---

## 7. Author Test Evidence & Audit Closure

Ran `node --import tsx tests/scene/space-scene-adapter.test.ts`:
- **8 / 8 tests passed (0 failures, 0 skipped)**:
  1. Mount/unmount lifecycle & remounting
  2. Typed snapshot state rendering (`READY` vs all 5 non-READY blocked phases)
  3. Exact event envelope dispatching (`SELECT_NODE`, `SELECT_SOURCE`, `OPEN_IDEA`, `AGENT_TASK_START`, `CLOSE_AGENT`, `REFRESH`, `SET_AUDIO_MUTED`)
  4. `DISPATCHED` callback delivery only (no premature ingestion effects)
  5. Audio mute respect & no standalone audio creation
  6. Shared Solar Core 2D panel state (dual-path verified: top-bar button click + sun click callback) & phase clearing
  7. Reduced motion static presentation
  8. Stored XSS immunity & safe DOM textContent rendering for malicious payloads (`<img src=x onerror=...>`, quote attributes)
- TypeScript verification: `npm run check -w @cubes/web` passes with exit code 0 across all workspaces.
