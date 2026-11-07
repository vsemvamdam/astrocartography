"""Fixed stars: ecliptic longitudes of the site's 42 stars on each birth date and the contacts within 1.5°.
Sources: Swiss Ephemeris swe.fixstar2_ut (sefstars.txt, with proper motion), Skyfield Star and Astropy SkyCoord built from the
sefstars.txt Hipparcos values with proper motion, PyEphem's own star catalogue."""
import json, os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
import swisseph as swe
import ephem
TMP = os.environ.get('TOOLS_TMP')
N = json.load(open(os.path.join(TMP, 'site_natal.json')))
NAMES = {'Альферац': ',alAnd', 'Мирах': ',beAnd', 'Ахернар': ',alEri', 'Хамаль': ',alAri', 'Полярная': ',alUMi', 'Менкар': ',alCet', 'Алголь': ',bePer',
         'Альциона (Плеяды)': ',etTau', 'Альдебаран': ',alTau', 'Ригель': ',beOri', 'Капелла': ',alAur', 'Беллатрикс': ',gaOri', 'Альнилам': ',epOri',
         'Бетельгейзе': ',alOri', 'Канопус': ',alCar', 'Сириус': ',alCMa', 'Кастор': ',alGem', 'Процион': ',alCMi', 'Поллукс': ',beGem', 'Альфард': ',alHya',
         'Регул': ',alLeo', 'Денебола': ',beLeo', 'Акрукс': ',alCru', 'Альгораб': ',deCrv', 'Виндемиатрикс': ',epVir', 'Спика': ',alVir', 'Хадар': ',beCen',
         'Арктур': ',alBoo', 'Толиман': ',alCen', 'Зубен Эльгенуби': ',al-2Lib', 'Зубен Эльшемали': ',beLib', 'Унукальхай': ',alSer', 'Антарес': ',alSco',
         'Расальхаг': ',alOph', 'Вега': ',alLyr', 'Альтаир': ',alAql', 'Денеб': ',alCyg', 'Денеб Альгеди': ',deCap', 'Садальмелик': ',alAqr',
         'Фомальгаут': ',alPsA', 'Маркаб': ',alPeg', 'Шеат': ',bePeg'}
EPN = {'Альферац': 'Alpheratz', 'Ахернар': 'Achernar', 'Хамаль': 'Hamal', 'Полярная': 'Polaris', 'Менкар': 'Menkar', 'Алголь': 'Algol', 'Альциона (Плеяды)': 'Alcyone',
       'Альдебаран': 'Aldebaran', 'Ригель': 'Rigel', 'Капелла': 'Capella', 'Беллатрикс': 'Bellatrix', 'Альнилам': 'Alnilam', 'Бетельгейзе': 'Betelgeuse', 'Канопус': 'Canopus',
       'Сириус': 'Sirius', 'Кастор': 'Castor', 'Процион': 'Procyon', 'Поллукс': 'Pollux', 'Альфард': 'Alphard', 'Регул': 'Regulus', 'Денебола': 'Denebola', 'Акрукс': 'Acrux',
       'Спика': 'Spica', 'Хадар': 'Hadar', 'Арктур': 'Arcturus', 'Толиман': 'Rigil Kentaurus', 'Зубен Эльгенуби': 'Zubenelgenubi', 'Антарес': 'Antares', 'Расальхаг': 'Rasalhague',
       'Вега': 'Vega', 'Альтаир': 'Altair', 'Денеб': 'Deneb', 'Фомальгаут': 'Fomalhaut', 'Маркаб': 'Markab', 'Шеат': 'Scheat', 'Мирах': 'Mirach', 'Денеб Альгеди': 'Deneb Algedi',
       'Унукальхай': 'Unukalhai', 'Зубен Эльшемали': 'Zubeneschamali', 'Виндемиатрикс': 'Vindemiatrix', 'Альгораб': 'Algorab', 'Садальмелик': 'Sadalmelik'}
CAT = {}
for line in open(os.path.join(R.EPHE, 'sefstars.txt'), encoding='latin-1'):
    if line.startswith('#') or ',' not in line: continue
    f = [x.strip() for x in line.split(',')]
    if len(f) < 14: continue
    key = ',' + f[1]
    if key in CAT: continue
    try:
        ra = (float(f[3]) + float(f[4]) / 60 + float(f[5]) / 3600) * 15
        sg = -1 if f[6].startswith('-') else 1
        dec = sg * (abs(float(f[6])) + float(f[7]) / 60 + float(f[8]) / 3600)
        CAT[key] = dict(ra=ra, dec=dec, pmra=float(f[9]), pmdec=float(f[10]), rv=float(f[11]), plx=float(f[12]))
    except ValueError:
        pass
res = {}
dev = {'swe': 0.0, 'sf': 0.0, 'ep': 0.0, 'ap': 0.0}; cnt = {k: 0 for k in dev}
cat_dev = 0.0
contact_bad = []
S = R.sf()
from skyfield.api import Star
from skyfield.framelib import ecliptic_frame
A = R.ap()
from astropy.coordinates import SkyCoord, GeocentricTrueEcliptic
import astropy.units as u
first = True
for ch in N['charts']:
    t = ch['utc']; jd = R.jd_of(t)
    ref = {}
    for st in ch['stars']['stars']:
        key = NAMES[st['ru']]
        (lon, lat, *_), nm, fl = swe.fixstar2_ut(key, jd, swe.FLG_SWIEPH)
        ref[st['ru']] = lon
        dev['swe'] = max(dev['swe'], abs(R.n180(st['lon'] - lon)) * 60); cnt['swe'] += 1
        c = CAT[key]
        if first:   # the site's J2000 RA/Dec against the catalogue
            pass
        if -2208988800000 < t < 2643000000000:
            s = Star(ra_hours=c['ra'] / 15, dec_degrees=c['dec'], ra_mas_per_year=c['pmra'], dec_mas_per_year=c['pmdec'], parallax_mas=max(c['plx'], 0.01), radial_km_per_s=c['rv'])
            ap_ = S['eph']['earth'].at(R.sf_time(t)).observe(s).apparent()
            la, lo, _ = ap_.frame_latlon(ecliptic_frame)
            dev['sf'] = max(dev['sf'], abs(R.n180(st['lon'] - lo.degrees)) * 60); cnt['sf'] += 1
        if st['ru'] in EPN:
            try:
                b = ephem.star(EPN[st['ru']]); d = R.ep_date(t); b.compute(d, epoch=d)
                lo = math.degrees(ephem.Ecliptic(ephem.Equatorial(b.g_ra, b.g_dec, epoch=d), epoch=d).lon)
                dev['ep'] = max(dev['ep'], abs(R.n180(st['lon'] - lo)) * 60); cnt['ep'] += 1
            except KeyError:
                pass
        tt = R.ap_time([t])[0]
        sc = SkyCoord(ra=c['ra'] * u.deg, dec=c['dec'] * u.deg, pm_ra_cosdec=c['pmra'] * u.mas / u.yr, pm_dec=c['pmdec'] * u.mas / u.yr, distance=(1000 / max(c['plx'], 0.01)) * u.pc, radial_velocity=c['rv'] * u.km / u.s, obstime=A['Time'](2451545.0, format='jd', scale='tt'), frame='icrs')
        lo = sc.apply_space_motion(new_obstime=tt).transform_to(GeocentricTrueEcliptic(equinox=tt, obstime=tt)).lon.deg
        dev['ap'] = max(dev['ap'], abs(R.n180(st['lon'] - lo)) * 60); cnt['ap'] += 1
    first = False
    # contacts with the SE longitudes, same 1.5° orb, same points
    pts = [p for p in ch['points'] if p['id'] != 'SNode'] + ch['angles']
    mine = sorted((s, p['id']) for s, l in ref.items() for p in pts if abs(R.n180(p['lon'] - l)) <= 1.5)
    site = sorted((c['star']['ru'], c['point']['id']) for c in ch['stars']['contacts'])
    if mine != site: contact_bad.append((ch['id'], [x for x in site if x not in mine], [x for x in mine if x not in site]))
# the site's own J2000 coordinates against sefstars (proper motion not applied by the site)
F = open(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'js', 'features.js'), encoding='utf-8').read()
import re
rows = re.findall(r"\['([^']+)', (\d+), (\d+), ([\d.]+), (-?\d+), (-?\d+), (\d+), '[^']*'\]", F)
for ru, h, m, s, dd, dm, ds in rows:
    ra = (int(h) + int(m) / 60 + float(s) / 3600) * 15
    sgn = -1 if dd.startswith('-') or dm.startswith('-') else 1
    dec = sgn * (abs(int(dd)) + abs(int(dm)) / 60 + int(ds) / 3600)
    c = CAT[NAMES[ru]]
    cat_dev = max(cat_dev, abs(ra - c['ra']) * 3600 * math.cos(math.radians(dec)), abs(dec - c['dec']) * 3600)
res = {'n_star_positions': cnt, 'max_dev_arcmin': {k: round(v, 2) for k, v in dev.items()}, 'site_J2000_vs_sefstars_arcsec': round(cat_dev, 2), 'n_rows': len(rows),
       'contact_mismatch': contact_bad}
json.dump(res, open(os.path.join(TMP, 'res_stars.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(res, indent=1, ensure_ascii=False))
