// Roda as sugestões de DPS nos saves reais: node tools/test_opt.js <pasta data> <pasta SaveGames>
const fs = require('fs'), vm = require('vm'), path = require('path');
const [dataDir, savesDir] = process.argv.slice(2);
const ctx = { console, TextDecoder, Date, localStorage: { getItem: () => null, setItem: () => {} } }; ctx.window = ctx; vm.createContext(ctx);
require('./load_atlas')(ctx, dataDir);
['src/affix_texts.js', 'src/affix_pool.js', 'src/socketables.js', 'src/monsters.js', 'src/import.js', 'src/calc.js', 'src/optimize.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const ab = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
ctx.SAVES = ['Phantomn_2026-10-11--12-00-22', 'PhantomnEarth_2025-12-23--22-48-16'].map(p => ({
  P: ctx.TQ2IMPORT.readSave(ab(path.join(savesDir, p + '_Data_Player.sav'))), L: ctx.TQ2IMPORT.readSave(ab(path.join(savesDir, p + '_Data_PlayerLocal.sav'))) }));
vm.runInContext(`
const M={};TQ2.masteries.forEach(m=>M[m.key]=m);
SAVES.forEach(({P,L})=>{
  const {build}=TQ2IMPORT.toBuild(P,L,M);
  TQ2_SAVES=[build]; TQ2CALC.T.save=0; TQ2CALC.T.level=build.level; TQ2CALC.T.skill='warfare|Sweeping Strike';
  const B={slots:build.slots.length<2?build.slots.concat(['warfare']):build.slots, sk:build.sk};
  const lim=TQ2CALC.limits(B,(mk,s)=>B.sk[mk+'|'+s.n]||{l:0,f:[],m:{}}); TQ2CALC.T.rage=lim.rage; TQ2CALC.T.amplify=lim.amp;
  const before=JSON.stringify(TQ2CALC.T);
  const o=TQ2OPT.run(B,M);
  console.log('==',build.name,'base',o.base.toFixed(0),'ms',o.ms, o.error||'');
  (o.suggestions||[]).forEach(s=>console.log('  +'+(s.gain*100).toFixed(1)+'%',s.title,'|',s.lines.join(' | ')));
  const g=o.gear||{};
  (g.swaps||[]).slice(0,5).forEach(s=>console.log('  gear +'+(s.gain*100).toFixed(1)+'%',s.item,':',s.out.text,'->',s.inn.stats.map(x=>x.text).join(' · '),'T'+s.inn.tier));
  (g.weapons||[]).forEach(w=>console.log('  arma',w.w.name.padEnd(20),w.base,'dps',w.x.toFixed(0),(w.gain*100).toFixed(1)+'%'));
  (g.values||[]).sort((a,b)=>a.loss-b.loss).slice(0,6).forEach(v=>console.log('  afixo',(v.loss*100).toFixed(1)+'%',v.item,v.text));
  if(JSON.stringify(TQ2CALC.T)!==before){const a=JSON.parse(before),b=TQ2CALC.T;Object.keys(b).forEach(k=>{if(JSON.stringify(a[k])!==JSON.stringify(b[k]))console.log("ESTADO ALTERADO!",k,JSON.stringify(a[k]),JSON.stringify(b[k]))})}
});
`, ctx);
