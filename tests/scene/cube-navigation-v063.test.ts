import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAIN_CUBE_SIZE, DISCONNECTED_CUBE_SIZE, MIN_CUBE_GAP, MAIN_CUBE_POS, DISCONNECTED_CUBE_POS,
  DISCONNECTED_LOOK_AT, DISCONNECTED_CAM_POS } from '../../apps/web/src/scene/space/SceneThreeRenderer';

test('rotated cube bodies retain two main-cube widths of clear space', () => {
  const main = new THREE.Mesh(new THREE.BoxGeometry(MAIN_CUBE_SIZE, MAIN_CUBE_SIZE, MAIN_CUBE_SIZE));
  const red = new THREE.Mesh(new THREE.BoxGeometry(DISCONNECTED_CUBE_SIZE, DISCONNECTED_CUBE_SIZE, DISCONNECTED_CUBE_SIZE));
  main.position.copy(MAIN_CUBE_POS); red.position.copy(DISCONNECTED_CUBE_POS);
  // Bound all possible rotations by their circumscribed spheres, plus the corner lights.
  const bodyRadii = (MAIN_CUBE_SIZE + DISCONNECTED_CUBE_SIZE) * Math.sqrt(3) / 2 + 0.36;
  assert.ok(main.position.distanceTo(red.position) - bodyRadii >= MIN_CUBE_GAP);
  for (let i = 0; i < 24; i++) {
    main.rotation.set(i * 0.31, i * 0.43, i * 0.17);
    red.rotation.set(i * -0.27, i * 0.59, i * 0.41);
    const a = new THREE.Box3().setFromObject(main);
    const b = new THREE.Box3().setFromObject(red);
    assert.ok(b.min.x - a.max.x >= 2 * MAIN_CUBE_SIZE);
  }
  main.geometry.dispose(); red.geometry.dispose();
});

test('comparison focus follows its moved cube, preserving the close-up offset', () => {
  assert.ok(DISCONNECTED_LOOK_AT.equals(DISCONNECTED_CUBE_POS));
  assert.ok(DISCONNECTED_CAM_POS.clone().sub(DISCONNECTED_LOOK_AT).distanceTo(new THREE.Vector3(4.4, 1.8, 7)) < 1e-10);
});
