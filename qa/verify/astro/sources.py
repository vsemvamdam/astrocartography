"""Independent reference sources for the AstroSky QA (area A, astronomy).

Every source returns, for a body at an instant, apparent geocentric coordinates referred to the true
equator / true ecliptic and equinox of date:  lon, lat (deg), ra, dec (deg), and where available speed (deg/day);
plus Greenwich apparent sidereal time (deg) and the true obliquity (deg).

Time: the comparison is made at the same TT as the site (jd_tt = J2000 + site tt) so that the
ephemeris theories are compared and not the ΔT models; sidereal time is taken at UT1 = the site's UT.
The ΔT models are compared separately (deltat()).

  swe   Swiss Ephemeris 2.10.03 (sepl_18/semo_18/seas_18, DE431-based)
  sky   Skyfield 1.55 + NASA JPL DE421 (1899-07-29 … 2053-10-09)
  pe    PyEphem 4.2.1 (VSOP87 / ELP2000 / libastro)
  apy   Astropy 8.0.2 + ERFA, built-in ephemeris (epv00, moon98, plan94; no Pluto)
  hz    JPL Horizons (DE441), only at the instants of qa/verify/data/horizons.json
"""
import math, os, warnings
import numpy as np

warnings.filterwarnings('ignore')
EPHE = os.environ.get('SWE_EPHE', '/tmp/claude-0/-home-claude/3337e13a-b497-573b-b11c-0e8413777368/scratchpad/ephe')
J2000 = 2451545.0
D2R, R2D = math.pi / 180, 180 / math.pi
n360 = lambda x: x % 360.0
def n180(x):
    y = (x + 180.0) % 360.0 - 180.0
    return y

PLANETS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
SMALL = ['Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta']
MINOR = ['Eros', 'Psyche', 'Amor', 'Hygiea', 'Proserpina']


def ecl_from_eq(ra, dec, eps):
    """apparent RA/Dec of date -> ecliptic of date with the true obliquity (degrees)"""
    a, d, e = ra * D2R, dec * D2R, eps * D2R
    lon = math.atan2(math.sin(a) * math.cos(e) + math.tan(d) * math.sin(e), math.cos(a)) * R2D
    lat = math.asin(math.sin(d) * math.cos(e) - math.cos(d) * math.sin(e) * math.sin(a)) * R2D
    return n360(lon), lat


def eq_from_ecl(lon, lat, eps):
    l, b, e = lon * D2R, lat * D2R, eps * D2R
    dec = math.asin(math.sin(b) * math.cos(e) + math.cos(b) * math.sin(e) * math.sin(l)) * R2D
    ra = math.atan2(math.sin(l) * math.cos(e) - math.tan(b) * math.sin(e), math.cos(l)) * R2D
    return n360(ra), dec


# ----------------------------------------------------------------------------- Swiss Ephemeris
import swisseph as swe
swe.set_ephe_path(EPHE)
SWE_ID = {'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY, 'Venus': swe.VENUS, 'Mars': swe.MARS, 'Jupiter': swe.JUPITER,
          'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE, 'Pluto': swe.PLUTO, 'Chiron': swe.CHIRON,
          'Ceres': swe.CERES, 'Pallas': swe.PALLAS, 'Juno': swe.JUNO, 'Vesta': swe.VESTA,
          'MeanNode': swe.MEAN_NODE, 'TrueNode': swe.TRUE_NODE, 'MeanApog': swe.MEAN_APOG}
SWFLG = swe.FLG_SWIEPH | swe.FLG_SPEED


class Swe:
    name = 'Swiss Ephemeris 2.10.03'
    def pos(self, body, jd_ut, jd_tt, native_ut=False):
        ipl = SWE_ID[body]
        if native_ut:
            x, f = swe.calc_ut(jd_ut, ipl, SWFLG); q, _ = swe.calc_ut(jd_ut, ipl, SWFLG | swe.FLG_EQUATORIAL)
        else:
            x, f = swe.calc(jd_tt, ipl, SWFLG); q, _ = swe.calc(jd_tt, ipl, SWFLG | swe.FLG_EQUATORIAL)
        if (f & swe.FLG_SWIEPH) == 0 and body not in ('MeanNode', 'TrueNode', 'MeanApog'):
            raise RuntimeError('swe fell back to Moshier for %s (flag %d)' % (body, f))
        return {'lon': x[0], 'lat': x[1], 'speed': x[3], 'ra': q[0], 'dec': q[1], 'dist': x[2]}
    def eps(self, jd_tt):
        return swe.calc(jd_tt, swe.ECL_NUT, 0)[0][0]
    def nut(self, jd_tt):
        x = swe.calc(jd_tt, swe.ECL_NUT, 0)[0]
        return {'tobl': x[0], 'mobl': x[1], 'dpsi': x[2], 'deps': x[3]}
    def gast(self, jd_ut, jd_tt):
        return swe.sidtime(jd_ut) * 15.0
    def deltat(self, jd_ut):
        return swe.deltat(jd_ut) * 86400


# ----------------------------------------------------------------------------- Skyfield + DE421
from skyfield_data import get_skyfield_data_path
from skyfield.api import Loader
from skyfield.framelib import ecliptic_frame
from skyfield import nutationlib
_load = Loader(get_skyfield_data_path())
_ts = _load.timescale(builtin=True)
_eph = _load('de421.bsp')
SKY_ID = {'Sun': 'sun', 'Moon': 'moon', 'Mercury': 'mercury', 'Venus': 'venus', 'Mars': 'mars', 'Jupiter': 'jupiter barycenter',
          'Saturn': 'saturn barycenter', 'Uranus': 'uranus barycenter', 'Neptune': 'neptune barycenter', 'Pluto': 'pluto barycenter'}
SKY_RANGE = (2414864.5 + 1, 2471184.5 - 1)


class Sky:
    name = 'Skyfield 1.55 + JPL DE421'
    earth = _eph['earth']
    def ok(self, jd_tt):
        return SKY_RANGE[0] < jd_tt < SKY_RANGE[1]
    def _one(self, body, jd_tt):
        t = _ts.tt_jd(jd_tt)
        app = self.earth.at(t).observe(_eph[SKY_ID[body]]).apparent()
        ra, dec, _ = app.radec(epoch='date')
        lat, lon, dist = app.frame_latlon(ecliptic_frame)
        return {'lon': lon.degrees, 'lat': lat.degrees, 'ra': ra._degrees, 'dec': dec.degrees, 'dist': dist.au}
    def pos(self, body, jd_ut, jd_tt, speed=True):
        p = self._one(body, jd_tt)
        if speed:
            a, b = self._one(body, jd_tt - 0.005), self._one(body, jd_tt + 0.005)
            p['speed'] = n180(b['lon'] - a['lon']) / 0.01
        return p
    def geo_state_moon_ecl_date(self, jd_tt):
        """geometric geocentric Moon position+velocity in the true ecliptic of date (au, au/day)"""
        t = _ts.tt_jd(jd_tt)
        r = (_eph['moon'] - _eph['earth']).at(t)
        R = ecliptic_frame.rotation_at(t)
        return R @ r.position.au, R @ r.velocity.au_per_d
    def eps(self, jd_tt):
        t = _ts.tt_jd(jd_tt)
        return t._mean_obliquity_radians * R2D + t._nutation_angles_radians[1] * R2D
    def gast(self, jd_ut, jd_tt):
        return _ts.ut1_jd(jd_ut).gast * 15.0
    def deltat(self, jd_ut):
        return float(_ts.ut1_jd(jd_ut).delta_t)
    def mean_node(self, jd_tt):
        t = _ts.tt_jd(jd_tt)
        fa = nutationlib.fundamental_arguments((jd_tt - J2000) / 36525.0)
        return n360(fa[4] * R2D)


# ----------------------------------------------------------------------------- PyEphem
import ephem
PE_CLS = {'Sun': ephem.Sun, 'Moon': ephem.Moon, 'Mercury': ephem.Mercury, 'Venus': ephem.Venus, 'Mars': ephem.Mars,
          'Jupiter': ephem.Jupiter, 'Saturn': ephem.Saturn, 'Uranus': ephem.Uranus, 'Neptune': ephem.Neptune, 'Pluto': ephem.Pluto}


def meeus_nutation(jd_tt):
    """IAU 1980 nutation, Meeus ch. 22 short series (Δψ, Δε in degrees) — only to turn PyEphem's mean obliquity into the true one"""
    T = (jd_tt - J2000) / 36525
    om = (125.04452 - 1934.136261 * T) * D2R
    L = (280.4665 + 36000.7698 * T) * D2R
    Lp = (218.3165 + 481267.8813 * T) * D2R
    dpsi = (-17.20 * math.sin(om) - 1.32 * math.sin(2 * L) - 0.23 * math.sin(2 * Lp) + 0.21 * math.sin(2 * om)) / 3600
    deps = (9.20 * math.cos(om) + 0.57 * math.cos(2 * L) + 0.10 * math.cos(2 * Lp) - 0.09 * math.cos(2 * om)) / 3600
    return dpsi, deps


class PE:
    name = 'PyEphem 4.2.1 (libastro: VSOP87, ELP2000)'
    def _date(self, jd_tt):
        d = jd_tt - 2415020.0
        for _ in range(3):
            d = jd_tt - 2415020.0 - ephem.delta_t(ephem.Date(d)) / 86400
        return ephem.Date(d)
    def _one(self, body, jd_tt):
        d = self._date(jd_tt)
        b = PE_CLS[body](); b.compute(d)
        ra, dec = float(b.g_ra) * R2D, float(b.g_dec) * R2D
        lon, lat = ecl_from_eq(ra, dec, self.eps(jd_tt))
        return {'lon': lon, 'lat': lat, 'ra': ra, 'dec': dec}
    def pos(self, body, jd_ut, jd_tt, speed=True):
        p = self._one(body, jd_tt)
        if speed:
            a, b = self._one(body, jd_tt - 0.005), self._one(body, jd_tt + 0.005)
            p['speed'] = n180(b['lon'] - a['lon']) / 0.01
        return p
    def mobl(self, jd_tt):
        d = self._date(jd_tt)
        return -float(ephem.Ecliptic(ephem.Equatorial(math.pi / 2, 0, epoch=d), epoch=d).lat) * R2D
    def eps(self, jd_tt):
        return self.mobl(jd_tt) + meeus_nutation(jd_tt)[1]
    def gast(self, jd_ut, jd_tt):
        o = ephem.Observer(); o.lon = '0'; o.lat = '0'; o.elevation = 0; o.pressure = 0
        o.date = ephem.Date(jd_ut - 2415020.0)
        return float(o.sidereal_time()) * R2D
    def deltat(self, jd_ut):
        return ephem.delta_t(ephem.Date(jd_ut - 2415020.0))


# ----------------------------------------------------------------------------- Astropy / ERFA
import erfa
from astropy.utils import iers
iers.conf.auto_download = False
iers.conf.auto_max_age = None
try:
    iers.conf.iers_degraded_accuracy = 'ignore'
except Exception:
    pass
from astropy.time import Time
from astropy.coordinates import get_body, solar_system_ephemeris, GeocentricTrueEcliptic, TETE
import astropy.units as u
solar_system_ephemeris.set('builtin')
APY_ID = {'Sun': 'sun', 'Moon': 'moon', 'Mercury': 'mercury', 'Venus': 'venus', 'Mars': 'mars', 'Jupiter': 'jupiter',
          'Saturn': 'saturn', 'Uranus': 'uranus', 'Neptune': 'neptune'}


class Apy:
    name = 'Astropy 8.0.2 / ERFA (built-in ephemeris)'
    def _one(self, body, jd_tt):
        t = Time(jd_tt, format='jd', scale='tt')
        g = get_body(APY_ID[body], t)
        e = g.transform_to(GeocentricTrueEcliptic(equinox=t, obstime=t))
        q = g.transform_to(TETE(obstime=t))
        return {'lon': e.lon.deg, 'lat': e.lat.deg, 'ra': q.ra.deg, 'dec': q.dec.deg}
    def pos(self, body, jd_ut, jd_tt, speed=True):
        p = self._one(body, jd_tt)
        if speed:
            a, b = self._one(body, jd_tt - 0.005), self._one(body, jd_tt + 0.005)
            p['speed'] = n180(b['lon'] - a['lon']) / 0.01
        return p
    def eps(self, jd_tt):
        return (erfa.obl06(jd_tt, 0.0) + erfa.nut06a(jd_tt, 0.0)[1]) * R2D
    def gast(self, jd_ut, jd_tt):
        return erfa.gst06a(jd_ut, 0.0, jd_tt, 0.0) * R2D
    def mean_node(self, jd_tt):
        return n360(erfa.faom03((jd_tt - J2000) / 36525) * R2D)
    def deltat(self, jd_ut):
        return None
    def moon_state_ecl_date(self, jd_tt):
        """ERFA moon98 geometric geocentric Moon (GCRS-ish, mean J2000) -> true ecliptic of date, finite-difference velocity"""
        def r(jd):
            pv = erfa.moon98(jd, 0.0)
            return pv[0], pv[1]
        p, v = r(jd_tt)
        rbpn = erfa.pnm06a(jd_tt, 0.0)            # GCRS -> true equator & equinox of date
        eps = self.eps(jd_tt) * D2R
        Rx = np.array([[1, 0, 0], [0, math.cos(eps), math.sin(eps)], [0, -math.sin(eps), math.cos(eps)]])
        M = Rx @ rbpn
        return M @ np.array(p), M @ np.array(v)


SOURCES = {'swe': Swe(), 'sky': Sky(), 'pe': PE(), 'apy': Apy()}


# ----------------------------------------------------------------------------- Horizons
import json
HZ_PATH = os.environ.get('HZ_JSON', '/home/claude/astrocartography/qa/verify/data/horizons.json')
def load_horizons():
    """horizons.json; adds HZ['row'] = {iso time: row index}.
    Horizons returns a TLIST ephemeris sorted by time, not in the order of `times` (qa/verify/horizons_fetch.py keeps
    the request order in `times`), so row k belongs to the k-th time in chronological order."""
    for p in (HZ_PATH, '/tmp/claude-0/-home-claude/3337e13a-b497-573b-b11c-0e8413777368/scratchpad/astro/horizons.json'):
        if os.path.exists(p):
            hz = json.load(open(p))
            hz['row'] = {iso: k for k, iso in enumerate(sorted(hz['times']))}
            return hz
    return None
