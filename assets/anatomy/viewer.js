import * as THREE from 'three';
import { GLTFLoader } from './loaders/GLTFLoader.js';

const GROUPS = {
  Chest: 'chest', Deltoids: 'shoulders', Biceps: 'biceps', Triceps: 'triceps',
  Forearms: 'forearms', Abdominals: 'abs', Obliques: 'obliques', Quadriceps: 'quads',
  Adductors: 'adductors', 'Hip flexors': 'hips', Calves: 'calves', Lats: 'back',
  'Upper back': 'back', Trapezius: 'back', 'Teres major': 'back',
  'Spinal extensors': 'erectors', Glutes: 'glutes', Hamstrings: 'hamstrings'
};
const params = new URLSearchParams(location.search);
const primary = new Set((params.get('primary') || '').split(','));
const secondary = new Set((params.get('secondary') || '').split(','));
const interactive = params.get('interactive') === '1';
const canvas = document.querySelector('canvas');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const selection = document.querySelector('#selection');
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const cameras = [new THREE.OrthographicCamera(), new THREE.OrthographicCamera()];
let renderer, scene, model, angle = 0, bounds, meshes = [], isolated = false;

function failure(error) {
  console.error('Anatomy viewer:', error);
  status.hidden = false;
  status.replaceChildren();
  const message = document.createElement('p');
  message.textContent = '3D anatomy could not load. Check your connection and WebGL support. Muscle names remain available below.';
  const retry = document.createElement('button');
  retry.textContent = 'Retry anatomy';
  retry.addEventListener('click', () => location.reload());
  status.append(message, retry);
}

function render() {
  if (!model || !renderer || !stage.clientWidth) return;
  const width = stage.clientWidth, height = stage.clientHeight;
  renderer.setSize(width, height, false);
  renderer.setScissorTest(true);
  for (let index = 0; index < 2; index++) {
    const left = index ? Math.floor(width / 2) : 0;
    const viewportWidth = index ? width - left : Math.floor(width / 2);
    const camera = cameras[index];
    const aspect = viewportWidth / height;
    const halfHeight = Math.max(bounds.y * .56, bounds.x * .56 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.near = .01;
    camera.far = 20;
    const rotation = angle + index * Math.PI;
    camera.position.set(Math.sin(rotation) * 4, 0, Math.cos(rotation) * 4);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setViewport(left, 0, viewportWidth, height);
    renderer.setScissor(left, 0, viewportWidth, height);
    renderer.render(scene, camera);
  }
}

function hit(event) {
  if (!model) return null;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const leftWidth = Math.floor(rect.width / 2), index = x < leftWidth ? 0 : 1;
  const viewWidth = index ? rect.width - leftWidth : leftWidth;
  pointer.set(((x - (index ? leftWidth : 0)) / viewWidth) * 2 - 1, -(y / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, cameras[index]);
  return raycaster.intersectObjects(meshes.filter(mesh=>mesh.visible), false)[0]?.object || null;
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x10151c, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe4efff, 0x303a44, 2.4));
  for (const [x, z, intensity] of [[-2, 3, 3.5], [2, -3, 3.5], [3, 2, 1.5]]) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(x, 3, z);
    scene.add(light);
  }
  const gltf = await new GLTFLoader().loadAsync('./full-body-male-mobile.glb');
  model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  bounds = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const materials = new Map();
  const contextMaterial = new THREE.MeshStandardMaterial({ color:0x667481, transparent:true, opacity:.12, depthWrite:false });
  model.traverse(object => {
    if (!object.isMesh) return;
    const data = object.userData;
    const group = GROUPS[data.group];
    const color = group && primary.has(group) ? 0xc8f135 :
      group && secondary.has(group) ? 0x4fc3f7 : data.muscleId ? 0x929eab : 0x667481;
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({
      color, roughness: .72, metalness: .05,
      emissive: color === 0xc8f135 ? 0x283800 : color === 0x4fc3f7 ? 0x071c2b : 0x000000,
      emissiveIntensity: .25
    }));
    object.material = materials.get(color);
    object.userData.surfaceMaterial = object.material;
    object.visible = data.layer !== 'deep';
    object.userData.selectionGroup = group;
    meshes.push(object);
  });
  scene.add(model);
  status.hidden = true;
  selection.textContent = interactive ? 'Tap a muscle to select it. You can also use the muscle buttons below.' : 'Tap a muscle to see its anatomical name.';
  render();
  new ResizeObserver(render).observe(stage);
  document.querySelectorAll('[data-angle]').forEach(button => button.addEventListener('click', () => {
    angle = Number(button.dataset.angle);
    document.querySelectorAll('[data-angle]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    render();
  }));
  document.querySelector('#isolate').addEventListener('click', event => {
    isolated = !isolated;
    event.currentTarget.setAttribute('aria-pressed', String(isolated));
    for (const mesh of meshes) {
      const { selectionGroup: group, muscleId, layer, surfaceMaterial } = mesh.userData;
      const target = primary.has(group) || secondary.has(group);
      mesh.visible = isolated ? !muscleId || target : layer !== 'deep';
      mesh.material = isolated && !muscleId ? contextMaterial : surfaceMaterial;
    }
    selection.textContent = isolated ? 'Targets isolated, including deeper structures. Ghosted anatomy provides context.' :
      'Surface anatomy. Use Isolate targets to reveal deeper muscles.';
    render();
  });
  canvas.addEventListener('pointermove', event => { canvas.style.cursor = hit(event)?.userData.selectionGroup ? 'pointer' : 'default'; });
  canvas.addEventListener('click', event => {
    const object = hit(event);
    if (!object) return;
    selection.textContent = object.userData.label || 'Supporting anatomical structure';
    const group = object.userData.selectionGroup;
    if (interactive && group) parent.postMessage({ type: 'rebuild:select-muscle', group }, location.origin);
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    failure(new Error('WebGL context lost'));
  });
} catch (error) {
  failure(error);
}
