const fs = require('fs'), vm = require('vm');
const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} } }; ctx.window = ctx; vm.createContext(ctx);
require('./load_atlas')(ctx, 'titan-quest-2-build-calculator-phantomn.html');
['src/socketables.js', 'src/save_phantomn.js', 'src/calc.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
vm.runInContext(`const M={};TQ2.masteries.forEach(m=>M[m.key]=m);const sv=TQ2_SAVES[0];
const B={slots:sv.slots,sk:sv.sk};const st=(mk,s)=>B.sk[mk+"|"+s.n]||{l:0,f:[],m:{}};
Object.assign(TQ2CALC.T,{level:34,rof:false,valor:false,banner:false,rage:0,rampSec:0,situ:{combatRush:false,enemies:0}});
const run=(lab,setup)=>{const o={dmg:TQ2CALC.DUAL_DMG,aff:TQ2CALC.DUAL_AFFIX,sc:TQ2CALC.DUAL_SCOPE};setup&&setup();
 TQ2CALC._gear=null;const R2=TQ2CALC.compute(B,M,st);TQ2CALC._gear=sv.gear.filter(g=>g.slot!==5);const R1=TQ2CALC.compute(B,M,st);
 console.log(lab.padEnd(50),'2 armas',R2.perSec.toFixed(0),'/1558 ',(R2.perSec/1558*100-100).toFixed(1)+'%','| 1 arma',R1.perSec.toFixed(0),'/986 ',(R1.perSec/986*100-100).toFixed(1)+'%');
 TQ2CALC.DUAL_DMG=o.dmg;TQ2CALC.DUAL_AFFIX=o.aff;TQ2CALC.DUAL_SCOPE=o.sc;};
run('atual: afixos das armas x0.6 só com 2 armas');
run('sem escala nenhuma',()=>{TQ2CALC.DUAL_SCOPE=[]});
// variantes que dependem do engine: crítico sem arma, Fire Imbuement
const oc=TQ2CALC.WEAPON_CRIT_IMPORT; run('sem crítico da arma',()=>{TQ2CALC.WEAPON_CRIT_IMPORT=0}); TQ2CALC.WEAPON_CRIT_IMPORT=oc;
TQ2CALC._gear=sv.gear.filter(g=>g.slot!==5);const R=TQ2CALC.compute(B,M,st);
R.steps.forEach(s=>console.log('  ',s.label.slice(0,80).padEnd(81),s.types?Object.entries(s.types).map(([k,v])=>k+' '+v.toFixed(1)).join(' '):''));
console.log('crit',JSON.stringify(R.crit),'inc',JSON.stringify(R.chans));`, ctx);
