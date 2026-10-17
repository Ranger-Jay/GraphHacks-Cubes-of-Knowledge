# Space Visualizer v039 Specification: 200% Lattice Wireframe Glow & Aperture Containment

- **Branch**: `gem/space-visualizer-v039`
- **Release Versions**: `v039.00` (Implementation), `v039.01` (Documentation & Architecture)
- **Primary Source**: `apps/web/public/art/cubes_of_knowledge_3d.html`
- **Studio Mirrors**: `Gem's Art Studio/cubes_of_knowledge_3d.html`

---

## 1. Executive Summary & Objective

In this iteration (Item 1 of the unified 3D visualizer roadmap), we merged the acclaimed **200% Lattice Wireframe Glow** and **8 Corner Beacon Spheres** into the rich interactive foundation of `cubes_of_knowledge_3d.html`. This combines the breathtaking radiant depth of the visualizer wireframe with the complete suite of interactive capabilities (the Synaptic Query Terminal, procedural Web Audio synth, real-time canvas face rig, and sliding aperture containment field).

---

## 2. Architectural Components

### 2.1 Dual-Pass 200% Lattice Wireframe Glow
The standard single-pass wireframe has been replaced with a dual-pass chromatic additive lattice:
1. **Primary Structural Line Lattice (`wireframeCube`)**:
   - Geometry: `THREE.WireframeGeometry(THREE.BoxGeometry(size, size, size))`
   - Material: `THREE.LineBasicMaterial`
   - Color: Electric Cyan (`0x00e5ff`)
   - Opacity: `0.98`
   - Linewidth: `3`
   - Blending: `THREE.AdditiveBlending`
2. **Secondary Chromatic Aura Halo (`wireframeCubeAura`)**:
   - Geometry: Shared `THREE.WireframeGeometry`
   - Material: `THREE.LineBasicMaterial`
   - Color: Chromatic Deep Cyan/Blue (`0x0088ff`)
   - Opacity: `0.80`
   - Linewidth: `1`
   - Scale: Uniform expansion at `(1.012, 1.012, 1.012)`
   - Blending: `THREE.AdditiveBlending`

This two-tier additive structure produces the distinctive volumetric bloom and radiant intensity observed at 200% lattice wireframe glow, creating optical depth without requiring heavy post-processing passes.

### 2.2 Corner Beacon Spheres
At all 8 geometric vertices of the company cube (`[±halfSize, ±halfSize, ±halfSize]`), radiant beacon spheres are anchored to `cubeGroup`:
- Geometry: `THREE.SphereGeometry(0.18, 16, 16)`
- Material: `THREE.MeshBasicMaterial` with `color: 0x00ffff`, `transparent: true`, `opacity: 0.95`, `blending: THREE.AdditiveBlending`
- Dynamic Pulsing: In the `animate()` loop, each beacon pulses with a staggered phase offset:
  ```javascript
  cornerBeacons.forEach((b, i) => {
      b.scale.setScalar(1.0 + Math.sin(time * 3.5 + i) * 0.14);
  });
  ```

### 2.3 Sliding Aperture Containment Field
Retained from the core sanctuary architecture, 6 translucent crystalline glass panels form the faces of the cube (`PlaneGeometry(size, size)`):
- Material: `0x00e5ff`, `opacity: 0.035`, `side: THREE.DoubleSide`, `depthWrite: false`.
- Outward Normal Vector Translation: On camera zoom (via double-click or scroll wheel into the cube), each plane smoothly translates along its outward normal direction vector `openDir`:
  ```javascript
  const openAmount = Math.max(0, Math.min(1, (10.0 - camera.position.z) / 6.0));
  cubePlanes.forEach(p => {
      if (p.userData && p.userData.initialPos && p.userData.openDir) {
          const offset = p.userData.openDir.clone().multiplyScalar(openAmount * 2.2);
          p.position.copy(p.userData.initialPos).add(offset);
          p.material.opacity = 0.04 + (1 - openAmount) * 0.04;
      }
  });
  ```

### 2.4 Outage Simulation & State Degradation
The outage toggle listener (`outage-toggle-btn`) cleanly degrades and restores the 200% lattice glow:
- **Outage Active**:
  - `wireframeCube` turns blood crimson (`0x8a1020`)
  - `wireframeCubeAura` turns deep ember (`0x400010`)
  - `cornerBeacons` dim to dark maroon (`0x550000`)
- **Restored State**:
  - `wireframeCube` returns to electric cyan (`0x00e5ff`)
  - `wireframeCubeAura` returns to chromatic cyan (`0x0088ff`)
  - `cornerBeacons` return to brilliant aqua (`0x00ffff`)

### 2.5 HUD Status Integration
A dedicated glowing badge was added to the top-right HUD overlay:
```html
<div class="flex items-center space-x-2 text-xs font-mono px-3 py-1.5 rounded-xl hud-glass border border-cyan-400/50 shadow-[0_0_15px_rgba(0,229,255,0.35)]">
    <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#00e5ff]"></span>
    <span class="text-cyan-300 font-bold uppercase tracking-wider">LATTICE GLOW:</span>
    <span class="px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-200 border border-cyan-500 font-mono font-bold text-[10px] shadow-[0_0_12px_#00e5ff]">200% LOCKED</span>
</div>
```

---

## 3. Preservation of Baseline Features

All features from the prior iteration remain intact:
1. **Synaptic Query Terminal**: Interactive NLP cypher interface with real-time prompt chips and response log.
2. **Procedural Web Audio Synth**: Ambient sub-bass drone and stardust chimes linked to pointer velocity.
3. **Face Rig Engine**: Multi-expression 2D canvas rig supporting micro-saccades, blinking, speech-driven jaw articulation, and dashboard-proximity smile response.
4. **Deep-Space 3-Layer Parallax**: Foreground stardust with high parallax, mid-field starlight, and pinpoint distant celestial backdrop.

---

## 4. Next Step on the Roadmap

- **Item 2: The Red Node Graph**: Random topology inside the cube, counter-rotating at 50% speed in the opposite direction of cube rotation, with click-to-inspect relationship panels.
