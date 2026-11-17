"""Minimal binary FBX (7.x) reader: enough for Mixamo characters and animations.
Returns a tree of nodes: (name, props, children)."""
import struct, zlib
import numpy as np

def _read_props(b, o, n):
    props = []
    for _ in range(n):
        t = chr(b[o]); o += 1
        if t == 'Y': props.append(struct.unpack_from('<h', b, o)[0]); o += 2
        elif t == 'C': props.append(bool(b[o])); o += 1
        elif t == 'I': props.append(struct.unpack_from('<i', b, o)[0]); o += 4
        elif t == 'F': props.append(struct.unpack_from('<f', b, o)[0]); o += 4
        elif t == 'D': props.append(struct.unpack_from('<d', b, o)[0]); o += 8
        elif t == 'L': props.append(struct.unpack_from('<q', b, o)[0]); o += 8
        elif t in 'fdlib':
            ln, enc, clen = struct.unpack_from('<III', b, o); o += 12
            raw = b[o:o + clen]; o += clen
            if enc: raw = zlib.decompress(raw)
            dt = {'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1'}[t]
            props.append(np.frombuffer(raw, dt, ln).copy())
        elif t in 'SR':
            ln = struct.unpack_from('<I', b, o)[0]; o += 4
            raw = b[o:o + ln]; o += ln
            props.append(raw.decode('utf8', 'replace') if t == 'S' else raw)
        else: raise ValueError('prop type ' + t)
    return props, o

def _read_node(b, o, wide):
    if wide: end, nprops, plen = struct.unpack_from('<QQQ', b, o); o += 24
    else: end, nprops, plen = struct.unpack_from('<III', b, o); o += 12
    nlen = b[o]; o += 1
    if end == 0: return None, o
    name = b[o:o + nlen].decode(); o += nlen
    props, o2 = _read_props(b, o, nprops); o = o2
    children = []
    sentinel = 25 if wide else 13
    while o < end:
        if end - o == sentinel: o = end; break
        c, o = _read_node(b, o, wide)
        if c is None: break
        children.append(c)
    return (name, props, children), end

def load(path):
    b = open(path, 'rb').read()
    assert b[:20] == b'Kaydara FBX Binary  ', 'not a binary FBX'
    ver = struct.unpack_from('<I', b, 23)[0]; wide = ver >= 7500
    o = 27; nodes = []
    while o < len(b):
        n, o = _read_node(b, o, wide)
        if n is None: break
        nodes.append(n)
    return nodes

def find(nodes, name):
    return [n for n in nodes if n[0] == name]
def child(n, name):
    for c in n[2]:
        if c[0] == name: return c
    return None
def props70(n):
    out = {}
    p = child(n, 'Properties70')
    if p:
        for c in p[2]:
            if c[0] == 'P': out[c[1][0]] = c[1][4:]
    return out

def scene(path):
    """objects by id, connections list (child, parent, prop)"""
    nodes = load(path)
    objs = {}
    for o in child(find(nodes, 'Objects')[0], '') or []: pass
    O = find(nodes, 'Objects')[0]
    for n in O[2]: objs[n[1][0]] = n
    C = []
    for c in find(nodes, 'Connections')[0][2]:
        C.append((c[1][0], c[1][1], c[1][2], c[1][3] if len(c[1]) > 3 else None))
    gs = find(nodes, 'GlobalSettings')
    return nodes, objs, C, props70(gs[0]) if gs else {}
