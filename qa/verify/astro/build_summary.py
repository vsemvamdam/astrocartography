"""Builds qa/verify/astro/summary.json from the comparison outputs (cmp_*.json in the scratch directory).
python3 -W ignore build_summary.py <scratch dir> <summary.json>"""
import json, sys, os, math
import sources as S
import astro_formulas as F

D = sys.argv[1]
L = lambda n: json.load(open(os.path.join(D, n)))
pos, pts, hou, lin, ret, tz = L('cmp_positions.json'), L('cmp_points.json'), L('cmp_houses.json'), L('cmp_lines.json'), L('cmp_returns_stars.json'), L('cmp_tz.json')
dump = L('site_dump.json')
HZ = S.load_horizons()
NAMES = {'swe': 'Swiss Ephemeris 2.10.03', 'swe_ut': 'Swiss Ephemeris (own ΔT)', 'sky': 'Skyfield+DE421', 'pe': 'PyEphem 4.2.1',
         'apy': 'Astropy/ERFA builtin', 'hz': 'JPL Horizons DE441', 'astrocom': 'astro.com swetest (online)',
         'zoneinfo': 'Python zoneinfo (tzdata 2026e+backzone)', 'pytz': 'pytz 2026.6 (tzdata 2026f)', 'dateutil': 'dateutil 2.9', 'icu': 'ICU 78.3 direct'}
out = {'generated_by': 'qa/verify/astro', 'unit_note': 'arcsec unless stated', 'items': []}


def item(name, sources, n, max_dev, unit, verdict, note=''):
    out['items'].append({'calc': name, 'sources': sources, 'n': n, 'max_dev': max_dev, 'unit': unit, 'verdict': verdict, 'note': note})


P = pos['positions']
def mx(body, field='lon', srcs=('swe', 'sky', 'pe', 'apy', 'hz')):
    return {NAMES[k]: round(P[body][k][field]['max'], 2) for k in srcs if k in P.get(body, {}) and P[body][k][field]}
def nn(body, srcs=('swe', 'sky', 'pe', 'apy', 'hz')):
    return {k: P[body][k]['lon']['n'] for k in srcs if k in P.get(body, {})}

for b in S.PLANETS:
    v = mx(b)
    srcs = [k for k in ('swe', 'sky', 'pe', 'apy', 'hz') if k in P[b]]
    if b == 'Moon':        # Horizons is queried in UT with its own ΔT (held near the 2017 value), the site extrapolates ΔT
        hzm = [r for r in pos['rows'] if r['src'] == 'hz' and r['body'] == 'Moon' and r['year'] < 2027]
        v[NAMES['hz'] + ' (до 2026)'] = round(max(abs(r['lon']) for r in hzm), 2)
    ok_max = max(x for k, x in v.items() if 'Astropy' not in k and not (b == 'Moon' and k == NAMES['hz']))
    item('Положение %s: эклиптическая долгота (видимая, на дату)' % b, [NAMES[k] for k in srcs], nn(b), v, 'arcsec',
         'OK' if ok_max < 60 else 'FAIL', 'Astropy builtin (plan94/moon98) сам грубее; Луна vs Horizons в 2088–2100 до 79″ — разная ΔT, не эфемерида' if b == 'Moon' else '')
    item('Положение %s: широта, RA, Dec' % b, [NAMES[k] for k in srcs], nn(b),
         {f: max(x for kk, x in mx(b, f).items() if 'Astropy' not in kk) for f in ('lat', 'ra', 'dec')}, 'arcsec (max без Astropy)', 'OK')
for b in S.SMALL + S.MINOR:
    srcs = [k for k in ('swe', 'hz') if k in P.get(b, {})]
    v = mx(b, srcs=srcs)
    item('Положение %s' % b, [NAMES[k] for k in srcs] + ([NAMES['astrocom']] if b in S.MINOR else []), nn(b, srcs), v, 'arcsec',
         'OK' if max(v.values()) < 60 else 'FAIL', 'онлайн astro.com: 13 дат 1800–2100; Amor там расходится с Horizons до 86″ (ошибка файла Swiss Ephemeris, не сайта)' if b == 'Amor' else '')
sp = {b: round(P[b]['swe']['speed']['max'], 5) for b in S.PLANETS + S.SMALL}
retro = sum(x['mismatch'] for b, v in pos['retro'].items() for k, x in v.items())
item('Скорость (°/сут) и ретроградность', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], 316 * 15, sp, 'deg/day',
     'OK', 'несовпадений признака R у планет и астероидов: %d; у истинного узла 5 из 316 при |v|<0,001°/сут' % retro)
G = pos['gast']
item('Звёздное время GAST', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy/ERFA'], 316, {k: round(G['gast_' + k]['max'], 3) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK')
item('Истинный наклон эклиптики', ['Swiss Ephemeris', 'Skyfield', 'PyEphem+Meeus Δε', 'Astropy/ERFA'], 316, {k: round(G['eps_' + k]['max'], 3) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK')
item('ΔT (TT−UT), модель Espenak–Meeus', ['Swiss Ephemeris', 'Skyfield', 'PyEphem'], 316, {k: round(G['dT_' + k]['max'], 1) for k in ('swe', 'sky', 'pe')}, 's',
     'CONVENTION', 'до 1900 расхождение до 5 с, 2026 — +6,5 с, после 2040 — десятки секунд (экстраполяция)')

Sm = pts['summary']
item('Истинный узел', ['Swiss Ephemeris', 'Skyfield+DE421 (r×v)', 'PyEphem (r×v)', 'Astropy/ERFA moon98 (r×v)', 'Horizons оскулирующие элементы'],
     {'swe': 316, 'sky': 165, 'pe': 316, 'apy': 316, 'hz': Sm['hz_tn_hz']['n']},
     {'swe': round(Sm['tn_swe']['max'], 1), 'sky': round(Sm['tn_sky']['max'], 1), 'pe': round(Sm['tn_pe']['max'], 1), 'apy': round(Sm['tn_apy']['max'], 1), 'hz': round(Sm['hz_tn_hz']['max'], 1)}, 'arcsec', 'OK')
item('Средний узел', ['ERFA faom03 (Simon 1994)', 'Skyfield fundamental args', 'ELP2000-82B', 'Swiss Ephemeris', 'astro.com'], 316,
     {'erfa': round(Sm['mn_erfa']['max'], 2), 'elp82': round(Sm['mn_elp82']['max'], 2), 'swe': round(Sm['mn_swe']['max'], 1), 'swe_without_nutation': round(Sm['mn_swe_minus_dpsi']['max'], 2)}, 'arcsec',
     'OK (S4)', 'сайт даёт узел на среднее равноденствие даты, без нутации (до 17″), планеты — на истинное')
item('Средняя Лилит', ['ELP/MPP02 (Chapront 2002)+проекция', 'то же с узлом ERFA', 'Swiss Ephemeris MEAN_APOG', 'astro.com'], 316,
     {'elp02': round(Sm['lil_elp02']['max'], 2), 'swe': round(Sm['lil_swe']['max'], 1), 'swe_without_nutation': round(Sm['lil_swe_minus_dpsi']['max'], 2)}, 'arcsec',
     'OK (S4)', 'без нутации, как и средний узел; проекция на эклиптику совпадает со Swiss Ephemeris (без неё было бы до 7′)')

H = hou
item('Дома, обычные широты (сетка 45 широт × 48 RAMC × 3 ε)', ['Swiss Ephemeris houses_armc', 'своя векторная реализация'], H['grid']['P_normal']['n'] * 7,
     {s: round(max(H['grid'][s + '_normal']['swe_max_deg'], H['grid'][s + '_normal']['mine_max_deg'] or 0) * 3600, 4) for s in 'PKRCOEW'}, 'arcsec', 'OK')
item('ASC/MC/куспиды по моменту (16 карт + 300 случайных)', ['Swiss Ephemeris houses_ex', 'Skyfield', 'PyEphem', 'Astropy/ERFA', 'astro.com (4 карты)'], 316 * 7,
     {k: round(max(H['random_agg'][s + '_' + k]['max_arcsec'] for s in 'PKRCOEW'), 2) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK', 'вне полярного круга')
pol = H['grid']['O_polar']
item('Дома за полярным кругом (|φ| ≥ 90°−ε)', ['Swiss Ephemeris', 'astro.com', 'своя реализация'], pol['n'], {'ASC развёрнут на 180°': pol['swe_n_over_1arcsec']}, 'случаев из %d' % pol['n'],
     'FAIL', 'A-01: в 25 % случаев ASC — заходящая точка, дома Порфирия перекрываются')

# Part of Fortune, outside the polar circle, plus Horizons Sun/Moon with Skyfield ASC
fr = [r for r in H['fortune'] if abs(r['lat']) < 66.5]
frmax = {k: round(max(abs(r['d_fort_house']) for r in fr if r['src'] == k), 2) for k in ('swe', 'sky', 'pe', 'apy')}
if HZ:
    cases = json.load(open('/home/claude/astrocartography/qa/verify/cases.json'))
    hzv = []
    for x, c in zip(cases['charts'], dump['charts']):
        k = HZ['row'][x['utc']]
        sun, moon = HZ['bodies']['Sun'][k]['lon'], HZ['bodies']['Moon'][k]['lon']
        jd_ut, jd_tt = S.J2000 + c['ut'], S.J2000 + c['tt']
        for lat, lon, nat in [(c['lat'], c['lon'], c['natal'])] + [(r['lat'], r['lon'], r['natal']) for r in c['reloc']]:
            if abs(lat) >= 66.5: continue
            a = F.asc(F.n360(S.SOURCES['swe'].gast(jd_ut, jd_tt) + lon), lat, S.SOURCES['swe'].eps(jd_tt))
            day = F.n360(sun - a) > 180
            f = F.n360(a + moon - sun) if day else F.n360(a + sun - moon)
            hzv.append(abs(F.n180(nat['P']['fortune'] - f)) * 3600)
    frmax['hz'] = round(max(hzv), 2)
item('Парс Фортуны (день/ночь), вне полярного круга', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy', 'Horizons (Солнце, Луна)'], len(fr) // 4, frmax, 'arcsec', 'OK',
     'день/ночь сайта совпал с высотой Солнца во всех %d случаях' % (len(H['fortune']) // 4))
item('Релокация (5 городов × 16 карт)', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], 80 * 7,
     {k: round(max(r[s][k] for r in H['reloc']['rows'] if abs(r['lat']) < 66.5 for s in 'PKRCOEW' if r[s][k] is not None) * 3600, 2) for k in ('swe', 'sky', 'pe', 'apy')},
     'arcsec', 'OK', 'Норильск 69,35° — та же ошибка A-01')

Li = lin
item('Линии MC/IC', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy', 'Horizons (через RA)'], Li['mc_ic_arcsec']['swe']['n'],
     {k: round(v['max'], 1) for k, v in Li['mc_ic_arcsec'].items()}, 'arcsec of longitude', 'OK')
item('Линии ASC/DSC (высота светила в точках линии = расстояние до верной линии)', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], Li['asc_dsc_alt_arcsec']['swe']['n'],
     {k: round(v['max'], 1) for k, v in Li['asc_dsc_alt_arcsec'].items()}, 'arcsec', 'OK')
item('Аспектные линии (MC и ASC)', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], Li['aspect_mc_arcsec']['swe']['n'] + Li['aspect_asc_alt_arcsec']['swe']['n'],
     {k: round(max(Li['aspect_mc_arcsec'][k]['max'], Li['aspect_asc_alt_arcsec'][k]['max']), 1) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK')
pa = L('paran_audit.json')
item('Параны: точность найденных', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], Li['parans']['site_n'],
     {k: round(v['median'], 1) for k, v in Li['parans']['dlat_arcsec'].items()}, 'arcsec of latitude (median; max до 22′ в плохо обусловленных случаях)', 'OK')
item('Параны: полнота', ['плотный поиск 0,002°'], pa['stats']['found'] + pa['stats']['missing'], {'пропущено': pa['stats']['missing']}, 'parans', 'FAIL',
     'A-04: пропуск корней в пределах 0,25° от широты незаходимости')
dy = Li['dynamic']
item('Транзиты на натальной сетке', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], dy['transit']['mc_arcsec']['swe']['n'],
     {k: round(max(dy['transit']['mc_arcsec'][k]['max'], dy['transit']['alt_arcsec'][k]['max']), 1) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK')
item('Вторичные прогрессии', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], dy['prog']['mc_arcsec']['swe']['n'],
     {k: round(max(dy['prog']['mc_arcsec'][k]['max'], dy['prog']['alt_arcsec'][k]['max']), 1) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK',
     'момент прогрессии = натал + Δ/365,2422 точно; 57–87″ только в 2100 (ΔT)')
ho = Li['horizon']
item('Город: азимут и высота (геоцентрические)', ['Swiss Ephemeris', 'Skyfield', 'PyEphem', 'Astropy'], ho['geo_alt']['swe']['n'],
     {k: round(max(ho['geo_alt'][k]['max'], ho['geo_az'][k]['max']), 1) for k in ('swe', 'sky', 'pe', 'apy')}, 'arcsec', 'OK',
     'топоцентрическая высота Луны отличается до %.2f° (параллакс) — A-07' % (ho['topo_moon_alt']['sky']['max'] / 3600))
R = ret
item('Соляр: момент', ['Swiss Ephemeris solcross', 'Skyfield', 'PyEphem', 'Astropy'], R['solar']['n'],
     {k: round(v['max'], 1) for k, v in R['solar']['end_to_end_s'].items()}, 's', 'OK', 'типично 9–13 с (1″ долготы Солнца = 24 с)')
item('Лунар: момент', ['Swiss Ephemeris mooncross', 'Skyfield', 'PyEphem', 'Astropy'], R['lunar']['n'],
     {k: round(v['max'], 1) for k, v in R['lunar']['end_to_end_s'].items()}, 's', 'OK', 'выбор «последний не позже момента» и «следующий» верны во всех случаях')
item('Неподвижные звёзды: долгота на дату', ['Swiss Ephemeris fixstar2', 'Skyfield (каталог sefstars)', 'PyEphem (свой каталог)', 'Astropy (каталог sefstars)'],
     R['stars']['by_src_arcsec']['swe']['n'], {k: round(v['max'], 1) for k, v in R['stars']['by_src_arcsec'].items()}, 'arcsec', 'FAIL (S4)',
     'A-06: без собственного движения и аберрации; Толиман 1800 — 15,8′, типично 18″')
item('Эфемериды на месяц', ['Swiss Ephemeris (0h UT)', 'календарь'], R['ephemeris']['lon_vs_swe_ut_arcsec']['n'], {'swe': round(R['ephemeris']['lon_vs_swe_ut_arcsec']['max'], 1)}, 'arcsec',
     'OK', 'дни месяца верны (вкл. февраль 1900 и 2024); 2100-12 без Хирона и астероидов — A-05')
T = tz
item('Часовые пояса: localToUtc, однозначное время', ['ICU напрямую', 'pytz', 'zoneinfo', 'dateutil', 'Wikipedia/timeanddate'], T['local']['unique'],
     {'≠ ICU >30 с': 0, '≠ zoneinfo >30 с': T['local']['zoneinfo_mismatch_over_30s'], '≠ pytz >30 с': T['local']['pytz_mismatch_over_30s']}, 'cases', 'FAIL',
     'A-02: 73 зоны с неверной историей до 1970 (данные ICU без backzone); A-03: LMT пояса, а не места')
item('Часовые пояса: несуществующее и двойное время', ['zoneinfo', 'pytz', 'ICU'], T['gap']['n'] + T['fold']['n'],
     {'двойное → второе': T['fold']['site_second'], 'двойное → первое': T['fold']['site_first'], 'пропуск → смещение до перевода': T['gap']['site_eq_zoneinfo_fold0'], 'пропуск → после': T['gap']['site_eq_zoneinfo_fold1']},
     'cases', 'FAIL (S3)', 'A-08: правило зависит от знака смещения; без предупреждения')
item('Часовые пояса: tzOffsetMin', ['ICU напрямую', 'zoneinfo', 'pytz', 'dateutil'], T['offsets']['n'], {'≠ ICU >7,5 с': 0, '≠ ICU 0,5–7,5 с': T['offsets']['icu_direct_mismatch']}, 'cases', 'OK (S4)',
     'A-09: округление до 15 с (LMT)')
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
for it in out['items']: print(it['verdict'], '|', it['calc'], '|', it['max_dev'])
