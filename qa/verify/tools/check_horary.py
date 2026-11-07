"""Horary: perfection of every pair of the seven planets before either changes sign, the Moon's next and last aspects in her sign
(void of course), sign exits and stations, found again with Swiss Ephemeris; the site's perfection moments refined with
Skyfield, PyEphem and Astropy. Also counts how the verdict treats prohibition."""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
TMP = os.environ.get('TOOLS_TMP')
D = json.load(open(os.path.join(TMP, 'site_horary.json')))
SEVEN = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
TG = [0, 60, 90, 120, 180, 240, 270, 300]
asp_of = lambda T: T if T <= 180 else 360 - T
SF_OK = lambda ms: -2208988800000 < ms < 2643000000000

def bisect(f, a, b, it=45):
    fa = f(a)
    for _ in range(it):
        m = (a + b) / 2; fm = f(m)
        if (fa < 0) == (fm < 0): a, fa = m, fm
        else: b = m
    return (a + b) / 2
def exit_time(pid, t0, maxd=400):
    s0 = int(R.swe_lon(pid, t0) // 30)
    step = (1 / 24 if pid == 'Moon' else 0.25) * R.DAY
    t = t0
    while t - t0 < maxd * R.DAY:
        t2 = t + step
        if int(R.swe_lon(pid, t2) // 30) != s0:
            return bisect(lambda x: -1 if int(R.swe_lon(pid, x) // 30) == s0 else 1, t, t2)
        t = t2
    return float('inf')
def first_aspect(a, b, t0, t1, dirn=1):
    fast = 'Moon' in (a, b)
    step = (0.02 if fast else 0.25) * R.DAY * dirn
    t = t0; d = R.n360(R.swe_lon(b, t) - R.swe_lon(a, t))
    while (t < t1) if dirn > 0 else (t > t1):
        t2 = t + step
        if (dirn > 0 and t2 > t1) or (dirn < 0 and t2 < t1): t2 = t1
        d2 = R.n360(R.swe_lon(b, t2) - R.swe_lon(a, t2))
        for T in TG:
            e1, e2 = R.n180(d - T), R.n180(d2 - T)
            if abs(e1) < 30 and abs(e2) < 30 and (e1 < 0) != (e2 < 0):
                return bisect(lambda x: R.n180(R.n360(R.swe_lon(b, x) - R.swe_lon(a, x)) - T), t, t2), asp_of(T)
        if t2 == t1: break
        t, d = t2, d2
    return None, None

res = {'n_charts': len(D)}
pres = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}
pd = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}; pc = {'swe': 0, 'sf': 0, 'ep': 0, 'ap': 0}
pbad = []; vbad = []; ex_dev = 0.0; mn_bad = []; mp_bad = []
yes_with_prohibit = 0; yes_total = 0
for c in D:
    t0 = c['t']
    ex = {pid: exit_time(pid, t0) for pid in SEVEN}
    for pid in SEVEN:
        se = c['exit'][pid]
        if se is None or se == float('inf') or ex[pid] == float('inf'):
            continue
        ex_dev = max(ex_dev, abs(se - ex[pid]) / 1000.0)
    for e in c['ev']:
        a, b = e['a'], e['b']
        end = min(ex[a], ex[b], t0 + 400 * R.DAY)
        t, asp = first_aspect(a, b, t0, end)
        if (t is None) != (e['t'] is None) or (t is not None and asp != e['asp']):
            # near the end of the sign a one-minute difference in the sign exit can flip it
            margin = abs(t - end) / 60000.0 if t else (abs(e['t'] - end) / 60000.0 if e['t'] else None)
            pbad.append((t0, a, b, e['t'], e['asp'], t, asp, None if margin is None else round(margin, 1)))
            continue
        if t is not None:
            pd['swe'] = max(pd['swe'], abs(t - e['t']) / 1000.0); pc['swe'] += 1
            T0 = min(TG, key=lambda T: abs(R.n180(R.n360(R.swe_lon(b, e['t']) - R.swe_lon(a, e['t'])) - T)))
            pres['swe'] = max(pres['swe'], abs(R.n180(R.n360(R.swe_lon(b, e['t']) - R.swe_lon(a, e['t'])) - T0)) * 3600)
            for k in ('sf', 'ep', 'ap'):
                if k == 'sf' and not SF_OK(t): continue
                L = R.LON[k]
                d0 = R.n360(L(b, e['t']) - L(a, e['t']))
                T = min(TG, key=lambda T: abs(R.n180(d0 - T)))
                tr = R.refine(lambda x: R.n180(R.n360(L(b, x) - L(a, x)) - T), e['t'], step_ms=600000.0)
                pd[k] = max(pd[k], abs(tr - e['t']) / 1000.0); pc[k] += 1
                pres[k] = max(pres[k], abs(R.n180(d0 - T)) * 3600)
    # the Moon: next aspects until she leaves her sign, last one since she entered
    nxt = []
    for pid in SEVEN:
        if pid == 'Moon': continue
        t, asp = first_aspect('Moon', pid, t0, ex['Moon'])
        if t: nxt.append((t, pid, asp))
    nxt.sort()
    voc = not nxt
    if voc != c['voc']: vbad.append((t0, c['voc'], voc, nxt[:1]))
    sn = [(m['t'], m['id'], m['asp']) for m in c['moonNext']]
    if [x[1:] for x in sn] != [x[1:] for x in nxt]: mn_bad.append((t0, sn, nxt))
    for pr in c['pairs']:
        if pr.get('same'): continue
        if pr['perfects']:
            yes_total += 1
            if pr['prohibit']: yes_with_prohibit += 1
verd = {}
for c in D: verd[c['verdict']] = verd.get(c['verdict'], 0) + 1
yes_charts = sum(1 for c in D if c['verdict'] == 'yes')
yes_prohib = sum(1 for c in D if c['verdict'] == 'yes' and any(p.get('perfects') and p.get('prohibit') for p in c['pairs'] if not p.get('same')))
res.update({'perfection_residual_arcsec': {k: round(v, 2) for k, v in pres.items()}, 'perfection_count': pc, 'perfection_max_dev_s': {k: round(v, 1) for k, v in pd.items()}, 'perfection_mismatch': pbad[:15], 'n_perfection_mismatch': len(pbad),
            'sign_exit_max_dev_s': round(ex_dev, 1), 'voc_mismatch': vbad, 'moon_next_mismatch': mn_bad[:5], 'n_moon_next_mismatch': len(mn_bad),
            'verdicts': verd, 'yes_charts': yes_charts, 'yes_charts_with_prohibition_listed': yes_prohib, 'perfecting_pairs': yes_total, 'perfecting_pairs_with_prohibition': yes_with_prohibit})
json.dump(res, open(os.path.join(TMP, 'res_horary.json'), 'w'), indent=1, default=str)
print(json.dumps(res, indent=1, default=str)[:5000])
