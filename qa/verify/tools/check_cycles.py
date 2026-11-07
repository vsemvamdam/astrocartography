"""Profections, the transit calendar and life cycles.
Profections: the rule (one whole sign a year from the Ascendant, from the birthday; one sign a month) written again here.
Transits and life cycles: every exact hit found again by Swiss Ephemeris (dense sampling and bisection), passes grouped by the
planet's change of direction; the site's moments refined with Skyfield, PyEphem and Astropy."""
import json, sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
TMP = os.environ.get('TOOLS_TMP')
D = json.load(open(os.path.join(TMP, 'site_cycles.json')))
DOM = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter']
SF_OK = lambda ms: -2208988800000 < ms < 2643000000000
res = {}

def bisect(f, a, b, it=45):
    fa = f(a)
    for _ in range(it):
        m = (a + b) / 2; fm = f(m)
        if (fa < 0) == (fm < 0): a, fa = m, fm
        else: b = m
    return (a + b) / 2

# ------------------------------------------------------------------ profections
pbad = []; pn = 0; perr = []
for c in D:
    b = datetime.datetime.utcfromtimestamp(c['birth'] / 1000)
    for p in c['prof']:
        if 'error' in p: perr.append((c['id'], datetime.datetime.utcfromtimestamp(p['now'] / 1000).year - b.year, p['error'])); continue
        pn += 1
        now = datetime.datetime.utcfromtimestamp(p['now'] / 1000)
        def bday(age):
            y = b.year + age
            try: return datetime.datetime(y, b.month, b.day, b.hour, b.minute)
            except ValueError: return datetime.datetime(y, 3, 1, b.hour, b.minute)   # 29 Feb → 1 Mar, as Date.UTC rolls over
        age = 0
        while bday(age + 1) <= now: age += 1
        sign = (c['ascSign'] + age) % 12
        cur = p['cur']
        if (p['age'], cur['sign'], cur['lord'], cur['house']) != (age, sign, DOM[sign], age % 12 + 1): pbad.append((c['id'], p['age'], age, cur['sign'], sign))
        for k, m in enumerate(p['months']):
            if m['sign'] != (sign + k) % 12 or m['lord'] != DOM[(sign + k) % 12]: pbad.append((c['id'], 'month', k))
res['profections'] = {'n': pn, 'mismatch': pbad, 'crash_cases': perr}

# ------------------------------------------------------------------ transit calendar
ASP = [0, 60, 90, 120, 180]
def swe_hits(tr, nlon, frm, to, step_days):
    margin = (1300 if tr in ('Neptune', 'Pluto') else 400) * R.DAY   # five passes of Neptune or Pluto span up to ~3 years
    t0, t1 = frm - margin, to + margin
    n = int((t1 - t0) / (step_days * R.DAY)) + 1
    ts = [t0 + k * step_days * R.DAY for k in range(n)]
    ls = [R.swe_lon(tr, t) for t in ts]
    out = []
    for a in ASP:
        for sg in ([1] if a in (0, 180) else [1, -1]):
            tg = (nlon + sg * a) % 360
            hits = []
            for i in range(1, n):
                f1, f2 = R.n180(ls[i - 1] - tg), R.n180(ls[i] - tg)
                if abs(f1) < 20 and abs(f2) < 20 and (f1 < 0) != (f2 < 0):
                    hits.append(bisect(lambda x: R.n180(R.swe_lon(tr, x) - tg), ts[i - 1], ts[i]))
            # passes of one transit: consecutive hits with a change of direction between them
            groups = []
            for h in hits:
                if groups:
                    prev = groups[-1][-1]
                    _, v1 = R.swe_lonspeed(tr, prev); _, v2 = R.swe_lonspeed(tr, h)
                    if (v1 > 0) != (v2 > 0) and h - prev < 1300 * R.DAY: groups[-1].append(h); continue
                groups.append([h])
            for g in groups:
                # the period within 1°: entry before the first hit, exit after the last (SE, 1-hour resolution)
                def edge(t, d):
                    x = t
                    while abs(R.n180(R.swe_lon(tr, x) - tg)) < 1.0: x += d * 3600000.0 * (6 if tr in ('Uranus', 'Neptune', 'Pluto', 'Saturn', 'Jupiter') else 1)
                    return x
                win = (edge(g[0], -1), edge(g[-1], 1))
                for k, h in enumerate(g):
                    if frm <= h < to: out.append({'asp': a, 'sg': sg, 't': h, 'pass': k + 1, 'passes': len(g), 'win': win})
    return out
tres = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}; tdevm = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}
tdev = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}; tcnt = {'swe': 0, 'sf': 0, 'ep': 0, 'ap': 0}
tmiss = []; textra = []; tpass = []; twin = 0.0; twin_n = 0; twin_bad = []
for c in D:
    for key, trs, step in (('tr', ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], 0.5), ('trFast', ['Sun', 'Mercury', 'Venus'], 0.25)):
        site = c[key]
        for tr in trs:
            for np_ in c['natPts']:
                ref = swe_hits(tr, np_['lon'], c['from'], c['to'], step)
                ss = [h for h in site if h['tr'] == tr and h['natal'] == np_['id']]
                for h in ss:
                    m = [r for r in ref if r['asp'] == h['asp'] and abs(r['t'] - h['t']) < 2 * R.DAY]
                    if not m: textra.append((c['id'], tr, np_['id'], h['asp'], h['t'])); continue
                    r = m[0]; tcnt['swe'] += 1
                    tdev['swe'] = max(tdev['swe'], abs(r['t'] - h['t']) / 1000.0)
                    tgx = (np_['lon'] + r['sg'] * r['asp']) % 360
                    tres['swe'] = max(tres['swe'], abs(R.n180(R.swe_lon(tr, h['t']) - tgx)) * 3600)
                    if abs(R.swe_lonspeed(tr, h['t'])[1]) > {'Sun': 0.9, 'Mercury': 0.3, 'Venus': 0.3, 'Mars': 0.15, 'Jupiter': 0.03, 'Saturn': 0.015, 'Uranus': 0.005, 'Neptune': 0.003, 'Pluto': 0.002}[tr]: tdevm['swe'] = max(tdevm['swe'], abs(r['t'] - h['t']) / 1000.0)
                    if (r['pass'], r['passes']) != (h['pass'], h['passes']): tpass.append((c['id'], key, tr, np_['id'], h['asp'], datetime.datetime.utcfromtimestamp(h['t'] / 1000).strftime('%Y-%m-%d'), (h['pass'], h['passes']), (r['pass'], r['passes'])))
                    if tr not in ('Sun', 'Mercury', 'Venus', 'Mars'):
                        d = max(abs(h['win'][0] - r['win'][0]), abs(h['win'][1] - r['win'][1])) / R.DAY
                        twin = max(twin, d); twin_n += 1
                        if d > 3: twin_bad.append((c['id'], tr, np_['id'], h['asp'], round(d, 1)))
                for r in ref:
                    if not any(h['asp'] == r['asp'] and abs(r['t'] - h['t']) < 2 * R.DAY for h in ss): tmiss.append((c['id'], tr, np_['id'], r['asp'], r['t']))
    # other sources on a subset of hits (slow planets)
    for h in c['tr'][::3]:
        tg = None
        for k in ('sf', 'ep', 'ap'):
            if k == 'sf' and not SF_OK(h['t']): continue
            if k == 'ap' and h['tr'] == 'Pluto': continue      # astropy's built-in ephemeris has no Pluto
            L = R.LON[k]
            l0 = L(h['tr'], h['t']); d = R.n180(l0 - h['nlon'])
            tg = h['nlon'] + (h['asp'] if abs(R.n180(d - h['asp'])) < abs(R.n180(d + h['asp'])) else -h['asp'])
            tt = R.refine(lambda x: R.n180(L(h['tr'], x) - tg), h['t'], step_ms=3600000.0)
            tdev[k] = max(tdev[k], abs(tt - h['t']) / 1000.0); tcnt[k] += 1
            tres[k] = max(tres[k], abs(R.n180(L(h['tr'], h['t']) - tg)) * 3600)
res['transits'] = {'count': tcnt, 'max_dev_s': {k: round(v, 1) for k, v in tdev.items()}, 'max_dev_s_moving(swe)': round(tdevm['swe'], 1), 'max_residual_arcsec': {k: round(v, 2) for k, v in tres.items()}, 'missing_on_site': tmiss[:20], 'n_missing': len(tmiss), 'extra_on_site': textra[:20], 'n_extra': len(textra),
                   'pass_mismatch': tpass, 'n_pass_mismatch': len(tpass), 'window_max_dev_days': round(twin, 2), 'window_n': twin_n, 'window_bad': twin_bad[:10]}
print(json.dumps(res['transits'], indent=1, default=str)[:4000])

# ------------------------------------------------------------------ life cycles
CYC = [('Jupiter', 0), ('Saturn', 90), ('Saturn', 180), ('Saturn', 0), ('Uranus', 90), ('Uranus', 180), ('Neptune', 90), ('Pluto', 90), ('Chiron', 0), ('Node', 0), ('Node', 180)]
STEP = {'Jupiter': 1, 'Saturn': 2, 'Uranus': 3, 'Neptune': 4, 'Pluto': 4, 'Chiron': 2, 'Node': 0.5}
lres = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}
ldev = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}; lcnt = {'swe': 0, 'sf': 0, 'ep': 0, 'ap': 0}
lbad = []; lmiss = []; lpass = []
for c in D:
    birth = c['birth']; end = birth + 90 * 365.25 * R.DAY
    if birth + 100 * R.DAY > 4102444800000: continue      # SE files and Chiron tables: no use past 2100 for the y2099 chart
    for pid, a in CYC:
        p = next((q for q in c['lifePts'] if q['id'] == pid), None)
        if not p: continue
        step = STEP[pid]
        tend = min(end, 4102444800000 if pid == 'Chiron' else end)
        n = int((tend - birth) / (step * R.DAY))
        ts = [birth + k * step * R.DAY for k in range(1, n)]
        ls = [R.swe_lon(pid, t) for t in ts]
        for sg in ([1] if a in (0, 180) else [1, -1]):
            tg = (p['lon'] + sg * a) % 360
            hits = []
            for i in range(1, len(ts)):
                f1, f2 = R.n180(ls[i - 1] - tg), R.n180(ls[i] - tg)
                if abs(f1) < 30 and abs(f2) < 30 and (f1 < 0) != (f2 < 0): hits.append(bisect(lambda x: R.n180(R.swe_lon(pid, x) - tg), ts[i - 1], ts[i]))
            groups = []
            for h in hits:
                if groups and h - groups[-1][-1] < 400 * R.DAY: groups[-1].append(h)
                else: groups.append([h])
            # a real return/aspect: the planet must first have gone away (more than 45° from the target) since birth
            far_seen = False; real = []
            gi = 0
            for i in range(len(ts)):
                if abs(R.n180(ls[i] - tg)) > 45: far_seen = True
                while gi < len(groups) and groups[gi][0] <= ts[i]:
                    if far_seen: real.append(groups[gi])
                    gi += 1
            dname = '' if a != 90 else ('up' if sg > 0 else 'down')
            site = [x for x in c['life'] if x['id'] == pid and x['asp'] == a and x['dir'] == dname]
            for g in real:
                m = [x for x in site if abs(x['t'] - g[0]) < 5 * R.DAY]
                if not m: lmiss.append((c['id'], pid, a, dname, datetime.datetime.utcfromtimestamp(g[0] / 1000).strftime('%Y-%m'), round((g[0] - birth) / 365.25 / R.DAY, 1))); continue
                x = m[0]; lcnt['swe'] += 1
                ldev['swe'] = max(ldev['swe'], abs(x['t'] - g[0]) / 1000.0)
                lres['swe'] = max(lres['swe'], abs(R.n180(R.swe_lon(pid, x['t']) - tg)) * 3600)
                if x['passes'] != len(g): lpass.append((c['id'], pid, a, dname, round(x['age'], 1), x['passes'], len(g)))
            for x in site:
                if not any(abs(x['t'] - g[0]) < 5 * R.DAY for g in real): lbad.append((c['id'], pid, a, dname, round(x['age'], 2), x['passes']))
    for x in c['life'][::2]:
        if x['id'] in ('Node', 'Chiron'): continue
        p = next(q for q in c['lifePts'] if q['id'] == x['id'])
        for k in ('sf', 'ep', 'ap'):
            if k == 'sf' and not SF_OK(x['t']): continue
            if k == 'ap' and x['id'] == 'Pluto': continue
            L = R.LON[k]
            d = R.n180(L(x['id'], x['t']) - p['lon'])
            tg = p['lon'] + (x['asp'] if abs(R.n180(d - x['asp'])) < abs(R.n180(d + x['asp'])) else -x['asp'])
            tt = R.refine(lambda y: R.n180(L(x['id'], y) - tg), x['t'], step_ms=3600000.0)
            ldev[k] = max(ldev[k], abs(tt - x['t']) / 1000.0); lcnt[k] += 1
            lres[k] = max(lres[k], abs(R.n180(L(x['id'], x['t']) - tg)) * 3600)
res['life'] = {'count': lcnt, 'max_dev_s': {k: round(v, 1) for k, v in ldev.items()}, 'max_residual_arcsec': {k: round(v, 2) for k, v in lres.items()}, 'missing_on_site': lmiss, 'extra_on_site': lbad, 'pass_mismatch': lpass}
print(json.dumps(res['life'], indent=1, default=str)[:5000])
json.dump(res, open(os.path.join(TMP, 'res_cycles.json'), 'w'), indent=1, default=str)
print(json.dumps(res['profections'], default=str))
