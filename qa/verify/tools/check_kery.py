"""Kerykeion 6.0.5 as a separate program with its own rules: planetary hours, void-of-course Moon (classical planets),
annual profections (whole-sign houses), Egyptian terms, the midpoint composite and new moons."""
import json, os, sys, datetime, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(__file__))
TMP = os.environ.get('TOOLS_TMP')
import logging; logging.disable(logging.CRITICAL)
from kerykeion import PlanetaryHoursFactory, VoidOfCourseMoonFactory, ProfectionsFactory, AstrologicalSubjectFactory
UTC = datetime.timezone.utc
ms = lambda dt: dt.astimezone(UTC).timestamp() * 1000.0
iso = lambda t: datetime.datetime.fromtimestamp(t / 1000, UTC).strftime('%Y-%m-%dT%H:%M:%S')
res = {}

# ------------------------------------------------------------------ planetary hours
H = json.load(open(os.path.join(TMP, 'site_hours.json')))
dev = 0.0; n = 0; bad = []; skipped = 0
for c in H:
    r = c['r']
    if r.get('polar') or c['y'] != 2026: continue
    try:
        k = PlanetaryHoursFactory.from_datetime(c['y'], c['m'], c['d'], 12, 0, latitude=c['lat'], longitude=c['lon'], tz_str=c['tz']).model_dump()
    except Exception as e:
        skipped += 1; continue
    if abs(ms(k['sunrise']) - r['sunrise']) > 3 * 3600000: skipped += 1; continue     # noon before sunrise: previous planetary day
    n += 1
    dev = max(dev, abs(ms(k['sunrise']) - r['sunrise']) / 1000, abs(ms(k['sunset']) - r['sunset']) / 1000, abs(ms(k['next_sunrise']) - r['nextSunrise']) / 1000)
    if k['day_ruler'] != r['dayRuler'] or [h['ruler'] for h in k['hours']] != [h['ruler'] for h in r['hours']]: bad.append((c['id'], c['m'], c['d'], k['day_ruler'], r['dayRuler']))
res['hours'] = {'n': n, 'skipped': skipped, 'max_dev_s': round(dev, 1), 'ruler_mismatch': bad}

# ------------------------------------------------------------------ void of course, classical planets
V = json.load(open(os.path.join(TMP, 'site_voc.json')))
vd = [0.0, 0.0]; vn = 0; vbad = []
AS = {'conjunction': 0, 'sextile': 60, 'square': 90, 'trine': 120, 'opposition': 180}
for w in V:
    if not w['classic']: continue
    try:
        k = VoidOfCourseMoonFactory.from_iso_range(iso(w['from'] - 3 * 86400000), iso(w['from'] + 17 * 86400000)).model_dump()['windows']
    except Exception as e:
        continue
    for s in w['list']:
        m = [x for x in k if abs(ms(x['void_end']) - s['end']) < 7200000]
        if not m: vbad.append(('no kerykeion window', iso(s['end']))); continue
        x = m[0]; vn += 1
        la = (x['last_aspect']['planet'], AS[x['last_aspect']['aspect']]) if x['last_aspect'] else None
        ls = (s['last']['planet'], s['last']['aspect']) if s['last'] else None
        if la != ls: vbad.append(('last aspect', iso(s['end']), ls, la)); continue
        vd[0] = max(vd[0], abs(ms(x['void_start']) - s['start']) / 1000); vd[1] = max(vd[1], abs(ms(x['void_end']) - s['end']) / 1000)
res['voc'] = {'n': vn, 'max_dev_s_start_end': [round(v, 1) for v in vd], 'mismatch': vbad[:10], 'n_mismatch': len(vbad)}

# ------------------------------------------------------------------ profections (whole signs) and composite
C = json.load(open(os.path.join(TMP, 'site_cycles.json')))
CASES = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'cases.json')))['charts']
def subj(case, hs='W'):
    t = datetime.datetime.strptime(case['utc'], '%Y-%m-%dT%H:%M:%SZ')
    return AstrologicalSubjectFactory.from_birth_data(case['id'], t.year, t.month, t.day, t.hour, t.minute, lat=case['lat'], lng=case['lon'], tz_str='UTC', online=False, houses_system_identifier=hs, seconds=t.second)
pb = []; pn = 0
SIGN3 = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis']
for c, case in zip(C, CASES):
    for p in c['prof']:
        if 'error' in p: continue
        try:
            s = subj(case)
            tgt = datetime.datetime.fromtimestamp(p['now'] / 1000, UTC).strftime('%Y-%m-%d')
            k = ProfectionsFactory.from_subject(s, target_date=tgt).model_dump()['current']
        except Exception as e:
            pb.append((case['id'], 'error', str(e)[:80])); continue
        pn += 1
        ks = k.get('sign'); kl = k.get('lord') or k.get('lord_of_the_year') or k.get('ruler')
        if k.get('age') != p['age'] or ks != SIGN3[p['cur']['sign']] or kl != p['cur']['lord']: pb.append((case['id'], tgt, (k.get('age'), ks, kl), (p['age'], SIGN3[p['cur']['sign']], p['cur']['lord'])))
res['profections'] = {'n': pn, 'mismatch': pb}

# ------------------------------------------------------------------ Egyptian terms
from kerykeion.dignities import data as KD
N = json.load(open(os.path.join(TMP, 'site_natal.json')))
SIGNK = list(KD.EGYPTIAN_TERMS.keys())
tb = 0
for r in N['deg']:
    s = SIGNK[int(r['lon'] // 30)]; d = r['lon'] % 30
    kt = [p for p, a, b in KD.EGYPTIAN_TERMS[s] if a <= d < b][0]
    tb += kt != r['term']
res['terms'] = {'n_half_degrees': len(N['deg']), 'mismatch': tb, 'sign_keys': SIGNK[:2]}

# ------------------------------------------------------------------ composite (midpoints)
from kerykeion import CompositeSubjectFactory
S = json.load(open(os.path.join(TMP, 'site_syn.json')))
byid = {c['id']: c for c in CASES}
cd = 0.0; cn = 0; cang = []; cerr = []
NAMES = {'Sun': 'sun', 'Moon': 'moon', 'Mercury': 'mercury', 'Venus': 'venus', 'Mars': 'mars', 'Jupiter': 'jupiter', 'Saturn': 'saturn', 'Uranus': 'uranus', 'Neptune': 'neptune', 'Pluto': 'pluto'}
for x in S:
    try:
        A, B = subj(byid[x['a']], 'P'), subj(byid[x['b']], 'P')
        k = CompositeSubjectFactory(A, B).get_midpoint_composite_subject_model().model_dump()
    except Exception as e:
        cerr.append((x['a'], x['b'], str(e)[:100])); continue
    for p in x['comp']['points']:
        if p['id'] not in NAMES or not k.get(NAMES[p['id']]): continue
        kl = k[NAMES[p['id']]]['abs_pos']
        d = abs((p['lon'] - kl + 180) % 360 - 180)
        cd = max(cd, d); cn += 1
    ka = k.get('ascendant', {}).get('abs_pos') if k.get('ascendant') else None
    km = k.get('medium_coeli', {}).get('abs_pos') if k.get('medium_coeli') else None
    if ka is not None: cang.append((x['a'], x['b'], round(abs((x['comp']['asc'] - ka + 180) % 360 - 180), 2), round(abs((x['comp']['mc'] - km + 180) % 360 - 180), 2)))
res['composite'] = {'n_points': cn, 'max_dev_deg': cd, 'angles_dev_deg(asc,mc)': cang, 'errors': cerr}
json.dump(res, open(os.path.join(TMP, 'res_kery.json'), 'w'), indent=1, default=str)
print(json.dumps(res, indent=1, default=str)[:5000])
