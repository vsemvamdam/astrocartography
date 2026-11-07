"""Planetary hours: sunrise, sunset and the next sunrise against Swiss Ephemeris, Skyfield, PyEphem and Astropy;
the rulers of the day and of the 24 hours against flatlib's planetary-time table and the Chaldean order."""
import json, sys, os, datetime
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
TMP = os.environ.get('TOOLS_TMP')
data = json.load(open(os.path.join(TMP, 'site_hours.json')))

from flatlib.tools import planetarytime as PT
CHALD = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon']
# Lilly / Ptolemy: the day is ruled by the planet of the weekday; flatlib counts weekdays from Sunday
dev = {k: 0.0 for k in ('swe', 'sf', 'ep', 'ap')}
n = 0; polar_site = 0; polar_mismatch = []; ruler_bad = []; hour_dev = 0.0; cases = []
for c in data:
    r = c['r']; lat, lon = c['lat'], c['lon']; mid = c['midnight']
    rise = R.swe_rise('Sun', mid, lat, lon, True)
    # the site searches 1 day for the rise, 1 day for the set after it, 1.5 days for the next rise
    ok_ref = rise is not None and rise - mid < R.DAY
    sset = R.swe_rise('Sun', rise, lat, lon, False) if ok_ref else None
    ok_ref = ok_ref and sset is not None and sset - rise < R.DAY
    nxt = R.swe_rise('Sun', sset, lat, lon, True) if ok_ref else None
    ok_ref = ok_ref and nxt is not None and nxt - sset < 1.5 * R.DAY
    if r.get('polar'):
        polar_site += 1
        if ok_ref: polar_mismatch.append((c['id'], c['y'], c['m'], c['d'], 'site polar, SE has rise/set'))
        continue
    if not ok_ref:
        polar_mismatch.append((c['id'], c['y'], c['m'], c['d'], 'site has rise/set, SE polar')); continue
    n += 1
    refs = {'swe': (rise, sset, nxt)}
    def first_after(lst, t):
        lst = [x for x in lst if x > t - 600000]
        return min(lst) if lst else None
    try:
        rs = R.sf_rises('Sun', mid, mid + 3 * R.DAY, lat, lon, True); ss = R.sf_rises('Sun', mid, mid + 3 * R.DAY, lat, lon, False)
        a = first_after(rs, mid); b = first_after(ss, a); cc = first_after(rs, b)
        refs['sf'] = (a, b, cc)
    except Exception as e: print('sf', e)
    a = R.ep_rise('Sun', mid, lat, lon, True); b = R.ep_rise('Sun', a, lat, lon, False); cc = R.ep_rise('Sun', b, lat, lon, True)
    refs['ep'] = (a, b, cc)
    refs['ap'] = (R.ap_rise('Sun', rise, lat, lon, True), R.ap_rise('Sun', sset, lat, lon, False), R.ap_rise('Sun', nxt, lat, lon, True))
    site = (r['sunrise'], r['sunset'], r['nextSunrise'])
    row = {'id': c['id'], 'date': f"{c['y']}-{c['m']:02d}-{c['d']:02d}"}
    for k, v in refs.items():
        if None in v: continue
        d = max(abs(s - x) for s, x in zip(site, v)) / 1000.0
        row[k] = round(d, 1)
        dev[k] = max(dev[k], d)
    cases.append(row)
    # hour boundaries from the SE rise/set
    dh, nh = (sset - rise) / 12, (nxt - sset) / 12
    for k, h in enumerate(r['hours']):
        st = rise + k * dh if k < 12 else sset + (k - 12) * nh
        hour_dev = max(hour_dev, abs(h['start'] - st) / 1000.0)
    # rulers: weekday of the local date
    wd = datetime.date(c['y'], c['m'], c['d']).weekday()          # Monday = 0
    dow = (wd + 1) % 7                                              # Sunday = 0 as flatlib counts
    day_ruler = PT.DAY_RULERS[dow]
    exp = [PT.nthRuler(k, dow) for k in range(24)]
    own = [CHALD[(CHALD.index(day_ruler) + k) % 7] for k in range(24)]
    got = [h['ruler'] for h in r['hours']]
    if r['dayRuler'] != day_ruler or got != exp or got != own:
        ruler_bad.append((row['date'], r['dayRuler'], day_ruler))
res = {'n': n, 'polar_site': polar_site, 'polar_mismatch': polar_mismatch, 'max_dev_s': {k: round(v, 1) for k, v in dev.items()}, 'hour_start_dev_s': round(hour_dev, 2),
       'ruler_cases': len(cases), 'ruler_bad': ruler_bad, 'worst': sorted(cases, key=lambda x: -max(v for k, v in x.items() if k in dev))[:5]}
json.dump(res, open(os.path.join(TMP, 'res_hours.json'), 'w'), indent=1)
print(json.dumps(res, indent=1))
