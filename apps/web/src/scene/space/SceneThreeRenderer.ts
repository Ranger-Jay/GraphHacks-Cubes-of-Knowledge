import * as THREE from 'three';
import type { AgentId, GraphNode, GraphEdge, SpaceSceneSnapshot } from '@cubes/contracts';

export type CubeFocus = 'main' | 'disconnected';

export const MAIN_CUBE_SIZE = 6.4;
export const DISCONNECTED_CUBE_SIZE = 4.6;
export const MIN_CUBE_GAP = 2 * MAIN_CUBE_SIZE;
export const MAIN_CUBE_POS = new THREE.Vector3(0, 0, 0);
export const MAIN_CUBE_CAM_POS = new THREE.Vector3(0, 3.2, 12.5);
export const MAIN_CUBE_LOOK_AT = new THREE.Vector3(0, 0, 0);

// Four main-cube widths between centers leaves at least two full widths of
// empty space even when both cubes rotate their corners toward each other.
export const DISCONNECTED_CUBE_POS = new THREE.Vector3(4 * MAIN_CUBE_SIZE, 0.5, -2.0);
export const DISCONNECTED_CAM_POS = DISCONNECTED_CUBE_POS.clone().add(new THREE.Vector3(4.4, 1.8, 7.0));
export const DISCONNECTED_LOOK_AT = DISCONNECTED_CUBE_POS.clone();

export interface SceneThreeCallbacks {
  onSunClick: () => void;
  onNodeClick: (nodeId: string) => void;
  onAgentClick: (agentId: AgentId) => void;
  onCometClick: (ideaId: string) => void;
  onCubeFocusChange?: (focus: CubeFocus) => void;
}

export class SceneThreeRenderer {
  private container: HTMLElement;
  private callbacks: SceneThreeCallbacks;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private isDisposed = false;

  // Cube Focus & Multi-Cube Camera Navigation
  private cubeFocus: CubeFocus = 'main';
  private cameraTargetLookAt = new THREE.Vector3(0, 0, 0);
  private cameraTargetPosition = new THREE.Vector3(0, 3.2, 12.5);
  private currentLookAt = new THREE.Vector3(0, 0, 0);

  // Scene Objects (Main Cube)
  private cubeGroup: THREE.Group | null = null;
  private sunGroup: THREE.Group | null = null;
  private sunSphere: THREE.Mesh | null = null;
  private sunPlasmaShroud: THREE.Mesh | null = null;
  private innerSun: THREE.Mesh | null = null;
  private sunHitSphere: THREE.Mesh | null = null;
  private coronaRing1: THREE.Mesh | null = null;
  private coronaRing2: THREE.Mesh | null = null;
  private torusProminence: THREE.Mesh | null = null;
  private wireframeCube: THREE.LineSegments | null = null;
  private wireframeCubeAura: THREE.LineSegments | null = null;
  private purpleFrameGroup: THREE.Group | null = null;
  private purpleStruts: THREE.Mesh[] = [];
  private purpleBeacons: THREE.Mesh[] = [];
  private cornerSpheres: THREE.Mesh[] = [];
  private electronBeads: Array<{ mesh: THREE.Mesh; orbitRadius: number; baseAngle: number; speed: number; tilt: THREE.Euler }> = [];
  private starfield: THREE.Points | null = null;
  private starfieldGroup: THREE.Group | null = null;
  private starfieldFar: THREE.Points | null = null;
  private starfieldNear: THREE.Points | null = null;
  private starLayers: THREE.Points[] = [];

  // Parallax & Inertia (Dynamic Visualizer Depth)
  private mouseParallax = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    vx: 0,
    vy: 0,
    lx: 0,
    ly: 0,
    lt: performance.now(),
  };
  private mouse3D = new THREE.Vector3();
  private prevMouse3D = new THREE.Vector3();
  private mouseVelocity3D = new THREE.Vector3();
  private mousePlane = new THREE.Plane();

  // Fluid Anti-Gravity Starlight
  private liquidParticlesInside: THREE.Points | null = null;
  private liquidPositions: Float32Array | null = null;
  private liquidVels: Float32Array | null = null;
  private liquidColors: Float32Array | null = null;
  private liquidBaseColors: Float32Array | null = null;

  private sunLight: THREE.PointLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private nodesGroup: THREE.Group | null = null;
  private edgesMesh: THREE.LineSegments | null = null;
  private pyramidsGroup: THREE.Group | null = null;
  private cometsGroup: THREE.Group | null = null;

  // Scene Objects (Disconnected Comparison Cube)
  private disconnectedCubeGroup: THREE.Group | null = null;
  private disconnectedSunGroup: THREE.Group | null = null;
  private disconnectedSunSphere: THREE.Mesh | null = null;
  private disconnectedInnerSun: THREE.Mesh | null = null;
  private disconnectedCoronaRing1: THREE.Mesh | null = null;
  private disconnectedCoronaRing2: THREE.Mesh | null = null;
  private disconnectedWireframe: THREE.LineSegments | null = null;
  private disconnectedCornerSpheres: THREE.Mesh[] = [];
  private disconnectedDebrisGroup: THREE.Group | null = null;

  // Interaction State
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private isDragging = false;
  private dragStartPos = { x: 0, y: 0 };
  private previousMousePos = { x: 0, y: 0 };
  private pendingClickObj: THREE.Object3D | null = null;
  private lastSunClickTime = 0;

  // Animation State
  private startTime = performance.now();
  private lastTime = performance.now();
  private reducedMotion = false;
  private currentSnapshot: SpaceSceneSnapshot | null = null;

  // 360° Celestial Cosmos Orbit & Dual-Rotation
  private dragMode: 'cube' | 'orbit' | null = null;
  private cameraOrbit = { theta: 0.0, phi: 0.251 };
  private cameraDistance = 12.903;

  // Bound Event Handlers for Reliable Removal
  private handleResizeBound: () => void;
  private handlePointerDownBound: (e: PointerEvent) => void;
  private handlePointerMoveBound: (e: PointerEvent) => void;
  private handlePointerUpBound: (e: PointerEvent) => void;
  private handleClickBound: (e: MouseEvent) => void;
  private handleVisibilityChangeBound: () => void;
  private handleContextMenuBound: (e: MouseEvent) => void;

  constructor(container: HTMLElement, callbacks: SceneThreeCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.handleResizeBound = this.handleResize.bind(this);
    this.handlePointerDownBound = this.handlePointerDown.bind(this);
    this.handlePointerMoveBound = this.handlePointerMove.bind(this);
    this.handlePointerUpBound = this.handlePointerUp.bind(this);
    this.handleClickBound = this.handleClick.bind(this);
    this.handleVisibilityChangeBound = this.handleVisibilityChange.bind(this);
    this.handleContextMenuBound = (e: MouseEvent) => e.preventDefault();

    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // Headless / Node testing environment fallback
      return;
    }

    try {
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x010207, 0.022);
      const width = this.container.clientWidth || 800;
      const height = this.container.clientHeight || 600;

      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.camera.position.copy(MAIN_CUBE_CAM_POS);
      this.camera.lookAt(MAIN_CUBE_LOOK_AT);
      this.cameraTargetPosition.copy(MAIN_CUBE_CAM_POS);
      this.cameraTargetLookAt.copy(MAIN_CUBE_LOOK_AT);
      this.currentLookAt.copy(MAIN_CUBE_LOOK_AT);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.canvas = this.renderer.domElement;
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.tabIndex = 0;
      this.container.appendChild(this.canvas);

      // Build 3D Objects
      this.buildLighting();
      this.buildStarfield();
      this.buildCompanyCube();
      this.buildFluidAntiGravityStarlight();
      this.buildCornerSpheres();
      this.buildSunCore();
      this.buildAgentPyramids();
      this.buildDisconnectedCube();

      this.nodesGroup = new THREE.Group();
      this.scene.add(this.nodesGroup);

      this.cometsGroup = new THREE.Group();
      this.scene.add(this.cometsGroup);

      // Attach Listeners
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('resize', this.handleResizeBound);
      }
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', this.handleVisibilityChangeBound);
      }
      this.canvas.addEventListener('pointerdown', this.handlePointerDownBound);
      this.canvas.addEventListener('pointermove', this.handlePointerMoveBound);
      this.canvas.addEventListener('pointerup', this.handlePointerUpBound);
      this.canvas.addEventListener('click', this.handleClickBound);
      this.canvas.addEventListener('contextmenu', this.handleContextMenuBound);

      // Start Render Loop
      this.startLoop();
    } catch {
      // Graceful fallback for mock or unsupported WebGL in unit test contexts
      this.renderer = null;
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.lastTime = performance.now();
      this.mouseParallax.vx = 0;
      this.mouseParallax.vy = 0;
      this.mouseParallax.lt = performance.now();
      this.mouseVelocity3D.set(0, 0, 0);
    }
  }

  private buildLighting(): void {
    if (!this.scene) return;
    this.ambientLight = new THREE.AmbientLight(0x0f172a, 0.8);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.PointLight(0xffb300, 2.2, 25);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);
  }

  private buildStarLayer(
    count: number,
    minR: number,
    maxR: number,
    pointSize: number,
    opacity: number,
    rotMult: number,
    posMult: number
  ): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseColors = new Float32Array(count * 3);
    const twinklePhases = new Float32Array(count);
    const twinkleSpeeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const r = minR + Math.random() * (maxR - minR);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      const c = Math.random();
      let cr = 0.92, cg = 0.95, cb = 1.0;
      if (c > 0.75) {
        cr = 0.0; cg = 0.90; cb = 1.0; // Cyan
      } else if (c > 0.55) {
        cr = 0.70; cg = 0.53; cb = 1.0; // Violet
      } else if (c > 0.35) {
        cr = 1.0; cg = 0.85; cb = 0.35; // Amber
      }

      colors[i3] = cr;
      colors[i3 + 1] = cg;
      colors[i3 + 2] = cb;

      baseColors[i3] = cr;
      baseColors[i3 + 1] = cg;
      baseColors[i3 + 2] = cb;

      twinklePhases[i] = Math.random() * Math.PI * 2;
      twinkleSpeeds[i] = 0.4 + Math.random() * 1.6;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });

    const points = new THREE.Points(geo, mat);
    points.userData = {
      rotMultiplier: rotMult,
      posMultiplier: posMult,
      baseColors,
      twinklePhases,
      twinkleSpeeds,
      count,
    };
    this.starLayers.push(points);
    return points;
  }

  private buildStarfield(): void {
    if (!this.scene) return;
    this.starfieldGroup = new THREE.Group();
    this.scene.add(this.starfieldGroup);
    this.starLayers = [];

    // Layer 1: Far Starfield (Distant pinpoint cosmos)
    this.starfieldFar = this.buildStarLayer(1200, 110.0, 280.0, 0.22, 0.85, 0.035, 0.0);
    this.starfieldGroup.add(this.starfieldFar);

    // Layer 2: Mid Starfield (Medium celestial depth)
    this.starfield = this.buildStarLayer(1400, 45.0, 110.0, 0.32, 0.88, 0.085, 1.3);
    this.starfieldGroup.add(this.starfield);

    // Layer 3: Near Starfield (Reactive foreground stardust with high parallax)
    this.starfieldNear = this.buildStarLayer(400, 16.0, 45.0, 0.45, 0.95, 0.175, 2.8);
    this.starfieldGroup.add(this.starfieldNear);
  }

  private buildFluidAntiGravityStarlight(): void {
    if (!this.cubeGroup) return;

    const count = 360;
    const geo = new THREE.BufferGeometry();
    this.liquidPositions = new Float32Array(count * 3);
    this.liquidVels = new Float32Array(count * 3);
    this.liquidColors = new Float32Array(count * 3);
    this.liquidBaseColors = new Float32Array(count * 3);

    const twinklePhases = new Float32Array(count);
    const twinkleSpeeds = new Float32Array(count);

    const jewelPalette = [
      new THREE.Color(0x00e5ff), // Aquamarine Cyan
      new THREE.Color(0xffffff), // Diamond White Brilliance
      new THREE.Color(0xb388ff), // Amethyst Violet
      new THREE.Color(0x10b981), // Emerald Spark
      new THREE.Color(0xffd54f), // Topaz Amber Flame
      new THREE.Color(0x38bdf8), // Sapphire Sky
    ];

    // Distribute throughout the corridor between outer blue box (3.20) and inner purple box (2.62)
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const slab = i % 6; // 0:+Z, 1:-Z, 2:+X, 3:-X, 4:+Y, 5:-Y
      let x = 0, y = 0, z = 0;
      const depth = 2.68 + Math.random() * (3.15 - 2.68);
      const spanU = (Math.random() - 0.5) * 5.9;
      const spanV = (Math.random() - 0.5) * 5.9;

      switch (slab) {
        case 0: x = spanU; y = spanV; z = depth; break;
        case 1: x = spanU; y = spanV; z = -depth; break;
        case 2: x = depth; y = spanU; z = spanV; break;
        case 3: x = -depth; y = spanU; z = spanV; break;
        case 4: x = spanU; y = depth; z = spanV; break;
        case 5: x = spanU; y = -depth; z = spanV; break;
      }

      this.liquidPositions[i3] = x;
      this.liquidPositions[i3 + 1] = y;
      this.liquidPositions[i3 + 2] = z;

      // Initial calm anti-gravity drift velocity
      this.liquidVels[i3] = -z * 0.0012 + (Math.random() - 0.5) * 0.0008;
      this.liquidVels[i3 + 1] = (Math.random() - 0.5) * 0.0012;
      this.liquidVels[i3 + 2] = x * 0.0012 + (Math.random() - 0.5) * 0.0008;

      const c = jewelPalette[i % jewelPalette.length]!;
      this.liquidColors[i3] = c.r;
      this.liquidColors[i3 + 1] = c.g;
      this.liquidColors[i3 + 2] = c.b;

      this.liquidBaseColors[i3] = c.r;
      this.liquidBaseColors[i3 + 1] = c.g;
      this.liquidBaseColors[i3 + 2] = c.b;

      twinklePhases[i] = Math.random() * Math.PI * 2;
      twinkleSpeeds[i] = 0.8 + Math.random() * 2.2;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.liquidPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.liquidColors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.liquidParticlesInside = new THREE.Points(geo, mat);
    this.liquidParticlesInside.userData = {
      isMainCube: true,
      baseColors: this.liquidBaseColors,
      twinklePhases,
      twinkleSpeeds,
    };
    this.cubeGroup.add(this.liquidParticlesInside);
  }

  private buildCompanyCube(): void {
    if (!this.scene) return;
    this.cubeGroup = new THREE.Group();
    this.cubeGroup.userData = { isMainCube: true };
    this.scene.add(this.cubeGroup);

    const size = MAIN_CUBE_SIZE;
    const boxGeo = new THREE.BoxGeometry(size, size, size);
    const wireGeo = new THREE.WireframeGeometry(boxGeo);

    // Primary intense electric cyan wireframe with additive glow
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    this.wireframeCube = new THREE.LineSegments(wireGeo, wireMat);
    this.wireframeCube.userData = { isMainCube: true };
    this.cubeGroup.add(this.wireframeCube);

    // Secondary chromatic halo wireframe (1.012 scale for radiant glow volume)
    const wireMatAura = new THREE.LineBasicMaterial({
      color: 0x0088ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    this.wireframeCubeAura = new THREE.LineSegments(wireGeo, wireMatAura);
    this.wireframeCubeAura.scale.set(1.012, 1.012, 1.012);
    this.wireframeCubeAura.userData = { isMainCube: true };
    this.cubeGroup.add(this.wireframeCubeAura);

    // Inner Purple Containment Frame (Neon lavender cylindrical struts & vertex nodes)
    this.buildPurpleContainmentFrame(size);
  }

  private buildPurpleContainmentFrame(outerSize: number): void {
    if (!this.cubeGroup) return;
    this.purpleFrameGroup = new THREE.Group();
    this.purpleFrameGroup.userData = { isMainCube: true };
    this.cubeGroup.add(this.purpleFrameGroup);
    this.purpleStruts = [];
    this.purpleBeacons = [];

    const pSize = outerSize * 0.82; // ~5.25 inside 6.4
    const pHalf = pSize / 2;

    const strutGeo = new THREE.CylinderGeometry(0.038, 0.038, pSize, 8);
    const strutMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc, // Bright neon lavender/amethyst
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });

    // 4 X-parallel struts
    const xConfigs: Array<[number, number, number]> = [
      [0, -pHalf, -pHalf],
      [0, pHalf, -pHalf],
      [0, -pHalf, pHalf],
      [0, pHalf, pHalf],
    ];
    xConfigs.forEach(([x, y, z]) => {
      const strut = new THREE.Mesh(strutGeo, strutMat.clone());
      strut.rotation.z = Math.PI / 2;
      strut.position.set(x, y, z);
      strut.userData = { isMainCube: true };
      this.purpleFrameGroup?.add(strut);
      this.purpleStruts.push(strut);
    });

    // 4 Y-parallel struts
    const yConfigs: Array<[number, number, number]> = [
      [-pHalf, 0, -pHalf],
      [pHalf, 0, -pHalf],
      [-pHalf, 0, pHalf],
      [pHalf, 0, pHalf],
    ];
    yConfigs.forEach(([x, y, z]) => {
      const strut = new THREE.Mesh(strutGeo, strutMat.clone());
      strut.position.set(x, y, z);
      strut.userData = { isMainCube: true };
      this.purpleFrameGroup?.add(strut);
      this.purpleStruts.push(strut);
    });

    // 4 Z-parallel struts
    const zConfigs: Array<[number, number, number]> = [
      [-pHalf, -pHalf, 0],
      [pHalf, -pHalf, 0],
      [-pHalf, pHalf, 0],
      [pHalf, pHalf, 0],
    ];
    zConfigs.forEach(([x, y, z]) => {
      const strut = new THREE.Mesh(strutGeo, strutMat.clone());
      strut.rotation.x = Math.PI / 2;
      strut.position.set(x, y, z);
      strut.userData = { isMainCube: true };
      this.purpleFrameGroup?.add(strut);
      this.purpleStruts.push(strut);
    });

    // 8 Purple Inner Corner Beacons
    const beaconGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xd8b4fe,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const bCoords = [-pHalf, pHalf];
    bCoords.forEach((x) => {
      bCoords.forEach((y) => {
        bCoords.forEach((z) => {
          const beacon = new THREE.Mesh(beaconGeo, beaconMat.clone());
          beacon.position.set(x, y, z);
          beacon.userData = { isMainCube: true };
          this.purpleFrameGroup?.add(beacon);
          this.purpleBeacons.push(beacon);
        });
      });
    });
  }

  private buildCornerSpheres(): void {
    if (!this.cubeGroup) return;
    const size = MAIN_CUBE_SIZE;
    const half = size / 2;
    const coords = [-half, half];
    const geo = new THREE.SphereGeometry(0.18, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    coords.forEach((x) => {
      coords.forEach((y) => {
        coords.forEach((z) => {
          const sphere = new THREE.Mesh(geo, mat);
          sphere.position.set(x, y, z);
          sphere.userData = { isMainCube: true };
          this.cubeGroup?.add(sphere);
          this.cornerSpheres.push(sphere);
        });
      });
    });
  }

  private buildSunCore(): void {
    if (!this.cubeGroup) return;
    this.sunGroup = new THREE.Group();
    this.sunGroup.userData = { isMainCube: true, isSunCore: true };
    this.cubeGroup.add(this.sunGroup);

    // 1. Dynamic Turbulent Plasma Mantle Wireframe
    const sunGeo = new THREE.SphereGeometry(0.96, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffb300,
      wireframe: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    this.sunSphere = new THREE.Mesh(sunGeo, sunMat);
    this.sunSphere.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.sunSphere);

    // 2. Secondary Inner Plasma Shroud (Dense multi-faceted incandescent combustion cage)
    const shroudGeo = new THREE.IcosahedronGeometry(0.84, 2);
    const shroudMat = new THREE.MeshBasicMaterial({
      color: 0xff6d00,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    this.sunPlasmaShroud = new THREE.Mesh(shroudGeo, shroudMat);
    this.sunPlasmaShroud.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.sunPlasmaShroud);

    // 3. Inner Radiant Fusion Core
    const innerGeo = new THREE.SphereGeometry(0.68, 24, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    this.innerSun = new THREE.Mesh(innerGeo, innerMat);
    this.innerSun.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.innerSun);

    // 4. Primary Coronal Ring (Tilted Golden Halo)
    const ringGeo1 = new THREE.RingGeometry(1.08, 1.58, 48);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0xffb300,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.coronaRing1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.coronaRing1.rotation.x = Math.PI / 3;
    this.coronaRing1.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.coronaRing1);

    // 5. Secondary Coronal Ring (Orthogonal Fiery Orange Halo)
    const ringGeo2 = new THREE.RingGeometry(1.15, 1.72, 48);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0xff6d00,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.coronaRing2 = new THREE.Mesh(ringGeo2, ringMat2);
    this.coronaRing2.rotation.x = -Math.PI / 3;
    this.coronaRing2.rotation.y = Math.PI / 6;
    this.coronaRing2.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.coronaRing2);

    // 6. Torus Magnetic Prominence Loop
    const torusGeo = new THREE.TorusGeometry(1.22, 0.032, 12, 48);
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    this.torusProminence = new THREE.Mesh(torusGeo, torusMat);
    this.torusProminence.rotation.x = Math.PI / 4;
    this.torusProminence.rotation.y = Math.PI / 5;
    this.torusProminence.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.torusProminence);

    // 7. Dedicated Transparent Hit Sphere for Reliable Interception
    const hitGeo = new THREE.SphereGeometry(1.85, 20, 20);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sunHitSphere = new THREE.Mesh(hitGeo, hitMat);
    this.sunHitSphere.userData = { isMainCube: true, isSunCore: true };
    this.sunGroup.add(this.sunHitSphere);
  }

  private buildAgentPyramids(): void {
    if (!this.scene) return;
    this.pyramidsGroup = new THREE.Group();
    this.scene.add(this.pyramidsGroup);
    this.electronBeads = [];

    const agents: Array<{
      id: AgentId;
      color: number;
      angle: number;
      orbitRadius: number;
      orbitTilt: { x: number; y: number; z: number };
    }> = [
      { id: 'roy', color: 0xffb300, angle: 0, orbitRadius: 4.8, orbitTilt: { x: 0.25, y: 0.15, z: 0.3 } },
      { id: 'ava', color: 0xa855f7, angle: (Math.PI * 2) / 3, orbitRadius: 5.1, orbitTilt: { x: -0.3, y: 0.25, z: -0.2 } },
      { id: 'guz', color: 0x10b981, angle: (Math.PI * 4) / 3, orbitRadius: 4.9, orbitTilt: { x: 0.2, y: -0.2, z: 0.35 } },
    ];

    agents.forEach((ag) => {
      // 1. Tilted electrical orbit track
      const curvePts: THREE.Vector3[] = [];
      const segments = 64;
      const tiltEuler = new THREE.Euler(ag.orbitTilt.x, ag.orbitTilt.y, ag.orbitTilt.z);
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const p = new THREE.Vector3(
          Math.cos(theta) * ag.orbitRadius,
          0,
          Math.sin(theta) * ag.orbitRadius
        );
        p.applyEuler(tiltEuler);
        curvePts.push(p);
      }
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(curvePts);
      const orbitMat = new THREE.LineBasicMaterial({
        color: 0x40c4ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      });
      const orbitLine = new THREE.Line(orbitGeo, orbitMat);
      orbitLine.userData = { isMainCube: true };
      this.pyramidsGroup?.add(orbitLine);

      // 2. Traveling Electron Energy Beads on this orbit track
      const beadOffsets = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
      beadOffsets.forEach((offset) => {
        const beadGeo = new THREE.SphereGeometry(0.065, 8, 8);
        const beadMat = new THREE.MeshBasicMaterial({
          color: 0xe0f7ff,
          transparent: true,
          opacity: 0.90,
          blending: THREE.AdditiveBlending,
        });
        const beadMesh = new THREE.Mesh(beadGeo, beadMat);
        beadMesh.userData = { isMainCube: true };
        this.pyramidsGroup?.add(beadMesh);
        this.electronBeads.push({
          mesh: beadMesh,
          orbitRadius: ag.orbitRadius,
          baseAngle: offset,
          speed: 0.65,
          tilt: tiltEuler,
        });
      });

      // 3. Agent Pyramid Hero
      const group = new THREE.Group();

      // Solid core
      const coreGeo = new THREE.ConeGeometry(0.42, 0.85, 4);
      const coreMat = new THREE.MeshBasicMaterial({
        color: ag.color,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.userData = { isMainCube: true, isPyramid: true, agentId: ag.id };
      group.add(coreMesh);

      // Wireframe outer glyph shell
      const wireGeo = new THREE.ConeGeometry(0.52, 1.0, 4);
      const wireMat = new THREE.MeshBasicMaterial({
        color: ag.color,
        wireframe: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const wireMesh = new THREE.Mesh(wireGeo, wireMat);
      wireMesh.userData = { isMainCube: true, isPyramid: true, agentId: ag.id };
      group.add(wireMesh);

      // Orbit ring around the pyramid
      const ringGeo = new THREE.TorusGeometry(0.62, 0.015, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ag.color,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.userData = { isMainCube: true, isPyramid: true, agentId: ag.id };
      group.add(ringMesh);

      const r = 5.2;
      group.position.set(Math.cos(ag.angle) * r, 0, Math.sin(ag.angle) * r);
      group.userData = { isMainCube: true, isPyramid: true, agentId: ag.id, baseAngle: ag.angle };
      this.pyramidsGroup?.add(group);
    });
  }

  private buildDisconnectedCube(): void {
    if (!this.scene) return;

    this.disconnectedCubeGroup = new THREE.Group();
    this.disconnectedCubeGroup.position.copy(DISCONNECTED_CUBE_POS);
    this.disconnectedCubeGroup.userData = { isDisconnectedCube: true };
    this.scene.add(this.disconnectedCubeGroup);

    // 1. Red Damaged Wireframe Cube (Scale ~0.72 of main cube, size 4.6)
    const size = DISCONNECTED_CUBE_SIZE;
    const boxGeo = new THREE.BoxGeometry(size, size, size);
    const wireGeo = new THREE.WireframeGeometry(boxGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0xe11d48, // Approved crimson red
      transparent: true,
      opacity: 0.85,
    });
    this.disconnectedWireframe = new THREE.LineSegments(wireGeo, wireMat);
    this.disconnectedWireframe.userData = { isDisconnectedCube: true };
    this.disconnectedCubeGroup.add(this.disconnectedWireframe);

    // 2. Crimson / Rose Corner Spheres
    const half = size / 2;
    const coords = [-half, half];
    const cornerGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const cornerMat = new THREE.MeshBasicMaterial({
      color: 0xe11d48,
      transparent: true,
      opacity: 0.55,
    });

    coords.forEach((x) => {
      coords.forEach((y) => {
        coords.forEach((z) => {
          const sphere = new THREE.Mesh(cornerGeo, cornerMat);
          sphere.position.set(x, y, z);
          sphere.userData = { isDisconnectedCube: true };
          this.disconnectedCubeGroup?.add(sphere);
          this.disconnectedCornerSpheres.push(sphere);
        });
      });
    });

    // 3. Dim Grey Collapsed Core (Jay's approved damaged appearance)
    this.disconnectedSunGroup = new THREE.Group();
    this.disconnectedSunGroup.userData = { isDisconnectedCube: true };
    this.disconnectedCubeGroup.add(this.disconnectedSunGroup);

    // Mantle - Dim Slate Grey (0x334155)
    const sunGeo = new THREE.SphereGeometry(0.68, 20, 20);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0x334155,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    this.disconnectedSunSphere = new THREE.Mesh(sunGeo, sunMat);
    this.disconnectedSunSphere.userData = { isDisconnectedCube: true };
    this.disconnectedSunGroup.add(this.disconnectedSunSphere);

    // Inner Core - Deep Slate (0x1e293b)
    const innerGeo = new THREE.SphereGeometry(0.48, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.85,
    });
    this.disconnectedInnerSun = new THREE.Mesh(innerGeo, innerMat);
    this.disconnectedInnerSun.userData = { isDisconnectedCube: true };
    this.disconnectedSunGroup.add(this.disconnectedInnerSun);

    // Dim Grey Corona Rings
    const ringGeo1 = new THREE.TorusGeometry(0.88, 0.012, 12, 48);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.55,
    });
    this.disconnectedCoronaRing1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.disconnectedCoronaRing1.userData = { isDisconnectedCube: true };
    this.disconnectedSunGroup.add(this.disconnectedCoronaRing1);

    const ringGeo2 = new THREE.TorusGeometry(1.02, 0.01, 12, 48);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.45,
    });
    this.disconnectedCoronaRing2 = new THREE.Mesh(ringGeo2, ringMat2);
    this.disconnectedCoronaRing2.rotation.x = Math.PI / 3;
    this.disconnectedCoronaRing2.userData = { isDisconnectedCube: true };
    this.disconnectedSunGroup.add(this.disconnectedCoronaRing2);

    // Dedicated Hit Sphere for Disconnected Cube
    const hitGeo = new THREE.SphereGeometry(1.4, 16, 16);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.userData = { isDisconnectedCube: true };
    this.disconnectedSunGroup.add(hitMesh);

    // 4. Damaged Shards / Drifting Debris (Existing Damaged Particle Treatment)
    this.disconnectedDebrisGroup = new THREE.Group();
    this.disconnectedDebrisGroup.userData = { isDisconnectedCube: true };
    const debrisCount = 18;
    for (let i = 0; i < debrisCount; i++) {
      const geo = new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.10, 0);
      const isCrimson = Math.random() > 0.4;
      const mat = new THREE.MeshBasicMaterial({
        color: isCrimson ? 0xe11d48 : 0x475569,
        transparent: true,
        opacity: 0.65 + Math.random() * 0.25,
      });
      const shard = new THREE.Mesh(geo, mat);
      const radius = 2.4 + Math.random() * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      shard.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
      shard.userData = {
        isDisconnectedCube: true,
        rotSpeedX: (Math.random() - 0.5) * 1.2,
        rotSpeedY: (Math.random() - 0.5) * 1.2,
        rotSpeedZ: (Math.random() - 0.5) * 1.2,
        orbitSpeed: 0.2 + Math.random() * 0.4,
        orbitRadius: radius,
        baseAngle: theta,
        phi,
      };
      this.disconnectedDebrisGroup.add(shard);
    }
    this.disconnectedCubeGroup.add(this.disconnectedDebrisGroup);
  }

  public update(snapshot: SpaceSceneSnapshot): void {
    this.currentSnapshot = snapshot;
    this.reducedMotion = snapshot.reducedMotion;

    const isReady = snapshot.runtime.phase === 'READY' && snapshot.data.status === 'AVAILABLE';
    const isOutage = snapshot.runtime.phase === 'GRAPH_UNAVAILABLE';

    // 1. Update Sun, Corner Nodes, Corona Rings & Cube appearance based on Phase
    if (this.wireframeCube && this.sunSphere && this.innerSun) {
      if (isOutage) {
        // Cold dwarf collapse / Crimson Outage warning
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0xe11d48);
        (this.wireframeCube.material as THREE.LineBasicMaterial).opacity = 0.85;
        if (this.wireframeCubeAura) {
          (this.wireframeCubeAura.material as THREE.LineBasicMaterial).color.setHex(0x881337);
          (this.wireframeCubeAura.material as THREE.LineBasicMaterial).opacity = 0.35;
        }

        // Mute Purple Containment Frame
        this.purpleStruts.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0x4c1d95);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.30;
        });
        this.purpleBeacons.forEach((b) => {
          (b.material as THREE.MeshBasicMaterial).color.setHex(0x581c87);
          (b.material as THREE.MeshBasicMaterial).opacity = 0.35;
        });

        // Sun & Plasma: Collapsed Slate Dwarf
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0x334155);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
        if (this.sunPlasmaShroud) {
          (this.sunPlasmaShroud.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
          (this.sunPlasmaShroud.material as THREE.MeshBasicMaterial).opacity = 0.25;
        }
        if (this.coronaRing1) {
          (this.coronaRing1.material as THREE.MeshBasicMaterial).color.setHex(0x334155);
          (this.coronaRing1.material as THREE.MeshBasicMaterial).opacity = 0.25;
        }
        if (this.coronaRing2) {
          (this.coronaRing2.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
          (this.coronaRing2.material as THREE.MeshBasicMaterial).opacity = 0.20;
        }
        if (this.torusProminence) {
          (this.torusProminence.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
          (this.torusProminence.material as THREE.MeshBasicMaterial).opacity = 0.20;
        }
        if (this.sunLight) this.sunLight.intensity = 0.2;
        this.cornerSpheres.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0xe11d48);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.45;
        });

        // Fluid Starlight: Dim Crimson Embers
        if (this.liquidParticlesInside && this.liquidColors) {
          const count = this.liquidColors.length / 3;
          for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            this.liquidColors[i3] = 0.55;
            this.liquidColors[i3 + 1] = 0.08;
            this.liquidColors[i3 + 2] = 0.22;
          }
          const colAttr = this.liquidParticlesInside.geometry.getAttribute('color');
          if (colAttr) colAttr.needsUpdate = true;
          (this.liquidParticlesInside.material as THREE.PointsMaterial).opacity = 0.35;
        }
      } else if (!isReady) {
        // Checking / Blocked non-ready
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0x64748b);
        (this.wireframeCube.material as THREE.LineBasicMaterial).opacity = 0.70;
        if (this.wireframeCubeAura) {
          (this.wireframeCubeAura.material as THREE.LineBasicMaterial).color.setHex(0x334155);
          (this.wireframeCubeAura.material as THREE.LineBasicMaterial).opacity = 0.35;
        }

        // Mute Purple Containment Frame
        this.purpleStruts.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0x64748b);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.40;
        });
        this.purpleBeacons.forEach((b) => {
          (b.material as THREE.MeshBasicMaterial).color.setHex(0x94a3b8);
          (b.material as THREE.MeshBasicMaterial).opacity = 0.45;
        });

        // Sun & Plasma: Dim amber / dormant
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0xd97706);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0x78350f);
        if (this.sunPlasmaShroud) {
          (this.sunPlasmaShroud.material as THREE.MeshBasicMaterial).color.setHex(0x78350f);
          (this.sunPlasmaShroud.material as THREE.MeshBasicMaterial).opacity = 0.40;
        }
        if (this.coronaRing1) {
          (this.coronaRing1.material as THREE.MeshBasicMaterial).color.setHex(0xd97706);
          (this.coronaRing1.material as THREE.MeshBasicMaterial).opacity = 0.30;
        }
        if (this.coronaRing2) {
          (this.coronaRing2.material as THREE.MeshBasicMaterial).color.setHex(0x78350f);
          (this.coronaRing2.material as THREE.MeshBasicMaterial).opacity = 0.25;
        }
        if (this.torusProminence) {
          (this.torusProminence.material as THREE.MeshBasicMaterial).color.setHex(0x92400e);
          (this.torusProminence.material as THREE.MeshBasicMaterial).opacity = 0.35;
        }
        if (this.sunLight) this.sunLight.intensity = 0.8;
        this.cornerSpheres.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0x64748b);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.70;
        });

        // Fluid Starlight: Muted Slate / Amber
        if (this.liquidParticlesInside && this.liquidColors) {
          const count = this.liquidColors.length / 3;
          for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            this.liquidColors[i3] = 0.45;
            this.liquidColors[i3 + 1] = 0.35;
            this.liquidColors[i3 + 2] = 0.25;
          }
          const colAttr = this.liquidParticlesInside.geometry.getAttribute('color');
          if (colAttr) colAttr.needsUpdate = true;
          (this.liquidParticlesInside.material as THREE.PointsMaterial).opacity = 0.45;
        }
      } else {
        // Active Fusion & Electric Cyan
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0x00e5ff);
        (this.wireframeCube.material as THREE.LineBasicMaterial).opacity = 0.95;
        if (this.wireframeCubeAura) {
          (this.wireframeCubeAura.material as THREE.LineBasicMaterial).color.setHex(0x0088ff);
          (this.wireframeCubeAura.material as THREE.LineBasicMaterial).opacity = 0.75;
        }

        // Radiant Purple Containment Frame
        this.purpleStruts.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0xc084fc);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.88;
        });
        this.purpleBeacons.forEach((b) => {
          (b.material as THREE.MeshBasicMaterial).color.setHex(0xd8b4fe);
          (b.material as THREE.MeshBasicMaterial).opacity = 0.95;
        });

        // Sun & Plasma: Incandescent Glory
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0xffb300);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0xffd54f);
        if (this.sunPlasmaShroud) {
          (this.sunPlasmaShroud.material as THREE.MeshBasicMaterial).color.setHex(0xff6d00);
          (this.sunPlasmaShroud.material as THREE.MeshBasicMaterial).opacity = 0.65;
        }
        if (this.coronaRing1) {
          (this.coronaRing1.material as THREE.MeshBasicMaterial).color.setHex(0xffb300);
          (this.coronaRing1.material as THREE.MeshBasicMaterial).opacity = 0.45;
        }
        if (this.coronaRing2) {
          (this.coronaRing2.material as THREE.MeshBasicMaterial).color.setHex(0xff6d00);
          (this.coronaRing2.material as THREE.MeshBasicMaterial).opacity = 0.35;
        }
        if (this.torusProminence) {
          (this.torusProminence.material as THREE.MeshBasicMaterial).color.setHex(0xffe082);
          (this.torusProminence.material as THREE.MeshBasicMaterial).opacity = 0.65;
        }
        if (this.sunLight) this.sunLight.intensity = 2.2;
        this.cornerSpheres.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0x00ffff);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.95;
        });

        // Fluid Starlight: Full Jewel Starlight Brilliance
        if (this.liquidParticlesInside && this.liquidColors && this.liquidBaseColors) {
          this.liquidColors.set(this.liquidBaseColors);
          const colAttr = this.liquidParticlesInside.geometry.getAttribute('color');
          if (colAttr) colAttr.needsUpdate = true;
          (this.liquidParticlesInside.material as THREE.PointsMaterial).opacity = 0.92;
        }
      }
    }

    // 2. Rebuild Graph Nodes & Edges from Snapshot
    this.rebuildGraphGeometry(snapshot.data.nodes, snapshot.data.edges, isReady);

    // 3. Rebuild IdeaVerse Comets from snapshot.ideaIds
    this.rebuildComets(snapshot.ideaIds, isReady);

    // If reduced motion is requested, render a static frame with electron beads positioned statically
    if (this.reducedMotion) {
      this.electronBeads.forEach((bead) => {
        const p = new THREE.Vector3(
          Math.cos(bead.baseAngle) * bead.orbitRadius,
          0,
          Math.sin(bead.baseAngle) * bead.orbitRadius
        );
        p.applyEuler(bead.tilt);
        bead.mesh.position.copy(p);
      });
      if (this.renderer && this.scene && this.camera) {
        if (this.cubeGroup) this.cubeGroup.rotation.set(0.18, 0.28, 0);
        if (this.disconnectedCubeGroup) this.disconnectedCubeGroup.rotation.set(-0.15, 0.22, 0);
        this.camera.position.copy(this.cameraTargetPosition);
        this.currentLookAt.copy(this.cameraTargetLookAt);
        this.camera.lookAt(this.currentLookAt);
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  private rebuildGraphGeometry(nodes: GraphNode[], edges: GraphEdge[], isReady: boolean): void {
    if (!this.nodesGroup) return;

    // Clear existing nodes and edges
    while (this.nodesGroup.children.length > 0) {
      const child = this.nodesGroup.children[0];
      if (child) {
        this.nodesGroup.remove(child);
        this.disposeObject(child);
      }
    }
    this.edgesMesh = null;

    if (!isReady || nodes.length === 0) {
      return; // Non-READY clears all proof geometry!
    }

    const nodePositions = new Map<string, THREE.Vector3>();
    const nodeCount = nodes.length;

    nodes.forEach((n, idx) => {
      const geo = new THREE.SphereGeometry(0.14, 16, 16);
      const isSelected = this.currentSnapshot?.data.selectedNodeId === n.id;
      const mat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffffff : 0xf43f5e,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.85,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Distribute nodes organically in a 3D orbit around the sun
      const phi = Math.acos(-1 + (2 * idx) / nodeCount);
      const theta = Math.sqrt(nodeCount * Math.PI) * phi;
      const radius = 1.45 + (idx % 3) * 0.45;

      const pos = new THREE.Vector3(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi)
      );

      mesh.position.copy(pos);
      mesh.userData = { isGraphNode: true, nodeId: n.id };
      nodePositions.set(n.id, pos);
      this.nodesGroup?.add(mesh);
    });

    // Build Edges
    if (edges.length > 0) {
      const points: THREE.Vector3[] = [];
      edges.forEach((e) => {
        const p1 = nodePositions.get(e.from);
        const p2 = nodePositions.get(e.to);
        if (p1 && p2) {
          points.push(p1);
          points.push(p2);
        }
      });

      if (points.length > 0) {
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(points);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.4,
        });
        this.edgesMesh = new THREE.LineSegments(edgeGeo, edgeMat);
        this.nodesGroup.add(this.edgesMesh);
      }
    }
  }

  private rebuildComets(ideaIds: string[], isReady: boolean): void {
    if (!this.cometsGroup) return;

    while (this.cometsGroup.children.length > 0) {
      const child = this.cometsGroup.children[0];
      if (child) {
        this.cometsGroup.remove(child);
        this.disposeObject(child);
      }
    }

    if (!isReady || ideaIds.length === 0) return;

    ideaIds.forEach((id, idx) => {
      const cometGroup = new THREE.Group();
      const headGeo = new THREE.SphereGeometry(0.12, 12, 12);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.95 });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      cometGroup.add(headMesh);

      // Dedicated hit area for the comet
      const hitGeo = new THREE.SphereGeometry(0.65, 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, side: THREE.DoubleSide });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.userData = { isComet: true, ideaId: id };
      cometGroup.add(hitMesh);

      // Trajectory placement
      const alt = 2.4 + (idx % 2) * 0.8;
      cometGroup.position.set(-6.0 + idx * 2.2, alt, (idx % 3) * 1.5 - 1.0);
      cometGroup.userData = { isComet: true, ideaId: id, speed: 0.02 + idx * 0.005 };
      this.cometsGroup?.add(cometGroup);
    });
  }

  private startLoop(): void {
    const animate = () => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(animate);

      const now = performance.now();
      let delta = (now - this.lastTime) / 1000;
      if (delta > 0.1) {
        // Prevent motion jumps after tab switching
        delta = 0.016;
        this.lastTime = now;
        this.mouseParallax.vx = 0;
        this.mouseParallax.vy = 0;
        this.mouseParallax.lt = now;
        this.mouseVelocity3D.set(0, 0, 0);
      } else {
        delta = Math.min(delta, 0.05);
        this.lastTime = now;
      }
      const elapsed = (now - this.startTime) / 1000;

      if (!this.reducedMotion) {
        // 360° Spherical Celestial Camera Orbit (Rotation 2: Entire 360° Cosmos)
        if (this.camera) {
          const lerpFactor = Math.min(delta * 4.0, 0.25);
          this.currentLookAt.lerp(this.cameraTargetLookAt, lerpFactor);

          const targetCamX = this.currentLookAt.x + this.cameraDistance * Math.cos(this.cameraOrbit.phi) * Math.sin(this.cameraOrbit.theta);
          const targetCamY = this.currentLookAt.y + this.cameraDistance * Math.sin(this.cameraOrbit.phi);
          const targetCamZ = this.currentLookAt.z + this.cameraDistance * Math.cos(this.cameraOrbit.phi) * Math.cos(this.cameraOrbit.theta);
          this.cameraTargetPosition.set(targetCamX, targetCamY, targetCamZ);

          this.camera.position.lerp(this.cameraTargetPosition, lerpFactor);
          this.camera.lookAt(this.currentLookAt);
        }

        // Opposing Starfield Parallax Damping & Inertial Momentum
        if (performance.now() - this.mouseParallax.lt > 50) {
          const decay = Math.exp(-0.016 / 0.28);
          this.mouseParallax.vx *= decay;
          this.mouseParallax.vy *= decay;
        }
        const maxV = 0.55;
        const clampV = (v: number) => Math.max(-maxV, Math.min(maxV, v));
        const smoothU = 1 - Math.exp(-0.016 / 0.12);
        this.mouseParallax.x += (this.mouseParallax.tx + clampV(this.mouseParallax.vx * 0.16) - this.mouseParallax.x) * smoothU;
        this.mouseParallax.y += (this.mouseParallax.ty + clampV(this.mouseParallax.vy * 0.16) - this.mouseParallax.y) * smoothU;

        // Multi-layered depth parallax & individual star twinkling
        this.starLayers.forEach((layer) => {
          const u = layer.userData;
          layer.rotation.y = -this.mouseParallax.x * u.rotMultiplier;
          layer.rotation.x = this.mouseParallax.y * u.rotMultiplier;
          if (u.posMultiplier > 0) {
            layer.position.x = -this.mouseParallax.x * u.posMultiplier;
            layer.position.y = this.mouseParallax.y * u.posMultiplier;
          }

          const colAttr = layer.geometry.getAttribute('color') as THREE.BufferAttribute | null;
          if (colAttr) {
            const colors = colAttr.array as Float32Array;
            const bCols = u.baseColors as Float32Array;
            const phases = u.twinklePhases as Float32Array;
            const spds = u.twinkleSpeeds as Float32Array;
            const count = u.count as number;
            for (let i = 0; i < count; i++) {
              const i3 = i * 3;
              const tw = 0.65 + 0.35 * Math.sin(elapsed * spds[i]! + phases[i]!);
              colors[i3] = bCols[i3]! * tw;
              colors[i3 + 1] = bCols[i3 + 1]! * tw;
              colors[i3 + 2] = bCols[i3 + 2]! * tw;
            }
            colAttr.needsUpdate = true;
          }
        });

        // Anti-parallax on near and far starfield layers
        if (this.starfieldNear && this.starfieldFar) {
          this.starfieldNear.position.x += (this.mouse.x * 2.2 - this.starfieldNear.position.x) * 0.05;
          this.starfieldNear.position.y += (this.mouse.y * 2.2 - this.starfieldNear.position.y) * 0.05;
          this.starfieldFar.position.x += (-this.mouse.x * 2.0 - this.starfieldFar.position.x) * 0.05;
          this.starfieldFar.position.y += (-this.mouse.y * 2.0 - this.starfieldFar.position.y) * 0.05;
        }

        // Orbit Pyramids
        if (this.pyramidsGroup) {
          this.pyramidsGroup.children.forEach((p) => {
            const u = p.userData;
            if (u.baseAngle !== undefined) {
              u.baseAngle += delta * 0.4;
              const r = 5.2;
              p.position.set(Math.cos(u.baseAngle) * r, Math.sin(u.baseAngle * 1.5) * 0.4, Math.sin(u.baseAngle) * r);
            }
          });
        }

        // Move Comets
        if (this.cometsGroup) {
          this.cometsGroup.children.forEach((c) => {
            const spd = c.userData.speed || 0.02;
            c.position.x += spd;
            if (c.position.x > 8.0) {
              c.position.x = -8.0;
            }
          });
        }

        // Gentle Main Cube Idle Tumble
        if (this.cubeGroup && (!this.isDragging || this.cubeFocus !== 'main')) {
          this.cubeGroup.rotation.y += delta * 0.12;
          this.cubeGroup.rotation.x += delta * 0.06;
        }

        // Gentle Disconnected Cube Idle Tumble
        if (this.disconnectedCubeGroup && (!this.isDragging || this.cubeFocus !== 'disconnected')) {
          this.disconnectedCubeGroup.rotation.y += delta * 0.09;
          this.disconnectedCubeGroup.rotation.x -= delta * 0.05;
        }

        // Disconnected Debris Shard drift
        if (this.disconnectedDebrisGroup) {
          this.disconnectedDebrisGroup.children.forEach((c) => {
            const u = c.userData;
            if (u.baseAngle !== undefined) {
              u.baseAngle += delta * u.orbitSpeed;
              c.position.x = u.orbitRadius * Math.sin(u.phi) * Math.cos(u.baseAngle);
              c.position.y = u.orbitRadius * Math.sin(u.phi) * Math.sin(u.baseAngle);
              c.rotation.x += delta * u.rotSpeedX;
              c.rotation.y += delta * u.rotSpeedY;
              c.rotation.z += delta * u.rotSpeedZ;
            }
          });
        }

        // Sun Breathing & Corona Rings Rotation
        if (this.innerSun) {
          const s = 1.0 + Math.sin(elapsed * 2.5) * 0.04;
          this.innerSun.scale.set(s, s, s);
        }
        if (this.sunPlasmaShroud) {
          this.sunPlasmaShroud.rotation.y -= delta * 0.38;
          this.sunPlasmaShroud.rotation.x += delta * 0.18;
        }
        if (this.coronaRing1) {
          this.coronaRing1.rotation.z += delta * 0.35;
        }
        if (this.coronaRing2) {
          this.coronaRing2.rotation.y += delta * 0.28;
          this.coronaRing2.rotation.z -= delta * 0.18;
        }
        if (this.torusProminence) {
          this.torusProminence.rotation.z += delta * 0.32;
        }
        if (this.disconnectedCoronaRing1) {
          this.disconnectedCoronaRing1.rotation.z += delta * 0.25;
        }
        if (this.disconnectedCoronaRing2) {
          this.disconnectedCoronaRing2.rotation.y -= delta * 0.20;
        }
        // Animate Traveling Electron Beads along Agent Orbits
        this.electronBeads.forEach((bead) => {
          bead.baseAngle += delta * bead.speed;
          const p = new THREE.Vector3(
            Math.cos(bead.baseAngle) * bead.orbitRadius,
            0,
            Math.sin(bead.baseAngle) * bead.orbitRadius
          );
          p.applyEuler(bead.tilt);
          bead.mesh.position.copy(p);
        });

        // Animate Fluid Anti-Gravity Starlight particles
        if (this.liquidParticlesInside && this.liquidPositions && this.liquidVels) {
          const p = this.liquidPositions;
          const v = this.liquidVels;
          const colAttr = this.liquidParticlesInside.geometry.getAttribute('color') as THREE.BufferAttribute | null;
          const colors = colAttr ? (colAttr.array as Float32Array) : null;
          const bCols = this.liquidBaseColors;
          const uData = this.liquidParticlesInside.userData;
          const phases = uData.twinklePhases as Float32Array | undefined;
          const spds = uData.twinkleSpeeds as Float32Array | undefined;

          // Antigravity-Style Mouse Cursor Interaction Field
          let cursorLocal: THREE.Vector3 | null = null;
          let cursorLocalVel: THREE.Vector3 | null = null;
          let hasActiveCursor = false;
          if (this.camera && this.mouseVelocity3D && this.mouse3D && this.cubeGroup) {
            const tempCursor = this.mouse3D.clone();
            this.cubeGroup.worldToLocal(tempCursor);
            if (Math.abs(tempCursor.x) < 4.2 && Math.abs(tempCursor.y) < 4.2 && Math.abs(tempCursor.z) < 4.2) {
              cursorLocal = tempCursor;
              const velClone = this.mouseVelocity3D.clone();
              velClone.applyQuaternion(this.cubeGroup.quaternion.clone().invert());
              cursorLocalVel = velClone;
              hasActiveCursor = true;
            }
          }

          const outageActive = this.currentSnapshot?.runtime.phase === 'GRAPH_UNAVAILABLE';
          const speedMult = outageActive ? 1.85 : 0.28;
          const dampFactor = outageActive ? 0.935 : 0.985;
          const purpleInnerLimit = 2.68;
          const blueOuterLimit = 3.20;

          const count = p.length / 3;
          for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            let px = p[i3]!;
            let py = p[i3 + 1]!;
            let pz = p[i3 + 2]!;
            let vx = v[i3]!;
            let vy = v[i3 + 1]!;
            let vz = v[i3 + 2]!;

            if (!outageActive) {
              const syncAngle = elapsed * 0.25;
              const syncFx = (-pz * 0.0016 + Math.sin(py * 0.9 + syncAngle) * 0.0012) * speedMult;
              const syncFy = (Math.cos(px * 0.9 + syncAngle * 0.8) * 0.0012 + Math.sin(pz * 0.9) * 0.0008) * speedMult;
              const syncFz = (px * 0.0016 + Math.cos(py * 0.9 + syncAngle) * 0.0012) * speedMult;
              vx += syncFx; vy += syncFy; vz += syncFz;
            } else {
              const chaosFx = Math.sin(py * 3.8 + elapsed * 6.5) * Math.cos(pz * 3.4 + elapsed * 5.2) * 0.024 + (Math.sin(elapsed * 7.5 + pz * 5.0) * 0.015) + (Math.random() - 0.5) * 0.016;
              const chaosFy = Math.sin(pz * 3.8 + elapsed * 5.8) * Math.cos(px * 3.4 + elapsed * 6.5) * 0.024 + (Math.cos(elapsed * 7.5 + px * 5.0) * 0.015) + (Math.random() - 0.5) * 0.016;
              const chaosFz = Math.sin(px * 3.4 + elapsed * 6.5) * Math.cos(py * 3.8 + elapsed * 5.8) * 0.024 + (Math.sin(elapsed * 7.5 + py * 5.0) * 0.015) + (Math.random() - 0.5) * 0.016;
              vx += chaosFx; vy += chaosFy; vz += chaosFz;
            }

            if (hasActiveCursor && cursorLocal) {
              const cdx = px - cursorLocal.x;
              const cdy = py - cursorLocal.y;
              const cdz = pz - cursorLocal.z;
              const distCursor = Math.hypot(cdx, cdy, cdz);
              const cursorRadius = 1.65;
              if (distCursor < cursorRadius) {
                const cFactor = (cursorRadius - distCursor) / cursorRadius;
                const invCD = 1 / Math.max(0.01, distCursor);
                const pushStrength = 0.018 * cFactor;
                vx += cdx * invCD * pushStrength;
                vy += cdy * invCD * pushStrength;
                vz += cdz * invCD * pushStrength;

                if (cursorLocalVel && cursorLocalVel.length() > 0.01) {
                  vx += cursorLocalVel.x * cFactor * 0.38;
                  vy += cursorLocalVel.y * cFactor * 0.38;
                  vz += cursorLocalVel.z * cFactor * 0.38;
                }

                vx += -cdz * cFactor * 0.035;
                vz += cdx * cFactor * 0.035;
              }
            }

            vx *= dampFactor;
            vy *= dampFactor;
            vz *= dampFactor;

            const curSpeedSq = vx * vx + vy * vy + vz * vz;
            if (curSpeedSq > 0.09) {
              const capScale = 0.3 / Math.sqrt(curSpeedSq);
              vx *= capScale; vy *= capScale; vz *= capScale;
            }

            px += vx;
            py += vy;
            pz += vz;

            // Outer Blue Box Boundary Containment
            if (px > blueOuterLimit) { px = blueOuterLimit; vx = -Math.abs(vx) * 0.85; }
            else if (px < -blueOuterLimit) { px = -blueOuterLimit; vx = Math.abs(vx) * 0.85; }
            if (py > blueOuterLimit) { py = blueOuterLimit; vy = -Math.abs(vy) * 0.85; }
            else if (py < -blueOuterLimit) { py = -blueOuterLimit; vy = Math.abs(vy) * 0.85; }
            if (pz > blueOuterLimit) { pz = blueOuterLimit; vz = -Math.abs(vz) * 0.85; }
            else if (pz < -blueOuterLimit) { pz = -blueOuterLimit; vz = Math.abs(vz) * 0.85; }

            // Inner Purple Box Repulsion into Corridor
            const absX = Math.abs(px);
            const absY = Math.abs(py);
            const absZ = Math.abs(pz);
            const maxCoord = Math.max(absX, absY, absZ);

            if (maxCoord < purpleInnerLimit) {
              const pen = purpleInnerLimit - maxCoord;
              if (absX >= absY && absX >= absZ) {
                const sgn = px >= 0 ? 1 : -1;
                px = sgn * purpleInnerLimit;
                vx = sgn * (Math.abs(vx) * 0.85 + pen * 0.15 + 0.01);
              } else if (absY >= absX && absY >= absZ) {
                const sgn = py >= 0 ? 1 : -1;
                py = sgn * purpleInnerLimit;
                vy = sgn * (Math.abs(vy) * 0.85 + pen * 0.15 + 0.01);
              } else {
                const sgn = pz >= 0 ? 1 : -1;
                pz = sgn * purpleInnerLimit;
                vz = sgn * (Math.abs(vz) * 0.85 + pen * 0.15 + 0.01);
              }
            }

            p[i3] = px;
            p[i3 + 1] = py;
            p[i3 + 2] = pz;
            v[i3] = vx;
            v[i3 + 1] = vy;
            v[i3 + 2] = vz;

            // Colors & Twinkling
            if (colors && bCols && phases && spds) {
              if (outageActive) {
                const jitterTw = 0.85 + 0.45 * Math.sin(elapsed * (spds[i]! * 4.5) + phases[i]!);
                colors[i3] = Math.min(1.0, (bCols[i3]! * 0.50 + 0.75) * jitterTw);
                colors[i3 + 1] = Math.min(1.0, (bCols[i3]! * 0.20 + 0.25) * jitterTw);
                colors[i3 + 2] = Math.min(1.0, (bCols[i3]! * 0.60 + 0.85) * jitterTw);
              } else {
                const tw = 0.60 + 0.40 * Math.sin(elapsed * spds[i]! + phases[i]!);
                const sparkle = tw > 0.88 ? 1.35 : tw;
                colors[i3] = bCols[i3]! * sparkle;
                colors[i3 + 1] = bCols[i3 + 1]! * sparkle;
                colors[i3 + 2] = bCols[i3 + 2]! * sparkle;
              }
            }
          }

          const posAttr = this.liquidParticlesInside.geometry.getAttribute('position') as THREE.BufferAttribute | null;
          if (posAttr) posAttr.needsUpdate = true;
          if (colAttr) colAttr.needsUpdate = true;
        }
      } else if (this.camera) {
        this.currentLookAt.copy(this.cameraTargetLookAt);
        const targetCamX = this.currentLookAt.x + this.cameraDistance * Math.cos(this.cameraOrbit.phi) * Math.sin(this.cameraOrbit.theta);
        const targetCamY = this.currentLookAt.y + this.cameraDistance * Math.sin(this.cameraOrbit.phi);
        const targetCamZ = this.currentLookAt.z + this.cameraDistance * Math.cos(this.cameraOrbit.phi) * Math.cos(this.cameraOrbit.theta);
        this.cameraTargetPosition.set(targetCamX, targetCamY, targetCamZ);
        this.camera.position.copy(this.cameraTargetPosition);
        this.camera.lookAt(this.currentLookAt);
        this.electronBeads.forEach((bead) => {
          const p = new THREE.Vector3(
            Math.cos(bead.baseAngle) * bead.orbitRadius,
            0,
            Math.sin(bead.baseAngle) * bead.orbitRadius
          );
          p.applyEuler(bead.tilt);
          bead.mesh.position.copy(p);
        });
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    this.rafId = requestAnimationFrame(animate);
  }

  private handleResize(): void {
    if (!this.camera || !this.renderer || !this.container) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Computes 2D viewport coordinates and dynamic pixel hit-testing radius for the central Solar Core.
   * Maps 3D world coordinates to exact canvas client pixels via camera.project(),
   * guaranteeing 100% reliable click and hover registration regardless of orbit angle, zoom, or camera lerp.
   */
  public getSunScreenMetrics(): { x: number; y: number; radiusPx: number; worldPos: THREE.Vector3 } | null {
    if (this.cubeFocus === 'disconnected') return null;
    if (!this.sunGroup || !this.camera || !this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    const sunWorldPos = new THREE.Vector3();
    this.sunGroup.getWorldPosition(sunWorldPos);
    const p = sunWorldPos.clone().project(this.camera);
    if (p.z >= 1.0) return null; // Behind camera plane

    const sx = rect.left + (p.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top + (-(p.y * 0.5) + 0.5) * rect.height;

    // Dynamic visible radius from 3D corona extent (2.4 units) projected to screen pixels
    const edgePos = sunWorldPos.clone().add(new THREE.Vector3(2.4, 0, 0));
    const edgeP = edgePos.project(this.camera);
    const edgeX = rect.left + (edgeP.x * 0.5 + 0.5) * rect.width;
    const radiusPx = Math.max(90, Math.min(280, Math.abs(edgeX - sx)));

    return { x: sx, y: sy, radiusPx, worldPos: sunWorldPos };
  }

  private triggerSunClick(): void {
    if (this.cubeFocus === 'disconnected') return;
    const now = performance.now();
    if (now - this.lastSunClickTime < 250) return;
    this.lastSunClickTime = now;
    this.callbacks.onSunClick();
  }

  private handleClick(event: MouseEvent): void {
    if (this.cubeFocus === 'disconnected') return;
    const sunMetrics = this.getSunScreenMetrics();
    if (sunMetrics) {
      const distPx = Math.hypot(event.clientX - sunMetrics.x, event.clientY - sunMetrics.y);
      if (distPx <= sunMetrics.radiusPx) {
        this.triggerSunClick();
      }
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.camera || !this.scene) return;
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.isDragging = true;
    this.dragStartPos = { x: event.clientX, y: event.clientY };
    this.previousMousePos = { x: event.clientX, y: event.clientY };
    this.pendingClickObj = null;

    if (this.cubeGroup) this.cubeGroup.updateMatrixWorld(true);
    if (this.sunGroup) this.sunGroup.updateMatrixWorld(true);
    if (this.disconnectedCubeGroup) this.disconnectedCubeGroup.updateMatrixWorld(true);

    // Right-click drag OR Shift-click drag ALWAYS orbits the 360° celestial cosmos!
    if (event.button === 2 || event.shiftKey) {
      this.dragMode = 'orbit';
      if (this.canvas) this.canvas.style.cursor = 'move';
      return;
    }

    this.raycaster.setFromCamera(this.mouse, this.camera);

    let isTargetingSun = false;
    if (this.cubeFocus === 'main') {
      const sunMetrics = this.getSunScreenMetrics();
      if (sunMetrics) {
        const distPx = Math.hypot(event.clientX - sunMetrics.x, event.clientY - sunMetrics.y);
        if (distPx <= sunMetrics.radiusPx) {
          isTargetingSun = true;
        }
      }

      if (!isTargetingSun && this.sunGroup) {
        const sunWorldPos = new THREE.Vector3();
        this.sunGroup.getWorldPosition(sunWorldPos);
        if (this.raycaster.ray.distanceToPoint(sunWorldPos) <= 2.2) {
          isTargetingSun = true;
        }
      }
    }

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    let hitInteractiveTarget = false;

    if (hits.length > 0) {
      const discHit = hits.find((h) => h.object.userData && h.object.userData.isDisconnectedCube);
      const mainHit = hits.find(
        (h) =>
          h.object.userData &&
          (h.object.userData.isMainCube ||
            h.object.userData.isGraphNode ||
            h.object.userData.isPyramid ||
            h.object.userData.isSunCore)
      );
      const cometHit = hits.find((h) => h.object.userData && h.object.userData.isComet);

      if (this.cubeFocus === 'disconnected') {
        if (mainHit) {
          this.pendingClickObj = mainHit.object;
          hitInteractiveTarget = true;
        } else if (discHit) {
          this.pendingClickObj = discHit.object;
          hitInteractiveTarget = true;
        }
      } else {
        if (discHit) {
          this.pendingClickObj = discHit.object;
          hitInteractiveTarget = true;
        } else if (cometHit) {
          this.pendingClickObj = cometHit.object;
          hitInteractiveTarget = true;
        } else if (isTargetingSun) {
          this.pendingClickObj = this.sunHitSphere || this.sunGroup;
          hitInteractiveTarget = true;
        } else if (mainHit) {
          this.pendingClickObj = mainHit.object;
          hitInteractiveTarget = true;
        }
      }
    } else if (isTargetingSun) {
      this.pendingClickObj = this.sunHitSphere || this.sunGroup;
      hitInteractiveTarget = true;
    }

    // Left-click on cube spins cube; left-click in empty space orbits 360° celestial cosmos!
    this.dragMode = hitInteractiveTarget ? 'cube' : 'orbit';

    if (this.canvas) {
      this.canvas.style.cursor = this.dragMode === 'orbit' ? 'move' : 'grabbing';
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Opposing Inertial Parallax (Velocity & Momentum Integration)
    if (!this.reducedMotion) {
      const tx = this.mouse.x * 0.45;
      const ty = this.mouse.y * 0.45;
      const now = performance.now();
      if (this.mouseParallax.lt) {
        const dtSec = Math.max(0.008, Math.min(0.1, (now - this.mouseParallax.lt) * 0.001));
        const r = Math.min(1.0, dtSec / 0.06);
        this.mouseParallax.vx += ((tx - this.mouseParallax.lx) / dtSec - this.mouseParallax.vx) * r;
        this.mouseParallax.vy += ((ty - this.mouseParallax.ly) / dtSec - this.mouseParallax.vy) * r;
      }
      this.mouseParallax.lx = tx;
      this.mouseParallax.ly = ty;
      this.mouseParallax.lt = now;
      this.mouseParallax.tx = tx;
      this.mouseParallax.ty = ty;
    }

    // Project 3D cursor position for fluid particles
    if (this.camera) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      this.mousePlane.setFromNormalAndCoplanarPoint(camDir.negate(), this.currentLookAt);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.mousePlane, hit)) {
        this.prevMouse3D.copy(this.mouse3D);
        this.mouse3D.copy(hit);
        this.mouseVelocity3D.subVectors(this.mouse3D, this.prevMouse3D);
      }
    }

    if (this.isDragging) {
      if (this.reducedMotion) return;
      const deltaX = event.clientX - this.previousMousePos.x;
      const deltaY = event.clientY - this.previousMousePos.y;

      if (this.dragMode === 'cube') {
        // ROTATION 1: Spin Company Cube on local axes
        if (this.cubeFocus === 'main' && this.cubeGroup) {
          this.cubeGroup.rotation.y += deltaX * 0.008;
          this.cubeGroup.rotation.x += deltaY * 0.008;
        } else if (this.cubeFocus === 'disconnected' && this.disconnectedCubeGroup) {
          this.disconnectedCubeGroup.rotation.y += deltaX * 0.008;
          this.disconnectedCubeGroup.rotation.x += deltaY * 0.008;
        }
      } else if (this.dragMode === 'orbit') {
        // ROTATION 2: Orbit Camera 360° around Celestial Cosmos
        this.cameraOrbit.theta -= deltaX * 0.005;
        this.cameraOrbit.phi += deltaY * 0.005;
        this.cameraOrbit.phi = Math.max(-1.35, Math.min(1.35, this.cameraOrbit.phi));
      }

      this.previousMousePos = { x: event.clientX, y: event.clientY };
      return;
    }

    // Hover Cursor Feedback (Instant pointer feedback when hovering interactive elements)
    if (!this.canvas) return;
    let hitInteractive = false;

    if (this.cubeFocus === 'main') {
      const sunMetrics = this.getSunScreenMetrics();
      if (sunMetrics) {
        const distToSunPx = Math.hypot(event.clientX - sunMetrics.x, event.clientY - sunMetrics.y);
        if (distToSunPx <= sunMetrics.radiusPx) {
          hitInteractive = true;
        }
      }
    }

    if (!hitInteractive && this.camera && this.scene) {
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const hoverHits = this.raycaster.intersectObjects(this.scene.children, true);
      for (const h of hoverHits) {
        const u = h.object.userData;
        if (!u) continue;
        if (u.isDisconnectedCube) {
          hitInteractive = true;
          break;
        }
        if (this.cubeFocus === 'main' && (u.isSunCore || u.isComet || u.isGraphNode || u.isPyramid)) {
          hitInteractive = true;
          break;
        }
        if (this.cubeFocus === 'disconnected' && (u.isMainCube || u.isSunCore || u.isGraphNode || u.isPyramid)) {
          hitInteractive = true;
          break;
        }
      }
    }

    this.canvas.style.cursor = hitInteractive ? 'pointer' : 'grab';
  }

  private handlePointerUp(event: PointerEvent): void {
    const dragDist = Math.hypot(event.clientX - this.dragStartPos.x, event.clientY - this.dragStartPos.y);

    let isSunScreenTarget = false;
    if (this.cubeFocus === 'main') {
      const sunMetrics = this.getSunScreenMetrics();
      if (sunMetrics) {
        const distPx = Math.hypot(event.clientX - sunMetrics.x, event.clientY - sunMetrics.y);
        if (distPx <= sunMetrics.radiusPx) {
          isSunScreenTarget = true;
        }
      }
    }

    if (this.pendingClickObj) {
      const u = this.pendingClickObj.userData || {};

      // 1. Click on Disconnected Cube while on Main Cube -> Switch to disconnected
      if (u.isDisconnectedCube && this.cubeFocus === 'main') {
        if (dragDist <= 24) {
          this.setCubeFocus('disconnected');
        }
        this.isDragging = false;
        this.pendingClickObj = null;
        if (this.canvas) this.canvas.style.cursor = 'grab';
        return;
      }

      // 2. Click on Main Cube while inspecting Disconnected Cube -> Switch back to main
      if (this.cubeFocus === 'disconnected') {
        if (u.isMainCube || u.isSunCore || u.isGraphNode || u.isPyramid) {
          if (dragDist <= 24) {
            this.setCubeFocus('main');
          }
        }
        this.isDragging = false;
        this.pendingClickObj = null;
        if (this.canvas) this.canvas.style.cursor = 'grab';
        return;
      }

      // 3. Normal Main Cube interactions
      const isSun = isSunScreenTarget || u.isSunCore || this.pendingClickObj === this.sunGroup || this.pendingClickObj === this.sunHitSphere;
      const maxDrag = isSun || u.isComet ? 32 : 12;

      if (dragDist <= maxDrag) {
        if (isSun) {
          this.triggerSunClick();
        } else if (u.isComet && u.ideaId) {
          this.callbacks.onCometClick(u.ideaId);
        } else if (u.isGraphNode && u.nodeId) {
          this.callbacks.onNodeClick(u.nodeId);
        } else if (u.isPyramid && u.agentId) {
          this.callbacks.onAgentClick(u.agentId);
        }
      }
    } else if (dragDist <= 32 && this.cubeFocus === 'main') {
      if (isSunScreenTarget) {
        this.triggerSunClick();
      } else if (this.sunGroup && this.camera) {
        const rect = this.canvas?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          this.raycaster.setFromCamera(this.mouse, this.camera);
          const sunWorldPos = new THREE.Vector3();
          this.sunGroup.getWorldPosition(sunWorldPos);
          if (this.raycaster.ray.distanceToPoint(sunWorldPos) <= 2.2) {
            this.triggerSunClick();
          }
        }
      }
    }

    this.isDragging = false;
    this.dragMode = null;
    this.pendingClickObj = null;

    if (this.canvas) {
      this.canvas.style.cursor = isSunScreenTarget ? 'pointer' : 'grab';
    }
  }

  // --- Cube Focus Switching & Navigation API ---

  public getCubeFocus(): CubeFocus {
    return this.cubeFocus;
  }

  public setCubeFocus(focus: CubeFocus): void {
    if (this.cubeFocus === focus) return;
    this.cubeFocus = focus;

    if (focus === 'main') {
      this.cameraTargetLookAt.copy(MAIN_CUBE_LOOK_AT);
      this.cameraTargetPosition.copy(MAIN_CUBE_CAM_POS);
      this.cameraDistance = 12.903;
      this.cameraOrbit.theta = 0.0;
      this.cameraOrbit.phi = 0.251;
    } else {
      this.cameraTargetLookAt.copy(DISCONNECTED_LOOK_AT);
      this.cameraTargetPosition.copy(DISCONNECTED_CAM_POS);
      this.cameraDistance = 8.462;
      this.cameraOrbit.theta = 0.5605;
      this.cameraOrbit.phi = 0.214;
    }

    if (this.reducedMotion && this.camera) {
      const targetCamX = this.cameraTargetLookAt.x + this.cameraDistance * Math.cos(this.cameraOrbit.phi) * Math.sin(this.cameraOrbit.theta);
      const targetCamY = this.cameraTargetLookAt.y + this.cameraDistance * Math.sin(this.cameraOrbit.phi);
      const targetCamZ = this.cameraTargetLookAt.z + this.cameraDistance * Math.cos(this.cameraOrbit.phi) * Math.cos(this.cameraOrbit.theta);
      this.cameraTargetPosition.set(targetCamX, targetCamY, targetCamZ);
      this.camera.position.copy(this.cameraTargetPosition);
      this.currentLookAt.copy(this.cameraTargetLookAt);
      this.camera.lookAt(this.currentLookAt);
      if (this.renderer && this.scene) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    this.callbacks.onCubeFocusChange?.(focus);
  }

  public toggleCubeFocus(): void {
    this.setCubeFocus(this.cubeFocus === 'main' ? 'disconnected' : 'main');
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.LineSegments ||
        child instanceof THREE.Line ||
        child instanceof THREE.Points
      ) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  public dispose(): void {
    this.isDisposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', this.handleResizeBound);
    }

    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChangeBound);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDownBound);
      this.canvas.removeEventListener('pointermove', this.handlePointerMoveBound);
      this.canvas.removeEventListener('pointerup', this.handlePointerUpBound);
      this.canvas.removeEventListener('click', this.handleClickBound);
      this.canvas.removeEventListener('contextmenu', this.handleContextMenuBound);
      if (this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }

    if (this.scene) {
      this.disposeObject(this.scene);
      this.scene = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.canvas = null;
    this.camera = null;
    this.cubeGroup = null;
    this.sunGroup = null;
    this.sunSphere = null;
    this.sunPlasmaShroud = null;
    this.innerSun = null;
    this.sunHitSphere = null;
    this.coronaRing1 = null;
    this.coronaRing2 = null;
    this.torusProminence = null;
    this.wireframeCube = null;
    this.wireframeCubeAura = null;
    this.purpleFrameGroup = null;
    this.purpleStruts = [];
    this.purpleBeacons = [];
    this.cornerSpheres = [];
    this.electronBeads = [];
    this.starfield = null;
    this.starfieldGroup = null;
    this.starfieldFar = null;
    this.starfieldNear = null;
    this.starLayers = [];
    this.liquidParticlesInside = null;
    this.liquidPositions = null;
    this.liquidVels = null;
    this.liquidColors = null;
    this.liquidBaseColors = null;
    this.sunLight = null;
    this.ambientLight = null;
    this.nodesGroup = null;
    this.edgesMesh = null;
    this.pyramidsGroup = null;
    this.cometsGroup = null;

    // Dispose Disconnected Cube references
    this.disconnectedCubeGroup = null;
    this.disconnectedSunGroup = null;
    this.disconnectedSunSphere = null;
    this.disconnectedInnerSun = null;
    this.disconnectedCoronaRing1 = null;
    this.disconnectedCoronaRing2 = null;
    this.disconnectedWireframe = null;
    this.disconnectedCornerSpheres = [];
    this.disconnectedDebrisGroup = null;
  }
}
