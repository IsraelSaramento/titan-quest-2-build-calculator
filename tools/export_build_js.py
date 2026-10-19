"""Converte o JSON da build (build_from_save.py) para o formato do Atlas (nomes das skills do artifact).

Uso: python export_build_js.py <build.json> <saida.js>
"""
import json
import re
import sys

# id do jogo -> nome no Atlas
SKILL = {
    'sweepingStrike': 'Sweeping Strike', 'battlefieldAwareness': 'Battlefield Awareness', 'valor': 'Valor',
    'warBanner': 'War Banner', 'heavyAttack': 'Heavy Attack', 'stomp': 'Stomp', 'doomHorn': 'Doom Horn',
    'leapSlam': 'Leap', 'barrage': 'Barrage', 'arrowRain': 'Rain of Arrows',
    'earthEnchantment': 'Earth Enchantment', 'ringOfFlame': 'Ring of Flame', 'fissure': 'Fissure',
    'roilingMagma': 'Roiling Magma', 'flameVolley': 'Flame Volley', 'earthquake': 'Earthquake',
    'coreDweller': 'Core Dweller', 'ignite': 'Ignite', 'volcanicEruption': 'Volcanic Eruption', 'stoneForm': 'Stone Form',
    'weaponProficiency': 'Weapon Proficiency', 'martialExpert': 'Martial Expert', 'combatRush': 'Combat Rush',
    'marksmanship': 'Marksmanship', 'invokerOfWar': 'Invoker of War', 'battleRage': 'Battle Rage',
    'battleHardened': 'Battle Hardened', 'heartOfBattle': 'Heart of Battle', 'versatileDefense': 'Versatile Defense',
    'secondWind': 'Second Wind', 'leadership': 'Leadership', 'frenziedRage': 'Frenzied Rage', 'eviscerate': 'Eviscerate',
    'unyielding': 'Unyielding', 'strategos': 'Strategos', 'carnage': 'Carnage', 'precisionStrikes': 'Precision Strikes',
    'brutalImpact': 'Brutal Impact', 'warDomain': 'War Domain', 'sanguineDomain': 'Sanguine Domain',
    'grandMagic': 'Grand Magic', 'arcaneAbundance': 'Arcane Abundance', 'earthAttunement': 'Earth Attunement',
    'earthAffliction': 'Earth Affliction', 'earthWielder': 'Earth Wielder', 'earthbarrier': 'Earth Barrier',
    'earthInvoker': 'Earth Invoker', 'combustion': 'Combustion', 'overheat': 'Overheat', 'magmaShell': 'Magma Shell',
    'igneousPower': 'Igneous Power', 'cremation': 'Cremation', 'concussiveForce': 'Concussive Force',
    'stableBarrier': 'Stable Barrier', 'cinderbreak': 'Cinderbreak', 'stonebornArmy': 'Stoneborn Army',
    'erosion': 'Erosion', 'fireDomain': 'Fire Domain', 'stoneDomain': 'Stone Domain',
}
MOD = {
    'rageGain': 'Rage Gain', 'whirlwind': 'Whirlwind', 'rampUp': 'Ramp Up', 'inspiration': 'Inspiration',
    'enhancedResistances': 'Enhanced Resistances', 'conservation': 'Conservation',
    'enhancedGlancingHits': 'Enhanced Glancing Hits', 'burstOfSpeed': 'Burst of Speed', 'increasedDmg': 'Increased Damage',
    'earthEnhancement': 'Earth Enhancement', 'fireImbuement': 'Fire Imbuement', 'empoweringFlame': 'Empowering Flame',
    'scorchingWeapon': 'Scorching Weapon', 'enhancedAmplify': 'Enhanced Amplify',
}
FEAT = {
    'weaponProficiency': {'attackSpeed': 'Attack Speed', 'crit': 'Critical Chance', 'ailment': 'Ailment Chance'},
    'combatRush': {'damage': 'Damage', 'regeneration': 'Regeneration', 'armor': 'Armor'},
    'battleRage': {'maxRage': 'Rage Amount', 'rageOverflow': 'Rage Overflow', 'rageOnKill': 'Rage On Kill'},
    'frenziedRage': {'duration': 'Rage Duration', 'minMaxRage': 'Rage Stacks', 'overflow': 'Rage Overflow'},
    'earthAttunement': {'area': 'Area', 'weapon': 'Weapon', 'spell': 'Spell'},
    'combustion': {'damage': 'Damage', 'radius': 'Radius', 'chance': 'Chance'},
    'magmaShell': {'fireRes': 'Fire Resistance', 'fireRetaliation': 'Fire Retaliation', 'overload': 'Overload'},
}


def skill_key(gid):
    m = re.search(r'_(?:wf|ea|st|rg|fo|sp)_(?:passive_)?([A-Za-z]+?)(?:_activate)?(?:_p)?$', gid)
    k = m.group(1) if m else gid
    return k


def mod_name(cls):
    m = re.search(r'_(?:sweepingStrike|warBanner|ringOfFlame|earthEnchantment|generic)_([A-Za-z]+?)(?:_sustained|_blessing)?$', cls)
    k = m.group(1) if m else cls
    return MOD.get(k, k)


def feat_name(pkey, cls):
    m = re.search(r'_feat_([A-Za-z]+)_p$', cls)
    k = m.group(1) if m else cls
    return FEAT.get(pkey, {}).get(k, k)


def split_lines(text):
    return [t for t in re.split(r'\\r\\n|\r\n|\n|\\n', text or '') if t.strip()]


def main(src, out):
    b = json.load(open(src, encoding='utf-8'))
    res = {'name': b['name'], 'level': b['level'], 'attributePoints': b['attributePoints'], 'slots': [], 'sk': {}, 'gear': []}
    for m in b['masteries']:
        mk = m['mastery']
        res['slots'].append(mk)
        for a in m['actives']:
            k = skill_key(a['id'])
            res['sk'][mk + '|' + SKILL.get(k, k)] = {'l': a['points'], 'f': [], 'm': {mod_name(c): lv for c, lv in a['mods']}}
        for p in m['passives']:
            k = skill_key(p['id'])
            res['sk'][mk + '|' + SKILL.get(k, k)] = {'l': p['points'], 'f': [feat_name(k, f) for f in p['feats']], 'm': {}}
    for it in b['equipment']:
        if 'potion' in it['item']:
            continue
        g = {'slot': it['slot'], 'item': it['item'], 'level': it.get('level'), 'rarity': it.get('rarity'), 'stats': []}
        for k in ('BaseAttackDamage', 'AttackDamageVariance', 'AttackSpeedFactor', 'BaseArmor'):
            if k in it:
                g[k] = round(it[k], 4)
        # afixos com mais de uma instância (ex.: Strike e Pierce) usam uma linha do texto para cada
        seen = {}
        for a in it['affixes']:
            lines = split_lines(a['text'])
            i = seen.get(a['affix'], 0)
            seen[a['affix']] = i + 1
            line = lines[i] if i < len(lines) else (lines[0] if lines else None)
            v = a['value']
            txt = None
            if line:
                txt = re.sub(r'\{Value\}(\|fmt\([^)]*\))?', ('%g' % v), line)
                if 'fmt(sign=true)' in line and v >= 0:
                    txt = re.sub(r'^(\d)', r'+\1', txt)
            g['stats'].append({'affix': a['affix'], 'v': v, 'text': txt})
        res['gear'].append(g)
    js = '// Gerado por tools/export_build_js.py a partir do save do jogo.\nwindow.TQ2_SAVES = window.TQ2_SAVES || [];\nTQ2_SAVES.push(' + json.dumps(res, ensure_ascii=False, indent=1) + ');\n'
    open(out, 'w', encoding='utf-8').write(js)
    print(json.dumps(res, ensure_ascii=False, indent=1)[:6000])


if __name__ == '__main__':
    main(*sys.argv[1:3])
