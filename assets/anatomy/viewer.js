import * as THREE from 'three';
import { buildSkeleton, applyFrame, applyClip, holdAtChest } from './motion.js?v=20261116e';
import { buildProps } from './props.js?v=20261116e';

/* Rebuild muscle view: a gray studio mannequin whose worked muscles glow
   (hot orange core, cool blue-white edge), like a training-app demo render.
   Body: assets/anatomy/body.bin, generated for this app with Tencent HY 3D; muscle regions were
   traced offline along the model's sculpted grooves (scripts/anatomy/). */

// region ids are fixed by the baked file
const REGIONS = ['none', 'chest', 'frontdelt', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'quads', 'adductors', 'hips',
  'calves', 'lats', 'erectors', 'glutes', 'hamstrings', 'sidedelt', 'reardelt', 'traps', 'upperback', 'serratus', 'lowerabs', 'glutemed'];
const NAMES = { chest:'Chest', frontdelt:'Front delts', sidedelt:'Side delts', reardelt:'Rear delts', biceps:'Biceps', triceps:'Triceps',
  forearms:'Forearms', abs:'Upper abs', lowerabs:'Lower abs', obliques:'Obliques', serratus:'Serratus', quads:'Quads', adductors:'Inner thighs',
  hips:'Hip flexors', calves:'Calves', lats:'Lats', traps:'Traps', upperback:'Rhomboids & teres', erectors:'Lower back',
  glutes:'Glute max', glutemed:'Glute medius', hamstrings:'Hamstrings' };
// app-level groups expand to the muscles they cover
const GROUPS = { shoulders:['frontdelt','sidedelt','reardelt'], back:['lats','traps','upperback'], abs:['abs','lowerabs'],
  core:['abs','lowerabs','obliques','serratus'], glutes:['glutes','glutemed'], obliques:['obliques','serratus'] };
const GROUP_NAMES = { shoulders:'Shoulders', back:'Back', abs:'Abs', glutes:'Glutes', obliques:'Obliques', core:'Core' };
// best camera angle (radians around the body, 0 = front) for each muscle
const FACING = { chest:0, frontdelt:.45, sidedelt:1.2, reardelt:Math.PI-.7, biceps:.4, abs:0, lowerabs:0, obliques:.55, serratus:.8,
  quads:.2, adductors:.15, hips:.35, forearms:.6, triceps:Math.PI-.5, lats:Math.PI-.35, traps:Math.PI, upperback:Math.PI,
  erectors:Math.PI, glutes:Math.PI-.3, glutemed:Math.PI-.9, hamstrings:Math.PI-.2, calves:Math.PI-.3,
  shoulders:.7, back:Math.PI, glutes_g:Math.PI-.3 };
const params = new URLSearchParams(location.search);
const list = key => (params.get(key) || '').split(',').filter(Boolean);
const expand = ids => ids.flatMap(id => GROUPS[id] || [id]);
const askedPrimary = list('primary'), askedSecondary = list('secondary');
const primary = new Set(expand(askedPrimary)), secondary = new Set(expand(askedSecondary).filter(g => !primary.has(g)));
const interactive = params.get('interactive') === '1';
const modeWord = params.get('mode') || 'Primary';
const fixedView = params.has('view') ? parseFloat(params.get('view')) : null;
// exercise motion track handed over by the app (2D side-view poses, see motion.js)
const TRACK = (() => { try { if (window.name.startsWith('rebuild-track:')) return JSON.parse(window.name.slice(14)); } catch (e) { console.warn(e); } return null; })();
// lying on the back: the side figure can't say which way the body faces, so mirror it to face up
if (TRACK?.opt?.mirror) TRACK.frames = TRACK.frames.map(fr => fr.map((p, i) => i >= 11 ? [-p[0], p[1]] : [200 - p[0], p[1]]));
const reduced = fixedView !== null || matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.querySelector('canvas'), stage = document.querySelector('#stage');
const status = document.querySelector('#status'), labelEl = document.querySelector('#label'), targetsEl = document.querySelector('#targets');
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let renderer, scene, body, regionAttr, memberAttr, bounds, rig = null, props = null;
const focus = new THREE.Vector3(), viewSize = new THREE.Vector2();
let mode = 'orbit', angle = 0, targetAngle = 0, idleSince = 0, dragging = null, visible = true;
const camera = new THREE.PerspectiveCamera(26, 1, .05, 50);
const splitCams = [new THREE.PerspectiveCamera(24, 1, .05, 50), new THREE.PerspectiveCamera(24, 1, .05, 50)];
const pulse = { value: 1 };
const levelOf = g => primary.has(g) ? 1 : secondary.has(g) ? .55 : 0;
const levels = { value: REGIONS.map(levelOf).concat(Array(24 - REGIONS.length).fill(0)) };

function failure(error) {
  console.error('Muscle view:', error);
  status.hidden = false;
  status.hidden = false;
  if (window.__viewerFail) { window.__viewerFail(); return; }
  status.innerHTML = '<div>The 3D body couldn’t load on this device.<br>The muscle names are listed below the viewer.</div>';
}

/* ---------- labels & target chips ---------- */
function setLabel(name, role) {
  labelEl.replaceChildren();
  if (!name) return;
  const b = document.createElement('b'); b.textContent = name;
  const s = document.createElement('span'); s.textContent = role;
  s.className = role === modeWord ? '' : role === 'Also involved' ? 's' : 'n';
  labelEl.append(b, s);
}
function buildChips() {
  const asked = [...new Set(askedPrimary.concat(askedSecondary.filter(g => !askedPrimary.includes(g))))];
  for (const g of asked) {
    const name = GROUP_NAMES[g] || NAMES[g]; if (!name) continue;
    const button = document.createElement('button');
    button.textContent = name; button.dataset.g = g;
    button.className = askedPrimary.includes(g) ? 'p' : 's';
    button.addEventListener('click', () => { focusGroup(g); setLabel(name, askedPrimary.includes(g) ? modeWord : 'Also involved'); });
    targetsEl.append(button);
  }
}
function focusGroup(g) {
  if (mode !== 'orbit') setMode('orbit');
  targetAngle = nearestTurn(FACING[g] ?? FACING[(GROUPS[g] || [])[0]] ?? 0);
  idleSince = performance.now();
  targetsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
}
const nearestTurn = a => a + Math.round((angle - a) / (Math.PI * 2)) * Math.PI * 2;

/* ---------- baked body ---------- */
async function loadBody(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('body ' + response.status);
  // stream the download so the spinner shows real progress on slow phone connections
  const total = +response.headers.get('content-length') || 2800000, progressEl = document.querySelector('#progress');
  let buf;
  if (response.body && response.body.getReader) {
    const reader = response.body.getReader(), chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; window.__viewerProgress = got;
      if (progressEl) progressEl.textContent = `Loading 3D body… ${Math.min(99, Math.round(got / total * 100))}%`;
    }
    const all = new Uint8Array(got); let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    buf = all.buffer;
  } else buf = await response.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x35444252) throw new Error('bad body file'); // "RBD5"
  const nv = dv.getUint32(4, true), nf = dv.getUint32(8, true);
  const mn = [0, 1, 2].map(i => dv.getFloat32(12 + i * 4, true)), mx = [0, 1, 2].map(i => dv.getFloat32(24 + i * 4, true));
  let off = 36;
  const take = (Type, count) => { const a = new Type(buf, off, count); off += a.byteLength; off += (4 - off % 4) % 4; return a; };
  const q = take(Uint16Array, nv * 3), n = take(Int8Array, nv * 3), region = take(Uint8Array, nv * 2), member = take(Uint8Array, nv * 2), cavity = take(Uint8Array, nv), depth = take(Uint8Array, nv), skinI = take(Uint8Array, nv * 4), skinW = take(Uint8Array, nv * 4);
  const index = new Uint32Array(buf, off, nf * 3);
  const c = [0, 1, 2].map(k => (mn[k] + mx[k]) / 2), pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) { const k = i % 3; pos[i] = mn[k] + (q[i] / 65535) * (mx[k] - mn[k]) - c[k]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3, true));
  g.setAttribute('aRegion', new THREE.BufferAttribute(region, 2));
  g.setAttribute('aMember', new THREE.BufferAttribute(member, 2, true));
  g.setAttribute('aCavity', new THREE.BufferAttribute(cavity, 1, true));
  g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1, true));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinI, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4, true));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.center = new THREE.Vector3(...c);
  return g;
}

/* ---------- materials ---------- */
// Each vertex knows its two nearest muscle regions and how far inside each it sits (traced along the
// sculpted grooves offline). vF = how much the vertex belongs to a worked muscle, vL = how hard it works.
const debug = params.get('debug') === '1', debugF = params.get('debug') === '2';
const PALETTE = [0xb8bcc2,0xff3b30,0xff9500,0xffd60a,0xaf52de,0x32d7f0,0xff2d92,0x34c759,0x0a84ff,0xff8fab,0x9c6b30,0x00a37a,0x3a3aff,0xe5e07a,0xff6b9d,0x7fd9ff,0xffc46b,0xb35900,0x6e2bd9,0x00c2a8,0xc6ff3d,0xff7ac8,0x804000,0x777777]
  .map(c => new THREE.Color(c));
const COMMON_VERT = `
  attribute vec2 aRegion; attribute vec2 aMember; attribute float aCavity; attribute float aDepth;
  uniform float uLevels[24];
  varying float vF; varying float vL; varying float vCav; varying float vReg; varying float vDepth;
`;
function heat(vs) {
  // vF: how far inside the worked muscles this point is (0 outside, 0.5 on the muscle's outline, 1 deep inside)
  return vs.replace('#include <begin_vertex>', `#include <begin_vertex>
    float l1 = uLevels[int(aRegion.x + 0.5)], l2 = uLevels[int(aRegion.y + 0.5)];
    float t1 = step(0.01, l1), t2 = step(0.01, l2);
    vF = t1 * aMember.x + t2 * aMember.y;
    vL = (l1 * t1 * aMember.x + l2 * t2 * aMember.y) / max(vF, 0.001);
    vCav = aCavity * 2.0 - 1.0;
    vReg = aRegion.x;
    vDepth = aDepth * step(0.01, l1);`);
}
function bodyMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: .5, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.uniforms.uLevels = levels;
    shader.uniforms.uPulse = pulse;
    shader.uniforms.uPal = { value: PALETTE };
    shader.vertexShader = COMMON_VERT + heat(shader.vertexShader);
    shader.fragmentShader = `uniform float uPulse; uniform vec3 uPal[24];
      varying float vF; varying float vL; varying float vCav; varying float vReg; varying float vDepth;\n` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float groove = clamp(vCav, 0.0, 1.0);
        float inside = smoothstep(0.47, 0.62, vF);
        float primaryK = smoothstep(0.6, 0.95, vL);
        ${debug ? 'diffuseColor.rgb = uPal[int(vReg + 0.5)];' : ''}${debugF ? 'diffuseColor.rgb = vec3(vF, vL, 0.0);' : ''}
        diffuseColor.rgb *= 1.0 - 0.42 * groove;   // keep the sculpted separations readable
        float glowRough = inside;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.2, 0.03, 0.03), vec3(0.1, 0.012, 0.008), primaryK), inside * ${debug ? '0.0' : '0.96'});`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, glowRough);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${debug ? '' : `
        float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float belly = clamp(-vCav, 0.0, 1.0);
        // studio "heat" look: orange core -> magenta toward the edge -> white-hot outline -> blue-violet spill
        vec3 orange = vec3(1.0, 0.34, 0.06), magenta = vec3(0.92, 0.16, 0.5), white = vec3(1.0, 0.93, 1.0), violet = vec3(0.36, 0.42, 1.0);
        float t = smoothstep(0.12, 0.6, vDepth);
        vec3 core = mix(magenta, orange, t);
        core = mix(core, vec3(1.0, 0.55, 0.15), smoothstep(0.6, 1.0, vDepth) * (0.4 + 0.6 * belly));
        core = mix(vec3(0.62, 0.1, 0.3), core, primaryK);            // supporting muscles: dimmer, cooler
        float glowAmt = inside * (1.0 - 0.6 * groove) * mix(0.3, 0.45 + 0.25 * t, primaryK) * (0.85 + 0.15 * uPulse);
        vec3 glow = core * glowAmt;
        float line = exp(-pow((vF - 0.5) / 0.045, 2.0));
        float outer = smoothstep(0.08, 0.5, vF) * (1.0 - smoothstep(0.5, 0.54, vF));
        glow += white * line * mix(0.35, 0.95, primaryK) * (0.8 + 0.2 * uPulse);
        glow += violet * outer * mix(0.12, 0.45, primaryK);
        glow += mix(white, violet, 0.4) * inside * smoothstep(0.5, 0.95, fr) * 1.0 * primaryK;   // silhouette rim
        totalEmissiveRadiance += glow;`}`);
  };
  return material;
}
function haloMaterial(push, strength, color) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
  material.onBeforeCompile = shader => {
    shader.uniforms.uLevels = levels;
    shader.uniforms.uPulse = pulse;
    shader.uniforms.uPush = { value: push };
    shader.uniforms.uStrength = { value: strength };
    shader.vertexShader = COMMON_VERT + 'uniform float uPush;\n' +
      heat(shader.vertexShader).replace('vCav = aCavity * 2.0 - 1.0;', 'vCav = aCavity * 2.0 - 1.0;\n transformed += normalize(normal) * uPush * smoothstep(0.2, 0.6, vF);');
    shader.fragmentShader = 'uniform float uPulse; uniform float uStrength;\nvarying float vF; varying float vL; varying float vCav; varying float vReg;\n' +
      shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        gl_FragColor.rgb *= smoothstep(0.3, 0.7, vF) * smoothstep(0.0, 1.0, vL) * uStrength * (0.7 + 0.3 * uPulse);`);
  };
  return material;
}

/* ---------- camera & render ---------- */
function placeCamera(cam, rot, aspect, fit) {
  const v = THREE.MathUtils.degToRad(cam.fov / 2);
  const dist = Math.max((viewSize.y * fit / 2) / Math.tan(v), (viewSize.x * 1.3 / aspect / 2) / Math.tan(v));
  cam.aspect = aspect;
  cam.position.set(focus.x + Math.sin(rot) * dist, focus.y + viewSize.y * .08, focus.z + Math.cos(rot) * dist);
  cam.lookAt(focus);
  cam.updateProjectionMatrix();
}
function render() {
  if (!body || !renderer) return;
  const width = stage.clientWidth, height = stage.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  if (mode === 'orbit') {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    placeCamera(camera, angle, width / height, 1.16);
    renderer.render(scene, camera);
  } else {
    renderer.setScissorTest(true);
    const half = Math.floor(width / 2);
    splitCams.forEach((cam, i) => {
      const left = i ? half : 0, w = i ? width - half : half;
      placeCamera(cam, i ? Math.PI : 0, w / height, 1.12);
      renderer.setViewport(left, 0, w, height);
      renderer.setScissor(left, 0, w, height);
      renderer.render(scene, cam);
    });
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  if (!visible || !body) return;
  if (!reduced && !debug) pulse.value = 0.5 + 0.5 * Math.sin(now / 480);
  if (rig) animate(now);
  if (mode === 'orbit' && !dragging) {
    const idle = now - idleSince > 2600;
    const sway = idle && !reduced ? Math.sin(now / 2600) * 0.3 : 0;
    angle += ((targetAngle + sway) - angle) * 0.045;
  }
  render();
}
const lerpFrame = (a, b, t) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
// how far through the rep each frame is (0 = start pose, 1 = end pose), from how far the hands / feet travel
function progressOf(F) {
  const key = fr => [fr[3][0], fr[3][1], fr[7][0], fr[7][1], fr[0][0], fr[0][1], fr[1][0], fr[1][1]];
  const k0 = key(F[0]), d = F.map(fr => Math.hypot(...key(fr).map((v, i) => v - k0[i])));
  const mx = Math.max(...d, 1e-6); return d.map(v => v / mx);
}
let PROG = null, CLIP = null;
function poseAtPhase(p) {
  if (CLIP) { applyClip(rig, CLIP, p); if (TRACK.opt.lift) { rig.root.position.y += TRACK.opt.lift; rig.root.updateMatrixWorld(true); } if (TRACK.opt.hold === 'chest') holdAtChest(rig); if (props) props.update(); return; }
  const F = TRACK.frames, n = F.length, x = ((p % 1) + 1) % 1 * n, i = Math.floor(x) % n, t = x - Math.floor(x);
  PROG = PROG || progressOf(F);
  const pr = PROG[i] + (PROG[(i + 1) % n] - PROG[i]) * t;
  applyFrame(rig, lerpFrame(F[i], F[(i + 1) % n], t), TRACK.opt || {}, pr);
  if (props) props.update();
}
let paused = false;
function animate(now) { if (!paused) poseAtPhase(now / (CLIP ? CLIP.frames / CLIP.fps * 1000 * (TRACK.opt.slow || 1) : TRACK.period || 3000)); }
function setMode(next) {
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.querySelector('.hint').style.display = mode === 'orbit' ? '' : 'none';
}

/* ---------- picking ---------- */
function pick(event) {
  const rect = canvas.getBoundingClientRect();
  let x = event.clientX - rect.left, w = rect.width, cam = camera;
  if (mode === 'split') { const half = Math.floor(w / 2), i = x < half ? 0 : 1; cam = splitCams[i]; if (i) x -= half; w = i ? rect.width - half : half; }
  pointer.set((x / w) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, cam);
  const hitInfo = raycaster.intersectObject(body, false)[0];
  if (!hitInfo) return null;
  const { a, b, c } = hitInfo.face;
  // the corner deepest inside its muscle decides
  const best = [a, b, c].sort((p, q) => memberAttr.getX(q) - memberAttr.getX(p))[0];
  const id = memberAttr.getX(best) > .45 ? regionAttr.getX(best) : 0;
  return id ? REGIONS[id] : 'none';
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  // studio lighting: soft top key, cool rims from behind, gentle front fill
  scene.add(new THREE.HemisphereLight(0xe4ecf7, 0x1a2029, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-1.4, 2.8, 2.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xc9d8ff, .75); fill.position.set(2.2, 1.0, 1.8); scene.add(fill);
  for (const [x, z] of [[-2.2, -2.4], [2.2, -2.4]]) { const rim = new THREE.DirectionalLight(0xc8d8f0, 1.3); rim.position.set(x, 2.0, z); scene.add(rim); }

  const geometry = await loadBody('./body.bin?v=20261116e');
  regionAttr = geometry.getAttribute('aRegion'); memberAttr = geometry.getAttribute('aMember');
  bounds = geometry.boundingBox.getSize(new THREE.Vector3());
  viewSize.set(bounds.x, bounds.y);
  if (TRACK) {
    // animated exercise: real-world coordinates (feet on the floor at y = 0) and a skeleton
    geometry.translate(geometry.userData.center.x, geometry.userData.center.y, geometry.userData.center.z);
    const [rigJson, clip] = await Promise.all([
      fetch('./rig.json?v=20261116e').then(r => r.json()),
      TRACK.opt?.clip ? fetch(`./anim/${TRACK.opt.clip}.json?v=20261116e`).then(r => r.json()) : null]);
    rig = buildSkeleton(rigJson);
    if (clip) CLIP = clip;
    body = new THREE.SkinnedMesh(geometry, bodyMaterial());
    body.add(rig.root); body.bind(rig.skeleton);
    body.frustumCulled = false;
  } else body = new THREE.Mesh(geometry, bodyMaterial());
  scene.add(body);
  if (!debug && REGIONS.some(g => levelOf(g) > 0)) {
    for (const [push, strength, color] of [[bounds.y * .003, .5, 0x8fb4ff], [bounds.y * .008, .14, 0x4f86ff]]) {
      const halo = rig ? new THREE.SkinnedMesh(geometry, haloMaterial(push, strength, color)) : new THREE.Mesh(geometry, haloMaterial(push, strength, color));
      if (rig) { halo.bind(rig.skeleton, body.bindMatrix); halo.frustumCulled = false; }
      halo.renderOrder = 2; halo.raycast = () => {};
      scene.add(halo);
    }
  }
  if (rig) {
    // studio reflections for chrome and steel
    const pm = new THREE.PMREMGenerator(renderer), room = new THREE.Scene();
    room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 6, 12), new THREE.MeshBasicMaterial({ color: 0x1a1f27, side: THREE.BackSide })));
    for (const [x, y, z, w, h, c] of [[0, 2.9, 0, 6, .1, 0xffffff], [-5.9, 1.5, 0, .1, 2, 0xbfd3ff], [5.9, 1.5, 1, .1, 2, 0xfff1e0], [0, 1.5, -5.9, 3, 1.5, 0x8899bb]]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, .1), Math.max(h, .1), x === 0 && z !== -5.9 ? 3 : .1), new THREE.MeshBasicMaterial({ color: c }));
      panel.position.set(x, y, z); room.add(panel);
    }
    scene.environment = pm.fromScene(room, .04).texture;
    scene.environmentIntensity = .7;
    poseAtPhase(0);
    props = buildProps(TRACK.id, TRACK.equip, rig);
    scene.add(props.root);
    // frame the camera on everything that moves, across the whole rep
    const box = new THREE.Box3(), tmp = new THREE.Vector3();
    for (let i = 0; i < TRACK.frames.length; i += 3) {
      poseAtPhase(i / TRACK.frames.length);
      rig.bones.forEach(b => box.expandByPoint(b.getWorldPosition(tmp)));
    }
    box.expandByPoint(tmp.set(box.min.x, 0, box.min.z));
    box.min.y = 0; box.max.y += .14; box.min.x -= .12; box.max.x += .12;
    // include the equipment, but not the floor mat
    props.root.children.forEach(c => { if (!c.userData.isFloor) { const pb = new THREE.Box3().setFromObject(c); if (!pb.isEmpty()) box.union(pb); } });
    box.getCenter(focus); const size = box.getSize(tmp);
    viewSize.set(Math.max(size.x, size.z) * .9, size.y * 1.1);
    poseAtPhase(0);
  }

  // gym mat + soft contact shadow
  const floorY = rig ? 0 : -bounds.y / 2;
  const mat = new THREE.Mesh(rig ? new THREE.CylinderGeometry(1.6, 1.6, .01, 64) : new THREE.BoxGeometry(bounds.x * 1.9, bounds.y * .008, bounds.x * 1.05),
    new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: .92 }));
  mat.position.y = floorY - bounds.y * .004;
  if (rig) mat.position.set(focus.x, -.006, focus.z);
  scene.add(mat);
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d'), grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,.6)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(bounds.x * 1.25, bounds.x * .65),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = floorY + bounds.y * .0015;
  if (rig) { shadow.position.x = focus.x; shadow.position.z = focus.z; shadow.scale.set(2.2, 2.2, 1); }
  scene.add(shadow);

  const firstAsked = askedPrimary.find(g => GROUP_NAMES[g] || NAMES[g]);
  const firstPrimary = [...primary].find(g => NAMES[g]);
  targetAngle = angle = fixedView ?? (rig ? (TRACK.opt?.view ?? .7) : firstPrimary ? FACING[firstPrimary] ?? 0 : 0);
  buildChips();
  setLabel(firstAsked ? GROUP_NAMES[firstAsked] || NAMES[firstAsked] : '', firstAsked ? modeWord : '');
  status.hidden = true;
  idleSince = performance.now();
  render();
  requestAnimationFrame(loop);
  new ResizeObserver(render).observe(stage);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(stage);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  canvas.addEventListener('pointerdown', e => { dragging = { x: e.clientX, a: angle, moved: 0 }; try { canvas.setPointerCapture(e.pointerId); } catch {} });
  canvas.addEventListener('pointermove', e => {
    if (dragging && mode === 'orbit') {
      const dx = e.clientX - dragging.x; dragging.moved = Math.max(dragging.moved, Math.abs(dx));
      if (dragging.moved > 4) { angle = dragging.a + dx * .012; targetAngle = angle; idleSince = performance.now() + 4000; }
    } else if (!dragging && e.pointerType === 'mouse') { const g = pick(e); canvas.style.cursor = g && g !== 'none' ? 'pointer' : 'grab'; }
  });
  const release = e => {
    if (!dragging) return;
    const tap = dragging.moved <= 4; dragging = null;
    if (!tap) return;
    const group = pick(e); if (!group) return;
    if (group === 'none') { setLabel('Supporting area', 'Not targeted'); return; }
    setLabel(NAMES[group], primary.has(group) ? modeWord : secondary.has(group) ? 'Also involved' : 'Not targeted');
    const appGroup = Object.keys(GROUPS).find(k => k !== 'core' && k !== 'obliques' && GROUPS[k].includes(group)) || (group === 'serratus' ? 'obliques' : group);
    if (interactive) parent.postMessage({ type: 'rebuild:select-muscle', group: appGroup, muscle: group }, location.origin);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => { dragging = null; });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); failure(new Error('WebGL context lost')); });
} catch (error) {
  failure(error);
}
