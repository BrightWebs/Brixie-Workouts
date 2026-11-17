import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from tools_load import *
REG=['none','chest','frontdelt','biceps','triceps','forearms','abs','obliques','quads','adductors','hips','calves','lats','erectors','glutes','hamstrings',
     'sidedelt','reardelt','traps','upperback','serratus','lowerabs','glutemed']
RID={n:i for i,n in enumerate(REG)}
def gapmid(y):
    ys=np.array([0.48,0.5,0.54,0.58,0.62,0.66,0.70,0.74,0.77,0.80])
    gm=np.array([0.16,0.162,0.152,0.145,0.15,0.13,0.12,0.118,0.118,0.125])
    return np.interp(y,ys,gm)
def classify(V):
    X,Y,Z=V.T; ax=np.abs(X); r=np.zeros(len(V),int)
    arm=((Y>0.47)&(Y<0.775)&(ax>gapmid(Y)))|((Y>=0.775)&(Y<0.85)&(ax>np.interp(Y,[0.775,0.85],[0.125,0.15])))
    # arm local centre per slice (per side) for front/back split
    zc_arm=np.zeros(len(V))
    for s in (-1,1):
        for y0 in np.arange(0.46,0.86,0.01):
            m=arm&(np.sign(X)==s)&(Y>=y0)&(Y<y0+0.01)
            if m.any(): zc_arm[m]=(Z[m].max()+Z[m].min())/2
    # torso centre z per slice
    zc=np.zeros(len(V))
    for y0 in np.arange(0.0,1.2,0.01):
        m=(Y>=y0)&(Y<y0+0.01)&~arm
        if m.any(): zc[m]=np.median(Z[m]) if y0<0.55 else (Z[m].max()+Z[m].min())/2
    front=Z>zc
    # --- arms
    r[arm&(Y>=0.72)&(Z>=zc_arm)]=RID['biceps']
    r[arm&(Y>=0.72)&(Z<zc_arm)]=RID['triceps']
    r[arm&(Y>=0.595)&(Y<0.72)]=RID['forearms']
    # shoulders: deltoid cap
    delt=(Y>=0.84)&(Y<0.955)&(ax>np.interp(Y,[0.84,0.88,0.92,0.95],[0.15,0.14,0.125,0.105]))
    delt|=arm&(Y>=0.835)&(ax>0.17)
    # deltoid heads: angle around the shoulder cap centre (front / side / rear)
    dc=np.zeros((len(V),2))
    for sd in (-1,1):
        for y0 in np.arange(0.80,0.97,0.01):
            m=delt&(np.sign(X)==sd)&(Y>=y0)&(Y<y0+0.01)
            if m.any(): dc[m]=[np.median(ax[m]),(Z[m].max()+Z[m].min())/2]
    dang=np.degrees(np.arctan2(Z-dc[:,1],(ax-dc[:,0])+0.025))
    r[delt&(dang>38)]=RID['frontdelt']
    r[delt&(dang<=38)&(dang>=-38)]=RID['sidedelt']
    r[delt&(dang<-38)]=RID['reardelt']
    tor=~arm&~delt
    # --- torso front
    r[tor&front&(Y>=0.785)&(Y<0.915)&(ax<0.145)&((Y>=0.815)|(ax<0.085))]=RID['chest']
    r[tor&front&(Y>=0.722)&(Y<0.80)&(ax<0.06)]=RID['abs']
    r[tor&front&(Y>=0.65)&(Y<0.712)&(ax<0.06)]=RID['lowerabs']
    r[tor&(Y>=0.62)&(((Y<0.785)&(ax>=0.062))|((Y<0.815)&(ax>=0.085)))&(front|(ax>0.085))&(Z>zc-0.03)]=RID['obliques']
    # --- torso back
    bk=tor&~front
    diamond=0.015+np.clip(Y-0.74,0,1)*0.6          # lower/middle trapezius narrows to a point at mid-back
    r[bk&(Y>=0.68)&(Y<0.83)&(ax>0.05)]=RID['lats']
    r[tor&(Y>=0.74)&(Y<0.83)&(ax>0.11)&(Z<zc)]=RID['lats']          # lat wings under the armpit
    r[bk&(Y>=0.795)&(Y<0.885)&(ax>=diamond+0.01)&(ax<0.15)]=RID['upperback']   # rhomboids / teres / infraspinatus
    r[bk&(Y>=0.74)&(Y<0.955)&(ax<np.minimum(diamond,0.13))]=RID['traps']
    r[bk&(Y>=0.885)&(Y<0.955)&(ax<0.13)]=RID['traps']
    r[tor&(Y>=0.90)&(Y<0.975)&(ax>0.035)&(ax<0.11)&(Z<zc+0.02)]=RID['traps']   # upper traps over the shoulder
    r[bk&(Y>=0.63)&(Y<0.73)&(ax>0.008)&(ax<0.055)]=RID['erectors']
    r[bk&(Y>=0.51)&(Y<0.615)&(ax>0.015)&(ax<0.115)]=RID['glutes']
    r[tor&(Y>=0.595)&(Y<0.645)&(ax>0.10)&(Z<zc+0.01)]=RID['glutemed']
    # --- legs (below hip)
    lc=np.zeros(len(V)); lz=np.zeros(len(V))
    for s in (-1,1):
        for y0 in np.arange(0.0,0.62,0.01):
            m=(np.sign(X)==s)&(Y>=y0)&(Y<y0+0.01)&(ax<gapmid(np.full(1,0.5))[0]) if y0>0.46 else (np.sign(X)==s)&(Y>=y0)&(Y<y0+0.01)
            if m.any(): lc[m]=(X[m].max()+X[m].min())/2; lz[m]=(Z[m].max()+Z[m].min())/2
    ang=np.degrees(np.arctan2(np.sign(X)*(X-lc)*-1,Z-lz))  # 0 = front, +90 = medial, 180 = back
    leg=~arm&(Y<0.62)
    thigh=leg&(Y>=0.345)&(Y<0.60)
    r[thigh&(np.abs(ang)<=62)&~((Y>0.52)&(ax<0.045))]=RID['quads']
    r[thigh&(ang>62)&(ang<125)&(Y<0.56)]=RID['adductors']
    r[thigh&(np.abs(ang)>=125)&(Y<0.52)]=RID['hamstrings']
    r[thigh&(ang<-62)&(ang>-125)&(Y<0.56)]=RID['quads']  # outer thigh -> vastus lateralis
    r[leg&front&(Y>=0.60)&(Y<0.64)&(ax>0.04)&(ax<0.12)&~arm]=RID['none']
    r[thigh&(ang>25)&(ang<80)&(Y>=0.48)&(Y<0.565)&(ax>0.035)]=RID['hips']
    r[(Y>0.45)&(Y<0.64)&(ax<0.04)&front]=RID['none']   # mannequin brief bulge stays plain
    shin=leg&(Y>=0.15)&(Y<0.33)
    r[shin&(np.abs(ang)>=95)]=RID['calves']
    global LAST_ANG; LAST_ANG=ang
    return r
def none_seeds(V):
    X,Y,Z=V.T; ax=np.abs(X); s=np.zeros(len(V),bool)
    s|=Y>0.985                                 # head
    s|=(Y>0.955)&(ax<0.035)                    # back of neck
    s|=(Y>0.93)&(ax<0.045)                     # neck
    s|=(Y<0.565)&(ax>0.17)                     # hands
    s|=Y<0.07                                  # feet
    s|=(Y>0.30)&(Y<0.335)&(Z>0.0)              # knee caps
    s|=(Y>0.10)&(Y<0.29)&(np.abs(LAST_ANG)<70)  # front of the shin (not calf)
    s|=(Y>0.47)&(Y<0.6)&(ax<0.03)&(Z>0.0)      # mannequin brief bulge
    s|=(Y>0.47)&(Y<0.6)&(ax<0.012)             # between legs
    return s
COL=np.array([[.75,.75,.75],[1,.2,.2],[1,.6,0],[1,1,0],[.6,0,1],[0,1,1],[1,0,1],[.3,1,.3],[0,.4,1],[1,.5,.6],[.6,.3,0],[0,.7,.5],[.2,.2,1],[.9,.9,.4],[1,.3,.6],[.4,.9,1]])
