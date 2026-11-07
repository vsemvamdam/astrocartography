"""New moons of the lunar-day tool against Kerykeion's LunationFinderFactory (its own root search on Swiss Ephemeris)."""
import json, datetime, logging, os
logging.disable(logging.CRITICAL)
from kerykeion.lunations.factory import LunationFinderFactory
T = os.environ.get('TOOLS_TMP')
d = json.load(open(os.path.join(T, 'site_lunar.json')))
UTC = datetime.timezone.utc
iso = lambda t: datetime.datetime.fromtimestamp(t / 1000, UTC).strftime('%Y-%m-%dT%H:%M:%S')
dev = 0.0; n = 0; err = 0
for c in d['days']:
    for key in ('newMoon', 'nextNewMoon'):
        t = c['r'][key]
        try:
            L = LunationFinderFactory.from_iso_range(iso(t - 3 * 86400000), iso(t + 3 * 86400000)).model_dump()
        except Exception:
            err += 1; continue
        lst = [x for v in L.values() if isinstance(v, list) for x in v if x.get('phase') == 'new']
        if not lst: err += 1; continue
        ms = lambda x: datetime.datetime.strptime(x['iso_utc'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=UTC).timestamp() * 1000
        k = min(lst, key=lambda x: abs(ms(x) - t))
        dev = max(dev, abs(ms(k) - t) / 1000); n += 1
res = {'n': n, 'max_dev_s': round(dev, 1), 'errors': err}
json.dump(res, open(os.path.join(T, 'res_kery_nm.json'), 'w')); print(res)
