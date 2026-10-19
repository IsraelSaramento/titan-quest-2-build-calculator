import struct,sys
sys.path.insert(0,__import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from namemap import names
def load(path):
    a=open(path,'rb').read()
    N=names(path)
    i=(a.find(b'/JsonData') if b'/JsonData' in a[:400] else a.find(b'/Game'))-4
    n=struct.unpack_from('<i',a,i)[0];p=i+4+n
    v=struct.unpack_from('<I'+'i'*14,a,p)
    ec,eo,ic,io=v[7],v[8],v[9],v[10]
    imps=[]
    for k in range(ic):
        cp,cpn,cn,cnn,outer,on,onn,opt=struct.unpack_from('<iiiiiiii',a,io+k*32)
        imps.append((N[cn],outer,N[on]+('_%d'%(onn-1) if onn else '')))
    es=(v[12]-eo)//ec if v[12]>eo else 96
    exps=[]
    for k in range(ec):
        f=struct.unpack_from('<iiiiii',a,eo+k*es)
        exps.append((f, N[f[4]], a[eo+k*es:eo+k*es+es]))
    return a,N,imps,exps,es
if __name__=='__main__':
    a,N,imps,exps,es=load(sys.argv[1])
    print('export size',es)
    for k,(f,nm,raw) in enumerate(exps):
        q=struct.unpack_from('<'+'i'*(es//4),raw)
        print(k,nm,q[:4],q[6:16])
