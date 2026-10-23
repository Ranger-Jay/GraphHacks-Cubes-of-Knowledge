import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MAIN_CUBE_SIZE, DISCONNECTED_CUBE_SIZE, MIN_CUBE_GAP, MAIN_CUBE_POS, DISCONNECTED_CUBE_POS,
  DISCONNECTED_LOOK_AT, DISCONNECTED_CAM_POS, cubeOverview, SceneThreeRenderer } from '../../apps/web/src/scene/space/SceneThreeRenderer';

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

test('overview fits every rotation of both cubes on desktop and portrait screens', () => {
  for (const aspect of [0.4, 0.65, 1, 1.5, 2.5]) {
    const view = cubeOverview(aspect);
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.copy(view.target).add(new THREE.Vector3(0, 0, view.distance));
    camera.lookAt(view.target); camera.updateMatrixWorld();
    for (const [center, size] of [[MAIN_CUBE_POS, MAIN_CUBE_SIZE], [DISCONNECTED_CUBE_POS, DISCONNECTED_CUBE_SIZE]] as const) {
      const radius = size * Math.sqrt(3) / 2 * 1.012 + 0.25;
      for (const x of [-radius, radius]) for (const y of [-radius, radius]) for (const z of [-radius, radius]) {
        const p = center.clone().add(new THREE.Vector3(x, y, z)).project(camera);
        assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1, `aspect=${aspect}`);
      }
    }
  }
});

// No WebGL: exercise real camera/gesture code with the renderer's headless fallback.
function navigation() {
  const renderer = new SceneThreeRenderer({ clientWidth: 800, clientHeight: 600 } as HTMLElement,
    { onSunClick() { throw new Error('gesture must not select sun'); }, onNodeClick() {}, onAgentClick() {}, onCometClick() {} });
  const state = renderer as any;
  state.camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000);
  state.scene = new THREE.Scene();
  state.canvas = { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), setPointerCapture() {} };
  return { renderer, state };
}

test('wheel, buttons and reduced motion zoom immediately, with finite bounds', () => {
  const { renderer, state } = navigation();
  renderer.showBothCubes(); const start = state.cameraDistance;
  let prevented = 0;
  state.reducedMotion = true;
  state.handleWheel({ deltaY: -100, deltaMode: 0, preventDefault() { prevented++; } });
  assert.ok(state.cameraDistance < start);
  assert.ok(Math.abs(state.camera.position.distanceTo(state.currentLookAt) - state.cameraDistance) < 1e-8);
  state.handleWheel({ deltaY: 10, deltaMode: 1, preventDefault() { prevented++; } });
  assert.ok(state.cameraDistance > start);
  for (let i = 0; i < 100; i++) renderer.zoomIn();
  assert.equal(state.cameraDistance, 8);
  for (let i = 0; i < 100; i++) renderer.zoomOut();
  assert.ok(Number.isFinite(state.cameraDistance) && state.cameraDistance >= cubeOverview(4 / 3).distance);
  const end = state.cameraDistance;
  state.handleWheel({ deltaY: NaN, preventDefault() { throw new Error('invalid wheel'); } });
  assert.equal(state.cameraDistance, end); assert.equal(prevented, 2);
  renderer.showBothCubes(); assert.equal(state.cameraDistance, start);
  state.isDisposed = true; renderer.zoomIn(); assert.equal(state.cameraDistance, start);
});

test('two-finger pinch zooms without selecting an object on release or cancellation', () => {
  const { renderer, state } = navigation(); renderer.showBothCubes();
  const pointer = (id: number, x: number) => ({ pointerType: 'touch', pointerId: id, clientX: x, clientY: 200, button: 0 });
  state.handlePointerDown(pointer(1, 200)); state.handlePointerDown(pointer(2, 300));
  const start = state.cameraDistance;
  state.handlePointerMove(pointer(2, 400)); assert.ok(state.cameraDistance < start);
  state.handlePointerUp(pointer(2, 400)); state.handlePointerUp(pointer(1, 200));
  state.handleClick({ clientX: 200, clientY: 200 });
  assert.equal(state.pendingClickObj, null); assert.equal(state.isDragging, false);
  state.handlePointerCancel(pointer(1, 200)); assert.equal(state.touchPointers.size, 0);
});
