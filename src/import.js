/* Importa um personagem direto dos arquivos .sav do Titan Quest II (no navegador).
   Precisa de <nome>_Data_Player.sav (atributos e equipamento) e <nome>_Data_PlayerLocal.sav (masteries).
   Formato: GVAS do Unreal 5.4+ com property tags de tipo completo. */
(function () {
  const IMP = (window.TQ2IMPORT = {});
  const td = new TextDecoder('utf-8'), td16 = new TextDecoder('utf-16le');
  const NATIVE = { Guid: 16, Vector: 24, Rotator: 24, Quat: 32, Vector2D: 16, Color: 4, LinearColor: 16, DateTime: 8, Timespan: 8, IntPoint: 8, IntVector: 12 };
  const KNOWN = new Set(['GameplayTagContainer', 'GameplayTag', 'SoftObjectPath', 'GrimItemInstanceHandle', 'SaveGameData']);

  function Reader(buf, p) { this.d = new DataView(buf); this.u = new Uint8Array(buf); this.p = p || 0; }
  Reader.prototype = {
    i32() { const v = this.d.getInt32(this.p, true); this.p += 4; return v; },
    u32() { const v = this.d.getUint32(this.p, true); this.p += 4; return v; },
    i64() { const v = Number(this.d.getBigInt64(this.p, true)); this.p += 8; return v; },
    f32() { const v = this.d.getFloat32(this.p, true); this.p += 4; return v; },
    f64() { const v = this.d.getFloat64(this.p, true); this.p += 8; return v; },
    u8() { return this.u[this.p++]; },
    skip(n) { this.p += n; },
    fstr() {
      const n = this.i32(); if (n === 0) return '';
      if (n < 0) { const s = td16.decode(this.u.subarray(this.p, this.p - n * 2)); this.p -= n * 2; return s.slice(0, -1); }
      if (n > 1e6) throw new Error('string');
      const s = td.decode(this.u.subarray(this.p, this.p + n - 1)); this.p += n; return s;
    }
  };
  function readType(r) { const n = r.fstr(), c = r.i32(); const p = []; for (let i = 0; i < c; i++) p.push(readType(r)); return { n, p }; }
  function readTag(r) {
    const name = r.fstr(); if (!name || name === 'None') return null;
    const type = readType(r), size = r.i32(), flags = r.u8();
    const tag = { name, type, size, flags };
    if (flags & 1) tag.idx = r.i32();
    if (flags & 2) r.skip(16);
    if (flags & 4) { const ext = r.u8(); if (ext & 2) r.skip(2); }
    return tag;
  }
  function readProps(r, end) {
    const out = {};
    while (end == null || r.p < end) {
      const tag = readTag(r); if (!tag) break;
      const st = r.p; let v;
      try { v = readValue(r, tag.type, tag.size, tag.flags, false); if (r.p !== st + tag.size) throw new Error('size'); }
      catch (e) { r.p = st + tag.size; v = { __raw: [st, tag.size] }; }
      out[tag.idx != null ? tag.name + '[' + tag.idx + ']' : tag.name] = v;
    }
    return out;
  }
  function readStruct(r, sname, size) {
    if (NATIVE[sname]) { const st = r.p; r.skip(NATIVE[sname]); return { __native: st }; }
    if (sname === 'GameplayTagContainer') { const n = r.i32(); const a = []; for (let i = 0; i < n; i++) a.push(r.fstr()); return a; }
    if (sname === 'GameplayTag') return r.fstr();
    if (sname === 'SoftObjectPath') return [r.fstr(), r.fstr()];
    if (sname === 'GrimItemInstanceHandle') {
      const path = r.fstr(); r.fstr(); r.i32(); const has = r.i32(); r.u8();
      const out = { __item: path };
      if (has) { Object.assign(out, readProps(r, null)); r.skip(5); }
      return out;
    }
    if (sname === 'SaveGameData') {
      const key = r.fstr(), cls = r.fstr(); r.i32(); r.u8();
      const props = readProps(r, null); r.i32();
      return Object.assign({ __key: key, __class: cls }, props);
    }
    return readProps(r, size == null ? null : r.p + size);
  }
  function readValue(r, t, size, flags, inC) {
    switch (t.n) {
      case 'BoolProperty': return inC ? !!r.u8() : !!(flags & 0x10);
      case 'IntProperty': return r.i32();
      case 'UInt32Property': return r.u32();
      case 'Int64Property': case 'UInt64Property': return r.i64();
      case 'FloatProperty': return r.f32();
      case 'DoubleProperty': return r.f64();
      case 'StrProperty': case 'NameProperty': case 'EnumProperty': return r.fstr();
      case 'ByteProperty': return (t.p[0] && t.p[0].n !== 'None') ? r.fstr() : r.u8();
      case 'ObjectProperty': case 'ClassProperty': case 'InterfaceProperty': return r.fstr();
      case 'SoftObjectProperty': case 'SoftClassProperty': { const a = r.fstr(), b = r.fstr(), c = r.fstr(); return a + (b ? '.' + b : '') + (c ? ':' + c : ''); }
      case 'TextProperty': {
        r.u32(); const ht = r.u8();
        if (ht === 0) { r.fstr(); const key = r.fstr(); r.fstr(); return key; }
        if (ht === 0xff) return r.u32() ? r.fstr() : '';
        if (ht === 0x0b) { r.fstr(); return r.fstr(); }
        throw new Error('text');
      }
      case 'StructProperty': {
        const sname = t.p[0] ? t.p[0].n : '?';
        if ((flags & 8) && !inC && !NATIVE[sname] && !KNOWN.has(sname)) {
          const st = r.p;
          try { const v = readProps(r, st + size); if (r.p === st + size) return v; } catch (e) { /* tenta o próximo */ }
          throw new Error('native ' + sname);
        }
        return readStruct(r, sname, inC ? null : size);
      }
      case 'ArrayProperty': case 'SetProperty': {
        const inner = t.p[0]; if (t.n === 'SetProperty') r.i32();
        const n = r.i32();
        if (inner.n === 'ByteProperty' && !(inner.p[0] && inner.p[0].n !== 'None')) { const st = r.p; r.skip(n); return { __bytes: [st, n] }; }
        const a = []; for (let i = 0; i < n; i++) a.push(readValue(r, inner, 0, 0, true)); return a;
      }
      case 'MapProperty': {
        r.i32(); const n = r.i32(); const a = [];
        for (let i = 0; i < n; i++) { const k = readValue(r, t.p[0], 0, 0, true); const v = readValue(r, t.p[1], 0, 0, true); a.push([k, v]); }
        return a;
      }
    }
    throw new Error('tipo ' + t.n);
  }
  IMP.readSave = function (buf) {
    const r = new Reader(buf);
    if (td.decode(r.u.subarray(0, 4)) !== 'GVAS') throw new Error('Este arquivo não é um save do Unreal (GVAS).');
    r.skip(4); r.i32(); r.i32();
    if (r.i32() < 1012) throw new Error('Este save é de uma versão antiga do jogo (antes do Early Access). Abra o personagem no jogo atual e salve de novo.');
    r.skip(6); r.u32(); r.fstr(); r.i32();
    const n = r.i32(); r.skip(n * 20);
    r.fstr(); r.u8();
    const props = readProps(r, null);
    const da = props.m_SerializedSaveGameData && props.m_SerializedSaveGameData.DataArray;
    if (!Array.isArray(da)) throw new Error('Não encontrei os dados do personagem neste arquivo.');
    const o = {}; da.forEach(e => { o[e.__key] = e; });
    return { o, r };
  };

  /* ---------- Mapear ids do jogo para os nomes do Atlas ---------- */
  const norm = s => String(s).toLowerCase().replace(/dmg/g, 'damage').replace(/[^a-z0-9]/g, '');
  const ALIAS = { leapslam: 'leap', arrowrain: 'rainofarrows', earthbarrier: 'earthbarrier' };
  const FEAT_ALIAS = { crit: 'criticalchance', maxrage: 'rageamount', rageonkill: 'rageonkill', duration: 'rageduration', minmaxrage: 'ragestacks', fireres: 'fireresistance', ailment: 'ailmentchance', healthregen: 'healthregeneration' };
  function bestMatch(token, names, alias) {
    let t = norm(token); t = (alias && alias[t]) || t;
    let hit = names.find(n => norm(n) === t);
    if (hit) return hit;
    hit = names.find(n => norm(n).includes(t) || t.includes(norm(n)));
    if (hit) return hit;
    const ex = t.replace(/res$/, 'resistance').replace(/regen$/, 'regeneration').replace(/^max/, 'maximum');
    hit = names.find(n => norm(n) === ex || norm(n).includes(ex));
    if (hit) return hit;
    // por palavras: "spellDamageCost" ~ "Spell Damage and Cost", "projectileSpeed" ~ "Fast Projectiles"
    const words = String(token).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/dmg/g, 'damage').split(/[^a-z0-9]+/).filter(Boolean);
    const close = (a, b) => a === b || a.startsWith(b) || b.startsWith(a) || (a.length > 4 && b.length > 4 && lev(a, b) <= 2);
    let best = null, bs = 0;
    names.forEach(n => {
      const nw = n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const sc = words.filter(w => nw.some(x => close(w, x))).length / words.length;
      if (sc > bs) { bs = sc; best = n; }
    });
    return bs >= 0.5 ? best : null;
  }
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const short = p => (p || '').split('/').pop().split('.')[0].replace(/_C$/, '');
  function skillToken(id) {
    const m = id.match(/_(?:wf|ea|st|rg|fo|sp|wa|ear|sto|rog|for|spi)_(?:passive_)?([A-Za-z]+?)(?:_activate)?(?:_p)?$/);
    return m ? m[1] : id;
  }
  function modToken(cls) {
    const s = short(cls).replace(/_(sustained|blessing|disruption|aura)$/, '');
    return s.split('_').pop();
  }
  function featToken(cls) { const m = short(cls).match(/_feat_([A-Za-z]+)_p$/); return m ? m[1] : short(cls); }

  function affixLine(affix, i) {
    const key = (affix || '').replace(/^da_/, '');
    const t = (window.TQ2_AFFIX_TEXT || {})[key];
    if (!t) return null;
    const lines = t.split(/\r\n|\n|\\r\\n|\\n/).filter(x => x.trim());
    return lines[i] != null ? lines[i] : lines[0];
  }

  /* Converte os dois saves em uma build do Atlas */
  IMP.toBuild = function (player, local, M) {
    const pl = player.o, lo = local.o, warn = [];
    const ps = pl.PlayerState, at = pl.TQ2CharacterAttributes, ms = lo.Mastery && lo.Mastery.m_Masteries;
    if (!ps || !at) throw new Error('Arquivo Data_Player.sav sem os dados esperados.');
    if (!ms) throw new Error('Arquivo Data_PlayerLocal.sav sem as masteries.');
    const build = { name: ps.m_CharacterName, level: at.m_CharacterLevel, attributePoints: {}, slots: [], sk: {}, gear: [] };
    Object.keys(at).forEach(k => { if (k.startsWith('m_AttributePoints')) build.attributePoints[k.slice(17)] = at[k]; });
    (ms.Masteries || []).forEach(m => {
      const raw = m.pMasteryDescription && m.pMasteryDescription.__raw;
      let mk = null;
      const rr = raw ? local.r : null;
      if (rr) { const s = td.decode(rr.u.subarray(raw[0], raw[0] + raw[1])); const mm = s.match(/da_mastery_([a-z]+)/); mk = mm && mm[1]; }
      if (!mk || !M[mk]) { if (mk) warn.push('Mastery não encontrada no Atlas: ' + mk); return; }
      if (!m.InvestedMasteryPoints && !(m.ActiveAbilities || []).some(a => a.InvestedPoints)) return;
      build.slots.push(mk);
      const actives = M[mk].skills.filter(s => s.k === 'active'), passives = M[mk].skills.filter(s => s.k === 'passive');
      (m.ActiveAbilities || []).forEach(a => {
        if (!a.InvestedPoints) return;
        const tok = skillToken((a.AbilityDescriptionTags || [''])[0].split('.').pop());
        const s = bestMatch(tok, actives.map(x => x.n), ALIAS);
        if (!s) { warn.push('Ativa não reconhecida: ' + tok); return; }
        const sk = actives.find(x => x.n === s), mods = {};
        (a.ModifierSlots || []).forEach(sl => {
          if (!sl.ModifierClass || sl.ModifierClass === 'None') return;
          const mt = modToken(sl.ModifierClass), mn = bestMatch(mt, sk.mods.map(x => x[0]));
          if (mn) mods[mn] = sl.Level; else warn.push(`Modifier não reconhecido em ${s}: ${mt}`);
        });
        build.sk[mk + '|' + s] = { l: a.InvestedPoints, f: [], m: mods };
      });
      (m.PassiveAbilities || []).forEach(p => {
        if (!p.InvestedPoints) return;
        const tok = skillToken((p.PassiveEffectTags || [''])[0].split('.').pop());
        const s = bestMatch(tok, passives.map(x => x.n), ALIAS);
        if (!s) { warn.push('Passiva não reconhecida: ' + tok); return; }
        const sk = passives.find(x => x.n === s), feats = [];
        (p.FeatSlots || []).forEach(f => {
          if (!f || f === 'None') return;
          const ft = featToken(f), fn = bestMatch(ft, sk.feats.map(x => x[0]), FEAT_ALIAS);
          if (fn) feats.push(fn); else warn.push(`Feat não reconhecido em ${s}: ${ft}`);
        });
        build.sk[mk + '|' + s] = { l: p.InvestedPoints, f: feats, m: {} };
      });
    });
    ((ps.m_Equipment || {}).ItemsBySlot || []).forEach(([slot, s]) => {
      const h = s && s.ItemHandle; if (!h || !h.__item) return;
      const item = short(h.__item); if (/potion/.test(item)) return;
      const g = { slot, item, level: h.m_Level, rarity: String(h.m_Rarity || '').split('::').pop(), stats: [] };
      if (h.m_BaseAttackDamage != null) g.BaseAttackDamage = h.m_BaseAttackDamage;
      if (h.m_AttackDamageVariance != null) g.AttackDamageVariance = h.m_AttackDamageVariance;
      if (h.m_AttackSpeedFactor != null) g.AttackSpeedFactor = h.m_AttackSpeedFactor;
      if (h.m_BaseArmor != null) g.BaseArmor = h.m_BaseArmor;
      // charm ou relíquia encaixada: o save guarda o caminho do item e a quantidade de stacks
      const sk = h.m_pSocketedItem && h.m_pSocketedItem.__raw;
      if (sk && player.r) {
        const txt = td.decode(player.r.u.subarray(sk[0], sk[0] + sk[1]));
        const mm = txt.match(/da_socket_[A-Za-z0-9_]+/);
        if (mm) g.socket = { id: mm[0], stacks: h.m_NumSocketableStacks || 1 };
      }
      const seen = {};
      (h.m_Affixes || []).forEach(a => {
        const affix = short(a.pAffix);
        (a.AffixEffectInstances || []).forEach(e => {
          const i = seen[affix] || 0; seen[affix] = i + 1;
          const v = e.Scale; let line = affixLine(affix, i), text = null;
          if (line) { text = line.replace(/\{Value\}(\|fmt\([^)]*\))?/g, String(Math.round(v * 100) / 100)); if (/fmt\(sign=true\)/.test(line) && v >= 0 && !/^\+/.test(text)) text = '+' + text; }
          g.stats.push({ affix, v, text, ge: String(e.pSoftGameplayEffect || '').split('.').pop().replace(/_C$/, ''), lvl: a.Level });
        });
      });
      build.gear.push(g);
    });
    build.slots = build.slots.slice(0, 2);
    return { build, warn };
  };

  /* Guarda personagens importados neste navegador */
  const KEY = 'tq2-imported-v1';
  IMP.load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  IMP.store = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* sem armazenamento */ } };
  IMP.init = () => { IMP.load().forEach(b => { if (!(window.TQ2_SAVES || []).some(x => x.name === b.name && x.imported)) (window.TQ2_SAVES = window.TQ2_SAVES || []).push(Object.assign(b, { imported: true })); }); };

  IMP.fromFiles = async function (files, M) {
    const list = [...files];
    const byKind = { player: null, local: null };
    for (const f of list) {
      const buf = await f.arrayBuffer();
      let parsed; try { parsed = IMP.readSave(buf); } catch (e) { continue; }
      if (parsed.o.PlayerState && parsed.o.TQ2CharacterAttributes) byKind.player = parsed;
      else if (parsed.o.Mastery) byKind.local = parsed;
    }
    if (!byKind.player || !byKind.local) throw new Error('Selecione os dois arquivos do personagem: o que termina em _Data_Player.sav e o que termina em _Data_PlayerLocal.sav.');
    return IMP.toBuild(byKind.player, byKind.local, M);
  };
})();
