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
  - `v039.12` (Item 4: Fiery Sun Core, Dynamic Plasma Mantle, Prominences & 3-Axis Cypher Mandala)
  - `v039.13` (Item 4: Solar Architecture Documentation & Tags)
  - `v039.14` (Item 5: Orbiting Protector Pyramids, Electron Shells, Flight Heading & Synaptic Arc)
  - `v039.15` (Item 5: Pyramid Architecture Documentation & Tags)
  - `v039.16` (Item 6: Internal Antigravity Liquid Starlight, Cursor Eddies, Pyramid Bow Waves & Outage Decay)
  - `v039.17` (Item 6: Liquid Starlight Architecture Documentation & Tags)
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

## 7. Item 4: The Fiery Sun Core (v039.12 / v039.13)

### 7.1 Multi-Layer Incandescent Plasma Mantle Architecture
To transform the static central sun into a living, breathing astrophysical engine:
1. **Dynamic Turbulent Plasma Mantle Wireframe (`sunSphere`)**:
   - Geometry: `THREE.SphereGeometry(0.96, 36, 36)`.
   - Base vertex coordinates cached in `sunMantleBaseVertices` (`Float32Array`).
   - In each frame of the render loop, every vertex is dynamically displaced along its normal vector using multi-frequency sinusoidal wave turbulence:
     $$r(t) = 0.96 + 0.048 \sin(3.5t + 4n_x + 3n_y) + 0.038 \cos(2.8t + 4n_z + 2.5n_x) + 0.022 \sin(5.2t + 6n_y)$$
   - Material: Radiant gold (`0xffb300`), wireframe, additive blending, opacity `0.85`.
2. **Secondary Inner Plasma Shroud (`sunPlasmaShroud`)**:
   - Geometry: `THREE.IcosahedronGeometry(0.84, 2)`.
   - Material: Incandescent orange (`0xff6d00`), wireframe, additive blending, opacity `0.62`.
   - Counter-rotates at $Y = -0.32t, Z = 0.20t$, creating an intricate multi-faceted combustion cage between mantle and core.
3. **Inner Radiant Fusion Core (`innerSun`)**:
   - Geometry: `THREE.SphereGeometry(0.68, 32, 32)`.
   - Material: Deep amber (`0xffd54f`), additive blending, opacity `0.94`.
   - Thermal breathing: Scales smoothly with sinusoidal expansion $1.0 + 0.045 \sin(2.4t)$.

### 7.2 Six 3D Magnetic Prominence Arcs (Solar Flare Loops)
Real-time coronal loops erupting from the solar chromosphere:
1. **Procedural 3D Arches**:
   - 6 distinct magnetic prominence loops positioned across diverse solar latitudes and longitudes.
   - Built with 5-point 3D spline curves (`THREE.CatmullRomCurve3`), launching from the surface ($r_0 = 0.90$), reaching high apices ($r \approx 1.44 \sim 1.62$), and anchoring back to the surface with lateral tilt.
2. **Dual-Layer Volumetric Tube Geometries**:
   - **Outer Plasma Sheath**: `THREE.TubeGeometry(curve, 28, 0.024, 8)`, colored fiery orange (`0xff6d00`), solar crimson (`0xff3d00`), or amber (`0xff9100`), with additive blending and opacity `0.78`.
   - **Inner White-Hot Core Filament**: `THREE.TubeGeometry(curve, 28, 0.009, 6)`, colored incandescent gold/white (`0xffd54f`, `0xffecb3`), opacity `0.95`.
3. **Magnetic Precession & Opacity Flicker**:
   - Each prominence precesses around the solar magnetic axis with alternating rotational directions.
   - Scale breathes with magnetic flux expansion: $\text{scale} = 1.0 + 0.09 \sin(3.0t + \phi_i)$.
   - Plasma opacity dynamically flickers with high-frequency solar combustion: $\text{opacity} = 0.65 + 0.25 \sin(f_i t + \phi_i)$.

### 7.3 Multi-Layer Coronal Glow & Coronal Mass Ejections (CME)
1. **Dual Inclined Coronal Rings**:
   - **Primary Golden Corona (`sunCoronaRing`)**: `RingGeometry(1.08, 1.58, 64)`, tilted at $X = \pi / 3$, color `0xffb300`, opacity `0.45`.
   - **Secondary Fiery Corona (`sunCoronaRing2`)**: `RingGeometry(1.15, 1.72, 64)`, tilted orthogonally at $X = -\pi / 3, Y = \pi / 6$, color `0xff6d00`, opacity `0.35`, counter-rotating at $-0.28t$.
   - **Torus Magnetic Prominence Loop (`sunTorusLoop`)**: `TorusGeometry(1.22, 0.035, 16, 64)`, color `0xffe082`, opacity `0.65`.
2. **Coronal Mass Ejection Shockwaves (`triggerCoronalMassEjection`)**:
   - Expanding plasma rings (`RingGeometry(0.96, 1.12 \sim 1.25, 48)`) that erupt from the sun at randomized 3D orientations.
   - Expand outward through the cube lattice ($\text{scale} \to 3.8$) while fading exponentially ($\text{opacity} \times 0.95$).
   - Autonomous eruptions occur every $10 \sim 18$ seconds.
   - High-energy CME bursts are triggered instantly upon Idea Ingestion and database connection restoration.

### 7.4 Concentric High-Definition 3-Axis Gyroscopic Cypher Mandala
1. **1024x1024 Procedural Runic Texture**:
   - **Outer Cypher Dial (Radius 460px)**: 72 radial calibration ticks and primary query:
     `MATCH (a:Agent)-[w:WITNESSED]->(d:Decision) WHERE w.valid=true RETURN a, d ⟐ FALKOR_CORE_STABLE ⟐`
   - **Middle Relational Schema Track (Radius 330px)**:
     `(:Cut)-[:REQUIRES_CLEARANCE]->(:License) ⟐ (:Track)-[:SYNCED_WITH]->(:Scene) ⟐ (:Block)-[:VERIFIED]->(:Lattice) ⟐`
   - **Sacred Geometry**: 8-point diamond star nodes at radius 235px.
   - **Inner Cryptographic Verification Ring (Radius 220px)**:
     `FALKOR_SHARD_01 ⟐ ZERO_WRITE_AUDIT_LOCKED ⟐ 100% IMMUTABLE ⟐`
   - **Central Core**: Dual nested crimson and golden diamond runes.
2. **3-Axis Gyroscopic Gimbal**:
   - Three orthogonal plane meshes (`PlaneGeometry(2.15, 2.15)`):
     - `eldritchCypherDisc`: XY plane, rotating at $Z = 0.12t$.
     - `eldritchCypherDisc2`: YZ plane, counter-rotating at $Z = -0.15t$.
     - `eldritchCypherDisc3`: XZ tilted plane, rotating at $Y = 0.10t$.
   - Discs surge in rotation speed and scale during Cypher query dispatches.

### 7.5 Outage Simulation Collapse & Ignition Recovery
1. **Top-Right HUD Telemetry Badge**:
   - Active: `SOLAR CORE: FUSION ACTIVE` with pulsating amber beacon (`bg-amber-400 shadow-[0_0_10px_#ffb300]`).
   - Outage: `SOLAR CORE: COLD DWARF` with dark red/slate badge.
2. **Astrophysical Collapse**:
   - Plasma mantle collapses to dark charcoal ash (`0x1e2029`).
   - Combustion shroud dims to obsidian slate (`0x12141a`).
   - Fusion core extinguishes to deep cold void (`0x0a0c12`).
   - Prominence arcs collapse to dim cold embers (`0x1a1c22`, opacity `0.08`).
   - Coronal rings and Cypher discs fade to phantom baseline opacity (`0.06 \sim 0.12`).
3. **Reconnection Ignition**:
   - Restores all elements to full fiery saturation and triggers a celebratory high-energy CME solar flare burst!

### 7.6 Reduced Motion Compliance
- When `MOTION: REDUCED` is enabled, all vertex turbulence is immediately disabled and `sunSphere` vertices snap back to `sunMantleBaseVertices` with zero visual distortion.

---

## 8. Item 5: Three Orbiting Protector Pyramids (v039.14 / v039.15)

### 8.1 Clean Internal Cube Orbits & Traveling Electron Shells
1. **Geometric Containment Inside Cube Bounds**:
   - The three agent pyramids orbit within radii safely bounded inside the Company Cube (cube size $8.5$, half-size $4.25$):
     - **Ava (Chief Architect)**: Radius $2.15$, tilt $(0.35, 0.20, 0.10)$, speed $0.90$, accent Cyan (`#00e5ff`).
     - **Roy (Security Auditor)**: Radius $2.65$, tilt $(-0.40, 0.60, -0.20)$, speed $0.72$, accent Violet (`#b388ff`).
     - **Guz (Creative Director)**: Radius $3.10$, tilt $(0.60, -0.30, 0.50)$, speed $0.55$, accent Emerald (`#69f0ae`).
2. **Dual-Layer Electrical Orbit Tracks**:
   - 96-segment smooth tilted orbit paths rendered with additive electrical cyan lines (`0x40c4ff`, opacity $0.65$).
3. **Traveling Electron Energy Packets (Data Shells)**:
   - 3 luminous data packet beads (`SphereGeometry(0.068, 12, 12)`, ice-white `#e0f7ff`) per orbit.
   - Advance along the tilted orbital curve at fixed phase offsets ($0, 120^\circ, 240^\circ$), twinkling with high-frequency starlight energy ($\text{scale} = 0.85 + 0.35 \sin(8t + 2i)$).

### 8.2 Aerospace Patrol Heading & Tangent Velocity Alignment
1. **Forward Flight Orientation**:
   - Rather than tumbling randomly, each pyramid dynamically aligns its heading vector with its forward orbital tangent velocity:
     $$\vec{T}(\theta) = \frac{P(\theta + 0.04) - P(\theta)}{\|P(\theta + 0.04) - P(\theta)\|}$$
   - The pyramid's apex and nose bank slightly inward toward the Sun along the centrifugal normal vector, producing an authentic cybernetic patrol flight dynamic.
2. **Internal Glyph Cores & Apex Sensor Crystals**:
   - Inner octahedron glyph cores spin on dual axes ($Y = -0.045t, Z = 0.03t$) with sinusoidal scale pulsing.
   - Apex sensor crystals strobe with high-luminance sensor strobing ($\text{opacity} = 0.82 + 0.18 \sin(6.5t)$).

### 8.3 Floating Holographic Agent Badges & Responsive Hit Spheres
1. **2D Canvas Billboard Badges**:
   - Attached above the apex of each pyramid ($y = +0.72$):
     - `AVA // ARCHITECT` (Cyan `#00e5ff`)
     - `ROY // AUDITOR` (Violet `#b388ff`)
     - `GUZ // CREATIVE` (Emerald `#69f0ae`)
   - High-contrast rounded pill styling with glowing accent borders.
2. **Invisible Raycast Hit Spheres**:
   - Each pyramid rig includes an invisible bounding sphere (`radius 0.68`) ensuring pointer hover and click interactions are effortless.
3. **Pointer Feedback & Hover Expansion**:
   - Moving the cursor over an orbiting pyramid activates pointer cursor feedback and smoothly expands the pyramid's scale by $+18\%$ ($\text{scale} \times 1.18$) while intensifying wireframe glow.

### 8.4 Synaptic Lightning Trigger & Chamber Inspection
1. **Direct 3D Click Interaction**:
   - Clicking an orbiting pyramid immediately fires `spawnSynapticLightning(agentKey, isDatabaseOutage)`:
     - An authentic jagged 3D electric lightning bolt arcs from the pyramid's current coordinates directly into the central Sun!
     - During normal operation, the lightning spans $100\%$ distance in brilliant cyan (`0x00e5ff`).
     - In simulated outage, the lightning sparks crimson (`0xff1744`) and severes abruptly at $52\%$ distance, illustrating a broken connection.
2. **Chamber Activation & Viseme Synchronization**:
   - Triggers pyramid spring expansion ($\text{scaleImpulse} = 1.35 \to 1.0$).
   - Plays aperture audio and opens `#agent-chamber` with real-time 2D canvas face rig:
     - Multi-stage viseme lip sync (`open`, `wide`, `round`, `fricative`, `rest`).
     - Realistic lower-lip/jaw displacement on speech.
     - Natural upper-eyelid blinking, pupil micro-gaze tracking, and dashboard proximity smile!

### 8.5 Outage Degradation & Reconnection
- **Outage Active**:
  - Pyramid wireframes and faces shift to warning blood crimson (`0xaa2030`, opacity $0.18$).
  - Glyph cores shift to corrupted crimson pulse (`0xff1744`).
  - Electrical orbit paths dim to dark corrupted red (`0x551015`, opacity $0.20$).
  - Electron beads dim to sputtering red embers (`0x880010`, opacity $0.25$).
- **Restored State**:
  - Instantly returns to full vibrant agent accent neons (`#00e5ff`, `#b388ff`, `#69f0ae`) and electrical blue tracks (`0x40c4ff`).

---

## 9. Item 6: Internal Antigravity Liquid Starlight (v039.16 / v039.17)

### 9.1 Procedural Faceted Gem Starlight Texture & Multi-Chromatic Palette
1. **Procedural Gemstone Diamond Core (`createGemStarTexture()`)**:
   - High-resolution 128x128 2D canvas texture generator synthesizing optical refraction properties:
     - **Iridescent Dispersion Outer Halo**: Multi-stop radial gradient cycling from white core through sky blue (`rgba(128, 222, 255, 0.88)`), amethyst violet (`rgba(179, 136, 255, 0.42)`), to electric cyan.
     - **Octahedral Diamond Facet Polygon**: Geometric 8-vertex cut-gem polygon with dual internal facet cross-lines.
     - **Cardinal Diffraction Needle Spikes**: 4-point cardinal hairline spikes (`128x2.4px`) simulating high-index optical refraction.
     - **Diagonal Refraction Glints**: Secondary $45^\circ$ diagonal cross glints (`84x1.8px`) producing authentic crystal sparkle.
2. **750 Volumetric Particles & Jewel Starlight Palette**:
   - 750 particles distributed inside Company Cube volume ($[-3.15, 3.15]$), strictly bounded outside the Sun core ($r > 1.45$).
   - 6-color jewel palette:
     - Aquamarine Cyan (`#00e5ff`)
     - Diamond White Brilliance (`#ffffff`)
     - Amethyst Violet (`#b388ff`)
     - Peridot / Emerald Spark (`#76ff03`)
     - Topaz Amber Flame (`#ffd54f`)
     - Sapphire Sky (`#80d8ff`)
   - High-frequency individual phase and speed sinusoidal twinkling glints with non-linear sparkle bursts ($\text{sparkle} = 1.45$ on peak).

### 9.2 Antigravity Micro-Turbulence & Curl Noise Circulation
1. **3D Laminar Curl Noise Field**:
   - Sinusoidal 3D vector circulation field driving gentle zero-g laminar currents throughout the cube interior:
     $$f_x = \sin(1.3 y + 0.7 t) \cos(1.3 z + 0.5 t) \cdot 0.005 \cdot M_{\text{flow}}$$
     $$f_y = (\sin(1.3 z + 0.6 t) \cos(1.3 x + 0.7 t) \cdot 0.005 + \sin(0.8 t + 2.0 x) \cdot 0.0025) \cdot M_{\text{flow}}$$
     $$f_z = \sin(1.3 x + 0.5 t) \cos(1.3 y + 0.6 t) \cdot 0.005 \cdot M_{\text{flow}}$$
2. **Viscous Momentum Damping**:
   - Viscous resistance decay factor of $0.965$ per frame prevents runaway acceleration, preserving fluid stability.
3. **Elastic Cube Wall Boundary**:
   - Soft elastic reflection when particles approach cube boundaries ($|x|, |y|, |z| > 3.15$), dampening bounce velocity by $0.80$.

### 9.3 Solar Core & Electrical Orbit Ring Exclusion Envelopes
1. **Solar Core Exclusion ($r=1.38$)**:
   - Particles repelled non-linearly outward from the solar center, with a laminar angular vortex velocity component swirling around the $Y$-axis ($\Delta v_x = -n_z \cdot 0.007, \Delta v_z = n_x \cdot 0.007$).
2. **Electrical Orbit Ring Tube Collision Exclusion ($r_{\text{tube}}=0.26$)**:
   - Closed-form distance evaluation against the 3 tilted orbit planes via inverse quaternion transformation:
     $$\vec{V}_{\text{local}} = \mathbf{q}^{-1} \vec{P}$$
     $$d_{\text{circle}} = \sqrt{(\|\vec{V}_{xz}\| - R)^2 + V_y^2}$$
   - Particles approaching within $0.26$ of an orbit ring are repelled smoothly outward, keeping electrical orbit tracks crystal-clear.

### 9.4 Fluid Dynamic Pyramid Deflection & Tangential Bow Wave
1. **Ship Wake Bow Wave Dynamics**:
   - As Ava, Roy, and Guz patrol their orbits, particles within $r_{\text{deflect}} = 0.82$ are pushed outward along the radial normal.
   - Crucially, particles also receive a forward impulse along each pyramid's tangent flight heading $\vec{T}$:
     $$\Delta \vec{V} = \vec{T} \cdot \text{pen} \cdot 0.035$$
   - This creates an authentic hydrodynamic bow wave wake trailing each aerospace pyramid!

### 9.5 Interactive Cursor Micro-Eddy Wake & Pentatonic Stardust Chimes
1. **Cursor Raycast Projection into Cube Local Space**:
   - 3D cursor position $\vec{P}_{\text{mouse}}$ and velocity vector $\vec{V}_{\text{mouse}}$ are projected through `cubeGroup.worldToLocal()`.
   - When the user moves the cursor through the cube interior ($|x|, |y|, |z| < 3.8$), nearby particles ($d < 1.35$) are swept along the cursor's velocity vector with an added micro-eddy curl swirl.
2. **Throttled Pentatonic Web Audio Chimes**:
   - High-velocity cursor swipes stir the starlight and trigger `CosmicAudio.playStardustChime()`:
     - 7-tone pentatonic scale ($587.33\,\text{Hz} - 1318.51\,\text{Hz}$).
     - Stereo-panned according to screen horizontal position.
     - 115ms throttle ensures delicate, glassy chime cascades with zero audio buffer distortion.

### 9.6 Simulated Outage Degradation & Reconnection
- **Active Outage**:
  - Liquid starlight particles drop opacity from $0.95$ to $0.40$.
  - Circulation velocity slows to $45\%$ ($M_{\text{flow}} = 0.45$).
  - Particle colors shift smoothly from brilliant multi-chromatic jewel tones into dormant, dying crimson/amethyst embers ($R \times 0.22 + 0.45, G \times 0.05, B \times 0.15$).
  - Glitter sparkle peak is suppressed to sluggish ember pulses ($0.22 - 0.40$).
- **Restored Reconnection**:
  - Instantly snaps back to $0.95$ opacity and $100\%$ circulation velocity.
  - Full radiant diamond, aquamarine, emerald, and amethyst sparkles flare back into life!

---

## 10. Preservation of Foundation Features

All interactive systems remain fully functional:
1. **Synaptic Query Terminal**: NLP cypher queries, quick chips, and live logs.
2. **2D Canvas Face Rig**: Real-time pupil tracking, natural blinking, jaw drop articulation, and proximity smiles.
3. **Procedural Web Audio**: Continuous sub-bass drone, shockwave boom, and pointer-velocity stardust chimes.
4. **Deep-Space 3-Layer Parallax**: Opposing cursor parallax across near, mid, and far starfields.
5. **Red Graph Counter-Rotation**: Organic 28-node constellation counter-rotating at 50% speed.
6. **IdeaVerse Comets & Near-Miss Flybys**: Deep space comets, hypersonic Doppler flybys, 10-document narrative ledger, and zero-write outage rejection.
7. **The Fiery Sun Core**: Turbulent plasma mantle wireframe, 6 magnetic prominence loops, CME flare pulses, and 3-axis Cypher mandala.
8. **Three Orbiting Protector Pyramids**: Traveling electron shells, aerospace velocity heading, holographic badges, and synaptic lightning trigger.

---

## 11. Next Step on the Roadmap

- **Item 7: The Eldritch Cypher Shader Mandala** (`v039.18` / `v039.19`): Triple orthogonal 1024x1024 procedural canvas shader rings, dynamic glyph scrolling, harmonic resonance rings, and chromatic flare pulses.
