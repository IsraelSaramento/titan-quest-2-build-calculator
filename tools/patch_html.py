"""Gera o titan-quest-2-build-calculator-phantomn.html com a calculadora de dano real.

Lê src/atlas_base.html (cópia do Atlas original) e insere:
- src/save_*.js (builds lidas dos saves), src/calc.js (motor) e src/calc_ui.js (interface);
- a aba "Dano real" e os avisos de impacto no planejador.
Uso: python tools/patch_html.py
"""
import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')


def rep(h, old, new, count=1):
    n = h.count(old)
    if n != count:
        raise SystemExit(f'Âncora encontrada {n}x (esperado {count}): {old[:70]!r}')
    return h.replace(old, new)


CSS = r"""
/* Calculadora de dano real */
.calc{display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:920px){.calc{grid-template-columns:minmax(0,1fr)}}
.cpanel{background:var(--panel);border:1px solid var(--line);padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.cpanel h3{margin:10px 0 2px}
.cpanel h3:first-child{margin-top:0}
.fld{display:flex;flex-direction:column;gap:3px;font-size:.85rem;color:var(--muted)}
.fld input,.fld select{width:100%;box-sizing:border-box}
.tgl{display:flex;gap:8px;align-items:flex-start;font-size:.9rem;cursor:pointer}
.tgl input{margin-top:4px;accent-color:var(--war)}
.tgl small{display:block;color:var(--muted);font-size:.78rem}
.rng{display:flex;flex-direction:column;gap:2px;font-size:.88rem}
.rng input{width:100%;accent-color:var(--war)}
.cres{min-width:0;display:flex;flex-direction:column;gap:6px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.kpi{background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--war);padding:12px 14px;display:flex;flex-direction:column;gap:2px;min-width:0}
.kpi span{font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--bronze)}
.kpi b{font-family:var(--display);font-weight:400;font-size:2rem;line-height:1.1;font-variant-numeric:tabular-nums}
.kpi b.sm{font-size:1.25rem}
.kpi small{color:var(--muted);font-size:.8rem}
table.steps td.num,table.steps th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.steps tr.modrow td{color:var(--muted);font-size:.82rem;background:var(--node)}
.tchipd{display:inline-block;font-size:.78rem;padding:1px 7px;border-radius:9px;border:1px solid var(--line);white-space:nowrap;font-variant-numeric:tabular-nums}
.t-fire{border-color:#c2410c;color:#c2410c}.t-strike{border-color:#78716c;color:#78716c}.t-pierce{border-color:#a16207;color:#a16207}
.t-cold{border-color:#0369a1;color:#0369a1}.t-lightning{border-color:#7c3aed;color:#7c3aed}.t-poison{border-color:#4d7c0f;color:#4d7c0f}.t-vitality{border-color:#9f1239;color:#9f1239}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .t-fire{color:#fb923c;border-color:#fb923c}:root:not([data-theme="light"]) .t-strike{color:#d6d3d1;border-color:#d6d3d1}:root:not([data-theme="light"]) .t-pierce{color:#facc15;border-color:#facc15}}
:root[data-theme="dark"] .t-fire{color:#fb923c;border-color:#fb923c}
.est{font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--bronze);border:1px solid var(--bronze);border-radius:6px;padding:0 4px;white-space:nowrap}
.egrp{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--line)}
.egrp summary,.rules summary{cursor:pointer;padding:8px 12px;font-family:var(--display);letter-spacing:.06em;color:var(--bronze)}
.egrp.ok{border-left-color:var(--good)}.egrp.no{border-left-color:var(--bad)}.egrp.cond{border-left-color:var(--bronze)}
.egrp table{font-size:.85rem}.egrp td{padding:6px 10px}
.egrp td.src{font-weight:700;width:34%}.egrp td.why{color:var(--muted);width:38%}
.egrp .tblwrap{border:0;border-top:1px solid var(--line)}
.rules{background:var(--panel);border:1px solid var(--line)}
.rules ul{padding:0 14px 12px}
.impact{margin:0 10px 8px 46px;font-size:.82rem;padding:4px 8px;border-left:3px solid var(--line);background:var(--node);line-height:1.35}
@media (max-width:600px){.impact{margin-left:10px}}
.impact small{display:block;color:var(--muted)}
.impact.ok{border-left-color:var(--good)}.impact.ok>span{color:var(--good)}
.impact.no{border-left-color:var(--bad)}.impact.no>span{color:var(--bad)}
.impact.cond{border-left-color:var(--bronze)}.impact.main{border-left-color:var(--war)}
.detail .impact{margin:10px 0 0}
.cbar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:end;background:var(--panel);border:1px solid var(--line);padding:10px 12px;margin-bottom:14px}
.cbar label{display:flex;flex-direction:column;gap:3px;font-size:.8rem;color:var(--muted)}
.cbar code,.hint code{font-size:.78rem;word-break:break-all}
/* Bordas azuis: o que afeta a skill principal */
:root{--rel:#1d5fd1;--rel-soft:color-mix(in srgb,var(--rel) 12%,var(--panel))}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--rel:#6aa6ff}}
:root[data-theme="dark"]{--rel:#6aa6ff}
.rlegend{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:.8rem;color:var(--muted)}
.rl{display:inline-block;width:18px;height:12px;border:2px solid var(--rel);border-radius:3px;vertical-align:middle}
.rl.main{border-color:var(--war);border-width:3px}.rl.part{border-style:dashed}
.node.rel-aff{border-color:var(--rel);box-shadow:0 0 0 2px var(--rel);background:var(--rel-soft)}
.node.rel-part{border-color:var(--rel);border-style:dashed}
.node.rel-main{border-color:var(--war);box-shadow:0 0 0 3px var(--war)}
.brow.rel-aff{box-shadow:0 0 0 2px var(--rel);border-color:var(--rel)}
.brow.rel-part{outline:2px dashed var(--rel);outline-offset:-1px}
.brow.rel-main{box-shadow:0 0 0 3px var(--war)}
.feat.rel-sub,.mod.rel-sub{box-shadow:inset 3px 0 0 var(--rel);border-color:var(--rel)}
.detail li.rel-sub{border-left:3px solid var(--rel);padding-left:8px}
#treeMain .cbar{margin-bottom:10px}
/* Monstros */
.mons{background:var(--panel);border:1px solid var(--line);padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.mhead2{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.mhead2 h3{margin:0;border:0;padding:0}
.mgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (max-width:760px){.mgrid{grid-template-columns:1fr}}
.mcol{display:flex;flex-direction:column;gap:6px;min-width:0}
.mcls{font-family:var(--display);letter-spacing:.12em;text-transform:uppercase;font-size:.78rem;color:var(--bronze);border-bottom:1px solid var(--line);padding-bottom:3px}
.mcls.boss{color:var(--war)}
.mon{background:var(--node);border:1px solid var(--line);padding:7px 9px;display:flex;flex-direction:column;gap:2px;min-width:0}
.mon small{color:var(--muted);font-size:.76rem}
.mnum{display:flex;gap:12px;font-variant-numeric:tabular-nums;font-weight:700}
.mnum small{font-weight:400;margin-left:2px}
/* Sugestões de DPS */
.opt{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--rel);padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.opt.gear{border-left-color:var(--bronze)}
.opt h4{margin:4px 0 0;font-family:var(--display);letter-spacing:.06em;color:var(--bronze);font-weight:400}
.optok{padding:10px 12px;background:var(--node);border:1px solid var(--line);border-left:3px solid var(--good)}
.sug{display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:var(--node);border:1px solid var(--line);min-width:0}
.sughead{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}
.sughead b{flex:1 1 220px;min-width:0}
.sug ul{margin:0;padding-left:18px;font-size:.88rem}
.gain{font-weight:700;color:var(--good);font-variant-numeric:tabular-nums;white-space:nowrap}
.kpis.sm .kpi{border-top-color:var(--rel);padding:8px 12px}
.kpis.sm .kpi b{font-size:1.5rem}.kpis.sm .kpi b.sm{font-size:1.05rem}
.kpi em{font-style:normal;font-weight:700}
em.up,td.up{color:var(--good)}em.down,td.down{color:var(--bad)}
table.steps tr.best td{background:color-mix(in srgb,var(--good) 12%,transparent);font-weight:700}
.swaps li{line-height:1.45}
.afx{display:inline-block;font-size:.8rem;padding:1px 7px;margin:2px 2px 2px 0;border-radius:9px;border:1px solid var(--line)}
.afx.ok{border-color:var(--good)}.afx.no{color:var(--muted)}
/* Voltar ao topo */
#toTop{position:fixed;right:calc(16px + env(safe-area-inset-right, 0px));bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:50;width:44px;height:44px;border-radius:50%;
  border:1px solid var(--line);background:var(--panel);color:inherit;font-size:1.3rem;line-height:1;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center}
#toTop[hidden]{display:none}
.kpi.energy{border-top-color:var(--good)}.kpi.energy.low{border-top-color:var(--bad)}
.kpi.energy details summary{cursor:pointer;font-size:.78rem;color:var(--muted)}
#toTop:hover{border-color:var(--rel);color:var(--rel)}
"""

SECTION = """
<section id="pageCalc" hidden>
  <div class="mhead"><h2>Dano real</h2><p>Escolha a skill principal e veja o que realmente entra no dano, com as regras lidas nos arquivos do jogo.</p></div>
  <div id="calcBody"></div>
</section>
"""


TOTOP = """<button id="toTop" type="button" aria-label="Voltar ao topo" title="Voltar ao topo" hidden>&#8593;</button>
<script>
(function(){const b=document.getElementById('toTop');const f=()=>{b.hidden=window.scrollY<400;};
window.addEventListener('scroll',f,{passive:true});f();b.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});})();
</script>
"""


def main():
    build(True, 'titan-quest-2-build-calculator-phantomn.html')
    build(False, 'titan-quest-2-build-calculator.html')


def build(with_saves, name):
    h = open(os.path.join(SRC, 'atlas_base.html'), encoding='utf-8').read()
    # nome do projeto
    h = rep(h, '<title>Atlas de Masteries TQ2</title>', '<title>Titan Quest 2 Build Calculator</title>')
    h = rep(h, '<h1>Titan Quest II <small>· Masteries</small></h1>', '<h1>Titan Quest II <small>· Build Calculator</small></h1>')
    # CSS e aba
    h = rep(h, '</style>\n\n<div class="wrap">', CSS + '</style>\n\n<div class="wrap">')
    h = rep(h, '<button id="vBuild" aria-pressed="false">Montar build</button>',
            '<button id="vBuild" aria-pressed="false">Montar build</button>\n    <button id="vCalc" aria-pressed="false">Dano real</button>')
    h = rep(h, '<footer>', SECTION + TOTOP + '\n<footer>')
    h = rep(h, 'Dados lidos no jogo', 'Dados lidos no jogo; a aba Dano real usa fórmulas extraídas dos arquivos do jogo')
    # textos de modifiers corrigidos com as fórmulas do jogo
    h = rep(h, '["Ramp Up", 5, 1, "Over 3s of channeling, up to +10% Damage and radius; +1 Energy/s. Requires Whirlwind"]',
            '["Ramp Up", 5, 1, "Over 3s of channeling, up to 10% more Damage and 10% increased radius per rank; +1 Energy/s per rank. Requires Whirlwind"]')
    h = rep(h, '["Rage Gain", 5, 1, "Gain Rage on hit (once per 0.8s); 1% more Damage per Rage; +2 Energy"]',
            '["Rage Gain", 5, 1, "Gain Rage on hit (once every 0.9s, 0.1s faster per rank); 1% more Damage per Rage per rank; +2 Energy per rank"]')
    h = rep(h, '["Scorching Weapon", 1, 1, "While active, 100% of Weapon Damage converted to Fire and 1.5% increased Fire Weapon Damage per Amplify; +3 Amplify on use. Incompatible with Permanency"]',
            '["Scorching Weapon", 2, 1, "While active, 100% of Weapon Damage converted to Fire; increased Fire Weapon Damage per Amplify: 1.5% at rank 1, 2.5% at rank 2; +3 Amplify on use per rank. Incompatible with Permanency"]')
    h = rep(h, '["Fire Imbuement", 2, 2, "+Fire Weapon Damage (+1 at level 1); 30% of Weapon Damage converted to Fire; +30 Energy reserved"]',
            '["Fire Imbuement", 2, 2, "+Fire Weapon Damage (10% of the level\'s weapon damage at rank 1, 15% at rank 2; about 13 at level 34); 30% of Weapon Damage converted to Fire per rank; +30 Energy reserved per rank"]')
    # capacity: Whirlwind custa 1 (no nível 17 o limite é 10 e o save usa Rage Gain 5 + Ramp Up 4 + Whirlwind)
    h = rep(h, '["Whirlwind", 1, 2,', '["Whirlwind", 1, 1,')
    # bordas azuis: árvore, detalhe e planejador
    h = rep(h, 'function renderTree(){\n  const m=M[cur];', "function renderTree(){\n  calcRefresh();\n  $('treeMain').innerHTML=mainBarHTML('tmSkill');wireMainBar('tmSkill',renderTree);\n  const m=M[cur];")
    h = rep(h, '<div class="legend">', '<div id="treeMain"></div>\n  <div class="legend">')
    h = rep(h, '<button class="node ${k}" data-i="${i}">', '<button class="node ${k} ${relCls(cur,s)}" data-i="${i}" title="${esc(relTitle(cur,s))}">')
    h = rep(h, 's.feats.map(([n,e])=>`<li><b>${esc(n)}</b><br>${esc(e)}</li>`)', 's.feats.map(([n,e])=>`<li class="${relSub(cur,s,\'feats\',n)}"><b>${esc(n)}</b><br>${esc(e)}</li>`)')
    h = rep(h, '<h3>Modifiers (${s.mods.length})</h3><ul class="list">${s.mods.map(([n,r,c,e])=>`<li><b>', '<h3>Modifiers (${s.mods.length})</h3><ul class="list">${s.mods.map(([n,r,c,e])=>`<li class="${relSub(cur,s,\'mods\',n)}"><b>')
    h = rep(h, '<div class="brow${v.l?\' on\':\'\'}"', '<div class="brow${v.l?\' on\':\'\'} ${relCls(mk,s)}"')
    h = rep(h, '<button class="feat" data-feat="${esc(n)}"', '<button class="feat ${relSub(mk,s,\'feats\',n)}" data-feat="${esc(n)}"')
    h = rep(h, '<div class="mod${rk?\' on\':\'\'}" data-mod=', '<div class="mod${rk?\' on\':\'\'} ${relSub(mk,s,\'mods\',n)}" data-mod=')
    # importar personagem no planejador
    h = rep(h, '<button class="btn ghost" id="bClear">Limpar build</button>',
            '<button class="btn" id="bImp" type="button">Importar personagem (.sav)</button><input type="file" id="bImpFile" accept=".sav" multiple hidden>\n'
            '    <button class="btn ghost" id="bClear">Limpar build</button>')
    h = rep(h, '<span class="hint">A build fica salva neste navegador.</span>',
            '<span class="hint" id="bImpMsg">A build fica salva neste navegador. Para importar, escolha os arquivos <b>_Data_Player.sav</b> e <b>_Data_PlayerLocal.sav</b> do personagem em <code>%LOCALAPPDATA%\\TQ2\\Saved\\SaveGames</code>.</span>')
    h = rep(h, "$('vBuild').onclick=()=>setView('build');", "wireImport('bImp','bImpFile','bImpMsg',renderAll);$('vBuild').onclick=()=>setView('build');")
    # scripts novos antes do script principal
    blocks = []
    extra = ['masteries_fix.js', 'affix_texts.js', 'affix_pool.js', 'socketables.js', 'monsters.js', 'import.js', 'calc.js', 'optimize.js', 'calc_ui.js']
    saves = sorted(glob.glob(os.path.join(SRC, 'save_*.js'))) if with_saves else []
    for f in saves + [os.path.join(SRC, x) for x in extra]:
        code = open(f, encoding='utf-8').read().replace('</script', '<\\/script')
        blocks.append('<script>\n' + code + '\n</script>\n')
    h = rep(h, '<script>\nconst ORDER=', ''.join(blocks) + '<script>\nconst ORDER=')
    # navegação
    h = rep(h, "[['vTree','tree'],['vTable','table'],['vBuild','build']]", "[['vTree','tree'],['vTable','table'],['vBuild','build'],['vCalc','calc']]")
    h = rep(h, "$('pageBuild').hidden=v!=='build';$('picker').hidden=v==='build';",
            "$('pageBuild').hidden=v!=='build';$('pageCalc').hidden=v!=='calc';$('picker').hidden=v==='build'||v==='calc';")
    h = rep(h, "else if(view==='table')renderTable();else renderBuild();", "else if(view==='table')renderTable();else if(view==='calc')renderCalc();else renderBuild();")
    h = rep(h, "$('vBuild').onclick=()=>setView('build');", "$('vBuild').onclick=()=>setView('build');$('vCalc').onclick=()=>setView('calc');")
    # avisos de impacto no planejador e na árvore
    h = rep(h, "let h='';\n  B.slots.forEach(mk=>{", "calcRefresh();\n  let h=calcBarHTML();\n  B.slots.forEach(mk=>{")
    h = rep(h, '${badge(s)}${stepper(id,v.l,MAXLV)}</div>`;', '${badge(s)}${stepper(id,v.l,maxLv(s))}</div>${v.l?impactHTML(mk,s):\'\'}`;')
    # nível máximo de cada passiva (arquivo do jogo); ativas continuam até 20
    h = rep(h, "wireStep(row.querySelector('.bhead .step'),MAXLV,", "wireStep(row.querySelector('.bhead .step'),maxLv(s),")
    h = rep(h, 'const MAXLV=20;', "const MAXLV=20;\nconst maxLv=s=>s.k==='passive'&&s.mx?s.mx:MAXLV;")
    h = rep(h, '<input id="pv" type="number" min="1" max="${MAXLV}" value="10">', '<input id="pv" type="number" min="1" max="${maxLv(s)}" value="${maxLv(s)}">')
    h = rep(h, 'const l=Math.max(1,Math.min(MAXLV,+pv.value||1));', 'const l=Math.max(1,Math.min(maxLv(s),+pv.value||1));')
    h = rep(h, "h+=`<h3>Feats${s.u?` · liberam nos níveis ${s.u.replace('/',' e ')}`:' · níveis a conferir'}</h3>",
            "h+=`<h3>Feats${s.u?` · liberam nos níveis ${s.u.replace('/',' e ')} (nível máximo ${maxLv(s)})`:' · níveis a conferir'}</h3>")
    h = rep(h, "$('bEdit').innerHTML=h;", "$('bEdit').innerHTML=h;wireCalcBar();")
    h = rep(h, 'if(s.note)h+=`<div class="note">${esc(s.note)}</div>`;\n  $(\'detail\').innerHTML=h;',
            'if(s.note)h+=`<div class="note">${esc(s.note)}</div>`;\n  h+=treeImpactHTML(cur,s);\n  $(\'detail\').innerHTML=h;')
    out = os.path.join(ROOT, name)
    open(out, 'w', encoding='utf-8').write(h)
    print('ok', out, len(h))


if __name__ == '__main__':
    main()
