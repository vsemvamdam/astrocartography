"""Best cities and the solar-return place score, recomputed from the README formulas with an independent geometry:
planet RA/Dec and sidereal time from Swiss Ephemeris; MC/IC meridians and the ASC/DSC curves (cos H = −tg φ·tg δ) sampled finely;
distance — the shortest great-circle distance to the line (numerically, 0.01° steps along the curve); score — Σ w·(1 − d/600)^1.5
over d < 600 km. Solar return: houses (Placidus) and planets from Swiss Ephemeris at the site's return moment."""
import json, os, sys, math
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
import swisseph as swe
TMP = os.environ.get('TOOLS_TMP')
C = json.load(open(os.path.join(TMP, 'site_cities.json')))
S = json.load(open(os.path.join(TMP, 'site_solar.json')))
EARTH = 6371.0
D2R = math.pi / 180
def hav(la1, lo1, la2, lo2):
    a = np.sin((la2 - la1) * D2R / 2) ** 2 + np.cos(la1 * D2R) * np.cos(la2 * D2R) * np.sin((lo2 - lo1) * D2R / 2) ** 2
    return 2 * np.arcsin(np.minimum(1, np.sqrt(a))) * EARTH
CASES = {c['id']: c for c in json.load(open(os.path.join(os.path.dirname(__file__), '..', 'cases.json')))['charts']}
GOALS = {g['id']: g['w'] for g in C['goals']}
res = {'cities': [], 'solar': []}
lines_cache = {}
def lines(case_id):
    if case_id in lines_cache: return lines_cache[case_id]
    t = R.jd_of(__import__('datetime').datetime.strptime(CASES[case_id]['utc'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=__import__('datetime').timezone.utc).timestamp() * 1000)
    gast = swe.sidtime(t) * 15
    out = {}
    for b in ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']:
        r, _ = swe.calc_ut(t, R.SWE_ID[b], swe.FLG_SWIEPH | swe.FLG_EQUATORIAL)
        ra, dec = r[0], r[1]
        mc = ((ra - gast + 180) % 360) - 180
        lat = np.arange(-89.99, 89.99, 0.01)
        c = -np.tan(lat * D2R) * math.tan(dec * D2R)
        ok = np.abs(c) <= 1
        H = np.degrees(np.arccos(c[ok]))
        # the same curve parametrised by the hour angle, so that its nearly horizontal parts near the polar turn are dense too
        h = np.arange(0, 180.0001, 0.01)
        ph = np.degrees(np.arctan(-np.cos(h * D2R) / math.tan(dec * D2R)))
        la_all = np.concatenate([lat[ok], ph]); H_all = np.concatenate([H, h])
        out[b] = {'mc': mc, 'ic': mc + 180, 'asc': (la_all, mc - H_all), 'dsc': (la_all, mc + H_all)}
    lines_cache[case_id] = out
    return out
def dist(L, ang, la, lo):
    if ang in ('MC', 'IC'):
        lat = np.arange(-90, 90.001, 0.01); return float(np.min(hav(la, lo, lat, np.full_like(lat, L[ang.lower()]))))
    lat, lon = L[ang.lower()]
    return float(np.min(hav(la, lo, lat, lon)))
sc_dev = 0.0; km_dev = 0.0; order_bad = []; n = 0
for x in C['out']:
    L = lines(x['id']); w = GOALS[x['goal']]
    for c in x['top']:
        s = 0.0
        for b, wb in w.items():
            if b not in L: continue
            for ang, wt in wb.items():
                d = dist(L[b], ang, c['lat'], c['lon'])
                if d < 600: s += wt * (1 - d / 600) ** 1.5
                pp = [p for p in c['parts'] if p['body'] == b and p['angle'] == ang]
                if pp: km_dev = max(km_dev, abs(pp[0]['km'] - d))
        sc_dev = max(sc_dev, abs(s - c['score'])); n += 1
        c['ref'] = s
    # is the site's top-15 in the order the reference gives?
    refs = [c['ref'] for c in x['top']]
    if any(refs[i] + 0.05 < refs[i + 1] for i in range(len(refs) - 1)): order_bad.append((x['id'], x['goal'], [round(v, 2) for v in refs]))
res['cities'] = {'n_city_scores': n, 'max_score_dev': round(sc_dev, 3), 'max_line_distance_dev_km': round(km_dev, 2), 'order_inversions_gt_0.05': order_bad}

SOLAR_HOUSE_W = {
    'Sun': {10: 5, 11: 4, 1: 3.5, 5: 3, 9: 3, 7: 2, 2: 2, 4: 1, 3: 1, 6: -2, 8: -3, 12: -4},
    'Jupiter': {1: 4, 10: 4, 7: 2.5, 5: 2.5, 9: 2, 11: 2, 2: 2, 4: 2, 3: 1, 8: -0.5, 12: -0.5},
    'Venus': {1: 2, 5: 2, 7: 2, 10: 2, 2: 1.5, 11: 1.5, 4: 1, 9: 1, 3: 0.5, 8: -0.5, 12: -0.5},
    'Moon': {1: 1, 4: 1, 5: 1, 10: 1, 11: 1, 2: 0.5, 7: 0.5, 9: 0.5, 6: -0.5, 8: -1, 12: -1},
    'Saturn': {1: -3, 7: -2, 4: -1.5, 10: -1.5, 5: -1, 8: -1, 12: -1, 2: -0.5, 6: -0.5},
    'Mars': {1: -2, 7: -2, 8: -1.5, 12: -1.5, 4: -1, 6: -0.5, 10: 0.5},
    'Uranus': {1: -1.5, 4: -1, 7: -1, 11: 0.5}, 'Neptune': {1: -2, 7: -1, 10: -1}, 'Pluto': {1: -2, 7: -1.5, 4: -1, 8: -1, 10: -0.5}}
SOLAR_ANGLE_W = {'Jupiter': 2, 'Venus': 1.5, 'Sun': 1, 'Saturn': -2, 'Mars': -1.5, 'Pluto': -1.5, 'Neptune': -1, 'Uranus': -1}
def house_of(lon, cusps):
    for h in range(12):
        a, b = cusps[h], cusps[(h + 1) % 12]
        if (lon - a) % 360 < (b - a) % 360: return h + 1
    return 1
sdev = 0.0; sn = 0; srank = []; house_flip = 0
for x in S:
    jd = R.jd_of(x['t'])
    pl = {b: R.swe_lon(b, x['t']) for b in SOLAR_HOUSE_W}
    scores = []
    for c in x['rank']:
        try:
            cusps, ascmc = swe.houses(jd, c['lat'], c['lon'], b'P')
        except Exception:
            cusps, ascmc = swe.houses(jd, c['lat'], c['lon'], b'O')
        s = 0.0
        for b, hw in SOLAR_HOUSE_W.items():
            h = house_of(pl[b], list(cusps))
            s += hw.get(h, 0)
            sp = [p for p in c['parts'] if p['body'] == b and p.get('house')]
            if sp and sp[0]['house'] != h: house_flip += 1
            aw = SOLAR_ANGLE_W.get(b)
            if aw:
                for a in (ascmc[0], ascmc[1]):
                    if abs(R.n180(pl[b] - a)) <= 6: s += aw
        sdev = max(sdev, abs(s - c['score'])); sn += 1
        scores.append((s, c['city']))
    top_site = [c['city'] for c in x['rank'][:10]]
    top_ref = [nm for _, nm in sorted(scores, key=lambda z: -z[0])[:10]]
    srank.append((x['id'], len(set(top_site) & set(top_ref))))
res['solar'] = {'n_city_scores': sn, 'max_score_dev': sdev, 'planet_house_differs': house_flip, 'top10_overlap': srank}
json.dump(res, open(os.path.join(TMP, 'res_cities.json'), 'w'), indent=1)
print(json.dumps(res, indent=1))
