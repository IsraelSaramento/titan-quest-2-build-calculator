// Varre personagens × skills principais e procura erros, NaN e valores estranhos.
const fs = require('fs'), vm = require('vm'), path = require('path');
const [dataDir, savesDir] = process.argv.slice(2);
const ctx = { console, TextDecoder, localStorage: { getItem: () => null, setItem: () => {} } }; ctx.window = ctx; vm.createContext(ctx);
require('./load_atlas')(ctx, dataDir);
['src/affix_texts.js', 'src/socketables.js', 'src/monsters.js', 'src/import.js', 'src/calc.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const ab = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
ctx.SAVES = ['Phantomn_2026-10-11--12-00-22', 'PhantomnEarth_2025-12-23--22-48-16', 'Phantomn_2025-08-15--20-34-43'].map(p => ({
  P: ctx.TQ2IMPORT.readSave(ab(path.join(savesDir, p + '_Data_Player.sav'))), L: ctx.TQ2IMPORT.readSave(ab(path.join(savesDir, p + '_Data_PlayerLocal.sav'))) }));
vm.runInContext(`
const M={};TQ2.masteries.forEach(m=>M[m.key]=m);
let problems=0, runs=0;
SAVES.forEach(({P,L})=>{
  const {build}=TQ2IMPORT.toBuild(P,L,M);
  TQ2_SAVES=[build]; TQ2CALC.T.save=0; TQ2CALC.T.level=build.level; TQ2CALC.T.rage=99; TQ2CALC.T.amplify=99;
  const B={slots:build.slots.length<2?build.slots.concat(['storm']):build.slots, sk:build.sk};
  const st=(mk,s)=>B.sk[mk+'|'+s.n]||{l:0,f:[],m:{}};
  const mains=[]; TQ2.masteries.forEach(m=>m.skills.forEach(s=>{ if(s.k==='active'&&(/Main/.test(s.tags)||TQ2CALC.SKILLS[m.key+'|'+s.n])) mains.push(m.key+'|'+s.n); }));
  mains.forEach(k=>{
    TQ2CALC.T.skill=k; runs++;
    try{
      const R=TQ2CALC.compute(B,M,st); TQ2CALC._last=R;
      const rel=TQ2CALC.relevance(B,M,st,TQ2.masteries.map(m=>m.key));
      if(!R.error){
        const bad=!isFinite(R.total)||R.total<=0||Object.values(R.final).some(x=>!isFinite(x));
        if(bad){problems++;console.log('VALOR',build.name,k,R.total);}
        if(k==='warfare|Sweeping Strike'||k==='earth|Ring of Flame') console.log(build.name.padEnd(15),k.padEnd(28),'acerto',R.total.toFixed(1),'rage',TQ2CALC.T.rage,'amp',TQ2CALC.T.amplify,'tipos',Object.keys(R.final).join('/'),'rel',rel.size);
      }
    }catch(e){problems++;console.log('ERRO',build.name,k,String(e.stack).slice(0,300));}
  });
});
console.log('execuções',runs,'problemas',problems);
`, ctx);
