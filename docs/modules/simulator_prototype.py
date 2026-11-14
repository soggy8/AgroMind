"""THROWAWAY REFERENCE, not part of the app. Do not import it.

The prototype used while designing the simulator (see docs/modules/simulator.md section 4).
It shows working FAO-56 Penman-Monteith and Hargreaves ET0, the Kc curve, the daily
water balance and the yield rules, run one calendar year at a time on the weather sample.
Delete it once backend/app/modules/simulator/engine has tests that cover the same ground.

Run from backend/:  python3 ../docs/modules/simulator_prototype.py
"""
import csv, math, statistics as st, sys
sys.path.insert(0, '.')
from app.modules.simulator.parameters import CROPS, SOILS
rows=[]
with open('../data/samples/power_daily_story_county_ia_2001_2025.csv') as f:
    for line in f:
        if line.startswith('YEAR'): break
    for r in csv.reader(f): rows.append((int(r[0]),int(r[1]))+tuple(float(x) for x in r[2:]))
LAT=math.radians(42.03); Z=310
def ra(doy):
    dr=1+0.033*math.cos(2*math.pi*doy/365); d=0.409*math.sin(2*math.pi*doy/365-1.39)
    ws=math.acos(-math.tan(LAT)*math.tan(d))
    return 24*60/math.pi*0.0820*dr*(ws*math.sin(LAT)*math.sin(d)+math.cos(LAT)*math.cos(d)*math.sin(ws))
es=lambda t:0.6108*math.exp(17.27*t/(t+237.3))
def hs(doy,tx,tn,*_): return max(0,0.0023*((tx+tn)/2+17.8)*math.sqrt(max(tx-tn,0))*0.408*ra(doy))
def pm(doy,tx,tn,rs,rh,u2):
    t=(tx+tn)/2; P=101.3*((293-0.0065*Z)/293)**5.26; g=0.000665*P
    D=4098*es(t)/(t+237.3)**2; e_s=(es(tx)+es(tn))/2; ea=rh/100*e_s
    Ra=ra(doy); rso=(0.75+2e-5*Z)*Ra; rns=0.77*rs
    rnl=4.903e-9*((tx+273.16)**4+(tn+273.16)**4)/2*(0.34-0.14*math.sqrt(ea))*(1.35*min(rs/rso,1)-0.35)
    rn=rns-rnl
    return max(0,(0.408*D*rn+g*900/(t+273)*u2*(e_s-ea))/(D+g*(1+0.34*u2)))
def kc_at(c,d):
    i,dv,m,l=c.stages; a,b,e=c.kc
    if d<i: return a
    if d<i+dv: return a+(b-a)*(d-i)/dv
    if d<i+dv+m: return b
    return b+(e-b)*(d-i-dv-m)/l
def run(cid,dT,dR,et,soil,zr,hl,tcrit=None,irr=False):
    c=CROPS[cid]; s=SOILS[soil]; out=[]; tc=tcrit or c.heat_tcrit_c
    for y in range(2001,2026):
        TAW=s.awc_mm_per_m*zr; Dr=0.0; etc=eta=irrmm=hdd=0
        for (yy,doy,tx,tn,p,rs,rh,u2) in rows:
            if yy!=y: continue
            tx+=dT; tn+=dT; p*=1+dR/100
            e0=et(doy,tx,tn,rs,rh,u2); d=doy-c.plant_doy
            if 0<=d<c.season_days:
                k=kc_at(c,d); RAW=c.depletion_p*TAW
                if irr and Dr>RAW: irrmm+=Dr; Dr=0
                ks=1 if Dr<=RAW else max(0,(TAW-Dr)/((1-c.depletion_p)*TAW))
                etc+=k*e0; a=ks*k*e0; eta+=a
                i,dv,m,l=c.stages
                if i+dv<=d<i+dv+m and tx>tc: hdd+=tx-tc
            else: a=0.3*e0*max(0,(TAW-Dr)/TAW)
            Dr=min(TAW,max(0,Dr-p+a))
        wf=max(0,1-c.ky*(1-eta/etc)); hf=1-min(0.6,hl*hdd)
        out.append((wf*hf,etc,eta,irrmm,hdd,wf,hf))
    v=sorted(o[0] for o in out)
    return [round(v[2],2),round(st.median(v),2),round(v[-3],2)],'ETc',round(st.mean(o[1] for o in out)),'irr',round(st.mean(o[3] for o in out)),'<0.7:',sum(o[0]<0.7 for o in out),'2012: y=%.2f wf=%.2f hf=%.2f'%(out[11][0],out[11][5],out[11][6]),'2020 %.2f'%out[19][0]
for name,et in (('HS',hs),('PM',pm)):
    print(name,'May-Sep ET0', round(st.mean(sum(et(r[1],r[2],r[3],r[5],r[6],r[7]) for r in rows if r[0]==y and 121<=r[1]<=273) for y in range(2001,2026))))
print('rain: wettest/driest May-Sep', sorted((round(sum(r[4] for r in rows if r[0]==y and 121<=r[1]<=273)),y) for y in range(2001,2026))[:4])
for cfg in [('loam',1.2,0.02),('silty_clay_loam',1.5,0.02),('silt_loam',1.5,0.01)]:
    print('--',cfg)
    for cid in ['maize','soybean','oats']:
        print(cid,'base',run(cid,0,0,pm,*cfg)); print(cid,'+2/-20',run(cid,2,-20,pm,*cfg))
print('maize +2/-20 irrigated',run('maize',2,-20,pm,'silt_loam',1.5,0.01,irr=True))
print('maize +4/-30',run('maize',4,-30,pm,'silt_loam',1.5,0.01))
