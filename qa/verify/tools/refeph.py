"""Independent ephemeris sources for the tool checks: Swiss Ephemeris, Skyfield (JPL DE421), PyEphem, Astropy.
All take Unix milliseconds (UTC as JavaScript counts it) and return apparent geocentric ecliptic longitudes of date
in degrees, rise/set moments in Unix ms, and so on. Each source is used as it comes, with its own defaults."""
import math, os, warnings
import numpy as np
warnings.filterwarnings('ignore')

EPHE = os.environ.get('SWE_EPHE', '/tmp/claude-0/-home-claude/3337e13a-b497-573b-b11c-0e8413777368/scratchpad/ephe')
import swisseph as swe
swe.set_ephe_path(EPHE)

DAY = 86400000.0
def jd_of(ms): return ms / DAY + 2440587.5
def ms_of(jd): return (jd - 2440587.5) * DAY
def n360(x): return x % 360.0
def n180(x):
    y = x % 360.0
    return y - 360.0 if y > 180 else y

SWE_ID = {'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY, 'Venus': swe.VENUS, 'Mars': swe.MARS, 'Jupiter': swe.JUPITER,
          'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE, 'Pluto': swe.PLUTO, 'Node': swe.TRUE_NODE, 'MeanNode': swe.MEAN_NODE,
          'Chiron': swe.CHIRON}

# ------------------------------------------------------------------ Swiss Ephemeris
def swe_lon(body, ms):
    r, _ = swe.calc_ut(jd_of(ms), SWE_ID[body], swe.FLG_SWIEPH | swe.FLG_SPEED)
    return r[0]
def swe_lonspeed(body, ms):
    r, _ = swe.calc_ut(jd_of(ms), SWE_ID[body], swe.FLG_SWIEPH | swe.FLG_SPEED)
    return r[0], r[3]
def swe_rise(body, ms, lat, lon, rise=True):
    """next rise (or set) after ms; upper limb, standard refraction (SE defaults)"""
    flag = swe.CALC_RISE if rise else swe.CALC_SET
    res, tret = swe.rise_trans(jd_of(ms), SWE_ID[body], flag, (lon, lat, 0.0), 1013.25, 10.0, swe.FLG_SWIEPH)
    return None if res != 0 else ms_of(tret[0])

# ------------------------------------------------------------------ Skyfield (DE421)
_sf = {}
def sf():
    if not _sf:
        from skyfield.api import Loader, wgs84
        from skyfield_data import get_skyfield_data_path
        from skyfield import almanac
        load = Loader(get_skyfield_data_path())
        ts = load.timescale(builtin=True)
        eph = load('de421.bsp')
        _sf.update(ts=ts, eph=eph, wgs84=wgs84, almanac=almanac)
    return _sf
SF_NAME = {'Sun': 'sun', 'Moon': 'moon', 'Mercury': 'mercury', 'Venus': 'venus', 'Mars': 'mars', 'Jupiter': 'jupiter barycenter',
           'Saturn': 'saturn barycenter', 'Uranus': 'uranus barycenter', 'Neptune': 'neptune barycenter', 'Pluto': 'pluto barycenter'}
def sf_time(ms):
    S = sf()
    return S['ts'].ut1_jd(np.asarray(ms, dtype=float) / DAY + 2440587.5)
def sf_lon(body, ms):
    from skyfield.framelib import ecliptic_frame
    S = sf(); t = sf_time(ms)
    e = S['eph']
    ap = e['earth'].at(t).observe(e[SF_NAME[body]]).apparent()
    lat, lon, _ = ap.frame_latlon(ecliptic_frame)   # true ecliptic and equinox of date
    return lon.degrees
def sf_rises(body, ms0, ms1, lat, lon, rise=True):
    S = sf(); e = S['eph']
    obs = e['earth'] + S['wgs84'].latlon(lat, lon)
    f = S['almanac'].find_risings if rise else S['almanac'].find_settings
    t, ok = f(obs, e[SF_NAME[body]], sf_time(ms0), sf_time(ms1))
    return [ms_of(x) for x, y in zip(t.ut1, ok) if y]
def sf_new_moons(ms0, ms1):
    S = sf(); t, y = S['almanac'].find_discrete(sf_time(ms0), sf_time(ms1), S['almanac'].moon_phases(S['eph']))
    return [ms_of(x) for x, k in zip(t.ut1, y) if k == 0]
def sf_illum(ms):
    S = sf(); e = S['eph']; t = sf_time(ms)
    return S['almanac'].fraction_illuminated(e, 'moon', t)

# ------------------------------------------------------------------ PyEphem
import ephem
EP_CLS = {'Sun': ephem.Sun, 'Moon': ephem.Moon, 'Mercury': ephem.Mercury, 'Venus': ephem.Venus, 'Mars': ephem.Mars, 'Jupiter': ephem.Jupiter,
          'Saturn': ephem.Saturn, 'Uranus': ephem.Uranus, 'Neptune': ephem.Neptune, 'Pluto': ephem.Pluto}
def ep_date(ms): return ephem.Date(jd_of(ms) - 2415020.0)
def ep_ms(d): return ms_of(float(d) + 2415020.0)
def ep_lon(body, ms):
    d = ep_date(ms); b = EP_CLS[body](); b.compute(d, epoch=d)
    # apparent geocentric RA/Dec of date → ecliptic of date
    return math.degrees(ephem.Ecliptic(ephem.Equatorial(b.g_ra, b.g_dec, epoch=d), epoch=d).lon)
def ep_rise(body, ms, lat, lon, rise=True):
    o = ephem.Observer(); o.lat = str(lat); o.lon = str(lon); o.elevation = 0; o.date = ep_date(ms); o.pressure = 1013.25; o.temp = 10
    b = EP_CLS[body]()
    try:
        return ep_ms(o.next_rising(b) if rise else o.next_setting(b))
    except (ephem.AlwaysUpError, ephem.NeverUpError):
        return None
def ep_next_new(ms): return ep_ms(ephem.next_new_moon(ep_date(ms)))
def ep_illum(ms):
    m = ephem.Moon(); m.compute(ep_date(ms)); return m.moon_phase

# ------------------------------------------------------------------ Astropy (built-in ephemeris, no downloads)
_ap = {}
def ap():
    if not _ap:
        from astropy.utils import iers
        iers.conf.auto_download = False
        iers.conf.iers_degraded_accuracy = 'warn'
        from astropy.time import Time
        import astropy.units as u
        from astropy.coordinates import get_body, GeocentricTrueEcliptic, EarthLocation, AltAz, solar_system_ephemeris
        solar_system_ephemeris.set('builtin')
        _ap.update(Time=Time, u=u, get_body=get_body, GTE=GeocentricTrueEcliptic, EL=EarthLocation, AltAz=AltAz)
    return _ap
def ap_time(ms):
    A = ap()
    ms = np.asarray(ms, dtype=float)
    jd = ms / DAY + 2440587.5
    dt = np.vectorize(swe.deltat)(jd)          # UT → TT with the same ΔT as SE (astropy has no ΔT before 1960)
    return A['Time'](jd + dt, format='jd', scale='tt')
def ap_lon(body, ms):
    A = ap(); t = ap_time(ms)
    c = A['get_body'](body.lower(), t)
    e = c.transform_to(A['GTE'](equinox=t))
    return np.asarray(e.lon.deg)
def ap_alt(body, ms, lat, lon):
    """geometric topocentric altitude (no refraction) and apparent radius in degrees"""
    A = ap(); u = A['u']; t = ap_time(ms)
    loc = A['EL'](lat=lat * u.deg, lon=lon * u.deg, height=0 * u.m)
    c = A['get_body'](body.lower(), t, loc)
    aa = c.transform_to(A['AltAz'](obstime=t, location=loc, pressure=0 * u.hPa))
    R = 696000.0 if body == 'Sun' else 1737.4
    rad = np.degrees(np.arcsin(R / np.asarray(c.distance.to(u.km).value)))
    return np.asarray(aa.alt.deg), rad
def ap_rise(body, ms_guess, lat, lon, rise=True, span_h=3.0):
    """refine a rise/set near ms_guess: geometric altitude of the upper limb = −34′ (standard refraction)"""
    ts = ms_guess + np.linspace(-span_h, span_h, 121) * 3600000.0
    alt, rad = ap_alt(body, ts, lat, lon)
    f = alt + rad + 34.0 / 60.0
    for i in range(len(ts) - 1):
        if (f[i] < 0) != (f[i + 1] < 0) and ((f[i + 1] > f[i]) == rise):
            a, b, fa = ts[i], ts[i + 1], f[i]
            for _ in range(25):
                m = (a + b) / 2
                al, r = ap_alt(body, [m], lat, lon); fm = al[0] + r[0] + 34.0 / 60.0
                if (fm < 0) == (fa < 0): a, fa = m, fm
                else: b = m
            return (a + b) / 2
    return None

# ------------------------------------------------------------------ helpers
LON = {'swe': swe_lon, 'sf': lambda b, ms: float(sf_lon(b, ms)), 'ep': ep_lon, 'ap': lambda b, ms: float(ap_lon(b, [ms])[0])}

def refine(f, ms, step_ms=60000.0, iters=6):
    """Newton/secant on f(ms) = 0 starting at ms (f continuous near the root)"""
    t = ms
    for _ in range(iters):
        f0 = f(t); f1 = f(t + step_ms)
        d = (f1 - f0) / step_ms
        if d == 0: break
        dt = -f0 / d
        t += dt
        if abs(dt) < 50: break
    return t
