"""Skeleton + skin weights from the Mixamo auto-rig (FBX) of our mannequin."""
import numpy as np, fbx, json
from scipy.spatial.transform import Rotation as Rot
S = 1.157 / 178.0   # cm -> model units

def euler_m(deg, order='xyz'):
    return Rot.from_euler(order, deg, degrees=True).as_matrix()

def read_rig(path):
    nodes, objs, C, gs = fbx.scene(path)
    models = {k: n for k, n in objs.items() if n[0] == 'Model' and n[1][2] == 'LimbNode'}
    name = lambda n: n[1][1].split('\x00')[0].replace('mixamorig:', '')
    parent = {}
    for c in C:
        if c[0] == 'OO' and c[1] in models and c[2] in models: parent[c[1]] = c[2]
    # order: parents first
    order = []
    def visit(k):
        if k in order: return
        if k in parent: visit(parent[k])
        order.append(k)
    for k in models: visit(k)
    idx = {k: i for i, k in enumerate(order)}
    joints = []
    for k in order:
        p = fbx.props70(models[k])
        t = np.array(p.get('Lcl Translation', [0, 0, 0])[:3], float)
        r = np.array(p.get('Lcl Rotation', [0, 0, 0])[:3], float)
        pre = np.array(p.get('PreRotation', [0, 0, 0])[:3], float)
        R = euler_m(pre) @ euler_m(r)
        joints.append({'name': name(models[k]), 'parent': idx.get(parent.get(k), -1), 't': t * S, 'R': R, 'pre': pre})
    # skin
    geo = [n for n in objs.values() if n[0] == 'Geometry'][0]
    V = fbx.child(geo, 'Vertices')[1][0].reshape(-1, 3) * S
    clusters = {k: n for k, n in objs.items() if n[0] == 'Deformer' and n[1][2] == 'Cluster'}
    bone_of = {}
    for c in C:
        if c[0] == 'OO' and c[1] in models and c[2] in clusters: bone_of[c[2]] = c[1]
    W = np.zeros((len(V), len(order)), np.float32)
    links = {}
    for k, n in clusters.items():
        ix = fbx.child(n, 'Indexes'); wt = fbx.child(n, 'Weights')
        b = idx[bone_of[k]]
        links[b] = fbx.child(n, 'TransformLink')[1][0].reshape(4, 4).T
        if ix is None: continue
        W[ix[1][0], b] += wt[1][0].astype(np.float32)
    return joints, V, W, links

def world_mats(joints):
    G = []
    for j in joints:
        L = np.eye(4); L[:3, :3] = j['R']; L[:3, 3] = j['t']
        G.append(L if j['parent'] < 0 else G[j['parent']] @ L)
    return G
