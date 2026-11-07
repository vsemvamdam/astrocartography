"""JPL Horizons (DE441) for the QA check: apparent geocentric RA/Dec and ecliptic-of-date longitude/latitude
of the Sun, Moon, planets, Chiron and the asteroids at the test charts' instants and 60 of the random ones, plus the
Moon's osculating geocentric orbit (node, perigee) on the J2000 ecliptic.
python3 qa/verify/horizons_fetch.py qa/verify/cases.json qa/verify/data/horizons.json"""
import json, sys, time, urllib.parse, urllib.request, datetime as dt

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
cases = json.load(open(sys.argv[1]))
def jd(iso):
    t = dt.datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return 2440587.5 + t.timestamp() / 86400
times = [c['utc'] for c in cases['charts']] + cases['random_utc'][::5]
jds = [jd(t) for t in times]
# Uranus, Neptune and Pluto by their system barycentres: the planet-centre ephemerides start on 1800-01-01 23:59 UT
# (the barycentre is within ~0.1″ of the planet seen from the Earth)
BODIES = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Mars': '499', 'Jupiter': '599', 'Saturn': '699', 'Uranus': '7',
          'Neptune': '8', 'Pluto': '9', 'Chiron': '2060;', 'Ceres': '1;', 'Pallas': '2;', 'Juno': '3;', 'Vesta': '4;',
          'Eros': '433;', 'Psyche': '16;', 'Amor': '1221;', 'Hygiea': '10;', 'Proserpina': '26;'}

def call(params):
    q = urllib.parse.urlencode(dict(format='json', **params))
    for k in range(5):
        try:
            with urllib.request.urlopen(API + '?' + q, timeout=120) as r:
                j = json.load(r)
            if 'error' in j: raise RuntimeError(j['error'])
            return j['result']
        except Exception as e:
            print('retry', params.get('COMMAND'), e); time.sleep(5 * (k + 1))
    raise SystemExit('Horizons failed for %s' % params.get('COMMAND'))

def rows(res):
    a, b = res.index('$$SOE'), res.index('$$EOE')
    return [ [x.strip() for x in line.split(',')] for line in res[a + 5:b].strip().splitlines() ]

out = {'source': 'JPL Horizons API (DE441), apparent geocentric, airless; quantities 2 (RA/Dec) and 31 (ecliptic of date)',
       'fetched': dt.datetime.utcnow().isoformat() + 'Z', 'times': times, 'bodies': {}}
for name, cmd in BODIES.items():
    res = call(dict(COMMAND="'%s'" % cmd, OBJ_DATA='NO', MAKE_EPHEM='YES', EPHEM_TYPE='OBSERVER', CENTER="'500@399'",
                    TLIST_TYPE='JD', TIME_TYPE='UT', TLIST=' '.join('%.8f' % x for x in jds), QUANTITIES="'2,31'",
                    ANG_FORMAT='DEG', EXTRA_PREC='YES', CSV_FORMAT='YES', APPARENT='AIRLESS'))
    data = []
    for r in rows(res):
        # date, (solar presence), (lunar presence), RA, Dec, ObsEcLon, ObsEcLat
        nums = []
        for x in r[1:]:
            try: nums.append(float(x))
            except ValueError: pass
        ra, dec, lon, lat = nums[:4]
        data.append({'ra': ra, 'dec': dec, 'lon': lon, 'lat': lat})
    assert len(data) == len(times), (name, len(data))
    out['bodies'][name] = data
    print(name, len(data), data[0])
# the Moon's osculating geocentric orbit on the J2000 ecliptic (OM = node, W = argument of perigee)
res = call(dict(COMMAND="'301'", OBJ_DATA='NO', MAKE_EPHEM='YES', EPHEM_TYPE='ELEMENTS', CENTER="'500@399'", REF_PLANE='ECLIPTIC',
                REF_SYSTEM='ICRF', TLIST_TYPE='JD', TIME_TYPE='UT', TLIST=' '.join('%.8f' % x for x in jds), CSV_FORMAT='YES', OUT_UNITS='KM-S'))
lines = rows(res)
# columns: JDTDB, Calendar, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
out['moon_elements_j2000'] = [{'EC': float(r[2]), 'IN': float(r[4]), 'OM': float(r[5]), 'W': float(r[6])} for r in lines]
json.dump(out, open(sys.argv[2], 'w'), indent=0)
print('moon elements', len(lines), out['moon_elements_j2000'][0])
