// Gera src/save_<nome>.js a partir dos saves do jogo, com o mesmo importador do navegador.
// Uso: node tools/export_save_js.js <prefixo do save (sem _Data_Player.sav)> <saida.js>
const fs = require('fs'), vm = require('vm');
const [prefix, out] = process.argv.slice(2);
const ctx = { console, TextDecoder }; ctx.window = ctx; vm.createContext(ctx);
require('./load_atlas')(ctx, 'titan-quest-2-build-calculator-phantomn.html');
['src/affix_texts.js', 'src/import.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const ab = f => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
ctx.P = ctx.TQ2IMPORT.readSave(ab(prefix + '_Data_Player.sav'));
ctx.L = ctx.TQ2IMPORT.readSave(ab(prefix + '_Data_PlayerLocal.sav'));
vm.runInContext('const M={};TQ2.masteries.forEach(m=>M[m.key]=m);RES=TQ2IMPORT.toBuild(P,L,M);', ctx);
const { build, warn } = ctx.RES;
fs.writeFileSync(out, '// Gerado por tools/export_save_js.js a partir do save do jogo.\nwindow.TQ2_SAVES = window.TQ2_SAVES || [];\nTQ2_SAVES.push(' + JSON.stringify(build, null, 1) + ');\n');
console.log('ok', build.name, build.level, 'itens', build.gear.map(g => g.slot + (g.socket ? '[' + g.socket.id.replace('da_socket_', '') + ' x' + g.socket.stacks + ']' : '')).join(' '), warn.length ? 'avisos: ' + warn.join('; ') : '');
