import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FrameLights, pyramidDetails, solarDial } from '../../apps/web/src/scene/space/VisualDetails';
import { SceneThreeRenderer } from '../../apps/web/src/scene/space/SceneThreeRenderer';

test('procedural ornaments have bounded geometry and no invented evidence metadata', () => {
  const frame = new FrameLights(3.2), pyramid = pyramidDetails(0xb388ff, 'AVA'), sun = solarDial();
  assert.equal(frame.group.children.length, 2);
  assert.equal(sun.children.length, 4);
  for (let i = 0; i < 100; i++) {
    frame.update(i * 1.27);
    for (const light of frame.group.children) assert.ok(light.position.length() <= 3.2 * Math.sqrt(3) + 1e-8);
  }
  let disposedGeometry = 0, disposedMaterials = 0, geometry = 0, materials = 0;
  for (const group of [frame.group, pyramid, sun]) group.traverse(child => {
    assert.equal(Object.keys(child.userData).length, 0);
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      geometry++; child.geometry.addEventListener('dispose', () => disposedGeometry++);
      const all = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of all) { materials++; m.addEventListener('dispose', () => disposedMaterials++); }
    }
  });
  const renderer = new SceneThreeRenderer({} as HTMLElement, { onSunClick() {}, onNodeClick() {}, onAgentClick() {}, onCometClick() {} });
  for (const group of [frame.group, pyramid, sun]) (renderer as any).disposeObject(group);
  assert.equal(disposedGeometry, geometry); assert.equal(disposedMaterials, materials);
});

test('name-badge sprite textures are released with the scene', () => {
  const texture = new THREE.Texture(), material = new THREE.SpriteMaterial({ map: texture });
  let disposed = 0; texture.addEventListener('dispose', () => disposed++);
  const renderer = new SceneThreeRenderer({} as HTMLElement, { onSunClick() {}, onNodeClick() {}, onAgentClick() {}, onCometClick() {} });
  (renderer as any).disposeObject(new THREE.Sprite(material)); assert.equal(disposed, 1);
});
