// Calcula um cenário do Phantomn com chaves escolhidas: node tools/scenario.js '{"rof":false,...}'
const fs = require('fs'), vm = require('vm');
const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} } }; ctx.window = ctx; vm.createContext(ctx);
require('./load_atlas')(ctx, 'titan-quest-2-build-calculator-phantomn.html');
['src/socketables.js', 'src/save_phantomn.js', 'src/calc.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
ctx.OPT = JSON.parse(process.argv[2] || '{}');
vm.runInContext(`const M={};TQ2.masteries.forEach(m=>M[m.key]=m);const sv=TQ2_SAVES[0];
const B={slots:sv.slots,sk:sv.sk};const st=(mk,s)=>B.sk[mk+"|"+s.n]||{l:0,f:[],m:{}};
Object.assign(TQ2CALC.T,{level:34},OPT);
const R=TQ2CALC.compute(B,M,st);const t=R.timing;
console.log("acerto",R.total.toFixed(1),"| DPS",R.perSec.toFixed(0),"(sem limite",R.perSecBurst.toFixed(0)+")","|",R.perSecNote);
console.log("atributos fit/res/cun",R.attr.fitness.toFixed(0),R.attr.resolve.toFixed(0),R.attr.cunning.toFixed(0),"fatores",R.factors.fitness.toFixed(3),R.factors.resolve.toFixed(3),R.factors.cunning.toFixed(3));
console.log("Energy livre",t.E.pool.toFixed(0),"regen",t.E.regen.toFixed(1),"durante",t.regenUse.toFixed(1),"gasto",t.drain.toFixed(1),"up",t.up.toFixed(2));
R.steps.forEach(s=>console.log("  ",s.label.slice(0,95).padEnd(96),s.types?Object.entries(s.types).map(([k,v])=>k+" "+v.toFixed(1)).join(" "):""));
console.log("speed%",t.speedPct,"wspeed",R.weapon&&R.weapon.speed);`, ctx);
