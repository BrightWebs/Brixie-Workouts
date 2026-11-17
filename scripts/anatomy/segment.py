import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from classify import *
SEEDFRAC=0.0
import scipy.sparse as sp
from scipy.sparse.csgraph import dijkstra
RAW=os.environ.get('RAW_GLB','raw.glb')
def build(cell=0.004):
    V,F=load(RAW)
    fn=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]); VN=np.zeros_like(V)
    for k in range(3): np.add.at(VN,F[:,k],fn)
    k=np.floor(V/cell).astype(np.int64); k-=k.min(0)
    key=(k[:,0]*100000+k[:,1])*100000+k[:,2]
    u,inv=np.unique(key,return_inverse=True); cnt=np.bincount(inv)
    NV=np.stack([np.bincount(inv,V[:,i])/cnt for i in range(3)],1)
    NN=np.stack([np.bincount(inv,VN[:,i]) for i in range(3)],1); NN/=np.linalg.norm(NN,axis=1,keepdims=True)+1e-12
    T=inv[F]; ok=(T[:,0]!=T[:,1])&(T[:,1]!=T[:,2])&(T[:,0]!=T[:,2]); T=T[ok]
    _,idx=np.unique(np.sort(T,1),axis=0,return_index=True); T=T[np.sort(idx)]
    return NV,NN,T
def adjacency(NV,T):
    n=len(NV)
    E=np.concatenate([T[:,[0,1]],T[:,[1,2]],T[:,[2,0]]]); E=np.sort(E,1); E=np.unique(E,axis=0)
    L=np.linalg.norm(NV[E[:,0]]-NV[E[:,1]],axis=1)
    A=sp.csr_matrix((np.ones(len(E)*2),(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),shape=(n,n))
    return E,L,A
def cavity(NV,NN,A,iters=3):
    deg=np.asarray(A.sum(1)).ravel(); M=sp.diags(1/np.maximum(deg,1))@A
    lap=(M@NV)-NV; c=np.einsum('ij,ij->i',lap,NN)
    # normalise by local edge length scale
    c=c/0.004
    for _ in range(iters): c=0.5*c+0.5*(M@c)
    return c,M
def segment(NV,NN,T,rough,alpha=6.0,margin=0.02,noneSeeds=None,beta=1.2,seedLabels=None):
    n=len(NV); E,L,A=adjacency(NV,T); c,M=cavity(NV,NN,A)
    cs=np.percentile(c,95); cn=np.clip(c/cs,0,None)          # 0 on flats/ridges, ~1 in grooves
    # distance to rough boundary
    bd=rough[E[:,0]]!=rough[E[:,1]]; bverts=np.unique(E[bd].ravel())
    G=sp.csr_matrix((np.r_[L,L],(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),shape=(n,n))
    d=dijkstra(G,indices=bverts,min_only=True)
    if seedLabels is not None:
        seeds=seedLabels>=0; rough=np.where(seeds,seedLabels,0)
    else:
     seeds=np.zeros(n,bool)
     for rid in np.unique(rough):
        m=rough==rid
        if rid==0 and noneSeeds is not None: seeds|=noneSeeds; continue
        mg=max(min(margin,0.45*d[m].max()),SEEDFRAC*d[m].max())
        seeds|=m&(d>mg)
    # coarse shape: muscle bellies are broad convex bumps -> cheap to flood across; flats/hollows cost more
    cc=c.copy()
    for _ in range(40): cc=M@cc
    cc=np.clip(cc/np.std(cc),-1.5,1.5)
    ce=np.maximum(cc[E[:,0]],cc[E[:,1]])
    w=L*np.exp(alpha*np.maximum(cn[E[:,0]],cn[E[:,1]]))*np.exp(beta*ce)
    W=sp.csr_matrix((np.r_[w,w],(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),shape=(n,n))
    sidx=np.where(seeds)[0]
    dd,pred,src=dijkstra(W,indices=sidx,min_only=True,return_predecessors=True)
    lab=rough[src]
    # tidy ragged fronts where no groove decided the border: neighbour-majority vote
    K=len(REG); Aw=A.tocsr()
    for _ in range(12):
        Hh=np.zeros((n,K)); Hh[np.arange(n),lab]=1
        Hh=Aw@Hh+Hh*1.5
        lab=Hh.argmax(1)
    return lab,seeds,c,M
