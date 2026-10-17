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
  - `v039.18` (Item 6b: Thickened Purple Containment Frame & Orocue Travelling Light-Balls)
  - `v039.19` (Item 6b: Purple Frame & Light-Ball Architecture Documentation & Tags)
  - `v039.20` (Item 6c: Option A Containment Corridor Fluid Physics & Outage Agitation)
  - `v039.21` (Item 6c: Option A Corridor Fluid Architecture Documentation & Tags)
  - `v039.22` (Item 6d: Cardboard Box Marble Physics for Shard Nodes & Ingested Ideas)
  - `v039.23` (Item 6d: Marble Box Physics Architecture Documentation & Tags)
  - `v039.24` (Item 7: The Eldritch Cypher Shader Mandala, 2048px Runic Canvas & Resonance Rings)
  - `v039.25` (Item 7: Eldritch Cypher Shader Mandala Architecture Documentation & Tags)
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

## 10. Purple Containment Frame & Travelling Light-Balls (v039.18 / v039.19)

### 10.1 Thick Volumetric Neon Amethyst Struts & Corner Beacons
To elevate the inner tesseract into an authoritative, radiant containment architecture:
1. **12 Volumetric Neon Cylindrical Struts (`purpleStruts`)**:
   - Replaced faint hairline wireframe lines with 12 authentic 3D cylindrical struts:
     $$\text{Geometry: } \text{CylinderGeometry}(0.045, 0.045, 5.60, 12)$$
   - Grouped orthogonally: 4 parallel to X, 4 parallel to Y, and 4 parallel to Z, meeting at vertices $( \pm 2.80, \pm 2.80, \pm 2.80 )$.
   - Material: Luminous cyber amethyst (`#c084fc`), additive blending, opacity `0.92`.
2. **8 Glowing Corner Junction Beacons (`purpleCornerBeacons`)**:
   - Located at all 8 cube vertices $( \pm 2.80, \pm 2.80, \pm 2.80 )$.
   - Geometry: `SphereGeometry(0.13, 16, 16)`, soft lavender diamond glow (`#dda0dd`), additive blending, opacity `0.96`.
   - Flawlessly caps the intersection of the 3 orthogonal cylindrical struts at each corner.
3. **Dual-Pass Radiant Aura (`purpleWireAura`)**:
   - Outlined with an expanded wireframe lattice at scale `1.012` (`#9333ea`, opacity `0.45`), producing a radiant 200% volumetric aura surrounding the inner chamber.

### 10.2 Six Translucent Forcefield Containment Panels (`purplePanels`)
- 6 planar forcefield walls (`PlaneGeometry(5.60, 5.60)`) sealing the 6 faces of the purple containment frame at $\pm 2.80$ on X, Y, and Z.
- Material: Cyber violet (`#8b5cf6`), double-sided, additive blending, opacity `0.055`, `depthWrite: false`.
- Visually establishes the inner containment boundary separating the core solar/pyramid sanctuary ($r \le 2.80$) from the outer fluid starlight corridor ($[2.80, 3.35]$).

### 10.3 Orocue Travelling Light-Balls Kinematics (v039.18)
Adapted directly from Orocue v10 (`commit 4566342e584b`):
1. **Asymmetric Perimeter Race**:
   - For any given face with ordered corners $[C_0, C_1, C_2, C_3]$:
     - **Slow Orb**: Departs $C_0$ and travels along the single edge directly to $C_3$:
       $$\vec{P}_{\text{slow}}(u) = (1 - u) C_0 + u C_3, \quad u \in [0, 1]$$
     - **Fast Orb**: Departs $C_0$ at the exact same instant, lapping the other three edges at **3x speed**:
       - Segment 1 ($u \in [0, 1/3)$): $\vec{P}_{\text{fast}} = \text{lerp}(C_0, C_1, 3u)$
       - Segment 2 ($u \in [1/3, 2/3)$): $\vec{P}_{\text{fast}} = \text{lerp}(C_1, C_2, 3(u - 1/3))$
       - Segment 3 ($u \in [2/3, 1]$): $\vec{P}_{\text{fast}} = \text{lerp}(C_2, C_3, 3(u - 2/3))$
2. **Synchronized Simultaneous Arrival**:
   - Total duration: $T = 2.6\,\text{s}$ (exact match to Orocue `animation-duration: 2.6s`).
   - Because all 4 edges of the square face have equal length $L = 5.60$, the slow orb covers distance $L$ at velocity $v = L / T$, while the fast orb covers distance $3L$ at velocity $3v$.
   - Both orbs arrive at destination corner $C_3$ at the exact same split-second ($u = 1.0$)!
3. **Orb Aesthetics**:
   - **Slow Orb**: Gold/Amber core (`#ffe082`, radius `0.08`) with a vibrant violet halo (`#e040fb`, radius `0.18`).
   - **Fast Orb**: Brilliant diamond white core (`#ffffff`, radius `0.08`) with an electric cyber amethyst halo (`#7c4dff`, radius `0.18`).
   - Opacity matches Orocue CSS keyframes: fade-in over first 8% of the run ($u < 0.08$), steady brilliance with micro-twinkle across $u \in [0.08, 0.96]$, and collision detonation at $u = 1.0$.

### 10.4 Corner Collision Spark Pop Explosion
When both orbs collide simultaneously at corner $C_3$:
1. **Orocue Keyframe Replication (`sparkPop .62s`)**:
   - Total duration: $620\,\text{ms}$ ($0.62\,\text{s}$).
   - Scale interpolation:
     - $0\% \to 35\%$: expands from $0.30 \to 1.25$
     - $35\% \to 100\%$: expands from $1.25 \to 1.90$
   - Rotation interpolation:
     - $0\% \to 35\%$: rolls from $0^\circ \to 35^\circ$ ($0.61\,\text{rad}$)
     - $35\% \to 100\%$: rolls from $35^\circ \to 80^\circ$ ($1.40\,\text{rad}$)
   - Opacity interpolation:
     - Ramps from $0.0 \to 1.0$ at $35\%$, then smoothly dissolves to $0.0$ at $100\%$.
2. **Dual-Bladed Anamorphic Diamond Spark Texture**:
   - 128x128 procedural canvas texture featuring a central radial gradient, horizontal blade ($116 \times 4\,\text{px}$), vertical blade ($4 \times 116\,\text{px}$), and $45^\circ$ diagonal glints.
3. **Eight Radial Micro-Sparks**:
   - 8 micro-particles burst outward in an orthogonal spray from the corner with outward normal velocity, decelerating with viscous damping ($0.92$ per frame).
4. **Glassy Audio Chime Pop**:
   - Each collision fires `CosmicAudio.playStardustChime(0, 1.85)`: a high-frequency crystal chime micro-pop.

### 10.5 Outage Corrupted State & Restored Neon Resonance
- **Active Outage**:
  - Purple struts darken to deep corrupted shadow violet (`#3a123f`).
  - Corner beacons shift to bruised crimson (`#551144`).
  - Translucent panels drop opacity to `0.02`.
- **Restored Reconnection**:
  - Struts snap back to vibrant neon amethyst (`#c084fc`, opacity `0.92`).
  - Corner beacons flare to radiant lavender diamond (`#dda0dd`).
  - Translucent panels restore to glowing violet field (`#8b5cf6`, opacity `0.055`).

---

---

## 11. Option A Containment Corridor Fluid Physics (v039.20 / v039.21)

### 11.1 Interstitial Shell Geometry & 6-Slab Uniform Distribution
To fulfill Option A where the liquid starlight particles float strictly within the space between the outer blue cube and inner purple frame:
1. **Geometric Corridor Envelope**:
   - **Outer Blue Box Boundary**: $L_{\text{outer}} = 3.32$ (just inside the $3.40$ half-size blue wireframe walls).
   - **Inner Purple Box Boundary**: $L_{\text{inner}} = 2.82$ (just outside the $2.80$ half-size purple struts).
   - The containment corridor forms a continuous hollow 3D cubic shell of thickness $0.50$ on all 6 faces:
     $$\max(|x|, |y|, |z|) \in [2.82, 3.32]$$
2. **Balanced 6-Slab Initialization**:
   - All 750 starlight particles are partitioned evenly across the 6 face slabs:
     - $+Z$ Front slab: $z \in [2.86, 3.30], \quad x, y \in [-3.15, 3.15]$
     - $-Z$ Back slab: $z \in [-3.30, -2.86], \quad x, y \in [-3.15, 3.15]$
     - $+X$ Right slab: $x \in [2.86, 3.30], \quad y, z \in [-3.15, 3.15]$
     - $-X$ Left slab: $x \in [-3.30, -2.86], \quad y, z \in [-3.15, 3.15]$
     - $+Y$ Top slab: $y \in [2.86, 3.30], \quad x, z \in [-3.15, 3.15]$
     - $-Y$ Bottom slab: $y \in [-3.30, -2.86], \quad x, z \in [-3.15, 3.15]$
   - Guarantees an immaculate, uniform celestial coat wrapping all 6 faces of the purple containment chamber.

### 11.2 Calm Synchronized Flow (FalkorDB Connected State)
When the database cluster is connected and nominal:
1. **Peaceful Laminar Velocity ($M_{\text{speed}} = 0.28$)**:
   - Particles move with a slow, graceful, hypnotic drift ($28\%$ speed).
   - High viscous damping ($0.978$ per frame) suppresses jitter, yielding pristine laminar zero-g fluidity.
2. **Coherent Global Perimeter Circulation**:
   - A synchronized orbital circulation field sweeps particles gently around the cube perimeter:
     $$f_x = (-p_z \cdot 0.0016 + \sin(0.9 p_y + 0.25 t) \cdot 0.0012) \cdot M_{\text{speed}}$$
     $$f_y = (\cos(0.9 p_x + 0.20 t) \cdot 0.0012 + \sin(0.9 p_z) \cdot 0.0008) \cdot M_{\text{speed}}$$
     $$f_z = (p_x \cdot 0.0016 + \cos(0.9 p_y + 0.25 t) \cdot 0.0012) \cdot M_{\text{speed}}$$
   - Produces a unified, serene cosmic dance where particles glide in harmony across the containment faces.
3. **Gentle Diamond & Jewel Twinkles**:
   - Soft $1.2 \sim 2.5\,\text{s}$ breathing sparkle cycle ($0.60 + 0.40 \sin(\omega t + \phi)$), accentuating diamond, aquamarine, amethyst, and topaz tones.

### 11.3 Antigravity Interactive Mouse Ripple Field (https://antigravity.google/)
Recreating the dynamic interactive particle physics of `antigravity.google`:
1. **Omnidirectional Proximity Displacement Bubble**:
   - Projected into `cubeGroup` local space whenever the pointer approaches within $|x|, |y|, |z| < 4.2$.
   - Nearby particles ($d < 1.65$) experience elastic radial repulsion pushing them smoothly away from the pointer:
     $$\Delta \vec{V}_{\text{push}} = \frac{\vec{P} - \vec{C}_{\text{local}}}{d} \cdot \left(\frac{1.65 - d}{1.65}\right) \cdot 0.018$$
2. **Dynamic Eddy Wake along Velocity Heading**:
   - Sweeps particles along the cursor's 3D motion vector ($\Delta \vec{V} += \vec{V}_{\text{cursor}} \cdot \text{factor} \cdot 0.38$).
3. **Antigravity Tangential Curl Swirl**:
   - Imparts a micro-vortex swirl curving particles tangentially around the pointer axis:
     $$\Delta v_x += -c_{dz} \cdot \text{factor} \cdot 0.035, \quad \Delta v_z += c_{dx} \cdot \text{factor} \cdot 0.035$$
   - As the cursor moves away, particles smoothly decelerate and glide back into their synchronized collective drift.

### 11.4 Chaotic High-Speed Outage Agitation (FalkorDB Outage State)
When the FalkorDB server connection is severed (**SIMULATE OUTAGE**):
1. **High-Speed Agitation ($M_{\text{speed}} = 1.0$)**:
   - Velocity jumps to $3.5\times$ connected speed with lower viscosity damping ($0.945$).
2. **Multi-Harmonic Turbulent Curl & Brownian Jitter**:
   - High-frequency chaotic curl perturbation:
     $$f_{\text{chaos}, x} = \sin(4.2 p_y + 4.5 t) \cos(3.8 p_z + 3.2 t) \cdot 0.015$$
     $$f_{\text{chaos}, y} = (\sin(4.5 p_z + 3.8 t) \cos(4.2 p_x + 4.0 t) \cdot 0.015 + \sin(5.5 t + 6.0 p_x) \cdot 0.008)$$
     $$f_{\text{chaos}, z} = \sin(3.8 p_x + 4.2 t) \cos(4.5 p_y + 3.5 t) \cdot 0.015$$
   - Erratic stochastic velocity kicks ($\Delta \vec{V} += (\text{rand} - 0.5) \cdot 0.007$) create rapid Brownian agitation.
3. **Corrupted Flickering Embers**:
   - Colors mutate into volatile crimson/amethyst embers ($R \times 0.25 + 0.55, G \times 0.06, B \times 0.20 + 0.25$).
   - Rapid strobe flickering ($0.25 + 0.35 \sin(3.5 \omega t + \phi)$), visually conveying containment field electromagnetic instability.

### 11.5 Strict Dual-Boundary Elastic Reflection & Dominant Axis Recovery
1. **Outer Blue Wall Reflection ($|P| \le 3.32$)**:
   - Particles reaching $|x|, |y|, |z| > 3.32$ are clamped and reflected inward with an elastic restitution of $0.85$.
2. **Inner Purple Frame Field Repulsion ($\max(|P|) \ge 2.82$)**:
   - If a particle's maximum coordinate drops below $2.82$ (penetrating the purple chamber), the field detects the dominant penetration axis $\max(|p_x|, |p_y|, |p_z|)$.
   - Immediately resets the particle to the purple boundary ($2.82$) and imparts a strong outward velocity boost ($|v| \cdot 0.85 + \text{pen} \cdot 0.15 + 0.01$) pointing back into the interstitial corridor!

---

## 12. Cardboard Box Marble Physics & Dynamic Graph Network (v039.22 / v039.23)

### 12.1 Antigravity Field Collapse & Instantaneous Frame Mapping
When the FalkorDB cluster connection is severed (**SIMULATE OUTAGE**), the artificial zero-g containment field inside the purple chamber collapses, subjecting internal graph nodes to Newtonian gravity:
1. **Instantaneous Frame Transformation**:
   - At the exact millisecond of outage trigger, each node's world coordinate is captured and mapped into `cubeGroup`'s local coordinate frame via `cubeGroup.worldToLocal(worldPos)`.
   - The node is clamped within the purple containment chamber ($|P| \le 2.65$).
   - `redGraphGroup.quaternion.copy(cubeGroup.quaternion)` runs every frame during outage, guaranteeing that the local axes of `redGraphGroup` are identical to the physical walls of the purple containment box without any visible jump or matrix stutter.
2. **Initial Tumble Scatter**:
   - Nodes receive a realistic initial downward drop impulse ($v_y \approx -0.06 \sim -0.12$) and stochastic lateral jitter ($\Delta v_{x, z} \approx \pm 0.04$), breaking their orbital lock and sending them tumbling toward the floor of the purple chamber.

### 12.2 Real-Time Tilting Gravity Vector & Cardboard Box Dynamics
Just like marbles rolling inside a handheld cardboard box:
1. **Local Gravity Vector Transformation**:
   - In world space, gravity pulls straight down toward $-Y$: $\vec{G}_{\text{world}} = (0, -18.0, 0)$.
   - Transforming into the local frame of `cubeGroup`:
     $$\vec{g}_{\text{local}} = R^{-1}_{\text{cube}} \cdot \vec{G}_{\text{world}} = \vec{G}_{\text{world}} \cdot Q_{\text{cube}}^{-1}$$
   - When the user rotates or tilts the cube via mouse/touch drag:
     - Tilting the box rightward rolls the marbles onto the $+X$ purple wall.
     - Tilting forward rolls them onto the $-Z$ purple wall.
     - Inverting the box rolls them onto the ceiling ($+Y$ panel).
     - Tilting into a vertex causes all marbles to slide down and gather naturally in that corner!
2. **Centrifugal Acceleration & Wall Contact Drag**:
   - The engine measures the cube's 3D angular velocity $\vec{\omega} = \Delta \vec{\theta} / \Delta t$.
   - When the box is spun rapidly:
     - **Centrifugal Acceleration**: $\vec{a}_{\text{cent}} = -\vec{\omega} \times (\vec{\omega} \times \vec{p})$ flings marbles radially outward toward the containment perimeter.
     - **Inertial Wall Drag**: Marbles in proximity to any purple wall ($d < r + 0.22$) experience viscous contact drag $\Delta \vec{v} += (\vec{\omega} \times \vec{p}) \cdot \Delta t \cdot 0.58$, briefly following the spin of the box before settling back toward the lowest surface!

### 12.3 Dual Boundary Collisions & Multi-Pass Marble-to-Marble Physics
1. **Six Containment Chamber Walls ($L = 2.80 - r$)**:
   - Elastic restitution ($e = 0.36$) yields satisfying, non-hyperactive bounces.
   - Tangential rolling friction ($0.94$) damps velocity along contact planes, ensuring marbles roll and settle smoothly.
2. **Central Cold Dwarf Core Collision ($R_{\text{core}} = 0.72$)**:
   - Marbles bouncing against the collapsed central ash core deflect outward along the surface normal $\hat{n} = \vec{p} / \|\vec{p}\|$, rolling smoothly around the spherical obstacle.
3. **2-Pass Pairwise Rigid Sphere Collision**:
   - Evaluates all pairs $(i, j)$ across the 28 red shard nodes and all ingested blue idea nodes.
   - Mass-weighted positional separation resolves overlaps without penetration:
     $$\Delta \vec{p}_i = \hat{n} \cdot \delta \cdot \frac{m_j}{m_i + m_j}, \quad \Delta \vec{p}_j = -\hat{n} \cdot \delta \cdot \frac{m_i}{m_i + m_j}$$
   - Elastic collision impulse ($e = 0.35$) transfers momentum between colliding marbles, producing realistic clustering, stacking, and rolling piles.

### 12.4 Preserved Node Identity & Ingested Comet Blue Nodes
1. **Ingested Idea Nodes Retain Radiant Cyan Blue (`0x00e5ff`)**:
   - Ingested idea nodes synthesized from captured comets retain their signature electric cyan blue color and opacity ($0.98$), clearly distinguishing them among the ruby red shards.
   - Ingested idea nodes possess slightly higher mass ($1.5$) and radius ($0.17$), lending them distinctive metallic weight.
2. **Red Shard Nodes Retain Radiant Ruby Red (`0xff1744`)**:
   - Standard shard nodes maintain full vibrant crimson luminosity, ensuring high-contrast visibility against the dark chamber floor.
3. **Dynamic Network Edge Tangle**:
   - Graph relationships (`relationshipLines`) and ingested synaptic edges (`ingestedEdgeObjects`) update their vertex buffer arrays in real time every frame.
   - The network lines follow the falling marbles, tangling and draping naturally across the floor.

### 12.5 Interactive Pointer Stirring & Acoustic Impulse Feedback
1. **Interactive Pointer Swat / Poke**:
   - The cursor's 3D position is projected into local box space (`cubeGroup.worldToLocal(mouse3D)`).
   - Moving the pointer within $1.35$ units of resting marbles imparts an elastic radial push and tangential velocity wake, allowing the user to poke, stir, and scatter the marbles across the floor.
2. **Acoustic Marble Impact Feedback (`CosmicAudio.playMarbleClick`)**:
   - High-impulse collisions ($J > 0.18$) trigger a synthesized micro-acoustic click ($1450 \sim 2300\,\text{Hz}$ triangle wave with exponential decay over $38\,\text{ms}$), providing tactile ASMR audio satisfaction.

### 12.6 Antigravity Restoration & Smooth Constellation Levitation
When database connectivity is re-established (**RESTORE DATABASE**):
1. **Smooth Quaternion Slerp**:
   - `redGraphGroup.quaternion` smoothly slerps back to the 50% counter-rotating Euler orientation over $1.2\,\text{s}$ ($\text{step} = 0.055$).
2. **Harmonic Levitation to Home Positions**:
   - Each node smoothly interpolates from the floor back to its celestial graph constellation coordinate (`node.position.lerp(node.userData.basePos, 0.045)`).
   - The tangled network lines smoothly untangle and contract, returning to pristine crystalline geometry!

---

## 13. Item 7: The Eldritch Cypher Shader Mandala (v039.24 / v039.25)

### 13.1 Super-Sampled 2048x2048 Procedural Canvas Runic Generation
To provide razor-sharp cryptographic and esoteric detail at any zoom distance, the mandala texture is generated dynamically using a super-sampled 2048x2048 HTML5 2D canvas (`THREE.CanvasTexture` with `LinearMipmapLinearFilter` and `LinearFilter`):
1. **Layer 1: Outer Precision Vernier Calibration Dial ($R = 960$)**:
   - Primary cyan perimeter stroke ($R = 960$, line width 5, neon shadow blur 18 in `rgba(0, 229, 255, 0.85)`).
   - Outer concentric hairline guide ($R = 982$, line width 2).
   - **144 Radial Calibration Ticks**:
     - 12 Major Cardinal Ticks ($a \% 12 == 0$, $R_1 = 890 \to 960$, line width 4.5, `#00e5ff`) with glowing Golden Pip Beacons ($R = 872$, radius 7, fill `#ffd54f`, glow `#ffb300`).
     - 24 Intermediate Ticks ($a \% 4 == 0$, $R_1 = 918 \to 960$, line width 2.8, `rgba(0, 229, 255, 0.85)`).
     - 108 Minor Vernier Ticks ($R_1 = 938 \to 960$, line width 1.6, `rgba(0, 229, 255, 0.42)`).
   - Vernier baseline delimiter ring at $R = 856$ (line width 2).
2. **Layer 2: Primary Cypher NLP Inscription Track ($R = 822$)**:
   - High-contrast bold monospace typography (`bold 30px 'Courier New', monospace`).
   - Radiant amethyst lavender styling (`#c084fc`, shadow blur 14, `rgba(192, 132, 252, 0.9)`).
   - Continuous 360-degree perimeter inscription:
     `"MATCH (a:Agent)-[w:WITNESSED]->(d:Decision) WHERE w.valid=true RETURN a, d ⟐ FALKOR_CORE_STABLE ⟐ GRAPH_EVIDENCED ⟐ 100%_MUTUAL_CONSENSUS ⟐ "`
   - Inner lavender delimiter ring at $R = 770$ (line width 2.5).
3. **Layer 3: Middle Relational Schema Track ($R = 675 \sim 740$)**:
   - Outer solar gold boundary ring at $R = 740$ (line width 3.5, glow `rgba(255, 213, 79, 0.75)`).
   - Schema typography (`bold 28px 'Courier New', monospace`, `#ffd54f`):
     `"(:Cut)-[:CUE_COVERAGE]->(:Track)-[:LICENSED_BY]->(:License)-[:RELEASED_IN]->(:Release) ⟐ AUDIT_ESTABLISHED ⟐ ZERO_DEFECT_CLEARANCE ⟐ "`
   - **16 Sacred Diamond Vernier Nodes & Connecting Polygon Ring ($R = 612$)**:
     - 16-sided regular polygon guide ring in amber (`rgba(255, 145, 0, 0.45)`).
     - 16 diamond glyphs (width 20, height 20) with amber stroke (`#ff9100`, width 2.5) and semi-translucent gold fill (`rgba(255, 213, 79, 0.45)`).
   - Inner amber delimiter ring at $R = 560$ (line width 3).
4. **Layer 4: Sacred 12-Point Star Lattice & Elder Futhark / Cryptographic Runes ($R = 468 \sim 540$)**:
   - Interlaced 12-point sacred geometric star cords inscribed between $R = 430$ and $R = 535$ in incandescent orange (`rgba(255, 109, 0, 0.45)`).
   - Esoteric cipher runes (`bold 28px serif, monospace`, `#ff9100`, shadow blur 12):
     `"⟐ ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ ᚷ ᚹ ᚺ ᚾ ᛁ ᛃ ᛈ ᛇ ᛉ ᛋ ᛏ ᛒ ᛖ ᛗ ᛚ ᛜ ᛞ ᛟ ⟐ 0x77B8 ⟐ 0x9F8E ⟐ 0x3C4D ⟐ "`
5. **Layer 5: Inner Cryptographic Shard Verification Ring ($R = 345 \sim 420$)**:
   - Outer crimson verification boundary at $R = 420$ (line width 3.5, `#ff1744`).
   - Shard immutability ledger inscription (`bold 24px 'Courier New', monospace`, `#ff5252`):
     `"FALKOR_SHARD_01 ⟐ ZERO_WRITE_AUDIT_LOCKED ⟐ 100% IMMUTABLE ⟐ ZERO_DEFECT_CONSENSUS ⟐ "`
   - Inner boundary ring at $R = 300$ (line width 3, `#ff1744`).
6. **Layer 6: Center Stargate Energy Spokes & Clean Aperture ($R = 130 \to 280$)**:
   - 24 alternating energy spokes radiating between $R = 140$ and $R = 280$ (crimson `#ff1744` and gold `#ffd54f`).
   - 8 sacred orbital pips at $R = 210$.
   - Stargate aperture rim at $R = 136$.
   - **Destination-Out Center Aperture Clearing ($R < 130$)**: Cleared with `destination-out` so the dynamic 3D plasma mantle wireframe (`sunSphere`), turbulent waves, and incandescent fusion core (`innerSun`) radiate unobstructed through the center of all three orthogonal gimbal planes!

### 13.2 3-Axis Gyroscopic Orthogonal Gimbal & Independent Cloned Materials
1. **Geometry & Scaling**:
   - Expanded to `PlaneGeometry(2.35, 2.35)` to span gracefully beyond the solar mantle ($r=0.96$) and prominence loop apices ($r \approx 1.55$).
2. **Three Orthogonal Axes**:
   - `eldritchCypherDisc`: XY plane, rotating about Z axis.
   - `eldritchCypherDisc2`: YZ plane (`rotation.y = Math.PI / 2`), counter-rotating about Z axis.
   - `eldritchCypherDisc3`: XZ plane (`rotation.x = Math.PI / 2, rotation.z = Math.PI / 4`), rotating about Y axis.
3. **Cloned Materials for Independent Chromatic Control**:
   - `cypherMat1`, `cypherMat2`, `cypherMat3` are cloned instances with additive blending (`THREE.AdditiveBlending`), allowing independent opacity, color, and flare modulation without texture re-upload.

### 13.3 Concentric Harmonic Resonance Rings (`mandalaResonanceRings`)
Three luminous neon acoustic shockwave shells anchored to `sunGroup`:
1. **Inner Harmonic Ring (Electric Cyan `#00e5ff`)**:
   - Radii: $R_{\text{in}} = 1.24, R_{\text{out}} = 1.28$, equatorial plane. Opacity $0.55$, rotational speed $+0.003$.
2. **Middle Harmonic Ring (Amethyst Violet `#c084fc`)**:
   - Radii: $R_{\text{in}} = 1.58, R_{\text{out}} = 1.62$, tilted $(0.35, 0.45, 0.10)$. Opacity $0.48$, rotational speed $-0.0025$.
3. **Outer Harmonic Ring (Radiant Solar Gold `#ffd54f`)**:
   - Radii: $R_{\text{in}} = 1.92, R_{\text{out}} = 1.96$, tilted $(-0.40, 0.25, 0.30)$. Opacity $0.42$, rotational speed $+0.002$.
4. **Dynamic Sinusoidal Wave Ripples**:
   - Each ring expands and contracts radially with harmonic phase-staggered wave motion:
     $$S_{\text{ring}}(t) = 1.0 + 0.045 \sin(2.2t + 0.7i + 1.8i) + 0.22 \cdot I_{\text{flare}}$$

### 13.4 Angular Velocity Momentum Integration & Harmonic Scale Breathing
1. **Momentum Integration**:
   - Instead of overriding rotations each frame, the engine integrates continuous angular momentum:
     $$\Delta \theta_k = \omega_k \cdot M_{\text{outage}} \cdot (1.0 + 3.5 \cdot I_{\text{flare}}) \cdot \Delta t$$
     where $\omega = (0.12, -0.15, 0.10)$ and $M_{\text{outage}} = 0.08$ during outage vs. $1.0$ online.
2. **Harmonic Scale Breathing**:
   - Discs breathe dynamically on staggered harmonic frequencies:
     $$S_1(t) = 1.0 + 0.035 \sin(2.2t) + 0.16 \cdot I_{\text{flare}}$$
     $$S_2(t) = 1.0 + 0.035 \cos(2.5t + 1.2) + 0.16 \cdot I_{\text{flare}}$$
     $$S_3(t) = 1.0 + 0.035 \sin(1.9t + 2.4) + 0.16 \cdot I_{\text{flare}}$$
3. **Decaying Chromatic Flare Impulse**:
   - $I_{\text{flare}}$ decays smoothly toward zero each frame: $I_{\text{flare}} = \max(0, I_{\text{flare}} - 0.85 \Delta t)$.

### 13.5 Chromatic Flare Impulse Triggers & Outage Stasis
1. **Synaptic Query Dispatch (`triggerSynapticQuery`)**:
   - Injects instant flare impulse $I_{\text{flare}} = 1.0$, angular momentum boosts ($\Delta \theta_1 += 0.85, \Delta \theta_2 -= 0.95, \Delta \theta_3 += 0.80$), and expands the resonance rings!
2. **Coronal Mass Ejections & Idea Ingestion**:
   - High-energy CMEs and idea comet captures fire $I_{\text{flare}} = 1.0$, while autonomous solar pulses trigger $I_{\text{flare}} = 0.65$.
3. **Outage Simulation Stasis & Ignition Recovery**:
   - **Outage Active**: Rotation slows to an $8\%$ stasis crawl ($M_{\text{outage}} = 0.08$), discs dim to phantom baseline opacity ($0.12$), and resonance rings fade to $0.06$.
   - **Connection Restored**: Discs return to full opacity ($0.72$), resonance rings restore to base opacities, and an immediate celebratory ignition flare ($I_{\text{flare}} = 1.0$) surges through the mandala!

---

## 14. Background Starfield & Dual-Rotation 360° Celestial Cosmos (Row 8 / v039.26 - v039.27)

Following Jay's architectural specification ("how the entire space field moves when the mouse is moved... but the cube can independently be moved and spun separate from the star field. 2 different rotations... the 360 degree 3D starfield would impact the direction of the comets and perhaps slightly effect the flyby comets"), the visualizer implements a dual-rotation interaction engine where the Company Cube and the surrounding celestial cosmos operate on independent kinematic coordinate spaces.

### 14.1 Dual-Rotation Physical Separation
1. **Rotation 1: Independent Company Cube Spin (`dragMode = 'cube'`)**:
   - Left-clicking and dragging on the Company Cube (`cubePlanes` or descendants of `cubeGroup`) updates `targetRotation.x` and `targetRotation.y`.
   - The cube rotates on its local axes:
     $$\theta_{y,\text{cube}} \mathrel{+}= \Delta x \cdot 0.007, \quad \theta_{x,\text{cube}} \mathrel{+}= \Delta y \cdot 0.007$$
   - In database outage mode, tumbling the cube directly drives the **Cardboard Box Marble Physics**: marbles roll to the lowest physical wall of the purple containment frame, with centrifugal wall-drag and realistic momentum transfer.
2. **Rotation 2: 360° Celestial Cosmos Camera Orbit (`dragMode = 'orbit'`)**:
   - Left-clicking and dragging in open space outside the cube, **OR** Right-Click dragging anywhere on the canvas (with browser context menu disabled), **OR** Shift-Click dragging orbits the camera around origin $(0, 0, 0)$ in spherical coordinates:
     $$\theta_{\text{orbit}} \mathrel{-}= \Delta x \cdot 0.005, \quad \phi_{\text{orbit}} \mathrel{+}= \Delta y \cdot 0.005$$
     where $\phi$ is clamped to $[-1.35, +1.35]$ radians ($\pm 77^\circ$) to eliminate gimbal flips.
   - Target camera world position:
     $$\begin{aligned}
     x &= R_{\text{cam}} \cdot \cos(\phi) \cdot \sin(\theta) \\
     y &= R_{\text{cam}} \cdot \sin(\phi) \\
     z &= R_{\text{cam}} \cdot \cos(\phi) \cdot \cos(\theta)
     \end{aligned}$$
   - Camera smoothly glides with spherical lerp: `camera.position.lerp(targetCamPos, 0.08); camera.lookAt(cameraTarget);`.

### 14.2 Seamless Drag Classification & Cursor UX (v039.28)
- **Immediate Mouse Coordinate Normalization**:
  - `onMouseDown` and `onTouchStart` immediately compute normalized device coordinates (`mouse.x = (clientX / innerWidth) * 2 - 1`, `mouse.y = -(clientY / innerHeight) * 2 + 1`) prior to raycasting, eliminating stale coordinate desynchronization on initial click.
- **Generous Spatial Bounding Hit Volume ($R_{\text{bound}} \le 5.2$)**:
  - Rather than relying solely on ray intersections against thin, semi-transparent face planes (`opacity: 0.035`) which could pass between wireframe struts or miss rotated angles, the engine evaluates the perpendicular distance from the camera sightline ray to the cube origin $(0, 0, 0)$:
    $$d_{\text{ray}} = \text{raycaster.ray.distanceToPoint}((0, 0, 0))$$
  - If $d_{\text{ray}} \le 5.2$ (or intersects any child mesh of `cubeGroup` / `cubePlanes`), the interaction is authoritatively classified as **Company Cube Spin** (`dragMode = 'cube'`), giving the user immediate, buttery-smooth grab-and-spin control identical to Buddy Town!
  - If $d_{\text{ray}} > 5.2$, the interaction is classified as **Celestial Cosmos Orbit** (`dragMode = 'orbit'`).
- **Hover Detection (`!isDragging`)**:
  - Over interactive objects (Idea comets, red/blue evidence nodes, protector pyramids): `cursor = 'pointer'`.
  - Over Company Cube bounding volume ($d_{\text{ray}} \le 5.2$ or `cubeGroup` hierarchy): `cursor = 'grab'`.
  - Over open celestial space / starfield ($d_{\text{ray}} > 5.2$): `cursor = 'default'`.
- **Active Drag Feedback (`isDragging`)**:
  - Dragging Company Cube: `cursor = 'grabbing'`.
  - Dragging 360° Celestial Orbit: `cursor = 'move'`.
- **Universal Right-Click & Touch Navigation**:
  - Right-click drag (or Shift-click drag) always orbits the 360° celestial cosmos regardless of where the cursor starts, allowing instant cosmos repositioning without de-selecting the cube.
  - Multi-touch: 1-finger drag on cube ($d_{\text{ray}} \le 5.2$) spins cube, 1-finger drag in open space orbits cosmos, 2-finger pinch smoothly zooms distance $R_{\text{cam}} \in [2.8, 26.0]$.

### 14.3 Distance-Driven 3D Aperture Opening
- Rather than relying on a 1D Z-axis coordinate, aperture panel sliding is governed by Euclidean 3D distance from the cube origin:
  $$d_{\text{cam}} = \|\mathbf{P}_{\text{camera}}\|, \quad \text{openAmount} = \text{clamp}\left(\frac{10.0 - d_{\text{cam}}}{6.0}, 0.0, 1.0\right)$$
- Double-clicking the cube or pressing `C` zooms into the Core Sanctuary ($R_{\text{cam}} = 3.6$), smoothly sliding the outer panels outward along their face normal vectors from whichever 360° angle the user is viewing.
- Pressing `R` or clicking `RESET [R]` restores both `targetRotation = (0.2, 0.4)` and `cameraOrbit = (0.0, 0.08)` to the default outer-space vantage point.

### 14.4 Opposing Inertial Parallax & Anti-Parallax Starfield
Anchoring the depth engine to the zero-g studio standard:
1. **Near Starfield (`starFieldNear`)**:
   - Translates smoothly toward the cursor ($+2.2 \times \text{mouse}$) with high foreground depth.
2. **Far Starfield (`starFieldFar`)**:
   - Moves in opposing anti-parallax ($-2.0 \times \text{mouse}$) creating a deep spatial sensation of cosmic infinity.
3. **Mid Starfield (`starFieldMid`)**:
   - Rotates gently with momentum-integrated velocity.

### 14.5 360° Celestial Invariant Comets & Flybys
1. **Deep-Space Idea-Verse Comets (`spawnComet`)**:
   - Spawn coordinates are constructed relative to the camera's active view frustum ($\mathbf{P}_{\text{cam}}, \mathbf{f}_{\text{cam}}, \mathbf{r}_{\text{cam}}, \mathbf{u}_{\text{cam}}$).
   - Comets emerge from the distant background starfield along the sightline ($d \approx 110-150$) and stream past the Company Cube across the user's field of view.
   - Lifecycle is distance-based ($\|\mathbf{P} - \mathbf{P}_{\text{start}}\| > d_{\text{max}}$) rather than fixed-Z, preventing orphaned meshes at any viewing angle.
2. **Near-Miss Hypersonic Flyby Comet (`triggerCameraFlybyComet`)**:
   - The hypersonic flight vector dynamically sweeps from deep background space directly past the camera's active 3D coordinates.
   - **Gravitational Slingshot Deflection**: As the flyby passes within 14 units of the Company Cube, it experiences a subtle gravitational deflection pulling toward the cube center before rocketing past the camera.
   - **Progress & Near-Miss Climax**: Flight progress $p = \frac{\|\mathbf{P} - \mathbf{P}_{\text{start}}\|}{\|\mathbf{P}_{\text{miss}} - \mathbf{P}_{\text{start}}\|}$ drives scale looming ($1.0 \to 4.8$), Doppler rocket roar sweep, screen flash gradient, and near-field cosmic ice particle generation ($p \ge 0.95$) directly in front of the camera lens.
3. **Idea-Verse Ribbon Comet (`launchIdeaVerseComet`)**:
   - Projects across the camera-relative viewplane at distance $d = 18.8$, ensuring the file badge and ribbon head glide seamlessly across the upper sky at any 360° celestial vantage.

---

## 15. Sound Architecture & Cybernetic Gem-Unfolding Chamber Opening UI (Row 9 / v039.30 - v039.31)

Following Jay's architectural specification ("number 9 is up... we can leave the pyramids inside, but we do need to work on the UI a little, to make it seem like it's opening when it is clicked!"), the visualizer introduces a fully unified audio engine and a dramatic cybernetic gem-unfolding chamber opening sequence.

### 15.1 Unified Audio Architecture
1. **Embedded Authentic Character Voice Greetings**:
   - Extracted from the master zero-g visualizer and embedded directly into `AGENTS` as permanent, self-contained base64 WAV data URIs:
     - **Ava (`AGENTS.ava.audioBase64`)**: Cybernetic neural coordinator voice greeting ($233\,\text{KB}$).
     - **Roy (`AGENTS.roy.audioBase64`)**: Tactical cybernetic intelligence voice greeting ($199\,\text{KB}$).
     - **Guz (`AGENTS.guz.audioBase64`)**: Cryptographic proofs specialist voice greeting ($307\,\text{KB}$).
   - **Zero Network Dependency**: Functions 100% offline and across `file://` / `http://` protocols with zero latency or asset path failures.
   - **Synchronized Lip-Sync & Viseme Articulation**: Directly drives the 2D HTML5 Canvas Facial Rig (`simulateVisemes(durationMs)`), matching mouth shapes (`open`, `wide`, `round`, `rest`), chin jaw-drop warp, and eyelid micro-gaze tracking to the active audio waveform.
   - **Speech Synthesis Fallback**: If browser autoplay policies temporarily restrict media elements, the engine seamlessly falls back to synthesized Web Speech API (`speakPhrase`).
2. **Dedicated Voice Replay Button (`#btn-replay-voice`)**:
   - An interactive glowing button with an animated 3-bar audio equalizer (`#voice-eq-bars`) positioned right below the spoken caption box.
   - Users can replay the agent's real voice lines on demand at any time without closing and re-opening the chamber.
3. **Procedural Sound Suite (`CosmicAudio`)**:
   - **Dark Matter Sub-Bass Drone**: $48\,\text{Hz} - 55\,\text{Hz}$ dual-oscillator continuous deep-space drone.
   - **Aperture Swoosh**: Resonant bandpass filter sweep accompanying cube panel opening and chamber expansion.
   - **Pentatonic Stardust Chimes**: Velocity-scaled crystalline chimes triggered by cursor movement through the starlight field.
   - **Marble Impact Clicks**: ASMR tactile triangle-wave micro-clicks ($1450 - 2300\,\text{Hz}$) emitted during physical collisions inside the purple containment chamber.
   - **Hypersonic Doppler Rocket Roar**: 3D distance-scaled frequency swell ($90\,\text{Hz} \to 680\,\text{Hz}$) with stereo panning for near-miss flyby comets.
   - **Synaptic Lightning Zaps**: High-frequency electrical discharge crackles during query execution.
   - **Shockwave Booms**: Resonant $65\,\text{Hz}$ explosive detonations when catching comets or executing major consensus events.

### 15.2 Cybernetic Gem-Unfolding Chamber Opening Sequence
1. **3D Camera Approach & Aperture Unfolding**:
   - Clicking an agent pyramid (or pressing `1`, `2`, `3`, or clicking the bottom camera dock) immediately zooms the camera to distance $R_{\text{cam}} = 4.8$.
   - Because the 3D aperture opening is distance-driven ($\text{openAmount} = \text{clamp}((10.0 - d_{\text{cam}})/6.0, 0, 1)$), approaching the Core Sanctuary causes the Company Cube's glass panels to glide outward along their normal vectors, revealing the interior in real time!
2. **Polygonal Gem-Aperture Keyframe Expansion (`.gem-chamber-unfold`)**:
   - The chamber dialog (`#agent-chamber-card`) executes an authentic cybernetic geometric unfold:
     $$\text{clip-path: } \text{polygon}(50\% \, 0\%, 100\% \, 50\%, 50\% \, 100\%, 0\% \, 50\%) \longrightarrow \text{polygon}(0 \, 0, 100\% \, 0, 100\% \, 100\%, 0 \, 100\%)$$
   - Begins at scale $0.22$ with a $-5^\circ$ cant, expanding through a luminous chromatic bloom (`blur(14px)`, `brightness(2.6)`, electric cyan and amethyst shadows) before locking seamlessly into full scale at $0.52\,\text{s}$.
3. **Dynamic Holographic Iris Shutter Burst (`.iris-shutter-burst`)**:
   - A radiant neon cyan/violet circular iris ring rapidly expands from scale $0.1 \to 2.2$ across the viewport, visually telegraphing the holographic aperture activation.
4. **Synaptic Lightning Surge**:
   - Concurrently triggers `spawnSynapticLightning(key, isDatabaseOutage)`, arcing an electric jagged plasma bolt between the agent's pyramid and the central Sun.

---

## 16. UI & Outage Simulation Suite (Row 10 / v039.32 - v039.33)

Following the master visualizer comparison specification ("Clean Bottom Dock + Collapsible Telemetry Drawer + Full Outage Simulator & Evidence Modals"), the visualizer finalizes its environmental matrix controls, unified HUD architecture, and comprehensive outage simulation suite.

### 16.1 Collapsible Telemetry & Environmental Matrix Drawer (`#side-matrix-drawer`)
- **HUD Trigger**: Added a dedicated top-right control button:
  `<button id="btn-toggle-matrix"> 📊 TELEMETRY MATRIX </button>`
  toggling a slide-out glass drawer (`#side-matrix-drawer`, `w-88`, backdrop blur, cyber cyan border) from the right margin.
- **Section 1: Zero-G Fluid Dynamics**:
  - **Flow Rate Slider (`#slider-speed`, $0.2\times \to 3.0\times$)**: Directly modulates particle flow velocity $M_{\text{flow}}$ in real time with live numeric readout (`#speed-val`).
  - **Viscosity Damping Slider (`#slider-visc`, $0.5\times \to 2.5\times$)**: Controls viscous deceleration and Brownian swirl resistance (`#visc-val`).
  - **Fluid Caustics Membrane (`#check-caustics`)**: Toggles sparkling gem starlight particle scales ($1.2 \leftrightarrow 2.5$).
- **Section 2: Runtime State Simulator**:
  - Interactive dual switches: `READY (Nominal)` and `OUTAGE (Dying)`.
  - Live status indicator badge: `CONNECTED` (emerald `#10b981`) vs. `DISCONNECTED` (crimson `#f43f5e`).
- **Section 3: Spatial Vantage Presets**:
  - `🌌 Orbit 360°`: Restores standard outer celestial orbit ($R_{\text{cam}} = 14.0$).
  - `🔬 Core Sanctuary`: Zooms into the inner sanctuary ($R_{\text{cam}} = 3.6$), automatically sliding aperture panels open.
  - `🔄 Reset Camera Angle`: Re-centers target rotation and celestial orbit angles to default $(0.2, 0.4)$.
- **Section 4: Live Environmental Telemetry**:
  - Live count: $750$ Corridor Starlight Particles, $28$ Shard Evidence Nodes, dynamic ingested idea comets counter.
  - Containment Field Integrity: $100\%$ Locked vs. $0\%$ Collapsed.
  - Gravitational Mode: Zero-G Levitation vs. Newtonian Gravity ($-18.0\,\text{m/s}^2$).

### 16.2 Unified Refined Bottom Control Dock
Consolidates all HUD controls into an elegant, dual-wing floating glass dock (`bottom-6 left-6 right-6`):
- **Left Wing (HUD Toggles & Hyper Flyby)**:
  - **Node Labels Checkbox (`#toggle-node-names`)**: Toggles 3D billboard sprite labels above all 28 red shard nodes and ingested blue comets.
  - **Protector Pyramids Checkbox (`#toggle-pyramids`)**: Toggles visibility of all 3 electron protector pyramid groups.
  - **Idea Comets Checkbox (`#toggle-comets`)**: Toggles spawning and rendering of deep-space idea-verse comets.
  - **Flyby Comet Trigger (`#trigger-flyby-btn`)**: Instantly launches the near-miss hypersonic flyby comet with Doppler roar and screen flare.
  - **200% Glow Lock Badge**: Permanent visual indicator verifying cybernetic lattice illumination standard.
- **Right Wing (Agent Quick Selector & View Controls)**:
  - **Roy (Gold) [1]**: Instant approach and gem-unfold chamber opening for Roy.
  - **Ava (Violet) [2]**: Instant approach and gem-unfold chamber opening for Ava.
  - **Guz (Green) [3]**: Instant approach and gem-unfold chamber opening for Guz.
  - **Zoom [C]**: Toggles core sanctuary camera zoom and aperture sliding.
  - **Reset [R]**: Restores default celestial vantage.

### 16.3 Full Outage & Recovery Simulation Suite
- **Severing Database Cluster (`SIMULATE OUTAGE`)**:
  1. Sun collapses from incandescent gold fusion into a cold, dark dying ember cinder.
  2. Outer lattice wireframes and purple containment struts turn dark corrupted crimson/shadow violet.
  3. Cypher mandala discs slow to an $8\%$ stasis crawl with dimmed phantom opacity.
  4. Internal artificial zero-g containment collapses: all 28 red shard nodes and blue ingested comet nodes lose anti-gravity lock and fall into cardboard box marble physics, settling on the lowest physical wall of the purple containment frame.
  5. Tilting the cube via mouse drag dynamically rolls marbles across the floor with centrifugal wall-drag, mutual pairwise collisions, and tactile ASMR clicks (`CosmicAudio.playMarbleClick`).
  6. Starlight fluid particles enter high-speed agitated Brownian jitter with flickering crimson embers.
  7. Terminal queries return `503 Service Unavailable: FalkorDB cluster disconnected` with fail-closed cryptographic immutability.
- **Restoring Database Cluster (`RESTORE DATABASE`)**:
  1. Internal shard and idea nodes harmonically levitate back to their celestial constellation positions (`node.position.lerp(basePos, 0.045)`).
  2. Red graph quaternion smoothly slerps back to $50\%$ counter-rotation.
  3. Sun reignites with an explosive celebratory Coronal Mass Ejection flare burst.
  4. Starlight fluid returns to peaceful laminar drift ($28\%$ speed).
  5. Telemetry drawer and HUD badges instantly update to `CONNECTED` and `100% Locked`.

---

## 17. Preservation of Foundation Features

All interactive systems remain fully functional:
1. **Synaptic Query Terminal**: NLP cypher queries, quick chips, and live logs.
2. **2D Canvas Face Rig**: Real-time pupil tracking, natural blinking, jaw drop articulation, and proximity smiles.
3. **Procedural Web Audio**: Continuous sub-bass drone, shockwave boom, pointer-velocity stardust chimes, spark pop pings, and tactile marble clicks.
4. **Deep-Space 3-Layer Parallax**: Opposing cursor parallax across near, mid, and far starfields.
5. **Red Graph Counter-Rotation**: Organic 28-node constellation counter-rotating at 50% speed.
6. **IdeaVerse Comets & Near-Miss Flybys**: Deep space comets, hypersonic Doppler flybys, 10-document narrative ledger, and zero-write outage rejection.
7. **The Fiery Sun Core**: Dynamic turbulent plasma mantle, 6 magnetic prominence loops, CME flare pulses, and 3-axis Cypher mandala.
8. **Three Orbiting Protector Pyramids**: Traveling electron shells, calibrated orbital clearance ($2.05, 2.35, 2.65$), inside-cube placement, and synaptic lightning trigger.
9. **Option A Interstitial Containment Corridor**: 750 starlight particles circulating strictly within $[2.82, 3.32]$.
10. **Calm vs. Chaotic Velocity Modulation**: $28\%$ calm synchronized laminar drift when online vs. $100\%$ agitated turbulent Brownian jitter during outage.
11. **Purple Containment Frame & Travelling Light-Balls**: 12 neon struts, 8 corner beacons, 6 forcefield panels, Orocue perimeter race, and $0.62\,\text{s}$ spark explosions.
12. **Cardboard Box Marble Physics**: Outage antigravity failure, tilting gravity, centrifugal spin drag, 2-pass marble collisions, and smooth reconnection levitation.
13. **The Eldritch Cypher Shader Mandala**: 2048px super-sampled runic canvas, 3-axis gyroscopic momentum, concentric harmonic resonance rings, and chromatic flare pulses.
14. **Dual-Rotation & 360° Celestial Cosmos**: Independent Company Cube spin with generous $5.2$ radius spatial bounding hit volume, 360° spherical camera orbit, Euclidean aperture sliding, opposing starfield anti-parallax, and invariant 3D comet trajectories.
15. **Unified Sound Architecture**: Ambient procedural audio + authentic embedded base64 voice greetings for Ava, Roy, and Guz + replay voice button + gem-unfolding chamber opening UI.
16. **UI & Outage Simulation Suite**: Collapsible Telemetry Matrix drawer, fluid flow/viscosity sliders, runtime state switches, unified bottom control dock, and complete outage/recovery suite.

---

## 18. Roadmap Completion Summary: 100% COMPLETE!

All 10 milestone rows across the 3D Space Visualizer roadmap are now **100% COMPLETE, VERIFIED, DOCUMENTED, AND SYNCHRONIZED**:
- **Row 1**: The Cube & Aperture (200% Lattice Glow + 3D sliding aperture panels)
- **Row 2**: Internal Red Graph & Rotation (50% counter-rotation, interactive node evidence, ledger modal)
- **Row 3**: Zero-G Fluid & Data Articles (750 jewel starlight particles, Option A containment corridor, eddy wakes)
- **Row 4**: The Sun (Source of Truth) (Multi-layer plasma mantle, 6 prominence loops, CME flares)
- **Row 5**: Orbiting Pyramids & Agents (Inside-cube calibrated orbits, synaptic lightning, gem-unfold chamber opening)
- **Row 6**: Synaptic Query Terminal (Interactive NLP Cypher terminal, 3D electric lightning arcs, logs)
- **Row 7**: Idea-Verse Comets (Deep space comets, hypersonic Doppler flybys, 10-document narrative ledger, zero-write outage rejection)
- **Row 8**: Background Starfield (3-Layer starfield, opposing parallax & anti-parallax, dual-rotation 360° celestial cosmos)
- **Row 9**: Sound Architecture (Unified procedural audio + authentic embedded base64 voice greetings for Roy, Ava, Guz + replay button)
- **Row 10**: UI & Outage Simulation Suite (Collapsible Telemetry Matrix drawer, fluid sliders, unified bottom dock, full outage simulator)

### 18.1 Final Element-by-Element Sanity Sweep & Polish (`v039.34`)
- **Universal Escape & Close Handler**: `Escape` key now universally closes all open modals and drawers, including `#side-matrix-drawer`, `#outage-rejection-modal`, `#node-info-modal`, `#comet-info-modal`, `#evidence-modal`, `#human-modal`, `#guide-modal`, and `#idea-modal`.
- **Bidirectional Telemetry Matrix Synchronization**: Toggling outage (via either the HUD button or the drawer buttons) actively updates drawer badges:
  - `CONNECTED` (`#10b981`) $\leftrightarrow$ `DISCONNECTED` (`#f43f5e`)
  - `100% Locked` $\leftrightarrow$ `0% Collapsed`
  - `Zero-G Levitation` $\leftrightarrow$ `Newtonian Gravity (-18 m/s²)`
  - Active button highlights for `READY (Nominal)` vs `OUTAGE (Dying)`.
- **Zero DOM ID Mismatches**: 115/115 `getElementById` lookups verified with exact matches in the DOM.
- **Three-Mirror Synchronization**: All 3 visualizer mirrors (`apps/web/public/art/cubes_of_knowledge_3d.html`, `Gem's Art Studio/cubes_of_knowledge_3d.html`, and `cubes_of_knowledge_3d.html` artifact) are byte-for-byte locked with SHA-256 `3700C40C49BC3D535923460BF5F69683E811D59D22DB3AB28B17F7571A373A21`.

### 18.2 Top-Left Header & Status Ribbon FalkorDB Alignment (`v039.35` / `v039.36`)
- **FalkorDB Core Version Matching**: Synchronized top-left header breadcrumb from generic "Cubes of Knowledge 3D Engine v2.0" to explicit `FalkorDB v6.8.0 • 3D Space Visualizer`.
- **Runtime Status Ribbon**: Updated `#db-status-label` to display `FALKORDB v6.8.0 CORE // STATUS: AVAILABLE` (and `UNAVAILABLE (OUTAGE)` during severed database state).
- **Three-Mirror Synchronization**: All 3 visualizer mirrors locked with SHA-256 `1B03778C6014D3BD76846BF82FE93B230F7DEAAB3D4E3BB6D1ABDF27B328A816`.

### 18.3 Dynamic Lattice Integrity Tri-State Architecture (`v039.37` / `v039.38`)
- **Lattice Integrity Badge**: Upgraded top-bar badge to `LATTICE INTEGRITY:` with dynamic multi-state styling:
  1. **Protected (Nominal)**: Glowing cyan border, pulsing cyan beacon, and cyber-cyan badge (`Protected`).
  2. **Vulnerable (Simulated Outage)**: Deep amber border, pulsing amber beacon, dark amber background, and deep amber shadow (`Vulnerable`).
  3. **Failing (Real Outage / Critical Loss)**: High-intensity crimson border, pulsing red beacon, bright red badge, and incandescent red glow (`Failing`).
- **Telemetry Drawer Runtime Switches**: Enhanced Section 2 with 3-way toggle buttons: `🟢 READY (Protected)`, `🟡 SIMULATE (Vulnerable)`, and `🔴 OUTAGE (Failing)`.
- **Three-Mirror Synchronization**: All 3 visualizer mirrors locked with SHA-256 `93708F96F2993442D87795DA14A58C829FA211773C7BF91FA696FAAB615B363A`.

### 18.4 Drag Thresholding & Generous Cube Grab Interaction (`v039.39` / `v039.40`)
- **Drag Distance Thresholding**: Implemented professional 4px movement threshold (`hasMovedDuringDrag`) that cleanly distinguishes intentional cube drags from object clicks. Clicking and dragging anywhere inside the cube now immediately and reliably spins the Company Cube without accidental node selection or modal interruption.
- **Generous 6.2 Spatial Radius**: Expanded cube interaction radius to $6.2$ (covering all 8 outer corners and purple containment frame), eliminating missed click slips.
- **Click-through Guard**: Clicking on the 3D canvas is disabled while the agent chamber is open, preventing accidental field manipulation.
- **Three-Mirror Synchronization**: All 3 visualizer mirrors locked with SHA-256 `8F28A3CC32ECA0B412FBED6657E186AB5828C2F0A0AB64D1B7486847F0650B31`.

### 18.5 Bottom Dock Redundancy Cleanup (`v039.41` / `v039.42`)
- **Dock Streamlining**: Removed redundant 200% glow indicator badge from the left wing of the unified bottom control dock, leaving primary integrity and status readouts consolidated in the top HUD status ribbon.
- **Three-Mirror Synchronization**: All 3 visualizer mirrors locked with SHA-256 `D56778F7E72AEB9ED43F18F090404958A001B08160FA5A673E9DE521C7DD3539`.

### 18.6 Bidirectional IdeaVerse Comets Indicator Synchronization (`v039.43` / `v039.44`)
- **Bidirectional State Synchronization**: Unified `setCometsEnabled(enabled)` so that toggling either the top HUD button (`#comets-toggle-btn`) or the bottom dock checkbox (`#toggle-comets`) instantaneously synchronizes both elements:
  - Top HUD button text (`COMETS: ON` vs `COMETS: OFF`)
  - Top HUD beacon dot (`bg-cyan-400 animate-pulse` vs `bg-slate-500`)
  - Top HUD container style (active cyber-cyan glass vs inactive muted slate glass)
  - Bottom dock checkbox state (`toggle-comets.checked = showComets`)
- **Active Lifecycle Management**: Disabling comets cleanly sweeps all active deep-space comets, cancels near-miss flyby sounds, resets screen flashes, and hides ribbon trails. Enabling comets immediately seeds the next cosmic trajectory.
- **Three-Mirror Synchronization**: All 3 visualizer mirrors locked with SHA-256 `81A8D3FAF5B2C66F9154FDD2DFB3F4FF967C751E591F6F8CAECA394E6241FACD`.








