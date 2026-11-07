"""Paran completeness: the site's scan (0.25° step, |Δf| < 90° guard) vs a dense 0.002° search, both on the site's own
RA/Dec, so only the root-finding is compared.  python3 paran_audit.py <site_dump.json> <out.json>"""
import json, sys, math, collections
import numpy as np

D2R, R2D = math.pi / 180, 180 / math.pi
EV = ['MC', 'IC', 'ASC', 'DSC']


def ev_arr(ra, dec, ev, ph):
    if ev == 'MC': return np.full_like(ph, ra)
    if ev == 'IC': return np.full_like(ph, ra + 180)
    x = -np.tan(ph * D2R) * math.tan(dec * D2R)
    h = np.where(np.abs(x) <= 1, np.arccos(np.clip(x, -1, 1)) * R2D, np.nan)
    return ra - h if ev == 'ASC' else ra + h


def roots(A, ea, B, eb, lim=85.0, step=0.002):
    ph = np.arange(-lim, lim + 1e-9, step)
    f = (ev_arr(*A, ea, ph) - ev_arr(*B, eb, ph) + 180) % 360 - 180
    ok = ~np.isnan(f[:-1]) & ~np.isnan(f[1:])
    sc = ok & (np.sign(f[:-1]) != np.sign(f[1:])) & (np.abs(f[1:] - f[:-1]) < 90)
    out = []
    for n in np.nonzero(sc)[0]:
        out.append(ph[n] - f[n] * step / (f[n + 1] - f[n]))
    return out


def limit_lat(dec):
    return 90 - abs(dec)


def main():
    d = json.load(open(sys.argv[1]))
    stats = collections.Counter()
    cats = collections.Counter()
    by_band = collections.defaultdict(lambda: [0, 0])
    examples = []
    for c in d['charts']:
        P = {b['id']: (b['ra'], b['dec']) for b in c['bodies']}
        ids = [b['id'] for b in c['bodies']]
        site = collections.defaultdict(list)
        for p in c['parans']:
            site[(p['A'], p['ea'], p['B'], p['eb'])].append(p['lat'])
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                for ea in EV:
                    for eb in EV:
                        if ea in ('MC', 'IC') and eb in ('MC', 'IC'): continue
                        key = (ids[i], ea, ids[j], eb)
                        ref = roots(P[ids[i]], ea, P[ids[j]], eb)
                        got = list(site.get(key, []))
                        for r in ref:
                            band = int(min(abs(r), 84.999) // 10) * 10
                            by_band[band][0] += 1
                            hit = [g for g in got if abs(g - r) < 0.01]
                            if hit:
                                got.remove(hit[0]); stats['found'] += 1; continue
                            by_band[band][1] += 1
                            stats['missing'] += 1
                            # why: distance to the circumpolar limit of the rising/setting body(ies)
                            lims = [limit_lat(P[ids[i]][1])] if ea in ('ASC', 'DSC') else []
                            lims += [limit_lat(P[ids[j]][1])] if eb in ('ASC', 'DSC') else []
                            dist = min(abs(abs(r) - L) for L in lims) if lims else 99
                            near = [x for x in ref if x != r and abs(x - r) < 0.25]
                            if dist < 0.25: cat = 'root within 0.25° of the circumpolar limit'
                            elif near: cat = 'two roots within one 0.25° step'
                            else: cat = 'other'
                            cats[cat] += 1
                            if len(examples) < 25: examples.append({'chart': c['id'], 'A': ids[i], 'ea': ea, 'B': ids[j], 'eb': eb, 'lat': round(r, 4), 'dist_to_limit': round(dist, 4), 'cat': cat})
                        for g in got:
                            stats['extra'] += 1
                            if len(examples) < 40: examples.append({'chart': c['id'], 'extra': key, 'lat': g})
    res = {'stats': dict(stats), 'categories': dict(cats), 'by_band_total_missing': {k: v for k, v in sorted(by_band.items())}, 'examples': examples}
    json.dump(res, open(sys.argv[2], 'w'), indent=1)
    print(json.dumps(res, indent=1)[:5000])


if __name__ == '__main__':
    main()
