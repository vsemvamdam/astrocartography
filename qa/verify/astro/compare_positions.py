"""Item 1–2: positions of the Sun … Pluto, Chiron and the asteroids, speed/retrograde, RA/Dec, GAST, obliquity, ΔT.
python3 -W ignore compare_positions.py <site_dump.json> <out.json>"""
import json, sys, math, statistics as st
import sources as S

d = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
HZ = S.load_horizons()
SW, SK, PE, AP = S.SOURCES['swe'], S.SOURCES['sky'], S.SOURCES['pe'], S.SOURCES['apy']

inst = [('chart', c['id'], c) for c in d['charts']] + [('random', c['i'], c) for c in d['random']]
rows = []          # one row per (instant, body, source): deltas in arcsec / deg/day
gast_rows, dt_rows = [], []
for kind, key, c in inst:
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    # sidereal time, obliquity, ΔT
    g = {'kind': kind, 'key': key, 'jd_ut': jd_ut, 'year': 2000 + c['ut'] / 365.25}
    for k, src in S.SOURCES.items():
        g['gast_' + k] = S.n180(c['gast'] - src.gast(jd_ut, jd_tt)) * 3600
        g['eps_' + k] = (c['eps'] - src.eps(jd_tt)) * 3600
        dtv = src.deltat(jd_ut)
        if dtv is not None: g['dT_' + k] = c['dT'] - dtv
    g['dT_site'] = c['dT']
    gast_rows.append(g)
    for b in c['bodies']:
        bid = b['id']
        if bid == 'Node':
            continue
        for k, src in S.SOURCES.items():
            if bid not in S.PLANETS and k != 'swe':
                continue
            if bid in S.MINOR:
                continue
            if k == 'apy' and bid == 'Pluto':
                continue
            if k == 'sky' and not src.ok(jd_tt):
                continue
            want_speed = (k == 'swe') or kind == 'chart' or (k != 'apy')
            try:
                p = src.pos(bid, jd_ut, jd_tt) if k == 'swe' else src.pos(bid, jd_ut, jd_tt, speed=want_speed)
            except Exception as e:
                print('fail', k, bid, key, e); continue
            r = {'kind': kind, 'key': key, 'body': bid, 'src': k, 'year': g['year'],
                 'lon': S.n180(b['elon'] - p['lon']) * 3600, 'lat': (b['elat'] - p['lat']) * 3600,
                 'ra': S.n180(b['ra'] - p['ra']) * 3600 * math.cos(p['dec'] * S.D2R), 'dec': (b['dec'] - p['dec']) * 3600}
            if 'speed' in p:
                r['speed'] = b['speed'] - p['speed']; r['sp_src'] = p['speed']; r['sp_site'] = b['speed']
                r['retro_mismatch'] = bool(b['retro'] != bool(p['speed'] < 0))
            rows.append(r)
    # Swiss Ephemeris with its own ΔT (what a user of swe/astro.com would see)
    for b in c['bodies']:
        if b['id'] in S.PLANETS:
            p = SW.pos(b['id'], jd_ut, jd_tt, native_ut=True)
            rows.append({'kind': kind, 'key': key, 'body': b['id'], 'src': 'swe_ut', 'year': g['year'],
                         'lon': S.n180(b['elon'] - p['lon']) * 3600, 'lat': (b['elat'] - p['lat']) * 3600,
                         'ra': S.n180(b['ra'] - p['ra']) * 3600 * math.cos(p['dec'] * S.D2R), 'dec': (b['dec'] - p['dec']) * 3600})

# Horizons (DE441): the charts' instants and every 5th random moment, in cases.json order
if HZ:
    cases = json.load(open('/home/claude/astrocartography/qa/verify/cases.json'))
    by_iso = {}
    for x, c in zip(cases['charts'], d['charts']): by_iso[x['utc']] = ('chart', c['id'], c)
    for iso, c in zip(cases['random_utc'], d['random']): by_iso.setdefault(iso, ('random', c['i'], c))
    for iso in HZ['times']:
        k = HZ['row'][iso]
        kind, key, c = by_iso[iso]
        for b in c['bodies']:
            if b['id'] not in HZ['bodies']: continue
            h = HZ['bodies'][b['id']][k]
            rows.append({'kind': kind, 'key': key, 'body': b['id'], 'src': 'hz', 'year': 2000 + c['ut'] / 365.25,
                         'lon': S.n180(b['elon'] - h['lon']) * 3600, 'lat': (b['elat'] - h['lat']) * 3600,
                         'ra': S.n180(b['ra'] - h['ra']) * 3600 * math.cos(h['dec'] * S.D2R), 'dec': (b['dec'] - h['dec']) * 3600})


def summary(sel, field):
    v = [abs(r[field]) for r in sel if field in r]
    if not v: return None
    v.sort()
    return {'n': len(v), 'max': v[-1], 'median': st.median(v), 'p95': v[int(0.95 * (len(v) - 1))]}


stats = {}
for r in rows:
    stats.setdefault((r['body'], r['src']), []).append(r)
res = {'positions': {}, 'worst': {}, 'gast': {}, 'retro': {}}
for (bid, k), sel in stats.items():
    res['positions'].setdefault(bid, {})[k] = {f: summary(sel, f) for f in ('lon', 'lat', 'ra', 'dec', 'speed')}
    w = max(sel, key=lambda r: abs(r['lon']))
    res['worst'].setdefault(bid, {})[k] = {'key': w['key'], 'kind': w['kind'], 'year': round(w['year'], 1), 'lon': w['lon'], 'lat': w['lat']}
    mm = [r for r in sel if r.get('retro_mismatch')]
    if 'speed' in sel[0] or mm:
        res['retro'].setdefault(bid, {})[k] = {'n': sum(1 for r in sel if 'retro_mismatch' in r), 'mismatch': len(mm),
                                              'cases': [(r['key'], r['sp_site'], r['sp_src']) for r in mm][:5]}
for f in ['gast_swe', 'gast_sky', 'gast_pe', 'gast_apy', 'eps_swe', 'eps_sky', 'eps_pe', 'eps_apy', 'dT_swe', 'dT_sky', 'dT_pe']:
    v = sorted(abs(g[f]) for g in gast_rows if f in g)
    res['gast'][f] = {'n': len(v), 'max': v[-1], 'median': st.median(v)}
# ΔT by epoch
res['deltat'] = [{'year': round(g['year'], 1), 'site': g['dT_site'], 'swe': g['dT_site'] - g.get('dT_swe', 0), 'sky': g['dT_site'] - g.get('dT_sky', 0), 'pe': g['dT_site'] - g.get('dT_pe', 0)} for g in gast_rows if g['kind'] == 'random' and g['key'] % 25 == 0]
res['rows'] = rows
json.dump(res, open(OUT, 'w'))

# console table
print('%-10s %-6s %5s %9s %9s %9s %9s %9s %10s' % ('body', 'src', 'n', 'lon max', 'lon med', 'lat max', 'ra max', 'dec max', 'spd max'))
for bid in S.PLANETS + S.SMALL + S.MINOR:
    for k in ['swe', 'swe_ut', 'sky', 'pe', 'apy', 'hz']:
        s = res['positions'].get(bid, {}).get(k)
        if not s: continue
        sp = s['speed']['max'] if s['speed'] else float('nan')
        print('%-10s %-6s %5d %9.2f %9.2f %9.2f %9.2f %9.2f %10.5f' % (bid, k, s['lon']['n'], s['lon']['max'], s['lon']['median'], s['lat']['max'], s['ra']['max'], s['dec']['max'], sp))
print(json.dumps(res['gast'], indent=0))
print(json.dumps(res['retro'], indent=0)[:3000])
