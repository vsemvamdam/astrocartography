"""Item 3–4: ASC, MC, house cusps in all systems; Part of Fortune (day/night); relocation.
python3 -W ignore compare_houses.py <site_dump.json> <out.json>"""
import json, sys, math, statistics as st
import swisseph as swe
import sources as S
import astro_formulas as F

d = json.load(open(sys.argv[1]))
SYS = ['P', 'K', 'R', 'C', 'O', 'E', 'W']
SW, SK, PE, AP = S.SOURCES['swe'], S.SOURCES['sky'], S.SOURCES['pe'], S.SOURCES['apy']


def swe_armc(sys_, ramc, lat, eps):
    try:
        c, am = swe.houses_armc(ramc, lat, eps, sys_.encode())
        return list(c), am, sys_
    except Exception:
        c, am = swe.houses_armc(ramc, lat, eps, b'O')     # what Swiss Ephemeris itself falls back to
        return list(c), am, 'O'


def swe_jd(sys_, jd_ut, lat, lon):
    try:
        c, am = swe.houses_ex(jd_ut, lat, lon, sys_.encode())
        return list(c), am, sys_
    except Exception:
        c, am = swe.houses_ex(jd_ut, lat, lon, b'O')
        return list(c), am, 'O'


def maxdiff(a, b):
    return max(abs(F.n180(x - y)) for x, y in zip(a, b))


res = {'grid': {}, 'charts': [], 'random': {}, 'fortune': [], 'reloc': {}, 'polar_examples': []}

# ---------------------------------------------------------------- 1. pure geometry grid
grid = {}
for row in d['houseGrid']:
    lat, ramc, eps = row['lat'], row['ramc'], row['eps']
    polar = abs(lat) >= 90 - eps
    for s in SYS:
        site = row['s'][s]
        c, am, used = swe_armc(s, ramc, lat, eps)
        mine = F.houses(s, ramc, lat, eps)
        g = grid.setdefault((s, 'polar' if polar else 'normal'), {'n': 0, 'swe': [], 'mine': [], 'used_mismatch': 0, 'mine_undef': 0, 'ex': []})
        g['n'] += 1
        g['used_mismatch'] += (site['used'] != used)
        dv = maxdiff(site['c'], c)
        g['swe'].append(dv)
        if dv > 1e-6 and len(g['ex']) < 6:
            g['ex'].append({'lat': lat, 'ramc': ramc, 'eps': eps, 'site': site['c'], 'swe': c, 'site_used': site['used'], 'swe_used': used})
        if mine is None: g['mine_undef'] += 1
        else: g['mine'].append(maxdiff(site['c'], mine))
for (s, zone), g in grid.items():
    res['grid'][s + '_' + zone] = {'n': g['n'], 'swe_max_deg': max(g['swe']), 'swe_n_over_1arcsec': sum(1 for x in g['swe'] if x > 1 / 3600),
                                   'mine_max_deg': max(g['mine']) if g['mine'] else None, 'mine_n_over_1arcsec': sum(1 for x in g['mine'] if x > 1 / 3600),
                                   'mine_undef': g['mine_undef'], 'used_mismatch': g['used_mismatch'], 'examples': g['ex']}

# ---------------------------------------------------------------- 2. charts and random moments (time -> houses)
def per_instant(c, lat, lon, natal, tag):
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    out = {'tag': tag, 'lat': lat, 'lon': lon}
    polar = abs(lat) >= 90 - c['eps']
    for s in SYS:
        site = natal[s]
        sc = site['cusps']
        cs, am, used = swe_jd(s, jd_ut, lat, lon)
        o = {'swe': maxdiff(sc, cs), 'swe_used': used, 'site_used': site['used'], 'asc_swe': F.n180(site['asc'] - am[0]), 'mc_swe': F.n180(site['mc'] - am[1])}
        for k in ('sky', 'pe', 'apy'):
            src = S.SOURCES[k]
            theta = F.n360(src.gast(jd_ut, jd_tt) + lon)
            eps = src.eps(jd_tt)
            mine = F.houses(s if not (polar and s in 'PK') else 'O', theta, lat, eps)
            o[k] = maxdiff(sc, mine) if mine else None
            o['asc_' + k] = F.n180(site['asc'] - F.asc(theta, lat, eps))
            o['mc_' + k] = F.n180(site['mc'] - F.mc(theta, eps))
        out[s] = o
    return out

for c in d['charts']:
    r = per_instant(c, c['lat'], c['lon'], c['natal'], c['id'])
    r['note'] = c['natal']['P']['note']
    res['charts'].append(r)
    for rl in c['reloc']:
        rr = per_instant(c, rl['lat'], rl['lon'], rl['natal'], c['id'] + '@' + rl['name'])
        res['reloc'].setdefault('rows', []).append(rr)
rand_rows = [per_instant(c, c['lat'], c['lon'], c['natal'], str(c['i'])) for c in d['random']]


def agg(rows):
    out = {}
    for s in SYS:
        for k in ('swe', 'sky', 'pe', 'apy'):
            v = [abs(r[s][k]) for r in rows if r[s][k] is not None]
            out[s + '_' + k] = {'n': len(v), 'max_arcsec': max(v) * 3600, 'median_arcsec': st.median(v) * 3600}
        out[s + '_used_mismatch'] = sum(1 for r in rows if r[s]['swe_used'] != r[s]['site_used'])
    for k in ('swe', 'sky', 'pe', 'apy'):
        for a in ('asc', 'mc'):
            v = [abs(r['P'][a + '_' + k]) for r in rows]
            out[a + '_' + k] = {'n': len(v), 'max_arcsec': max(v) * 3600, 'median_arcsec': st.median(v) * 3600}
    return out

res['charts_agg'] = agg(res['charts'])
res['random_agg'] = agg(rand_rows)
res['reloc_agg'] = agg(res['reloc']['rows'])
res['random_rows_over'] = [r for r in rand_rows if any(r[s]['swe'] > 1 / 60 for s in SYS)][:20]

# ---------------------------------------------------------------- 3. Part of Fortune and day/night
def fortune_rows(c, lat, lon, natal, tag):
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    rows = []
    for k in ('swe', 'sky', 'pe', 'apy'):
        src = S.SOURCES[k]
        if k == 'sky' and not src.ok(jd_tt): continue
        sun, moon = src.pos('Sun', jd_ut, jd_tt) if k == 'swe' else src.pos('Sun', jd_ut, jd_tt, speed=False), \
                    src.pos('Moon', jd_ut, jd_tt) if k == 'swe' else src.pos('Moon', jd_ut, jd_tt, speed=False)
        lst = F.n360(src.gast(jd_ut, jd_tt) + lon)
        eps = src.eps(jd_tt)
        a = F.asc(lst, lat, eps)
        alt, _ = F.altaz(sun['ra'], sun['dec'], lst, lat)
        day_alt = alt > 0                                  # Sun above the geometric horizon
        day_house = F.n360(sun['lon'] - a) > 180           # Sun in houses 7-12 (ecliptic rule)
        fort_alt = F.n360(a + moon['lon'] - sun['lon']) if day_alt else F.n360(a + sun['lon'] - moon['lon'])
        fort_house = F.n360(a + moon['lon'] - sun['lon']) if day_house else F.n360(a + sun['lon'] - moon['lon'])
        rows.append({'tag': tag, 'src': k, 'lat': lat, 'sun_alt': alt, 'site_day': natal['P']['isDay'], 'day_alt': day_alt, 'day_house': day_house,
                     'd_fort_house': F.n180(natal['P']['fortune'] - fort_house) * 3600, 'd_fort_alt': F.n180(natal['P']['fortune'] - fort_alt) * 3600})
    return rows

for c in d['charts']:
    res['fortune'] += fortune_rows(c, c['lat'], c['lon'], c['natal'], c['id'])
    for rl in c['reloc']:
        res['fortune'] += fortune_rows(c, rl['lat'], rl['lon'], rl['natal'], c['id'] + '@' + rl['name'])
for c in d['random']:
    res['fortune'] += fortune_rows(c, c['lat'], c['lon'], c['natal'], str(c['i']))
F_ = res['fortune']
res['fortune_agg'] = {
    k: {'n': sum(1 for r in F_ if r['src'] == k),
        'fortune_max_arcsec_same_rule': max(abs(r['d_fort_house']) for r in F_ if r['src'] == k),
        'day_rule_vs_house_mismatch': sum(1 for r in F_ if r['src'] == k and r['site_day'] != r['day_house']),
        'day_rule_vs_altitude_mismatch': sum(1 for r in F_ if r['src'] == k and r['site_day'] != r['day_alt']),
        'mismatch_examples': [(r['tag'], round(r['lat'], 2), round(r['sun_alt'], 3), r['site_day'], r['day_alt']) for r in F_ if r['src'] == k and r['site_day'] != r['day_alt']][:12]}
    for k in ('swe', 'sky', 'pe', 'apy')}

json.dump(res, open(sys.argv[2], 'w'), default=float)
print(json.dumps({k: v for k, v in res['grid'].items()}, indent=0, default=float)[:6000])
for name in ('charts_agg', 'random_agg', 'reloc_agg'):
    print(name)
    for k, v in res[name].items(): print('  ', k, v)
print(json.dumps(res['fortune_agg'], indent=0, default=float))
for r in res['charts']:
    print(r['tag'], r['lat'], {s: (round(r[s]['swe'] * 3600, 2), r[s]['site_used'], r[s]['swe_used']) for s in SYS}, r['note'])
