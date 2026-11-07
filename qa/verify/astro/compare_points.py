"""Item 2: true node, mean node, mean Lilith (and Horizons-only minor asteroids when horizons.json is present).
python3 -W ignore compare_points.py <site_dump.json> <out.json>"""
import json, sys, math, statistics as st
import numpy as np
import erfa
import ephem
import sources as S

d = json.load(open(sys.argv[1]))
HZ = S.load_horizons()
SW, SK, PE, AP = S.SOURCES['swe'], S.SOURCES['sky'], S.SOURCES['pe'], S.SOURCES['apy']
AS = 1 / 3600


def node_from_state(r, v):
    h = np.cross(r, v)
    return S.n360(math.atan2(h[0], -h[1]) * S.R2D)


def pe_moon_vec(jd_tt):
    """PyEphem Moon: apparent geocentric ecliptic-of-date vector (au) from g_ra/g_dec and distance"""
    p = PE._one('Moon', jd_tt)
    m = ephem.Moon(); m.compute(PE._date(jd_tt))
    rr = m.earth_distance
    l, b = p['lon'] * S.D2R, p['lat'] * S.D2R
    return np.array([rr * math.cos(b) * math.cos(l), rr * math.cos(b) * math.sin(l), rr * math.sin(b)])


def pe_true_node(jd_tt):
    dt = 1 / 1440
    a, b, c = pe_moon_vec(jd_tt), pe_moon_vec(jd_tt + dt), pe_moon_vec(jd_tt - dt)
    return node_from_state(a, (b - c) / (2 * dt))


def apy_true_node(jd_tt):
    r, v = AP.moon_state_ecl_date(jd_tt)
    return node_from_state(r, v)


def sky_true_node(jd_tt):
    r, v = SK.geo_state_moon_ecl_date(jd_tt)
    return node_from_state(r, v)


def hz_true_node(el, jd_tt):
    """Horizons osculating elements (J2000 ecliptic, ICRF) -> ascending node on the true ecliptic of date"""
    i, om = el['IN'] * S.D2R, el['OM'] * S.D2R
    n_ecl = np.array([math.sin(i) * math.sin(om), -math.sin(i) * math.cos(om), math.cos(i)])
    e0 = 84381.448 / 3600 * S.D2R
    Rx = lambda e: np.array([[1, 0, 0], [0, math.cos(e), math.sin(e)], [0, -math.sin(e), math.cos(e)]])
    n_eq = Rx(e0).T @ n_ecl                          # J2000 ecliptic -> ICRF equator
    n_date = erfa.pnm06a(jd_tt, 0.0) @ n_eq          # -> true equator of date
    eps = AP.eps(jd_tt) * S.D2R
    n = Rx(eps) @ n_date                             # -> true ecliptic of date
    return S.n360(math.atan2(n[0], -n[1]) * S.R2D)


def prec_pA(T):
    # IAU 2006 general precession in longitude (arcsec): inertial J2000 ecliptic -> mean equinox of date
    return 5028.796195 * T + 1.1054348 * T * T + 0.00007964 * T ** 3 - 0.000023857 * T ** 4


def elp_mean_node(T):
    # ELP2000-82B (Chapront-Touzé & Chapront 1988), W3 on the inertial J2000 ecliptic + precession -> mean equinox of date
    s = 125 * 3600 + 2 * 60 + 40.39816 - 6967919.3622 * T + 6.3602 * T * T + 0.007625 * T ** 3 - 0.00003586 * T ** 4
    return S.n360((s + prec_pA(T)) / 3600)


def elp_mean_perigee(T):
    # ELP/MPP02 (Chapront & Francou 2002) W2, mean equinox of date
    s = 83 * 3600 + 21 * 60 + 11.67475 + 14643420.3171 * T - 38.2631 * T * T - 0.045047 * T ** 3 + 0.00021301 * T ** 4
    return S.n360((s + prec_pA(T)) / 3600)


def lilith_project(apogee, node, inc=5.1453964):
    u = (apogee - node) * S.D2R
    return S.n360(node + math.atan2(math.sin(u) * math.cos(inc * S.D2R), math.cos(u)) * S.R2D)


inst = [('chart', c['id'], c) for c in d['charts']] + [('random', c['i'], c) for c in d['random']]
rows = []
for kind, key, c in inst:
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    T = (jd_tt - S.J2000) / 36525
    node_site = [b for b in c['bodies'] if b['id'] == 'Node'][0]
    mean_site = c['meanNode']['elon'] if isinstance(c['meanNode'], dict) else c['meanNode']
    dpsi = SW.nut(jd_tt)['dpsi']
    r = {'kind': kind, 'key': key, 'year': 2000 + c['ut'] / 365.25}
    # true node
    tn = {'swe': SW.pos('TrueNode', jd_ut, jd_tt)['lon'], 'apy': apy_true_node(jd_tt), 'pe': pe_true_node(jd_tt)}
    if SK.ok(jd_tt): tn['sky'] = sky_true_node(jd_tt)
    for k, v in tn.items(): r['tn_' + k] = S.n180(node_site['elon'] - v) * 3600
    r['tn_speed_site'] = node_site['speed']; r['tn_speed_swe'] = SW.pos('TrueNode', jd_ut, jd_tt)['speed']
    r['tn_retro_site'] = node_site['retro']
    # mean node: mean-equinox formulas, and Swiss Ephemeris (true equinox of date)
    mn = {'swe': SW.pos('MeanNode', jd_ut, jd_tt)['lon'], 'erfa': AP.mean_node(jd_tt), 'elp82': elp_mean_node(T)}
    if SK.ok(jd_tt) or True: mn['sky'] = SK.mean_node(jd_tt)
    for k, v in mn.items(): r['mn_' + k] = S.n180(mean_site - v) * 3600
    r['mn_swe_minus_dpsi'] = S.n180(mean_site - (mn['swe'] - dpsi)) * 3600
    # mean Lilith
    lil = {'swe': SW.pos('MeanApog', jd_ut, jd_tt)['lon'],
           'elp02': lilith_project(elp_mean_perigee(T) + 180, elp_mean_node(T)),
           'erfa_node': lilith_project(elp_mean_perigee(T) + 180, AP.mean_node(jd_tt))}
    for k, v in lil.items(): r['lil_' + k] = S.n180(c['lilith'] - v) * 3600
    r['lil_swe_minus_dpsi'] = S.n180(c['lilith'] - (lil['swe'] - dpsi)) * 3600
    r['lil_unprojected'] = S.n180(c['lilith'] - S.n360(elp_mean_perigee(T) + 180)) * 3600
    rows.append(r)

# Horizons true node, minor asteroids
hz_rows = []
if HZ:
    cases = json.load(open('/home/claude/astrocartography/qa/verify/cases.json'))
    by_iso = {}
    for x, c in zip(cases['charts'], d['charts']): by_iso[x['utc']] = c
    for iso, c in zip(cases['random_utc'], d['random']): by_iso.setdefault(iso, c)
    for iso in HZ['times']:
        k = HZ['row'][iso]
        c = by_iso[iso]
        jd_tt = S.J2000 + c['tt']
        node_site = [b for b in c['bodies'] if b['id'] == 'Node'][0]
        hr = {'iso': iso, 'year': 2000 + c['ut'] / 365.25}
        if 'moon_elements_j2000' in HZ:
            hr['tn_hz'] = S.n180(node_site['elon'] - hz_true_node(HZ['moon_elements_j2000'][k], jd_tt)) * 3600
        for b in c['bodies']:
            if b['id'] in S.MINOR and b['id'] in HZ['bodies']:
                h = HZ['bodies'][b['id']][k]
                hr[b['id'] + '_lon'] = S.n180(b['elon'] - h['lon']) * 3600
                hr[b['id'] + '_lat'] = (b['elat'] - h['lat']) * 3600
                hr[b['id'] + '_ra'] = S.n180(b['ra'] - h['ra']) * 3600 * math.cos(h['dec'] * S.D2R)
                hr[b['id'] + '_dec'] = (b['dec'] - h['dec']) * 3600
        hz_rows.append(hr)


def summ(vals):
    v = sorted(abs(x) for x in vals)
    return {'n': len(v), 'max': v[-1], 'median': st.median(v), 'mean_signed': sum(vals) / len(vals)} if v else None


res = {'rows': rows, 'hz_rows': hz_rows, 'summary': {}}
keys = sorted({k for r in rows for k in r if k.startswith(('tn_', 'mn_', 'lil_')) and not k.startswith(('tn_speed', 'tn_retro'))})
for k in keys:
    res['summary'][k] = summ([r[k] for r in rows if k in r])
for k in sorted({k for r in hz_rows for k in r if k not in ('iso', 'year')}):
    res['summary']['hz_' + k] = summ([r[k] for r in hz_rows if k in r])
# node retrograde flag vs swe speed sign
res['summary']['node_retro'] = {'n': len(rows), 'mismatch': sum(1 for r in rows if r['tn_retro_site'] != (r['tn_speed_swe'] < 0)),
                                'speed_max_diff': max(abs(r['tn_speed_site'] - r['tn_speed_swe']) for r in rows)}
json.dump(res, open(sys.argv[2], 'w'))
for k, v in res['summary'].items(): print(k, v)
