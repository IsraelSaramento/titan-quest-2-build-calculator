// Calcula todas as skills principais com fórmula para uma build de teste em cada par de masteries.
const fs = require('fs'), vm = require('vm');
const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} } }; ctx.window = ctx; vm.createContext(ctx);
require('./load_atlas')(ctx, 'titan-quest-2-build-calculator-phantomn.html');
['src/socketables.js', 'src/calc.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
vm.runInContext(`const M={};TQ2.masteries.forEach(m=>M[m.key]=m);
TQ2_SAVES=[];TQ2CALC.T.save=0;TQ2CALC.T.level=34;TQ2CALC.T.gear=false;
let bad=0;
Object.keys(TQ2CALC.SKILLS).forEach(k=>{
  const [mk,sn]=k.split('|');const s=M[mk]&&M[mk].skills.find(x=>x.n===sn);
  if(!s){console.log('SEM SKILL NO ATLAS',k);bad++;return;}
  const B={slots:[mk,mk==='warfare'?'earth':'warfare'],sk:{[k]:{l:12,f:[],m:{}}}};const st=(a,b)=>B.sk[a+'|'+b.n]||{l:0,f:[],m:{}};
  TQ2CALC.T.skill=k;const R=TQ2CALC.compute(B,M,st);
  const ok=R.total>0&&isFinite(R.perSec);if(!ok)bad++;
  console.log((ok?'ok ':'ERRO ')+k.padEnd(28),'acerto',R.total.toFixed(0).padStart(5),'DPS',R.perSec.toFixed(0).padStart(5),'|',Object.keys(R.final||{}).join('/'),'|',(R.perSecNote||'').slice(0,90));
});console.log('problemas',bad);`, ctx);
