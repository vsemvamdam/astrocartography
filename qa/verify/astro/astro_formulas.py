"""Independent textbook implementations for the QA (not ported from the site's code).

Houses are computed with vector geometry (great-circle intersections, Holden "Elements of House Division")
and, for Placidus, by root finding on the hour-angle condition; the ascendant is the intersection of the
ecliptic with the horizon that lies in the eastern half of the sky.
Angles in degrees. Frame: true equator and equinox of date; theta = RAMC (local apparent sidereal angle)."""
import math
import numpy as np

D2R, R2D = math.pi / 180, 180 / math.pi
n360 = lambda x: x % 360.0
n180 = lambda x: (x + 180.0) % 360.0 - 180.0


def _frame(theta, phi, eps):
    t, f, e = theta * D2R, phi * D2R, eps * D2R
    zen = np.array([math.cos(f) * math.cos(t), math.cos(f) * math.sin(t), math.sin(f)])
    east = np.array([-math.sin(t), math.cos(t), 0.0])
    north = np.cross(zen, east)                       # horizontal north
    k_ecl = np.array([0.0, -math.sin(e), math.cos(e)])
    ex, ey = np.array([1.0, 0, 0]), np.array([0, math.cos(e), math.sin(e)])
    return zen, east, north, k_ecl, ex, ey


def _lon(v, ex, ey):
    return n360(math.atan2(v @ ey, v @ ex) * R2D)


def _east_intersection(normal, k_ecl, east, ex, ey):
    d = np.cross(normal, k_ecl)
    if np.linalg.norm(d) < 1e-14:
        return None
    if d @ east < 0: d = -d
    return _lon(d, ex, ey)


def asc(theta, phi, eps):
    zen, east, north, k, ex, ey = _frame(theta, phi, eps)
    return _east_intersection(zen, k, east, ex, ey)


def mc(theta, eps):
    zen, east, north, k, ex, ey = _frame(theta, 0.0, eps)
    d = np.cross(east, k)
    t = theta * D2R
    if d @ np.array([math.cos(t), math.sin(t), 0]) < 0: d = -d
    return _lon(d, ex, ey)


def ecl_ra_dec(lam, eps):
    l, e = lam * D2R, eps * D2R
    v = np.array([math.cos(l), math.sin(l) * math.cos(e), math.sin(l) * math.sin(e)])
    return n360(math.atan2(v[1], v[0]) * R2D), math.asin(max(-1, min(1, v[2]))) * R2D


def regio_campanus(sys, theta, phi, eps):
    zen, east, north, k, ex, ey = _frame(theta, phi, eps)
    t = theta * D2R
    out = {}
    for h, step in ((11, 1), (12, 2), (2, 4), (3, 5)):
        if sys == 'R':     # equator point at hour angle −30°·step (east of the meridian)
            a = t + step * 30 * D2R
            p = np.array([math.cos(a), math.sin(a), 0.0])
        else:              # Campanus: prime vertical point 30°·step from the zenith toward the east
            A = step * 30 * D2R
            p = math.cos(A) * zen + math.sin(A) * east
        out[h] = _east_intersection(np.cross(north, p), k, east, ex, ey)
    return out


def _ad(dec, phi):
    x = math.tan(phi * D2R) * math.tan(dec * D2R)
    return None if abs(x) > 1 else math.asin(x) * R2D


def placidus(theta, phi, eps):
    """cusps 11, 12, 2, 3 by bracketing + bisection of g(λ) = H(λ) − H_target(λ) on the eastern ecliptic half"""
    m, a = mc(theta, eps), asc(theta, phi, eps)
    out = {}
    def g(lam, h):
        ra, dec = ecl_ra_dec(lam, eps)
        ad = _ad(dec, phi)
        if ad is None: return None
        dsa = 90 + ad; nsa = 180 - dsa
        H = n180(theta - ra)                          # hour angle, east negative
        tgt = {11: -dsa / 3, 12: -2 * dsa / 3, 2: -(dsa + nsa / 3), 3: -(dsa + 2 * nsa / 3)}[h]
        return n180(H - tgt)
    for h in (11, 12, 2, 3):
        # search between MC and ASC (houses 11, 12) or ASC and IC (houses 2, 3), zodiacal order
        lo, hi = (m, m + n360(a - m)) if h in (11, 12) else (a, a + n360(m + 180 - a))
        N = 720
        xs = [lo + (hi - lo) * i / N for i in range(N + 1)]
        root = None
        prev = None
        for x in xs:
            v = g(x, h)
            if v is None: prev = None; continue
            if prev is not None and (prev[1] == 0 or (prev[1] < 0) != (v < 0)) and abs(v - prev[1]) < 90:
                x0, x1, v0 = prev[0], x, prev[1]
                for _ in range(60):
                    xm = (x0 + x1) / 2; vm = g(xm, h)
                    if vm is None: break
                    if (v0 < 0) != (vm < 0): x1 = xm
                    else: x0, v0 = xm, vm
                root = n360((x0 + x1) / 2); break
            prev = (x, v)
        out[h] = root
    return out


def koch(theta, phi, eps):
    m = mc(theta, eps)
    ad = _ad(ecl_ra_dec(m, eps)[1], phi)
    if ad is None: return None
    dsa = 90 + ad
    return {11: asc(theta - 2 * dsa / 3, phi, eps), 12: asc(theta - dsa / 3, phi, eps),
            2: asc(theta + dsa / 3, phi, eps), 3: asc(theta + 2 * dsa / 3, phi, eps)}


def porphyry(a, m):
    q1, q2 = n360(a - m) / 3, n360(m + 180 - a) / 3
    return {11: n360(m + q1), 12: n360(m + 2 * q1), 2: n360(a + q2), 3: n360(a + 2 * q2)}


def houses(sys, theta, phi, eps):
    """12 cusps (index 0 = house 1) or None where the system is not defined"""
    a, m = asc(theta, phi, eps), mc(theta, eps)
    if sys in ('E', 'W'):
        start = a if sys == 'E' else math.floor(a / 30) * 30
        return [n360(start + 30 * i) for i in range(12)]
    if sys == 'P': q = placidus(theta, phi, eps)
    elif sys == 'K': q = koch(theta, phi, eps)
    elif sys in ('R', 'C'): q = regio_campanus(sys, theta, phi, eps)
    elif sys == 'O': q = porphyry(a, m)
    if q is None or any(v is None for v in q.values()): return None
    c = [None] * 12
    c[0], c[9], c[10], c[11], c[1], c[2] = a, m, q[11], q[12], q[2], q[3]
    for i in range(3, 9):
        c[i] = n360(c[(i + 6) % 12] + 180)
    return c


def altaz(ra, dec, lst, phi):
    """geometric (no refraction) altitude and azimuth from north through east"""
    H, d, f = (lst - ra) * D2R, dec * D2R, phi * D2R
    alt = math.asin(math.sin(f) * math.sin(d) + math.cos(f) * math.cos(d) * math.cos(H)) * R2D
    az = math.atan2(-math.cos(d) * math.sin(H), math.cos(f) * math.sin(d) - math.sin(f) * math.cos(d) * math.cos(H)) * R2D
    return alt, n360(az)
