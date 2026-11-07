"""Items 5–6: astrocartography lines MC/IC/ASC/DSC, aspect lines, parans, transits/progressions (dynamics),
local space (city view azimuth/altitude).
python3 -W ignore compare_lines.py <site_dump.json> <out.json>"""
import json, sys, math, statistics as st
import numpy as np
import sources as S
import astro_formulas as F

d = json.load(open(sys.argv[1]))
SW, SK, PE, AP = S.SOURCES['swe'], S.SOURCES['sky'], S.SOURCES['pe'], S.SOURCES['apy']
KM = 111.195          # km per degree of great circle
BOD = S.PLANETS + ['Chiron'] + S.SMALL[1:]


def srcpos(k, bid, jd_ut, jd_tt):
    src = S.SOURCES[k]
    if k == 'swe': return src.pos(bid, jd_ut, jd_tt)
    return src.pos(bid, jd_ut, jd_tt, speed=False)


def usable(k, bid, jd_tt):
    if bid not in S.PLANETS and k != 'swe': return False
    if k == 'apy' and bid == 'Pluto': return False
    if k == 'sky' and not SK.ok(jd_tt): return False
    return True


def summ(v):
    v = sorted(abs(x) for x in v if x is not None)
    return {'n': len(v), 'max': v[-1], 'median': st.median(v)} if v else None


res = {}
# ------------------------------------------------------------------ MC/IC for all instants
mc_err = {k: [] for k in S.SOURCES}
for c in d['charts'] + d['random']:
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    g = {k: S.SOURCES[k].gast(jd_ut, jd_tt) for k in S.SOURCES}
    for b in c['bodies']:
        if b['id'] not in BOD: continue
        for k in S.SOURCES:
            if not usable(k, b['id'], jd_tt): continue
            p = srcpos(k, b['id'], jd_ut, jd_tt)
            mc = S.n180(p['ra'] - g[k])
            mc_err[k].append(S.n180(b['mc'] - mc) * 3600)
            mc_err[k].append(S.n180(b['ic'] - (mc + 180)) * 3600)
res['mc_ic_arcsec'] = {k: summ(v) for k, v in mc_err.items()}

# ------------------------------------------------------------------ ASC/DSC curves, aspect lines, parans, dynamics, horizon (charts)
asc_alt = {k: [] for k in S.SOURCES}
asc_side_bad = {k: 0 for k in S.SOURCES}
asp_mc, asp_asc = {k: [] for k in S.SOURCES}, {k: [] for k in S.SOURCES}
par = {'site_n': 0, 'residual_min': {k: [] for k in S.SOURCES}, 'dlat': {k: [] for k in S.SOURCES}, 'missing': [], 'extra': []}
dyn = {m: {'mc': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'alt': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'time_s': []} for m in ('transit', 'prog')}
hor = {'geo_az': {k: [] for k in S.SOURCES}, 'geo_alt': {k: [] for k in S.SOURCES}, 'topo_moon_alt': {}, 'topo_moon_az': {}, 'topo_other_alt': {}}


def event_lst(ra, dec, ev, phi):
    if ev == 'MC': return ra
    if ev == 'IC': return ra + 180
    x = -math.tan(phi * S.D2R) * math.tan(dec * S.D2R)
    if abs(x) > 1: return None
    h = math.acos(x) * S.R2D
    return ra - h if ev == 'ASC' else ra + h


def paran_f(A, ea, B, eb, phi):
    la, lb = event_lst(A[0], A[1], ea, phi), event_lst(B[0], B[1], eb, phi)
    return None if la is None or lb is None else S.n180(la - lb)


def _ev_arr(ra, dec, ev, phis):
    if ev == 'MC': return np.full_like(phis, ra)
    if ev == 'IC': return np.full_like(phis, ra + 180)
    x = -np.tan(phis * S.D2R) * math.tan(dec * S.D2R)
    h = np.where(np.abs(x) <= 1, np.arccos(np.clip(x, -1, 1)) * S.R2D, np.nan)
    return ra - h if ev == 'ASC' else ra + h


def all_parans(P, ids, lim=85.0, step=0.005):
    """independent dense search (vectorised): every sign change of f(φ) on a 0.005° grid, refined by bisection"""
    EV = ['MC', 'IC', 'ASC', 'DSC']
    out = []
    grid = np.arange(-lim, lim + 1e-9, step)
    E = {(i, ev): _ev_arr(P[i][0], P[i][1], ev, grid) for i in ids for ev in EV}
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            A, B = P[ids[i]], P[ids[j]]
            for ea in EV:
                for eb in EV:
                    if ea in ('MC', 'IC') and eb in ('MC', 'IC'): continue
                    f = (E[(ids[i], ea)] - E[(ids[j], eb)] + 180) % 360 - 180
                    ok = ~np.isnan(f[:-1]) & ~np.isnan(f[1:])
                    sc = ok & (np.sign(f[:-1]) != np.sign(f[1:])) & (np.abs(f[1:] - f[:-1]) < 90)
                    for n in np.nonzero(sc)[0]:
                        lo, hi, flo = grid[n], grid[n + 1], f[n]
                        for _ in range(50):
                            m = (lo + hi) / 2; fm = paran_f(A, ea, B, eb, m)
                            if fm is None: break
                            if (flo < 0) != (fm < 0): hi = m
                            else: lo, flo = m, fm
                        out.append((ids[i], ea, ids[j], eb, (lo + hi) / 2))
    return out


for c in d['charts']:
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    g = {k: S.SOURCES[k].gast(jd_ut, jd_tt) for k in S.SOURCES}
    eps = {k: S.SOURCES[k].eps(jd_tt) for k in S.SOURCES}
    P = {k: {} for k in S.SOURCES}
    for b in c['bodies']:
        for k in S.SOURCES:
            if b['id'] in BOD and usable(k, b['id'], jd_tt):
                P[k][b['id']] = srcpos(k, b['id'], jd_ut, jd_tt)
    # ASC / DSC curves: altitude of the body at each point of the site's curve = distance from the true line
    for ln in c['lines']:
        for k in S.SOURCES:
            p = P[k].get(ln['id'])
            if not p: continue
            for side in ('asc', 'dsc'):
                for lon, lat in ln[side]:
                    alt, az = F.altaz(p['ra'], p['dec'], g[k] + lon, lat)
                    asc_alt[k].append(alt * 3600)
                    if abs(lat) < 84 and abs(alt) < 0.1 and abs(math.cos(lat * S.D2R) * math.cos(p['dec'] * S.D2R)) > 0.05:
                        east = 0 < az < 180
                        if (side == 'asc') != east and min(az % 180, 180 - az % 180) > 0.5: asc_side_bad[k] += 1
    # aspect lines
    for al in c['aspectLines']:
        for k in S.SOURCES:
            p = P[k].get(al['id'])
            if not p: continue
            point = S.n360(p['lon'] + al['sgn'] * al['a'])
            m = F.mc(g[k] + al['mc'], eps[k])
            asp_mc[k].append(S.n180(m - point) * 3600)
            ra, dec = F.ecl_ra_dec(point, eps[k])
            for lon, lat in al['asc']:
                alt, az = F.altaz(ra, dec, g[k] + lon, lat)
                asp_asc[k].append(alt * 3600)
    # parans: residual of the site's latitudes with each source, and completeness vs an independent search
    site_par = c['parans']
    par['site_n'] += len(site_par)
    for k in S.SOURCES:
        Pk = {i: (v['ra'], v['dec']) for i, v in P[k].items()}
        for sp in site_par:
            if sp['A'] not in Pk or sp['B'] not in Pk: continue
            A, B = Pk[sp['A']], Pk[sp['B']]
            v = paran_f(A, sp['ea'], B, sp['eb'], sp['lat'])
            if v is None: continue
            par['residual_min'][k].append(v * 4)        # degrees of sidereal time -> minutes of time
            # latitude error: root of the source function near the site's latitude
            lo, hi = sp['lat'] - 0.5, sp['lat'] + 0.5
            flo, fhi = paran_f(A, sp['ea'], B, sp['eb'], lo), paran_f(A, sp['ea'], B, sp['eb'], hi)
            if flo is not None and fhi is not None and (flo < 0) != (fhi < 0) and abs(flo - fhi) < 90:
                for _ in range(50):
                    m = (lo + hi) / 2; fm = paran_f(A, sp['ea'], B, sp['eb'], m)
                    if fm is None: break
                    if (flo < 0) != (fm < 0): hi = m
                    else: lo, flo = m, fm
                par['dlat'][k].append((sp['lat'] - (lo + hi) / 2) * 3600)
    # completeness with Skyfield / swe positions for the bodies the site uses (all chart bodies)
    k = 'swe'
    ids = [b['id'] for b in c['bodies'] if b['id'] in P[k]]
    ref = all_parans({i: (P[k][i]['ra'], P[k][i]['dec']) for i in ids}, ids)
    used = [False] * len(site_par)
    for r in ref:
        hit = None
        for n, sp in enumerate(site_par):
            if not used[n] and sp['A'] == r[0] and sp['ea'] == r[1] and sp['B'] == r[2] and sp['eb'] == r[3] and abs(sp['lat'] - r[4]) < 0.05:
                hit = n; break
        if hit is None: par['missing'].append({'chart': c['id'], 'A': r[0], 'ea': r[1], 'B': r[2], 'eb': r[3], 'lat': r[4]})
        else: used[hit] = True
    for n, sp in enumerate(site_par):
        if not used[n] and sp['A'] in ids and sp['B'] in ids: par['extra'].append(dict(sp, chart=c['id']))
    # dynamics (transits at 2026-11-07 12:00 UT, progressions natal+30 y), drawn on the natal frame
    for mode in ('transit', 'prog'):
        dd = c['dyn'][mode]
        if mode == 'prog':
            expect = c['utcMs'] + (dd['targetUtcMs'] - c['utcMs']) / 365.2422
            dyn[mode]['time_s'].append((dd['utcMs'] - expect) / 1000)
        tms = dd['utcMs']
        # instant of the dynamic chart: UT from ms; TT with the site's ΔT model of that instant ≈ use swe ΔT difference-free: same offset as site
        ut = (tms - 946728000000) / 86400000
        jd_ut2 = S.J2000 + ut
        dT = None
        for k in ('swe', 'sky', 'pe', 'apy'):
            if k == 'sky' and not SK.ok(jd_ut2): continue
            jd_tt2 = jd_ut2 + (S.SOURCES['swe'].deltat(jd_ut2)) / 86400
            for b in dd['bodies']:
                if b['id'] not in BOD or not usable(k, b['id'], jd_tt2): continue
                p = srcpos(k, b['id'], jd_ut2, jd_tt2)
                ra, dec = S.eq_from_ecl(p['lon'], p['lat'], eps[k])        # natal obliquity
                mc = S.n180(ra - g[k])                                     # natal sidereal time
                dyn[mode]['mc'][k].append(S.n180(b['mc'] - mc) * 3600)
                for lon, lat in b['asc'] + b['dsc']:
                    alt, _ = F.altaz(ra, dec, g[k] + lon, lat)
                    dyn[mode]['alt'][k].append(alt * 3600)
    # local space (horizon): geocentric from each source; topocentric from Skyfield/PyEphem/Astropy for comparison
    for hrec in c['horizon']:
        la, lo = hrec['lat'], hrec['lon']
        for b in hrec['bodies']:
            for k in S.SOURCES:
                p = P[k].get(b['id'])
                if not p: continue
                alt, az = F.altaz(p['ra'], p['dec'], g[k] + lo, la)
                hor['geo_alt'][k].append((b['alt'] - alt) * 3600)
                if abs(alt) < 89.5: hor['geo_az'][k].append(S.n180(b['az'] - az) * 3600 * math.cos(alt * S.D2R))
            if b['id'] in S.PLANETS and SK.ok(jd_tt):
                from skyfield.api import wgs84
                t = S._ts.ut1_jd(jd_ut)          # the site's UT, Earth rotation as in the site
                obs = S._eph['earth'] + wgs84.latlon(la, lo)
                ap = obs.at(t).observe(S._eph[S.SKY_ID[b['id']]]).apparent()
                alt, az, _ = ap.altaz()
                key = 'topo_moon_alt' if b['id'] == 'Moon' else 'topo_other_alt'
                hor[key].setdefault('sky', []).append((b['alt'] - alt.degrees) * 3600)
                if b['id'] == 'Moon':
                    hor['topo_moon_az'].setdefault('sky', []).append(S.n180(b['az'] - az.degrees) * 3600 * math.cos(alt.radians))

res['asc_dsc_alt_arcsec'] = {k: summ(v) for k, v in asc_alt.items()}
res['asc_dsc_side_bad'] = asc_side_bad
res['aspect_mc_arcsec'] = {k: summ(v) for k, v in asp_mc.items()}
res['aspect_asc_alt_arcsec'] = {k: summ(v) for k, v in asp_asc.items()}
res['parans'] = {'site_n': par['site_n'], 'residual_min': {k: summ(v) for k, v in par['residual_min'].items()},
                 'dlat_arcsec': {k: summ(v) for k, v in par['dlat'].items()},
                 'missing_n': len(par['missing']), 'extra_n': len(par['extra']), 'missing': par['missing'][:40], 'extra': par['extra'][:40]}
res['dynamic'] = {m: {'mc_arcsec': {k: summ(v) for k, v in x['mc'].items()}, 'alt_arcsec': {k: summ(v) for k, v in x['alt'].items()},
                      'prog_time_s': summ(x['time_s']) if x['time_s'] else None} for m, x in dyn.items()}
res['horizon'] = {kk: ({k: summ(v) for k, v in vv.items()}) for kk, vv in hor.items()}
json.dump(res, open(sys.argv[2], 'w'), indent=1, default=float)
print(json.dumps({k: v for k, v in res.items() if k != 'parans'}, indent=1, default=float))
print(json.dumps({k: v for k, v in res['parans'].items() if k not in ('missing', 'extra')}, indent=1, default=float))
print('missing', res['parans']['missing'][:20])
print('extra', res['parans']['extra'][:20])
