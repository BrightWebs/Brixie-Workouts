import * as THREE from 'three';
import { gripPoint, boneDir } from './motion.js';

/* Gym equipment, built to scale for the mannequin (it is 1.157 units tall, so 1 real metre ≈ 0.65 units). */
const S = 1.157 / 1.78;
const m = v => v * S;

/* ---------- materials ---------- */
function knurlTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#8a8f96'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#5c6168'; g.lineWidth = 1.2;
  for (let i = -64; i < 128; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function upholsteryTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#7f7f7f'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) { const v = 110 + Math.random() * 40 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  return t;
}
let M;
function mats() {
  if (M) return M;
  const grain = upholsteryTexture();
  M = {
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: .18 }),
    knurl: new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 1, roughness: .38, map: knurlTexture(), bumpMap: knurlTexture(), bumpScale: 1.2 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0, roughness: .78 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: .55, roughness: .38 }),
    frameLight: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: .7, roughness: .3 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x7a3df0, metalness: .4, roughness: .35 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0, roughness: .62, bumpMap: grain, bumpScale: .4 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: .6, roughness: .42 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: .2, roughness: .5 }),
    mat: new THREE.MeshStandardMaterial({ color: 0x1a1e25, metalness: 0, roughness: .95 }),
    label: new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: .2, roughness: .5 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0, roughness: .9 })
  };
  return M;
}

/* ---------- geometry helpers ---------- */
function roundedBox(w, h, d, r = Math.min(w, h, d) * .25) {
  const shape = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
  shape.moveTo(x, y - r); shape.lineTo(x + ww, y - r); shape.quadraticCurveTo(x + ww + r, y - r, x + ww + r, y);
  shape.lineTo(x + ww + r, y + hh); shape.quadraticCurveTo(x + ww + r, y + hh + r, x + ww, y + hh + r);
  shape.lineTo(x, y + hh + r); shape.quadraticCurveTo(x - r, y + hh + r, x - r, y + hh); shape.lineTo(x - r, y);
  shape.quadraticCurveTo(x - r, y - r, x, y - r);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * .9, bevelSegments: 4, curveSegments: 6 });
  g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals();
  return g;
}
function mesh(g, mat, cast = true) { const o = new THREE.Mesh(g, mat); o.castShadow = cast; return o; }
// a tube (round steel) from a to b
function tube(a, b, r, mat) {
  const len = a.distanceTo(b), o = mesh(new THREE.CylinderGeometry(r, r, len, 16), mat);
  o.position.copy(a).add(b).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}
// rectangular steel (box section) from a to b
function beam(a, b, w, mat, up = new THREE.Vector3(0, 0, 1)) {
  const len = a.distanceTo(b), o = mesh(roundedBox(w, len, w, w * .12), mat);
  o.position.copy(a).add(b).multiplyScalar(.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- free weights ---------- */
export function dumbbell(lb = 20) {
  const k = mats(), g = new THREE.Group();
  const headR = m(.055 + lb * .0012), headW = m(.05 + lb * .0016), handleL = m(.135);
  const handle = mesh(new THREE.CylinderGeometry(m(.0165), m(.0165), handleL, 20), k.knurl); handle.rotation.z = Math.PI / 2; g.add(handle);
  for (const s of [-1, 1]) {
    const collar = mesh(new THREE.CylinderGeometry(m(.024), m(.024), m(.012), 24), k.chrome); collar.rotation.z = Math.PI / 2;
    collar.position.x = s * (handleL / 2 + m(.006)); g.add(collar);
    const head = mesh(new THREE.CylinderGeometry(headR, headR, headW, 6), k.rubber); head.rotation.z = Math.PI / 2; head.rotation.x = Math.PI / 6;
    head.position.x = s * (handleL / 2 + m(.012) + headW / 2); g.add(head);
    const cap = mesh(new THREE.CylinderGeometry(headR * .42, headR * .42, m(.004), 24), k.chrome); cap.rotation.z = Math.PI / 2;
    cap.position.x = s * (handleL / 2 + m(.012) + headW + m(.002)); g.add(cap);
  }
  return g;
}
export function floorMat(len = 1.25, wid = .52) {
  const o = mesh(roundedBox(m(wid) / S * S, .012, len, .005), mats().mat, false);
  o.position.y = .006; o.receiveShadow = true; o.userData.isFloor = true; return o;
}

/* ---------- machine kit ---------- */
function weightStack(height = .62, plates = 12) {
  const k = mats(), g = new THREE.Group(), w = m(.30), d = m(.14), ph = m(.032);
  for (const x of [-1, 1]) g.add(tube(v3(x * m(.11), 0, 0), v3(x * m(.11), height, 0), m(.012), k.chrome));
  const moving = new THREE.Group();
  const stack = new THREE.Group();
  for (let i = 0; i < plates; i++) {
    const p = mesh(roundedBox(w, ph * .92, d, m(.006)), k.plate); p.position.y = m(.03) + i * ph + ph / 2;
    (i >= plates - 4 ? moving : stack).add(p);
    if (i % 2 === 0) { const t = mesh(new THREE.BoxGeometry(m(.05), ph * .5, m(.002)), k.label); t.position.set(w * .3, p.position.y, d / 2 + m(.001)); (i >= plates - 4 ? moving : stack).add(t); }
  }
  const top = mesh(roundedBox(w * .9, m(.03), d * .9, m(.006)), k.chrome); top.position.y = m(.03) + plates * ph + m(.02); moving.add(top);
  const rod = tube(v3(0, m(.03) + (plates - 4) * ph, 0), v3(0, top.position.y + m(.05), 0), m(.008), k.chrome); moving.add(rod);
  const pin = tube(v3(-m(.02), m(.03) + (plates - 4) * ph + ph / 2, d / 2), v3(m(.06), m(.03) + (plates - 4) * ph + ph / 2, d / 2 + m(.03)), m(.006), k.accent); moving.add(pin);
  g.add(stack, moving);
  // shroud
  const shroudL = mesh(roundedBox(m(.012), height, d * 1.25, m(.004)), k.frame); shroudL.position.set(-w / 2 - m(.03), height / 2, 0); g.add(shroudL);
  const shroudR = shroudL.clone(); shroudR.position.x *= -1; g.add(shroudR);
  g.userData.moving = moving; g.userData.top = top;
  return g;
}
function pulley(r = m(.045)) {
  const k = mats(), g = new THREE.Group();
  const wheel = mesh(new THREE.CylinderGeometry(r, r, m(.02), 24), k.frameLight); wheel.rotation.x = Math.PI / 2; g.add(wheel);
  const hub = mesh(new THREE.CylinderGeometry(r * .3, r * .3, m(.03), 16), k.chrome); hub.rotation.x = Math.PI / 2; g.add(hub);
  return g;
}
function cableLine() {
  const geo = new THREE.BufferGeometry().setFromPoints([v3(0, 0, 0), v3(0, 1, 0)]);
  const o = mesh(new THREE.CylinderGeometry(m(.004), m(.004), 1, 6), mats().cable, false);
  o.userData.set = (a, b) => { o.position.copy(a).add(b).multiplyScalar(.5); o.scale.y = Math.max(1e-3, a.distanceTo(b)); o.quaternion.setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize()); };
  return o;
}
function handleGrip(len = m(.13)) {
  const k = mats(), g = new THREE.Group();
  const grip = mesh(new THREE.CylinderGeometry(m(.018), m(.018), len, 16), k.rubber); grip.rotation.z = Math.PI / 2; g.add(grip);
  return g;
}
function pad(w, h, d) { return mesh(roundedBox(w, h, d, Math.min(w, h, d) * .35), mats().pad); }


/* ---------- body landmarks for placing equipment ---------- */
function marks(rig) {
  const W = n => rig.byName[n].getWorldPosition(v3());
  const pelvis = W('pelvis'), torso = boneDir(rig, 'spine');
  const back = v3(0, 0, -1).applyQuaternion(rig.root.quaternion).normalize();   // direction out of the body's back
  const hipC = W('thighR').add(W('thighL')).multiplyScalar(.5);
  const shC = W('upperarmR').add(W('upperarmL')).multiplyScalar(.5);
  return { pelvis, torso, back, hipC, shC, kneeR: W('shinR'), kneeL: W('shinL'), ankR: W('footR'), ankL: W('footL') };
}
const SEAT_DROP = .075;   // hip joint to the top of a seat cushion under the glutes

function stackTower(root, at, height = m(1.25), facing = 0) {
  const k = mats(), g = new THREE.Group(); g.position.copy(at); g.rotation.y = facing; root.add(g);
  const st = weightStack(height * .62); g.add(st);
  for (const x of [-1, 1]) g.add(beam(v3(x * m(.21), 0, -m(.1)), v3(x * m(.21), height, -m(.1)), m(.075), k.frame));
  g.add(beam(v3(-m(.25), height, -m(.1)), v3(m(.25), height, -m(.1)), m(.075), k.frame));
  const base = mesh(roundedBox(m(.56), m(.035), m(.4), m(.01)), k.frame); base.position.y = m(.017); g.add(base);
  const shield = mesh(roundedBox(m(.5), height * .66, m(.01), m(.004)), new THREE.MeshPhysicalMaterial({ color: 0x9fb1c8, metalness: 0, roughness: .05, transmission: 0, transparent: true, opacity: .14 }));
  shield.position.set(0, height * .35, m(.12)); g.add(shield);
  const p = pulley(); p.position.set(0, height - m(.05), m(.03)); g.add(p);
  g.updateMatrixWorld(true);
  return {
    group: g, pulleyWorld: () => p.getWorldPosition(v3()),
    stackTop: () => st.userData.top.getWorldPosition(v3()),
    lift: t => { st.userData.moving.position.y = t; }
  };
}
function cableRun(root, pts) { const segs = []; for (let i = 0; i < pts.length - 1; i++) { const c = cableLine(); root.add(c); segs.push(c); } return list => list.forEach((p, i) => i < segs.length && segs[i].userData.set(p, list[i + 1])); }
function seatPad(root, mk, { w = m(.42), depth = m(.40), dz = m(.06) } = {}) {
  const k = mats(), top = mk.hipC.y - SEAT_DROP;
  const seat = pad(w, m(.085), depth); seat.position.set(0, top - m(.042), mk.hipC.z + dz); root.add(seat);
  root.add(beam(v3(0, .02, mk.hipC.z + dz), v3(0, top - m(.08), mk.hipC.z + dz), m(.08), k.frame));
  const foot = mesh(roundedBox(m(.5), m(.035), m(.12), m(.01)), k.frame); foot.position.set(0, m(.017), mk.hipC.z + dz); root.add(foot);
  return top;
}
function backPad(root, mk, { h = m(.66), w = m(.40), gap = m(.135) } = {}) {
  const k = mats(), p = pad(w, h, m(.085));
  const c = mk.hipC.clone().addScaledVector(mk.torso, h / 2 + m(.05)).addScaledVector(mk.back, gap);
  p.position.copy(c); p.quaternion.setFromUnitVectors(v3(0, 1, 0), mk.torso); root.add(p);
  const post = c.clone().addScaledVector(mk.back, m(.07));
  root.add(beam(v3(0, .02, post.z), post, m(.07), k.frame));
  return p;
}

/* ---------- per-exercise equipment ---------- */
export function buildProps(id, equip, rig) {
  const k = mats(), root = new THREE.Group(), updates = [];
  const grip = s => gripPoint(rig, s), mk = marks(rig);
  const midGrip = () => grip('R').add(grip('L')).multiplyScalar(.5);
  const W = n => rig.byName[n].getWorldPosition(v3());
  const text = (equip || '').toLowerCase();
  const later = f => updates.push(f);

  const dumbbells = (pair, lb) => {
    if (pair) for (const s of ['R', 'L']) {
      const d = dumbbell(lb); root.add(d);
      later(() => { d.position.copy(grip(s)); const fa = boneDir(rig, 'forearm' + s);
        const side = v3(1, 0, 0).applyQuaternion(rig.root.quaternion);
        d.quaternion.setFromUnitVectors(v3(1, 0, 0), side.sub(fa.clone().multiplyScalar(side.dot(fa))).normalize()); });
    } else {
      const d = dumbbell(lb); root.add(d);
      later(() => { d.position.copy(midGrip()).addScaledVector(boneDir(rig, 'chest'), -m(.07));
        d.quaternion.setFromUnitVectors(v3(1, 0, 0), boneDir(rig, 'spine')); });
    }
  };
  // a weight stack that rises as `moving()` travels away from where it started
  const stackFollow = (tower, moving, ratio = .7, maxLift = m(.32)) => {
    let rest = null;
    later(() => { const p = moving(); if (!rest) rest = p.clone(); tower.lift(Math.min(maxLift, p.distanceTo(rest) * ratio)); });
  };
  const handle = (len = m(.13)) => { const h = handleGrip(len); root.add(h); return h; };

  if (/floor|mat/.test(text) || ['plank', 'dbug', 'bridge', 'catcow', 'inch', 'pushup', 'hipf'].includes(id)) root.add(floorMat(1.3, .62));

  switch (id) {
    case 'goblet': dumbbells(false, 25); break;
    case 'curl': dumbbells(true, 15); break;
    case 'rdl': dumbbells(true, 25); break;
    case 'barrdl': case 'kbsquat': case 'medsquat': dumbbells(id !== 'barrdl', 20); break;
    case 'spress': { dumbbells(true, 15); seatPad(root, mk); backPad(root, mk, { h: m(.82) }); break; }

    case 'chest': {
      seatPad(root, mk); backPad(root, mk, { h: m(.72) });
      const tower = stackTower(root, v3(m(.62), 0, mk.hipC.z - m(.45)), m(1.35), -Math.PI / 2 + .3);
      const pivotY = mk.shC.y - m(.12), pivotZ = mk.shC.z - m(.22);
      for (const s of ['R', 'L']) {
        const sx = s === 'R' ? 1 : -1, h = handle(m(.15)), lever = beam(v3(), v3(0, 1, 0), m(.055), k.frameLight); root.add(lever);
        const hub = mesh(new THREE.CylinderGeometry(m(.05), m(.05), m(.08), 20), k.frame); hub.rotation.z = Math.PI / 2; hub.position.set(sx * m(.44), pivotY, pivotZ); root.add(hub);
        later(() => { const g = grip(s); h.position.copy(g); h.rotation.set(Math.PI / 2, 0, 0);
          const top = v3(sx * m(.44), pivotY, pivotZ), elbowPt = v3(g.x + sx * m(.07), g.y, g.z);
          lever.position.copy(top).add(elbowPt).multiplyScalar(.5); lever.scale.set(1, top.distanceTo(elbowPt), 1);
          lever.quaternion.setFromUnitVectors(v3(0, 1, 0), elbowPt.clone().sub(top).normalize()); });
      }
      const run = cableRun(root, [0, 0, 0]);
      later(() => run([tower.stackTop(), tower.pulleyWorld(), v3(0, pivotY, pivotZ)]));
      stackFollow(tower, () => grip('R'), .55);
      for (const x of [-1, 1]) root.add(beam(v3(x * m(.5), .02, pivotZ - m(.05)), v3(x * m(.5), pivotY + m(.05), pivotZ), m(.07), k.frame));
      root.add(beam(v3(-m(.5), pivotY + m(.05), pivotZ), v3(m(.5), pivotY + m(.05), pivotZ), m(.06), k.frame));
      break;
    }
    case 'pecdeck': {
      seatPad(root, mk); backPad(root, mk, { h: m(.78) });
      const tower = stackTower(root, v3(0, 0, mk.hipC.z - m(.62)), m(1.6));
      const pivotY = mk.shC.y + m(.18), pivotZ = mk.shC.z - m(.02);
      for (const s of ['R', 'L']) {
        const sx = s === 'R' ? 1 : -1, armPad = pad(m(.07), m(.36), m(.07)), boom = beam(v3(), v3(0, 1, 0), m(.05), k.frameLight); root.add(armPad, boom);
        const h = handle(m(.12));
        later(() => { const g = grip(s); h.position.copy(g); h.rotation.set(0, 0, 0);
          const top = v3(sx * m(.16), pivotY, pivotZ), out = v3(g.x, pivotY, g.z);
          boom.position.copy(top).add(out).multiplyScalar(.5); boom.scale.set(1, top.distanceTo(out), 1);
          boom.quaternion.setFromUnitVectors(v3(0, 1, 0), out.clone().sub(top).normalize());
          armPad.position.copy(out).add(g).multiplyScalar(.5); });
      }
      root.add(beam(v3(-m(.2), pivotY + m(.05), pivotZ), v3(m(.2), pivotY + m(.05), pivotZ), m(.07), k.frame));
      root.add(beam(v3(0, pivotY + m(.05), pivotZ), v3(0, pivotY + m(.05), mk.hipC.z - m(.62) - m(.1)), m(.07), k.frame));
      stackFollow(tower, () => grip('R'), .45);
      break;
    }
    case 'lat': case 'assist': {
      const top = seatPad(root, mk, { depth: m(.36) });
      if (id === 'lat') { // knee hold-down pads
        for (const s of [-1, 1]) { const r = mesh(new THREE.CylinderGeometry(m(.05), m(.05), m(.2), 20), k.pad); r.rotation.z = Math.PI / 2;
          r.position.set(s * m(.11), mk.kneeR.y + m(.09), mk.kneeR.z - m(.07)); root.add(r); }
        root.add(beam(v3(0, top, mk.kneeR.z - m(.07)), v3(0, mk.kneeR.y + m(.09), mk.kneeR.z - m(.07)), m(.05), k.frame));
      }
      const bar = new THREE.Group();
      bar.add(tube(v3(-m(.5), 0, 0), v3(m(.5), 0, 0), m(.014), k.chrome));
      for (const s of [-1, 1]) { const gr = mesh(new THREE.CylinderGeometry(m(.021), m(.021), m(.15), 16), k.rubber); gr.rotation.z = Math.PI / 2; gr.position.x = s * m(.42); bar.add(gr);
        bar.add(tube(v3(s * m(.5), 0, 0), v3(s * m(.6), -m(.08), 0), m(.014), k.chrome)); }
      root.add(bar);
      const tower = stackTower(root, v3(0, 0, mk.hipC.z - m(.42)), m(2.2));
      const run = cableRun(root, [0, 0, 0]);
      later(() => { bar.position.copy(midGrip()); run([tower.stackTop(), tower.pulleyWorld(), bar.position]); });
      stackFollow(tower, () => bar.position, .6);
      // overhead boom
      root.add(beam(v3(0, m(2.2) - m(.03), mk.hipC.z - m(.52)), v3(0, m(2.2) - m(.03), mk.hipC.z + m(.12)), m(.075), k.frame));
      break;
    }
    case 'crow': case 'supportedrow': {
      const top = mk.hipC.y - SEAT_DROP;
      const bench = pad(m(.32), m(.07), m(.95)); bench.position.set(0, top - m(.035), mk.hipC.z - m(.05)); root.add(bench);
      const rail = beam(v3(0, m(.03), mk.hipC.z - m(.5)), v3(0, m(.03), mk.ankR.z + m(.75)), m(.09), k.frame); root.add(rail);
      for (const z of [mk.hipC.z - m(.35), mk.hipC.z + m(.25)]) root.add(beam(v3(0, .02, z), v3(0, top - m(.07), z), m(.06), k.frame));
      const plat = pad(m(.48), m(.32), m(.05)); plat.position.set(0, m(.16), mk.ankR.z + m(.09)); plat.rotation.x = -.35; root.add(plat);
      const tower = stackTower(root, v3(0, 0, mk.ankR.z + m(.5)), m(1.35), Math.PI);
      const vh = new THREE.Group(); vh.add(tube(v3(-m(.06), 0, 0), v3(m(.06), 0, 0), m(.02), k.rubber));
      vh.add(tube(v3(-m(.06), 0, 0), v3(0, 0, m(.1)), m(.012), k.chrome)); vh.add(tube(v3(m(.06), 0, 0), v3(0, 0, m(.1)), m(.012), k.chrome)); root.add(vh);
      const low = pulley(); low.position.set(0, mk.hipC.y + m(.02), mk.ankR.z + m(.32)); root.add(low);
      root.add(beam(v3(0, .02, mk.ankR.z + m(.32)), v3(0, mk.hipC.y + m(.02), mk.ankR.z + m(.32)), m(.06), k.frame));
      const run = cableRun(root, [0, 0, 0, 0]);
      later(() => { vh.position.copy(midGrip()); run([tower.stackTop(), tower.pulleyWorld(), low.position, vh.position.clone().add(v3(0, 0, m(.1)))]); });
      stackFollow(tower, () => vh.position, .6);
      break;
    }
    case 'legext': case 'legcurl': {
      seatPad(root, mk, { depth: m(.42), dz: m(.0) }); backPad(root, mk, { h: m(.62) });
      const tower = stackTower(root, v3(-m(.62), 0, mk.hipC.z - m(.2)), m(1.25), Math.PI / 2 - .2);
      const roller = mesh(new THREE.CylinderGeometry(m(.055), m(.055), m(.36), 24), k.pad); roller.rotation.z = Math.PI / 2; root.add(roller);
      const arm = beam(v3(), v3(0, 1, 0), m(.05), k.frameLight); root.add(arm);
      const cam = mesh(new THREE.CylinderGeometry(m(.08), m(.08), m(.04), 32), k.frame); cam.rotation.z = Math.PI / 2; root.add(cam);
      if (id === 'legcurl') { const tp = mesh(new THREE.CylinderGeometry(m(.05), m(.05), m(.36), 20), k.pad); tp.rotation.z = Math.PI / 2; tp.position.copy(mk.kneeR).add(mk.kneeL).multiplyScalar(.5).add(v3(0, m(.1), -m(.1))); tp.position.x = 0; root.add(tp); }
      const run = cableRun(root, [0, 0, 0]);
      later(() => { const a = W('footR'), b = W('footL'), c = a.add(b).multiplyScalar(.5);
        roller.position.copy(c).add(v3(0, id === 'legext' ? m(.05) : -m(.02), id === 'legext' ? m(.07) : -m(.06))); roller.position.x = 0;
        const knee = W('shinR'), piv = v3(-m(.24), knee.y, knee.z), end = v3(-m(.24), roller.position.y, roller.position.z);
        cam.position.copy(piv);
        arm.position.copy(piv).add(end).multiplyScalar(.5); arm.scale.set(1, piv.distanceTo(end), 1);
        arm.quaternion.setFromUnitVectors(v3(0, 1, 0), end.clone().sub(piv).normalize());
        run([tower.stackTop(), tower.pulleyWorld(), piv.clone().add(v3(-m(.04), 0, 0))]); });
      root.add(beam(v3(-m(.24), .02, mk.kneeR.z), v3(-m(.24), mk.kneeR.y, mk.kneeR.z), m(.07), k.frame));
      stackFollow(tower, () => roller.position, .6);
      break;
    }
    case 'lpress': {
      const top = mk.hipC.y - SEAT_DROP;
      const seat = pad(m(.44), m(.085), m(.42)); seat.position.set(0, top - m(.042), mk.hipC.z + m(.03)); root.add(seat);
      backPad(root, mk, { h: m(.8) });
      root.add(beam(v3(0, .02, mk.hipC.z), v3(0, top - m(.08), mk.hipC.z), m(.09), k.frame));
      // 45-degree sled on rails, driven by the feet
      const dir = v3(0, Math.sin(.68), Math.cos(.68));
      const sled = new THREE.Group(); root.add(sled);
      const plate = mesh(roundedBox(m(.62), m(.55), m(.04), m(.03)), k.frameLight); sled.add(plate);
      const grip2 = mesh(roundedBox(m(.6), m(.5), m(.012), m(.02)), k.rubber); grip2.position.z = -m(.026); sled.add(grip2);
      for (const s of [-1, 1]) { const horn = tube(v3(s * m(.38), -m(.1), m(.05)), v3(s * m(.62), -m(.1), m(.05)), m(.025), k.chrome); sled.add(horn);
        const pl = mesh(new THREE.CylinderGeometry(m(.22), m(.22), m(.04), 40), k.plate); pl.rotation.z = Math.PI / 2; pl.position.set(s * m(.5), -m(.1), m(.05)); sled.add(pl); }
      const railStart = v3(0, m(.25), mk.hipC.z + m(.25)), railEnd = railStart.clone().addScaledVector(dir, m(1.55));
      for (const s of [-1, 1]) root.add(tube(railStart.clone().add(v3(s * m(.36), 0, 0)), railEnd.clone().add(v3(s * m(.36), 0, 0)), m(.025), k.chrome));
      for (const s of [-1, 1]) root.add(beam(v3(s * m(.36), .02, railEnd.z), railEnd.clone().add(v3(s * m(.36), 0, 0)), m(.08), k.frame));
      root.add(beam(v3(0, m(.03), mk.hipC.z - m(.3)), v3(0, m(.03), railEnd.z + m(.1)), m(.1), k.frame));
      later(() => { const c = W('footR').add(W('footL')).multiplyScalar(.5).addScaledVector(dir, m(.05));
        sled.position.copy(c); sled.position.x = 0; sled.quaternion.setFromUnitVectors(v3(0, 0, -1), dir.clone().negate()); });
      break;
    }
    case 'hipabd': case 'hipadd': {
      seatPad(root, mk); backPad(root, mk, { h: m(.7) });
      const tower = stackTower(root, v3(0, 0, mk.hipC.z - m(.55)), m(1.25));
      for (const s of ['R', 'L']) {
        const kp = pad(m(.06), m(.22), m(.2)); root.add(kp);
        const arm = beam(v3(), v3(0, 1, 0), m(.045), k.frameLight); root.add(arm);
        later(() => { const kn = W('shin' + s), side = s === 'R' ? 1 : -1;
          kp.position.copy(kn).add(v3(side * (id === 'hipabd' ? m(.07) : -m(.07)), -m(.03), -m(.02)));
          const piv = v3(0, mk.hipC.y - m(.18), kn.z - m(.02));
          arm.position.copy(piv).add(kp.position).multiplyScalar(.5); arm.scale.set(1, piv.distanceTo(kp.position), 1);
          arm.quaternion.setFromUnitVectors(v3(0, 1, 0), kp.position.clone().sub(piv).normalize()); });
      }
      stackFollow(tower, () => W('shinR'), .8);
      break;
    }
    case 'abcrunch': {
      seatPad(root, mk); backPad(root, mk, { h: m(.62) });
      const tower = stackTower(root, v3(m(.6), 0, mk.hipC.z - m(.2)), m(1.25), -Math.PI / 2);
      for (const s of ['R', 'L']) { const h = handle(m(.1)); later(() => { h.position.copy(grip(s)); }); }
      const yoke = beam(v3(), v3(0, 1, 0), m(.05), k.frameLight); root.add(yoke);
      later(() => { const a = grip('R'), b = grip('L'); yoke.position.copy(a).add(b).multiplyScalar(.5); yoke.scale.set(1, a.distanceTo(b), 1); yoke.quaternion.setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize()); });
      stackFollow(tower, () => grip('R'), .7);
      break;
    }
    case 'backext': {
      const hipPad = pad(m(.4), m(.09), m(.22)); hipPad.position.copy(mk.hipC).add(v3(0, -m(.13), m(.11))); hipPad.rotation.x = .8; root.add(hipPad);
      const ank = mesh(new THREE.CylinderGeometry(m(.05), m(.05), m(.3), 20), k.pad); ank.rotation.z = Math.PI / 2; ank.position.copy(mk.ankR).add(v3(0, m(.06), -m(.06))); ank.position.x = 0; root.add(ank);
      const plat = mesh(roundedBox(m(.42), m(.03), m(.3), m(.01)), k.rubber); plat.position.set(0, m(.02), mk.ankR.z + m(.05)); root.add(plat);
      root.add(beam(v3(0, m(.03), mk.ankR.z), hipPad.position.clone().add(v3(0, -m(.1), -m(.05))), m(.09), k.frame));
      root.add(beam(v3(0, m(.03), mk.ankR.z), v3(0, m(.03), hipPad.position.z - m(.5)), m(.09), k.frame));
      root.add(beam(v3(0, m(.03), hipPad.position.z - m(.4)), hipPad.position.clone().add(v3(0, -m(.08), -m(.08))), m(.07), k.frame));
      break;
    }
    case 'hipthrust': case 'bridge': {
      if (id === 'hipthrust') {
        const bench = pad(m(1.15), m(.42), m(.38)); bench.position.set(0, m(.21), mk.shC.z - m(.12)); root.add(bench);
        const bar = new THREE.Group(); bar.add(tube(v3(-m(.75), 0, 0), v3(m(.75), 0, 0), m(.014), k.knurl));
        const sleeve = s => tube(v3(s * m(.75), 0, 0), v3(s * m(1.05), 0, 0), m(.025), k.chrome); bar.add(sleeve(-1), sleeve(1));
        for (const s of [-1, 1]) { const pl = mesh(new THREE.CylinderGeometry(m(.225), m(.225), m(.05), 48), k.rubber); pl.rotation.z = Math.PI / 2; pl.position.x = s * m(.82); bar.add(pl); }
        const padBar = mesh(new THREE.CylinderGeometry(m(.05), m(.05), m(.4), 20), k.pad); padBar.rotation.z = Math.PI / 2; bar.add(padBar); root.add(bar);
        later(() => { bar.position.copy(mk.hipC); const h = W('thighR').add(W('thighL')).multiplyScalar(.5); bar.position.copy(h).add(v3(0, m(.11), 0)); });
      }
      break;
    }
    case 'calfraise': {
      const step = mesh(roundedBox(m(.5), m(.08), m(.2), m(.01)), k.rubber); step.position.set(0, m(.04), mk.ankR.z + m(.05)); root.add(step);
      const tower = stackTower(root, v3(0, 0, mk.ankR.z - m(.5)), m(1.9));
      for (const s of [-1, 1]) { const sp = pad(m(.12), m(.08), m(.2)); root.add(sp); later(() => sp.position.copy(W(s > 0 ? 'clavR' : 'clavL')).add(v3(s * m(.06), m(.06), 0))); }
      const yoke = beam(v3(), v3(0, 1, 0), m(.06), k.frame); root.add(yoke);
      later(() => { const a = W('clavR').add(v3(m(.06), m(.08), -m(.15))), b = W('clavL').add(v3(-m(.06), m(.08), -m(.15)));
        const mid = a.clone().add(b).multiplyScalar(.5), back = v3(0, mid.y, mk.ankR.z - m(.42));
        yoke.position.copy(mid).add(back).multiplyScalar(.5); yoke.scale.set(1, mid.distanceTo(back), 1); yoke.quaternion.setFromUnitVectors(v3(0, 1, 0), back.clone().sub(mid).normalize()); });
      stackFollow(tower, () => W('pelvis'), 1.5);
      break;
    }
    case 'tri': case 'chop': case 'cablefly': {
      const towers = id === 'cablefly'
        ? [stackTower(root, v3(m(.95), 0, mk.hipC.z - m(.2)), m(2.1), -Math.PI / 2), stackTower(root, v3(-m(.95), 0, mk.hipC.z - m(.2)), m(2.1), Math.PI / 2)]
        : [stackTower(root, id === 'tri' ? v3(0, 0, mk.ankR.z + m(.42)) : v3(m(.75), 0, mk.ankR.z), m(2.1), id === 'tri' ? Math.PI : -Math.PI / 2)];
      root.add(beam(v3(-m(.95), m(2.1), mk.hipC.z - m(.3)), v3(m(.95), m(2.1), mk.hipC.z - m(.3)), m(.075), k.frame));
      if (id === 'tri') {
        const rope = new THREE.Group(); for (const s of [-1, 1]) { rope.add(tube(v3(0, 0, 0), v3(s * m(.08), -m(.3), 0), m(.012), k.cable));
          const knot = mesh(new THREE.SphereGeometry(m(.025), 12, 10), k.rubber); knot.position.set(s * m(.08), -m(.3), 0); rope.add(knot); }
        root.add(rope);
        const run = cableRun(root, [0, 0, 0]);
        later(() => { const g = midGrip(); rope.position.copy(g).add(v3(0, m(.3), 0)); run([towers[0].stackTop(), towers[0].pulleyWorld(), rope.position]); });
        stackFollow(towers[0], midGrip, .6);
      } else if (id === 'chop') {
        const h = handle(m(.13)); const run = cableRun(root, [0, 0, 0]);
        later(() => { h.position.copy(midGrip()); run([towers[0].stackTop(), towers[0].pulleyWorld(), h.position]); });
        stackFollow(towers[0], midGrip, .4);
      } else {
        towers.forEach((t, i) => { const s = i ? 'L' : 'R'; const h = handle(m(.12)); const run = cableRun(root, [0, 0, 0]);
          later(() => { h.position.copy(grip(s)); h.rotation.set(Math.PI / 2, 0, 0); run([t.stackTop(), t.pulleyWorld(), h.position]); });
          stackFollow(t, () => grip(s), .4); });
      }
      break;
    }
    case 'smith': {
      const bar = new THREE.Group(); bar.add(tube(v3(-m(.85), 0, 0), v3(m(.85), 0, 0), m(.015), k.knurl));
      for (const s of [-1, 1]) { const sl = tube(v3(s * m(.85), 0, 0), v3(s * m(1.05), 0, 0), m(.026), k.chrome); bar.add(sl);
        const pl = mesh(new THREE.CylinderGeometry(m(.17), m(.17), m(.04), 40), k.rubber); pl.rotation.z = Math.PI / 2; pl.position.x = s * m(.92); bar.add(pl); }
      root.add(bar);
      const z = mk.shC.z - m(.04);
      for (const s of [-1, 1]) { root.add(beam(v3(s * m(.78), .02, z), v3(s * m(.78), m(2.2), z), m(.08), k.frame));
        root.add(tube(v3(s * m(.7), .02, z), v3(s * m(.7), m(2.15), z), m(.018), k.chrome)); }
      root.add(beam(v3(-m(.8), m(2.2), z), v3(m(.8), m(2.2), z), m(.08), k.frame));
      later(() => { bar.position.set(0, W('clavR').y + m(.05), W('clavR').z - m(.07)); });
      break;
    }
    case 'tread': case 'finwalk': {
      const deck = new THREE.Group(); root.add(deck);
      const z0 = mk.ankR.z;
      const body = mesh(roundedBox(m(.78), m(.14), m(1.85), m(.04)), k.frame); body.position.set(0, m(.1), z0 - m(.15)); deck.add(body);
      const belt = mesh(roundedBox(m(.56), m(.02), m(1.6), m(.008)), k.belt); belt.position.set(0, m(.18), z0 - m(.15)); deck.add(belt);
      for (const s of [-1, 1]) { const rail = beam(v3(s * m(.35), m(.17), z0 + m(.75)), v3(s * m(.35), m(1.2), z0 + m(.62)), m(.07), k.frame); deck.add(rail);
        deck.add(beam(v3(s * m(.35), m(1.05), z0 + m(.62)), v3(s * m(.35), m(1.05), z0 + m(.15)), m(.05), k.frameLight)); }
      const con = mesh(roundedBox(m(.8), m(.28), m(.12), m(.03)), k.frame); con.position.set(0, m(1.3), z0 + m(.6)); con.rotation.x = -.35; deck.add(con);
      const screen = mesh(roundedBox(m(.5), m(.18), m(.01), m(.01)), new THREE.MeshStandardMaterial({ color: 0x0d1a2b, emissive: 0x16365e, emissiveIntensity: .8, roughness: .2 }));
      screen.position.set(0, m(1.3), z0 + m(.535)); screen.rotation.x = -.35; deck.add(screen);
      break;
    }
    case 'row': case 'finrow': {
      const rail = beam(v3(0, m(.32), mk.hipC.z - m(.9)), v3(0, m(.32), mk.hipC.z + m(1.4)), m(.09), k.frameLight); root.add(rail);
      for (const z of [mk.hipC.z - m(.9), mk.hipC.z + m(1.4)]) { const leg = beam(v3(0, .02, z), v3(0, m(.32), z), m(.08), k.frame); root.add(leg);
        const ft = mesh(roundedBox(m(.5), m(.03), m(.08), m(.01)), k.frame); ft.position.set(0, m(.015), z); root.add(ft); }
      const seat = pad(m(.3), m(.06), m(.3)); root.add(seat);
      const fly = mesh(new THREE.CylinderGeometry(m(.25), m(.25), m(.22), 40), k.frame); fly.rotation.z = Math.PI / 2; fly.position.set(0, m(.55), mk.hipC.z + m(1.45)); root.add(fly);
      const fan = mesh(new THREE.TorusGeometry(m(.25), m(.012), 8, 40), k.frameLight); fan.position.copy(fly.position); fan.rotation.y = Math.PI / 2; root.add(fan);
      // foot plates sit right under each foot (the feet are strapped in and don't move)
      for (const s of ['R', 'L']) {
        const ank = W('foot' + s), fd = boneDir(rig, 'foot' + s), up = fd.clone().applyAxisAngle(v3(1, 0, 0), -Math.PI / 2);
        const fs = new THREE.Group(), plate = mesh(roundedBox(m(.15), m(.025), m(.34), m(.01)), k.frameLight), strap = mesh(roundedBox(m(.155), m(.02), m(.06), m(.008)), k.rubber);
        plate.position.y = -m(.0125); strap.position.set(0, m(.06), m(.02)); fs.add(plate, strap);
        fs.position.copy(ank).addScaledVector(fd, m(.07)).addScaledVector(up, -m(.075));
        fs.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(1, 0, 0), up, fd)); root.add(fs);
        root.add(beam(fs.position.clone().addScaledVector(up, -m(.03)), v3(fs.position.x, m(.32), fs.position.z - m(.05)), m(.04), k.frame));
      }
      const hb = handle(m(.5)); const run = cableRun(root, [0, 0]);
      later(() => { seat.position.set(0, W('pelvis').y - m(.16), W('pelvis').z); hb.position.copy(midGrip()); run([fly.position.clone().add(v3(0, m(.05), -m(.1))), hb.position]); });
      break;
    }
    case 'bike': case 'spinbike': case 'airbike': case 'elliptical': case 'stairs': case 'seatedstep': case 'arcstride': {
      const base = beam(v3(0, m(.04), mk.hipC.z - m(.6)), v3(0, m(.04), mk.ankR.z + m(.75)), m(.12), k.frame); root.add(base);
      const fly = mesh(new THREE.CylinderGeometry(m(.24), m(.24), m(.08), 40), k.frameLight); fly.rotation.z = Math.PI / 2; fly.position.set(0, m(.33), mk.ankR.z + m(.38)); root.add(fly);
      const shroud = mesh(roundedBox(m(.14), m(.55), m(.6), m(.06)), k.frame); shroud.position.set(0, m(.4), mk.ankR.z + m(.42)); root.add(shroud);
      const seatLike = ['bike', 'spinbike', 'airbike', 'seatedstep'].includes(id);
      if (seatLike) { const top = mk.hipC.y - SEAT_DROP; const s = pad(m(.3), m(.08), m(.28)); s.position.set(0, top - m(.04), mk.hipC.z); root.add(s);
        root.add(beam(v3(0, m(.05), mk.hipC.z - m(.05)), v3(0, top - m(.08), mk.hipC.z), m(.07), k.frame));
        if (id === 'seatedstep') backPad(root, mk, { h: m(.6) }); }
      const post = beam(v3(0, m(.05), mk.ankR.z + m(.55)), v3(0, mk.shC.y - m(.05), mk.ankR.z + m(.42)), m(.07), k.frame); root.add(post);
      for (const s of ['R', 'L']) { const h = handle(m(.14)); later(() => { h.position.copy(grip(s)); h.rotation.set(0, 0, Math.PI / 2); }); }
      const hb = beam(v3(), v3(0, 1, 0), m(.04), k.frameLight); root.add(hb);
      later(() => { const a = grip('R'), b = grip('L'), mid = a.clone().add(b).multiplyScalar(.5), p = v3(0, mk.shC.y - m(.05), mk.ankR.z + m(.42));
        hb.position.copy(mid).add(p).multiplyScalar(.5); hb.scale.set(1, mid.distanceTo(p), 1); hb.quaternion.setFromUnitVectors(v3(0, 1, 0), p.clone().sub(mid).normalize()); });
      for (const s of ['R', 'L']) { const ped = mesh(roundedBox(m(.12), m(.025), m(.22), m(.008)), k.rubber); root.add(ped); const crank = beam(v3(), v3(0, 1, 0), m(.03), k.chrome); root.add(crank);
        later(() => { const a = W('foot' + s); ped.position.copy(a).add(v3(0, -m(.11), m(.04)));
          const c = fly.position.clone(); c.x = ped.position.x; crank.position.copy(c).add(ped.position).multiplyScalar(.5); crank.scale.set(1, c.distanceTo(ped.position), 1);
          crank.quaternion.setFromUnitVectors(v3(0, 1, 0), ped.position.clone().sub(c).normalize()); }); }
      break;
    }
    case 'trxrow': {
      const anchor = v3(0, m(2.3), mk.ankR.z + m(.7)); const run = [cableRun(root, [0, 0]), cableRun(root, [0, 0])];
      const plate = mesh(roundedBox(m(.2), m(.06), m(.06), m(.01)), k.frame); plate.position.copy(anchor); root.add(plate);
      for (const s of ['R', 'L']) { const h = handle(m(.12)); later(() => { h.position.copy(grip(s)); h.rotation.set(0, 0, Math.PI / 2); run[s === 'R' ? 0 : 1]([anchor, h.position]); }); }
      break;
    }
    case 'quad': case 'legs': case 'chestst': {
      const wall = new THREE.MeshStandardMaterial({ color: 0x2a313b, roughness: .85 });
      if (id === 'quad') { const w = mesh(new THREE.BoxGeometry(m(1.6), m(2.2), m(.06)), wall); w.position.set(0, m(1.1), m(.6)); root.add(w); }
      else if (id === 'legs') { const w = mesh(new THREE.BoxGeometry(m(.06), m(2.2), m(1.6)), wall); w.position.set(-m(.7), m(1.1), 0); root.add(w); }
      else { for (const z of [-m(.1), m(.06)]) { const post = mesh(new THREE.BoxGeometry(m(.1), m(2.1), m(.08)), k.frameLight); post.position.set(-m(.72), m(1.05), z); root.add(post); }
        const head = mesh(new THREE.BoxGeometry(m(.1), m(.1), m(.3)), k.frameLight); head.position.set(-m(.72), m(2.12), -m(.02)); root.add(head); }
      break;
    }
    case 'ropes': {
      const anchor = v3(0, m(.15), mk.ankR.z + m(2.2)); const post = mesh(new THREE.CylinderGeometry(m(.06), m(.06), m(.3), 20), k.frame); post.position.copy(anchor); root.add(post);
      for (const s of ['R', 'L']) { const pts = Array.from({ length: 24 }, () => v3()); const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p, i) => v3(0, 0, i))), 48, m(.02), 8);
        const rope = mesh(g, k.cable); root.add(rope);
        later(() => { const h = grip(s), t = performance.now() / 260;
          const curve = new THREE.CatmullRomCurve3(pts.map((p, i) => { const u = i / 23; const q = h.clone().lerp(anchor, u); q.y = Math.max(m(.03), q.y * (1 - u) + anchor.y * u - Math.sin(u * Math.PI) * m(.15) + Math.sin(u * 9 - t + (s === 'R' ? 0 : Math.PI)) * m(.09) * (1 - u)); return q; }));
          rope.geometry.dispose(); rope.geometry = new THREE.TubeGeometry(curve, 48, m(.02), 8); }); }
      break;
    }
  }
  return { root, update: () => updates.forEach(f => f()) };
}
