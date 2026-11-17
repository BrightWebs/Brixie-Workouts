"""Sample a Mixamo animation FBX (without skin) into per-frame local joint quaternions."""
import numpy as np, fbx, json, sys, os
from scipy.spatial.transform import Rotation as Rot
S = 1.157 / 178.0
TICKS = 46186158000

def read_anim(path, fps=30):
    nodes, objs, C, gs = fbx.scene(path)
    models = {k: n for k, n in objs.items() if n[0] == 'Model'}
    name = lambda n: n[1][1].split('\x00')[0].replace('mixamorig:', '')
    curve_nodes = {k: n for k, n in objs.items() if n[0] == 'AnimationCurveNode'}
    curves = {k: n for k, n in objs.items() if n[0] == 'AnimationCurve'}
    cn_target = {}   # curve node -> (model, prop)
    cn_curves = {}   # curve node -> {axis: curve}
    for c in C:
        if c[0] == 'OP' and c[1] in curve_nodes and c[2] in models: cn_target[c[1]] = (c[2], c[3])
        if c[0] == 'OP' and c[1] in curves and c[2] in curve_nodes: cn_curves.setdefault(c[2], {})[c[3]] = c[1]
    tmax = 0
    for k in curves:
        kt = fbx.child(curves[k], 'KeyTime')[1][0]; tmax = max(tmax, kt.max() if len(kt) else 0)
    n = int(round(tmax / TICKS * fps)) + 1
    times = np.arange(n) / fps * TICKS
    def sample(cid, default):
        if cid is None: return np.full(n, default)
        cv = curves[cid]; kt = fbx.child(cv, 'KeyTime')[1][0].astype(np.float64); kv = fbx.child(cv, 'KeyValueFloat')[1][0].astype(np.float64)
        return np.interp(times, kt, kv)
    out = {}
    for k, m in models.items():
        p = fbx.props70(m)
        r0 = np.array(p.get('Lcl Rotation', [0, 0, 0])[:3], float); t0 = np.array(p.get('Lcl Translation', [0, 0, 0])[:3], float)
        pre = np.array(p.get('PreRotation', [0, 0, 0])[:3], float)
        rot = np.tile(r0, (n, 1)); tr = np.tile(t0, (n, 1))
        for cn, (mk, prop) in cn_target.items():
            if mk != k: continue
            cc = cn_curves.get(cn, {})
            arr = rot if prop == 'Lcl Rotation' else tr if prop == 'Lcl Translation' else None
            if arr is None: continue
            for i, ax in enumerate('XYZ'): arr[:, i] = sample(cc.get('d|' + ax), arr[0, i])
        q = (Rot.from_euler('xyz', pre, degrees=True) * Rot.from_euler('xyz', rot, degrees=True)).as_quat()
        out[name(m)] = (q, tr * S)
    return n, out

def export(path, rig_json, dst, fps=30):
    rig = json.load(open(rig_json)); n, A = read_anim(path, fps)
    names = [j['name'] for j in rig]
    q = np.zeros((n, len(names), 4)); q[..., 3] = 1
    for i, nm in enumerate(names):
        if nm in A: q[:, i] = A[nm][0]
        else: q[:, i] = rig[i]['q']
    # keep quaternion signs continuous for smooth interpolation
    for f in range(1, n):
        flip = (q[f] * q[f - 1]).sum(-1) < 0; q[f, flip] *= -1
    hips = A['Hips'][1]
    data = {'fps': fps, 'frames': n, 'q': np.round(q.reshape(-1), 4).tolist(), 'hips': np.round(hips.reshape(-1), 4).tolist()}
    json.dump(data, open(dst, 'w'), separators=(',', ':'))
    return n

if __name__ == '__main__':
    src, rigj, outdir = sys.argv[1:4]
    os.makedirs(outdir, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if f.endswith('.fbx'):
            n = export(os.path.join(src, f), rigj, os.path.join(outdir, f[:-4] + '.json'))
            print(f, n, os.path.getsize(os.path.join(outdir, f[:-4] + '.json')))
