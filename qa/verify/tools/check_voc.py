"""Void-of-course Moon: the periods are found again from scratch with Swiss Ephemeris (ingresses and exact Moon aspects
by sampling and bisection), then the moments of the site's starts and ends are refined with Skyfield, PyEphem and Astropy."""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
TMP = os.environ.get('TOOLS_TMP')
data = json.load(open(os.path.join(TMP, 'site_voc.json')))
H = 3600000.0
ASP = [0, 60, 90, 120, 180]

def bisect(f, a, b, it=50):
    fa = f(a)
    for _ in range(it):
        m = (a + b) / 2; fm = f(m)
        if (fa < 0) == (fm < 0): a, fa = m, fm
        else: b = m
    return (a + b) / 2

def swe_voc(frm, days, ids):
    t0, t1 = frm - 3 * R.DAY, frm + days * R.DAY + 3 * R.DAY
    ms = [t0 + k * H for k in range(int((t1 - t0) / H) + 1)]
    moon = [R.swe_lon('Moon', t) for t in ms]
    ing = []
    for i in range(1, len(ms)):
        if int(moon[i] // 30) != int(moon[i - 1] // 30):
            b = (int(moon[i] // 30)) * 30.0
            ing.append((bisect(lambda x: R.n180(R.swe_lon('Moon', x) - b), ms[i - 1], ms[i]), int(moon[i] // 30)))
    ev = []
    for pid in ids:
        pl = [R.swe_lon(pid, t) for t in ms]
        for a in ASP:
            for tg in ([a] if a in (0, 180) else [a, 360 - a]):
                for i in range(1, len(ms)):
                    fa = R.n180(moon[i - 1] - pl[i - 1] - tg); fb = R.n180(moon[i] - pl[i] - tg)
                    if fa < 0 <= fb and fb - fa < 60:
                        ev.append((bisect(lambda x: R.n180(R.swe_lon('Moon', x) - R.swe_lon(pid, x) - tg), ms[i - 1], ms[i]), pid, a))
    ev.sort()
    out = []
    for i in range(1, len(ing)):
        a, b = ing[i - 1], ing[i]
        ins = [e for e in ev if a[0] < e[0] < b[0]]
        last = ins[-1] if ins else None
        start = last[0] if last else a[0]
        if b[0] < frm or start > frm + days * R.DAY: continue
        out.append({'start': start, 'end': b[0], 'last': last, 'nextSign': b[1] % 12})
    return out

dev = {'swe': [0, 0], 'sf': [0, 0], 'ep': [0, 0], 'ap': [0, 0]}
n = 0; mism = []; cnt = {'swe': 0, 'sf': 0, 'ep': 0, 'ap': 0}
for w in data:
    ids = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] + ([] if w['classic'] else ['Uranus', 'Neptune', 'Pluto'])
    ref = swe_voc(w['from'], 14, ids)
    site = w['list']
    # match by the ingress that ends the period
    for s in site:
        m = [r for r in ref if abs(r['end'] - s['end']) < 2 * H]
        if not m: mism.append(('no SE period', w['from'], s['end'])); continue
        r = m[0]; n += 1
        lastS = (s['last']['planet'], s['last']['aspect']) if s['last'] else None
        lastR = (r['last'][1], r['last'][2]) if r['last'] else None
        if lastS != lastR: mism.append(('last aspect differs', w['classic'], s['end'], lastS, lastR, (s['start'] - r['start']) / 60000.0))
        if lastS == lastR:
            dev['swe'][0] = max(dev['swe'][0], abs(s['start'] - r['start']) / 1000.0)
        dev['swe'][1] = max(dev['swe'][1], abs(s['end'] - r['end']) / 1000.0)
        cnt['swe'] += 1
        # other sources: refine the site's own events
        b = s['nextSign'] * 30.0
        for k in ('sf', 'ep', 'ap'):
            ms0 = s['end']
            if k == 'sf' and not (-2208988800000 + 0 < ms0 < 2643000000000): continue    # DE421 1900–2053
            L = R.LON[k]
            try:
                te = R.refine(lambda x: R.n180(L('Moon', x) - b), s['end'])
                dev[k][1] = max(dev[k][1], abs(te - s['end']) / 1000.0)
                if s['last']:
                    pid, a = s['last']['planet'], s['last']['aspect']
                    d0 = R.n180(L('Moon', s['start']) - L(pid, s['start']))
                    tg = a if a in (0, 180) else (a if abs(R.n180(d0 - a)) < abs(R.n180(d0 + a)) else -a)
                    if pid == 'Pluto' and k == 'ap': pass
                    ts = R.refine(lambda x: R.n180(L('Moon', x) - L(pid, x) - tg), s['start'])
                    dev[k][0] = max(dev[k][0], abs(ts - s['start']) / 1000.0)
                cnt[k] += 1
            except Exception as e:
                pass
    for r in ref:
        if not any(abs(r['end'] - s['end']) < 2 * H for s in site): mism.append(('missing on site', w['from'], r['end']))
res = {'periods': n, 'count': cnt, 'max_dev_s_start_end': {k: [round(v[0], 1), round(v[1], 1)] for k, v in dev.items()}, 'mismatch': mism[:30], 'n_mismatch': len(mism)}
json.dump(res, open(os.path.join(TMP, 'res_voc.json'), 'w'), indent=1)
print(json.dumps(res, indent=1, default=str))
