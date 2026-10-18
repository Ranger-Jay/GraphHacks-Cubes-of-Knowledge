import * as THREE from 'three';
import type { AgentId, GraphNode, GraphEdge, SpaceSceneSnapshot } from '@cubes/contracts';

export interface SceneThreeCallbacks {
  onSunClick: () => void;
  onNodeClick: (nodeId: string) => void;
  onAgentClick: (agentId: AgentId) => void;
  onCometClick: (ideaId: string) => void;
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

  // Scene Objects
  private cubeGroup: THREE.Group | null = null;
  private sunGroup: THREE.Group | null = null;
  private sunSphere: THREE.Mesh | null = null;
  private innerSun: THREE.Mesh | null = null;
  private sunHitSphere: THREE.Mesh | null = null;
  private wireframeCube: THREE.LineSegments | null = null;
  private nodesGroup: THREE.Group | null = null;
  private edgesMesh: THREE.LineSegments | null = null;
  private pyramidsGroup: THREE.Group | null = null;
  private cometsGroup: THREE.Group | null = null;

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
      const width = this.container.clientWidth || 800;
      const height = this.container.clientHeight || 600;

      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.camera.position.set(0, 3.2, 12.5);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.canvas = this.renderer.domElement;
      this.canvas.style.display = 'block';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.container.appendChild(this.canvas);

      // Build 3D Objects
      this.buildCompanyCube();
      this.buildSunCore();
      this.buildAgentPyramids();

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

  private buildCompanyCube(): void {
    if (!this.scene) return;
    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    const size = 6.4;
    const boxGeo = new THREE.BoxGeometry(size, size, size);
    const wireGeo = new THREE.WireframeGeometry(boxGeo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.85,
    });
    this.wireframeCube = new THREE.LineSegments(wireGeo, wireMat);
    this.cubeGroup.add(this.wireframeCube);
  }

  private buildSunCore(): void {
    if (!this.cubeGroup) return;
    this.sunGroup = new THREE.Group();
    this.cubeGroup.add(this.sunGroup);

    // 1. Mantle
    const sunGeo = new THREE.SphereGeometry(0.95, 24, 24);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffb300,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    this.sunSphere = new THREE.Mesh(sunGeo, sunMat);
    this.sunSphere.userData = { isSunCore: true };
    this.sunGroup.add(this.sunSphere);

    // 2. Fusion Core
    const innerGeo = new THREE.SphereGeometry(0.68, 20, 20);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.92,
    });
    this.innerSun = new THREE.Mesh(innerGeo, innerMat);
    this.innerSun.userData = { isSunCore: true };
    this.sunGroup.add(this.innerSun);

    // 3. Dedicated Transparent Hit Sphere for Reliable Interception
    const hitGeo = new THREE.SphereGeometry(1.85, 20, 20);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sunHitSphere = new THREE.Mesh(hitGeo, hitMat);
    this.sunHitSphere.userData = { isSunCore: true };
    this.sunGroup.add(this.sunHitSphere);
  }

  private buildAgentPyramids(): void {
    if (!this.scene) return;
    this.pyramidsGroup = new THREE.Group();
    this.scene.add(this.pyramidsGroup);

    const agents: Array<{ id: AgentId; color: number; angle: number }> = [
      { id: 'roy', color: 0xffb300, angle: 0 },
      { id: 'ava', color: 0x9333ea, angle: (Math.PI * 2) / 3 },
      { id: 'guz', color: 0x10b981, angle: (Math.PI * 4) / 3 },
    ];

    agents.forEach((ag) => {
      const geo = new THREE.ConeGeometry(0.45, 0.9, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: ag.color,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const r = 5.2;
      mesh.position.set(Math.cos(ag.angle) * r, 0, Math.sin(ag.angle) * r);
      mesh.userData = { isPyramid: true, agentId: ag.id, baseAngle: ag.angle };
      this.pyramidsGroup?.add(mesh);
    });
  }

  public update(snapshot: SpaceSceneSnapshot): void {
    this.currentSnapshot = snapshot;
    this.reducedMotion = snapshot.reducedMotion;

    const isReady = snapshot.runtime.phase === 'READY' && snapshot.data.status === 'AVAILABLE';
    const isOutage = snapshot.runtime.phase === 'GRAPH_UNAVAILABLE';

    // 1. Update Sun & Cube appearance based on Phase
    if (this.wireframeCube && this.sunSphere && this.innerSun) {
      if (isOutage) {
        // Cold dwarf collapse / Crimson Outage warning
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0xe11d48);
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0x334155);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0x1e293b);
      } else if (!isReady) {
        // Checking / Blocked non-ready
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0x64748b);
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0xd97706);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0x78350f);
      } else {
        // Active Fusion & Electric Cyan
        (this.wireframeCube.material as THREE.LineBasicMaterial).color.setHex(0x00e5ff);
        (this.sunSphere.material as THREE.MeshBasicMaterial).color.setHex(0xffb300);
        (this.innerSun.material as THREE.MeshBasicMaterial).color.setHex(0xffd54f);
      }
    }

    // 2. Rebuild Graph Nodes & Edges from Snapshot
    this.rebuildGraphGeometry(snapshot.data.nodes, snapshot.data.edges, isReady);

    // 3. Rebuild IdeaVerse Comets from snapshot.ideaIds
    this.rebuildComets(snapshot.ideaIds, isReady);

    // If reduced motion is requested, render a static frame
    if (this.reducedMotion && this.renderer && this.scene && this.camera) {
      if (this.cubeGroup) this.cubeGroup.rotation.set(0.18, 0.28, 0);
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

        // Gentle Cube Idle Tumble
        if (this.cubeGroup && !this.isDragging) {
          this.cubeGroup.rotation.y += delta * 0.12;
          this.cubeGroup.rotation.x += delta * 0.06;
        }

        // Sun Breathing
        if (this.innerSun) {
          const s = 1.0 + Math.sin(elapsed * 2.5) * 0.04;
          this.innerSun.scale.set(s, s, s);
        }
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
    const now = performance.now();
    if (now - this.lastSunClickTime < 250) return;
    this.lastSunClickTime = now;
    this.callbacks.onSunClick();
  }

  private handleClick(event: MouseEvent): void {
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

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Dual-Check: Screen-space projection AND 3D ray distance to Sun Core
    let isTargetingSun = false;
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

    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    if (hits.length > 0) {
      const cometHit = hits.find((h) => h.object.userData && h.object.userData.isComet);
      if (cometHit) {
        this.pendingClickObj = cometHit.object;
      } else if (isTargetingSun) {
        this.pendingClickObj = this.sunHitSphere || this.sunGroup;
      } else {
        const interactive = hits.find(
          (h) =>
            h.object.userData &&
            (h.object.userData.isGraphNode || h.object.userData.isPyramid || h.object.userData.isSunCore)
        );
        if (interactive) this.pendingClickObj = interactive.object;
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
      if (!this.cubeGroup || this.reducedMotion) return;
      const deltaX = event.clientX - this.previousMousePos.x;
      const deltaY = event.clientY - this.previousMousePos.y;
      this.cubeGroup.rotation.y += deltaX * 0.008;
      this.cubeGroup.rotation.x += deltaY * 0.008;
      this.previousMousePos = { x: event.clientX, y: event.clientY };
      return;
    }

    // Hover Cursor Feedback (Instant pointer feedback when hovering interactive elements)
    if (!this.canvas) return;
    let hitInteractive = false;

    // 1. Screen-space Solar Core hover check (highest priority, zero raycast drop)
    const sunMetrics = this.getSunScreenMetrics();
    if (sunMetrics) {
      const distToSunPx = Math.hypot(event.clientX - sunMetrics.x, event.clientY - sunMetrics.y);
      if (distToSunPx <= sunMetrics.radiusPx) {
        hitInteractive = true;
      }
    }

    // 2. 3D Raycast fallback for nodes, comets, agent pyramids, or 3D sun proximity
    if (!hitInteractive && this.camera && this.scene) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        if (this.sunGroup) {
          const sunWorldPos = new THREE.Vector3();
          this.sunGroup.getWorldPosition(sunWorldPos);
          if (this.raycaster.ray.distanceToPoint(sunWorldPos) <= 2.2) {
            hitInteractive = true;
          }
        }

        if (!hitInteractive) {
          const hoverHits = this.raycaster.intersectObjects(this.scene.children, true);
          for (const h of hoverHits) {
            const u = h.object.userData;
            if (u && (u.isSunCore || u.isComet || u.isGraphNode || u.isPyramid)) {
              hitInteractive = true;
              break;
            }
          }
        }
      }
    }

    this.canvas.style.cursor = hitInteractive ? 'pointer' : 'grab';
  }

  private handlePointerUp(event: PointerEvent): void {
    const dragDist = Math.hypot(event.clientX - this.dragStartPos.x, event.clientY - this.dragStartPos.y);

    // Screen-space verification for the central Sun
    let isSunScreenTarget = false;
    const sunMetrics = this.getSunScreenMetrics();
    if (sunMetrics) {
      const distPx = Math.hypot(event.clientX - sunMetrics.x, event.clientY - sunMetrics.y);
      if (distPx <= sunMetrics.radiusPx) {
        isSunScreenTarget = true;
      }
    }

    if (this.pendingClickObj) {
      const u = this.pendingClickObj.userData || {};
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
    } else if (dragDist <= 32) {
      // Direct release / fallback check for central Sun core
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

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
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
    this.nodesGroup = null;
    this.pyramidsGroup = null;
    this.cometsGroup = null;
  }
}
