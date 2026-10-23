import * as THREE from 'three';

/** Cosmetic geometry only: no evidence IDs, graph edges, network or authority. */
export function pyramidDetails(color: number, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = 'decorative-pyramid-inscriptions';
  const paths: THREE.Vector3[] = [];
  // Abstract stepped circuitry on all four faces, deliberately no AUTH/hash claims.
  for (let face = 0; face < 4; face++) {
    const turn = new THREE.Euler(0, face * Math.PI / 2 + Math.PI / 4, 0);
    for (let row = 0; row < 4; row++) {
      const y = -0.29 + row * 0.13, width = 0.2 - row * 0.035, z = 0.29 - row * 0.045;
      const p = [[-width, y, z], [-width / 2, y, z], [-width / 2, y + 0.045, z], [width, y + 0.045, z]];
      for (let i = 0; i < p.length - 1; i++) {
        paths.push(new THREE.Vector3(...p[i] as [number, number, number]).applyEuler(turn),
          new THREE.Vector3(...p[i + 1] as [number, number, number]).applyEuler(turn));
      }
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(paths),
    new THREE.LineBasicMaterial({ color: 0xe4dcff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })));
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  gem.position.y = 0.66; group.add(gem);
  // Name badge is a local canvas texture; no external fonts, images or requests.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    let context: CanvasRenderingContext2D | null = null;
    try { context = canvas.getContext('2d'); } catch { /* Text dock remains available. */ }
    if (context) {
      context.fillStyle = '#080c1c'; context.fillRect(0, 0, 256, 64);
      context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; context.strokeRect(1, 1, 254, 62);
      context.fillStyle = '#f1f5ff'; context.font = '600 28px monospace'; context.textAlign = 'center';
      context.fillText(name, 128, 43);
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity: 0.9, depthWrite: false }));
      badge.scale.set(0.85, 0.21, 1); badge.position.y = -0.65; group.add(badge);
    }
  }
  return group;
}

export function solarDial(): THREE.Group {
  const group = new THREE.Group(); group.name = 'decorative-solar-gyroscope';
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * 0.12, 0.012, 6, 80),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffd89c : 0xffb300, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.set(i * 0.63, i * 0.4, 0.3); group.add(ring);
  }
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI / 24;
    for (const r of [1.63, i % 4 === 0 ? 1.77 : 1.68]) points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xffca70, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })));
  return group;
}

/** Two bounded lights travel opposite ways on a containment-frame edge loop. */
export class FrameLights {
  readonly group = new THREE.Group();
  private readonly beads: THREE.Mesh[] = [];
  private readonly route: THREE.Vector3[];
  constructor(half: number) {
    this.group.name = 'decorative-frame-lights';
    this.route = [[-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1], [-1,1,1], [1,1,1], [1,-1,1], [-1,-1,1], [-1,-1,-1]]
      .map(p => new THREE.Vector3(...p as [number, number, number]).multiplyScalar(half));
    for (let i = 0; i < 2; i++) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), new THREE.MeshBasicMaterial({ color: i ? 0xb388ff : 0xe6fbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
      this.beads.push(bead); this.group.add(bead);
    }
    this.update(0);
  }
  update(seconds: number): void {
    this.beads.forEach((bead, i) => {
      const step = ((i ? 8 - seconds * 0.55 : seconds * 0.55) % 8 + 8) % 8;
      const index = Math.floor(step);
      bead.position.lerpVectors(this.route[index]!, this.route[index + 1]!, step - index);
    });
  }
}
