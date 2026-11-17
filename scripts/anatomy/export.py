import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from classify import *
import scipy.sparse as sp, struct
from segment import build,segment
NV,NN,T=build(float(sys.argv[1]) if len(sys.argv)>1 else 0.004); n=len(NV)
print('verts',n,'faces',len(T))
I=np.concatenate([T[:,0],T[:,1],T[:,2],T[:,1],T[:,2],T[:,0]]); J=np.concatenate([T[:,1],T[:,2],T[:,0],T[:,0],T[:,1],T[:,2]])
A=sp.csr_matrix((np.ones(len(I)),(I,J)),shape=(n,n)); A.data[:]=1
deg=np.asarray(A.sum(1)).ravel(); D=sp.diags(1/np.maximum(deg,1)); M=D@A
for _ in range(2): NN=0.5*NN+0.5*(M@NN); NN/=np.linalg.norm(NN,axis=1,keepdims=True)+1e-12
from landmarks import landmark_labels
useLM=len(sys.argv)>4 and sys.argv[4]=='lm'
r,_s,_c,_M=segment(NV,NN,T,classify(NV),noneSeeds=none_seeds(NV),seedLabels=landmark_labels(NV) if useLM else None,margin=float(sys.argv[3]) if len(sys.argv)>3 else 0.03)
# soft membership: smooth one-hot of own region
H=np.zeros((n,len(REG)))
H[np.arange(n),r]=1
for _ in range(12): H=M@H
H[:,0]=0   # 'none' never glows
r1=r.copy(); H2=H.copy(); H2[np.arange(n),r1]=-1; r2=H2.argmax(1)
m1=H[np.arange(n),r1]; m2=H[np.arange(n),r2]
# faces whose winding disagrees with the smooth normals (clustering folds) -> drop
fnz=np.cross(NV[T[:,1]]-NV[T[:,0]],NV[T[:,2]]-NV[T[:,0]])
agree=np.einsum('ij,ij->i',fnz,NN[T].mean(1))
print('flipped faces',(agree<=0).sum()); T[agree<=0]=T[agree<=0][:,[0,2,1]]
# cavity: positive in grooves
lap=(M@NV)-NV; cav=np.einsum('ij,ij->i',lap,NN)
for _ in range(2): cav=0.5*cav+0.5*(M@cav)
cs=np.percentile(np.abs(cav),97); cav=np.clip(cav/cs,-1,1)
print('cav pct',np.percentile(cav,[5,50,95]))
# depth inside each muscle: 0 on its outline, 1 at its middle (drives the core->edge colour ramp)
from scipy.sparse.csgraph import dijkstra as _dj
EE=np.concatenate([T[:,[0,1]],T[:,[1,2]],T[:,[2,0]]]); LL=np.linalg.norm(NV[EE[:,0]]-NV[EE[:,1]],axis=1)
same=r[EE[:,0]]==r[EE[:,1]]
G=sp.csr_matrix((np.r_[LL[same],LL[same]],(np.r_[EE[same,0],EE[same,1]],np.r_[EE[same,1],EE[same,0]])),shape=(n,n))
bnd=np.unique(EE[~same].ravel())
dd=_dj(G,indices=bnd,min_only=True); dd[~np.isfinite(dd)]=0
depth=np.zeros(n)
for rid in np.unique(r):
    m=r==rid; mx=np.percentile(dd[m],97) if m.sum()>10 else 1
    depth[m]=np.clip(dd[m]/max(mx,1e-4),0,1)
depth[r==0]=0
Gs=sp.csr_matrix((np.ones(2*same.sum()),(np.r_[EE[same,0],EE[same,1]],np.r_[EE[same,1],EE[same,0]])),shape=(n,n)); Gs.data[:]=1
Ds=sp.diags(1/np.maximum(np.asarray(Gs.sum(1)).ravel(),1))@Gs
for _ in range(6): depth=0.5*depth+0.5*(Ds@depth)
depth=np.clip(depth/np.maximum(1e-3,np.percentile(depth[r>0],95)),0,1)**0.8
# write binary
mn=NV.min(0); mx=NV.max(0)
q=np.round((NV-mn)/(mx-mn)*65535).astype('<u2')
nq=np.round(NN*127).astype('<i1')
cq=np.round((cav*0.5+0.5)*255).astype('<u1')
rq=np.stack([r1,r2],1).astype('<u1')
sq=np.round(np.stack([m1,m2],1)*255).astype('<u1')
out=open(sys.argv[2] if len(sys.argv)>2 else 'body.bin','wb')
out.write(b'RBD3'); out.write(struct.pack('<II',n,len(T))); out.write(struct.pack('<6f',*mn,*mx))
dq=np.round(depth*255).astype('<u1')
for arr in (q,nq,rq,sq,cq,dq):
    out.write(arr.tobytes()); pad=(-out.tell())%4; out.write(b'\0'*pad)
out.write(T.astype('<u4').tobytes()); out.close()
np.save('reg.npy',r)
