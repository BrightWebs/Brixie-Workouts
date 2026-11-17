import * as THREE from 'three';

/* The mannequin's skeleton and skin weights come from Mixamo's auto-rigger (rig.json + body.bin).
   Exercises Mixamo has as motion capture (squats, curls, push-ups, plank, walking...) play those clips.
   The others replay the library's side-view movement with two-bone IK on the same professional skeleton. */

// our limb names -> Mixamo joints (Mixamo "Left" is the character's left = +X)
const MAP = { pelvis: 'Hips', spine: 'Spine', spine1: 'Spine1', chest: 'Spine2', neck: 'Neck', head: 'Head',
  clavR: 'LeftShoulder', upperarmR: 'LeftArm', forearmR: 'LeftForeArm', handR: 'LeftHand',
  clavL: 'RightShoulder', upperarmL: 'RightArm', forearmL: 'RightForeArm', handL: 'RightHand',
  thighR: 'LeftUpLeg', shinR: 'LeftLeg', footR: 'LeftFoot', thighL: 'RightUpLeg', shinL: 'RightLeg', footL: 'RightFoot' };
// which child each bone "points" at
const AIM_CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandIndex1',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandIndex1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase' };

export function buildSkeleton(rigJson) {
  const bones = [], byJoint = {};
  rigJson.forEach(j => {
    const b = new THREE.Bone(); b.name = j.name;
    b.position.fromArray(j.t); b.quaternion.set(j.q[0], j.q[1], j.q[2], j.q[3]);
    b.userData.qRest = b.quaternion.clone(); b.userData.tRest = b.position.clone();
    if (j.parent >= 0) bones[j.parent].add(b);
    bones.push(b); byJoint[j.name] = b;
  });
  bones[0].updateMatrixWorld(true);
  for (const b of bones) {
    const c = byJoint[AIM_CHILD[b.name]];
    b.userData.dLocal = c ? c.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
    b.userData.len = c ? c.position.length() : 0;
  }
  const byName = {}; for (const k in MAP) byName[k] = byJoint[MAP[k]];
  return { skeleton: new THREE.Skeleton(bones), bones, byName, byJoint, root: bones[0] };
}

export function restPose(rig) { rig.bones.forEach(b => { b.quaternion.copy(b.userData.qRest); b.position.copy(b.userData.tRest); }); }

/* ---------- motion-capture clips ---------- */
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
export function applyClip(rig, clip, t) {
  const n = clip.frames, J = rig.bones.length, x = ((t % 1) + 1) % 1 * (n - 1), i = Math.floor(x), f = x - i, i2 = Math.min(i + 1, n - 1);
  for (let j = 0; j < J; j++) {
    qa.fromArray(clip.q, (i * J + j) * 4); qb.fromArray(clip.q, (i2 * J + j) * 4);
    rig.bones[j].quaternion.slerpQuaternions(qa, qb, f);
  }
  const h = clip.hips, L = (k) => h[i * 3 + k] + (h[i2 * 3 + k] - h[i * 3 + k]) * f;
  rig.root.position.set(clip.inPlace ? h[0] : L(0), L(1), clip.inPlace ? h[2] : L(2));
  rig.root.updateMatrixWorld(true);
}

/* ---------- IK from the side-view track ---------- */
const kL = 0.455 / 72, kA = 0.335 / 50, ANKLE_Y = 0.072, WRIST_FLOOR = 0.035;
const sag = (dx, dy) => new THREE.Vector3(0, -dy, dx);
const _qp = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _sw = new THREE.Quaternion(), _cur = new THREE.Vector3();
// rotate a bone so it points along worldDir, keeping its rest twist relative to its parent
function aim(bone, worldDir) {
  bone.parent.getWorldQuaternion(_qp);
  _qd.copy(_qp).multiply(bone.userData.qRest);
  _cur.copy(bone.userData.dLocal).applyQuaternion(_qd);
  _sw.setFromUnitVectors(_cur, worldDir.clone().normalize());
  _qd.premultiply(_sw);
  bone.quaternion.copy(_qp.invert().multiply(_qd));
  bone.updateMatrixWorld(true);
}
function twoBone(a, target, l1, l2, pole) {
  const d = Math.min(Math.max(target.distanceTo(a), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const u = target.clone().sub(a).normalize();
  const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
  if (v.lengthSq() < 1e-8) v.set(0, 0, 1);
  v.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  return { mid: a.clone().addScaledVector(u, l1 * cosA).addScaledVector(v, l1 * sinA), end: a.clone().addScaledVector(u, d) };
}
const W = b => b.getWorldPosition(new THREE.Vector3());

/* frame: [hip, sh, head, hand1, hand2, elb1, elb2, foot1, foot2, knee1, knee2, toe1, toe2] as 2D pairs */
export function applyFrame(rig, f, opt = {}, prog = 0) {
  const [hip, sh, head, h1, h2, e1, e2, ft1, ft2, k1, k2, t1, t2] = f;
  const B = rig.byName;
  restPose(rig);
  const torso = sag(sh[0] - hip[0], sh[1] - hip[1]).normalize();
  const tAdd = (opt.tAdd || 0) + (opt.tAddB || 0) * prog;
  const X = new THREE.Vector3(1, 0, 0), tRad = tAdd * Math.PI / 180;
  if (tAdd) torso.applyAxisAngle(X, tRad);
  // the side figure reclines the whole body on some machines; re-seat limbs with the same correction
  const fix = v => (tAdd ? v.applyAxisAngle(X, tRad) : v);
  // hips carry most of the lean; the rest is spread through the spine for a natural curve
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), torso);
  rig.root.quaternion.copy(new THREE.Quaternion().slerp(lean, .7)).multiply(rig.root.userData.qRest);
  rig.root.position.set(0, ANKLE_Y + (180 - hip[1]) * kL + (opt.lift || 0) + 0.05, (hip[0] - 100) * kL);
  rig.root.updateMatrixWorld(true);
  aim(B.spine1, torso); aim(B.chest, torso);
  aim(B.neck, sag(head[0] - sh[0], head[1] - sh[1]).lerp(torso, 0.5));
  if (opt.backAt != null) { // lying on the back: rest the upper back on the floor / bench
    rig.root.position.y += opt.backAt - W(B.chest).y; rig.root.updateMatrixWorld(true);
  }
  // legs
  [[B.thighR, B.shinR, B.footR, ft1, k1, t1, 1], [B.thighL, B.shinL, B.footL, ft2, k2, t2, -1]].forEach(([th, shn, ft, foot, knee, toe, s]) => {
    const a = W(th);
    const planted = foot[1] >= 178 && !opt.footRel;
    const target = new THREE.Vector3(a.x + s * (opt.stance || 0.015), ANKLE_Y + (opt.lift || 0), (foot[0] - 100) * kL);
    if (opt.feetFixed) { // strapped into foot plates (rower): feet stay put while the hips slide
      target.set(a.x + s * 0.01, ANKLE_Y + (180 - foot[1]) * kL, (foot[0] - 100) * kL);
    } else if (!planted) { const rel = fix(sag(foot[0] - hip[0], foot[1] - hip[1]).multiplyScalar(kL * 1.03)); target.y = a.y + rel.y; target.z = a.z + rel.z; }
    const mid2 = [(hip[0] + foot[0]) / 2, (hip[1] + foot[1]) / 2];
    const pole = fix(sag(knee[0] - mid2[0], knee[1] - mid2[1])).add(new THREE.Vector3(s * 0.12, 0, 0));
    if (opt.knee) { // seated leg extension / curl: thigh on the seat, shin swings about the knee
      const [k0, k1] = opt.knee, th = (k0 + (k1 - k0) * prog) * Math.PI / 180;
      const thighDir = new THREE.Vector3(s * 0.05, -0.04, 1).normalize();
      const kneeP = a.clone().addScaledVector(thighDir, 0.2205);
      target.copy(kneeP).add(new THREE.Vector3(0, -Math.cos(th), Math.sin(th)).multiplyScalar(0.235));
      pole.set(s * 0.1, 0.6, 1);
    }
    if (opt.abduct) {
      const open = opt.abduct === 'out' ? prog : 1 - prog;
      target.copy(a).add(new THREE.Vector3(s * (0.03 + 0.15 * open), -0.2, 0.17));
      pole.set(s * (0.3 + open), 0.4, 1);
    }
    const r = twoBone(a, target, th.userData.len, shn.userData.len, pole);
    aim(th, r.mid.clone().sub(a)); aim(shn, r.end.clone().sub(r.mid));
    const tv = toe || [1, 0], ang = Math.atan2(tv[1], tv[0]);
    aim(ft, new THREE.Vector3(0, -0.45, 1).normalize().applyAxisAngle(new THREE.Vector3(1, 0, 0), ang));
  });
  // arms
  [[B.upperarmR, B.forearmR, h1, e1, 1], [B.upperarmL, B.forearmL, h2, e2, -1]].forEach(([ua, fa, hand, elb, s]) => {
    const a = W(ua);
    const target = a.clone().add(fix(sag(hand[0] - sh[0], hand[1] - sh[1]).multiplyScalar(kA)));
    target.x = opt.handsX != null ? s * opt.handsX : a.x + s * 0.04;
    if (hand[1] >= 178 && !opt.handsFree) target.y = WRIST_FLOOR + 0.02;
    if (opt.fly) {
      const open = 1 - prog, spread = 0.06 + 0.36 * open;
      target.set(s * spread, a.y + (opt.fly === 'cable' ? 0.12 * open - 0.12 * prog : -0.02), a.z + 0.30 - 0.14 * open);
    } else if (opt.chop) target.x = 0.22 - 0.42 * prog + s * 0.03;
    else if (opt.circles) { const g = prog * Math.PI * 2; target.set(a.x + s * 0.32, a.y + 0.05 * Math.sin(g), a.z + 0.05 * Math.cos(g)); }
    const mid2 = [(sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2];
    const pole = fix(sag(elb[0] - mid2[0], elb[1] - mid2[1])).add(new THREE.Vector3(s * (opt.elbowsOut ?? 0.3), 0, 0));
    if (opt.fly || opt.circles) pole.set(s, -0.4, -0.3);
    const r = twoBone(a, target, ua.userData.len, fa.userData.len + 0.05, pole);
    aim(ua, r.mid.clone().sub(a)); aim(fa, r.end.clone().sub(r.mid));
  });
}

function boneDirB(b) { return b.userData.dLocal.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())).normalize(); }
export function boneDir(rig, name) { return boneDirB(rig.byName[name]); }
export function gripPoint(rig, side) { const hd = rig.byName['hand' + side]; return W(hd).add(boneDirB(hd).multiplyScalar(0.05)); }

/* keep a clip's body motion but hold the hands at a fixed spot on the chest (goblet squat) */
export function holdAtChest(rig, { fwd = 0.12, down = 0.0, apart = 0.035 } = {}) {
  const ch = rig.byName.chest, q = ch.getWorldQuaternion(new THREE.Quaternion());
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const c = W(ch).addScaledVector(f, fwd).addScaledVector(up, -down);
  for (const [s, k] of [[1, 'R'], [-1, 'L']]) {
    const ua = rig.byName['upperarm' + k], fa = rig.byName['forearm' + k], a = W(ua);
    const target = c.clone().addScaledVector(side, s * apart);
    const pole = up.clone().multiplyScalar(-1).addScaledVector(side, s * 0.5).addScaledVector(f, 0.2);
    const r = twoBone(a, target, ua.userData.len, fa.userData.len + 0.05, pole);
    aim(ua, r.mid.clone().sub(a)); aim(fa, r.end.clone().sub(r.mid));
  }
}
