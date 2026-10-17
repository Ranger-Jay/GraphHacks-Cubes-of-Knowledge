# Space Visualizer v039 Specification: Unified Engine Roadmap

- **Branch**: `gem/space-visualizer-v039`
- **Release Versions**: 
  - `v039.00` (Item 1: 200% Lattice Glow & Aperture Implementation)
  - `v039.01` (Item 1: Lattice Architecture Documentation & Tags)
  - `v039.02` (Item 2: Counter-Rotating Red Node Graph & Relationship Inspection)
  - `v039.03` (Item 2: Red Graph Architecture Documentation & Tags)
  - `v039.04` (Item 3: Deep-Space Comets, Intercept Modal & Cube Ingestion)
  - `v039.05` (Item 3: Comet Architecture Documentation & Tags)
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

## 5. Preservation of Foundation Features

All interactive systems remain fully functional:
1. **Synaptic Query Terminal**: NLP cypher queries, quick chips, and live logs.
2. **2D Canvas Face Rig**: Real-time pupil tracking, natural blinking, jaw drop articulation, and proximity smiles.
3. **Procedural Web Audio**: Continuous sub-bass drone, shockwave boom, and pointer-velocity stardust chimes.
4. **Deep-Space 3-Layer Parallax**: Opposing cursor parallax across near, mid, and far starfields.

---

## 6. Next Step on the Roadmap

- **Item 4: The Fiery Sun Core**: Dynamic plasma mantle wireframe, pulsating solar flares, prominences, and rotating concentric cypher mandala dials.
