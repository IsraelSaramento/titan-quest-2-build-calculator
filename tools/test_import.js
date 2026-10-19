// node tools/test_import.js <pasta data do artifact> <prefixo do save>
const fs = require('fs'), vm = require('vm'), path = require('path');
const [dataDir, prefix] = process.argv.slice(2);
const ctx = { console, TextDecoder, localStorage: { getItem: () => null, setItem: () => {} } }; ctx.window = ctx; vm.createContext(ctx);
['core', 'earth', 'warfare', 'rogue', 'storm', 'forge', 'spirit'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dataDir, f + '.js'), 'utf8'), ctx));
['src/affix_texts.js', 'src/import.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const ab = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
ctx.P = ctx.TQ2IMPORT.readSave(ab(prefix + '_Data_Player.sav'));
ctx.L = ctx.TQ2IMPORT.readSave(ab(prefix + '_Data_PlayerLocal.sav'));
vm.runInContext(`const M={};TQ2.masteries.forEach(m=>M[m.key]=m);
const {build,warn}=TQ2IMPORT.toBuild(P,L,M);
console.log(JSON.stringify({name:build.name,level:build.level,ap:build.attributePoints,slots:build.slots,sk:build.sk},null,0));
build.gear.forEach(g=>console.log(g.slot,g.item,g.BaseAttackDamage||'',g.stats.map(s=>s.text).join(' | ')));
console.log('WARN',warn);`, ctx);
