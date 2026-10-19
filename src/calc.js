/* Calculadora de dano real do Atlas TQ2.
   Regras e números lidos nos arquivos do jogo (Early Access 0.7.0, changelist 137244).
   Confirmado nos dados:
   - Conversão acontece antes de qualquer escala (texto oficial "Conversion").
   - Bônus "increased" são modificadores do atributo AbilityDamage. Os do mesmo canal somam;
     canais diferentes multiplicam (canal 0 = increased comuns, canal 3 = "Total Damage" e afins).
   - Fórmulas de skills/modificadores (Whirlwind 20%, Ramp Up, Rage Gain, Fire Imbuement etc.).
   Estimado (o jogo calcula em C++): bônus de dano por atributo (Fitness/Resolve/Cunning). */
(function () {
  const C = (window.TQ2CALC = {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ---------- Fórmulas do jogo ---------- */
  C.wds = L => 8 * 0.25 + 8 * (0.2 * L + 0.8 * Math.pow(1.05, L - 1)); // Item.WeaponDamageScaling
  C.spd = L => clamp(0.01 * (L - 2), 0, 0.4) + clamp(0.01 * (L - 2), 0, 0.1); // ExpectedDmgScaling_Speed
  C.weaponSkillStrong = (b, L) => b * (1 + C.spd(L));
  C.pwf = L => C.wds(L) / 10;
  C.pff = L => C.pwf(L) * (1 / (1 + Math.pow(300, -((L - 1) / 60 - 22 / 60)))) * 1.2;
  C.skillWeak = (b, L) => b * (C.pwf(L) + C.pff(L));
  C.skillMedium = (b, L) => C.skillWeak(b, L) * (1 + 0.5 * C.spd(L));
  C.skillStrong = (b, L) => C.skillWeak(b, L) * (1 + C.spd(L));
  C.INITIAL_ATTR = 50;      // desc_tq2_character: 50 em cada atributo
  C.ATTR_PER_POINT = 5;     // da_tq2_character_table: AttributeIncreasePerPoint

  const TYPES = ['strike', 'pierce', 'fire', 'cold', 'lightning', 'poison', 'vitality', 'spirit', 'true'];
  const TNAME = { strike: 'Strike', pierce: 'Pierce', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', poison: 'Poison', vitality: 'Vitality', spirit: 'Spirit', true: 'True' };
  // st_attributes / Damage_*_1Description: Fitness → Strike/Pierce, Resolve → Fire/Cold, Cunning → Lightning/Poison; Spirit/Vitality usam o maior
  const ATTR_OF = { strike: 'fitness', pierce: 'fitness', fire: 'resolve', cold: 'resolve', lightning: 'cunning', poison: 'cunning', vitality: 'highest', spirit: 'highest' };
  C.TNAME = TNAME;

  /* ---------- Leitura de textos de efeito ---------- */
  const GROUPS = [
    [/\bPhysical\b/i, ['strike', 'pierce']], [/\bElemental\b/i, ['fire', 'cold', 'lightning']], [/\bThermal\b/i, ['fire', 'cold']],
    [/\bFire\b/i, ['fire']], [/\bCold\b/i, ['cold']], [/\bLightning\b/i, ['lightning']], [/\bPoison\b/i, ['poison']],
    [/\bVitality\b/i, ['vitality']], [/\bSpirit\b/i, ['spirit']], [/\bStrike\b/i, ['strike']], [/\bPierce\b/i, ['pierce']]
  ];
  const DOT = /\b(Burn|Bleed|Ailment|over Time|Doom|Rupture|Shock|Chill|Plague|Stagger|Ignite)\b/i;

  function typesOf(p) {
    const s = new Set();
    GROUPS.forEach(([re, ts]) => { if (re.test(p)) ts.forEach(t => s.add(t)); });
    return s.size ? [...s] : null;
  }
  function reqOf(p) {
    const r = [];
    if (/Weapon Attack|Weapon Damage|\bWeapon\b/i.test(p)) r.push('weapon');
    else if (/\bAttack\b/i.test(p)) r.push('attack');
    if (/\bSpell\b/i.test(p)) r.push('spell');
    if (/\bArea\b/i.test(p)) r.push('area');
    if (/\bProjectile\b/i.test(p)) r.push('projectile');
    if (/Overload abilit/i.test(p)) r.push('overload');
    if (/\bSoulburn\b/i.test(p)) r.push('soulburn');
    if (/\bInfusion\b/i.test(p)) r.push('infusion');
    return r;
  }

  /* ---------- Situações de combate ----------
     Bônus que só valem em certas condições viram uma chave (liga/desliga) ou um contador na calculadora.
     count: o valor do bônus é multiplicado pelo número escolhido. */
  const SITU = {
    combatRush: { id: 'combatRush', type: 'bool', def: true, label: 'Acertou em Melee no último 1s', hint: 'Combat Rush e os feats "while affected". Com Whirlwind fica sempre ativo.' },
    enemies: { id: 'enemies', type: 'count', def: 3, max: 15, label: 'Inimigos a até 12m', hint: 'Heart of Battle' },
    allies: { id: 'allies', type: 'count', def: 0, max: 6, label: 'Aliados por perto', hint: 'Strategos · Damage per Ally' },
    overload: { id: 'overload', type: 'count', def: 0, max: 10, label: 'Stacks de Overload', hint: 'Bônus por Overload' },
    missingShade: { id: 'missingShade', type: 'count', def: 0, max: 5, label: 'Shades faltando', hint: 'Shadow Force' },
    shadesUsed: { id: 'shadesUsed', type: 'count', def: 0, max: 5, label: 'Shades consumidas nos últimos 5s', hint: 'Toll of Passage' },
    energyCost: { id: 'energyCost', type: 'bool', def: true, label: 'A skill principal custa Energy', hint: 'Bônus "with skills that cost Energy"' },
    summoned: { id: 'summoned', type: 'bool', def: false, label: 'Invocou um Summon nos últimos 5s', hint: 'Shadow Force · Damage on Summoning' },
    infuse1: { id: 'infuse1', type: 'bool', def: false, label: 'Consumiu um Elemental Infusion nos últimos 5s', hint: 'Elemental Utilization' },
    infuse3: { id: 'infuse3', type: 'bool', def: false, label: 'Consumiu os 3 tipos de Infusion nos últimos 5s', hint: 'Elemental Utilization · Elemental Balance' }
  };
  C.SITU = SITU;
  function situOf(cond) {
    if (/^per enemy within/i.test(cond)) return SITU.enemies;
    if (/^per ally/i.test(cond)) return SITU.allies;
    if (/^per Overload/i.test(cond)) return SITU.overload;
    if (/^per missing Shade/i.test(cond)) return SITU.missingShade;
    if (/^per Shade you consumed/i.test(cond)) return SITU.shadesUsed;
    if (/^with skills that cost Energy/i.test(cond)) return SITU.energyCost;
    if (/^on Summoning/i.test(cond)) return SITU.summoned;
    if (/consumed all 3 types of Elemental Infusion/i.test(cond)) return SITU.infuse3;
    if (/consumed an Elemental Infusion/i.test(cond)) return SITU.infuse1;
    let m;
    if (/Crab/i.test(cond)) return null; // colar de Crabs: chave própria (vsCrab)
    if ((m = cond.match(/^to (?:your )?(.+)$/i))) {
      const st = m[1].replace(/ Creatures$/i, 's');
      return { id: 'vs:' + st.toLowerCase(), type: 'bool', def: false, label: /Mark/i.test(st) ? 'Atacando o seu Mark' : 'Inimigo: ' + st, hint: 'Bônus "Damage to ' + m[1] + '"' };
    }
    if ((m = cond.match(/^against (?:your )?(.+?)(?: enemies)?$/i))) {
      const st = m[1].replace(/^enemies with /i, '');
      return { id: 'vs:' + st.toLowerCase(), type: 'bool', def: false, label: 'Inimigo ' + st, hint: 'Bônus "against ' + m[1] + '"' };
    }
    return null;
  }
  C.situVal = function (si) { const T = C.T; const v = (T.situ || {})[si.id]; return v == null ? si.def : v; };

  /* Converte uma frase ("52% increased Fire Damage", "+7 Weapon Fire Damage"...) em efeitos. */
  C.parse = function (text, ctx) {
    const out = [];
    if (!text) return out;
    const whole = String(text);
    const summon = /^\s*Summons? have|Your Summons|Summons have/i.test(whole);
    const parts = whole.split(/[;,]\s*|\.\s+|\n/).map(s => s.trim()).filter(Boolean);
    parts.forEach(seg => {
      let m;
      const base = { text: seg, src: ctx && ctx.src };
      if (summon || /^Summons?\b/i.test(seg)) { out.push({ ...base, kind: 'other', why: 'Bônus para Summons, não para você' }); return; }
      // +nível em passivas (equipamento): "+1 Level to Warfare Tier 2 Passive Skills", "+1 Level to all Passive Skills"
      if ((m = seg.match(/^\+?(\d+)\s+Levels?\s+to\s+(?:all\s+)?(?:(Earth|Warfare|Storm|Rogue|Forge|Spirit)\s+)?(?:Tier\s+(\d)\s+)?Passive Skills/i))) {
        out.push({ ...base, kind: 'plevel', val: +m[1], mk: m[2] ? m[2].toLowerCase() : null, tier: m[3] ? +m[3] : null }); return;
      }
      if ((m = seg.match(/^\+?(\d+)\s+Capacity\s+to\s+(?:all\s+)?(?:(Earth|Warfare|Storm|Rogue|Forge|Spirit)\s+)?(?:Tier\s+(\d)\s+)?Active Skills/i))) {
        out.push({ ...base, kind: 'cap', val: +m[1], mk: m[2] ? m[2].toLowerCase() : null, tier: m[3] ? +m[3] : null }); return;
      }
      // Crítico
      if ((m = seg.match(/^\+?(\d+(?:\.\d+)?)%\s+(Spell\s+|Attack\s+)?Critical Hit Chance(\s+with Weapon Attacks|\s+with Spells)?$/i))) {
        out.push({ ...base, kind: 'crit', val: +m[1], req: /Spell/i.test((m[2] || '') + (m[3] || '')) ? 'spell' : /Weapon|Attack/i.test((m[2] || '') + (m[3] || '')) ? 'weapon' : null }); return;
      }
      if ((m = seg.match(/^(\d+(?:\.\d+)?)%\s+increased\s+Critical Hit Chance$/i))) { out.push({ ...base, kind: 'critInc', val: +m[1] }); return; }
      if ((m = seg.match(/^\+?(\d+(?:\.\d+)?)%\s+Critical Damage(?: Multiplier)?$/i))) { out.push({ ...base, kind: 'critDmg', val: +m[1] }); return; }
      // Energia e cooldown
      const res = (stat, val) => out.push({ ...base, kind: 'res', stat, val });
      if ((m = seg.match(/^([+\-−]?\d+(?:\.\d+)?)\s+Energy reserved(?:\s+per rank)?$/i))) { res('reserved', +m[1].replace('−', '-')); return; }
      if ((m = seg.match(/^\+?(\d+(?:\.\d+)?)\s+Free Energy Reservation/i))) { res('freeRes', +m[1]); return; }
      if ((m = seg.match(/^\+?(\d+(?:\.\d+)?)\s+Energy Regeneration per second/i)) || (m = seg.match(/^Regenerate\s+(\d+(?:\.\d+)?)\s+Energy per second/i))) { res('regen', +m[1]); return; }
      if ((m = seg.match(/(\d+(?:\.\d+)?)%\s+(increased|reduced)\s+Energy Regeneration$/i))) { res('regenPct', +m[1] * (/reduced/i.test(m[2]) ? -1 : 1)); return; }
      if ((m = seg.match(/(\d+(?:\.\d+)?)%\s+increased\s+(?:Maximum\s+)?Energy$/i))) { res('maxPct', +m[1]); return; }
      if ((m = seg.match(/(\d+(?:\.\d+)?)%\s+Energy cost reduction/i)) || (m = seg.match(/(\d+(?:\.\d+)?)%\s+(?:less|reduced)\s+Energy Cost/i))) { res('costRed', +m[1]); return; }
      if ((m = seg.match(/(\d+(?:\.\d+)?)%\s+increased\s+Cooldown Rate$/i))) { res('cdr', +m[1]); return; }
      if ((m = seg.match(/^([+\-−]?\d+(?:\.\d+)?)\s+Energy(\/s| per second)?(?:\s+per rank)?$/i)) || (m = seg.match(/^\+?(\d+(?:\.\d+)?)\s+Maximum Energy$/i))) {
        const v = +String(m[1]).replace('−', '-');
        if (ctx && ctx.mod) res(m[2] ? 'drain' : 'cost', v); else res('max', v);
        return;
      }
      if (/explosion|explodes?|sword drop|Lightning Strike/i.test(whole)) { out.push({ ...base, kind: 'other', why: 'Vale só para outro efeito (explosão/golpe extra), não para a skill' }); return; }
      if ((m = seg.match(/([+-]?\d+(?:\.\d+)?)%\s+(?:of\s+)?(?:your\s+)?Weapon(?:'s)? Damage converted to (\w+)/i)) ||
          (m = seg.match(/([+-]?\d+(?:\.\d+)?)%\s+(?:of\s+)?Damage converted to (\w+)/i)) ||
          (m = seg.match(/Convert (\d+(?:\.\d+)?)% of (?:your\s+)?Weapon(?:'s)? (?:D|d)amage to (\w+)/i))) {
        const t = (typesOf(m[2]) || [])[0];
        if (t) { out.push({ ...base, kind: 'conv', to: t, val: +m[1], weaponOnly: /Weapon/i.test(seg) }); return; }
      }
      if ((m = seg.match(/^\+?(\d+(?:\.\d+)?)\s+(Might|Agility|Knowledge|Vigor|Fitness|Resolve|Cunning)\b/i))) {
        out.push({ ...base, kind: 'attr', attr: m[2].toLowerCase(), val: +m[1] }); return;
      }
      if ((m = seg.match(/^\+?(\d+(?:\.\d+)?)\s+((?:Fire|Cold|Lightning|Poison|Strike|Pierce|Vitality|Spirit)\s+)?Weapon\s+((?:Fire|Cold|Lightning|Poison|Strike|Pierce|Vitality|Spirit)\s+)?Damage/i)) ||
          (m = seg.match(/^\+?(\d+(?:\.\d+)?)\s+Weapon\s+(\w+)\s+Damage/i))) {
        const t = typesOf((m[2] || '') + ' ' + (m[3] || ''));
        if (t) { out.push({ ...base, kind: 'flat', type: t[0], val: +m[1] }); return; }
      }
      if ((m = seg.match(/([+-]?\d+(?:\.\d+)?)%\s+(increased|reduced|more|less)\s+(.+)/i))) {
        const val = +m[1] * (/reduced|less/i.test(m[2]) ? -1 : 1);
        const more = /more|less/i.test(m[2]);
        const phrase = m[3];
        if (/Attack Speed|All Speed|Skill Speed|Action Speed|Cast Speed/i.test(phrase) && !/Damage|Movement/i.test(phrase)) {
          const sp = /Attack and Cast|All Speed|Skill Speed|Action Speed/i.test(phrase) ? 'all' : /Cast/i.test(phrase) ? 'cast' : 'attack';
          out.push({ ...base, kind: 'speed', val, speed: sp }); return;
        }
        if (/Rage Effect/i.test(phrase)) { out.push({ ...base, kind: 'rageEffect', val }); return; }
        if (/Rage Duration/i.test(phrase)) { out.push({ ...base, kind: 'rageDur', val }); return; }
        if (!/Damage/i.test(phrase) || /Damage taken|less Damage Taken|Damage from/i.test(phrase)) { out.push({ ...base, kind: 'other', why: 'Não é bônus de dano' }); return; }
        const pre = phrase.split(/Damage/i)[0];
        const post = phrase.split(/Damage/i).slice(1).join(' ');
        if (/Retaliation/i.test(pre)) { out.push({ ...base, kind: 'other', why: 'Só vale para Retaliation' }); return; }
        if (DOT.test(pre)) { out.push({ ...base, kind: 'other', why: 'Só vale para dano de Ailment/DoT, não para o acerto' }); return; }
        const e = { ...base, kind: more ? 'more' : 'inc', val, types: typesOf(pre), req: reqOf(pre + ' ' + post), ch: /\bTotal\b/i.test(pre) ? 3 : 0 };
        let cond = (post.match(/\b(against|per|while|when|if|on|after|with|to)\b.*$/i) || [null])[0];
        if (cond) cond = cond.trim();
        if (cond && /^per rank\b/i.test(cond)) cond = null; // o rank já é multiplicado na coleta
        if (cond && /^with (Weapon Attacks|Spells|Attacks|active skills)\b/i.test(cond)) cond = null;
        if (cond && /^with (?:skills tagged )?(?:both )?(Overload|Infusion|Soulburn)/i.test(cond)) cond = null; // requisito de tag (reqOf já leu)
        if (cond && /^with Elemental Ailments/i.test(cond)) { out.push({ ...base, kind: 'other', why: 'Só vale para dano de Ailment/DoT, não para o acerto' }); return; }
        if (cond) { const si = situOf(cond); if (si) { e.situ = si; cond = null; } }
        if (cond) e.cond = cond;
        if (/On Melee hit|Melee skill/i.test(whole)) { e.cond = null; e.req.push('melee'); }
        // Combat Rush: o bônus dura 1s depois de um acerto Melee; os feats "while affected" dependem dele
        if (/On Melee hit|while affected/i.test(whole)) { e.cond = null; e.situ = SITU.combatRush; if (!e.req.includes('melee')) e.req.push('melee'); if (/while affected/i.test(whole) && /Weapon Damage/i.test(phrase)) e.local = true; }
        out.push(e); return;
      }
      if ((m = seg.match(/([+-]?\d+(?:\.\d+)?)%\s+(?:Fire|Cold|Lightning|Poison|Physical|Strike|Pierce|Vitality|Elemental)?\s*Penetration/i))) { out.push({ ...base, kind: 'pen', val: +m[1], types: typesOf(seg) }); return; }
      out.push({ ...base, kind: 'other', why: 'Não é bônus de dano' });
    });
    return out;
  };

  /* ---------- Skills com fórmula conhecida ---------- */
  // pct: fração do dano da arma por acerto, já com a escala do nível do personagem.
  C.SKILLS = {
    'warfare|Sweeping Strike': {
      kind: 'weapon', tags: ['attack', 'weapon', 'melee', 'area'],
      pct: L => C.weaponSkillStrong(1.2, L), hitLabel: 'golpe', hitsPerSec: null,
      mods: {
        'Whirlwind': r => r ? { setPct: 0.2, label: 'Whirlwind: 20% Weapon Damage por acerto, a cada 0.25s', tick: 0.25, hitLabel: 'acerto do giro', addTags: ['channel'], channelCost: sp => 10 / sp * 4 * sp, startCost: 20, tickMods: { 'Ramp Up': 1, 'Rage Gain': 1 } } : null,
        'Ramp Up': (r, T) => r ? { more: 0.1 * r * clamp(T.rampSec, 0, 3) / 3, label: `Ramp Up ${r}: até ${10 * r}% more após 3s (agora ${T.rampSec}s)` } : null,
        'Rage Gain': (r, T) => r ? { more: 0.01 * r * T.rage, label: `Rage Gain ${r}: ${r}% more por Rage × ${T.rage}` } : null,
        'Deadly Reach': (r, T) => r && T.edge ? { more: 0.2 * r, label: `Deadly Reach ${r}: ${20 * r}% more na borda` } : null,
        'Consume Overwhelm': (r, T) => r && T.overwhelm ? { more: 0.1 * r, label: `Consume Overwhelm ${r}: ${10 * r}% more` } : null,
        'Lasting Sweep': () => null, 'Lasting Whirl': () => null, 'Sunder': () => null, 'Siphon': (r) => r ? { more: -0.1 * r, label: 'Siphon: menos dano de arma' } : null,
        'Concentrated Fury': (r, T) => r ? { more: 0.1 * r * T.rage / 5, label: 'Concentrated Fury (estimado)' } : null
      }
    },
    // bp_balancing_player_wf_heavyAttack: ActionSpeed = 1 + (AttackSpeedFactor − 1) × 0,3
    'warfare|Heavy Attack': {
      kind: 'weapon', tags: ['attack', 'weapon', 'melee', 'projectile'], pct: L => C.weaponSkillStrong(1.8, L), hitLabel: 'golpe', speedScale: 0.3,
      mods: {
        'Raging Attack': (r, T) => r ? { more: 0.02 * r * T.rage, label: `Raging Attack: ${2 * r}% more por Rage` } : null,
        'Wind Up': r => r ? { more: 0.15 * r, label: `Wind Up: ${15 * r}% more` } : null,
        'Staggering Force': r => r ? { more: 0.05 * r, label: `Staggering Force: ${5 * r}% more` } : null,
        'Second Hit': r => r ? { more: -0.3, label: 'Second Hit: 30% less por golpe (2 golpes)' } : null
      }
    },
    'warfare|Barrage': { kind: 'weapon', tags: ['attack', 'weapon', 'projectile'], pct: L => C.weaponSkillStrong(0.35, L), hitLabel: 'disparo', hits: 5, generic: true, mods: {
      'Extended Barrage': r => r ? { hits: 8, label: 'Extended Barrage: 8 ataques' } : null } },
    'warfare|Rain of Arrows': { kind: 'weapon', tags: ['attack', 'weapon', 'area'], pct: L => C.weaponSkillStrong(0.5, L), hitLabel: 'onda', hits: 3, generic: true, mods: {
      'Downpour': r => r ? { hits: 3 + r, more: -0.05 * r, label: `Downpour: ${3 + r} ondas, ${5 * r}% less` } : null } },
    // bp_balancing_player_wf_leapSlam: LandingDamage = SkillDmgStrong(20); Slam Attack = 210% Weapon Damage
    'warfare|Leap': { kind: 'spell', tags: ['area'], types: { strike: 1 }, base: L => C.skillStrong(20, L), hitLabel: 'impacto', generic: true, critBase: 5, mods: {
      'Slam Attack': r => r ? { weapon: L => C.weaponSkillStrong(2.1, L), addTags: ['attack', 'weapon', 'melee'], label: 'Slam Attack: 210% Weapon Damage' } : null } },
    // da_balancing_player_wf_stomp: SkillDmgStrong(9) × (1 + 0,05 × (nível − 1))
    'warfare|Stomp': { kind: 'spell', tags: ['area'], types: { strike: 1 }, base: L => C.skillStrong(9, L) * (1 + 0.05 * (L - 1)), hitLabel: 'pisão', generic: true, critBase: 5, mods: {} },
    'earth|Ring of Flame': { kind: 'spell', tags: ['spell', 'area'], types: { fire: 1 }, base: (L, T) => C.skillWeak(1.75, L) * (1 + 0.15 * T.amplify), hitLabel: 'pulso (a cada 0.5s)', tick: 0.5, mods: {} },
    // ---- Earth (da_balancing_player_ea_*) ----
    'earth|Fissure': { kind: 'spell', tags: ['spell', 'area'], types: { strike: 1 }, base: L => C.skillStrong(16, L), hitLabel: 'fissura', generic: true, critBase: 5, mods: {
      'Spikes': r => r ? { convert: 'pierce', label: 'Spikes: 100% convertido em Pierce' } : null,
      'Slam Attack': r => r ? { weapon: L => C.weaponSkillStrong(1.6, L) / (1 + C.spd(L)) * (1 + C.spd(L)), addTags: ['attack', 'weapon', 'melee'], label: 'Slam Attack: 160% Weapon Damage' } : null } },
    'earth|Roiling Magma': { kind: 'spell', tags: ['spell', 'area', 'projectile'], types: { fire: 1 }, base: L => C.skillStrong(16, L), hitLabel: 'explosão', generic: true, critBase: 5, mods: {} },
    'earth|Flame Volley': { kind: 'spell', tags: ['spell', 'projectile', 'channel'], types: { fire: 1 }, base: L => C.skillWeak(5, L), hitLabel: 'projétil', generic: true, critBase: 5,
      note: 'Cada tiro gasta 1 Amplify (ganho a cada 15 Energy gasta em outras skills); o cálculo assume Amplify disponível.', mods: {} },
    // Earthquake: estágio a cada 1s; soltar no estágio 2 = 120% more (PerStageDmgFactor 1.2)
    'earth|Earthquake': { kind: 'spell', tags: ['spell', 'area', 'channel'], types: { strike: 1 }, base: L => C.skillStrong(18, L) * 2.2, hitLabel: 'tremor (estágio 2)', generic: true, critBase: 5, time: 2, mods: {} },
    'earth|Ignite': { kind: 'spell', tags: ['spell'], types: { fire: 1 }, base: L => C.skillWeak(6, L), hitLabel: 'tick (a cada 0.5s)', generic: true, dot: { tick: 0.5, dur: 4 }, mods: {} },
    'earth|Volcanic Eruption': { kind: 'spell', tags: ['spell', 'area'], types: { strike: 10 / 28, fire: 18 / 28 }, base: L => C.skillWeak(28, L), hitLabel: 'quebra + erupção', generic: true, critBase: 5, mods: {} },
    // ---- Rogue ----
    'rogue|Lethal Strike': { kind: 'weapon', tags: ['attack', 'weapon', 'melee'], pct: L => C.weaponSkillStrong(2, L), hitLabel: 'golpe', generic: true, weaponCrit: 1, mods: {} },
    'rogue|Trick Shot': { kind: 'spell', tags: ['attack', 'projectile'], types: { pierce: 1 }, base: L => C.skillStrong(13, L), hitLabel: 'lâmina', generic: true, critBase: 10, mods: {} },
    'rogue|Grenade': { kind: 'spell', tags: ['projectile', 'area'], types: { fire: 1 }, base: L => C.skillStrong(10, L), hitLabel: 'explosão', generic: true, critBase: 5, mods: {
      'Poison Grenade': r => r ? { convert: 'poison', label: 'Poison Grenade: 100% convertido em Poison' } : null } },
    // Scattershot: 5 projéteis; acertos extras no mesmo alvo com 80% less (RepeatDmgMultiplier 0.2); velocidade × 0,8
    'rogue|Scattershot': { kind: 'weapon', tags: ['attack', 'weapon', 'projectile'], pct: L => C.weaponSkillStrong(1, L), hitLabel: 'projétil', hits: 1 + 4 * 0.2, speedMul: 0.8, generic: true, weaponCrit: 1, mods: {} },
    'rogue|Bladespin': { kind: 'weapon', tags: ['attack', 'weapon', 'melee', 'area'], pct: L => C.weaponSkillStrong(1.1, L), hitLabel: 'giro', speedMul: 1.1, generic: true, weaponCrit: 1, mods: {} },
    // ---- Storm ----
    'storm|Ice Shards': { kind: 'spell', tags: ['spell', 'projectile'], types: { cold: 1 }, base: L => C.skillWeak(6, L), hitLabel: 'estilhaço', hits: 1 + 4 * 0.2, generic: true, critBase: 5, mods: {} },
    'storm|Call Lightning': { kind: 'spell', tags: ['spell', 'area'], types: { lightning: 1 }, base: L => C.skillWeak(13, L), hitLabel: 'raio', generic: true, critBase: 5, mods: {} },
    'storm|Ice Nova': { kind: 'spell', tags: ['spell', 'area'], types: { cold: 1 }, base: L => C.skillStrong(12, L), hitLabel: 'nova', generic: true, critBase: 5, mods: {} },
    'storm|Cyclone': { kind: 'spell', tags: ['spell', 'area'], types: { cold: 1 }, base: (L, T) => C.skillStrong(4, L), hitLabel: 'tick (a cada 1s)', generic: true, critBase: 5, dot: { tick: 1, dur: 10 },
      note: 'Até 5% more por Amplify (máx. 10), que vem de usar outras skills de Fire, Cold ou Lightning; não somado.', mods: {} },
    'storm|Frostbite': { kind: 'spell', tags: ['spell'], types: { cold: 1 }, base: L => C.skillWeak(3, L), hitLabel: 'tick (a cada 0.5s)', generic: true, dot: { tick: 0.5, dur: 5 }, mods: {} },
    'storm|Lightning Bolt': { kind: 'spell', tags: ['spell', 'projectile'], types: { lightning: 1 }, base: L => C.skillWeak(12, L), hitLabel: 'raio', generic: true, critBase: 5, mods: {
      'Weapon Attack': r => r ? { weapon: L => C.weaponSkillStrong(1.2, L), convert: 'lightning', addTags: ['attack', 'weapon'], label: 'Weapon Attack: 120% Weapon Damage como Lightning' } : null } },
    // ---- Forge ----
    'forge|Minefield': { kind: 'spell', tags: ['spell', 'area'], types: { strike: 1 }, base: L => C.skillStrong(13.5, L), hitLabel: 'mina', generic: true, critBase: 5,
      note: 'Conta uma mina por alvo; minas seguidas no mesmo alvo dão 40% less.', mods: {} },
    'forge|Armor Eruption': { kind: 'spell', tags: ['area', 'projectile'], types: { strike: 7 / 12, pierce: 5 / 12 }, base: L => C.skillWeak(12, L), hitLabel: 'explosão', generic: true, critBase: 5,
      note: 'O jogo aumenta o dano com a sua Armor; aqui é o valor base.', mods: {} },
    // ---- Spirit (da_balancing_player_sp_*: dano = média de VitMinDmg e VitMaxDmg) ----
    'spirit|Chthonic Pulse': { kind: 'spell', tags: ['spell', 'projectile'], types: { vitality: 1 }, base: L => C.skillWeak(10, L), hitLabel: 'projétil', generic: true, critBase: 5,
      note: 'Projétil lento que atravessa todos os inimigos.', mods: {
        'Cold Conversion': r => r ? { convert: 'cold', label: 'Cold Conversion: 100% convertido em Cold' } : null,
        'Poison Conversion': r => r ? { convert: 'poison', label: 'Poison Conversion: 100% convertido em Poison' } : null } },
    'spirit|Reap': { kind: 'weapon', tags: ['spell', 'area'], pct: () => 1, hitLabel: 'corte', generic: true, time: 0.53, critBase: 5,
      note: '100% Weapon Damage em cone de 120° (4m); 10% Lifesteal. Velocidade de cast.', mods: {
        'Weapon Attack': r => r ? { addTags: ['attack', 'weapon', 'melee'], label: 'Weapon Attack: vira ataque com arma' } : null } },
    'spirit|Deathward Beam': { kind: 'spell', tags: ['spell', 'channel'], types: { vitality: 1 }, base: L => C.skillMedium(1.4, L), hitLabel: 'tick do raio (a cada 0.1s)', tick: 0.1, generic: true,
      note: 'Canal: 10 ticks por segundo, não escala com velocidade de cast; atravessa 2 alvos com 70% de dano.', mods: {
        'Cold Conversion': r => r ? { convert: 'cold', label: 'Cold Conversion: 100% convertido em Cold' } : null,
        'Poison Conversion': r => r ? { convert: 'poison', label: 'Poison Conversion: 100% convertido em Poison' } : null } },
    'spirit|Soul Vortex': { kind: 'spell', tags: ['spell', 'area'], types: { vitality: 1 }, base: L => C.skillWeak(7.5, L), hitLabel: 'pulso (a cada 0.8s por 4s)', hits: 5, generic: true, critBase: 5, mods: {} },
    'spirit|Death Nova': { kind: 'spell', tags: ['spell', 'area', 'projectile'], types: { vitality: 1 }, base: L => C.skillStrong(12.5, L), hitLabel: 'projétil', generic: true, critBase: 5,
      note: '12 projéteis em círculo; conta um por alvo.', mods: {} }
  };

  /* ---------- Efeitos especiais (fórmulas exatas do jogo) ---------- */
  // Retorna efeitos para skills/modificadores cujo texto do Atlas é incompleto.
  C.SPECIAL = {
    'earth|Earth Enchantment': (v, T, L) => {
      const e = [{ kind: 'inc', val: 20, types: ['fire'], req: [], ch: 0, text: 'Aura: 20% increased Fire Damage' },
                 { kind: 'inc', val: 20, types: ['strike', 'pierce'], req: [], ch: 0, text: 'Aura: 20% increased Physical Damage' }];
      const ee = v.m['Earth Enhancement'] || 0;
      if (ee) e.push({ kind: 'inc', val: 8 * ee, types: ['fire'], req: [], ch: 0, text: `Earth Enhancement ${ee}: +${8 * ee}% increased Fire Damage` },
                     { kind: 'inc', val: 8 * ee, types: ['strike', 'pierce'], req: [], ch: 0, text: `Earth Enhancement ${ee}: +${8 * ee}% increased Physical Damage` });
      const fi = v.m['Fire Imbuement'] || 0;
      if (fi) e.push({ kind: 'flat', type: 'fire', val: C.wds(L) * (0.05 + 0.05 * fi), text: `Fire Imbuement ${fi}: +${(C.wds(L) * (0.05 + 0.05 * fi)).toFixed(1)} Fire Weapon Damage` },
                     { kind: 'conv', to: 'fire', val: 30 * fi, weaponOnly: true, text: `Fire Imbuement ${fi}: ${30 * fi}% Weapon Damage converted to Fire` });
      const si = v.m['Strike Imbuement'] || 0;
      if (si) e.push({ kind: 'flat', type: 'strike', val: C.wds(L) * (0.05 + 0.05 * si), text: `Strike Imbuement ${si}: Strike Weapon Damage` },
                     { kind: 'conv', to: 'strike', val: 30 * si, weaponOnly: true, text: `Strike Imbuement ${si}: ${30 * si}% Weapon Damage converted to Strike` });
      return e;
    },
    'earth|Ring of Flame': (v, T) => {
      if (!T.rof) return [{ kind: 'other', text: 'Ring of Flame não está ativo', why: 'Ative "Ring of Flame ativo" para contar o buff' }];
      const e = [{ kind: 'inc', val: 30, types: ['fire'], req: [], ch: 0, text: 'Buff ao usar: 30% increased Fire Damage (6s)' }];
      const ef = v.m['Empowering Flame'] || 0;
      if (ef) e.push({ kind: 'inc', val: 10 * ef, types: null, req: [], ch: 0, text: `Empowering Flame ${ef}: buff com ${10 * ef}% increased Damage` });
      const sw = v.m['Scorching Weapon'] || 0;
      if (sw) {
        const per = sw === 1 ? 1.5 : 2.5;
        e.push({ kind: 'conv', to: 'fire', val: 100, weaponOnly: true, text: 'Scorching Weapon: 100% Weapon Damage converted to Fire' },
               { kind: 'weaponInc', val: per * T.amplify, types: ['fire'], text: `Scorching Weapon ${sw}: ${per}% increased Fire Weapon Damage por Amplify × ${T.amplify}` });
      }
      return e;
    },
    'warfare|Valor': (v, T) => {
      if (!T.valor) return [{ kind: 'other', text: 'Valor não está ativo', why: 'Ative "Valor ativo" para contar o buff' }];
      const e = [{ kind: 'inc', val: 10, types: null, req: [], ch: 3, text: 'Buff: 10% increased Total Damage (6s)' }];
      const fz = v.m['Frenzy'] || 0, ds = v.m['Deadly Strike'] || 0, sd = v.m['Sword of Damocles'] || 0;
      if (fz) e.push({ kind: 'inc', val: 24, types: null, req: [], ch: 3, text: 'Frenzy: buff com 24% increased Total Damage (estimado no rank 1)' });
      if (ds) e.push({ kind: 'inc', val: 8, types: null, req: [], ch: 3, text: 'Deadly Strike: +8% increased Total Damage (estimado no rank 1)' });
      if (sd) e.push({ kind: 'inc', val: 15, types: null, req: [], ch: 3, text: 'Sword of Damocles: +15% increased Total Damage (estimado no rank 1)' });
      if (v.m['Burst of Speed']) e.push({ kind: 'speed', val: 10, text: 'Burst of Speed: 10% Attack e Cast Speed' });
      return e;
    },
    // bp_bge_player_wf_buff_heartOfBattle_p: AbilityDamage × (1 + clamp(DamageBonus × inimigos, 0, Limit))
    // DamageBonus = 0.04 + 0.02 × feat Enhanced Damage; Limit = 0.08 + 0.04 × nível + 0.12 × feat Enhanced Limit
    'warfare|Heart of Battle': (v, T) => {
      const n = C.situVal(SITU.enemies), fd = v.f.includes('Enhanced Damage'), fl = v.f.includes('Enhanced Limit');
      const per = 4 + (fd ? 2 : 0), cap = 8 + 4 * v.l + (fl ? 12 : 0), val = Math.min(n * per, cap);
      const txt = `${per}% increased Damage por inimigo a até 12m × ${n} (limite ${cap}%)`;
      const e = [{ kind: 'inc', val, types: null, req: [], ch: 0, text: txt, situ: SITU.enemies, situDone: true }];
      if (!n) e[0].cond = 'situ';
      v.f.filter(f => f !== 'Enhanced Damage' && f !== 'Enhanced Limit').forEach(f => e.push({ kind: 'other', text: f, why: 'Não é bônus de dano', feat: f }));
      return e;
    },
    'warfare|War Banner': (v, T) => {
      if (!T.banner) return [{ kind: 'other', text: 'Você não está dentro do War Banner', why: 'Ative "Dentro do War Banner" para contar' }];
      const e = [{ kind: 'inc', val: 15, types: null, req: [], ch: 3, text: 'Aura: 15% increased Total Damage' }];
      const r = v.m['Increased Damage'] || 0;
      if (r) e.push({ kind: 'inc', val: 5 * r, types: null, req: [], ch: 3, text: `Increased Damage ${r}: +${r}%/s até +${5 * r}% increased Total Damage (após 5s)` });
      return e;
    }
  };

  /* ---------- Estado da calculadora ---------- */
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  C.T = Object.assign({ skill: 'warfare|Sweeping Strike', level: 34, rof: true, valor: true, banner: false, rage: 13, amplify: 28, rampSec: 3,
    edge: false, overwhelm: false, vsCrab: false, weapon: 'avg', res: { fire: 0, cold: 0, lightning: 0, poison: 0, strike: 0, pierce: 0, vitality: 0 },
    attrOverride: {}, attrFactor: {}, gear: true, save: 0, situ: {}, fight: 30, rageAuto: true }, store.get('tq2-calc-v1') || {});
  if (!C.T.situ) C.T.situ = {};
  if (!C.T.attrFactor) C.T.attrFactor = {};
  C.save = () => store.set('tq2-calc-v1', C.T);

  function curSave() { return (window.TQ2_SAVES || [])[C.T.save] || null; }
  C.curSave = curSave;

  /* Gear: armas da mão principal/secundária e efeitos dos afixos */
  function gearInfo() {
    const sv = curSave();
    const gear = C._gear || (sv && sv.gear);
    if (!gear || !C.T.gear) return { weapons: [], effects: [] };
    const weapons = [], effects = [];
    // duas armas equipadas na mão principal e secundária (slots 4 e 5)?
    C._dualActive = gear.filter(g => g.slot < 14 && g.BaseAttackDamage > 1).length > 1 && C.T.weapon !== 'main' && C.T.weapon !== 'off';
    gear.forEach(g => {
      if (g.slot >= 14) return; // segundo conjunto de armas
      if (g.BaseAttackDamage && g.BaseAttackDamage > 1) {
        const m = g.item.match(/_(strike|pierce|fire|cold|lightning|poison|vitality)(?:-(strike|pierce|fire|cold|lightning|poison|vitality))?_/);
        const ts = m ? [m[1], m[2]].filter(Boolean) : ['strike'];
        weapons.push({ slot: g.slot, item: g.item, base: g.BaseAttackDamage, var: g.AttackDamageVariance || 0.1, speed: g.AttackSpeedFactor || 1,
          split: ts.length === 2 ? { [ts[0]]: 0.501, [ts[1]]: 0.499 } : { [ts[0]]: 1 } });
      }
      const isW = g.BaseAttackDamage && g.BaseAttackDamage > 1;
      // charm/relíquia encaixada: efeitos da quantidade de stacks + bônus de completar
      const so = g.socket && (window.TQ2_SOCKETS || {})[g.socket.id];
      if (so) {
        const n = Math.max(1, Math.min(so.stacks.length, g.socket.stacks || 1));
        const txt = (so.stacks[n - 1] || []).concat(n >= so.stacks.length ? so.complete : []);
        const src = so.name.replace(/\uFFFD/g, "'") + ' (' + n + '/' + so.stacks.length + ')';
        txt.forEach(t => C.parse(t, { src }).forEach(e => { const sc = isW && C._dualActive && C.DUAL_SCOPE.includes('socket') && (e.kind === 'inc' || e.kind === 'more') ? C.DUAL_AFFIX : 1; effects.push({ ...e, val: e.val != null ? e.val * sc : e.val, src, gear: true, gslot: g.slot, socket: true }); }));
      }
      // dano fixo de arma num item de arma vale só para aquela arma
      // dual wield: afixos de dano das armas valem 0,6 (DefaultGame.ini m_DualWieldDamageAffixScale)
      const dualW = isW && C._dualActive;
      g.stats.forEach((s0, si) => { const s = s0.text ? s0 : { ...s0, text: C.statText(s0) }; if (s.text) C.parse(s.text, { src: prettyItem(g.item) }).forEach(e => { const sc = dualW && C.DUAL_SCOPE.includes('affix') && (e.kind === 'inc' || e.kind === 'more') ? C.DUAL_AFFIX : 1; effects.push({ ...e, val: e.val != null ? e.val * sc : e.val, text: sc !== 1 ? (e.text + ' (× 0,6: duas armas)') : e.text, src: prettyItem(g.item), gear: true, gslot: g.slot, gstat: si, wslot: isW && e.kind === 'flat' ? g.slot : undefined }); }); });
    });
    return { weapons, effects };
  }
  function prettyItem(id) {
    return id.replace(/^da_/, '').replace(/_greek|_ichthian|_normal|_t\d/g, '').replace(/_unique|_questreward/g, '').replace(/_/g, ' ').trim();
  }
  C.prettyItem = prettyItem;
  C.gearInfo = gearInfo;
  /* Texto de afixos que o arquivo de textos não cobre (o save traz só o id e o valor) */
  C.statText = function (st) {
    const a = st.affix || '', v = Math.round((+st.v || 0) * 10) / 10, ge = st.ge || '';
    let m;
    if (/FlatEnergyRegen|EnergyRegenPerSecond/.test(a)) return `+${v} Energy Regeneration per second`;
    if ((m = (ge || a).match(/PassiveLevel(Earth|Warfare|Storm|Rogue|Forge|Spirit)T?(\d)?/))) return `+${v} Level to ${m[1]} ${m[2] ? 'Tier ' + m[2] + ' ' : (st.lvl != null ? 'Tier ' + (st.lvl + 1) + ' ' : '')}Passive Skills`;
    if ((m = a.match(/PointsTo(All|Earth|Warfare|Storm|Rogue|Forge|Spirit)Passives/))) return `+${v} Level to all ${m[1] === 'All' ? '' : m[1] + ' '}Passive Skills`;
    if ((m = (ge || a).match(/ActiveCapacity(Earth|Warfare|Storm|Rogue|Forge|Spirit)T?(\d)?/))) return `+${v} Capacity to ${m[1]} ${m[2] ? 'Tier ' + m[2] + ' ' : (st.lvl != null ? 'Tier ' + (st.lvl + 1) + ' ' : '')}Active Skills`;
    if ((m = a.match(/PointsTo(All|Earth|Warfare|Storm|Rogue|Forge|Spirit)Actives/))) return `+${v} Capacity to all ${m[1] === 'All' ? '' : m[1] + ' '}Active Skills`;
    if (/FlatCritChance/.test(a)) return `+${v}% Critical Hit Chance`;
    return null;
  };
  C.curGear = () => C._gear || ((curSave() || {}).gear) || [];

  /* Todos os efeitos da build (passivas, feats, ativas sustentadas/buffs, equipamento) */
  /* Limites que dependem da build: Rage máxima (só com Warfare) e Amplify máximo do Ring of Flame */
  C.limits = function (B, st) {
    const has = mk => B.slots.includes(mk);
    let rage = 0;
    if (has('warfare')) {
      rage = 10;
      if ((st('warfare', { n: 'Battle Rage' }).f || []).includes('Rage Amount')) rage += 3;
      if ((st('warfare', { n: 'Frenzied Rage' }).f || []).includes('Rage Stacks')) rage -= 2;
    }
    const amp = has('earth') ? 20 + 4 * ((st('earth', { n: 'Ring of Flame' }).m || {})['Enhanced Amplify'] || 0) : 0;
    return { rage, amp };
  };
  /* Tier da skill dentro da mastery (1 = nível 0 de mastery, 2 = 6, 3 = 16...) */
  function tierOf(m, s) { const ts = [...new Set(m.skills.map(x => x.t))].sort((a, b) => a - b); return ts.indexOf(s.t) + 1; }
  C.tierOf = tierOf;
  /* Níveis extras de passivas vindos do equipamento (só em passivas com pelo menos 1 ponto) */
  C.bonusLevel = function (gearEff, mk, m, s) {
    if (s.k !== 'passive') return 0;
    const t = tierOf(m, s);
    return gearEff.filter(e => e.kind === 'plevel' && (!e.mk || e.mk === mk) && (!e.tier || e.tier === t)).reduce((a, e) => a + e.val, 0);
  };
  C.collect = function (B, M, st) {
    const T = C.T, L = T.level, list = [];
    const lim = C.limits(B, st);
    T.rage = Math.max(0, Math.min(T.rage, lim.rage)); T.amplify = Math.max(0, Math.min(T.amplify, lim.amp));
    const gearEff = gearInfo().effects;
    B.slots.forEach(mk => {
      const m = M[mk]; if (!m) return;
      m.skills.forEach(s => {
        let v = st(mk, s); if (!v.l) return;
        const bl = C.bonusLevel(gearEff, mk, m, s);
        if (bl) v = { ...v, l: v.l + bl, bonus: bl };
        const key = mk + '|' + s.n, src = s.n;
        if (C.SPECIAL[key]) { C.SPECIAL[key](v, T, L).forEach(e => list.push({ ...e, src, key })); return; }
        if (s.k === 'passive') {
          s.lv.forEach(l => { const txt = l[0].replace('{v}', +(l[1] + l[2] * (v.l - 1)).toFixed(2)); C.parse(txt, { src }).forEach(e => list.push({ ...e, src, key })); });
          (s.x || []).forEach(x => C.parse(x, { src }).forEach(e => list.push({ ...e, src, key })));
          v.f.forEach(f => { const ft = (s.feats.find(z => z[0] === f) || [])[1]; C.parse(ft, { src }).forEach(e => list.push({ ...e, src: src + ' · ' + f, key, feat: f })); });
        } else if (/Sustained|Aura|Buff/i.test(s.tags) && !/Summon/i.test(s.tags) && key !== T.skill) {
          C.parse(s.desc, { src }).forEach(e => list.push({ ...e, src, key, cond: e.cond }));
          s.mods.forEach(([n, r, c, e]) => { const rk = v.m[n]; if (rk) C.parse(e, { src, mod: true }).forEach(x => list.push({ ...x, val: x.val != null ? x.val * (/per rank/i.test(e) ? rk : 1) : x.val, src: src + ' · ' + n + ' ' + rk, key, approx: x.kind !== 'res' })); });
        }
      });
    });
    gearEff.forEach(e => list.push(e));
    // Situações de combate: liga/desliga ou multiplica pelo contador
    list.forEach((e, i) => {
      if (!e.situ) return;
      const n = C.situVal(e.situ);
      if (e.situ.type === 'count') {
        if (e.situDone) return;
        if (!n) { list[i] = { ...e, cond: 'situ' }; return; }
        list[i] = { ...e, val: e.val * n, text: `${e.text} (× ${n})` };
      } else if (!n) list[i] = { ...e, cond: 'situ' };
    });
    // Rage sustentada (automática): equilíbrio entre o ganho da skill e o decaimento
    const rageDur = list.filter(e => e.kind === 'rageDur').reduce((a, e) => a + e.val, 0);
    C._rageAuto = C.rageSustain(B, M, st, rageDur, lim.rage);
    if (T.rageAuto !== false) T.rage = C._rageAuto.n;
    // Rage: mecânica global (Total Attack Damage, canal 3)
    const rageEff = list.filter(e => e.kind === 'rageEffect').reduce((a, e) => a + e.val, 0);
    if (T.rage > 0) list.push({ kind: 'inc', val: T.rage * (1 + rageEff / 100), types: null, req: ['attack'], ch: 3, src: 'Rage', text: `${T.rage} Rage × ${(1 + rageEff / 100).toFixed(2)}% increased Total Attack Damage` },
                              { kind: 'speed', speed: 'attack', val: T.rage * (1 + rageEff / 100), src: 'Rage', text: 'Attack Speed por Rage' });
    return list;
  };

  /* Rage sustentada. Cada stack dura 2s × (1 + Rage Duration); ganhar Rage renova a duração (conferido no jogo:
     batendo sem parar a Rage fica no máximo). O decaimento 30% mais rápido por stack só age quando o ganho para
     por mais tempo que a duração.
     Ganho: Rage Gain do Sweeping Strike = 1 stack a cada 0,9s − 0,1s por rank (mín. 0,4s), limitado pelo ritmo de acertos. */
  C.rageSustain = function (B, M, st, durPct, max) {
    const T = C.T;
    if (!max) return { n: 0, why: 'Sem Warfare: não há Rage' };
    const [mk, sn] = String(T.skill).split('|');
    const s = M[mk] && M[mk].skills.find(x => x.n === sn);
    const v = s ? st(mk, s) : { m: {} };
    const r = (v.m || {})['Rage Gain'] || 0;
    if (!r || !B.slots.includes(mk)) return { n: 0, why: 'A skill principal não gera Rage (modifier Rage Gain)' };
    let gap = sn === 'Sweeping Strike' ? Math.max(0.4, 0.9 - 0.1 * r) : sn === 'Call Lightning' ? 1.5 : 0.4;
    if (sn === 'Sweeping Strike' && !(v.m || {}).Whirlwind) gap = Math.max(gap, 0.77); // um golpe por uso, sem canal
    const dur = 2 * (1 + durPct / 100);
    if (gap < dur) return { n: max, gap, dur, fill: max * gap,
      why: `1 stack a cada ${gap.toFixed(1)}s renova a duração (${dur.toFixed(1)}s): fica no máximo; enche em ${(max * gap).toFixed(1)}s` };
    // ganho mais lento que a duração: cada stack expira antes do próximo
    return { n: Math.min(max, Math.round(dur / gap * 10) / 10), gap, dur, why: `1 stack a cada ${gap.toFixed(1)}s e cada um dura ${dur.toFixed(1)}s` };
  };

  /* Situações de combate que aparecem nos efeitos da build (para mostrar as chaves certas) */
  C.situations = function (B, M, st) {
    const seen = new Map();
    C.collect(B, M, st).forEach(e => {
      if (!e.situ || e.kind === 'other') return;
      const x = seen.get(e.situ.id) || { si: e.situ, srcs: new Set() };
      x.srcs.add(String(e.src || '').split(' · ')[0]); seen.set(e.situ.id, x);
    });
    return [...seen.values()].map(x => ({ ...x.si, srcs: [...x.srcs] }));
  };

  /* Uma regra decide se o efeito vale para a skill e para o tipo de dano final */
  function applies(e, skillTags, finalTypes) {
    if (e.kind !== 'inc' && e.kind !== 'more' && e.kind !== 'weaponInc') return { ok: false, why: e.why || 'Não é bônus de dano' };
    if (e.cond === 'situ' && e.situ) return { ok: false, cond: true, why: e.situ.type === 'count' ? `Contador em 0: ajuste "${e.situ.label}" em Situação do combate` : `Desligado: marque "${e.situ.label}" em Situação do combate` };
    if (e.cond) {
      if (/Crab/i.test(e.cond)) { if (!C.T.vsCrab) return { ok: false, cond: true, why: 'Só contra Crabs' }; }
      else return { ok: false, cond: true, why: 'Condicional: ' + e.cond };
    }
    for (const r of (e.req || [])) {
      if (r === 'weapon' && !skillTags.includes('weapon')) return { ok: false, why: 'Só para Weapon Attacks' };
      if (r === 'attack' && !skillTags.includes('attack')) return { ok: false, why: 'Só para Attacks' };
      if (r === 'spell' && !skillTags.includes('spell')) return { ok: false, why: 'Só para Spells' };
      if (r === 'area' && !skillTags.includes('area')) return { ok: false, why: 'Só para skills de Area' };
      if (r === 'projectile' && !skillTags.includes('projectile')) return { ok: false, why: 'Só para Projectiles' };
      if (r === 'melee' && !skillTags.includes('melee')) return { ok: false, why: 'Só para Melee' };
      if (['overload', 'soulburn', 'infusion'].includes(r) && !skillTags.includes(r)) return { ok: false, why: 'Só para skills ' + r };
    }
    if (e.types) {
      const hit = e.types.filter(t => finalTypes.includes(t));
      if (!hit.length) {
        const phys = e.types.every(t => t === 'strike' || t === 'pierce');
        return { ok: false, why: phys && finalTypes.length && !finalTypes.some(t => t === 'strike' || t === 'pierce')
          ? 'Physical: o dano já foi convertido em ' + finalTypes.map(t => TNAME[t]).join('/') + ' antes da escala'
          : 'Tipo diferente (' + e.types.map(t => TNAME[t]).join('/') + ')' };
      }
      return { ok: true, types: hit };
    }
    return { ok: true, types: finalTypes };
  }
  C.applies = applies;

  /* ---------- Cálculo principal ---------- */
  C.compute = function (B, M, st) {
    const T = C.T, L = T.level;
    const [mk, sn] = T.skill.split('|');
    const m = M[mk], s = m && m.skills.find(x => x.n === sn);
    const def = C.SKILLS[T.skill];
    const v = s ? st(mk, s) : { l: 0, f: [], m: {} };
    const effects = C.collect(B, M, st);
    const gi = gearInfo();
    const R = { steps: [], effects: [], notes: [], def, s, v, skillTags: [] };
    if (!def) { R.error = 'Ainda não tenho a fórmula dessa skill (as de Spirit e algumas ativas de suporte ainda faltam).'; R.effects = effects.map(e => ({ e, a: { ok: false, why: '—' } })); return R; }
    let tags = [...def.tags], pct = def.pct ? def.pct(L) : 0, hitLabel = def.hitLabel, tick = def.tick || null;
    const mores = [];
    Object.entries(def.mods || {}).forEach(([n, fn]) => {
      const r = v.m[n] || 0; const o = fn(r, T); if (!o) return;
      if (o.setPct != null) { pct = o.setPct; R.steps.push({ k: 'mod', label: o.label }); }
      if (o.addTags) tags = tags.concat(o.addTags);
      if (o.hitLabel) hitLabel = o.hitLabel;
      if (o.tick) tick = o.tick;
      if (o.channelCost) { R._channelCost = o.channelCost; R._tickMods = o.tickMods; R._startCost = o.startCost; }
      if (o.hits) R._hits = o.hits;
      if (o.weapon) { R._weaponPct = o.weapon(L); R.steps.push({ k: 'mod', label: o.label }); }
      if (o.convert) R._convert = { to: o.convert, src: sn + ' · ' + n };
      if (o.more) mores.push({ src: sn + ' · ' + n, val: o.more, label: o.label });
    });
    // modifiers de "N% more Damage" sem condição, lidos do texto (skills sem tabela própria)
    if (def.generic && s) (s.mods || []).forEach(([n, mx, , t]) => {
      const r = v.m[n] || 0; if (!r || (def.mods || {})[n]) return;
      if (/Becomes|Instead|Consum|against|vs |channel|Overwhelm|Flow|Frozen|Stunned|Incapacitated|Mark|Doom|per |if |when |while |closer|edge|Requires/i.test(t)) return;
      const m = String(t).match(/^(?:Up to\s+)?(\d+(?:\.\d+)?)% (more|less) Damage/i); if (!m) return;
      const val = (+m[1] / 100) * (/less/i.test(m[2]) ? -1 : 1) * (mx > 1 ? r : 1);
      mores.push({ src: sn + ' · ' + n, val, label: `${n} ${r}: ${Math.round(val * 100)}% ${val < 0 ? 'less' : 'more'} (texto do modifier)` });
    });
    let kindW = def.kind === 'weapon';
    if (R._weaponPct != null) { kindW = true; pct = R._weaponPct; }
    R.skillTags = tags; R.hitLabel = hitLabel; R.kindW = kindW;

    /* 1) Dano base por tipo */
    let base = {};
    const weaponFlat = {}, weaponInc = {};
    if (kindW) {
      let ws = gi.weapons;
      if (!ws.length) ws = [{ item: 'arma padrão', base: C.wds(L), var: 0.1, speed: 1, split: { strike: 1 } }];
      // Dual wield (DefaultGame.ini): dano = 0,6 × principal + 0,6 × secundária; velocidade, variação e crítico = média
      const pick = T.weapon === 'main' ? [ws[0]] : T.weapon === 'off' ? [ws[1] || ws[0]] : ws.slice(0, 2);
      const dual = pick.length > 1, wf = dual ? C.DUAL_DMG : 1;
      pick.forEach(w => Object.entries(w.split).forEach(([t, f]) => { base[t] = (base[t] || 0) + w.base * f * wf; }));
      R.weapon = { list: pick, dual, variance: pick.reduce((a, w) => a + w.var, 0) / pick.length, speed: pick.reduce((a, w) => a + w.speed, 0) / pick.length,
        crit: pick.reduce((a, w) => a + (w.crit != null ? w.crit : C.WEAPON_CRIT), 0) / pick.length };
      R.steps.push({ k: 'base', label: 'Dano base da arma' + (dual ? ' (duas armas: 0,6 × cada, regra do jogo)' : ''), types: { ...base } });
      effects.filter(e => e.kind === 'flat').forEach(e => {
        if (e.wslot != null) {
          const used = pick.some(w => w.slot === e.wslot);
          if (!used) { R.effects.push({ e, a: { ok: false, why: 'Dano fixo da outra arma: não entra nesta' } }); return; }
          weaponFlat[e.type] = (weaponFlat[e.type] || 0) + e.val * (dual ? C.DUAL_AFFIX : 1);
          R.effects.push({ e, a: { ok: true, why: dual ? 'Dano fixo da arma: × 0,6 com duas armas (regra do jogo)' : 'Soma no dano da arma (e é convertido junto)' } }); return;
        }
        weaponFlat[e.type] = (weaponFlat[e.type] || 0) + e.val; R.effects.push({ e, a: { ok: true, why: 'Soma no dano da arma (e é convertido junto)' } });
      });
      Object.entries(weaponFlat).forEach(([t, x]) => { base[t] = (base[t] || 0) + x; });
      if (Object.keys(weaponFlat).length) R.steps.push({ k: 'flat', label: '+ dano fixo de arma (afixos, Imbuement)', types: { ...base } });
      // aumentos do próprio dano da arma (atributo WeaponDamage)
      effects.filter(e => e.kind === 'weaponInc' || (e.kind === 'inc' && e.local)).forEach(e => {
        const a = e.cond ? applies(e, tags, Object.keys(base)) : e.req && e.req.includes('melee') && !tags.includes('melee') ? { ok: false, why: 'Só para Melee' } : { ok: true, why: 'Aumenta o dano da arma antes da conversão' };
        if (a.ok) a.why = 'Aumenta o dano da arma antes da conversão';
        R.effects.push({ e, a });
        if (!a.ok) return;
        (e.types || Object.keys(base)).forEach(t => { weaponInc[t] = (weaponInc[t] || 0) + e.val; });
      });
      Object.keys(base).forEach(t => { base[t] *= 1 + (weaponInc[t] || 0) / 100; });
      if (Object.keys(weaponInc).length) R.steps.push({ k: 'winc', label: '× aumentos do dano da arma', types: { ...base } });
    } else {
      const b = def.base(L, T);
      Object.entries(def.types).forEach(([t, f]) => { base[t] = b * f; });
      R.steps.push({ k: 'base', label: 'Dano base da skill (escala com o nível ' + L + ')', types: { ...base } });
    }

    /* 2) Conversão (antes de qualquer escala) */
    const convs = effects.filter(e => e.kind === 'conv' && (kindW || !e.weaponOnly));
    effects.filter(e => e.kind === 'conv' && !(kindW || !e.weaponOnly)).forEach(e => R.effects.push({ e, a: { ok: false, why: 'Converte só Weapon Damage; esta skill não usa a arma' } }));
    if (convs.length) {
      const byTo = {};
      convs.forEach(e => { byTo[e.to] = (byTo[e.to] || 0) + e.val; R.effects.push({ e, a: { ok: true, why: 'Conversão: acontece antes da escala' } }); });
      const total = Object.values(byTo).reduce((a, x) => a + x, 0);
      const out = {};
      Object.entries(base).forEach(([t, x]) => {
        const targets = Object.entries(byTo).filter(([to]) => to !== t);
        const tot = targets.reduce((a, [, p]) => a + p, 0) + (byTo[t] || 0);
        const keepFrac = Math.max(0, 1 - Math.min(100, tot) / 100);
        const convFrac = 1 - keepFrac;
        out[t] = (out[t] || 0) + x * keepFrac;
        Object.entries(byTo).forEach(([to, p]) => { out[to] = (out[to] || 0) + x * convFrac * (p / tot); });
      });
      base = out;
      R.steps.push({ k: 'conv', label: `Conversão (${Object.entries(byTo).map(([t, p]) => p + '% → ' + TNAME[t]).join(', ')}${Object.keys(byTo).length > 1 ? '; tipos diferentes dividem o dano' : ''})`, types: { ...base } });
    }
    if (R._convert) {
      const tot = Object.values(base).reduce((a, x) => a + x, 0);
      base = { [R._convert.to]: tot };
      R.steps.push({ k: 'conv', label: `${R._convert.src}: 100% convertido em ${TNAME[R._convert.to]}`, types: { ...base } });
    }
    Object.keys(base).forEach(t => { if (base[t] < 1e-9) delete base[t]; });
    const finalTypes = Object.keys(base);

    /* 3) Percentual da skill e multiplicadores "more" */
    let mult = pct;
    if (kindW) { Object.keys(base).forEach(t => base[t] *= pct); R.steps.push({ k: 'pct', label: `× ${(pct * 100).toFixed(1)}% Weapon Damage da skill`, types: { ...base } }); }
    effects.filter(e => e.kind === 'more').forEach(e => { const a = applies(e, tags, finalTypes); R.effects.push({ e, a }); if (a.ok && !e.types) mores.push({ src: e.src, val: e.val / 100, label: e.text }); else if (a.ok) mores.push({ src: e.src, val: e.val / 100, label: e.text, types: a.types }); });
    let moreF = {};
    finalTypes.forEach(t => { moreF[t] = mores.filter(x => !x.types || x.types.includes(t)).reduce((a, x) => a * (1 + x.val), 1); base[t] *= moreF[t]; });
    if (mores.length) R.steps.push({ k: 'more', label: '× multiplicadores "more" (' + mores.map(x => x.label || x.src).join('; ') + ')', types: { ...base } });
    R.mores = mores;

    /* 4) Increased por canal */
    const chans = {};
    effects.filter(e => e.kind === 'inc' && !e.local).forEach(e => {
      const a = applies(e, tags, finalTypes); R.effects.push({ e, a });
      if (!a.ok) return;
      a.types.forEach(t => { const k = e.ch || 0; chans[k] = chans[k] || {}; chans[k][t] = (chans[k][t] || 0) + e.val; });
    });
    Object.keys(chans).sort().forEach(k => {
      finalTypes.forEach(t => { base[t] *= 1 + ((chans[k][t] || 0) / 100); });
      R.steps.push({ k: 'inc' + k, label: k == 0 ? '× (1 + soma dos increased comuns)' : k == 3 ? '× (1 + soma dos "Total Damage") — multiplicador separado' : `× canal ${k}`, types: { ...base }, sums: chans[k] });
    });
    R.chans = chans;

    /* 5) Atributos: Base Factor = 1 + 0,002 × atributo secundário (conferido na ficha do jogo) */
    const at = C.attributes(effects);
    R.attr = at; R.factors = C.factors(at);
    finalTypes.forEach(t => { const an = ATTR_OF[t]; if (an) base[t] *= R.factors[an]; });
    R.steps.push({ k: 'attr', label: '× Base Factor do atributo (' + finalTypes.filter(t => ATTR_OF[t]).map(t => TNAME[t] + ' ' + R.factors[ATTR_OF[t]].toFixed(2)).join(', ') + ')', types: { ...base }, est: !R.factors.typed });

    /* 6) Crítico: média (DefaultGame.ini m_HitDamageMultiplier: normal 1, crítico 1,5, super crítico 2,5) */
    const cr = C.crit(effects, tags, R);
    R.crit = cr;
    if (cr.factor > 1.0001) {
      R.noCrit = Object.values(base).reduce((a, x) => a + x, 0);
      finalTypes.forEach(t => { base[t] *= cr.factor; });
      R.steps.push({ k: 'crit', label: `× média com crítico (${n1c(cr.chance)}% de chance × ${cr.mult.toFixed(2)}× o dano)`, types: { ...base } });
    }

    /* 7) Inimigo */
    const pre = { ...base };
    finalTypes.forEach(t => { base[t] *= 1 - (T.res[t] || 0) / 100; });
    R.steps.push({ k: 'res', label: '× (1 − resistência do inimigo)', types: { ...base } });
    R.final = base; R.preRes = pre;
    R.total = Object.values(base).reduce((a, x) => a + x, 0);
    const vr = R.weapon ? R.weapon.variance : 0;
    const nc = R.total / (cr.factor || 1);
    R.min = nc * (1 - vr); R.max = nc * (1 + vr) * cr.mult;

    /* Velocidade (estimativa) */
    const as = effects.filter(e => e.kind === 'speed').reduce((a, e) => a + e.val, 0);
    R.attackSpeed = as;
    timing(R, s, v, R._channelCost ? Object.assign({}, def, { channelCost: R._channelCost }) : def, tags, effects, B, M, st, tick);
    if (R.timing) { /* ritmo, Energy e cooldown já calculados */ }
    else if (tick) { R.perSec = R.total * (1 / tick) * (R.weapon ? R.weapon.speed : 1) * (1 + as / 100); R.perSecNote = `${(1 / tick).toFixed(0)} acertos/s × velocidade da arma ${R.weapon ? R.weapon.speed.toFixed(2) : 1} × (1 + ${as.toFixed(0)}% Attack Speed)`; }
    else if (false && R.weapon) { R.perSec = R.total * R.weapon.speed * (1 + as / 100); R.perSecNote = `estimativa: 1 golpe/s × velocidade da arma ${R.weapon.speed.toFixed(2)} × (1 + ${as.toFixed(0)}% Attack Speed); a animação real da skill pode ser mais lenta`; R.perSecRough = true; }
    // efeitos que não entraram em nenhuma etapa
    effects.forEach(e => { if (!R.effects.some(x => x.e === e)) R.effects.push({ e, a: { ok: false, info: e.kind === 'speed' || e.kind === 'rageEffect', why: e.kind === 'speed' ? 'Velocidade: entra no dano por segundo' : e.kind === 'rageEffect' ? 'Aumenta o efeito da Rage (já somado na linha Rage)' : e.kind === 'attr' ? 'Atributo: entra no bônus de atributo' : e.kind === 'pen' ? 'Penetração: reduz a resistência do inimigo (não somado)' : (e.why || 'Não é bônus de dano') } }); });
    return R;
  };

  /* ---------- Energia, cooldown e tempo de uso ----------
     desc_tq2_character: Energy base 300; regeneração = 2,5% da Energy máxima + 7,5% da base por segundo.
     Exhaust: 75% less Energy Regeneration enquanto usa a skill. Custo, cooldown e tempo de cada skill vêm do Atlas.
     Whirlwind (da_balancing_player_wf_sweepingStrike + modifier): TickCost 10 a cada tick de 0.25s ÷ velocidade. */
  C.BASE_ENERGY = 300;
  const num = x => { const m = String(x || '').match(/(\d+(?:\.\d+)?)/); return m ? +m[1] : 0; };
  C.skillStats = function (s) {
    const o = { cost: 0, drain: 0, reserved: 0, cd: 0, time: null };
    ((s && s.stats) || []).forEach(([k, v]) => {
      if (/Custo/i.test(k)) {
        const r = String(v).match(/(\d+(?:\.\d+)?)\s*(?:Energy\s*)?reserved/i); if (r) o.reserved += +r[1];
        const c = String(v).match(/^(\d+(?:\.\d+)?)\s*Energy(?!\s*(?:reserved|\/s))/i); if (c) o.cost += +c[1];
        const d = String(v).match(/(\d+(?:\.\d+)?)\s*Energy\/s/i); if (d) o.drain += +d[1];
      }
      if (/Cooldown/i.test(k)) o.cd = num(v);
      if (/Tempo/i.test(k)) o.time = /Instant/i.test(v) ? 0 : num(v);
    });
    return o;
  };
  C.energy = function (B, M, st, effects) {
    const sum = k => effects.filter(e => e.kind === 'res' && e.stat === k).reduce((a, e) => a + e.val, 0);
    const max = (C.BASE_ENERGY + sum('max')) * (1 + sum('maxPct') / 100);
    let reserved = 0; const resList = [];
    B.slots.forEach(mk => (M[mk] ? M[mk].skills : []).forEach(s => {
      const v = st(mk, s); if (!v.l || s.k !== 'active') return;
      const r = C.skillStats(s).reserved; if (r) { reserved += r; resList.push(s.n + ' ' + r); }
      // modifiers que reservam ou liberam Energy ("+30 Energy reserved per rank", "−20 Energy reserved")
      (s.mods || []).forEach(([n, , , t]) => {
        const rk = v.m[n]; if (!rk) return;
        C.parse(t, { mod: true }).forEach(e => { if (e.kind === 'res' && e.stat === 'reserved') { const x = e.val * (/per rank/i.test(t) ? rk : 1); reserved += x; resList.push(s.n + ' · ' + n + ' ' + x); } });
      });
    }));
    effects.filter(e => e.kind === 'res' && e.stat === 'reserved' && !e.key).forEach(e => { reserved += e.val; resList.push((e.src || '') + ' ' + e.val); });
    reserved = Math.max(0, reserved - sum('freeRes'));
    const regen = (0.025 * max + 0.075 * C.BASE_ENERGY) * (1 + sum('regenPct') / 100) + sum('regen');
    return { max, reserved, pool: Math.max(0, max - reserved), regen, costRed: sum('costRed'), cdr: sum('cdr'), resList };
  };
  const n2 = x => (Math.round(x * 100) / 100).toString();
  function timing(R, s, v, def, tags, effects, B, M, st, tick) {
    const T = C.T, S = C.skillStats(s), E = C.energy(B, M, st, effects);
    const spd = k => effects.filter(e => e.kind === 'speed' && (e.speed === k || e.speed === 'all' || (!e.speed && k === 'attack'))).reduce((a, e) => a + e.val, 0);
    const isSpell = tags.includes('spell') && !R.kindW;
    const speedPct = isSpell ? spd('cast') : spd('attack');
    const wsp = R.weapon && !isSpell ? R.weapon.speed : 1;
    let speedF = wsp * (1 + speedPct / 100);
    if (def.speedScale != null) speedF = 1 + (speedF - 1) * def.speedScale; // ex.: Heavy Attack aproveita 30%
    if (def.speedMul) speedF *= def.speedMul;                                // ex.: Bladespin × 1,1
    const hits = R._hits || def.hits || 1;
    // custos extras dos modifiers da skill ("+2 Energy", "+1 Energy/s")
    let addCost = 0, addDrain = 0;
    (s.mods || []).forEach(([n, , , t]) => {
      const rk = v.m[n]; if (!rk) return;
      C.parse(t, { mod: true }).forEach(e => { if (e.kind !== 'res') return; const k = /per rank/i.test(t) ? rk : 1; if (e.stat === 'cost') addCost += e.val * k; if (e.stat === 'drain') addDrain += e.val * k; });
    });
    const costF = Math.max(0, 1 - E.costRed / 100);
    const exhaust = /Exhaust/i.test(s.tags) ? 0.25 : 1;
    const F = Math.max(5, +T.fight || 30);
    let hitsPerSec, drain, note;
    if (def.dot) { // dano ao longo do tempo: um tick a cada def.dot.tick enquanto o efeito dura; reaplica a cada def.dot.dur
      hitsPerSec = 1 / def.dot.tick;
      const casts = 1 / def.dot.dur;
      drain = ((S.cost + addCost) * casts + S.drain + addDrain) * costF;
      note = `${n2(hitsPerSec)} ticks/s, reaplicando a cada ${def.dot.dur}s (um alvo)`;
    } else if (tick) { // canal: um acerto por tick
      hitsPerSec = (1 / tick) * (R.kindW ? speedF : 1);
      const ch = def.channelCost ? def.channelCost(speedF) : S.drain;
      // Whirlwind (bp_bga_player_wf_sweepingStrike_m_whirlwind_p + modifiers): custo por tick = TickCost ÷ velocidade
      // + rank/4 de Ramp Up (MPCostMod) e de Rage Gain (MPTickCostMod); ticks por segundo = 4 × velocidade
      let modTick = 0;
      if (R._tickMods) Object.entries(R._tickMods).forEach(([n, k]) => { modTick += (v.m[n] || 0) * k / 4; });
      const perTickSec = R._tickMods ? modTick * 4 : addDrain; // tooltip: 4 × (custo do tick + mods), não depende da velocidade
      drain = (ch + perTickSec) * costF;
      R._chanStart = (R._startCost != null ? R._startCost : S.cost) + addCost;
      note = `${n2(hitsPerSec)} acertos/s (1 a cada ${tick}s ÷ velocidade ${n2(speedF)})`;
    } else {
      const t = def.time || S.time || 0.5;
      if (S.time == null && !def.time) R.perSecRough = true;
      let rate = speedF / Math.max(0.1, t);
      const cdEff = S.cd ? S.cd / (1 + E.cdr / 100) : 0;
      if (cdEff) rate = Math.min(rate, 1 / cdEff);
      hitsPerSec = rate * hits;
      drain = ((S.cost + addCost) * rate + S.drain + addDrain) * costF;
      note = `${n2(rate)} usos/s (tempo ${t}s ÷ velocidade ${n2(speedF)}${cdEff ? `; cooldown ${n2(cdEff)}s` : ''})${hits !== 1 ? ` × ${n2(hits)} acertos por uso no mesmo alvo` : ''}`;
      R.cooldown = cdEff;
    }
    // parte do tempo em que dá para usar a skill sem faltar Energy, numa luta de F segundos
    const regenUse = E.regen * exhaust;
    let up = 1;
    if (drain > regenUse) up = Math.min(1, (E.pool / F + E.regen) / (drain + E.regen - regenUse));
    R.perSecBurst = R.total * hitsPerSec;
    R.perSec = R.perSecBurst * up;
    // o tooltip do jogo mostra o DPS sem crítico e sem limite de Energy
    R.tooltipDPS = R.perSecBurst / ((R.crit && R.crit.factor) || 1);
    R.perSecNote = note + (up < 0.999 ? ` × ${Math.round(up * 100)}% do tempo (falta Energy)` : '');
    R.timing = { hitsPerSec, speedF, speedPct, drain, up, F, exhaust: exhaust < 1, E, S, addCost, addDrain, regenUse,
      empty: drain > regenUse ? E.pool / (drain - regenUse) : Infinity };
  }

  /* Crítico: chance = base da skill + crítico da arma (Weapon Attacks; média das duas no dual wield) + bônus.
     O Whirlwind do Phantomn mostra 13% = 5% global + 3% do feat Critical Chance + 5% da arma (10% × 0,5). */
  C.WEAPON_CRIT = 10;          // da_tq2_item_stats_general: CritChance = 10
  C.WEAPON_CRIT_IMPORT = 0.5;  // parte do crítico da arma que entra na skill (conferido no jogo)
  C.CRIT_MULT = 1.5;           // DefaultGame.ini m_HitDamageMultiplier[1]
  C.DUAL_DMG = 0.6; C.DUAL_AFFIX = 0.6; C.DUAL_SCOPE = []; // afixos % das armas valem inteiros (conferido: 1 e 2 armas batem com o jogo)
  const n1c = x => (Math.round(x * 10) / 10).toString();
  C.crit = function (effects, tags, R) {
    const T = C.T;
    let chance = 0, inc = 0, dmg = 0;
    effects.forEach(e => {
      if (e.kind === 'crit') {
        if (e.req === 'weapon' && !tags.includes('weapon')) return;
        if (e.req === 'spell' && !tags.includes('spell')) return;
        chance += e.val;
      } else if (e.kind === 'critInc') inc += e.val;
      else if (e.kind === 'critDmg') dmg += e.val;
    });
    const d = R.def || {};
    if (R.weapon && tags.includes('weapon')) chance += R.weapon.crit * (d.weaponCrit != null ? d.weaponCrit * C.WEAPON_CRIT_IMPORT * 2 * 0.5 : C.WEAPON_CRIT_IMPORT);
    if (d.critBase && !R.kindW) chance += d.critBase;
    chance *= 1 + inc / 100;
    if (T.critOverride != null && T.critOverride !== '') chance = +T.critOverride;
    const mult = C.CRIT_MULT + dmg / 100;
    const c = Math.max(0, chance) / 100;
    // acima de 100% vira super crítico (2,5×)
    const factor = c <= 1 ? 1 + c * (mult - 1) : mult + Math.min(1, c - 1) * (2.5 + dmg / 100 - mult);
    return { chance, mult, factor };
  };

  /* Bônus de dano do atributo secundário: 0,25% por ponto acima do inicial (80).
     Mesma regra da vida por Vigor (desc_tq2_character) e bate com o fator esperado da tabela de balanceamento
     (PlayerAttribFactor = 1 + 0,015 por nível ≈ 6 pontos por nível × 0,25%). O jogo calcula em código: é estimativa. */
  C.attrBonus = x => x * 0.2; // % de dano: Base Factor 1 + 0,002 × atributo (ficha: 327 → 1.65, 120 → 1.24)
  /* Base Factor por atributo; o valor digitado da ficha do jogo tem prioridade */
  C.factors = function (at) {
    const T = C.T, f = {}, ov = T.attrFactor || {};
    let typed = false;
    ['fitness', 'resolve', 'cunning'].forEach(k => {
      const o = ov[k];
      if (o != null && o !== '' && +o > 0) { f[k] = +o; typed = true; } else f[k] = 1 + 0.002 * at[k];
    });
    f.highest = Math.max(f.fitness, f.resolve, f.cunning);
    f.typed = typed;
    return f;
  };
  C.attributes = function (effects) {
    const sv = curSave(), T = C.T;
    const pts = (sv && sv.attributePoints) || {};
    const a = { might: 0, agility: 0, knowledge: 0, vigor: 0, fitness: 0, resolve: 0, cunning: 0 };
    ['Might', 'Agility', 'Knowledge', 'Vigor'].forEach(k => { a[k.toLowerCase()] = C.INITIAL_ATTR + C.ATTR_PER_POINT * (pts[k] || 0); });
    effects.filter(e => e.kind === 'attr').forEach(e => { a[e.attr] = (a[e.attr] || 0) + e.val; });
    // anéis e colares "Might/Agility/Knowledge" têm um bônus de base: 2 + nível do item / 10 (bp_jewelry_base_*_Might)
    C.curGear().forEach(g => {
      const m = String(g.item || '').match(/jewelry_(?:ring|neck)_normal_\w*?_(might|agility|knowledge)_/i);
      if (m && T.gear) a[m[1].toLowerCase()] += 2 + Math.min(60, g.level || 0) / 10;
    });
    a.fitness += (a.might + a.agility) * 0.6 + a.vigor * 0.4;
    a.resolve += (a.might + a.knowledge) * 0.6 + a.vigor * 0.4;
    a.cunning += (a.agility + a.knowledge) * 0.6 + a.vigor * 0.4;
    return a;
  };

  /* Classificação rápida de uma skill da build em relação à skill principal (para os avisos) */
  C.impact = function (B, M, st, mk, s) {
    if (!C._last) return null;
    const R = C._last;
    const key = mk + '|' + s.n;
    if (key === C.T.skill) return { cls: 'main', text: 'Skill principal da calculadora' };
    const mine = R.effects.filter(x => x.e.key === key);
    if (!mine.length) return null;
    const ok = mine.filter(x => x.a.ok || x.e.kind === 'rageEffect'), cond = mine.filter(x => x.a.cond), no = mine.filter(x => !x.a.ok && !x.a.cond && !x.a.info && x.e.kind !== 'other');
    const nm = C.T.skill.split('|')[1];
    const sumTxt = xs => xs.slice(0, 3).map(x => shortEff(x.e)).join(', ');
    if (ok.length) return { cls: 'ok', text: `Afeta o dano de ${nm}: ${sumTxt(ok)}`, detail: no.length ? 'Não conta: ' + no.map(x => shortEff(x.e) + ' (' + x.a.why + ')').join('; ') : '' };
    if (cond.length) return { cls: 'cond', text: `Condicional para ${nm}: ${cond[0].a.why}` };
    if (no.length) return { cls: 'no', text: `Não afeta ${nm}: ${no[0].a.why}`, detail: no.map(x => shortEff(x.e)).join(', ') };
    return null;
  };
  /* ---------- Relevância para a skill principal (bordas azuis) ---------- */
  const TAGMAP = [[/Weapon Attack/i, ['attack', 'weapon']], [/Melee Attack/i, ['attack', 'weapon', 'melee']], [/Ranged Attack/i, ['attack', 'weapon', 'projectile']],
    [/\bAttack\b/i, ['attack']], [/\bSpell\b/i, ['spell']], [/\bArea\b/i, ['area']], [/\bProjectile\b/i, ['projectile']], [/\bChannel\b/i, ['channel']],
    [/\bOverload\b/i, ['overload']], [/\bSoulburn\b/i, ['soulburn']], [/\bInfusion\b/i, ['infusion']]];

  /* Tags e tipos de dano finais da skill principal */
  C.profile = function (B, M, st) {
    const T = C.T, [mk, sn] = T.skill.split('|');
    const s = M[mk] && M[mk].skills.find(x => x.n === sn);
    if (!s) return null;
    const def = C.SKILLS[T.skill];
    let tags = def ? [...def.tags] : [];
    if (!def) TAGMAP.forEach(([re, ts]) => { if (re.test(s.tags)) tags.push(...ts); });
    if (!def && /Requires Melee|Melee/i.test(s.desc)) tags.push('melee');
    const v = st(mk, s);
    if (def) Object.entries(def.mods || {}).forEach(([n, fn]) => { const o = (v.m[n] || 0) && fn(v.m[n], T); if (o && o.addTags) tags.push(...o.addTags); });
    tags = [...new Set(tags)];
    let types;
    const weaponBased = tags.includes('weapon') || /Weapon Damage/i.test(s.desc);
    if (C._last && C._last.final && C._last.s === s) types = Object.keys(C._last.final);
    else if (weaponBased) {
      const eff = C.collect(B, M, st), gi = gearInfo();
      let base = new Set(gi.weapons.length ? Object.keys(gi.weapons[0].split) : ['strike']);
      const conv = {}; eff.filter(e => e.kind === 'conv').forEach(e => { conv[e.to] = (conv[e.to] || 0) + e.val; });
      const tot = Object.values(conv).reduce((a, x) => a + x, 0);
      if (tot >= 100) base = new Set(Object.keys(conv)); else Object.keys(conv).forEach(t => base.add(t));
      types = [...base];
    } else {
      const ts = new Set();
      (s.desc.match(/(\w+) Damage/g) || []).forEach(p => (typesOf(p) || []).forEach(t => ts.add(t)));
      types = ts.size ? [...ts] : ['strike'];
    }
    return { key: T.skill, s, tags, types, weaponBased };
  };

  /* Para cada skill das masteries: 'main', 'aff' (a base afeta), 'part' (só feats/mods afetam) ou nada */
  C.relevance = function (B, M, st, mks) {
    const P = C.profile(B, M, st); const out = new Map();
    if (!P) return out;
    const T = Object.assign({}, C.T, { rof: true, valor: true, banner: true, vsCrab: false });
    const saveSitu = C.T.situ; C.T.situ = new Proxy({}, { get: (o, k) => (SITU[k] && SITU[k].type === 'count' ? Math.max(1, SITU[k].def) : true) });
    try {
    const good = e => {
      if (e.kind === 'conv' || e.kind === 'flat') return P.weaponBased;
      if (e.kind === 'rageEffect') return P.tags.includes('attack');
      if (e.kind === 'weaponInc' || (e.kind === 'inc' && e.local)) return P.weaponBased && (!e.req || !e.req.includes('melee') || P.tags.includes('melee'));
      return applies(e, P.tags, P.types).ok;
    };
    const parse = (txt, src) => C.parse(txt, { src });
    mks.forEach(mk => {
      const m = M[mk]; if (!m) return;
      m.skills.forEach(s => {
        const key = mk + '|' + s.n, v = st(mk, s), L = Math.max(1, v.l || 1);
        const r = { base: [], feats: new Set(), mods: new Set() };
        if (key === P.key) {
          const def = C.SKILLS[key];
          if (def) Object.entries(def.mods || {}).forEach(([n, fn]) => { const o = fn(1, Object.assign({}, T, { rage: 10, rampSec: 3, edge: true, overwhelm: true })); if (o && (o.more > 0 || o.setPct != null)) r.mods.add(n); });
          out.set(key, { cls: 'main', r }); return;
        }
        if (C.SPECIAL[key]) {
          C.SPECIAL[key]({ l: L, f: [], m: {} }, T, T.level).forEach(e => { if (good(e)) r.base.push(e); });
          (s.feats || []).forEach(([n]) => {
            const a = C.SPECIAL[key]({ l: L, f: [n], m: {} }, T, T.level), b = C.SPECIAL[key]({ l: L, f: [], m: {} }, T, T.level);
            const sum = xs => xs.filter(good).reduce((x, e) => x + (+e.val || 0), 0);
            if (sum(a) > sum(b)) r.feats.add(n);
          });
          (s.mods || []).forEach(([n]) => {
            const withMod = C.SPECIAL[key]({ l: L, f: [], m: { [n]: 1 } }, T, T.level);
            if (withMod.length > C.SPECIAL[key]({ l: L, f: [], m: {} }, T, T.level).length && withMod.some(e => good(e) && !/^(Aura|Buff)/.test(e.text || ''))) r.mods.add(n);
          });
        } else if (s.k === 'passive') {
          s.lv.forEach(l => parse(l[0].replace('{v}', l[1] + l[2] * (L - 1)), s.n).forEach(e => { if (good(e)) r.base.push(e); }));
          (s.x || []).forEach(x => parse(x, s.n).forEach(e => { if (good(e)) r.base.push(e); }));
          s.feats.forEach(([n, t]) => { if (parse(t, s.n).some(good)) r.feats.add(n); });
        } else if (/Sustained|Aura|Buff/i.test(s.tags) && !/Summon/i.test(s.tags)) {
          parse(s.desc, s.n).forEach(e => { if (good(e)) r.base.push(e); });
          s.mods.forEach(([n, , , t]) => { if (parse(t, s.n).some(good)) r.mods.add(n); });
        }
        // passivas de Rage: valem para Attacks
        if (s.k === 'passive' && P.tags.includes('attack') && s.lv.some(l => /Rage Effect/i.test(l[0]))) r.base.push({ kind: 'rageEffect' });
        const cls = r.base.length ? 'aff' : (r.feats.size || r.mods.size) ? 'part' : null;
        if (cls) out.set(key, { cls, r });
      });
    });
    } finally { C.T.situ = saveSitu; }
    return out;
  };

  function shortEff(e) {
    if (e.kind === 'rageEffect') return `+${e.val}% efeito da Rage`;
    if (e.kind === 'conv') return `${e.val}% → ${TNAME[e.to]}`;
    if (e.kind === 'flat') return `+${(+e.val).toFixed(1)} ${TNAME[e.type]} na arma`;
    if (e.kind === 'inc' || e.kind === 'more' || e.kind === 'weaponInc') return `${e.val > 0 ? '+' : ''}${(+e.val).toFixed(1).replace(/\.0$/, '')}% ${e.kind === 'more' ? 'more' : e.ch === 3 ? 'Total' : 'inc.'}${e.types ? ' ' + e.types.map(t => TNAME[t]).join('/') : ''}`;
    return e.text;
  }
  C.shortEff = shortEff;
})();
