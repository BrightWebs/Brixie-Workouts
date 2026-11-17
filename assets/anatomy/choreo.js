import * as THREE from 'three';

/* Hand-authored 3D key poses for every exercise that has no motion-capture clip.
   Units are the mannequin's (1 unit ≈ 1.54 m). +z is the direction he faces, +x is his left, y is up.
   Reference proportions (standing): hips joint 0.62 high, hip sockets ±0.06 at 0.58, shoulders ±0.115 at 0.88,
   upper arm 0.17, forearm + grip 0.19, thigh 0.27, shin 0.24, ankles 0.072 above the floor.
   A pose:  hips [x,y,z] position of the pelvis · pitch/yaw/roll of the pelvis in degrees (pitch + = leaning forward)
            bend/twist/side spine flexion in degrees (bend + = rounding forward) · neck (+ = chin down)
            hands {L,R} world grip points  or  rel {L,R} offsets from that shoulder (in the body's facing frame)
            elbows {L,R} direction the elbow points · feet {L,R} ankle points · knees {L,R} knee directions
            foot {L,R}: 'flat' | 'point' (toes pointed, e.g. kneeling) | 'up' (toes up) | 'shin' (keep with the shin)
            shrug {L,R} degrees the shoulder blade lifts (arms overhead)                                         */

const sym = (x, y, z) => ({ L: [x, y, z], R: [-x, y, z] });
const both = v => ({ L: v, R: v });
const symDir = (x, y, z) => ({ L: [x, y, z], R: [-x, y, z] });
const STAND = { hips: [0, 0.62, 0], pitch: 0, yaw: 0, roll: 0, bend: 0, twist: 0, side: 0, neck: 0,
  feet: sym(0.1, 0.072, -0.01), knees: both([0, 0.15, 1]), hands: sym(0.21, 0.53, 0.04), elbows: symDir(0.3, 0, -1),
  foot: both('flat'), shrug: both(0) };
const SEAT = { ...STAND, hips: [0, 0.405, -0.05], feet: sym(0.12, 0.072, 0.24), knees: both([0, 0.4, 1]) };   // on a 0.29-high seat
const P = (base, o) => ({ ...base, ...o });
const loop = (...poses) => poses.map((p, i) => [i / (poses.length - 1), p]);

/* timing helpers: hold-heavy reps (lift, squeeze, lower slowly) */
const rep = (a, b, holdTop = 0.08) => [[0, a], [0.38, b], [0.38 + holdTop, b], [1, a]];

export const CHOREO = {
  /* ---------------- warm-up / mobility ---------------- */
  armc: { period: 2600, view: 0.35, keys: (() => {
    const k = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI * 2, y = 0.9 + 0.06 * Math.sin(a), z = 0.06 * Math.cos(a);
      k.push([i / 8, P(STAND, { hands: sym(0.47, y, z), elbows: symDir(0, -1, 0) })]); } return k; })() },
  legs: { period: 2200, view: 1.25, keys: loop(
    P(STAND, { feet: { L: [0.1, 0.072, -0.01], R: [-0.1, 0.16, -0.26] }, knees: { L: [0, 0.1, 1], R: [0, -0.2, 1] }, foot: { L: 'flat', R: 'shin' },
      hands: { L: [0.17, 0.62, 0.06], R: [-0.42, 0.95, 0.02] }, elbows: { L: [1, 0, -0.5], R: [-0.4, -1, 0] }, pitch: 6, roll: -3 }),
    P(STAND, { feet: { L: [0.1, 0.072, -0.01], R: [-0.1, 0.22, 0.32] }, knees: { L: [0, 0.1, 1], R: [0, 0.6, 1] }, foot: { L: 'flat', R: 'shin' },
      hands: { L: [0.17, 0.62, 0.06], R: [-0.42, 0.95, 0.02] }, elbows: { L: [1, 0, -0.5], R: [-0.4, -1, 0] }, pitch: -4, roll: -3 }),
    P(STAND, { feet: { L: [0.1, 0.072, -0.01], R: [-0.1, 0.16, -0.26] }, knees: { L: [0, 0.1, 1], R: [0, -0.2, 1] }, foot: { L: 'flat', R: 'shin' },
      hands: { L: [0.17, 0.62, 0.06], R: [-0.42, 0.95, 0.02] }, elbows: { L: [1, 0, -0.5], R: [-0.4, -1, 0] }, pitch: 6, roll: -3 })) },
  lunge: { period: 3000, view: 1.25, keys: rep(
    P(STAND, { feet: { L: [0.1, 0.072, 0.30], R: [-0.1, 0.09, -0.30] }, hips: [0, 0.6, 0], foot: { L: 'flat', R: 'toes' }, rel: sym(0.02, -0.3, 0.02) }),
    P(STAND, { feet: { L: [0.1, 0.072, 0.30], R: [-0.1, 0.09, -0.32] }, hips: [0, 0.37, -0.02], knees: { L: [0, 0.3, 1], R: [0, -1, 0.15] }, foot: { L: 'flat', R: 'toes' }, rel: sym(0.02, -0.3, 0.02), pitch: 4 })) },
  inch: { period: 6400, view: 1.35, keys: (() => {
    const stand = P(STAND, { rel: sym(0.02, -0.3, 0.02) });
    const fold = P(STAND, { hips: [0, 0.6, -0.05], pitch: 108, bend: 30, neck: 10, hands: sym(0.12, 0.035, 0.2), elbows: symDir(0, 0, -1), knees: both([0, 0, 1]), feet: sym(0.1, 0.072, -0.01) });
    const mid = P(STAND, { hips: [0, 0.42, 0.18], pitch: 95, bend: 12, neck: 0, hands: sym(0.13, 0.035, 0.5), elbows: symDir(0.2, 0, -1), knees: both([0, 0, 1]), feet: sym(0.1, 0.07, -0.01), foot: both('toes') });
    const plank = P(STAND, { hips: [0, 0.2, 0.5], pitch: 80, bend: 0, neck: -8, hands: sym(0.13, 0.035, 0.78), elbows: symDir(0.2, 0, -1), knees: both([0, -1, 0]), feet: sym(0.1, 0.06, -0.01), foot: both('down') });
    return [[0, stand], [0.2, fold], [0.35, mid], [0.5, plank], [0.6, plank], [0.75, mid], [0.88, fold], [1, stand]]; })() },
  catcow: { period: 5000, view: 1.35, keys: loop(
    P(STAND, { hips: [0, 0.4, -0.18], pitch: 90, bend: -20, neck: -30, hands: sym(0.13, 0.035, 0.18), elbows: symDir(0, 0, -1),
      feet: sym(0.09, 0.05, -0.5), knees: both([0, -1, 0.1]), foot: both('point') }),
    P(STAND, { hips: [0, 0.4, -0.18], pitch: 90, bend: 28, neck: 30, hands: sym(0.13, 0.035, 0.18), elbows: symDir(0, 0, -1),
      feet: sym(0.09, 0.05, -0.5), knees: both([0, -1, 0.1]), foot: both('point') }),
    P(STAND, { hips: [0, 0.4, -0.18], pitch: 90, bend: -20, neck: -30, hands: sym(0.13, 0.035, 0.18), elbows: symDir(0, 0, -1),
      feet: sym(0.09, 0.05, -0.5), knees: both([0, -1, 0.1]), foot: both('point') })) },

  /* ---------------- strength ---------------- */
  plank: { period: 4000, view: 1.35, keys: loop(
    P(STAND, { hips: [0, 0.16, -0.02], pitch: 81, neck: -10, feet: sym(0.08, 0.06, -0.56), knees: both([0, -1, 0]), foot: both('down'),
      hands: sym(0.07, 0.035, 0.42), elbows: symDir(0.2, -1, -0.2) }),
    P(STAND, { hips: [0, 0.165, -0.02], pitch: 81, neck: -10, feet: sym(0.08, 0.06, -0.56), knees: both([0, -1, 0]), foot: both('down'),
      hands: sym(0.07, 0.035, 0.42), elbows: symDir(0.2, -1, -0.2) }),
    P(STAND, { hips: [0, 0.16, -0.02], pitch: 81, neck: -10, feet: sym(0.08, 0.06, -0.56), knees: both([0, -1, 0]), foot: both('down'),
      hands: sym(0.07, 0.035, 0.42), elbows: symDir(0.2, -1, -0.2) })) },
  rdl: { period: 3600, view: 1.2, keys: rep(
    P(STAND, { feet: sym(0.09, 0.072, 0), hands: sym(0.13, 0.5, 0.09), elbows: symDir(0, 0, -1), knees: both([0, 0.1, 1]) }),
    P(STAND, { hips: [0, 0.6, -0.13], pitch: 62, bend: 4, neck: -12, feet: sym(0.09, 0.072, 0), hands: sym(0.12, 0.25, 0.14), elbows: symDir(0, 0, -1), knees: both([0, 0.1, 1]) })) },
  barrdl: { alias: 'rdl' },
  spress: { period: 3000, view: 0.55, keys: rep(
    P(SEAT, { pitch: -6, hands: sym(0.25, 0.71, 0.04), elbows: symDir(1, -1, 0) }),
    P(SEAT, { pitch: -6, hands: sym(0.16, 1.0, 0.02), elbows: symDir(1, -0.2, 0), shrug: both(12) })) },
  machinepress: { alias: 'spress' },
  chest: { period: 3000, view: 0.75, keys: rep(
    P(SEAT, { pitch: -10, hands: sym(0.22, 0.6, 0.08), elbows: symDir(1, -0.4, -0.4) }),
    P(SEAT, { pitch: -10, hands: sym(0.16, 0.61, 0.38), elbows: symDir(1, -0.6, -0.2) })) },
  pecdeck: { period: 3200, view: 0.35, keys: rep(
    P(SEAT, { pitch: -6, hands: sym(0.43, 0.68, 0.06), elbows: symDir(0.2, -1, -0.3) }),
    P(SEAT, { pitch: -6, hands: sym(0.07, 0.68, 0.31), elbows: symDir(0.6, -1, 0) })) },
  cablefly: { period: 3200, view: 0.45, keys: rep(
    P(STAND, { feet: { L: [0.1, 0.072, 0.1], R: [-0.1, 0.072, -0.1] }, pitch: 12, hands: sym(0.52, 1.0, -0.02), elbows: symDir(0.3, -0.6, -1) }),
    P(STAND, { feet: { L: [0.1, 0.072, 0.1], R: [-0.1, 0.072, -0.1] }, pitch: 12, hands: sym(0.06, 0.74, 0.34), elbows: symDir(1, -0.4, 0) })) },
  lat: { period: 3200, view: 0.8, keys: rep(
    P(SEAT, { pitch: -6, feet: sym(0.13, 0.072, 0.23), hands: sym(0.31, 0.97, 0.03), elbows: symDir(1, 0.2, 0), shrug: both(14) }),
    P(SEAT, { pitch: -16, neck: -8, feet: sym(0.13, 0.072, 0.23), hands: sym(0.27, 0.71, 0.1), elbows: symDir(0.8, -1, -0.5), shrug: both(-4) })) },
  assist: { period: 3400, view: 0.9, keys: rep(
    P(STAND, { hips: [0, 0.72, 0], feet: sym(0.09, 0.42, -0.26), knees: both([0, -0.3, 1]), foot: both('point'), hands: sym(0.3, 1.5, 0.03), elbows: symDir(1, 0.2, 0), shrug: both(14) }),
    P(STAND, { hips: [0, 0.96, 0.01], pitch: -6, feet: sym(0.09, 0.66, -0.26), knees: both([0, -0.3, 1]), foot: both('point'), hands: sym(0.3, 1.5, 0.03), elbows: symDir(1, -1, -0.4) })) },
  crow: { period: 3200, view: 1.2, keys: rep(
    P(SEAT, { pitch: 14, feet: sym(0.1, 0.17, 0.38), knees: both([0, 1, 0.5]), hands: sym(0.05, 0.5, 0.48), elbows: symDir(0.4, -0.6, 0) }),
    P(SEAT, { pitch: -4, neck: -6, feet: sym(0.1, 0.17, 0.38), knees: both([0, 1, 0.5]), hands: sym(0.07, 0.5, 0.1), elbows: symDir(0.4, -0.3, -1) })) },
  supportedrow: { alias: 'crow' },
  tri: { period: 2800, view: 0.9, keys: rep(
    P(STAND, { pitch: 12, feet: { L: [0.1, 0.072, 0.06], R: [-0.1, 0.072, -0.08] }, hands: sym(0.07, 0.86, 0.2), elbows: symDir(0.2, -0.4, -1) }),
    P(STAND, { pitch: 12, feet: { L: [0.1, 0.072, 0.06], R: [-0.1, 0.072, -0.08] }, hands: sym(0.1, 0.53, 0.17), elbows: symDir(0.2, 0, -1) })) },
  chop: { period: 3000, view: 0.25, keys: rep(
    P(STAND, { feet: sym(0.16, 0.072, 0), yaw: -10, twist: -30, hands: { L: [-0.2, 1.13, 0.2], R: [-0.27, 1.13, 0.18] }, elbows: symDir(0.4, -1, 0), hips: [0, 0.6, 0] }),
    P(STAND, { feet: sym(0.16, 0.072, 0), yaw: 10, twist: 30, hips: [0, 0.54, 0], knees: both([0, 0.2, 1]), hands: { L: [0.29, 0.45, 0.26], R: [0.22, 0.45, 0.28] }, elbows: symDir(0.2, -1, 0) })) },
  dbug: { period: 3600, view: 1.3, keys: [
    [0, P(STAND, { hips: [0, 0.1, 0], pitch: -90, hands: sym(0.12, 0.45, -0.25), elbows: symDir(1, 0, 0), feet: sym(0.08, 0.36, 0.24), knees: both([0, 1, 0]), foot: both('shin') })],
    [0.25, P(STAND, { hips: [0, 0.1, 0], pitch: -90, hands: { L: [0.12, 0.45, -0.25], R: [-0.14, 0.12, -0.62] }, elbows: symDir(1, 0, 0), feet: { L: [0.08, 0.13, 0.52], R: [-0.08, 0.36, 0.24] }, knees: both([0, 1, 0]), foot: both('shin') })],
    [0.5, P(STAND, { hips: [0, 0.1, 0], pitch: -90, hands: sym(0.12, 0.45, -0.25), elbows: symDir(1, 0, 0), feet: sym(0.08, 0.36, 0.24), knees: both([0, 1, 0]), foot: both('shin') })],
    [0.75, P(STAND, { hips: [0, 0.1, 0], pitch: -90, hands: { L: [0.14, 0.12, -0.62], R: [-0.12, 0.45, -0.25] }, elbows: symDir(1, 0, 0), feet: { L: [0.08, 0.36, 0.24], R: [-0.08, 0.13, 0.52] }, knees: both([0, 1, 0]), foot: both('shin') })],
    [1, P(STAND, { hips: [0, 0.1, 0], pitch: -90, hands: sym(0.12, 0.45, -0.25), elbows: symDir(1, 0, 0), feet: sym(0.08, 0.36, 0.24), knees: both([0, 1, 0]), foot: both('shin') })]] },
  legext: { period: 3000, view: 1.15, keys: rep(
    P(SEAT, { pitch: -14, feet: sym(0.1, 0.14, 0.2), knees: both([0, 1, 0.3]), foot: both('shin'), hands: sym(0.21, 0.37, -0.02), elbows: symDir(0.6, 0, -1) }),
    P(SEAT, { pitch: -14, feet: sym(0.1, 0.33, 0.46), knees: both([0, 1, 0.3]), foot: both('shin'), hands: sym(0.21, 0.37, -0.02), elbows: symDir(0.6, 0, -1) })) },
  legcurl: { period: 3000, view: 1.15, keys: rep(
    P(SEAT, { pitch: -14, feet: sym(0.1, 0.33, 0.46), knees: both([0, 1, 0.3]), foot: both('shin'), hands: sym(0.21, 0.37, -0.02), elbows: symDir(0.6, 0, -1) }),
    P(SEAT, { pitch: -14, feet: sym(0.1, 0.15, 0.1), knees: both([0, 1, 0.5]), foot: both('shin'), hands: sym(0.21, 0.37, -0.02), elbows: symDir(0.6, 0, -1) })) },
  lpress: { period: 3400, view: 1.5, keys: rep(
    P(SEAT, { hips: [0, 0.36, 0], pitch: -52, feet: sym(0.12, 0.56, 0.24), knees: both([0, 0.6, 0.2]), foot: both('shin'), hands: sym(0.22, 0.4, 0.0), elbows: symDir(0.6, 0, -1) }),
    P(SEAT, { hips: [0, 0.36, 0], pitch: -52, feet: sym(0.12, 0.68, 0.37), knees: both([0, 0.6, 0.2]), foot: both('shin'), hands: sym(0.22, 0.4, 0.0), elbows: symDir(0.6, 0, -1) })) },
  hipabd: { period: 3000, view: 0.3, keys: rep(
    P(SEAT, { pitch: -16, feet: sym(0.1, 0.14, 0.24), knees: both([0, 0.5, 1]), hands: sym(0.22, 0.4, -0.04), elbows: symDir(0.6, 0, -1) }),
    P(SEAT, { pitch: -16, feet: sym(0.26, 0.14, 0.2), knees: symDir(0.9, 0.5, 1), hands: sym(0.22, 0.4, -0.04), elbows: symDir(0.6, 0, -1) })) },
  hipadd: { period: 3000, view: 0.3, keys: rep(
    P(SEAT, { pitch: -16, feet: sym(0.26, 0.14, 0.2), knees: symDir(0.9, 0.5, 1), hands: sym(0.22, 0.4, -0.04), elbows: symDir(0.6, 0, -1) }),
    P(SEAT, { pitch: -16, feet: sym(0.1, 0.14, 0.24), knees: both([0, 0.5, 1]), hands: sym(0.22, 0.4, -0.04), elbows: symDir(0.6, 0, -1) })) },
  calfraise: { period: 2600, view: 1.2, keys: rep(
    P(STAND, { feet: sym(0.1, 0.072 + 0.05, 0.02), hands: sym(0.19, 0.96, 0.03), elbows: symDir(1, -1, 0), hips: [0, 0.66, 0] }),
    P(STAND, { feet: sym(0.1, 0.17, 0.0), foot: both('toes'), hands: sym(0.19, 1.04, 0.03), elbows: symDir(1, -1, 0), hips: [0, 0.715, 0] })) },
  abcrunch: { period: 3000, view: 1.0, keys: rep(
    P(SEAT, { pitch: -6, rel: sym(0.0, -0.02, 0.14), elbows: symDir(1, -0.6, 0) }),
    P(SEAT, { pitch: 10, bend: 34, neck: 12, rel: sym(0.0, -0.02, 0.14), elbows: symDir(1, -0.6, 0) })) },
  backext: { period: 3200, view: 1.45, keys: rep(
    P(STAND, { hips: [0, 0.46, 0.0], pitch: 125, bend: 15, neck: 10, feet: sym(0.09, 0.11, -0.36), knees: both([0, 0.5, 1]), rel: { L: [-0.15, -0.05, 0.1], R: [0.15, -0.05, 0.1] }, elbows: symDir(1, -0.3, 0) }),
    P(STAND, { hips: [0, 0.46, 0.0], pitch: 44, bend: 0, neck: -4, feet: sym(0.09, 0.11, -0.36), knees: both([0, 0.5, 1]), rel: { L: [-0.15, -0.05, 0.1], R: [0.15, -0.05, 0.1] }, elbows: symDir(1, -0.3, 0) })) },
  hipthrust: { period: 3200, view: 1.35, keys: rep(
    P(STAND, { hips: [0, 0.17, 0.0], pitch: -62, neck: 20, feet: sym(0.13, 0.072, 0.31), knees: both([0, 1, 0.3]), hands: sym(0.2, 0.3, 0.07), elbows: symDir(1, 0, 0) }),
    P(STAND, { hips: [0, 0.33, 0.02], pitch: -86, neck: 30, feet: sym(0.13, 0.072, 0.31), knees: both([0, 1, 0.3]), hands: sym(0.2, 0.44, 0.07), elbows: symDir(1, 0, 0) })) },
  bridge: { period: 3200, view: 1.45, keys: rep(
    P(STAND, { hips: [0, 0.1, 0], pitch: -97, neck: 8, feet: sym(0.1, 0.072, 0.3), knees: both([0, 1, 0.3]), hands: sym(0.2, 0.035, -0.02), elbows: symDir(1, 0.3, 0) }),
    P(STAND, { hips: [0, 0.27, 0.0], pitch: -138, neck: 40, feet: sym(0.1, 0.072, 0.3), knees: both([0, 1, 0.3]), hands: sym(0.2, 0.035, -0.08), elbows: symDir(1, 0.3, 0) })) },
  trxrow: { period: 3000, view: 1.3, keys: rep(
    P(STAND, { hips: [0, 0.5, 0.12], pitch: -32, feet: sym(0.09, 0.072, 0.4), rel: sym(0.02, 0.12, 0.34), elbows: symDir(0.6, -0.4, 0) }),
    P(STAND, { hips: [0, 0.58, 0.18], pitch: -14, feet: sym(0.09, 0.072, 0.4), rel: sym(0.1, -0.04, 0.12), elbows: symDir(0.6, -0.4, -1) })) },

  /* ---------------- cardio machines ---------------- */
  row: { period: 2600, view: 1.25, keys: [
    [0, P(STAND, { hips: [0, 0.3, 0.1], pitch: 22, feet: sym(0.07, 0.19, 0.45), knees: both([0, 1, 0.2]), foot: both('up'), hands: sym(0.09, 0.5, 0.56), elbows: symDir(0.6, -0.3, 0) })],
    [0.22, P(STAND, { hips: [0, 0.3, -0.12], pitch: 18, feet: sym(0.07, 0.19, 0.45), knees: both([0, 1, 0.2]), foot: both('up'), hands: sym(0.09, 0.52, 0.36), elbows: symDir(0.6, -0.3, 0) })],
    [0.36, P(STAND, { hips: [0, 0.3, -0.3], pitch: -14, feet: sym(0.07, 0.19, 0.45), knees: both([0, 1, 0.2]), foot: both('up'), hands: sym(0.1, 0.64, -0.08), elbows: symDir(0.6, -0.2, -1) })],
    [0.5, P(STAND, { hips: [0, 0.3, -0.3], pitch: -12, feet: sym(0.07, 0.19, 0.45), knees: both([0, 1, 0.2]), foot: both('up'), hands: sym(0.09, 0.56, 0.2), elbows: symDir(0.6, -0.3, 0) })],
    [0.72, P(STAND, { hips: [0, 0.3, -0.18], pitch: 20, feet: sym(0.07, 0.19, 0.45), knees: both([0, 1, 0.2]), foot: both('up'), hands: sym(0.09, 0.5, 0.42), elbows: symDir(0.6, -0.3, 0) })],
    [1, P(STAND, { hips: [0, 0.3, 0.1], pitch: 22, feet: sym(0.07, 0.19, 0.45), knees: both([0, 1, 0.2]), foot: both('up'), hands: sym(0.09, 0.5, 0.56), elbows: symDir(0.6, -0.3, 0) })]] },
  finrow: { alias: 'row' },
  bike: { period: 1400, view: 1.1, keys: (() => { const k = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2, c = [0, 0.2, 0.27], r = 0.11;
    const pd = s => [s * 0.1, c[1] + r * Math.sin(a + (s > 0 ? 0 : Math.PI)) + 0.06, c[2] + r * Math.cos(a + (s > 0 ? 0 : Math.PI))];
    k.push([i / 12, P(STAND, { hips: [0, 0.66, -0.08], pitch: 30, neck: -14, feet: { L: pd(1), R: pd(-1) }, knees: both([0, 0.6, 1]), foot: both('shin'), hands: sym(0.17, 0.82, 0.38), elbows: symDir(0.8, -0.6, -0.2) })]); } return k; })() },
  spinbike: { alias: 'bike' }, airbike: { alias: 'bike' },
  elliptical: { period: 1700, view: 1.15, keys: (() => { const k = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2;
    const ft = s => [s * 0.1, 0.2 + 0.05 * Math.sin(a + (s > 0 ? 0 : Math.PI)), 0.05 + 0.17 * Math.cos(a + (s > 0 ? 0 : Math.PI))];
    const hd = s => [s * 0.22, 0.98, 0.3 - 0.12 * Math.cos(a + (s > 0 ? Math.PI : 0))];
    k.push([i / 12, P(STAND, { hips: [0, 0.76 + 0.012 * Math.cos(2 * a), -0.02], pitch: 6, feet: { L: ft(1), R: ft(-1) }, knees: both([0, 0.2, 1]), hands: { L: hd(1), R: hd(-1) }, elbows: symDir(0.6, -1, -0.3) })]); } return k; })() },
  arcstride: { alias: 'elliptical' },
  stairs: { period: 1500, view: 1.2, keys: loop(
    P(STAND, { hips: [0, 0.78, 0.02], pitch: 8, feet: { L: [0.1, 0.17, 0.02], R: [-0.1, 0.32, 0.2] }, knees: both([0, 0.3, 1]), hands: sym(0.26, 0.92, 0.18), elbows: symDir(0.6, -1, -0.3) }),
    P(STAND, { hips: [0, 0.78, 0.02], pitch: 8, feet: { L: [0.1, 0.32, 0.2], R: [-0.1, 0.17, 0.02] }, knees: both([0, 0.3, 1]), hands: sym(0.26, 0.92, 0.18), elbows: symDir(0.6, -1, -0.3) }),
    P(STAND, { hips: [0, 0.78, 0.02], pitch: 8, feet: { L: [0.1, 0.17, 0.02], R: [-0.1, 0.32, 0.2] }, knees: both([0, 0.3, 1]), hands: sym(0.26, 0.92, 0.18), elbows: symDir(0.6, -1, -0.3) })) },
  seatedstep: { period: 1800, view: 1.15, keys: loop(
    P(SEAT, { hips: [0, 0.42, -0.05], pitch: -24, feet: { L: [0.1, 0.32, 0.42], R: [-0.1, 0.27, 0.26] }, knees: both([0, 1, 0.5]), foot: both('shin'), hands: { L: [0.25, 0.75, 0.2], R: [-0.25, 0.75, 0.3] }, elbows: symDir(0.6, -1, -0.3) }),
    P(SEAT, { hips: [0, 0.42, -0.05], pitch: -24, feet: { L: [0.1, 0.27, 0.26], R: [-0.1, 0.32, 0.42] }, knees: both([0, 1, 0.5]), foot: both('shin'), hands: { L: [0.25, 0.75, 0.3], R: [-0.25, 0.75, 0.2] }, elbows: symDir(0.6, -1, -0.3) }),
    P(SEAT, { hips: [0, 0.42, -0.05], pitch: -24, feet: { L: [0.1, 0.32, 0.42], R: [-0.1, 0.27, 0.26] }, knees: both([0, 1, 0.5]), foot: both('shin'), hands: { L: [0.25, 0.75, 0.2], R: [-0.25, 0.75, 0.3] }, elbows: symDir(0.6, -1, -0.3) })) },
  ropes: { period: 700, view: 0.9, keys: loop(
    P(STAND, { hips: [0, 0.47, -0.06], pitch: 24, feet: sym(0.16, 0.072, 0.02), knees: symDir(0.3, 0.3, 1), hands: { L: [0.16, 0.74, 0.3], R: [-0.16, 0.52, 0.32] }, elbows: symDir(0.5, -1, -0.3) }),
    P(STAND, { hips: [0, 0.47, -0.06], pitch: 24, feet: sym(0.16, 0.072, 0.02), knees: symDir(0.3, 0.3, 1), hands: { L: [0.16, 0.52, 0.32], R: [-0.16, 0.74, 0.3] }, elbows: symDir(0.5, -1, -0.3) }),
    P(STAND, { hips: [0, 0.47, -0.06], pitch: 24, feet: sym(0.16, 0.072, 0.02), knees: symDir(0.3, 0.3, 1), hands: { L: [0.16, 0.74, 0.3], R: [-0.16, 0.52, 0.32] }, elbows: symDir(0.5, -1, -0.3) })) },

  /* ---------------- cool-down stretches ---------------- */
  quad: { period: 5000, view: 1.35, keys: loop(
    P(STAND, { feet: { L: [0.08, 0.072, 0.0], R: [-0.09, 0.47, -0.17] }, knees: { L: [0, 0.1, 1], R: [0, -1, 0.15] }, foot: { L: 'flat', R: 'point' },
      hands: { L: [0.2, 0.98, 0.33], R: [-0.11, 0.5, -0.16] }, elbows: { L: [0.4, -1, 0], R: [-0.3, 0, -1] }, roll: 2 }),
    P(STAND, { pitch: -3, feet: { L: [0.08, 0.072, 0.0], R: [-0.09, 0.5, -0.19] }, knees: { L: [0, 0.1, 1], R: [0, -1, 0.05] }, foot: { L: 'flat', R: 'point' },
      hands: { L: [0.2, 0.98, 0.33], R: [-0.11, 0.52, -0.18] }, elbows: { L: [0.4, -1, 0], R: [-0.3, 0, -1] }, roll: 2 }),
    P(STAND, { feet: { L: [0.08, 0.072, 0.0], R: [-0.09, 0.47, -0.17] }, knees: { L: [0, 0.1, 1], R: [0, -1, 0.15] }, foot: { L: 'flat', R: 'point' },
      hands: { L: [0.2, 0.98, 0.33], R: [-0.11, 0.5, -0.16] }, elbows: { L: [0.4, -1, 0], R: [-0.3, 0, -1] }, roll: 2 })) },
  ham: { period: 5000, view: 1.4, keys: loop(
    P(STAND, { hips: [0, 0.56, -0.08], pitch: 32, neck: -5, feet: { L: [0.09, 0.072, -0.06], R: [-0.09, 0.075, 0.3] }, knees: { L: [0, 0.2, 1], R: [0, 0.4, 1] }, foot: { L: 'flat', R: 'up' },
      hands: { L: [-0.02, 0.41, 0.07], R: [-0.13, 0.41, 0.06] }, elbows: symDir(0.5, 0, -1) }),
    P(STAND, { hips: [0, 0.53, -0.12], pitch: 48, bend: 6, neck: -5, feet: { L: [0.09, 0.072, -0.06], R: [-0.09, 0.075, 0.3] }, knees: { L: [0, 0.2, 1], R: [0, 0.4, 1] }, foot: { L: 'flat', R: 'up' },
      hands: { L: [-0.02, 0.38, 0.04], R: [-0.13, 0.38, 0.03] }, elbows: symDir(0.5, 0, -1) }),
    P(STAND, { hips: [0, 0.56, -0.08], pitch: 32, neck: -5, feet: { L: [0.09, 0.072, -0.06], R: [-0.09, 0.075, 0.3] }, knees: { L: [0, 0.2, 1], R: [0, 0.4, 1] }, foot: { L: 'flat', R: 'up' },
      hands: { L: [-0.02, 0.41, 0.07], R: [-0.13, 0.41, 0.06] }, elbows: symDir(0.5, 0, -1) })) },
  hipf: { period: 5000, view: 1.4, keys: loop(
    P(STAND, { hips: [0, 0.35, -0.02], pitch: -4, feet: { L: [0.1, 0.072, 0.3], R: [-0.1, 0.05, -0.38] }, knees: { L: [0, 0.4, 1], R: [0, -1, 0.15] }, foot: { L: 'flat', R: 'point' },
      hands: sym(0.07, 0.43, 0.27), elbows: symDir(0.6, 0, -1) }),
    P(STAND, { hips: [0, 0.33, 0.05], pitch: -8, feet: { L: [0.1, 0.072, 0.3], R: [-0.1, 0.05, -0.38] }, knees: { L: [0, 0.4, 1], R: [0, -1, 0.15] }, foot: { L: 'flat', R: 'point' },
      hands: sym(0.07, 0.43, 0.3), elbows: symDir(0.6, 0, -1) }),
    P(STAND, { hips: [0, 0.35, -0.02], pitch: -4, feet: { L: [0.1, 0.072, 0.3], R: [-0.1, 0.05, -0.38] }, knees: { L: [0, 0.4, 1], R: [0, -1, 0.15] }, foot: { L: 'flat', R: 'point' },
      hands: sym(0.07, 0.43, 0.27), elbows: symDir(0.6, 0, -1) })) },
  chestst: { period: 5000, view: 0.6, keys: loop(
    P(STAND, { feet: { L: [0.1, 0.072, 0.06], R: [-0.1, 0.072, -0.08] }, hands: { L: [0.21, 0.53, 0.05], R: [-0.44, 1.05, -0.02] }, elbows: { L: [0.3, 0, -1], R: [-0.2, -1, 0] } }),
    P(STAND, { hips: [0, 0.62, 0.06], pitch: 4, twist: -10, feet: { L: [0.1, 0.072, 0.06], R: [-0.1, 0.072, -0.08] }, hands: { L: [0.21, 0.53, 0.1], R: [-0.44, 1.05, -0.02] }, elbows: { L: [0.3, 0, -1], R: [-0.2, -1, 0] } }),
    P(STAND, { feet: { L: [0.1, 0.072, 0.06], R: [-0.1, 0.072, -0.08] }, hands: { L: [0.21, 0.53, 0.05], R: [-0.44, 1.05, -0.02] }, elbows: { L: [0.3, 0, -1], R: [-0.2, -1, 0] } })) },
  xbody: { period: 5000, view: 0.4, keys: loop(
    P(STAND, { hands: { L: [0.03, 0.83, 0.17], R: [0.2, 0.86, 0.17] }, elbows: { L: [0.4, -1, 0], R: [0, -0.3, 1] }, twist: 6 }),
    P(STAND, { hands: { L: [0.06, 0.83, 0.15], R: [0.24, 0.86, 0.12] }, elbows: { L: [0.4, -1, 0], R: [0, -0.3, 1] }, twist: 10 }),
    P(STAND, { hands: { L: [0.03, 0.83, 0.17], R: [0.2, 0.86, 0.17] }, elbows: { L: [0.4, -1, 0], R: [0, -0.3, 1] }, twist: 6 })) },
  child: { period: 5600, view: 1.4, keys: loop(
    P(STAND, { hips: [0, 0.22, -0.13], pitch: 112, bend: 18, neck: 5, feet: sym(0.08, 0.055, -0.22), knees: symDir(0.1, -1, 0.3), foot: both('point'),
      hands: sym(0.14, 0.035, 0.6), elbows: symDir(0.3, 0.2, 0) }),
    P(STAND, { hips: [0, 0.2, -0.15], pitch: 116, bend: 22, neck: 5, feet: sym(0.08, 0.055, -0.22), knees: symDir(0.1, -1, 0.3), foot: both('point'),
      hands: sym(0.14, 0.035, 0.62), elbows: symDir(0.3, 0.2, 0) }),
    P(STAND, { hips: [0, 0.22, -0.13], pitch: 112, bend: 18, neck: 5, feet: sym(0.08, 0.055, -0.22), knees: symDir(0.1, -1, 0.3), foot: both('point'),
      hands: sym(0.14, 0.035, 0.6), elbows: symDir(0.3, 0.2, 0) })) }
};
for (const k in CHOREO) if (CHOREO[k].alias) CHOREO[k] = CHOREO[CHOREO[k].alias];

/* ---------- interpolation ---------- */
const ease = t => t * t * (3 - 2 * t);
function mix(a, b, t) {
  if (typeof a === 'number') return a + ((typeof b === 'number' ? b : a) - a) * t;
  if (typeof a === 'string') return t < 0.5 ? a : (b ?? a);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b ? b[i] : v, t));
  if (a && typeof a === 'object') { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b || {})])) o[k] = k in a ? mix(a[k], b?.[k], t) : b[k]; return o; }
  return a;
}
export function poseAt(ch, p) {
  const K = ch.keys; p = ((p % 1) + 1) % 1;
  let i = 0; while (i < K.length - 2 && K[i + 1][0] <= p) i++;
  const [t0, a] = K[i], [t1, b] = K[i + 1];
  return mix(a, b, ease(Math.min(1, Math.max(0, (p - t0) / Math.max(1e-6, t1 - t0)))));
}

/* ---------- solving a pose on the Mixamo skeleton ---------- */
const V = a => new THREE.Vector3(a[0], a[1], a[2]);
const W = b => b.getWorldPosition(new THREE.Vector3());
const _qp = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _sw = new THREE.Quaternion(), _cur = new THREE.Vector3();
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
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const D2R = Math.PI / 180;
const local = (bone, axis, deg) => bone.quaternion.copy(bone.userData.qRest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, deg * D2R));

export function applyPose(rig, P) {
  const J = rig.byJoint;
  rig.bones.forEach(b => { b.quaternion.copy(b.userData.qRest); b.position.copy(b.userData.tRest); });
  // pelvis
  const qh = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.pitch * D2R, P.yaw * D2R, P.roll * D2R, 'YXZ'));
  rig.root.quaternion.copy(qh); rig.root.position.copy(V(P.hips)); rig.root.updateMatrixWorld(true);
  // spine: share the bend over three vertebrae groups
  for (const n of ['Spine', 'Spine1', 'Spine2']) {
    const b = J[n]; b.quaternion.copy(b.userData.qRest)
      .multiply(new THREE.Quaternion().setFromAxisAngle(X, (P.bend || 0) / 3 * D2R))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Y, (P.twist || 0) / 3 * D2R))
      .multiply(new THREE.Quaternion().setFromAxisAngle(Z, -(P.side || 0) / 3 * D2R));
  }
  local(J.Neck, X, (P.neck || 0) * 0.6); local(J.Head, X, (P.neck || 0) * 0.4);
  rig.root.updateMatrixWorld(true);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(Y, (P.yaw || 0) * D2R);
  const facing = J.Spine2.getWorldQuaternion(new THREE.Quaternion());
  // shoulder blades lift when the arms go overhead
  for (const [side, n] of [['L', 'LeftShoulder'], ['R', 'RightShoulder']]) {
    const s = P.shrug?.[side] || 0; if (!s) continue;
    local(J[n], Z, side === 'L' ? s : -s); J[n].updateMatrixWorld(true);
  }
  // arms
  for (const [side, up, fo] of [['L', 'LeftArm', 'LeftForeArm'], ['R', 'RightArm', 'RightForeArm']]) {
    const a = W(J[up]);
    let target;
    if (P.rel?.[side]) target = a.clone().add(V(P.rel[side]).applyQuaternion(facing));
    else target = V(P.hands[side]);
    const pole = V(P.elbows?.[side] || [side === 'L' ? 0.3 : -0.3, 0, -1]);
    const r = twoBone(a, target, J[up].userData.len, J[fo].userData.len + 0.05, pole);
    aim(J[up], r.mid.clone().sub(a)); aim(J[fo], r.end.clone().sub(r.mid));
  }
  // legs
  for (const [side, th, sh, ft] of [['L', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['R', 'RightUpLeg', 'RightLeg', 'RightFoot']]) {
    const a = W(J[th]), target = V(P.feet[side]);
    const r = twoBone(a, target, J[th].userData.len, J[sh].userData.len, V(P.knees?.[side] || [0, 0.1, 1]));
    aim(J[th], r.mid.clone().sub(a)); aim(J[sh], r.end.clone().sub(r.mid));
    const mode = P.foot?.[side] || 'flat', shin = r.end.clone().sub(r.mid).normalize();
    if (mode === 'flat') aim(J[ft], new THREE.Vector3(0, -0.35, 1).applyQuaternion(yawQ));
    else if (mode === 'toes') aim(J[ft], new THREE.Vector3(0, -1.6, 1).applyQuaternion(yawQ));        // up on the balls of the feet
    else if (mode === 'up') aim(J[ft], shin.clone().multiplyScalar(-0.15).add(new THREE.Vector3(0, 0.55, 1).applyQuaternion(yawQ)));
    else if (mode === 'down') aim(J[ft], new THREE.Vector3(0, -1, -0.25).applyQuaternion(yawQ));            // lying face down on the toes
    else if (mode === 'point') aim(J[ft], shin.clone().multiplyScalar(1).add(new THREE.Vector3(0, -0.1, 0)));   // top of the foot on the floor
    // 'shin': keep the rest angle to the shin
  }
}
