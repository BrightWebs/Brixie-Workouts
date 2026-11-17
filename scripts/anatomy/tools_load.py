import json,struct,numpy as np
def load(p):
    b=open(p,'rb').read(); L=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+L])
    bin_=b[20+L+8:]
    def acc(i):
        a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
        off=bv.get('byteOffset',0)+a.get('byteOffset',0)
        dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]
        n={'VEC3':3,'SCALAR':1,'VEC2':2}[a['type']]
        return np.frombuffer(bin_,dt,a['count']*n,off).reshape(-1,n) if n>1 else np.frombuffer(bin_,dt,a['count'],off)
    pr=j['meshes'][0]['primitives'][0]
    return acc(pr['attributes']['POSITION']).astype(np.float64), acc(pr['indices']).reshape(-1,3).astype(np.int64)
def fnormals(V,F):
    n=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]); return n/ (np.linalg.norm(n,axis=1,keepdims=True)+1e-12)
def render(V,F,yaw=0,W=420,H=760,col=None):
    c,s=np.cos(yaw),np.sin(yaw); R=np.array([[c,0,s],[0,1,0],[-s,0,c]])
    P=V@R.T; N=fnormals(P,F)
    cen=P[F].mean(1); sc=H/1.25
    x=((cen[:,0])*sc+W/2).astype(int); y=(H-20-cen[:,1]*sc).astype(int); z=cen[:,2]
    img=np.ones((H,W,3))*0.12; zb=np.full((H,W),-1e9)
    shade=np.clip(0.25+0.75*np.clip(N@np.array([0.3,0.5,0.8])/1.0,0,1),0,1)
    order=np.argsort(z)
    for dx in (0,1):
      for dy in (0,1):
        xx=np.clip(x+dx,0,W-1); yy=np.clip(y+dy,0,H-1)
        xs,ys=xx[order],yy[order]
        cl=(col[order] if col is not None else np.ones((len(order),3))*0.8)*shade[order,None]
        img[ys,xs]=cl
    return img
