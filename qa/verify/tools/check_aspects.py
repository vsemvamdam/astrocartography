"""Natal aspects and orbs, synastry cross-aspects, the composite chart.
Independent implementation from the README rules ("соединение и оппозиция 8°, трин и квадрат 7°, секстиль 5°, для Солнца и Луны
на 2° шире"; small points capped at 5°/1.5°) and from the site's stated synastry orbs; applying/separating from Swiss Ephemeris
speeds; for comparison the orbs of Astrolog 7 (data.cpp rAspOrb, rObjAdd) and Kerykeion 6 (config_constants.py)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
import swisseph as swe
TMP = os.environ.get('TOOLS_TMP')
N = json.load(open(os.path.join(TMP, 'site_natal.json')))
S = json.load(open(os.path.join(TMP, 'site_syn.json')))
n180 = R.n180
MAJ = {0: 8, 180: 8, 120: 7, 90: 7, 60: 5}
MIN = {150: 3, 30: 2, 45: 2, 135: 2, 72: 1.5, 144: 1.5}
ASTROLOG = {0: 7, 180: 7, 90: 7, 120: 7, 60: 6}      # rAspOrb; Sun and Moon +1 (rObjAdd)
KERY = {0: 6, 180: 6, 120: 6, 90: 6, 60: 5}          # DEFAULT_ACTIVE_ASPECTS orbs; luminaries +1.5
def mine(pts, minor, scheme='site'):
    out = []
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            A, B = pts[i], pts[j]
            ids = {A['id'], B['id']}
            if ids == {'Node', 'SNode'} or ids == {'ASC', 'MC'}: continue
            sep = abs(n180(B['lon'] - A['lon']))
            best = None
            table = dict(MAJ); table.update(MIN if minor else {})
            if scheme == 'astrolog': table = dict(ASTROLOG)
            if scheme == 'kery': table = dict(KERY)
            for a, orb in table.items():
                major = a in MAJ
                if scheme == 'site':
                    if major and (A['lum'] or B['lum']): orb += 2
                    if A['small'] or B['small']: orb = min(orb, 5 if major else 1.5)
                elif scheme == 'astrolog':
                    orb += (1 if A['id'] in ('Sun', 'Moon') else 0) + (1 if B['id'] in ('Sun', 'Moon') else 0) * 0
                    orb = orb + (1 if (A['id'] in ('Sun', 'Moon') or B['id'] in ('Sun', 'Moon')) else 0) - (1 if A['id'] in ('Sun', 'Moon') else 0)
                elif scheme == 'kery':
                    if A['lum'] or B['lum']: orb += 1.5
                d = abs(sep - a)
                if d <= orb and (best is None or d < best[1]): best = (a, d)
            if best: out.append((A['id'], B['id'], best[0], round(best[1], 9)))
    return sorted(out)
res = {}
bad = []; n = 0; school = {'astrolog_differs': 0, 'kerykeion_differs': 0, 'aspects_site': 0}
app_bad = []; app_n = 0
for ch in N['charts']:
    pts = [p for p in ch['points'] if p['id'] not in ('SNode', 'Fortune')] + ch['angles']
    m = mine(pts, True)
    s = sorted((a['A'], a['B'], a['asp'], round(a['orb'], 9)) for a in ch['aspects'])
    n += len(s)
    if m != s: bad.append((ch['id'], [x for x in s if x not in m][:3], [x for x in m if x not in s][:3]))
    mj = mine(pts, False)
    sm = sorted((a['A'], a['B'], a['asp'], round(a['orb'], 9)) for a in ch['aspectsMajor'])
    if mj != sm: bad.append((ch['id'], 'major', len(mj), len(sm)))
    school['aspects_site'] += len(mj)
    ma = set((x[0], x[1], x[2]) for x in mine([p for p in pts if p['planet'] or p['angle']], False, 'astrolog'))
    mk = set((x[0], x[1], x[2]) for x in mine([p for p in pts if p['planet'] or p['angle']], False, 'kery'))
    ms_ = set((x[0], x[1], x[2]) for x in mine([p for p in pts if p['planet'] or p['angle']], False))
    school['astrolog_differs'] += len(ma ^ ms_); school['kerykeion_differs'] += len(mk ^ ms_)
    # applying: does the separation move toward the exact angle? (SE speeds)
    byid = {p['id']: p for p in pts}
    for a in ch['aspects']:
        if a['applying'] is None: continue
        A, B = byid[a['A']], byid[a['B']]
        if A['id'] not in R.SWE_ID or B['id'] not in R.SWE_ID or A['id'] == 'Node' or B['id'] == 'Node': continue
        la, va = R.swe_lonspeed(A['id'], ch['utc']); lb, vb = R.swe_lonspeed(B['id'], ch['utc'])
        sep = abs(n180(lb - la)); sep2 = abs(n180((lb + vb * 0.01) - (la + va * 0.01)))
        app = abs(sep2 - a['asp']) < abs(sep - a['asp'])
        app_n += 1
        if app != a['applying'] and a['orb'] > 0.05: app_bad.append((ch['id'], a['A'], a['B'], a['asp'], round(a['orb'], 3), a['applying'], app))
res['natal'] = {'n_aspects': n, 'mismatch': bad, 'school': school, 'applying_n': app_n, 'applying_mismatch': app_bad}

# ---------------------------------------------------------------- synastry
SYN = {0: 7, 180: 7, 120: 6, 90: 6, 60: 4}
sb = []; sn = 0
for x in S:
    out = []
    for A in x['ptsA']:
        for B in x['ptsB']:
            sep = abs(n180(B['lon'] - A['lon'])); best = None
            for a, orb in SYN.items():
                if A['lum'] or B['lum']: orb += 1
                if A['small'] or B['small'] or A['angle'] or B['angle']: orb = min(orb, 4)
                d = abs(sep - a)
                if d <= orb and (best is None or d < best[1]): best = (a, d)
            if best: out.append((A['id'], B['id'], best[0], round(best[1], 9)))
    s = sorted((c['A'], c['B'], c['asp'], round(c['orb'], 9)) for c in x['cross'])
    sn += len(s)
    if sorted(out) != s: sb.append((x['a'], x['b'], len(out), len(s)))
res['synastry'] = {'n_pairs': len(S), 'n_aspects': sn, 'mismatch': sb}

# ---------------------------------------------------------------- composite: midpoints, MC, ASC from the composite RAMC
cb = []; cdev = 0.0; casc = 0.0; ccusp = 0.0; cn = 0; asp_bad = []
import math
for x in S:
    A = {p['id']: p['lon'] for p in x['ptsA']}; B = {p['id']: p['lon'] for p in x['ptsB']}
    for p in x['comp']['points']:
        if p['id'] in ('SNode',): continue
        if p['id'] not in A or p['id'] not in B: continue
        mid = (A[p['id']] + n180(B[p['id']] - A[p['id']]) / 2) % 360
        cdev = max(cdev, abs(n180(p['lon'] - mid))); cn += 1
    mc = (x['mcA'] + n180(x['mcB'] - x['mcA']) / 2) % 360
    eps = (x['epsA'] + x['epsB']) / 2; lat = (x['latA'] + x['latB']) / 2
    ramc = math.degrees(math.atan2(math.sin(math.radians(mc)) * math.cos(math.radians(eps)), math.cos(math.radians(mc)))) % 360
    try:
        cusps, ascmc = swe.houses_armc(ramc, lat, eps, b'P')
        casc = max(casc, abs(n180(x['comp']['asc'] - ascmc[0])))
        ccusp = max(ccusp, max(abs(n180(x['comp']['cusps'][h] - cusps[h - 1])) for h in range(1, 13)))
    except Exception as e:
        cb.append((x['a'], x['b'], 'swe houses_armc', str(e)))
    # aspects inside the composite with the natal rules
    pts = [dict(p) for p in x['comp']['points'] if p['id'] not in ('SNode', 'Fortune')] + [{'id': 'ASC', 'lon': x['comp']['asc'], 'lum': False, 'small': False, 'angle': True, 'planet': False}, {'id': 'MC', 'lon': x['comp']['mc'], 'lum': False, 'small': False, 'angle': True, 'planet': False}]
    m = mine(pts, False)
    s = sorted((a['A'], a['B'], a['asp'], round(a['orb'], 9)) for a in x['comp']['aspects'])
    if m != s: asp_bad.append((x['a'], x['b'], len(m), len(s)))
    # midpoint-of-ascendants composite ASC (the other school) for information
res['composite'] = {'n_points': cn, 'max_midpoint_dev_deg': cdev, 'asc_vs_swe_houses_armc_deg': casc, 'cusps_vs_swe_deg': ccusp, 'errors': cb, 'aspect_mismatch': asp_bad}
json.dump(res, open(os.path.join(TMP, 'res_aspects.json'), 'w'), indent=1, default=str)
print(json.dumps(res, indent=1, default=str)[:4000])
