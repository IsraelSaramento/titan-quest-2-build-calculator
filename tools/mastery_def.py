import struct,sys,glob,os,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from uasset import load
D='C:/Users/israe/AppData/Local/Temp/claude/F--Dev-IA-titan-quest-2/6769aac8-fcc8-4553-b7ea-751ad0c40a59/scratchpad/extract/mjson/TQ2/Saved/JsonDataCache/Game/TQ2/masteries/'
def frags(d,o):
    props=[];zero=False;idx=0
    while True:
        f=struct.unpack_from('<H',d,o)[0];o+=2
        skip=f&0x7f;hz=(f>>7)&1;last=(f>>8)&1;val=f>>9
        idx+=skip
        props+= [idx+i for i in range(val)]; idx+=val
        zero|=bool(hz)
        if last:break
    zm=[]
    if zero:
        n=(len(props)+7)//8
        # mask size: bytes for count of values... UE uses ceil(num/8) rounded to 1,2,4? keep simple
        bits=int.from_bytes(d[o:o+n],'little');o+=n
        zm=[(bits>>i)&1 for i in range(len(props))]
    else: zm=[0]*len(props)
    return [p for p,z in zip(props,zm) if not z],o
def parse(m):
    p=D+'da_mastery_%s.uasset'%m
    a,N,imps,exps,es=load(p)
    u=open(p[:-6]+'uexp','rb').read();hs=len(a)
    def ref(i):
        if i<0:return imps[-i-1][2]
        return 'E%d'%(i-1) if i else None
    data=[]
    for k,(f,nm,raw) in enumerate(exps):
        q=struct.unpack_from('<'+'i'*24,raw)
        data.append((nm,q[3],u[q[9]-hs:q[9]-hs+q[7]]))
    res={'tiers':[]}
    def i32(d,o):return struct.unpack_from('<i',d,o)[0],o+4
    def arr(d,o):
        n,o=i32(d,o);v=[]
        for _ in range(n):x,o=i32(d,o);v.append(x)
        return v,o
    exp={}
    for k,(nm,outer,d) in enumerate(data):
        if nm=='TQ2MasteryActiveAbilityDescription':
            ps,o=frags(d,0);r={}
            for pi in ps:
                if pi==0: r['p0']=struct.unpack_from('<iii',d,o);r['p0n']=N[r['p0'][1]] if 0<=r['p0'][1]<len(N) else None;o+=12
                elif pi==1: x,o=i32(d,o);r['ability']=ref(x)
                else: r['p%d'%pi]=d[o:].hex();break
            exp[k]=('A',outer-1,r)
        elif nm=='TQ2MasteryPassiveAbilityDescription':
            ps,o=frags(d,0);r={}
            for pi in ps:
                if pi==0: r['p0']=struct.unpack_from('<iii',d,o);r['p0n']=N[r['p0'][1]] if 0<=r['p0'][1]<len(N) else None;o+=12
                elif pi==2: r['flag']=d[o];o+=1
                elif pi==3: x,o=i32(d,o);r['passive']=ref(x)
                elif pi==4: v,o=arr(d,o);r['extra']=[ref(x) for x in v]
                elif pi==6:
                    n,o=i32(d,o);fs=[]
                    for _ in range(n):
                        fp,o=frags(d,o);ff={}
                        for fi in fp:
                            if fi==0:x,o=i32(d,o);ff['eff']=ref(x)
                            elif fi==1:ff['app']=d[o];o+=1
                            elif fi==2:v,o=arr(d,o);ff['extra']=[ref(x) for x in v]
                        fs.append(ff)
                    r['feats']=fs
                elif pi==7: r['p7'],o=i32(d,o)
                else: r['p%d'%pi]='?';break
            exp[k]=('P',outer-1,r)
        elif nm=='TQ2MasteryTierDescription':
            ps,o=frags(d,0);r={'props':ps}
            lists=[]
            for pi in ps:
                v,o=arr(d,o);lists.append((pi,v))
            r['lists']=lists
            exp[k]=('T',outer-1,r)
    tiers=[k for k in exp if exp[k][0]=='T']
    out=[]
    for ti,k in enumerate(tiers):
        r=exp[k][2];L=dict(r['lists'])
        t={'actives':[(exp[x-1][2]['ability'],exp[x-1][2].get('p0n')) for x in L.get(1,[])],
           'passives':[exp[x-1][2] for x in L.get(2,[])],
           'mods':[ref(x) for x in L.get(3,[])],'p4':[ref(x) for x in L.get(4,[])],'props':r['props']}
        out.append(t)
    return out
if __name__=='__main__':
    for m in sys.argv[1:]:
        for ti,t in enumerate(parse(m)):
            print('TIER',ti,t['props'],'actives',t['actives'])
            for p in t['passives']: print('   ',p.get('passive'),'p7',p.get('p7'),[ (f.get('eff'),f.get('app')) for f in p.get('feats',[])])
            print('   mods',len(t['mods']),'p4',t['p4'][:20])
