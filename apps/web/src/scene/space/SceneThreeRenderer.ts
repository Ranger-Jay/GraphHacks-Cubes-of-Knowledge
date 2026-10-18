import * as THREE from 'three';
import type { AgentId, GraphNode, GraphEdge, SpaceSceneSnapshot } from '@cubes/contracts';

export type CubeFocus = 'main' | 'disconnected';

export const MAIN_CUBE_POS = new THREE.Vector3(0, 0, 0);
export const MAIN_CUBE_CAM_POS = new THREE.Vector3(0, 3.2, 12.5);
export const MAIN_CUBE_LOOK_AT = new THREE.Vector3(0, 0, 0);

export const DISCONNECTED_CUBE_POS = new THREE.Vector3(5.6, 0.5, -2.0);
export const DISCONNECTED_CAM_POS = new THREE.Vector3(10.0, 2.3, 5.0);
export const DISCONNECTED_LOOK_AT = new THREE.Vector3(5.6, 0.5, -2.0);

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
  private cornerSpheres: THREE.Mesh[] = [];
  private electronBeads: Array<{ mesh: THREE.Mesh; orbitRadius: number; baseAngle: number; speed: number; tilt: THREE.Euler }> = [];
  private starfield: THREE.Points | null = null;
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

  // Bound Event Handlers for Reliable Removal
  private handleResizeBound: () => void;
  private handlePointerDownBound: (e: PointerEvent) => void;
  private handlePointerMoveBound: (e: PointerEvent) => void;
  private handlePointerUpBound: (e: PointerEvent) => void;
  private handleClickBound: (e: MouseEvent) => void;

  constructor(container: HTMLElement, callbacks: SceneThreeCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.handleResizeBound = this.handleResize.bind(this);
    this.handlePointerDownBound = this.handlePointerDown.bind(this);
    this.handlePointerMoveBound = this.handlePointerMove.bind(this);
    this.handlePointerUpBound = this.handlePointerUp.bind(this);
    this.handleClickBound = this.handleClick.bind(this);

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
      this.buildCornerSpheres();
      this.buildSunCore();
      this.buildAgentPyramids();
      this.buildDisconnectedCube();

      this.nodesGroup = new THREE.Group();
      this.scene.add(this.nodesGroup);

      this.cometsGroup = new THREE.Group();
      this.scene.add(this.cometsGroup);

      // Attach Listeners
      window.addEventListener('resize', this.handleResizeBound);
      this.canvas.addEventListener('pointerdown', this.handlePointerDownBound);
      this.canvas.addEventListener('pointermove', this.handlePointerMoveBound);
      this.canvas.addEventListener('pointerup', this.handlePointerUpBound);
      this.canvas.addEventListener('click', this.handleClickBound);

      // Start Render Loop
      this.startLoop();
    } catch {
      // Graceful fallback for mock or unsupported WebGL in unit test contexts
      this.renderer = null;
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

  private buildStarfield(): void {
    if (!this.scene) return;
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1800;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const r = 25 + Math.random() * 55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i3 + 2] = r * Math.cos(phi);

      const c = Math.random();
      if (c > 0.8) {
        starColors[i3] = 0.0;
        starColors[i3 + 1] = 0.9;
        starColors[i3 + 2] = 1.0;
      } else if (c > 0.6) {
        starColors[i3] = 1.0;
        starColors[i3 + 1] = 0.75;
        starColors[i3 + 2] = 0.2;
      } else {
        starColors[i3] = 0.85;
        starColors[i3 + 1] = 0.9;
        starColors[i3 + 2] = 1.0;
      }
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfield);
  }

  private buildCompanyCube(): void {
    if (!this.scene) return;
    this.cubeGroup = new THREE.Group();
    this.cubeGroup.userData = { isMainCube: true };
    this.scene.add(this.cubeGroup);

    const size = 6.4;
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
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.rotation.z = Math.PI / 2;
      strut.position.set(x, y, z);
      strut.userData = { isMainCube: true };
      this.purpleFrameGroup?.add(strut);
    });

    // 4 Y-parallel struts
    const yConfigs: Array<[number, number, number]> = [
      [-pHalf, 0, -pHalf],
      [pHalf, 0, -pHalf],
      [-pHalf, 0, pHalf],
      [pHalf, 0, pHalf],
    ];
    yConfigs.forEach(([x, y, z]) => {
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.position.set(x, y, z);
      strut.userData = { isMainCube: true };
      this.purpleFrameGroup?.add(strut);
    });

    // 4 Z-parallel struts
    const zConfigs: Array<[number, number, number]> = [
      [-pHalf, -pHalf, 0],
      [pHalf, -pHalf, 0],
      [-pHalf, pHalf, 0],
      [pHalf, pHalf, 0],
    ];
    zConfigs.forEach(([x, y, z]) => {
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.rotation.x = Math.PI / 2;
      strut.position.set(x, y, z);
      strut.userData = { isMainCube: true };
      this.purpleFrameGroup?.add(strut);
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
          const beacon = new THREE.Mesh(beaconGeo, beaconMat);
          beacon.position.set(x, y, z);
          beacon.userData = { isMainCube: true };
          this.purpleFrameGroup?.add(beacon);
        });
      });
    });
  }

  private buildCornerSpheres(): void {
    if (!this.cubeGroup) return;
    const size = 6.4;
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
    const size = 4.6;
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
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0x334155);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
        if (this.coronaRing1) (this.coronaRing1.material as THREE.MeshBasicMaterial).color.setHex(0x334155);
        if (this.coronaRing2) (this.coronaRing2.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
        if (this.sunLight) this.sunLight.intensity = 0.2;
        this.cornerSpheres.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0xe11d48);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.45;
        });
      } else if (!isReady) {
        // Checking / Blocked non-ready
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0x64748b);
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0xd97706);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0x78350f);
        if (this.coronaRing1) (this.coronaRing1.material as THREE.MeshBasicMaterial).color.setHex(0xd97706);
        if (this.coronaRing2) (this.coronaRing2.material as THREE.MeshBasicMaterial).color.setHex(0x78350f);
        if (this.sunLight) this.sunLight.intensity = 0.8;
        this.cornerSpheres.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0x64748b);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.7;
        });
      } else {
        // Active Fusion & Electric Cyan
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0x00e5ff);
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0xffb300);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0xffd54f);
        if (this.coronaRing1) (this.coronaRing1.material as THREE.MeshBasicMaterial).color.setHex(0xffb300);
        if (this.coronaRing2) (this.coronaRing2.material as THREE.MeshBasicMaterial).color.setHex(0xffd54f);
        if (this.sunLight) this.sunLight.intensity = 2.2;
        this.cornerSpheres.forEach((s) => {
          (s.material as THREE.MeshBasicMaterial).color.setHex(0xff1744);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.95;
        });
      }
    }

    // 2. Rebuild Graph Nodes & Edges from Snapshot
    this.rebuildGraphGeometry(snapshot.data.nodes, snapshot.data.edges, isReady);

    // 3. Rebuild IdeaVerse Comets from snapshot.ideaIds
    this.rebuildComets(snapshot.ideaIds, isReady);

    // If reduced motion is requested, render a static frame
    if (this.reducedMotion && this.renderer && this.scene && this.camera) {
      if (this.cubeGroup) this.cubeGroup.rotation.set(0.18, 0.28, 0);
      if (this.disconnectedCubeGroup) this.disconnectedCubeGroup.rotation.set(-0.15, 0.22, 0);
      this.camera.position.copy(this.cameraTargetPosition);
      this.currentLookAt.copy(this.cameraTargetLookAt);
      this.camera.lookAt(this.currentLookAt);
      this.renderer.render(this.scene, this.camera);
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

      if (!this.reducedMotion) {
        const now = performance.now();
        const delta = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;
        const elapsed = (now - this.startTime) / 1000;

        // Smooth Camera Transition (Lerp towards active cube target)
        if (this.camera) {
          const lerpFactor = Math.min(delta * 4.0, 0.25);
          this.camera.position.lerp(this.cameraTargetPosition, lerpFactor);
          this.currentLookAt.lerp(this.cameraTargetLookAt, lerpFactor);
          this.camera.lookAt(this.currentLookAt);
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
        if (this.starfield) {
          this.starfield.rotation.y += delta * 0.012;
        }
      } else if (this.camera) {
        this.camera.position.copy(this.cameraTargetPosition);
        this.currentLookAt.copy(this.cameraTargetLookAt);
        this.camera.lookAt(this.currentLookAt);
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
        } else if (discHit) {
          this.pendingClickObj = discHit.object;
        }
      } else {
        if (discHit) {
          this.pendingClickObj = discHit.object;
        } else if (cometHit) {
          this.pendingClickObj = cometHit.object;
        } else if (isTargetingSun) {
          this.pendingClickObj = this.sunHitSphere || this.sunGroup;
        } else if (mainHit) {
          this.pendingClickObj = mainHit.object;
        }
      }
    } else if (isTargetingSun) {
      this.pendingClickObj = this.sunHitSphere || this.sunGroup;
    }

    if (this.canvas) {
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.isDragging) {
      if (this.reducedMotion) return;
      const deltaX = event.clientX - this.previousMousePos.x;
      const deltaY = event.clientY - this.previousMousePos.y;
      if (this.cubeFocus === 'main' && this.cubeGroup) {
        this.cubeGroup.rotation.y += deltaX * 0.008;
        this.cubeGroup.rotation.x += deltaY * 0.008;
      } else if (this.cubeFocus === 'disconnected' && this.disconnectedCubeGroup) {
        this.disconnectedCubeGroup.rotation.y += deltaX * 0.008;
        this.disconnectedCubeGroup.rotation.x += deltaY * 0.008;
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
      const rect = this.canvas.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
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
    } else {
      this.cameraTargetLookAt.copy(DISCONNECTED_LOOK_AT);
      this.cameraTargetPosition.copy(DISCONNECTED_CAM_POS);
    }

    if (this.reducedMotion && this.camera) {
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

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResizeBound);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.handlePointerDownBound);
      this.canvas.removeEventListener('pointermove', this.handlePointerMoveBound);
      this.canvas.removeEventListener('pointerup', this.handlePointerUpBound);
      this.canvas.removeEventListener('click', this.handleClickBound);
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
    this.cornerSpheres = [];
    this.electronBeads = [];
    this.starfield = null;
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
