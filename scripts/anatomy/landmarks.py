import numpy as np
from classify import RID, none_seeds, classify
# (region, view, a, b): view 'F' front / 'B' back -> (|X|, Y);  'S' side -> (Y, Z)   [metres, model space]
LM = [
 ('chest','F',0.07,0.865),('chest','F',0.10,0.85),('chest','F',0.04,0.88),
 ('frontdelt','F',0.155,0.89),('sidedelt','S',0.885,0.0),('reardelt','B',0.16,0.88),
 ('biceps','F',0.19,0.785),('biceps','F',0.18,0.76),('triceps','B',0.19,0.78),('triceps','B',0.222,0.80),('triceps','B',0.218,0.76),('triceps','B',0.20,0.80),('triceps','B',0.20,0.745),('triceps','B',0.19,0.725),
 ('forearms','F',0.19,0.665),('forearms','B',0.20,0.66),('forearms','F',0.175,0.635),('forearms','B',0.20,0.625),('forearms','F',0.21,0.69),
 ('abs','F',0.03,0.785),('abs','F',0.025,0.805),('abs','F',0.045,0.80),('abs','F',0.03,0.745),('lowerabs','F',0.03,0.675),('lowerabs','F',0.025,0.655),
 ('obliques','F',0.095,0.70),('obliques','S',0.68,0.0),('serratus','S',0.795,0.035),
 ('quads','F',0.08,0.42),('quads','F',0.115,0.47),('quads','F',0.085,0.50),('quads','S',0.45,0.0),('quads','F',0.075,0.53),('quads','F',0.105,0.525),('quads','F',0.125,0.50),('quads','S',0.52,0.0),
 ('hips','F',0.07,0.565),('adductors','F',0.035,0.45),
 ('traps','B',0.06,0.935),('traps','B',0.035,0.86),('traps','B',0.02,0.80),
 ('upperback','B',0.105,0.855),('upperback','B',0.13,0.83),
 ('lats','B',0.10,0.765),('lats','B',0.075,0.73),('lats','B',0.10,0.70),('lats','B',0.12,0.73),('lats','B',0.125,0.78),('lats','S',0.79,-0.06),
 ('erectors','B',0.025,0.68),('erectors','B',0.022,0.705),
 ('glutes','B',0.065,0.57),('glutes','B',0.09,0.55),('glutes','B',0.06,0.605),('glutes','B',0.095,0.595),('glutemed','S',0.635,-0.03),('erectors','B',0.02,0.668),
 ('hamstrings','B',0.07,0.42),('hamstrings','B',0.06,0.47),('calves','B',0.07,0.22),('calves','B',0.09,0.24),
]
def landmark_labels(V, radius=0.014):
    X,Y,Z=V.T; ax=np.abs(X); lab=np.full(len(V),-1)
    ns=none_seeds(V); lab[ns]=0
    for reg,view,a,b in LM:
        for sd in (-1,1):
            if view in 'FB':
                m=(np.abs(ax-a)<0.006)&(np.abs(Y-b)<0.006)&(np.sign(X)==sd)
                if not m.any(): print('miss',reg,a,b); continue
                idx=np.where(m)[0]; i=idx[np.argmax(Z[idx])] if view=='F' else idx[np.argmin(Z[idx])]
            else:
                torso=~((a<0.86)&(ax>np.interp(a,[0.5,0.62,0.7,0.78,0.86],[0.15,0.15,0.13,0.125,0.15])))
                m=(np.abs(Y-a)<0.006)&(np.abs(Z-b)<0.008)&(np.sign(X)==sd)&torso
                if not m.any(): print('miss',reg,a,b); continue
                idx=np.where(m)[0]; i=idx[np.argmax(ax[idx])]
            near=np.linalg.norm(V-V[i],axis=1)<radius
            lab[near]=RID[reg]
    return lab

# ---- muscle heads inside each region, so each head shades separately (its own core and rim) ----
HEADS = {
 'chest': [('F',0.07,0.895),('F',0.075,0.85)],                                # clavicular / sternal pec
 'abs': [('F',0.025,0.80),('F',0.025,0.775),('F',0.025,0.745)],                 # upper three rows of rectus
 'lowerabs': [('F',0.025,0.705),('F',0.025,0.67)],
 'quads': [('F',0.125,0.46),('F',0.08,0.47),('F',0.06,0.375)],                  # vastus lateralis, rectus femoris, vastus medialis
 'hamstrings': [('B',0.095,0.42),('B',0.05,0.42)],                              # biceps femoris, semitendinosus
 'calves': [('B',0.06,0.24),('B',0.105,0.24)],                                  # medial, lateral gastrocnemius
 'triceps': [('B',0.175,0.79),('B',0.215,0.80)],                                # long, lateral head
 'forearms': [('F',0.185,0.67),('B',0.205,0.665)],                              # flexors, extensors
 'traps': [('B',0.06,0.935),('B',0.03,0.84)],                                   # upper, middle/lower
 'upperback': [('B',0.10,0.86),('B',0.135,0.82)],                               # infraspinatus, teres
 'obliques': [('F',0.10,0.72),('F',0.105,0.66)],
}
def pick(V, view, a, b, sd):
    X,Y,Z=V.T; ax=np.abs(X)
    m=(np.abs(ax-a)<0.006)&(np.abs(Y-b)<0.006)&(np.sign(X)==sd)
    if not m.any(): return None
    idx=np.where(m)[0]; return idx[np.argmax(Z[idx])] if view=='F' else idx[np.argmin(Z[idx])]
def heads(V, T, r, weightfn):
    """split each region into heads by flooding from head seeds along the sculpted grooves"""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import dijkstra
    n=len(V); part=r.astype(np.int64)*8
    E=np.unique(np.sort(np.r_[T[:,[0,1]],T[:,[1,2]],T[:,[2,0]]],1),axis=0)
    w=weightfn(E)
    for reg,specs in HEADS.items():
        rid=RID[reg]; inr=r==rid
        if inr.sum()<10: continue
        ok=inr[E[:,0]]&inr[E[:,1]]; e=E[ok]; ww=w[ok]
        G=sp.csr_matrix((np.r_[ww,ww],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(n,n))
        src=[]; lab=[]
        for k,(view,a,b) in enumerate(specs):
            for sd in (-1,1):
                i=pick(V,view,a,b,sd)
                if i is not None and inr[i]:
                    near=np.where(inr&(np.linalg.norm(V-V[i],axis=1)<0.01))[0]; src+=list(near); lab+=[k]*len(near)
        if not src: continue
        src=np.array(src); lab=np.array(lab)
        d,_,s=dijkstra(G,indices=src,min_only=True,return_predecessors=True)
        got=inr&np.isfinite(d)
        lk=dict(zip(src,lab)); part[got]=rid*8+np.array([lk[x] for x in s[got]])
    return part
