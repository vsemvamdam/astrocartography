"""Items 7–8: solar and lunar return moments, fixed stars, monthly ephemeris.
python3 -W ignore compare_returns_stars.py <site_dump.json> <out.json>"""
import json, sys, math, statistics as st
import swisseph as swe
import ephem
import sources as S

d = json.load(open(sys.argv[1]))
SW, SK, PE, AP = S.SOURCES['swe'], S.SOURCES['sky'], S.SOURCES['pe'], S.SOURCES['apy']
MS_J2000 = 946728000000.0


def ms_to_jd_ut(ms): return S.J2000 + (ms - MS_J2000) / 86400000


def jd_tt_of(jd_ut, k):
    """each source with its own ΔT (Astropy: Swiss Ephemeris ΔT)"""
    if k == 'pe': return jd_ut + ephem.delta_t(ephem.Date(jd_ut - 2415020.0)) / 86400
    if k == 'sky': return jd_ut + SK.deltat(jd_ut) / 86400
    return jd_ut + swe.deltat(jd_ut)


def lon_of(k, body, jd_ut):
    jd_tt = jd_tt_of(jd_ut, k)
    if k == 'swe': return swe.calc_ut(jd_ut, S.SWE_ID[body], S.SWFLG)[0][0]
    return S.SOURCES[k].pos(body, jd_ut, jd_tt, speed=False)['lon']


def crossing(k, body, target, jd0, rate):
    """moment near jd0 when the apparent longitude of body equals target (secant iterations)"""
    t = jd0
    for _ in range(30):
        dl = S.n180(target - lon_of(k, body, t))
        if abs(dl) < 1e-7: break
        t += dl / rate
    return t


def summ(v):
    v = sorted(abs(x) for x in v if x is not None)
    return {'n': len(v), 'max': v[-1], 'median': st.median(v)} if v else None


res = {'solar': {}, 'lunar': {}, 'stars': {}, 'ephemeris': {}}
# ------------------------------------------------------------------ solar returns
sol = {'solver': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'e2e': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'year_ok': 0, 'n': 0}
items = []
for c in d['charts']:
    for s in c['solar']: items.append((c, c['sunLon'], s['year'], s['utcMs']))
for c in d['random']:
    if 'solar' in c: items.append((c, c['solar']['sunLon'], c['solar']['year'], c['solar']['utcMs']))
for c, natlon, year, ms in items:
    jd = ms_to_jd_ut(ms)
    sol['n'] += 1
    from datetime import datetime, timezone
    sol['year_ok'] += datetime.fromtimestamp(ms / 1000, timezone.utc).year == year
    nat_jd_ut = S.J2000 + c['ut']
    for k in ('swe', 'sky', 'pe', 'apy'):
        if k == 'sky' and not (SK.ok(jd) and SK.ok(nat_jd_ut)): continue
        if k == 'swe':
            t1 = swe.solcross_ut(natlon, jd - 2, swe.FLG_SWIEPH)
            nl = swe.calc_ut(nat_jd_ut, swe.SUN, S.SWFLG)[0][0]
            t2 = swe.solcross_ut(nl, jd - 2, swe.FLG_SWIEPH)
        else:
            t1 = crossing(k, 'Sun', natlon, jd, 0.9856)
            nl = lon_of(k, 'Sun', nat_jd_ut)
            t2 = crossing(k, 'Sun', nl, jd, 0.9856)
        sol['solver'][k].append((jd - t1) * 86400)
        sol['e2e'][k].append((jd - t2) * 86400)
res['solar'] = {'n': sol['n'], 'year_ok': sol['year_ok'], 'solver_s': {k: summ(v) for k, v in sol['solver'].items()}, 'end_to_end_s': {k: summ(v) for k, v in sol['e2e'].items()}}

# ------------------------------------------------------------------ lunar returns
lun = {'solver': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'e2e': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'n': 0, 'not_latest': [], 'next_bad': []}
items = []
for c in d['charts']:
    for L in c['lunar']: items.append((c, c['moonLon'], L))
for c in d['random']:
    if 'lunar' in c: items.append((c, c['lunar']['moonLon'], c['lunar']))
for c, natlon, L in items:
    lun['n'] += 1
    jd, jd_at, jd_next = ms_to_jd_ut(L['utcMs']), ms_to_jd_ut(L['at']), ms_to_jd_ut(L['next'])
    nat_jd_ut = S.J2000 + c['ut']
    # 'latest at or before at': the next crossing after the result (swe) must be after `at`
    nxt = swe.mooncross_ut(natlon, jd + 0.5, swe.FLG_SWIEPH)
    if not (jd <= jd_at + 1e-9 and nxt > jd_at): lun['not_latest'].append({'at': L['at'], 'got': L['utcMs'], 'next_swe_jd': nxt, 'jd_at': jd_at})
    if abs((jd_next - nxt) * 86400) > 5: lun['next_bad'].append({'got': L['next'], 'swe': nxt})
    for k in ('swe', 'sky', 'pe', 'apy'):
        if k == 'sky' and not (SK.ok(jd) and SK.ok(nat_jd_ut)): continue
        if k == 'swe':
            t1 = swe.mooncross_ut(natlon, jd - 1, swe.FLG_SWIEPH)
            nl = swe.calc_ut(nat_jd_ut, swe.MOON, S.SWFLG)[0][0]
            t2 = swe.mooncross_ut(nl, jd - 1, swe.FLG_SWIEPH)
        else:
            t1 = crossing(k, 'Moon', natlon, jd, 13.2)
            nl = lon_of(k, 'Moon', nat_jd_ut)
            t2 = crossing(k, 'Moon', nl, jd, 13.2)
        lun['solver'][k].append((jd - t1) * 86400)
        lun['e2e'][k].append((jd - t2) * 86400)
res['lunar'] = {'n': lun['n'], 'not_latest': lun['not_latest'], 'next_bad': lun['next_bad'],
                'solver_s': {k: summ(v) for k, v in lun['solver'].items()}, 'end_to_end_s': {k: summ(v) for k, v in lun['e2e'].items()}}

# ------------------------------------------------------------------ fixed stars
SWE_STAR = {'Альферац': ',alAnd', 'Мирах': ',beAnd', 'Ахернар': ',alEri', 'Хамаль': ',alAri', 'Полярная': ',alUMi', 'Менкар': ',alCet',
            'Алголь': ',bePer', 'Альциона (Плеяды)': ',etTau', 'Альдебаран': ',alTau', 'Ригель': ',beOri', 'Капелла': ',alAur',
            'Беллатрикс': ',gaOri', 'Альнилам': ',epOri', 'Бетельгейзе': ',alOri', 'Канопус': ',alCar', 'Сириус': ',alCMa',
            'Кастор': ',alGem', 'Процион': ',alCMi', 'Поллукс': ',beGem', 'Альфард': ',alHya', 'Регул': ',alLeo', 'Денебола': ',beLeo',
            'Акрукс': ',alCru', 'Альгораб': ',deCrv', 'Виндемиатрикс': ',epVir', 'Спика': ',alVir', 'Хадар': ',beCen', 'Арктур': ',alBoo',
            'Толиман': ',alCen', 'Зубен Эльгенуби': ',al-2Lib', 'Зубен Эльшемали': ',beLib', 'Унукальхай': ',alSer', 'Антарес': ',alSco',
            'Расальхаг': ',alOph', 'Вега': ',alLyr', 'Альтаир': ',alAql', 'Денеб': ',alCyg', 'Денеб Альгеди': ',deCap',
            'Садальмелик': ',alAqr', 'Фомальгаут': ',alPsA', 'Маркаб': ',alPeg', 'Шеат': ',bePeg'}
PE_STAR = {'Альферац': 'Alpheratz', 'Мирах': 'Mirach', 'Ахернар': 'Achernar', 'Хамаль': 'Hamal', 'Полярная': 'Polaris', 'Менкар': 'Menkar',
           'Алголь': 'Algol', 'Альциона (Плеяды)': 'Alcyone', 'Альдебаран': 'Aldebaran', 'Ригель': 'Rigel', 'Капелла': 'Capella',
           'Беллатрикс': 'Bellatrix', 'Альнилам': 'Alnilam', 'Бетельгейзе': 'Betelgeuse', 'Канопус': 'Canopus', 'Сириус': 'Sirius',
           'Кастор': 'Castor', 'Процион': 'Procyon', 'Поллукс': 'Pollux', 'Альфард': 'Alphard', 'Регул': 'Regulus', 'Денебола': 'Denebola',
           'Акрукс': 'Acrux', 'Виндемиатрикс': 'Vindemiatrix', 'Спика': 'Spica', 'Хадар': 'Hadar', 'Арктур': 'Arcturus',
           'Толиман': 'Rigil Kentaurus', 'Зубен Эльгенуби': 'Zubenelgenubi', 'Унукальхай': 'Unukalhai', 'Антарес': 'Antares',
           'Расальхаг': 'Rasalhague', 'Вега': 'Vega', 'Альтаир': 'Altair', 'Денеб': 'Deneb', 'Садальмелик': 'Sadalmelik',
           'Фомальгаут': 'Fomalhaut', 'Маркаб': 'Markab', 'Шеат': 'Scheat'}


def sef_catalogue():
    cat = {}
    for line in open(S.EPHE + '/sefstars.txt', encoding='latin-1'):
        if line.startswith('#') or ',' not in line: continue
        f = [x.strip() for x in line.split('#')[0].split(',')]
        if len(f) < 14: continue
        nom = ',' + f[1]
        if nom in cat: continue
        try:
            ra = (float(f[3]) + float(f[4]) / 60 + float(f[5]) / 3600) * 15
            sg = -1 if f[6].startswith('-') else 1
            dec = sg * (abs(float(f[6])) + float(f[7]) / 60 + float(f[8]) / 3600)
            cat[nom] = {'ra': ra, 'dec': dec, 'pmra': float(f[9]), 'pmdec': float(f[10]), 'rv': float(f[11]), 'plx': float(f[12])}
        except ValueError:
            pass
    return cat


CAT = sef_catalogue()
from skyfield.api import Star
from astropy.coordinates import SkyCoord, GeocentricTrueEcliptic
from astropy.time import Time
import astropy.units as u
stars = {'catalogue_arcsec': [], 'by_src': {k: [] for k in ('swe', 'sky', 'pe', 'apy')}, 'nopm_aberr_model': [], 'worst': {}}
site_cat = {}
# catalogue check: the site's J2000 RA/Dec (from the J2000 star longitudes at J2000.0 are not available, so re-derive from FEAT.STARS order)
for c in d['charts']:
    jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
    for s_ in c['stars']:
        nom = SWE_STAR.get(s_['ru'])
        if not nom: continue
        x, _, _ = swe.fixstar2_ut(nom, jd_ut, swe.FLG_SWIEPH)
        dv = {'swe': S.n180(s_['lon'] - x[0]) * 3600}
        cat = CAT.get(nom)
        if cat and SK.ok(jd_tt):
            st_ = Star(ra_hours=cat['ra'] / 15, dec_degrees=cat['dec'], ra_mas_per_year=cat['pmra'], dec_mas_per_year=cat['pmdec'],
                       parallax_mas=cat['plx'], radial_km_per_s=cat['rv'])
            from skyfield.framelib import ecliptic_frame
            ap = SK.earth.at(S._ts.tt_jd(jd_tt)).observe(st_).apparent()
            la, lo, _ = ap.frame_latlon(ecliptic_frame)
            dv['sky'] = S.n180(s_['lon'] - lo.degrees) * 3600
        if cat and c['id'] in ('sotis', 'y1800', 'y2099', 'today', 'einstein', 'gagarin'):
            t = Time(jd_tt, format='jd', scale='tt')
            sc = SkyCoord(ra=cat['ra'] * u.deg, dec=cat['dec'] * u.deg, pm_ra_cosdec=cat['pmra'] * u.mas / u.yr, pm_dec=cat['pmdec'] * u.mas / u.yr,
                          distance=(1000 / max(cat['plx'], 0.1)) * u.pc, radial_velocity=cat['rv'] * u.km / u.s, obstime=Time(2451545.0, format='jd', scale='tt'), frame='icrs')
            e = sc.apply_space_motion(new_obstime=t).transform_to(GeocentricTrueEcliptic(equinox=t, obstime=t))
            dv['apy'] = S.n180(s_['lon'] - e.lon.deg) * 3600
        pn = PE_STAR.get(s_['ru'])
        if pn:
            b = ephem.star(pn); b.compute(PE._date(jd_tt))
            lo, la = S.ecl_from_eq(float(b.g_ra) * S.R2D, float(b.g_dec) * S.R2D, PE.eps(jd_tt))
            dv['pe'] = S.n180(s_['lon'] - lo) * 3600
        for k, v in dv.items():
            stars['by_src'][k].append(v)
            w = stars['worst'].get(k)
            if w is None or abs(v) > abs(w['d']): stars['worst'][k] = {'d': v, 'star': s_['ru'], 'chart': c['id']}
res['stars'] = {'by_src_arcsec': {k: summ(v) for k, v in stars['by_src'].items()}, 'worst': stars['worst']}
# per-star worst vs swe over all charts, to show the proper-motion pattern
per = {}
for c in d['charts']:
    for s_ in c['stars']:
        nom = SWE_STAR.get(s_['ru'])
        if not nom: continue
        x, _, _ = swe.fixstar2_ut(nom, S.J2000 + c['ut'], swe.FLG_SWIEPH)
        v = S.n180(s_['lon'] - x[0]) * 3600
        if abs(v) > abs(per.get(s_['ru'], (0, ''))[0]): per[s_['ru']] = (v, c['id'])
res['stars']['per_star_worst_vs_swe'] = dict(sorted(per.items(), key=lambda kv: -abs(kv[1][0])))
# the catalogue itself: site J2000 RA/Dec vs sefstars (ICRS, Hipparcos)
import subprocess
site_stars = json.loads(subprocess.run(['node', '-e', "const S=require('/home/claude/astrocartography/qa/lib/site.js'); console.log(JSON.stringify(S.FEAT.STARS))"], capture_output=True, text=True).stdout)
catd = []
for ru, h, m, s, dd, dm, ds, nat in site_stars:
    nom = SWE_STAR.get(ru)
    if not nom or nom not in CAT: continue
    ra = (h + m / 60 + s / 3600) * 15
    sg = -1 if (dd < 0 or dm < 0) else 1
    dec = sg * (abs(dd) + abs(dm) / 60 + ds / 3600)
    cat = CAT[nom]
    catd.append({'star': ru, 'dra_arcsec': S.n180(ra - cat['ra']) * 3600 * math.cos(dec * S.D2R), 'ddec_arcsec': (dec - cat['dec']) * 3600,
                 'pm_total_mas': math.hypot(cat['pmra'], cat['pmdec'])})
res['stars']['catalogue'] = {'n': len(catd), 'max_arcsec': max(max(abs(x['dra_arcsec']), abs(x['ddec_arcsec'])) for x in catd),
                             'worst': sorted(catd, key=lambda x: -max(abs(x['dra_arcsec']), abs(x['ddec_arcsec'])))[:5],
                             'largest_pm': sorted(catd, key=lambda x: -x['pm_total_mas'])[:5], 'missing_in_sef': [r[0] for r in site_stars if SWE_STAR.get(r[0]) not in CAT]}

# ------------------------------------------------------------------ monthly ephemeris
import calendar
eph = {'months': [], 'lon_arcsec_swe': []}
for E in d['ephemeris']:
    y, m = E['y'], E['m']
    ok_days = [r['d'] for r in E['rows']] == list(range(1, calendar.monthrange(y, m)[1] + 1))
    eph['months'].append({'y': y, 'm': m, 'days': len(E['rows']), 'days_ok': ok_days})
    for r in E['rows']:
        jd_ut = swe.julday(y, m, r['d'], 0.0)
        for b in r['bodies']:
            if b['id'] in S.SWE_ID:
                try: x = swe.calc_ut(jd_ut, S.SWE_ID[b['id']], S.SWFLG)[0]
                except Exception: continue          # seas_18 starts after 1800-01-01
                eph['lon_arcsec_swe'].append(S.n180(b['elon'] - x[0]) * 3600)
            elif b['id'] == 'Node':
                x = swe.calc_ut(jd_ut, swe.TRUE_NODE, S.SWFLG)[0]
                eph['lon_arcsec_swe'].append(S.n180(b['elon'] - x[0]) * 3600)
res['ephemeris'] = {'months': eph['months'], 'lon_vs_swe_ut_arcsec': summ(eph['lon_arcsec_swe'])}
json.dump(res, open(sys.argv[2], 'w'), indent=1, default=float)
print(json.dumps(res, indent=1, default=float)[:9000])
