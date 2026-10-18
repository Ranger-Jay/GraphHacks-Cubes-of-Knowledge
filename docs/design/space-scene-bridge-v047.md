# Space Scene Bridge Adapter — v047 Final-Appearance Port

**Author:** Gem (Art Director / Pair Programmer)  
**Target Reviewer:** Claude (Independent Verifier) & Buddy Main  
**Parent / Base SHA:** `0cce5b6aa9a7906eaca13862c1ed2359b650e2de` (accepted adapter slice from PR #59 composition)  
**Visual Baseline Reference:** `a3c51fd35f606e9ec19cb07a49ee1c2e4ef1e92d` (`gem/ui-fixes-post-freeze` / 4-mirror verified art)  
**Branch:** `gem/final-renderer-v047`  

---

## 1. Architectural Scope & Boundary Contract

This slice implements the **v047 Final-Appearance Port**, bringing the approved visual fidelity from the visualizer (`a3c51fd`) into the mountable adapter (`SceneThreeRenderer.ts`) without disturbing the accepted contract, event envelopes, or public lifecycle.

### 1.1 Strict Scope Boundaries
- **Strictly constrained to allowed paths**:
  - `apps/web/src/scene/space/**`
  - `tests/scene/space-*`
  - `docs/design/space-scene-bridge-v047.md`
- **Zero edits outside sandbox**: No edits to `main.tsx`, root package, lockfile, API, graph, or shell controllers.
- **Contract Preservation**:
  - Exact public adapter API maintained: `mount`, `update`, `unmount`, `getSnapshot`, `openSolarPanel`, `closeSolarPanel`, `isMounted`.
  - Dispatched events maintain exact envelope: `{ protocol: 'cubes.space-scene@1', generation, type, ... }`.
  - Zero standalone fakes: no fake Cypher execution, no synthetic node creation without snapshot presence, no local audio contexts or base64 clips.

---

## 2. Appearance Integration from `a3c51fd`

1. **Cosmic Starfield Particle System**:
   - 1,800-particle celestial starfield with depth distribution (25 to 80 radius), multi-hued stars (cyan, amber, diamond-white) creating authentic zero-G space depth.
   - Clean recursive disposal in `dispose()`.
2. **Cube Corner Nodes & Luminous Rails**:
   - 8 ruby-red corner spheres (`SphereGeometry(0.24, 16, 16)`) positioned at the cube vertices (`±size/2, ±size/2, ±size/2`).
   - Active electric-cyan wireframe in READY; switches to crimson/slate in GRAPH_UNAVAILABLE.
3. **Pulsing Solar Core Gyro Corona**:
   - Two counter-rotating gold corona rings (`TorusGeometry(1.2, 0.015, 12, 48)`) orbiting the sun mantle on dual axes, creating dynamic celestial gyroscopic depth.
4. **Protector Agent Pyramids**:
   - Dual-shell architecture: solid core cone + outer wireframe glyph shell + orbiting electron ring for each agent in their signature color:
     - **Roy**: Amber / Gold (`0xffb300`)
     - **Ava**: Violet / Magenta (`0x9333ea`)
     - **Guz**: Emerald Green (`0x10b981`)
5. **Lighting Architecture**:
   - Central solar `PointLight(0xffb300, 2.2, 25)` radiating from the sun core.
   - Subdued `AmbientLight(0x0f172a, 0.75)` providing realistic contrast on mesh surfaces.
6. **Comet Visual Enhancements**:
   - Glowing violet comet heads paired with trailing velocity vectors.
7. **Scoped CSS Residual Resolved**:
   - All classes in `#space-scene-adapter-styles` strictly scoped under `.space-scene-root` (e.g. `.space-scene-root .btn-refresh`, `.space-scene-root .outage-banner`) to eliminate bare document-wide selectors noted in Boons meta-audit.

---

## 3. Control Map & Interaction Fidelity

| Visible Control / Interaction | Trigger Action | Emitted Event Envelope | Allowed Fields | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Top HUD Refresh Button** (`.btn-refresh`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'REFRESH' }` | None | Dispatches refresh |
| **3D Graph Node / 2D SVG Node** | Click / Enter / Space | `{ protocol: 'cubes.space-scene@1', generation, type: 'SELECT_NODE', id }` | `id` (string) | Highlights locally ONLY on DISPATCHED |
| **2D Source Citation** (`.solar-source-btn`) | Click / Enter | `{ protocol: 'cubes.space-scene@1', generation, type: 'SELECT_SOURCE', id }` | `id` (string) | Safe textContent |
| **3D Idea Comet** (`ideaIds`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'OPEN_IDEA', id }` | `id` (string) | Opens idea |
| **Agent Persona Buttons** (`ROY`, `AVA`, `GUZ`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'AGENT_TASK_START', agentId }` | `agentId` (`'ava' \| 'roy' \| 'guz'`) | Emits AGENT_TASK_START |
| **HUD Audio Mute** (`.btn-mute-toggle`) | Click | `{ protocol: 'cubes.space-scene@1', generation, type: 'SET_AUDIO_MUTED', muted }` | `muted` (boolean) | Toggles !audioMuted |
| **Central Sun / Top Solar Button** | Click | *Internal Panel Navigation* | None | Opens shared 2D Solar Core Panel |
| **Escape Key [ESC]** | Keydown | *Internal Panel Navigation* | None | Closes 2D Solar Panel & restores focus |
| **CLOSE_AGENT** | *API Only* | `{ protocol: 'cubes.space-scene@1', generation, type: 'CLOSE_AGENT', agentId }` | `agentId` | **UNBOUND in UI** |

---

## 4. Verification Evidence & Quality Gates

1. `tests/scene/space-scene-adapter.test.ts`: 8 / 8 tests passing.
2. `tests/web/space-scene-bridge.test.ts`: 14 / 14 tests passing.
3. Full scene test suite (`npm run test:scene`): 53 / 53 tests passing across 6 test files.
4. TypeScript static analysis: `npm run check -w @cubes/web` passes with 0 errors.
5. Zero memory leaks across 25 mount/unmount cycles; starfield, lights, coronas, and corner meshes cleanly disposed.
