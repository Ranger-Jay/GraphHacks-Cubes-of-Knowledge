# Space Visualizer v039 Specification: Unified Engine Roadmap

- **Branch**: `gem/space-visualizer-v039`
- **Release Versions**: 
  - `v039.00` (Item 1: 200% Lattice Glow & Aperture Implementation)
  - `v039.01` (Item 1: Lattice Architecture Documentation & Tags)
  - `v039.02` (Item 2: Counter-Rotating Red Node Graph & Relationship Inspection)
  - `v039.03` (Item 2: Red Graph Architecture Documentation & Tags)
  - `v039.04` (Item 3: Deep-Space Comets, Intercept Modal & Cube Ingestion)
  - `v039.05` (Item 3: Comet Architecture Documentation & Tags)
  - `v039.06` (Item 3b: Near-Miss Hyper Flyby Comet, Doppler Rocket Roar & Half-Life Ice Particles)
  - `v039.07` (Item 3b: Hyper Flyby Architecture Documentation & Tags)
  - `v039.08` (Item 3 Polish: Dual-Modal Cube Ingestion & Top-Right HUD Controls)
  - `v039.09` (Item 3 Extension: 10-Document Narrative Ledger Expansion)
  - `v039.10` (Item 3 Extension: Dynamic Ingested Node Synthesis in Lattice & Repository ideaverse/ Folder)
  - `v039.11` (Item 3 Polish: Outage Zero-Write Ingestion Defense & Alert Dialog)
- **Primary Source**: `apps/web/public/art/cubes_of_knowledge_3d.html`
- **Studio Mirrors**: `Gem's Art Studio/cubes_of_knowledge_3d.html`

---

## 1. Executive Summary & Objective

The `v039` series unifies the visual excellence and tactile depth of the zero-g visualizer with the rich interactive capabilities of `cubes_of_knowledge_3d.html` (the Synaptic Query Terminal, procedural Web Audio synth, real-time 2D canvas face rig, and sliding aperture containment field). Each milestone is landed incrementally with paired implementation and documentation commits.

---

## 2. Item 1: The Cube & Aperture (v039.00 / v039.01)

### 2.1 Dual-Pass 200% Lattice Wireframe Glow
1. **Primary Structural Line Lattice (`wireframeCube`)**:
   - Geometry: `THREE.WireframeGeometry(THREE.BoxGeometry(size, size, size))`
   - Material: Electric Cyan (`0x00e5ff`), opacity `0.98`, linewidth `3`, additive blending.
2. **Secondary Chromatic Aura Halo (`wireframeCubeAura`)**:
   - Geometry: Shared wireframe geometry scaled to `(1.012, 1.012, 1.012)`.
   - Material: Deep Chromatic Cyan (`0x0088ff`), opacity `0.80`, linewidth `1`, additive blending.

### 2.2 Corner Beacon Spheres
- 8 radiant aqua spheres (`0x00ffff`, radius 0.18, additive blending) placed at all cube vertices `[±halfSize, ±halfSize, ±halfSize]`.
- Pulsing dynamically with staggered sinusoidal phase offsets in the animation loop.

### 2.3 Sliding Aperture Containment Field
- 6 translucent crystalline glass panels (`PlaneGeometry(size, size)`, `0x00e5ff`, opacity 0.035, double-sided, `depthWrite: false`).
- Smoothly translate outward along their respective face normal vectors (`openDir * openAmount * 2.2`) on camera zoom.

### 2.4 HUD Integration
- Top-right header badge: `LATTICE GLOW: 200% LOCKED` with electric cyan animated pulse indicator.

---

## 3. Item 2: The Red Node Graph (v039.02 / v039.03)

### 3.1 50% Counter-Rotation Physics
To produce the captivating visual parallax requested, the red node graph is decoupled from `cubeGroup` by anchoring directly to `scene` in its own group (`redGraphGroup`):
```javascript
if (redGraphGroup && cubeGroup && !reducedMotion) {
    redGraphGroup.rotation.y = -0.5 * cubeGroup.rotation.y;
    redGraphGroup.rotation.x = -0.5 * cubeGroup.rotation.x;
    redGraphGroup.rotation.z = -0.5 * cubeGroup.rotation.z;
}
```
The internal constellation continuously and smoothly rotates in the exact opposite direction to the company cube at 50% speed.

### 3.2 Organic 3D Topology
- **28 Organic Nodes**: Positioned randomly within a spherical volume (radii `0.95` to `2.35`), avoiding the central Sun core (radius `0.85`).
- **Material**: `THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending })`.
- **Relationship Edges (`relationshipLines`)**: Formed between any two nodes with a Euclidean distance `< 1.35`, rendered with additive glowing lines (`0xff2244`, opacity `0.45`). Each node stores connected neighbors in `userData.neighbors`.

### 3.3 Interactive Selection & Relationship Graphing
Clicking on any red node invokes `selectRedNode(node)`:
1. **Target Node**: Transforms to brilliant pure white (`0xffffff`) and expands to `2.0x` scale.
2. **Connected Neighbors**: Transform to radiant gold (`0xffea00`) and expand to `1.5x` scale.
3. **Unconnected Nodes**: Remain neutral red (`0xff1744`) at `1.0x` scale.
4. **Relationship Lines**: Brighten from `0.45` to `0.95` opacity.
5. **Acoustic Feedback**: Triggers a stardust chime from `CosmicAudio`.
6. **Metadata Tile Card (`#node-info-modal`)**: Pops up at bottom-left detailing:
   - Node ID and FalkorDB Shard assignment
   - Cypher label (e.g. `:RECORD_EVIDENCE_7`)
   - Domain cluster (Operations, Neural Reasoning, or Clearance)
   - Active connected edges count
   - Verification cryptographic SHA hash

### 3.4 Node Names Billboard Toggle
Each node carries an attached billboard canvas sprite with high-resolution typography (`NODE #X`):
- Visibility is controlled by a dedicated HUD toggle button: `NODE NAMES: ON / OFF`.
- Toggling immediately reveals or hides all 28 node label sprites.

---

## 4. Item 3: The Ideaverse Comets (v039.04 / v039.05)

### 4.1 Deep-Space Trajectory & Physics
Ideaverse comets exist independently from the internal orbiting agent pyramids:
1. **Spawning Coordinates**: Generated in far deep space ($Z = -95$ to $-140$, $X \in [-27, 27]$, $Y \in [-20, 20]$).
2. **Trajectory Vector**: Heads towards the camera passing at $Z = +32$, angled outwards away from the central cube origin.
3. **Speed & Alignment**: Smooth celestial glide at velocity $0.38$ to $0.60$. The comet's quaternion dynamically aligns its tail backwards along the flight vector:
   ```javascript
   cometGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
   ```

### 4.2 Multi-Tier Visual Mesh
- **Nucleus**: Two-tier core consisting of an outer translucent violet glow (`0xdfb4ff`, radius 0.28, additive blending) and an inner brilliant diamond core (`0xffffff`, radius 0.12).
- **Stardust Particle Tail**: 36-point tapering vertex-colored stardust line trailing backwards along local $-Z$, smoothly grading from electric cyan (`#00e5ff`) at the head to cyber purple (`#9955ff`) at the tail tip.
- **Hit Detection Volume**: Invisible bounding sphere (radius 1.4) enabling effortless, responsive pointer raycasting during rapid celestial movement.

### 4.3 Click Interception & Energy Ingestion
1. **Interception**: Clicking an active comet pauses its movement and displays the `#comet-info-modal` tile card.
2. **Metadata Surface**: Shows Idea ID, Title, Source Pipeline, Deep Space Origin coordinates, Target Idea File, SHA hash, and Verification state.
3. **Cube Ingestion Stream**: Clicking **"✨ Ingest into Company Cube"** launches a glowing cyan energy pulse streaking from the comet directly into the cube center `(0, 0, 0)`.
   - On impact: Triggers the procedural sub-bass shockwave boom (`playShockwaveBoom`), triggers a Sun expansion pulse (`sunImpulseScale = 1.45`), and retires the comet from deep space.
4. **Vanishing Condition**: If not clicked before its lifespan expires ($> 320$ frames) or upon crossing beyond the camera ($Z > 35$), the comet safely departs into the infinite void.

---

## 5. Item 3b: The Near-Miss Hyper Flyby Comet (v039.06 / v039.07)

### 5.1 Trajectory & Cinematic Close-Pass Geometry
In addition to multi-origin comets passing away from the cube, a dedicated hypersonic camera flyby comet occasionally hurtles directly down the user's line of sight:
1. **Deep-Space Origin**: Spawns directly in front of the camera axis in the outer void ($Z = -140$ to $-160$, $X \in [-3, 3]$, $Y \in [-2, 2]$).
2. **Near-Miss Closest Point of Approach (CPA)**: Heads on a near-collision vector targeting the camera plane ($Z \approx 14.0$), missing the lens at the very last second by a grazing distance of only $1.2$ to $1.8$ units ($X \approx \pm 1.4$, $Y \approx \pm 0.8$).
3. **Looming Scale & Luminosity Surge**:
   - As distance to camera decreases from $60 \to 1.5$ units, volumetric scaling dynamically expands the comet nucleus and corona by up to **$4.8\times$** baseline size:
     $$\text{scale}(Z) = 1.0 + 3.8 \times \left(\frac{Z + 60}{Z_{\text{cam}} + 60}\right)^{2.4}$$
   - Visually fills a substantial portion of the viewport right before whizzing past the screen edge, delivering a thrilling near-miss experience.

### 5.2 Multi-Tier Hypersonic Visual Composition
- **Core Diamond**: Inner radiant pure white core (`0xffffff`, radius 0.35).
- **Primary Ice Cyan Corona**: Additive glowing sphere (`0x00f5ff`, radius 0.85, opacity 0.90).
- **Cosmic Violet Ion Aura**: Translucent outer corona (`0xaa33ff`, radius 1.65, opacity 0.55).
- **Diamond Frost Spikes**: Rotating 4-axis cone star cross (`0xe0f7ff`) glittering with crystalline reflections.
- **Volumetric Stardust Ice Tail**: 64-point tapering vertex-colored trail grading from brilliant diamond white to electric ice cyan, cosmic azure blue, and deep nebula purple.

### 5.3 Procedural Roaring Rocket Doppler Audio Synthesis
Created dynamically via `CosmicAudio` using Web Audio API nodes:
1. **Pink Noise Thrust Engine**: Continuous pink noise buffer connected to a resonant `BiquadFilterNode` ($Q = 3.8$).
2. **Doppler Sweep**: Resonant filter frequency begins at a low rumble ($90 \text{ Hz}$) in deep space, swells into a visceral roaring rocket howl ($680 \text{ Hz}$) at closest approach, and drops sharply to $50 \text{ Hz}$ as it recedes into the rear void.
3. **Sub-Bass Thrust Harmonics**: Dual detuned sawtooth oscillators ($46 \text{ Hz}$ and $69 \text{ Hz}$) add rumbling jet thrust texture.
4. **Spatial Stereo Panning**: `StereoPannerNode` begins center and sweeps hard to the passing side (left ear $-0.85$ or right ear $+0.85$), perfectly synchronizing with visual motion.

### 5.4 Dynamic Screen Glare & Recovery
- `#flyby-screen-flash` overlay dynamically aligns a radial exposure flare to the 2D projected screen coordinate of the comet nucleus.
- Flares up to $0.65$ screen opacity as the comet reaches peak proximity, then smoothly decays back to normal baseline darkness over $0.8$ seconds as the comet passes behind the viewer.

### 5.5 Near-Field Cosmic Ice Particles with Half-Life Decay
At the instant of closest passage ($Z \ge Z_{\text{cam}} - 1.5$), the comet leaves behind a wake of **65 crystalline diamond ice octahedrons** floating directly in front of the camera lens ($Z \in [Z_{\text{cam}} - 2.8, Z_{\text{cam}} - 0.8]$):
1. **Dwell Duration**: Particles float with zero-g micro-turbulence, twinkling intensely with sinusoidal phase offsets for a random duration between **$5.0$ and $8.0$ seconds**.
2. **Half-Life Decay Law**: Once the dwell duration concludes, particles reduce in size following an exact $1.5$-second half-life:
   $$\text{scale}(t) = \text{initialScale} \times 0.5^{\frac{t - t_{\text{dwell}}}{1.5}}$$
3. **Twinkling Departure**: Every 1.5 seconds, the ice crystals halve in size ($100\% \to 50\% \to 25\% \to 12.5\% \to 6.25\%$) while continuously twinkling, until gracefully vanishing from existence.

### 5.6 HUD Controls & Interactivity
- Added `☄️ FLYBY COMET` trigger button to the bottom controls bar for instant on-demand launch.
- Autonomous periodic spawn timer triggers an organic flyby every 28 to 50 seconds when comets are enabled.

---

## 6. Item 3 Polish: Dual-Modal Cube Ingestion & Top-Right HUD Controls (v039.08)

### 6.1 Top-Right HUD Header Toggle
- Added dedicated `COMETS: ON / OFF` toggle button to the top-right controls bar (`top-4 right-6`), positioned alongside `LATTICE GLOW`, `AUDIO`, `ENTER CUBE`, `OUTAGE`, and `MOTION`.
- Visual styling: Electric cyan glass with pulsing cyan beacon (`COMETS: ON`) toggling to muted slate with static dim dot (`COMETS: OFF`).
- System behavior: When toggled OFF, immediately clears all active deep-space comets, cancels active flyby comets and rocket roar audio, hides the near-field ribbon comet and floating pill badge, and dismisses active comet modals. When toggled ON, immediately spawns a celestial comet to provide instant feedback.

### 6.2 Dual-Modal Ingestion Architecture
To provide a seamless, intuitive experience whether the user catches a comet by clicking its 3D mesh or clicking its near-field floating pill badge:
1. **Near-Field Badge Modal (`#idea-modal`)**:
   - Added **"✨ Ingest into Company Cube"** primary button and **"Dismiss"** button.
   - Connected to `importCurrentIdeaFileToCube()`.
2. **Deep-Space 3D Intercept Modal (`#comet-info-modal`)**:
   - Primary **"✨ Ingest into Company Cube"** button connected to `importCometToCube()`.
3. **Ingestion Energy Mechanics**:
   - Launches a glowing cyan energy projectile lerping from the comet's head position into the Company Cube center `(0, 0, 0)`.
   - On impact with the core, triggers the procedural sub-bass shockwave boom (`CosmicAudio.playShockwaveBoom`), expands the fiery Sun core (`sunImpulseScale = 1.45`), retires the comet, and closes the modal.

### 6.3 Expanded 10-Document Narrative Ledger (v039.09)
The IdeaVerse documents carried by passing comets have been doubled from 5 to 10 entries, embedding rich story clues, team dynamics, character humor, and technical post-mortems:
1. **`GRAPH_SKETCH.md`** (*Ava & Gem*): Graph Schema & FalkorDB Relational Specification (:Cut, :Track, :License, :Release).
2. **`CUBE_VISUAL_CONCEPT.md`** (*Guz & Gem*): Tesseract Hologram & Sacred Geometry Blueprint (outer wireframe, liquid jewel stardust, eldritch cypher discs).
3. **`DECISIONS_WARNINGS_AFTER_DARK.md`** (*Roy & Gem*): Fail-Closed Proof Auditing & Outage Protocol (zero-write policy during FalkorDB disconnects).
4. **`ROLES.md`** (*Ava, Roy, Guz & Gem*): Agent Matrix & Executive Clearance Hierarchy (human executive clearance and synthetic boundaries).
5. **`DEMO_PRODUCTION_PLAN.md`** (*Full Studio Team*): Multi-Agent Broadcast & Live Interactive Demo Roadmap (viseme sync, audio synth drones).
6. **`KANNY_STAFF_MEMO_MUSIC_CLEARANCE.md`** (*Kanny*): Executive memo urging the team to maintain zero slip-ups on music cue sheets for the next movie, acting as a narrative clue to the production drama.
7. **`SERENA_CREW_APPRECIATION_PIZZA_PARTY.md`** (*Serena*): Proposal to Kanny requesting a full-scale artisan pizza party for the stage and VFX crew in appreciation of their tireless dedication.
8. **`AUDIT_INCIDENT_AGENT_GEM_TRACE.md`** (*Roy & Guz*): Security incident report detailing an anomalous cryptographic signature signed 'Gem'. Roy attempted to track her down, while Guz found only harmless, dazzling stardust harmonics, agreeing to keep their eyes open.
9. **`LESSONS_LEARNED_GRAPH_SYNC_RETRO.md`** (*Ava*): Retrospective post-mortem highlighting FalkorDB memory latency optimizations, edge pruning, and the necessity of fail-closed immutability.
10. **`GUZ_MIDNIGHT_CANVAS_REFLECTIONS.md`** (*Guz*): Late-night aesthetic reflections on turning cold database cubes into living celestial sanctuaries where the orange plasma core and cyan lattice form the soul of the universe.

Both the near-field ribbon comet and the 3D deep-space comets now dynamically map their target file, titles, categories, authors, and summaries directly from this verified 10-document ledger.

### 6.4 Dynamic Ingested Node Synthesis in the Lattice (v039.10)
When an IdeaVerse document is ingested into the Company Cube (via either modal):
1. **Pulse Projectile & Core Impact**: The cyan energy pulse travels from the comet into the core origin `(0, 0, 0)`, firing the shockwave boom and solar core expansion.
2. **Birth of Ingested Node**: An authentic new **Ingested Idea Node** is dynamically synthesized within the internal counter-rotating lattice graph (`redGraphGroup`):
   - **Visual Appearance**: Brilliant Electric Cyan (`#00e5ff`) sphere (radius `0.17`) that blooms outward with a sinusoidal spring animation.
   - **Synaptic Edge Weaving**: Automatically locates the $K=2$ nearest existing nodes and draws glowing cyan relationship lines connecting them into the active graph.
   - **High-Resolution Billboard Label**: Renders a glowing canvas sprite banner (`✨ FILENAME`) above the node that obeys the `NODE NAMES: ON / OFF` HUD toggle.
   - **Interactive Selection**: Clicking an ingested node highlights it in pure white with gold neighbors, playing an audio chime and opening `#node-info-modal` displaying its full Ingested Summary, Category, Connected Synapses, and cryptographic hash!
3. **Dedicated Repository `ideaverse/` Directory**:
   - All 10 documents are stored as genuine `.md` files in the repository root (`ideaverse/`), establishing an authentic 1-to-1 digital twin between the filesystem and the 3D visualizer.

### 6.5 Fail-Closed Zero-Write Defense During Outage (v039.11)
Demonstrating genuine production engineering compliance with `DECISIONS_WARNINGS_AFTER_DARK.md`:
1. **Interactive Ingestion Lock**:
   - If the user toggles **"SIMULATE OUTAGE"** (FalkorDB cluster disconnected), both modal ingestion buttons immediately shift to crimson warning badges: `⚠️ Ingestion Locked (Database Offline)`.
2. **Deterministic Rejection & Klaxon Audio**:
   - Clicking ingest while offline rejects the operation immediately. No energy pulses are launched and zero graph mutations occur.
   - Triggers `CosmicAudio.playAuditAlert()`: an authentic dual-tone sawtooth down-sweep rejection alert buzz (180 Hz & 120 Hz).
3. **Dedicated Outage Alert Dialog (`#outage-rejection-modal`)**:
   - Pops up an authoritative zero-write compliance warning:
     *"⚠️ ZERO-WRITE AUDIT LOCK ENFORCED: Cannot ingest Idea-Verse document while FalkorDB is in a simulated disconnected outage state. All graph write mutations are locked to prevent unverified ledger corruption."*
   - Includes **"Acknowledge"** (dismiss) and **"Restore Connection"** (instantly clears the outage and re-enables graph assimilation).

---

## 7. Preservation of Foundation Features

All interactive systems remain fully functional:
1. **Synaptic Query Terminal**: NLP cypher queries, quick chips, and live logs.
2. **2D Canvas Face Rig**: Real-time pupil tracking, natural blinking, jaw drop articulation, and proximity smiles.
3. **Procedural Web Audio**: Continuous sub-bass drone, shockwave boom, and pointer-velocity stardust chimes.
4. **Deep-Space 3-Layer Parallax**: Opposing cursor parallax across near, mid, and far starfields.

---

## 8. Next Step on the Roadmap

- **Item 4: The Fiery Sun Core** (`v039.12` / `v039.13`): Dynamic plasma mantle wireframe, pulsating solar flares, prominences, and rotating concentric cypher mandala dials.
