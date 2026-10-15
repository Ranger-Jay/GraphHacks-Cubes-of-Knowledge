# Cubes of Knowledge: Scene Architecture & Animated Character Specification (v008.00)

**Author:** Gem (Art & Design Lead, Independent Meta-Auditor)  
**Lane Allocation:** `v008.00`, branch `gem/scene-cube-v008`  
**Governing Issue:** [#5](https://github.com/Ranger-Jay/GraphHacks-Cubes-of-Knowledge/issues/5)  
**Contract Alignment:** `CompanyCubeScene` (`apps/web/src/components/SceneMount.tsx`, `packages/contracts/src/index.ts`)

---

## 1. Character Identity & Visual Attributes

The five canonical characters defined in the Jay-approved brief are preserved with visual fidelity and architectural truth separation:

| Character | Classification | Circuitry / Attire | Visual Archetype & Head Styling | Authority / Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Roy** | Cybernetic Agent | Gold (`#FFD700`, `#FF8F00`) | Structured cyber-military cut, gold circuit traces along jawline and temples | Operations & Strategy |
| **Ava** | Cybernetic Agent | Purple (`#B388FF`, `#7C4DFF`) | **Approved asymmetric hairstyle** (long sweeping cyber-tresses on left, cropped undercut on right revealing circuit ports) | Graph & Evidence Reasoning |
| **Guz** | Cybernetic Agent | Green (`#00E676`, `#00B0FF`) | Angular geometric spikes, emerald circuit paths across cheekbones | Verification & Audit |
| **Kanny** | Human Authority | Studio vest & collar (`#4E342E`) | Natural skin tones (`#E0AC69`), dark brown wavy crop; visibly human | Studio Owner (Approval Authority) |
| **Serena** | Human Authority | Emerald knit scarf (`#1B5E20`) | Natural skin tones (`#F5D0C5`), auburn shoulder-length hair; visibly human | Reader (Verification & Audit) |

> [!IMPORTANT]
> **Server Identity Boundary (Law 19):** Visual avatars are illustrative interface artifacts. Presentation never conveys privilege. Human authority roles (Kanny owner vs. Serena reader) and approval execution gates are strictly enforced by server-side authenticated session tokens in the API, never inferred from client-side visual assets.

---

## 2. Animation Architecture: Honest 2.5D Layered Portrait Rig

Per explicit directive: *"Choose a practical animation approach and report it honestly: a rigged character or a carefully layered portrait treatment. Do not claim a full 3D facial rig unless one actually exists."*

The implementation uses an **SVG/CSS-driven Layered 2.5D Vector Rig**:
1. **Breathing Group:** Shoulders and collar plates translate vertically ($\Delta y = 1.2\text{px}$) with subtle scale ($1.015\times$) on staggered sinus cycles (Roy: 4.2s, Ava: 3.8s, Guz: 3.4s).
2. **Eye Group:**
   - **Blinking:** Natural non-uniform eyelid compression (`scaleY(0.08)`) lasting 120ms every ~3.5–5.0 seconds. Staggered across agents to prevent synchronous blinking.
   - **Gaze / Glances:** Subtle micro-saccades ($\pm 1.2\text{px}$) every 6–8 seconds.
3. **Head Group Transformations:**
   - **Nod (Affirmative):** One restrained up-and-down nod ($\Delta y = 4\text{px}, \theta = +3^\circ \to -1^\circ \to 0^\circ$ over 450ms).
   - **Shake (Negative):** One restrained side-to-side head shake ($\Delta x = \pm 3.5\text{px}, \theta = \pm 3.5^\circ$ over 450ms).
   - **Attentive (Help):** Gentle head tilt ($\theta = +2.8^\circ, \Delta y = -0.8\text{px}$).
   - **Focused (Task Start):** Posture squares up ($\Delta y = +1\text{px}$) with focused brow line.
4. **Mouth Group & Viseme Synchronization:**
   - Five distinct mouth visemes: `rest` (neutral line), `smile` (welcoming curve), `viseme_open` (open vowel), `viseme_round` (rounded 'O'), and `viseme_narrow` (fricative/teeth).
   - Speech scheduler interpolates visemes at 40ms resolution based on exact phrase phoneme timelines.
   - Mouth movement stops immediately when speech finishes or when interrupted.

---

## 3. Interaction Dialogue Triggers & Event Handlers

| Trigger Event | Spoken Phrase | Expression & Movement | Event Guard & Truth Boundary |
| :--- | :--- | :--- | :--- |
| **First Pyramid Open** | *“Greetings, Commander”* | Welcoming smile + gentle nod | Fires only once per session (`hasGreetedSession`). Toggling closed and re-opening does not repeat. |
| **Avatar Click (When Open)** | *“how may I help”* | Attentive expression + small head tilt | Opening pyramid does NOT trigger avatar click phrase. Rapid clicks cancel ongoing speech (no queue buildup). |
| **Affirmative Trigger** | *“yes”* | One restrained up-and-down nod | Scripted demonstration; does NOT grant authorization or simulate approval. |
| **Negative Trigger** | *“no”* | One restrained side-to-side head shake | Scripted demonstration; UNKNOWN remains distinct. |
| **Task Start (Verified)** | Predictable 3-phrase cycle:<br>1. *“I'll get right on it.”*<br>2. *“Task beginning”*<br>3. *“Underway.”*<br>*(Optional: “On it.”)* | Focused expression + posture acknowledgment | **Strictly blocked during database outage (`status !== 'AVAILABLE'`).** Denied, queued, or unverified tasks never announce start. |

---

## 4. Audio Engine & Caption Accessibility

1. **Default Mute State:** Audio starts muted by default per brief instructions (`isAudioMuted() === true`).
2. **Explicit User Enable:** The user must explicitly click the high-contrast Audio Toggle button to activate voice output.
3. **Captions for Every Utterance:** A dedicated live caption banner (`role="status"`, `aria-live="polite"`) renders exact text and speaker identity (`[Ava]: “how may I help”`) for all phrases regardless of mute state.
4. **Distinct Agent Pitch/Timbre:**
   - Roy: Pitch `0.9`, Rate `0.95` (resonant, calm military cadence).
   - Ava: Pitch `1.15`, Rate `1.05` (crisp, analytical clarity).
   - Guz: Pitch `1.0`, Rate `1.1` (energetic, rapid audit cadence).
5. **Debounce & Queue Prevention:** Rapid clicks immediately invoke `window.speechSynthesis.cancel()` and clear active timers, preventing speech overlap or queue buildup.

---

## 5. Company Cube & Graph Evidence Presentation

The central isometric Company Cube implements the visual representation of FalkorDB graph evidence:
- **Luminous Blue Lattice:** Cyan `#00E5FF` isometric wireframe bounding box with subtle rotation ($\theta = 0.4^\circ$, 12s cycle).
- **Restrained Sun Reference:** Amber-white radiant glow positioned in the upper backdrop; intensity capped so labels and evidence nodes remain high-contrast and readable.
- **Red Graph Evidence Nodes:** Glowing nodes (`#FF1744`, `#FF5252`) representing verified graph entities (`Release`, `Track`, `License`). Clickable and keyboard-selectable (`onSelectNode`).
- **Graph Proof Edges:** Verified relationships (`INCLUDES`, `VALID_FOR`, `COVERS`) plotted between evidence coordinates.
- **Outage Fracture (`status === 'UNAVAILABLE'`):**
  - All graph-proof edges and evidence nodes are completely removed.
  - Wireframe dashes dim to `#37474F`.
  - Honest fracture banner displays: *"GRAPH UNAVAILABLE — Evidence severed. Zero proof displayed."*
  - All agent task-start buttons are hard-disabled.

---

## 6. Accessibility & Performance Verification

- **Reduced Motion:** Fully honors `reducedMotion` prop and `prefers-reduced-motion: reduce`. Disables idle breathing, blinking, pupil saccades, head nods/shakes, and cube rotation. Transitions are instantaneous. Usable controls and captions remain 100% functional.
- **Text Alternative:** Semantic `<nav aria-label="Scene text alternative">` and accessible lists render complete state for assistive technology.
- **Host Performance:** Measured unit test suite execution: **15 tests pass in ~715ms** on Node 22/24 (Windows).

---

## 7. Synchronous Concurrency Lock & Task Truth Enforcement (`v008.005`–`v008.007`)

1. **Synchronous In-Flight Lock:**
   - React state updates (`setIsTaskStarting(true)`) are asynchronous. Rapid synchronous clicks occurring within the same event loop tick before the component re-renders could previously call the async handler multiple times.
   - To eliminate this race condition, `AgentPyramid` employs a synchronous mutable reference lock (`isTaskStartingRef = useRef(false)`).
   - In `handleTaskStart`, `isTaskStartingRef.current = true` is asserted synchronously immediately before any `await`. Subsequent clicks in the same tick or before promise settlement observe `isTaskStartingRef.current === true` and return immediately.
2. **Deterministic Settlement & Recovery:**
   - A `try ... finally` block guarantees that `isTaskStartingRef.current = false` and `setIsTaskStarting(false)` execute on both successful promise resolution and rejection/error, restoring the button for subsequent user actions.
3. **Executable Regression Test Suite:**
   - Test 14 mounts the component and dispatches three rapid synchronous clicks against an unresolved pending promise, verifying that `onAgentTaskStart` is invoked exactly once and unlocks after settlement.
   - Test 15 validates that if the task promise rejects, the synchronous lock releases cleanly in the `finally` block, permitting subsequent retry attempts.

