"""A-04: the site's paran scan (0.25° step) re-implemented, with and without the proposed edge handling, against the dense
0.002° search of paran_audit.py; all on the site's own RA/Dec.   python3 paran_fix_check.py <site_dump.json> [n_charts]"""
import json, sys, math
import numpy as np
from paran_audit import roots

D2R = math.pi / 180
d = json.load(open(sys.argv[1]))
NC = int(sys.argv[2]) if len(sys.argv) > 2 else 16
EV = ['MC', 'IC', 'ASC', 'DSC']


def ev(ra, dec, e, phi):
    if e == 'MC': return ra
    if e == 'IC': return ra + 180
    x = -math.tan(phi * D2R) * math.tan(dec * D2R)
    if x < -1 or x > 1: return None
    h = math.acos(x) / D2R
    return ra - h if e == 'ASC' else ra + h


def f(A, ea, B, eb, phi):
    a, b = ev(*A, ea, phi), ev(*B, eb, phi)
    return None if a is None or b is None else (a - b + 180) % 360 - 180


def sc(a, b): return (a < 0 and b >= 0) or (a > 0 and b <= 0)


def bis(A, ea, B, eb, lo, hi, flo):
    for _ in range(40):
        m = (lo + hi) / 2; fm = f(A, ea, B, eb, m)
        if fm is None: break
        if sc(flo, fm): hi = m
        else: lo, flo = m, fm
    return (lo + hi) / 2


def edge(A, ea, B, eb, good, bad):
    for _ in range(50):
        m = (good + bad) / 2
        if f(A, ea, B, eb, m) is None: bad = m
        else: good = m
    return good


def scan(A, ea, B, eb, fix):
    out, p0, f0, pp, vp = [], None, None, None, None
    phi = -85.0
    while phi <= 85 + 1e-9:
        v = f(A, ea, B, eb, phi)
        if fix and pp is not None and (vp is None) != (v is None):
            e = edge(A, ea, B, eb, phi if v is not None else pp, pp if v is not None else phi)
            fe = f(A, ea, B, eb, e)
            if v is None and f0 is not None and fe is not None and sc(f0, fe) and abs(fe - f0) < 90: out.append(bis(A, ea, B, eb, p0, e, f0))
            if v is not None and fe is not None and sc(fe, v) and abs(v - fe) < 90: out.append(bis(A, ea, B, eb, e, phi, fe))
        if v is None: f0 = None
        else:
            if f0 is not None and sc(f0, v) and abs(v - f0) < 90: out.append(bis(A, ea, B, eb, p0, phi, f0))
            p0, f0 = phi, v
        pp, vp = phi, v
        phi += 0.25
    return out


ref_n = miss_site = miss_fix = extra_fix = 0
for c in d['charts'][:NC]:
    P = {b['id']: (b['ra'], b['dec']) for b in c['bodies']}
    ids = list(P)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            for ea in EV:
                for eb in EV:
                    if ea in ('MC', 'IC') and eb in ('MC', 'IC'): continue
                    A, B = P[ids[i]], P[ids[j]]
                    ref = roots(A, ea, B, eb)
                    r0, r1 = scan(A, ea, B, eb, False), scan(A, ea, B, eb, True)
                    ref_n += len(ref)
                    miss_site += sum(1 for r in ref if not any(abs(r - x) < 0.01 for x in r0))
                    miss_fix += sum(1 for r in ref if not any(abs(r - x) < 0.01 for x in r1))
                    extra_fix += sum(1 for x in r1 if not any(abs(r - x) < 0.01 for r in ref))
print(json.dumps({'charts': NC, 'reference_parans': ref_n, 'missed_by_site_scan': miss_site, 'missed_with_edge_fix': miss_fix, 'spurious_with_fix': extra_fix}))
