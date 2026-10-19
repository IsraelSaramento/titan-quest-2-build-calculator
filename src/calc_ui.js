/* Interface da calculadora de dano real e avisos de impacto no planejador.
   Usa as variáveis globais do script principal do Atlas (M, MS, B, st, $, esc, decorate, saveB, renderBuild). */
let REL = new Map();
function calcRefresh() {
  try { TQ2CALC._last = TQ2CALC.compute(B, M, st); } catch (e) { console.error(e); TQ2CALC._last = null; }
  try { REL = TQ2CALC.relevance(B, M, st, MS.map(m => m.key)); } catch (e) { console.error(e); REL = new Map(); }
  return TQ2CALC._last;
}
/* Classes de borda azul */
function relCls(mk, s) { const r = REL.get(mk + '|' + s.n); return r ? 'rel-' + r.cls : ''; }
function relTitle(mk, s) {
  const r = REL.get(mk + '|' + s.n); if (!r) return '';
  const nm = TQ2CALC.T.skill.split('|')[1];
  if (r.cls === 'main') return 'Skill principal';
  const parts = [...r.r.feats, ...r.r.mods];
  return r.cls === 'aff' ? `Afeta o dano de ${nm}` + (parts.length ? ` (também: ${parts.join(', ')})` : '') : `Só ${parts.join(', ')} afeta o dano de ${nm}`;
}
function relSub(mk, s, kind, n) { const r = REL.get(mk + '|' + s.n); return r && r.r[kind].has(n) ? 'rel-sub' : ''; }
/* Seletor da skill principal: todas as ativas "Main" das masteries */
function mainSkillOptions() {
  const keys = new Set(Object.keys(TQ2CALC.SKILLS));
  return MS.map(m => {
    const list = m.skills.filter(s => s.k === 'active' && (/\bMain\b/.test(s.tags) || keys.has(m.key + '|' + s.n)));
    if (!list.length) return '';
    return `<optgroup label="${esc(m.name)}">${list.map(s => { const k = m.key + '|' + s.n; return `<option value="${esc(k)}" ${k === TQ2CALC.T.skill ? 'selected' : ''}>${esc(s.n)}${keys.has(k) ? '' : ' · só destaque'}</option>`; }).join('')}</optgroup>`;
  }).join('');
}
function mainBarHTML(id, extra) {
  return `<div class="cbar"><label for="${id}">Skill principal de dano<select id="${id}">${mainSkillOptions()}</select></label>
    <span class="rlegend"><i class="rl main"></i>principal <i class="rl aff"></i>afeta o dano <i class="rl part"></i>só algum feat ou modifier afeta</span>${extra || ''}</div>`;
}
function wireMainBar(id, after) {
  const s = $(id); if (!s) return;
  s.onchange = () => { TQ2CALC.T.skill = s.value; TQ2CALC.save(); after(); };
}
/* Monstros de exemplo: os mais resistentes ao tipo de dano final, por classe */
function monsterPicks(R, shuffle) {
  const pre = R.preRes, tot = Object.values(pre).reduce((a, x) => a + x, 0) || 1;
  const score = mo => Object.entries(pre).reduce((a, [t, x]) => a + (x / tot) * (mo.r[t] || 0), 0);
  const out = {};
  ['normal', 'elite', 'boss'].forEach(c => {
    const xs = (window.TQ2_MONSTERS || []).filter(m => m.c === c).map(m => ({ m, s: score(m) })).sort((a, b) => b.s - a.s);
    let pool = xs.slice(0, shuffle ? Math.min(10, xs.length) : 3);
    if (shuffle) pool = pool.sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => b.s - a.s);
    out[c] = pool;
  });
  return out;
}
function monstersHTML(R, shuffle) {
  if (!window.TQ2_MONSTERS || !R.preRes) return '';
  const picks = monsterPicks(R, shuffle);
  const dmgVs = mo => Object.entries(R.preRes).reduce((a, [t, x]) => a + x * (1 - (mo.r[t] || 0) / 100), 0);
  const types = Object.keys(R.preRes).map(t => TQ2CALC.TNAME[t]).join('/');
  const label = { normal: 'Normal', elite: 'Elite', boss: 'Boss' };
  let h = `<div class="mons"><div class="mhead2"><h3>Contra os monstros mais resistentes a ${esc(types)}</h3><button class="btn ghost" id="cMonShuffle" type="button">Sortear outros</button></div>
    <p class="hint">Resistências base do jogo. Sem resistência, o seu dano é ${n0(R.total)} por acerto${R.perSec ? ' e ' + n0(R.perSec) + ' por segundo' : ''}. Armadura física não entra.</p><div class="mgrid">`;
  ['normal', 'elite', 'boss'].forEach(c => {
    h += `<div class="mcol"><div class="mcls ${c}">${label[c]}</div>`;
    picks[c].forEach(({ m }) => {
      const d = dmgVs(m), ratio = d / (Object.values(R.preRes).reduce((a, x) => a + x, 0) || 1);
      const resTxt = Object.keys(R.preRes).map(t => `${TQ2CALC.TNAME[t]} ${m.r[t] || 0}%`).join(', ');
      h += `<div class="mon"><b>${esc(m.n)}</b><small>${esc(m.f)} · ${resTxt}</small>
        <div class="mnum"><span>${n0(d)}<small>/acerto</small></span>${R.perSec ? `<span>${n0(R.perSec * ratio)}<small>/s</small></span>` : ''}</div></div>`;
    });
    h += `</div>`;
  });
  return h + `</div></div>`;
}
/* Importar personagem dos arquivos .sav */
function wireImport(btn, input, msg, after) {
  const b = $(btn), i = $(input); if (!b || !i) return;
  b.onclick = () => i.click();
  i.onchange = async () => {
    const out = $(msg);
    try {
      const { build, warn } = await TQ2IMPORT.fromFiles(i.files, M);
      build.imported = true;
      const list = TQ2IMPORT.load().filter(x => x.name !== build.name); list.push(build); TQ2IMPORT.store(list);
      window.TQ2_SAVES = (window.TQ2_SAVES || []).filter(x => !(x.imported && x.name === build.name)); TQ2_SAVES.push(build);
      loadSave(TQ2_SAVES.length - 1);
      if (out) out.textContent = `${build.name} (nível ${build.level}) importado.` + (warn.length ? ' Não reconhecido: ' + warn.join('; ') : '');
      after && after();
    } catch (e) { if (out) out.textContent = e.message || String(e); }
    i.value = '';
  };
}
TQ2IMPORT.init();
const CALC_SKILLS = () => Object.keys(TQ2CALC.SKILLS).filter(k => B.slots.includes(k.split('|')[0]));
function calcMaxRage() { return TQ2CALC.limits(B, st).rage; }
function calcMaxAmp() { return TQ2CALC.limits(B, st).amp; }
const n1 = x => (Math.round(x * 10) / 10).toLocaleString('pt-BR');
const n0 = x => Math.round(x).toLocaleString('pt-BR');

function impactHTML(mk, s) {
  const r = TQ2CALC.impact(B, M, st, mk, s);
  if (!r) return '';
  const icon = { ok: '✓', no: '✗', cond: '~', main: '★' }[r.cls];
  return `<div class="impact ${r.cls}" title="${esc(r.detail || '')}"><span aria-hidden="true">${icon}</span> ${esc(r.text)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</div>`;
}
function treeImpactHTML(mk, s) {
  if (!B.slots.includes(mk) || !st(mk, s).l) return '';
  calcRefresh();
  return impactHTML(mk, s);
}
function calcBarHTML() { return mainBarHTML('cbSkill', '<button class="btn ghost" id="cbOpen" type="button">Ver cálculo completo</button>'); }
function wireCalcBar() {
  wireMainBar('cbSkill', renderBuild);
  const o = $('cbOpen'); if (o) o.onclick = () => setView('calc');
}

function loadSave(i) {
  const sv = TQ2_SAVES[i]; if (!sv) return;
  const slots = sv.slots.slice(0, 2);
  TQ2CALC.T.autoSlot = null;
  if (slots.length < 2) { const k = MS.map(m => m.key).find(k => !slots.includes(k)); slots.push(k); TQ2CALC.T.autoSlot = k; }
  B = { slots, sk: JSON.parse(JSON.stringify(sv.sk)) };
  saveB();
  TQ2CALC.T.save = i; TQ2CALC.T.level = sv.level; TQ2CALC.T.rageAuto = true; TQ2CALC.T.rage = calcMaxRage(); TQ2CALC.T.amplify = calcMaxAmp();
  TQ2CALC.save();
}

/* Nível/modifiers de uma skill da build pela chave "mastery|nome" */
function lvOf(k) {
  const [mk, n] = k.split('|'); const s = M[mk] && M[mk].skills.find(x => x.n === n);
  return s && B.slots.includes(mk) ? st(mk, s) : { l: 0, f: [], m: {} };
}
/* Chaves e contadores da situação do combate: só o que a build usa */
function energyKPI(R) {
  const t = R.timing; if (!t) return '';
  const E = t.E, ok = t.up >= 0.999;
  return `<div class="kpi energy ${ok ? '' : 'low'}"><span>Energy</span><b class="sm">${ok ? 'Sustenta' : Math.round(t.up * 100) + '% do tempo'}</b>
    <small>Máxima ${n0(E.max)}, reservada ${n0(E.reserved)}, livre ${n0(E.pool)}. Regenera ${n1(E.regen)}/s${t.exhaust ? ` (${n1(t.regenUse)}/s usando a skill: Exhaust)` : ''}. A skill gasta ${n1(t.drain)}/s${isFinite(t.empty) ? `; a Energy livre acaba em ${n1(t.empty)}s` : ''}.</small>
    ${E.resList.length ? `<details><summary>Reservas</summary><small>${esc(E.resList.join(' · '))}</small></details>` : ''}</div>`;
}
function situHTML(R, tg, rng, maxR, maxA) {
  const T = TQ2CALC.T, main = lvOf(T.skill), h = [];
  if (lvOf('earth|Ring of Flame').l) h.push(tg('cRof', T.rof, 'Ring of Flame ativo', 'Buff de 6s; necessário para o Scorching Weapon'));
  if (lvOf('warfare|Valor').l) h.push(tg('cValor', T.valor, 'Valor ativo', 'Buff de 6s'));
  if (lvOf('warfare|War Banner').l) h.push(tg('cBanner', T.banner, 'Dentro do War Banner'));
  if (main.m['Deadly Reach']) h.push(tg('cEdge', T.edge, 'Inimigo na borda (Deadly Reach)'));
  if (main.m['Consume Overwhelm']) h.push(tg('cOw', T.overwhelm, 'Overwhelm cheio'));
  if (R && R.effects && R.effects.some(x => x.e.gear && /Crab/i.test(x.e.text || ''))) h.push(tg('cCrab', T.vsCrab, 'Contra Crabs (colar)'));
  if (maxR) {
    const ra = TQ2CALC._rageAuto || { n: 0 };
    h.push(tg('cRageAuto', T.rageAuto !== false, `Rage sustentada automática: ${ra.n}`, esc(ra.why || '')));
    if (T.rageAuto === false) h.push(rng('cRage', T.rage, maxR, 'Rage (manual)', 1));
  }
  if (maxA) h.push(rng('cAmp', T.amplify, maxA, 'Amplify do Ring of Flame', 1));
  if (main.m['Ramp Up']) h.push(rng('cRamp', T.rampSec, 3, 'Segundos girando (Ramp Up)', 0.25));
  h.push(`<label class="fld">Duração da luta (s) <small>para a conta de Energy</small><input type="number" id="cFight" min="5" max="300" step="5" value="${T.fight || 30}"></label>`);
  let sits = [];
  try { sits = TQ2CALC.situations(B, M, st); } catch (e) { console.error(e); }
  _sits = sits;
  sits.forEach((si, i) => {
    const v = TQ2CALC.situVal(si), hint = si.srcs.join(', ');
    h.push(si.type === 'count' ? rng('cSi' + i, v, si.max, esc(si.label) + ` <small>(${esc(hint)})</small>`, 1) : tg('cSi' + i, v, esc(si.label), esc(hint)));
  });
  return h.join('') || '<p class="hint">Nada nesta build depende da situação do combate.</p>';
}
let _sits = [];

function renderCalc() {
  const T = TQ2CALC.T;
  const R = calcRefresh();
  const sv = TQ2CALC.curSave();
  const maxR = calcMaxRage(), maxA = calcMaxAmp();
  const tg = (id, on, label, hint) => `<label class="tgl"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  const rng = (id, v, max, label, step) => `<label class="rng"><span>${label} <b id="${id}V">${v}</b></span><input type="range" id="${id}" min="0" max="${max}" step="${step || 1}" value="${v}"></label>`;
  const ws = R && R.weapon ? R.weapon.list : [];
  const gearWs = (sv ? sv.gear : []).filter(g => g.slot < 14 && g.BaseAttackDamage > 1);
  const finals = R && R.final ? Object.keys(R.final) : ['fire'];
  const usesRage = /Sweeping Strike|Heavy Attack/.test(T.skill) || true;

  let h = `<div class="calc">
  <aside class="cpanel">
    <h3>Personagem</h3>
    ${(window.TQ2_SAVES || []).length ? `<label class="fld">Save do jogo<select id="cSave">${TQ2_SAVES.map((s, i) => `<option value="${i}" ${i === T.save ? 'selected' : ''}>${esc(s.name)} · nível ${s.level}</option>`).join('')}</select></label>
      <button class="btn" id="cLoad" type="button">Carregar build e equipamento do save</button>
      <p class="hint">Substitui a build do planejador pela do save (masteries, pontos, modifiers e feats).</p>` : ''}
    <button class="btn" id="cOpt" type="button">Sugerir melhorias de DPS</button>
    <p class="hint">Testa modifiers, feats, pontos, outras skills principais e equipamento, e mostra só o que aumenta o dano por segundo.</p>
    <button class="btn ghost" id="cImp" type="button">Importar personagem (.sav)</button><input type="file" id="cImpFile" accept=".sav" multiple hidden>
    <p class="hint" id="cImpMsg">Selecione os arquivos <b>_Data_Player.sav</b> e <b>_Data_PlayerLocal.sav</b> do personagem, em <code>%LOCALAPPDATA%\\TQ2\\Saved\\SaveGames</code>.</p>
    <label class="fld">Nível do personagem<input type="number" id="cLvl" min="1" max="75" value="${T.level}"></label>
    ${tg('cGear', T.gear, 'Usar equipamento do save', 'Armas e afixos lidos do save')}
    <h3>Skill principal</h3>
    <label class="fld"><select id="cSkill">${mainSkillOptions()}</select></label>
    ${R && R.def && R.def.kind === 'weapon' ? `<label class="fld">Arma usada<select id="cWeap">
      <option value="avg" ${T.weapon === 'avg' ? 'selected' : ''}>Média das armas equipadas</option>
      <option value="main" ${T.weapon === 'main' ? 'selected' : ''}>Mão principal${gearWs[0] ? ' (' + gearWs[0].BaseAttackDamage + ')' : ''}</option>
      <option value="off" ${T.weapon === 'off' ? 'selected' : ''}>Mão secundária${gearWs[1] ? ' (' + gearWs[1].BaseAttackDamage + ')' : ''}</option></select></label>` : ''}
    <h3>Situação do combate</h3>
    ${situHTML(R, tg, rng, maxR, maxA)}
    <h3>Inimigo</h3>
    ${finals.map(t => `<label class="fld">Resistência a ${TQ2CALC.TNAME[t]} (%)<input type="number" id="cRes_${t}" value="${T.res[t] || 0}" step="1"></label>`).join('')}
    <h3>Atributos</h3>
    ${R && R.attr ? `<p class="hint">Calculado: Might ${n0(R.attr.might)}, Vigor ${n0(R.attr.vigor)} → Fitness ${n0(R.attr.fitness)}, Resolve ${n0(R.attr.resolve)}, Cunning ${n0(R.attr.cunning)}.</p>` : ''}
    ${['resolve', 'fitness', 'cunning'].map(a => `<label class="fld">Base Factor (${a[0].toUpperCase() + a.slice(1)})<input type="number" id="cAt_${a}" placeholder="${R && R.attr ? (1 + 0.002 * R.attr[a]).toFixed(2) + ' (calculado)' : ''}" value="${(T.attrFactor || {})[a] ?? ''}" step="0.01" min="1"></label>`).join('')}
    <p class="hint">Base Factor = 1 + 0,002 × atributo: multiplica o dano daquele tipo (1.65 = +65%). Conferido na ficha do jogo (aba Offensive Stats). Anéis e colares "Might/Agility/Knowledge" dão um bônus de base que varia um pouco; se quiser o valor exato, copie o da ficha aqui.</p>
  </aside>
  <div class="cres">`;

  if (!R || R.error) {
    h += `<div class="banner">${esc(R ? R.error : 'Não foi possível calcular.')}</div>`;
  } else {
    const nm = T.skill.split('|')[1] + (R.v.m && R.v.m.Whirlwind ? ' · Whirlwind' : '');
    const typeShare = Object.entries(R.final).map(([t, x]) => `<span class="tchipd t-${t}">${TQ2CALC.TNAME[t]} ${n0(x)}${Object.keys(R.final).length > 1 ? ' (' + Math.round(100 * x / R.total) + '%)' : ''}</span>`).join(' ');
    h += `<div class="kpis">
      <div class="kpi"><span>Dano por ${esc(R.hitLabel)}</span><b>${n0(R.total)}</b><small>${n0(R.min)} – ${n0(R.max)}</small></div>
      ${R.perSec ? `<div class="kpi"><span>Por segundo (estimado)</span><b>${n0(R.perSec)}</b><small>${esc(R.perSecNote)}${R.perSecBurst && R.perSecBurst > R.perSec * 1.001 ? ` · sem limite de Energy: ${n0(R.perSecBurst)}` : ''}${R.tooltipDPS ? `<br>Para comparar com o tooltip do jogo (sem crítico): <b>${n0(R.tooltipDPS)}</b>` : ''}</small></div>` : ''}
      ${energyKPI(R)}
      <div class="kpi"><span>Skill</span><b class="sm">${esc(nm)}</b><small>${typeShare}</small></div>
    </div>`;
    h += optHTML(R);
    h += monstersHTML(R, TQ2CALC._shuffle);
    h += `<h3>Passo a passo</h3><div class="tblwrap"><table class="steps"><thead><tr><th>Etapa</th><th class="num">Dano</th><th>Por tipo</th></tr></thead><tbody>`;
    R.steps.forEach(s => {
      if (!s.types) { h += `<tr class="modrow"><td colspan="3">${esc(s.label)}</td></tr>`; return; }
      const tot = Object.values(s.types).reduce((a, x) => a + x, 0);
      const sums = s.sums ? ' <span class="hint">(' + Object.entries(s.sums).map(([t, x]) => TQ2CALC.TNAME[t] + ' +' + n1(x) + '%').join(', ') + ')</span>' : '';
      h += `<tr><td>${esc(s.label)}${sums}${s.est ? ' <span class="est">estimado</span>' : ''}</td><td class="num">${n1(tot)}</td><td>${Object.entries(s.types).filter(([, x]) => x > 0.05).map(([t, x]) => `<span class="tchipd t-${t}">${TQ2CALC.TNAME[t]} ${n1(x)}</span>`).join(' ')}</td></tr>`;
    });
    h += `</tbody></table></div>`;

    const groups = [['ok', 'Conta no dano', x => x.a.ok], ['cond', 'Condicional (não somado agora)', x => x.a.cond], ['info', 'Entra em outra parte (velocidade, atributo, Rage)', x => x.a.info || x.e.kind === 'attr'], ['no', 'Não afeta este dano', x => !x.a.ok && !x.a.cond && !x.a.info && x.e.kind !== 'attr' && x.e.kind !== 'other'], ['other', 'Sem relação com dano', x => !x.a.ok && !x.a.cond && !x.a.info && x.e.kind === 'other']];
    groups.forEach(([cls, title, fn]) => {
      const rows = R.effects.filter(fn);
      if (!rows.length) return;
      const open = cls === 'ok' || cls === 'no';
      h += `<details class="egrp ${cls}" ${open ? 'open' : ''}><summary>${esc(title)} <span class="hint">(${rows.length})</span></summary><div class="tblwrap"><table><tbody>${rows.map(x => `<tr><td class="src">${esc(x.e.src || '')}</td><td>${esc(x.e.kind === 'other' ? x.e.text : TQ2CALC.shortEff(x.e))}${x.e.approx ? ' <span class="est">estimado</span>' : ''}</td><td class="why">${esc(x.a.why || (x.e.ch === 3 ? 'Canal "Total Damage": multiplica separado' : 'Soma com os outros increased'))}</td></tr>`).join('')}</tbody></table></div></details>`;
    });
    h += `<details class="rules"><summary>Regras usadas e o que é estimativa</summary><ul class="list">
      <li><b>Conversão antes da escala</b> (texto oficial do jogo): o dano convertido passa a ser do novo tipo. Bônus de Physical não valem mais para ele. Dano fixo de arma (Strike, Fire etc.) também é convertido.</li>
      <li><b>Increased somam entre si</b> no mesmo canal (canal 0). Os bônus de <b>Total Damage</b> (Valor, War Banner, Rage, alguns únicos) ficam no canal 3 e <b>multiplicam separado</b>. Isso foi lido no campo de canal de cada efeito do jogo. O colar de Crabs, que é canal 3, aparece no próprio jogo como "more".</li>
      <li><b>More</b> dos modifiers da skill (Ramp Up, Rage Gain…) multiplicam um a um, com as fórmulas do jogo.</li>
      <li><b>Atributos</b>: Might, Agility e Knowledge não dão dano direto; formam Fitness (Strike/Pierce), Resolve (Fire/Cold) e Cunning (Lightning/Poison) = 0.6 × atributos + 0.4 × Vigor. Base Factor = 1 + 0,002 × atributo (conferido na ficha: 327 → 1.65, 120 → 1.24). Spirit e Vitality usam o maior.</li>
      <li><b>Por segundo</b> = dano por acerto × acertos por segundo × parte do tempo em que há Energy. Acertos por segundo vêm do tempo da skill (ou do tick do canal) dividido pela velocidade (arma × Attack Speed; Cast Speed nas Spells) e do cooldown com o Cooldown Rate. Whirlwind: tick de 0.25s ÷ velocidade e 10 Energy por tick (arquivos do jogo).</li>
      <li><b>Crítico</b>: 1,5× o dano (DefaultGame.ini). A chance soma a base da skill, metade do crítico da arma (10%) e os bônus; o dano por acerto e o DPS já incluem a média dos críticos. O tooltip do jogo mostra o DPS <b>sem</b> crítico; o número para comparar aparece no card "Por segundo".</li>
      <li><b>Duas armas</b>: dano da arma = 0,6 × principal + 0,6 × secundária; velocidade e crítico são a média (DefaultGame.ini). Conferido com o tooltip do Whirlwind com uma e com duas armas (diferença menor que 0,5%).</li>
      <li><b>Charms e relíquias</b> encaixados contam pelo número de stacks; o bônus de completar vale no máximo de stacks.</li>
      <li><b>Energy</b>: base 300; regenera 2,5% da máxima + 22,5 por segundo (desc_tq2_character); skills Exhaust têm 75% less regeneração enquanto você usa. Auras e modifiers reservam Energy. Ajuste a duração da luta em Situação do combate. Crítico e Ailments não entram.</li>
      <li>Modifiers marcados como <span class="est">estimado</span> usam o texto do rank 1 multiplicado pelo rank.</li>
      <li>Dados do Early Access 0.7.0 (changelist 137244). Um patch pode mudar os números.</li></ul></details>`;
  }
  h += `</div></div>`;
  $('calcBody').innerHTML = h;
  decorate($('calcBody'));

  const on = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };
  const re = () => { TQ2CALC.save(); renderCalc(); };
  on('cMonShuffle', 'onclick', () => { TQ2CALC._shuffle = true; renderCalc(); TQ2CALC._shuffle = false; });
  wireImport('cImp', 'cImpFile', 'cImpMsg', re);
  on('cSave', 'onchange', e => { T.save = +e.target.value; re(); });
  on('cLoad', 'onclick', () => { loadSave(T.save); re(); });
  on('cRageAuto', 'onchange', e => { T.rageAuto = e.target.checked; if (!T.rageAuto) T.rage = Math.round(T.rage); re(); });
  on('cFight', 'onchange', e => { T.fight = Math.max(5, Math.min(300, +e.target.value || 30)); re(); });
  on('cLvl', 'onchange', e => { T.level = Math.max(1, Math.min(75, +e.target.value || 1)); re(); });
  on('cGear', 'onchange', e => { T.gear = e.target.checked; re(); });
  on('cSkill', 'onchange', e => { T.skill = e.target.value; re(); });
  on('cWeap', 'onchange', e => { T.weapon = e.target.value; re(); });
  [['cRof', 'rof'], ['cValor', 'valor'], ['cBanner', 'banner'], ['cEdge', 'edge'], ['cOw', 'overwhelm'], ['cCrab', 'vsCrab']].forEach(([id, k]) => on(id, 'onchange', e => { T[k] = e.target.checked; re(); }));
  [['cRage', 'rage'], ['cAmp', 'amplify'], ['cRamp', 'rampSec']].forEach(([id, k]) => {
    const el = $(id); if (!el) return;
    el.oninput = () => { $(id + 'V').textContent = el.value; };
    el.onchange = () => { T[k] = +el.value; re(); };
  });
  _sits.forEach((si, i) => {
    const el = $('cSi' + i); if (!el) return;
    const setv = v => { T.situ = Object.assign({}, T.situ, { [si.id]: v }); re(); };
    if (si.type === 'count') { el.oninput = () => { $('cSi' + i + 'V').textContent = el.value; }; el.onchange = () => setv(+el.value); }
    else el.onchange = () => setv(el.checked);
  });
  on('cOpt', 'onclick', () => {
    const b = $('cOpt'); b.disabled = true; b.textContent = 'Calculando…';
    setTimeout(() => { try { TQ2OPT._last = TQ2OPT.run(B, M); } catch (e) { console.error(e); TQ2OPT._last = { error: String(e) }; } renderCalc(); const el = $('optRes'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
  });
  document.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => {
    const o = TQ2OPT._last, c = o && o.suggestions[+b.dataset.apply]; if (!c) return;
    B = JSON.parse(JSON.stringify(c.B)); saveB();
    if (c.skill) T.skill = c.skill;
    TQ2OPT._last = null; re();
  });
  finals.forEach(t => on('cRes_' + t, 'onchange', e => { T.res[t] = +e.target.value || 0; re(); }));
  ['resolve', 'fitness', 'cunning'].forEach(a => on('cAt_' + a, 'onchange', e => { const v = e.target.value.trim(); T.attrFactor = Object.assign({}, T.attrFactor); if (v === '') delete T.attrFactor[a]; else T.attrFactor[a] = +v; re(); }));
}

/* ---------- Sugestões de DPS (TQ2OPT) ---------- */
function kpiTrio(R, ref, skillName) {
  const d = (a, b) => (b ? `<em class="${a >= b ? 'up' : 'down'}">${a >= b ? '+' : ''}${n1(100 * (a - b) / b)}%</em>` : '');
  const share = Object.entries(R.final || {}).map(([t, x]) => `<span class="tchipd t-${t}">${TQ2CALC.TNAME[t]} ${n0(x)}</span>`).join(' ');
  return `<div class="kpis sm">
    <div class="kpi"><span>Dano por ${esc(R.hitLabel || 'acerto')}</span><b>${n0(R.total)}</b><small>${d(R.total, ref.total)}</small></div>
    ${R.perSec ? `<div class="kpi"><span>Por segundo (estimado)</span><b>${n0(R.perSec)}</b><small>${d(R.perSec, ref.perSec)}${R.perSecRough ? ' · ritmo estimado' : ''}</small></div>` : ''}
    <div class="kpi"><span>Skill</span><b class="sm">${esc(skillName)}</b><small>${share}</small></div></div>`;
}
function optHTML(R) {
  const o = TQ2OPT._last;
  if (!o) return '';
  if (o.sig !== TQ2OPT.sig(B)) return `<div class="opt" id="optRes"><p class="hint">A build ou a situação mudou desde as últimas sugestões. Clique em <b>Sugerir melhorias de DPS</b> de novo.</p></div>`;
  if (o.error) return `<div class="opt" id="optRes"><div class="banner">${esc(o.error)}</div></div>`;
  const nm = k => k.split('|')[1];
  let h = `<div class="opt" id="optRes"><div class="mhead2"><h3>Sugestões para mais DPS</h3><span class="hint">só dentro de ${esc((o.masteries || []).map(k => M[k] ? M[k].name : k).join(" + "))} · cada uma comparada com a build atual · ${o.ms} ms</span></div>`;
  const pts = Object.values(B.sk).reduce((x, v) => x + (v.l || 0), 0);
  if (!pts) h += `<div class="banner">A build está vazia. Importe um personagem ou monte a build na aba Montar build antes de pedir sugestões.</div>`;
  else if (!o.suggestions.length) h += `<div class="optok">A build já está otimizada para o melhor DPS em pontos, feats e modifiers${o.baseRough ? ' (o ritmo de golpes desta skill é estimado)' : ''}.</div>`;
  o.suggestions.forEach((c, i) => {
    const sk = nm(c.skill || TQ2CALC.T.skill) + (c.R.v && c.R.v.m && c.R.v.m.Whirlwind ? ' · Whirlwind' : '');
    h += `<div class="sug"><div class="sughead"><b>${i + 1}. ${esc(c.title)}</b><span class="gain">+${n1(100 * c.gain)}% DPS</span>
      <button class="btn ghost" type="button" data-apply="${i}">Aplicar no planejador</button></div>
      <ul class="list">${c.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${kpiTrio(c.R, R, sk)}</div>`;
  });
  const others = (o.otherSkills || []).filter(x => x.rough || o.baseRough);
  if (others.length) h += `<details class="rules"><summary>Outras skills principais com os mesmos pontos (ritmo de golpes estimado)</summary><div class="tblwrap"><table><thead><tr><th>Skill</th><th class="num">Dano por golpe</th><th class="num">Por segundo (estimado)</th></tr></thead><tbody>
    ${others.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${n0(x.hit)}</td><td class="num">${n0(x.x)}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">Para estas o jogo não informa quantos golpes por segundo saem; usei 1 golpe/s × velocidade da arma. Compare pelo dano por golpe e teste no jogo antes de trocar.</p></details>`;
  h += `<p class="hint">"Aplicar no planejador" troca a build da aba Montar build. Para voltar, use <b>Carregar build e equipamento do save</b>.</p></div>`;
  return h + gearHTML(o, R);
}
function gearHTML(o, R) {
  const g = o.gear; if (!g || (!g.weapons.length && !g.swaps.length && !g.values.length)) return '';
  const L = TQ2CALC.T.level, slotName = id => TQ2OPT.SLOT_PT[TQ2OPT.slotOf(id)] || TQ2CALC.prettyItem(id);
  let h = `<div class="opt gear"><div class="mhead2"><h3>Equipamento</h3><span class="hint">itens Rare do nível ${L}, valor médio do tier</span></div>`;
  if (g.weapons.length) {
    const cur = (g.current || []).map(w => `${slotName(w.item)} nível ${w.level} (dano ${w.base}, velocidade ${(+w.spd).toFixed(2)})`).join(' + ');
    h += `<h4>Arma</h4><p class="hint">Atual: ${esc(cur)}. Por segundo atual: <b>${n0(o.base)}</b>.</p><div class="tblwrap"><table class="steps"><thead><tr><th>Tipo (nível ${L})</th><th class="num">Dano base</th><th class="num">Velocidade</th><th class="num">Por segundo</th><th class="num">vs atual</th></tr></thead><tbody>
      ${g.weapons.map((w, i) => `<tr${i === 0 && w.gain > 0 ? ' class="best"' : ''}><td>${esc(w.w.name)}${w.dual ? ' <span class="hint">(as duas mãos)</span>' : ''}</td><td class="num">${w.base}</td><td class="num">${w.w.spd.toFixed(2)}</td><td class="num">${n0(w.x)}</td><td class="num ${w.gain >= 0 ? 'up' : 'down'}">${w.gain >= 0 ? '+' : ''}${n1(100 * w.gain)}%</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Dano e velocidade de cada tipo vêm das tabelas do jogo. Armas de 1 mão mantêm os afixos das suas. Arma de 2 mãos: uma arma só, com os afixos da sua melhor arma × 1,7 (o jogo rola afixos 70% maiores em 2 mãos).</p>`;
  }
  if (g.swaps.length) {
    h += `<h4>Trocas de afixo</h4><ul class="list swaps">${g.swaps.slice(0, 8).map(s => `<li><span class="gain">+${n1(100 * s.gain)}%</span> <b>${esc(slotName(s.item))}</b> <span class="hint">(${esc(TQ2CALC.prettyItem(s.item))})</span>: troque <s>${esc(s.out.text)}</s> por <b>${esc(s.inn.stats.map(x => x.text).join(' · '))}</b> <span class="hint">tier ${s.inn.tier}, faixa ${s.inn.range[0]}–${s.inn.range[1]}</span></li>`).join('')}</ul>
      <p class="hint">Cada linha troca o afixo mais fraco do item (prefixo por prefixo, sufixo por sufixo) pelo afixo que mais aumenta o dano entre os que podem sair naquele tipo de item. Itens únicos ficam de fora. A troca pode tirar resistência ou defesa.</p>`;
  }
  const vals = g.values.filter(v => !/implicit/.test(v.affix));
  if (vals.length) {
    const by = {}; vals.forEach(v => { (by[v.item + '#' + v.slot] = by[v.item + '#' + v.slot] || []).push(v); });
    h += `<details class="rules"><summary>Quanto cada afixo atual vale no DPS</summary><div class="tblwrap"><table><tbody>${Object.values(by).map(xs => `<tr><td class="src">${esc(slotName(xs[0].item))}</td><td>${xs.map(v => `<span class="afx ${v.loss > 0.0005 ? 'ok' : 'no'}">${esc(v.text)} <b>${v.loss > 0.0005 ? '+' + n1(100 * v.loss) + '%' : '0'}</b></span>`).join(' ')}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Quanto o dano por segundo cai se o afixo sumir. 0 = não ajuda esta skill.</p></details>`;
  }
  return h + `</div>`;
}
