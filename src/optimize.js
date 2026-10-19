/* Sugestões de melhoria de DPS para a calculadora de dano real do Atlas TQ2.
   Testa mudanças na build com o mesmo motor (TQ2CALC.compute) e só sugere o que aumenta o dano por segundo:
   - modifiers da skill principal e das ativas que dão bônus de dano (respeitando a capacity do nível);
   - feats das passivas;
   - mover até 10 pontos de skills que não afetam o dano para as que afetam;
   - trocar a skill principal por outra das duas masteries;
   - equipamento: tipo de arma e afixos (catálogo TQ2_AFFIX_POOL, itens Rare no seu nível). */
(function () {
  const C = window.TQ2CALC, O = (window.TQ2OPT = {});
  const CAPS = [1, 2, 3, 5, 7, 9, 11, 13, 15, 17], MAXLV = 20;
  const capAt = l => CAPS.filter(c => c <= l).length;
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = (mk, s) => mk + '|' + s.n;
  const stOf = B => (mk, s) => B.sk[key(mk, s)] || { l: 0, f: [], m: {} };
  const featSlots = (s, l) => { if (!s.u) return l > 0 ? 2 : 0; return s.u.split('/').map(Number).filter(x => l >= x).length; };
  const modUsed = (s, v) => (s.mods || []).reduce((a, [n, r, c]) => a + (v.m[n] || 0) * c, 0);
  const metric = R => (R && !R.error ? (R.perSec || R.total || 0) : 0);

  /* Modifiers de ativas especiais que mexem no dano (lidos por TQ2CALC.SPECIAL) */
  const SPECIAL_MODS = {
    'earth|Earth Enchantment': ['Earth Enhancement', 'Fire Imbuement', 'Strike Imbuement'],
    'earth|Ring of Flame': ['Empowering Flame', 'Scorching Weapon', 'Enhanced Amplify'],
    'warfare|Valor': ['Frenzy', 'Deadly Strike', 'Sword of Damocles', 'Burst of Speed'],
    'warfare|War Banner': ['Increased Damage']
  };

  /* Fora da busca: fórmula estimada ou efeito de rajada (não sustentado). Whirlwind muda o jeito de jogar: fica como está. */
  const NO_SEARCH = new Set(['Concentrated Fury', 'Frenzy', 'Deadly Strike', 'Sword of Damocles']);
  const FIXED = new Set(['Whirlwind']);
  O.NO_SEARCH = NO_SEARCH;

  /* Avalia uma build sem mexer no estado da calculadora */
  function evaluate(B, M, opt) {
    opt = opt || {};
    const save = clone(C.T), saveGear = C._gear, saveLast = C._last;
    try {
      const st = stOf(B);
      if (opt.skill) C.T.skill = opt.skill;
      if (opt.gear) C._gear = opt.gear;
      // Rage e Amplify: se você está no máximo, a variante também usa o máximo dela
      const cur = O._baseLimits || C.limits(B, st), lim = C.limits(B, st);
      if (save.rage >= cur.rage) C.T.rage = lim.rage;
      if (save.amplify >= cur.amp) C.T.amplify = lim.amp;
      return C.compute(B, M, st);
    } catch (e) { return { error: String(e) }; } finally {
      Object.keys(C.T).forEach(k => delete C.T[k]); Object.assign(C.T, save);
      C._gear = saveGear; C._last = saveLast;
    }
  }
  O.evaluate = evaluate;

  /* Restrições de texto dos modifiers: "Requires X" e "Incompatible with X" */
  function modRules(s) {
    const req = {}, inc = {};
    (s.mods || []).forEach(([n, , , t]) => {
      const r = String(t || '').match(/Requires ([A-Z][\w' ]+?)(?:[.;,]|$)/); if (r) req[n] = r[1].trim();
      const i = String(t || '').match(/Incompatible with ([A-Z][\w' ]+?)(?:[.;,]|$)/); if (i) inc[n] = i[1].trim();
    });
    return { req, inc };
  }
  function modsValid(s, m) {
    const { req, inc } = modRules(s);
    for (const n of Object.keys(m)) {
      if (!m[n]) continue;
      if (req[n] && !m[req[n]]) return false;
      if (inc[n] && m[inc[n]]) return false;
    }
    return true;
  }
  /* Modifiers que o motor sabe que mudam o dano de uma skill */
  function damageMods(k, s) {
    const def = C.SKILLS[k];
    const names = new Set(SPECIAL_MODS[k] || []);
    if (def) Object.entries(def.mods || {}).forEach(([n, fn]) => {
      const T = Object.assign({}, C.T, { rage: 10, rampSec: 3 });
      const o = fn(1, T); if (o && ((o.more || 0) > 0 || o.setPct != null)) names.add(n);
    });
    return (s.mods || []).filter(([n]) => names.has(n) && !NO_SEARCH.has(n));
  }
  /* Melhor distribuição de modifiers de dano para uma skill (busca completa, capacity do nível) */
  function bestMods(B, M, mk, s, opt) {
    const k = key(mk, s), v = stOf(B)(mk, s);
    if (!v.l) return null;
    const cap = capAt(v.l), dm = damageMods(k, s);
    if (!dm.length) return null;
    const { req } = modRules(s);
    // inclui modifiers exigidos pelos de dano (ex.: Ramp Up exige Whirlwind)
    const names = new Set(dm.map(x => x[0]));
    dm.forEach(([n]) => { if (req[n]) names.add(req[n]); });
    const list = (s.mods || []).filter(([n]) => names.has(n));
    const others = (s.mods || []).filter(([n]) => !names.has(n) && v.m[n] && !NO_SEARCH.has(n));
    let best = null, tries = 0;
    const cur = {};
    const rec = i => {
      if (tries > 1500) return;
      if (i === list.length) {
        const m = { ...cur };
        if (!modsValid(s, m)) return;
        let used = list.reduce((a, [n, , c]) => a + (m[n] || 0) * c, 0);
        // mantém os outros modifiers que ainda cabem
        others.forEach(([n, , c]) => { const want = v.m[n]; const fit = Math.min(want, Math.floor((cap - used) / c)); if (fit > 0) { m[n] = fit; used += fit * c; } });
        Object.keys(m).forEach(n => { if (!m[n]) delete m[n]; });
        tries++;
        const B2 = clone(B); B2.sk[k] = { ...v, m };
        const R = evaluate(B2, M, opt), x = metric(R);
        if (!best || x > best.x + 1e-9) best = { x, m, R, B: B2 };
        return;
      }
      const [n, r, c] = list[i];
      const used = list.slice(0, i).reduce((a, [nn, , cc]) => a + (cur[nn] || 0) * cc, 0);
      const hi = Math.min(r, Math.floor((cap - used) / c));
      if (FIXED.has(n)) { const want = v.m[n] || 0; if (want <= hi) { cur[n] = want; rec(i + 1); } delete cur[n]; return; }
      for (let rk = hi; rk >= 0; rk--) { cur[n] = rk; rec(i + 1); }
      delete cur[n];
    };
    rec(0);
    return best;
  }

  const modTxt = m => Object.entries(m).filter(([, r]) => r).map(([n, r]) => `${n} ${r}`).join(', ') || 'nenhum';
  function diffMods(a, b) {
    const out = [];
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(n => { const x = a[n] || 0, y = b[n] || 0; if (x !== y) out.push(`${n} ${x} → ${y}`); });
    return out;
  }

  /* ---------- Geradores de sugestões ---------- */
  function genMods(B, M, baseX) {
    const out = [];
    B.slots.forEach(mk => (M[mk] ? M[mk].skills : []).forEach(s => {
      if (s.k !== 'active') return;
      const k = key(mk, s), v = stOf(B)(mk, s);
      if (!v.l || (k !== C.T.skill && !SPECIAL_MODS[k])) return;
      const b = bestMods(B, M, mk, s);
      if (!b || b.x <= baseX * 1.001) return;
      const d = diffMods(v.m, b.m); if (!d.length) return;
      out.push({ kind: 'mods', target: k, title: `Modifiers de ${s.n}`, lines: [`Capacity ${capAt(v.l)}: ${modTxt(b.m)}`, 'Mudanças: ' + d.join('; ')], B: b.B, R: b.R, x: b.x });
    }));
    return out;
  }
  function combos(arr, k) {
    const res = [];
    const rec = (i, acc) => { if (acc.length === k) { res.push(acc.slice()); return; } for (let j = i; j < arr.length; j++) { acc.push(arr[j]); rec(j + 1, acc); acc.pop(); } };
    rec(0, []); return res;
  }
  function genFeats(B, M, baseX) {
    const out = [];
    B.slots.forEach(mk => (M[mk] ? M[mk].skills : []).forEach(s => {
      if (s.k !== 'passive' || !(s.feats || []).length) return;
      const k = key(mk, s), v = stOf(B)(mk, s); if (!v.l) return;
      const n = Math.min(s.feats.length, Math.max(v.f.length, featSlots(s, v.l))); if (!n) return;
      let best = null;
      combos(s.feats.map(f => f[0]), n).forEach(fs => {
        const B2 = clone(B); B2.sk[k] = { ...v, f: fs };
        const R = evaluate(B2, M), x = metric(R);
        if (!best || x > best.x + 1e-9) best = { x, fs, R, B: B2 };
      });
      if (!best || best.x <= baseX * 1.001) return;
      const add = best.fs.filter(f => !v.f.includes(f)), rem = v.f.filter(f => !best.fs.includes(f));
      if (!add.length) return;
      out.push({ kind: 'feats', target: k, title: `Feats de ${s.n}`, lines: [(rem.length ? `Troque ${rem.join(', ')} por ` : 'Escolha ') + add.join(', '), `Feats: ${best.fs.join(', ')}`], B: best.B, R: best.R, x: best.x });
    }));
    return out;
  }
  /* Tira pontos de skills que não afetam o dano e coloca nas que afetam */
  function genPoints(B, M, baseX, REL) {
    const st = stOf(B), skills = [];
    B.slots.forEach(mk => (M[mk] ? M[mk].skills : []).forEach(s => skills.push({ mk, s, k: key(mk, s) })));
    const maxTier = {};
    skills.forEach(({ mk, s }) => { if (st(mk, s).l) maxTier[mk] = Math.max(maxTier[mk] || 0, s.t); });
    const donors = skills.filter(({ mk, s, k }) => st(mk, s).l > (s.k === 'active' ? 1 : 0) && k !== C.T.skill && !REL.has(k) && !SPECIAL_MODS[k])
      .sort((a, b) => (a.s.k === b.s.k ? 0 : a.s.k === 'passive' ? -1 : 1) || st(b.mk, b.s).l - st(a.mk, a.s).l);
    const pool = donors.reduce((a, d) => a + st(d.mk, d.s).l - (d.s.k === 'active' ? 1 : 0), 0);
    if (!pool) return [];
    const receivers = skills.filter(({ mk, s, k }) => {
      if (k === C.T.skill || s.t > (maxTier[mk] || 0)) return false;
      const r = REL.get(k); return (r && r.cls === 'aff') || SPECIAL_MODS[k] || (s.k === 'passive' && C.SPECIAL[k]);
    });
    let cur = clone(B), curX = baseX, moved = 0;
    const gained = {};
    const take = B2 => { // tira 1 ponto do primeiro doador que ainda tem
      for (const d of donors) {
        const v = B2.sk[d.k]; const min = d.s.k === 'active' ? 1 : 0;
        if (v && v.l > min) {
          v.l--; if (d.s.k === 'passive') v.f = v.f.slice(0, featSlots(d.s, v.l));
          else { const cap = capAt(v.l); while (modUsed(d.s, v) > cap) { const ks = Object.keys(v.m); if (!ks.length) break; const last = ks[ks.length - 1]; v.m[last]--; if (!v.m[last]) delete v.m[last]; } }
          if (!v.l && !v.f.length) delete B2.sk[d.k];
          return d;
        }
      }
      return null;
    };
    const taken = {};
    let lastR = null;
    for (let step = 0; step < Math.min(10, pool); step++) {
      let best = null;
      receivers.forEach(rv => {
        const v = stOf(cur)(rv.mk, rv.s); if (v.l >= (rv.s.k === 'passive' && rv.s.mx ? rv.s.mx : MAXLV)) return;
        const B2 = clone(cur); const d = take(B2); if (!d) return;
        const nv = { l: v.l + 1, f: v.f.slice(), m: { ...v.m } };
        // passiva nova ganha o melhor feat que couber
        if (rv.s.k === 'passive' && featSlots(rv.s, nv.l) > nv.f.length && (rv.s.feats || []).length) {
          let bf = null;
          rv.s.feats.forEach(([f]) => { if (nv.f.includes(f)) return; const B3 = clone(B2); B3.sk[rv.k] = { ...nv, f: nv.f.concat(f) }; const x = metric(evaluate(B3, M)); if (!bf || x > bf.x) bf = { x, f }; });
          if (bf) nv.f.push(bf.f);
        }
        B2.sk[rv.k] = nv;
        const R = evaluate(B2, M), x = metric(R);
        if (!best || x > best.x) best = { x, B2, rv, d, R };
      });
      if (!best || best.x <= curX * 1.0005) break;
      cur = best.B2; curX = best.x; moved++; lastR = best.R;
      gained[best.rv.s.n] = (gained[best.rv.s.n] || 0) + 1; taken[best.d.s.n] = (taken[best.d.s.n] || 0) + 1;
    }
    if (!moved || curX <= baseX * 1.001) return [];
    const fmt = o => Object.entries(o).map(([n, x]) => `${n} ${x > 0 ? '+' : ''}${x}`).join(', ');
    return [{ kind: 'points', target: 'points', title: `Mover ${moved} ponto${moved > 1 ? 's' : ''} para dano`,
      lines: [`Coloque: ${fmt(gained)}`, `Tire de: ${Object.entries(taken).map(([n, x]) => `${n} −${x}`).join(', ')} (não afeta o dano desta skill; pode ser defesa ou utilidade)`],
      B: cur, R: lastR, x: curX }];
  }
  /* Outras skills principais das duas masteries, com os mesmos pontos */
  function genSkills(B, M, baseX) {
    const out = [], st = stOf(B);
    const [mk0, sn0] = C.T.skill.split('|');
    const s0 = M[mk0] && M[mk0].skills.find(x => x.n === sn0); if (!s0) return out;
    const v0 = st(mk0, s0);
    const maxTier = {};
    B.slots.forEach(mk => (M[mk] ? M[mk].skills : []).forEach(s => { if (st(mk, s).l) maxTier[mk] = Math.max(maxTier[mk] || 0, s.t); }));
    Object.keys(C.SKILLS).forEach(k => {
      const [mk, sn] = k.split('|'); if (k === C.T.skill || !B.slots.includes(mk)) return;
      const s = M[mk] && M[mk].skills.find(x => x.n === sn); if (!s || s.t > (maxTier[mk] || 0)) return;
      const B2 = clone(B), v = st(mk, s);
      const lv = Math.max(v.l, v0.l || 1), diff = lv - v.l;
      if (diff > 0 && (v0.l || 0) < diff) return; // não há pontos para mover
      B2.sk[k] = { l: lv, f: [], m: { ...v.m } };
      if (diff > 0 && v0.l) { // os pontos saem da skill principal atual
        const nl = Math.max(0, v0.l - diff), nv = { l: nl, f: [], m: { ...v0.m } };
        const cap = capAt(nl); while (modUsed(s0, nv) > cap) { const ks = Object.keys(nv.m); if (!ks.length) break; const last = ks[ks.length - 1]; nv.m[last]--; if (!nv.m[last]) delete nv.m[last]; }
        if (nl) B2.sk[C.T.skill] = nv; else delete B2.sk[C.T.skill];
      }
      const bm = bestMods(B2, M, mk, s, { skill: k });
      const R = bm ? bm.R : evaluate(B2, M, { skill: k }), x = bm ? bm.x : metric(R);
      if (!R || R.error) return;
      O._otherSkills.push({ k, name: sn, hit: R.total, x, rough: !!R.perSecRough, hitLabel: R.hitLabel });
      if (R.perSecRough || O._baseRough || x <= baseX * 1.001) return;
      out.push({ kind: 'skill', target: k, skill: k, title: `Trocar a skill principal por ${sn}`,
        lines: [`${sn} nível ${lv}${bm ? ', modifiers: ' + modTxt(bm.m) : ''}`, diff > 0 && v0.l ? `Os ${diff} pontos saem de ${sn0}` : 'Usa os pontos que já estão nela', R.perSecRough ? 'DPS desta skill é estimado (1 golpe/s × velocidade)' : ''].filter(Boolean),
        B: bm ? bm.B : B2, R, x });
    });
    return out;
  }

  /* ---------- Equipamento ---------- */
  const SLOT_OF = [[/armor_head/, 'Helmet'], [/armor_shoulder/, 'Shoulder'], [/armor_torso/, 'Torso'], [/armor_arm/, 'Arm'], [/armor_leg/, 'Leg'],
    [/jewelry_neck/, 'Neck'], [/jewelry_ring/, 'Ring'], [/weapon_1h_blunt/, 'Club1H'], [/weapon_2h_blunt/, 'Club2H'], [/weapon_1h_axe/, 'Axe1H'], [/weapon_2h_axe/, 'Axe2H'],
    [/weapon_1h_sword/, 'Sword'], [/weapon_1h_spear/, 'Spear'], [/weapon_1h_dagger/, 'Dagger'], [/weapon_2h_staff/, 'Staff'], [/weapon_2h_bow/, 'Bow'],
    [/offhand_shield/, 'Shield'], [/offhand_talisman/, 'Talisman']];
  const SLOT_PT = { Helmet: 'Elmo', Shoulder: 'Ombreiras', Torso: 'Peitoral', Arm: 'Luvas', Leg: 'Calças', Neck: 'Colar', Ring: 'Anel', Club1H: 'Maça 1 mão', Club2H: 'Maça 2 mãos', Axe1H: 'Machado 1 mão', Axe2H: 'Machado 2 mãos', Sword: 'Espada', Spear: 'Lança', Dagger: 'Adaga', Staff: 'Cajado', Bow: 'Arco', Shield: 'Escudo', Talisman: 'Talismã' };
  O.SLOT_PT = SLOT_PT;
  const slotOf = id => (SLOT_OF.find(([re]) => re.test(id)) || [])[1] || null;
  O.slotOf = slotOf;
  const is2H = id => /weapon_2h_/.test(id);
  /* Tipos de arma: dano = FormulaDamage × DamageCategory; velocidade = 1.118^(cat−3) × 1.25 (da_tq2_item_stats_general) */
  const SPD = n => Math.pow(1.118, n - 3) * 1.25;
  O.WEAPONS = [
    { id: '1h_blunt', name: 'Maça 1 mão', h: 1, dmg: 1.2, spd: SPD(2), melee: true },
    { id: '1h_axe', name: 'Machado 1 mão', h: 1, dmg: 1.0, spd: SPD(3), melee: true },
    { id: '1h_spear', name: 'Lança 1 mão', h: 1, dmg: 0.83, spd: SPD(4), melee: true },
    { id: '1h_sword', name: 'Espada 1 mão', h: 1, dmg: 0.83, spd: SPD(4), melee: true },
    { id: '1h_dagger', name: 'Adaga', h: 1, dmg: 0.83, spd: SPD(5), melee: true },
    { id: '2h_blunt', name: 'Maça 2 mãos', h: 2, dmg: 1.73, spd: SPD(1), melee: true },
    { id: '2h_axe', name: 'Machado 2 mãos', h: 2, dmg: 1.44, spd: SPD(2), melee: true },
    { id: '2h_axe_light', name: 'Machado leve 2 mãos', h: 2, dmg: 1.2, spd: SPD(3), melee: true },
    { id: '2h_bow', name: 'Arco', h: 2, dmg: 1.2, spd: SPD(3), ranged: true },
    { id: '2h_bow_heavy', name: 'Arco pesado', h: 2, dmg: 1.44, spd: SPD(2), ranged: true }
  ];

  const tierAt = (a, L) => {
    const ok = a.tiers.filter(t => t.lv[0] != null && t.lv[0] <= L && (t.lv[1] == null || t.lv[1] >= L) && t.fx.every(f => f.base[0] != null));
    return ok.length ? { t: ok[ok.length - 1], n: a.tiers.indexOf(ok[ok.length - 1]) + 1 } : null;
  };
  /* Texto do afixo com o valor médio do tier no seu nível */
  function affixStats(id, a, L, ctx) {
    const ti = tierAt(a, L); if (!ti) return null;
    const stats = a.text.map((tpl, j) => {
      if (!tpl) return null;
      const r = ti.t.fx[j] ? ti.t.fx[j][ctx] || ti.t.fx[j].base : null; if (!r || r[0] == null) return null;
      const v = Math.round((r[0] + r[1]) / 2);
      if (/\{Decimal\}/.test(tpl)) return null;
      const text = tpl.replace(/\{Value\}\|fmt\(sign=true\)/, '+' + v).replace(/\{Value\}/g, v).replace(/\\r\\n/g, ' ');
      return { affix: 'da_' + id, v, text };
    }).filter(Boolean);
    return stats.length ? { stats, tier: ti.n, range: ti.t.fx[0][ctx] || ti.t.fx[0].base } : null;
  }
  const isDamageText = t => C.parse(t, {}).some(e => ['inc', 'more', 'flat', 'speed', 'attr', 'weaponInc', 'conv', 'rageEffect'].includes(e.kind));

  /* Valor de cada afixo atual (quanto o DPS cai sem ele) */
  function affixValues(B, M, gear, baseX) {
    const out = [];
    gear.forEach((g, gi) => {
      if (g.slot >= 14) return;
      const seen = new Set();
      g.stats.forEach(s => {
        if (!s.text || seen.has(s.affix)) return; seen.add(s.affix);
        const G = clone(gear); G[gi].stats = G[gi].stats.filter(x => x.affix !== s.affix);
        const x = metric(evaluate(B, M, { gear: G }));
        out.push({ gi, slot: g.slot, item: g.item, affix: s.affix, text: g.stats.filter(x => x.affix === s.affix).map(x => x.text).join(' · '), loss: baseX ? (baseX - x) / baseX : 0 });
      });
    });
    return out;
  }
  function genGear(B, M, baseX) {
    const P = window.TQ2_AFFIX_POOL; const gear = clone(C.curGear());
    const res = { values: [], swaps: [], weapons: [] };
    if (!gear.length || !C.T.gear) return res;
    const L = C.T.level;
    res.values = affixValues(B, M, gear, baseX);
    // troca de afixo: o afixo mais fraco de cada item (mesmo tipo prefixo/sufixo) pelo melhor que pode sair no slot
    if (P) gear.forEach((g, gi) => {
      if (g.slot >= 14 || /unique|questreward/.test(g.item)) return;
      const sl = slotOf(g.item); if (!sl || !P.slots[sl]) return;
      const ctx = is2H(g.item) ? '2h' : sl === 'Ring' ? 'ring' : 'base';
      const have = new Set(g.stats.map(s => s.affix));
      const vals = res.values.filter(v => v.gi === gi && !/implicit/.test(v.affix));
      let best = null;
      ['prefix', 'suffix'].forEach(kind => {
        const cand = vals.filter(v => v.affix.includes('_' + kind + '_')).sort((a, b) => a.loss - b.loss)[0];
        if (!cand) return;
        P.slots[sl].forEach(id => {
          const a = P.affixes[id]; if (!a || a.pre !== (kind === 'prefix') || have.has('da_' + id)) return;
          const st = affixStats(id, a, L, ctx); if (!st || !st.stats.some(s => isDamageText(s.text))) return;
          const G = clone(gear); G[gi].stats = G[gi].stats.filter(x => x.affix !== cand.affix).concat(st.stats);
          const x = metric(evaluate(B, M, { gear: G }));
          if (!best || x > best.x) best = { x, gi, slot: g.slot, item: g.item, out: cand, inn: st, G };
        });
      });
      if (best && best.x > baseX * 1.002) res.swaps.push({ ...best, gain: (best.x - baseX) / baseX });
    });
    res.swaps.sort((a, b) => b.gain - a.gain);
    // armas
    const R0 = evaluate(B, M);
    const ws = gear.filter(g => g.slot < 14 && g.BaseAttackDamage > 1);
    if (R0 && R0.def && R0.def.kind === 'weapon' && ws.length) {
      const melee = (R0.skillTags || []).includes('melee');
      const main = ws[0], off = ws[1];
      const vMain = res.values.filter(v => v.slot === main.slot).reduce((a, v) => a + v.loss, 0);
      const vOff = off ? res.values.filter(v => v.slot === off.slot).reduce((a, v) => a + v.loss, 0) : -1;
      const bestW = vOff > vMain ? off : main;
      const types = (main.item.match(/_((?:strike|pierce|fire|cold|lightning|poison|vitality)(?:-(?:strike|pierce|fire|cold|lightning|poison|vitality))?)_/) || [, 'strike'])[1];
      const mk = (w, slot, stats) => ({ slot, item: `da_weapon_${w.id.replace(/_light|_heavy/, '')}_normal_${types}_x`, level: L, rarity: 'Rare', stats, BaseAttackDamage: Math.round(C.wds(L) * w.dmg), AttackDamageVariance: main.AttackDamageVariance || 0.1, AttackSpeedFactor: w.spd });
      const scale = (stats, f) => stats.map(s => ({ ...s, text: s.text && isDamageText(s.text) ? s.text.replace(/\d+(?:\.\d+)?/, n => String(Math.round(+n * f))) : s.text }));
      O.WEAPONS.filter(w => (melee ? w.melee : true)).forEach(w => {
        let G = gear.filter(g => !ws.includes(g));
        if (w.h === 1) {
          G = G.concat(ws.map((g, i) => mk(w, g.slot, clone(g.stats))));
        } else {
          G = G.filter(g => g.slot !== (off ? off.slot : 5) || g.slot >= 14).concat([mk(w, main.slot, scale(clone(bestW.stats), 1.7))]);
          G = G.filter(g => !(off && g.slot === off.slot));
        }
        const R = evaluate(B, M, { gear: G });
        res.weapons.push({ w, base: Math.round(C.wds(L) * w.dmg), x: metric(R), hit: R.total, gain: baseX ? (metric(R) - baseX) / baseX : 0, dual: w.h === 1 && ws.length > 1 });
      });
      res.weapons.sort((a, b) => b.x - a.x);
      res.current = ws.map(g => ({ item: g.item, base: g.BaseAttackDamage, spd: g.AttackSpeedFactor, level: g.level }));
    }
    return res;
  }

  /* ---------- Ponto de entrada ---------- */
  O.run = function (B0, M) {
    const t0 = Date.now();
    // só as masteries da build: a que foi preenchida sozinha (save com uma mastery) fica de fora se não tiver pontos
    const hasPts = mk => Object.keys(B0.sk).some(k => k.startsWith(mk + '|') && B0.sk[k].l);
    const B = { slots: B0.slots.filter(mk => mk !== C.T.autoSlot || hasPts(mk)), sk: B0.sk };
    const st = stOf(B);
    O._baseLimits = C.limits(B, st);
    const R0 = evaluate(B, M), base = metric(R0);
    O._otherSkills = []; O._baseRough = !!(R0 && R0.perSecRough);
    const out = { base, R0, at: Date.now(), sig: O.sig(B0) };
    if (!R0 || R0.error) { out.error = R0 ? R0.error : 'Sem cálculo'; O._baseLimits = null; return out; }
    let REL; try { REL = C.relevance(B, M, st, B.slots); } catch (e) { REL = new Map(); }
    const all = [].concat(genMods(B, M, base), genFeats(B, M, base), genPoints(B, M, base, REL), genSkills(B, M, base));
    all.forEach(c => { c.gain = (c.x - base) / base; });
    all.sort((a, b) => b.gain - a.gain);
    const pick = [], used = new Set();
    all.forEach(c => { if (pick.length < 3 && c.gain > 0.001 && !used.has(c.target)) { pick.push(c); used.add(c.target); } });
    pick.forEach(c => { c.B = { ...c.B, slots: B0.slots.slice() }; });
    out.suggestions = pick;
    out.masteries = B.slots.slice();
    out.otherSkills = O._otherSkills.sort((a, b) => b.x - a.x);
    out.baseRough = O._baseRough;
    out.gear = genGear(B, M, base);
    out.ms = Date.now() - t0;
    O._baseLimits = null;
    return out;
  };
  O.sig = B => JSON.stringify([B.slots, B.sk, C.T.skill, C.T.level, C.T.gear, C.T.save, C.T.weapon, C.T.situ, C.T.rof, C.T.valor, C.T.banner, C.T.res, C.T.rage, C.T.amplify, C.T.rampSec]);
})();
