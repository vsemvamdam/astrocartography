"""Lunar days (new moons and moonrises), the Moon's phase and illuminated fraction, and the Moon's sign ingresses
against Swiss Ephemeris, Skyfield (DE421), PyEphem and Astropy."""
import json, sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
import swisseph as swe
TMP = os.environ.get('TOOLS_TMP')
data = json.load(open(os.path.join(TMP, 'site_lunar.json')))
SF_OK = lambda ms: -2208988800000 < ms < 2643000000000   # DE421 file in skyfield-data: 1900–2053

def elong(L, ms): return R.n360(L('Moon', ms) - L('Sun', ms))
dev = {'nm': {}, 'rise': {}, 'ill': {}, 'ing': {}}
cnt = {'nm': {}, 'rise': {}, 'ill': {}, 'ing': {}}
def upd(kind, src, v):
    dev[kind][src] = max(dev[kind].get(src, 0.0), v); cnt[kind][src] = cnt[kind].get(src, 0) + 1
issues = []
daynum_bad = []
for c in data['days']:
    r = c['r']; lat, lon = c['lat'], c['lon']
    # new moons
    for key in ('newMoon', 'nextNewMoon'):
        t = r[key]
        for k in ('swe', 'ep', 'ap', 'sf'):
            if k == 'sf' and not SF_OK(t): continue
            if k == 'sf':
                nm = R.sf_new_moons(t - 2 * R.DAY, t + 2 * R.DAY); tr = min(nm, key=lambda x: abs(x - t)) if nm else None
            elif k == 'ep':
                tr = R.ep_next_new(t - 2 * R.DAY)
            else:
                L = R.LON[k]; tr = R.refine(lambda x: R.n180(elong(L, x)), t)
            if tr is not None: upd('nm', k, abs(tr - t) / 1000.0)
    # the new moon before `at`, found by SE without the site's help
    t = c['at']; t1 = R.refine(lambda x: R.n180(elong(R.swe_lon, x)), t - R.n360(elong(R.swe_lon, t)) / 12.19 * R.DAY)
    if t1 > t: t1 = R.refine(lambda x: R.n180(elong(R.swe_lon, x)), t1 - 29.53 * R.DAY)
    if abs(t1 - r['newMoon']) > 600000: issues.append(('new moon before at differs', c['id'], t, r['newMoon'], t1))
    # moonrises: every start of day 2.. is the first moonrise after the previous start
    days = r['days']
    srises = []
    tt = r['newMoon']
    while True:
        x = R.swe_rise('Moon', tt, lat, lon, True)
        if x is None or x >= r['nextNewMoon']: break
        srises.append(x); tt = x + 0.01 * R.DAY
        if len(srises) > 40: break
    site_r = [d['start'] for d in days[1:]]
    if len(site_r) != len(srises):
        issues.append(('number of lunar days', c['id'], len(days), len(srises) + 1, round(lat, 2)))
    for s, x in zip(site_r, srises):
        if abs(s - x) < 3 * 3600000: upd('rise', 'swe', abs(s - x) / 1000.0)
    sfr = R.sf_rises('Moon', r['newMoon'], r['nextNewMoon'], lat, lon, True) if SF_OK(r['newMoon']) else []
    for s in site_r:
        if sfr:
            m = min(sfr, key=lambda x: abs(x - s))
            if abs(m - s) < 3 * 3600000: upd('rise', 'sf', abs(m - s) / 1000.0)
        e = R.ep_rise('Moon', s - 2 * 3600000, lat, lon, True)
        if e is not None and abs(e - s) < 3 * 3600000: upd('rise', 'ep', abs(e - s) / 1000.0)
    for s in site_r[::4]:
        a = R.ap_rise('Moon', s, lat, lon, True)
        if a is not None: upd('rise', 'ap', abs(a - s) / 1000.0)
    # the lunar day of `at`
    ref_days = [r['newMoon']] + srises
    nref = sum(1 for x in ref_days if x <= c['at'])
    nsite = next((d['n'] for d in days if d['start'] <= c['at'] < d['end']), None)
    if nref != nsite: daynum_bad.append((c['id'], c['at'], nsite, nref))

ph_bad = []
for p in data['phases']:
    t = p['t']; lit = p['phase']['lit'] / 100.0
    attr = swe.pheno_ut(R.jd_of(t), swe.MOON, swe.FLG_SWIEPH)
    upd('ill', 'swe', abs(lit - attr[1]) * 100)
    if SF_OK(t): upd('ill', 'sf', abs(lit - float(R.sf_illum(t))) * 100)
    upd('ill', 'ep', abs(lit - R.ep_illum(t)) * 100)
    el = R.n360(R.LON['ap']('Moon', t) - R.LON['ap']('Sun', t))
    upd('ill', 'ap', abs(lit - (1 - math.cos(math.radians(el))) / 2) * 100)
    # name from the elongation in longitude, as the site does
    elS = R.n360(R.swe_lon('Moon', t) - R.swe_lon('Sun', t))
    if abs(elS - p['phase']['el']) > 0.05: ph_bad.append((t, p['phase']['el'], elS))
    # ingresses
    for key in ('entered', 'leaves'):
        tm = p[key]; b = round(R.swe_lon('Moon', tm) / 30.0) * 30.0
        for k in ('swe', 'ep', 'ap', 'sf'):
            if k == 'sf' and not SF_OK(tm): continue
            L = R.LON[k]
            tr = R.refine(lambda x: R.n180(L('Moon', x) - b), tm)
            upd('ing', k, abs(tr - tm) / 1000.0)
    # the sign the Moon is in at t must be the one between the two ingresses
    if not (p['entered'] <= t <= p['leaves']): ph_bad.append(('ingress order', t))
res = {'n_days_cases': len(data['days']), 'n_phase_cases': len(data['phases']), 'max_dev_s': {k: {s: round(v, 1) for s, v in d.items()} for k, d in dev.items()}, 'count': cnt,
       'issues': issues, 'daynum_bad': daynum_bad, 'phase_bad': ph_bad[:10], 'units': {'nm': 's', 'rise': 's', 'ill': 'percentage points', 'ing': 's'}}
json.dump(res, open(os.path.join(TMP, 'res_lunar.json'), 'w'), indent=1)
print(json.dumps(res, indent=1, default=str))
