"""Item 9: ACG.localToUtc / ACG.tzOffsetMin vs Python zoneinfo (system tzdata), pytz (own tzdata), dateutil (system files,
own parser) and ICU used directly (Intl 'longOffset', brute-force local->UTC).
python3 compare_tz.py <tz_cases.json> <tz_site.json> <out.json>"""
import json, sys, collections, datetime as dt
from zoneinfo import ZoneInfo as _ZoneInfo
import os as _os
# old names missing from the system tzdata (Ubuntu keeps them in tzdata-legacy) would silently come from the PyPI tzdata
# package, which has no backzone; resolve them through the link lines of the system tzdata.zi instead
_ZI = '/usr/share/zoneinfo'
_LINKS = {}
if _os.path.exists(_os.path.join(_ZI, 'tzdata.zi')):
    for _l in open(_os.path.join(_ZI, 'tzdata.zi')):
        if _l.startswith('L '): _t, _n = _l.split()[1:3]; _LINKS[_n] = _t
def ZoneInfo(tz):
    return _ZoneInfo(tz if _os.path.exists(_os.path.join(_ZI, tz)) else _LINKS.get(tz, tz))
import pytz
from dateutil import tz as dtz

C = json.load(open(sys.argv[1]))
R = json.load(open(sys.argv[2]))
UTC = dt.timezone.utc
EPOCH = dt.datetime(1970, 1, 1, tzinfo=UTC)
ms_of = lambda a: int(round((a - EPOCH).total_seconds() * 1000))


def zi_utc(y, m, d, h, mi, tz, fold=0):
    return ms_of(dt.datetime(y, m, d, h, mi, tzinfo=ZoneInfo(tz), fold=fold).astimezone(UTC))


def zi_solutions(y, m, d, h, mi, tz):
    """all UTC instants whose wall clock in tz is the given one (0: gap, 2: overlap)"""
    z = ZoneInfo(tz)
    out = set()
    for fold in (0, 1):
        a = dt.datetime(y, m, d, h, mi, tzinfo=z, fold=fold)
        u = a.astimezone(UTC)
        back = u.astimezone(z).replace(tzinfo=None)
        if back == dt.datetime(y, m, d, h, mi): out.add(ms_of(u))
    return sorted(out)


def pytz_utc(y, m, d, h, mi, tz):
    z = pytz.timezone(tz)
    naive = dt.datetime(y, m, d, h, mi)
    try:
        return ('ok', ms_of(z.localize(naive, is_dst=None).astimezone(UTC)))
    except pytz.exceptions.AmbiguousTimeError:
        return ('ambiguous', [ms_of(z.localize(naive, is_dst=True).astimezone(UTC)), ms_of(z.localize(naive, is_dst=False).astimezone(UTC))])
    except pytz.exceptions.NonExistentTimeError:
        return ('gap', None)


def du_utc(y, m, d, h, mi, tz):
    z = dtz.gettz(tz)
    a = dt.datetime(y, m, d, h, mi, tzinfo=z)
    return ms_of(a.astimezone(UTC)), dtz.datetime_exists(a), dtz.datetime_ambiguous(a)


res = {'local': collections.Counter(), 'local_mismatch': collections.defaultdict(list), 'offsets': collections.Counter(),
       'offset_mismatch': collections.defaultdict(list), 'gap': collections.Counter(), 'fold': collections.Counter(), 'manual': []}
for case, meta, site, icu in zip(C['local'], C['meta'], R['local'], R['icuLocal']):
    y, m, d, h, mi, tz, man = case
    if 'error' in site:
        res['local']['site_error'] += 1; res['local_mismatch']['site_error'].append(case); continue
    if meta['kind'] == 'manual':
        expect = ms_of(dt.datetime(y, m, d, h, mi, tzinfo=UTC)) - man * 60000
        res['manual'].append({'offset': man, 'site_minus_expected_s': (site['utc'] - expect) / 1000}); continue
    sols = zi_solutions(y, m, d, h, mi, tz)
    zi0 = zi_utc(y, m, d, h, mi, tz)
    p = pytz_utc(y, m, d, h, mi, tz)
    du, exists, amb = du_utc(y, m, d, h, mi, tz)
    res['local']['n'] += 1
    if len(sols) == 1:
        kind = 'unique'
        res['local']['unique'] += 1
        for name, v in (('zoneinfo', sols[0]), ('pytz', p[1] if p[0] == 'ok' else None), ('dateutil', du if exists and not amb else None),
                        ('icu_direct', icu[0] if icu and len(icu) == 1 else None)):
            if v is None:
                res['local'][name + '_disagrees_on_kind'] += 1
                if len(res['local_mismatch'][name + '_kind']) < 15: res['local_mismatch'][name + '_kind'].append({'case': case, 'p': p[0], 'icu': icu})
                continue
            dsec = (site['utc'] - v) / 1000
            if abs(dsec) > 0.5:
                res['local'][name + '_mismatch'] += 1
                if abs(dsec) > 30: res['local'][name + '_mismatch_over_30s'] += 1
                if len(res['local_mismatch'][name]) < 25: res['local_mismatch'][name].append({'case': case, 'site_minus_ref_s': dsec})
    elif len(sols) == 0:
        res['gap']['n'] += 1
        # what the site returns for a non-existent wall clock: compare with zoneinfo fold=0 (offset before the change)
        res['gap']['site_eq_zoneinfo_fold0'] += (abs(site['utc'] - zi0) < 500)
        res['gap']['site_eq_zoneinfo_fold1'] += (abs(site['utc'] - zi_utc(y, m, d, h, mi, tz, 1)) < 500)
        res['gap']['pytz_reports_gap'] += (p[0] == 'gap')
        res['gap']['icu_no_solution'] += (icu is not None and len(icu) == 0)
        # the site's returned offset vs the real offset at the returned instant
        real = ZoneInfo(tz).utcoffset(dt.datetime.fromtimestamp(site['utc'] / 1000, UTC).replace(tzinfo=None)) if False else \
            dt.datetime.fromtimestamp(site['utc'] / 1000, UTC).astimezone(ZoneInfo(tz)).utcoffset().total_seconds() / 60
        res['gap']['site_offset_differs_from_zone_at_result'] += (abs(real - site['offset']) > 0.3)
    else:
        res['fold']['n'] += 1
        res['fold']['site_first'] += (abs(site['utc'] - sols[0]) < 500)
        res['fold']['site_second'] += (abs(site['utc'] - sols[1]) < 500)
        res['fold']['pytz_ambiguous'] += (p[0] == 'ambiguous')
        res['fold']['icu_two'] += (icu is not None and len(icu) == 2)
        if not (abs(site['utc'] - sols[0]) < 500) and len(res['local_mismatch']['fold_not_first']) < 10:
            res['local_mismatch']['fold_not_first'].append({'case': case, 'site': site, 'sols': sols})

# offsets at instants
for (tz, ms), so, icu in zip(C['offsets'], R['offsets'], R['icuOffsets']):
    a = dt.datetime.fromtimestamp(ms / 1000, UTC)
    zi = a.astimezone(ZoneInfo(tz)).utcoffset().total_seconds() / 60
    pz = a.astimezone(pytz.timezone(tz)).utcoffset().total_seconds() / 60
    du = a.astimezone(dtz.gettz(tz)).utcoffset().total_seconds() / 60
    res['offsets']['n'] += 1
    for name, v in (('zoneinfo', zi), ('pytz', pz), ('dateutil', du), ('icu_direct', icu)):
        if v is None: continue
        dsec = (so - v) * 60
        if abs(dsec) > 0.5:
            res['offsets'][name + '_mismatch'] += 1
            if abs(dsec) > 7.5 + 1e-6: res['offsets'][name + '_mismatch_over_7.5s'] += 1
            if abs(dsec) > 30: res['offsets'][name + '_mismatch_over_30s'] += 1
            if len(res['offset_mismatch'][name]) < 30: res['offset_mismatch'][name].append({'tz': tz, 'utc': a.isoformat(), 'site_min': so, 'ref_min': v, 'diff_s': dsec})
    # between the references themselves (data versions)
    if abs(zi - pz) > 1e-6: res['offsets']['zoneinfo_vs_pytz_differ'] += 1
    if icu is not None and abs(zi - icu) > 1e-6:
        res['offsets']['zoneinfo_vs_icu_differ'] += 1
        if len(res['offset_mismatch']['zoneinfo_vs_icu']) < 30: res['offset_mismatch']['zoneinfo_vs_icu'].append({'tz': tz, 'utc': a.isoformat(), 'zi': zi, 'icu': icu})
out = {k: (dict(v) if isinstance(v, collections.Counter) else v) for k, v in res.items()}
out['local_mismatch'] = dict(res['local_mismatch']); out['offset_mismatch'] = dict(res['offset_mismatch'])
out['icu'] = R.get('icu')
json.dump(out, open(sys.argv[3], 'w'), indent=1)
for k in ('local', 'gap', 'fold', 'offsets'): print(k, dict(res[k]))
print('manual', res['manual'])
for k, v in out['local_mismatch'].items(): print('LOCAL', k, len(v), v[:4])
for k, v in out['offset_mismatch'].items(): print('OFF', k, len(v), v[:6])
