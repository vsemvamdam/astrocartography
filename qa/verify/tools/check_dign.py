"""Tables of essential dignity and what is built on them: terms (Egyptian for the tools, Ptolemaic as printed by Lilly for
horary), Chaldean faces, triplicities, domiciles and exaltations, Lilly's points, the almuten, dispositors, the Hermetic lots,
the 30° dial pairs.
Sources: flatlib (tables.py, arabicparts.py), Astrolog 7 (calc.cpp rgnTermEgypt/rgnTermPtolemy, the Chaldean decan code,
data.cpp ruler/exalt arrays and the Arabic parts table ai[]), Lilly's table (Christian Astrology p. 104, as transcribed below
from Skyscript), and a separate implementation written from those tables here."""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
TMP = os.environ.get('TOOLS_TMP')
D = json.load(open(os.path.join(TMP, 'site_natal.json')))
from flatlib.dignities import tables as T
from flatlib.tools import arabicparts as AP
SIGNS = T.SIGN_LIST
PL = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
n360 = lambda x: x % 360.0
def n180(x):
    y = x % 360.0
    return y - 360 if y > 180 else y

# ------------------------------------------------------------------ Astrolog (calc.cpp), packed tables decoded
AOBJ = {1: 'Sun', 2: 'Moon', 3: 'Mercury', 4: 'Venus', 5: 'Mars', 6: 'Jupiter', 7: 'Saturn'}
EGY = [0x66855, 0x64357, 0x86853, 0x43675, 0x66576, 0x36457, 0x76674, 0x54367, 0x65766, 0x64735, 0x7a472, 0x34657, 0x68772, 0x73645, 0x74856, 0x54367,
       0xc5454, 0x64375, 0x77844, 0x36475, 0x76755, 0x34657, 0xc4392, 0x46357]
PTO = [0x68754, 0x64357, 0x87744, 0x43675, 0x77745, 0x36475, 0x67773, 0x56347, 0x67665, 0x73465, 0x76566, 0x34675, 0x65856, 0x74635, 0x68763, 0x56437,
       0x86565, 0x64375, 0x66765, 0x43657, 0x66855, 0x73465, 0x86664, 0x46357]
def astrolog_term(tab, lon):
    s = int(lon // 30); deg = int(lon) - s * 30; d = 0
    for i in range(5):
        d += (tab[s * 2] >> (4 - i) * 4) & 15
        if deg < d: return AOBJ[(tab[s * 2 + 1] >> (4 - i) * 4) & 15]
def astrolog_face(lon):
    n = int(lon) // 10 % 7
    return AOBJ[(0x5143276 >> (6 - n) * 4) & 15]
A_RULER1 = {1: 'Leo', 2: 'Cancer', 3: 'Gemini', 4: 'Libra', 5: 'Aries', 6: 'Sagittarius', 7: 'Capricorn', 8: 'Aquarius', 9: 'Pisces', 10: 'Scorpio'}
A_RULER2 = {3: 'Virgo', 4: 'Taurus', 5: 'Scorpio', 6: 'Pisces', 7: 'Aquarius'}
A_EXALT = {1: 'Aries', 2: 'Taurus', 3: 'Virgo', 4: 'Pisces', 5: 'Capricorn', 6: 'Cancer', 7: 'Libra'}

# ------------------------------------------------------------------ Lilly, Christian Astrology p. 104 (Ptolemaic terms)
LILLY = {  # sign: [(planet, end degree)]
 'Aries': [('Jupiter', 6), ('Venus', 14), ('Mercury', 21), ('Mars', 26), ('Saturn', 30)],
 'Taurus': [('Venus', 8), ('Mercury', 15), ('Jupiter', 22), ('Saturn', 26), ('Mars', 30)],
 'Gemini': [('Mercury', 7), ('Jupiter', 14), ('Venus', 21), ('Saturn', 25), ('Mars', 30)],
 'Cancer': [('Mars', 6), ('Jupiter', 13), ('Mercury', 20), ('Venus', 27), ('Saturn', 30)],
 'Leo': [('Saturn', 6), ('Mercury', 13), ('Venus', 19), ('Jupiter', 25), ('Mars', 30)],
 'Virgo': [('Mercury', 7), ('Venus', 13), ('Jupiter', 18), ('Saturn', 24), ('Mars', 30)],
 'Libra': [('Saturn', 6), ('Venus', 11), ('Jupiter', 19), ('Mercury', 24), ('Mars', 30)],
 'Scorpio': [('Mars', 6), ('Jupiter', 14), ('Venus', 21), ('Mercury', 27), ('Saturn', 30)],
 'Sagittarius': [('Jupiter', 8), ('Venus', 14), ('Mercury', 19), ('Saturn', 25), ('Mars', 30)],
 'Capricorn': [('Venus', 6), ('Mercury', 12), ('Jupiter', 19), ('Mars', 25), ('Saturn', 30)],
 'Aquarius': [('Saturn', 6), ('Mercury', 12), ('Venus', 20), ('Jupiter', 25), ('Mars', 30)],
 'Pisces': [('Venus', 8), ('Jupiter', 14), ('Mercury', 20), ('Mars', 26), ('Saturn', 30)]}
LILLY_TRIP = [('Sun', 'Jupiter'), ('Venus', 'Moon'), ('Saturn', 'Mercury'), ('Mars', 'Mars')]
def term_from(tab, lon):
    s = SIGNS[int(lon // 30)]; d = lon % 30
    for row in tab[s]:
        if len(row) == 3:
            pid, a, b = row
            if a <= d < b: return pid
        else:
            pid, e = row
            if d < e: return pid

res = {}
# ---------------------------------------------------------------- terms, faces
bad = {'egy_flatlib': 0, 'egy_astrolog': 0, 'face_flatlib': 0, 'face_astrolog': 0, 'lilly_flatlib': 0, 'lilly_cA': 0, 'lilly_astrolog_ptolemy': 0, 'lilly_vs_tetrabiblos': 0}
for r in D['deg']:
    x = r['lon']; s = SIGNS[int(x // 30)]
    bad['egy_flatlib'] += r['term'] != term_from(T.EGYPTIAN_TERMS, x)
    bad['egy_astrolog'] += r['term'] != astrolog_term(EGY, x)
    fl = T.CHALDEAN_FACES[s][int((x % 30) // 10)]
    bad['face_flatlib'] += r['face'] != fl
    bad['face_astrolog'] += r['face'] != astrolog_face(x)
    ht = r['hDay']['term']
    bad['lilly_flatlib'] += ht != term_from(T.LILLY_TERMS, x)
    bad['lilly_cA'] += ht != term_from(LILLY, x)
    bad['lilly_astrolog_ptolemy'] += ht != astrolog_term(PTO, x)
    bad['lilly_vs_tetrabiblos'] += ht != term_from(T.TETRABIBLOS_TERMS, x)
    bad.setdefault('hface', 0); bad['hface'] += r['hDay']['face'] != fl
res['terms_faces'] = {'n_half_degrees': len(D['deg']), 'mismatch_half_degrees': bad}

# ---------------------------------------------------------------- domicile, exaltation, triplicity
E = T.ESSENTIAL_DIGNITIES
tri_bad = []; dom_bad = []
for k, r in enumerate(D['deg'][::60]):     # one per sign
    s = SIGNS[int(r['lon'] // 30)]
    dorD, dorN = E[s]['trip'][0], E[s]['trip'][1]
    dayS = [pid for pid, v in r['day'].items() if 'триплицитет' in v['kinds']]
    nightS = [pid for pid, v in r['night'].items() if 'триплицитет' in v['kinds']]
    if dayS != [dorD] or nightS != [dorN]: tri_bad.append((s, dayS, nightS, dorD, dorN))
    lt = LILLY_TRIP[int(r['lon'] // 30) % 4]
    if r['hDay']['trip'] != lt[0] or r['hNight']['trip'] != lt[1]: tri_bad.append(('lilly', s, r['hDay']['trip'], r['hNight']['trip'], lt))
    dom = [pid for pid, v in r['day'].items() if 'обитель' in v['kinds']]
    if dom != [E[s]['ruler']]: dom_bad.append((s, dom, E[s]['ruler']))
    ex = [pid for pid, v in r['day'].items() if 'экзальтация' in v['kinds']]
    if ex != ([E[s]['exalt'][0]] if E[s]['exalt'][0] else []): dom_bad.append(('exalt', s, ex, E[s]['exalt'][0]))
    if r['hDay']['detriment'] != E[s]['exile'] or r['hDay']['fall'] != E[s]['fall'][0]: dom_bad.append(('det/fall', s, r['hDay']['detriment'], r['hDay']['fall'], E[s]['exile'], E[s]['fall'][0]))
# NATAL.dignity (modern rulers) against Astrolog's ruler1/ruler2/exalt
ASTRO_IDS = {1: 'Sun', 2: 'Moon', 3: 'Mercury', 4: 'Venus', 5: 'Mars', 6: 'Jupiter', 7: 'Saturn', 8: 'Uranus', 9: 'Neptune', 10: 'Pluto'}
nat_bad = []
for si, sname in enumerate(SIGNS):
    for code, pid in ASTRO_IDS.items():
        rules = A_RULER1.get(code) == sname or A_RULER2.get(code) == sname
        detr = A_RULER1.get(code) == SIGNS[(si + 6) % 12] or A_RULER2.get(code) == SIGNS[(si + 6) % 12]
        exa = A_EXALT.get(code) == sname
        fal = A_EXALT.get(code) == SIGNS[(si + 6) % 12]
        got = set(D['dignity'][si][pid])
        exp = set(k for k, f in (('dom', rules), ('det', detr), ('exalt', exa), ('fall', fal)) if f)
        # Astrolog lists only the modern ruler of Scorpio, Aquarius, Pisces in ruler1 and the classical one in ruler2 for Mars/Saturn/Jupiter? check both
        if got != exp: nat_bad.append((sname, pid, sorted(got), sorted(exp)))
res['rulers'] = {'triplicity_mismatch': tri_bad, 'domicile_exalt_mismatch': dom_bad, 'natal_dignity_vs_astrolog': nat_bad}

# ---------------------------------------------------------------- Lilly's points per planet (dignityTable)
def lilly_points(pid, lon, day, terms=T.EGYPTIAN_TERMS, trip='dor'):
    s = SIGNS[int(lon // 30)]; d = lon % 30; e = E[s]; items = []
    if e['ruler'] == pid: items.append(5)
    if e['exalt'][0] == pid: items.append(4)
    tr = (e['trip'][0] if day else e['trip'][1]) if trip == 'dor' else LILLY_TRIP[int(lon // 30) % 4][0 if day else 1]
    if tr == pid: items.append(3)
    if term_from(terms, lon) == pid: items.append(2)
    if T.CHALDEAN_FACES[s][int(d // 10)] == pid: items.append(1)
    pos = bool(items)
    if e['exile'] == pid: items.append(-5)
    if e['fall'][0] == pid: items.append(-4)
    if not pos: items.append(-5)
    return sum(items)
tot_bad = []; n_tot = 0; alm_bad = []; alm_pt_bad = []
for ch in D['charts']:
    day = ch['isDay']
    for row in ch['dign']['rows']:
        n_tot += 1
        exp = lilly_points(row['id'], row['p']['lon'], day)
        if exp != row['total']: tot_bad.append((ch['id'], row['id'], row['p']['lon'], row['total'], exp))
    # almuten figuris: dignity points of every planet over Sun, Moon, ASC, MC, Fortune
    keys = [p for p in ch['points'] if p['id'] in ('Sun', 'Moon')] + [{'id': 'ASC', 'lon': ch['asc']}, {'id': 'MC', 'lon': ch['mc']}] + [p for p in ch['points'] if p['id'] == 'Fortune']
    tot = {pid: 0 for pid in PL}
    for k, p in enumerate(keys):
        sc = {}
        for pid in PL:
            v = lilly_points(pid, p['lon'], day)
            # only the positive dignities count for the almuten
            s = SIGNS[int(p['lon'] // 30)]; e = E[s]; pts = 0
            if e['ruler'] == pid: pts += 5
            if e['exalt'][0] == pid: pts += 4
            if (e['trip'][0] if day else e['trip'][1]) == pid: pts += 3
            if term_from(T.EGYPTIAN_TERMS, p['lon']) == pid: pts += 2
            if T.CHALDEAN_FACES[s][int((p['lon'] % 30) // 10)] == pid: pts += 1
            sc[pid] = pts; tot[pid] += pts
        best = max(sc.values())
        sp = ch['dign']['perPoint'][k]
        if sc.get(sp['almuten']) != best or sp['points'] != best: alm_pt_bad.append((ch['id'], sp['ru'], sp['almuten'], sp['points'], [x for x in PL if sc[x] == best], best))
    top = max(tot.values()); site_top = ch['dign']['almuten'][0]
    if tot.get(site_top[0]) != top or site_top[1] != top: alm_bad.append((ch['id'], site_top, {k: v for k, v in tot.items() if v == top}))
    ties = [k for k, v in tot.items() if v == top]
    if len(ties) > 1: alm_bad.append(('tie', ch['id'], ties, 'site shows', site_top[0]))
res['dignity_table'] = {'n_planets': n_tot, 'total_mismatch': tot_bad, 'almuten_mismatch': alm_bad, 'almuten_point_mismatch': alm_pt_bad}

# ---------------------------------------------------------------- horary essential() over the zodiac against Lilly's table
ess_bad = 0; ess_n = 0; ess_ex = []
for r in D['ess']:
    for sect, key in ((True, 'day'), (False, 'night')):
        x = r['lon']; pid = r['id']; s = SIGNS[int(x // 30)]; e = E[s]
        exp = []
        if e['ruler'] == pid: exp.append('domicile')
        if e['exalt'][0] == pid: exp.append('exalt')
        if LILLY_TRIP[int(x // 30) % 4][0 if sect else 1] == pid: exp.append('trip')
        if term_from(LILLY, x) == pid: exp.append('term')
        if T.CHALDEAN_FACES[s][int((x % 30) // 10)] == pid: exp.append('face')
        if not exp: exp.append('peregrine')
        if e['exile'] == pid: exp.append('detriment')
        if e['fall'][0] == pid: exp.append('fall')
        ess_n += 1
        if exp != r[key]:
            ess_bad += 1
            if len(ess_ex) < 5: ess_ex.append((x, pid, key, r[key], exp))
res['horary_essential'] = {'n': ess_n, 'mismatch': ess_bad, 'examples': ess_ex}

# ---------------------------------------------------------------- dispositors (independent implementation)
CLASSIC_RUL = [E[s]['ruler'] for s in SIGNS]
MODERN_RUL = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Pluto', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']
def chains(points, modern):
    ids = PL + (['Uranus', 'Neptune', 'Pluto'] if modern else [])
    RUL = MODERN_RUL if modern else CLASSIC_RUL
    sg = {p['id']: int(p['lon'] // 30) for p in points if p['id'] in ids}
    out = []
    for pid in ids:
        path = [pid]
        while True:
            nx = RUL[sg[path[-1]]]
            if nx == path[-1]: out.append((path, 'own')); break
            if nx in path: path.append(nx); out.append((path, 'loop')); break
            path.append(nx)
    finals = {p[-1] for p, e in out if e == 'own'}
    final = list(finals)[0] if len(finals) == 1 and all(e == 'own' for _, e in out) else None
    return out, final
disp_bad = []
for ch in D['charts']:
    for modern, key in ((False, 'dispC'), (True, 'dispM')):
        out, final = chains(ch['points'], modern)
        got = [(c['path'], c['end']) for c in ch[key]['chains']]
        if got != out or ch[key]['final'] != final: disp_bad.append((ch['id'], key, ch[key]['final'], final))
res['dispositors'] = {'n_charts': len(D['charts']) * 2, 'mismatch': disp_bad}

# ---------------------------------------------------------------- Hermetic lots against flatlib's formulas and Astrolog's ai[]
class FakeChart:
    def __init__(self, ch):
        self.ch = ch
        self.objs = {p['id']: p['lon'] for p in ch['points']}
        self.objs['Asc'] = ch['asc']
    def isDiurnal(self): return self.ch['isDay']
    def get(self, ID):
        class O: pass
        o = O(); o.lon = self.objs['Asc' if ID == 'Asc' else ID]; return o
    getObject = get
FL = {'Фортуны': AP.PARS_FORTUNA, 'Духа': AP.PARS_SPIRIT, 'Эроса': AP.PARS_VENUS, 'Необходимости': AP.PARS_MERCURY, 'Мужества': AP.PARS_MARS, 'Победы': AP.PARS_JUPITER, 'Немезиды': AP.PARS_SATURN}
lots_dev = {'flatlib': 0.0, 'astrolog': 0.0, 'valens_diff': 0}
lot_n = 0; lot_bad = []
for ch in D['charts']:
    fc = FakeChart(ch)
    P = fc.objs; asc = ch['asc']; day = ch['isDay']
    fort = n360(asc + P['Moon'] - P['Sun']) if day else n360(asc + P['Sun'] - P['Moon'])
    spir = n360(asc + P['Sun'] - P['Moon']) if day else n360(asc + P['Moon'] - P['Sun'])
    # Astrolog ai[]: "02 01F" Fortune, "01 02F" Spirit, "06 S F" Victory, "F  05F" Valor; F = reversed by night
    flip = lambda x, y: n360(asc + x - y) if day else n360(asc + y - x)
    astro = {'Фортуны': flip(P['Moon'], P['Sun']), 'Духа': flip(P['Sun'], P['Moon']), 'Победы': flip(P['Jupiter'], spir), 'Мужества': flip(fort, P['Mars'])}
    for l in ch['lots']:
        lot_n += 1
        v = n360(AP.partLon(FL[l['ru']], fc))
        d = abs(n180(l['lon'] - v)); lots_dev['flatlib'] = max(lots_dev['flatlib'], d)
        if d > 1e-6: lot_bad.append((ch['id'], l['ru'], l['lon'], v))
        if l['ru'] in astro: lots_dev['astrolog'] = max(lots_dev['astrolog'], abs(n180(l['lon'] - astro[l['ru']])))
res['lots'] = {'n': lot_n, 'max_dev_deg': lots_dev, 'mismatch': lot_bad[:10]}
# day/night as flatlib decides it (Sun above the horizon by altitude) — compare with the site's houses-based rule
json.dump(res, open(os.path.join(TMP, 'res_dign.json'), 'w'), indent=1)
print(json.dumps(res, indent=1, default=str)[:6000])

# ---------------------------------------------------------------- degreeRulers over the zodiac (what each planet owns at a degree)
KIND = {'обитель': 5, 'экзальтация': 4, 'триплицитет': 3, 'термы': 2, 'фас': 1}
dr_bad = 0; dr_n = 0; dr_ex = []
for r in D['deg']:
    x = r['lon']; s = SIGNS[int(x // 30)]; e = E[s]
    for sect, key in ((True, 'day'), (False, 'night')):
        exp = {}
        def add(pid, k): exp.setdefault(pid, []).append(k)
        add(e['ruler'], 'обитель')
        if e['exalt'][0]: add(e['exalt'][0], 'экзальтация')
        add(e['trip'][0] if sect else e['trip'][1], 'триплицитет')
        add(term_from(T.EGYPTIAN_TERMS, x), 'термы')
        add(T.CHALDEAN_FACES[s][int((x % 30) // 10)], 'фас')
        got = {pid: sorted(v['kinds']) for pid, v in r[key].items()}
        tot_ok = all(r[key][pid]['total'] == sum(KIND[k] for k in v['kinds']) for pid, v in r[key].items())
        dr_n += 1
        if got != {k: sorted(v) for k, v in exp.items()} or not tot_ok:
            dr_bad += 1
            if len(dr_ex) < 3: dr_ex.append((x, key, got, exp))
res['degree_rulers'] = {'n': dr_n, 'mismatch': dr_bad, 'examples': dr_ex}
json.dump(res, open(os.path.join(TMP, 'res_dign.json'), 'w'), indent=1, default=str)
print('degree_rulers', res['degree_rulers'])
