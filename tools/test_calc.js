// Testa o motor da calculadora no Node: node tools/test_calc.js <pasta data do artifact>
const fs = require('fs'), vm = require('vm'), path = require('path');
const dataDir = process.argv[2];
const ctx = { window: {}, console, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx; vm.createContext(ctx);
['core', 'earth', 'warfare'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dataDir, f + '.js'), 'utf8'), ctx));
vm.runInContext(fs.readFileSync('src/save_phantomn.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('src/calc.js', 'utf8'), ctx);
vm.runInContext(`
const M={};TQ2.masteries.forEach(m=>M[m.key]=m);
const sv=TQ2_SAVES[0];
const B={slots:sv.slots,sk:sv.sk};
const st=(mk,s)=>B.sk[mk+'|'+s.n]||{l:0,f:[],m:{}};
TQ2CALC.T.level=sv.level;
const R=TQ2CALC.compute(B,M,st);
const f=o=>Object.entries(o).map(([t,x])=>t+'='+x.toFixed(1)).join(' ');
R.steps.forEach(s=>console.log(s.label.padEnd(70).slice(0,70),'|',s.types?f(s.types):''));
console.log('TOTAL',R.total.toFixed(1),'min',R.min.toFixed(1),'max',R.max.toFixed(1),'perSec',R.perSec&&R.perSec.toFixed(0),R.perSecNote);
console.log('chans',JSON.stringify(R.chans));
console.log('attr',JSON.stringify(R.attr));
R.effects.forEach(x=>console.log((x.a.ok?'OK ':x.a.cond?'~  ':'-- ')+(x.e.src||'').padEnd(34).slice(0,34),TQ2CALC.shortEff(x.e).padEnd(34).slice(0,34),'|',x.a.why||''));
`, ctx);
