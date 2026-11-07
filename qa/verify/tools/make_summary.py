"""Collects the res_*.json of the checks into qa/verify/tools/summary.json (one entry per calculator)."""
import json, os
T = os.environ.get('TOOLS_TMP')
L = lambda n: json.load(open(os.path.join(T, f'res_{n}.json')))
h, v, lu, d, k, st, cy, a, ho, sp, ci, bn, d30, knm = (L(x) for x in ('hours', 'voc', 'lunar', 'dign', 'kery', 'stars', 'cycles', 'aspects', 'horary', 'sport', 'cities', 'bio_num', 'deg30', 'kery_nm'))
S = []
def add(name, fn, sources, n, max_dev, unit, tol, verdict, bugs=(), note=''):
    S.append(dict(calculator=name, function=fn, sources=sources, n=n, max_dev=max_dev, unit=unit, tolerance=tol, verdict=verdict, bugs=list(bugs), note=note))
add('Планетарные часы: восход, заход, следующий восход', 'FEAT.planetaryHours', ['Swiss Ephemeris', 'Skyfield DE421', 'PyEphem', 'Astropy', 'Kerykeion'],
    {'swe': h['n'], 'sf': 193, 'ep': h['n'], 'ap': h['n'], 'kery': k['hours']['n'], 'polar': h['polar_site']},
    dict(h['max_dev_s'], kery=k['hours']['max_dev_s']), 's', 120, 'OK')
add('Планетарные часы: управитель дня и 24 часов', 'FEAT.planetaryHours', ['flatlib planetarytime', 'Kerykeion', 'халдейский порядок (Лилли)'],
    {'flatlib': h['ruler_cases'], 'kery': k['hours']['n']}, {'mismatch': len(h['ruler_bad']) + len(k['hours']['ruler_mismatch'])}, 'случаев', 0, 'OK')
add('Луна без курса', 'FEAT.voidOfCourse', ['Swiss Ephemeris (полный пересчёт)', 'Skyfield DE421', 'PyEphem', 'Astropy', 'Kerykeion (классические планеты)'],
    dict(v['count'], kery=k['voc']['n']), {s: max(x) for s, x in v['max_dev_s_start_end'].items()} | {'kery': max(k['voc']['max_dev_s_start_end']), 'last_aspect_mismatch': v['n_mismatch'] + k['voc']['n_mismatch']}, 's', 180, 'OK')
add('Лунные дни: новолуния', 'FEAT.lunarDays', ['Swiss Ephemeris', 'Skyfield DE421', 'PyEphem', 'Astropy', 'Kerykeion'],
    dict(lu['count']['nm'], kery=knm['n']), dict(lu['max_dev_s']['nm'], kery=knm['max_dev_s']), 's', 120, 'OK')
add('Лунные дни: восходы Луны и номер дня', 'FEAT.lunarDays', ['Swiss Ephemeris', 'Skyfield DE421', 'PyEphem', 'Astropy'],
    lu['count']['rise'], lu['max_dev_s']['rise'], 's', 300, 'ОШИБКА (высокие широты)', ['B-02'], 'на широтах выше ~62° список лунных дней обрывается')
add('Фаза Луны (освещённость)', 'moonPhase (tools-view.js)', ['Swiss Ephemeris pheno_ut', 'Skyfield', 'PyEphem', 'Astropy'], lu['count']['ill'], lu['max_dev_s']['ill'], 'п. п.', 1.5, 'OK')
add('Вход Луны в знак', 'moonIngress (tools-view.js)', ['Swiss Ephemeris', 'Skyfield DE421', 'PyEphem', 'Astropy'], lu['count']['ing'], lu['max_dev_s']['ing'], 's', 180, 'OK')
tf = d['terms_faces']['mismatch_half_degrees']
add('Термы, фасы, триплицитеты, обители', 'FEAT.termRuler/faceRuler, NATAL.dignity, HORARY.rulersAt', ['flatlib tables.py', 'Astrolog 7 calc.cpp/data.cpp', 'Kerykeion dignities', 'Лилли, CA с. 104', 'реализация здесь'],
    {'half_degrees': 720}, {'egy_flatlib': tf['egy_flatlib'], 'egy_astrolog': tf['egy_astrolog'], 'egy_kery': k['terms']['mismatch'], 'faces': tf['face_flatlib'] + tf['face_astrolog'], 'lilly_CA': tf['lilly_cA'], 'lilly_astrolog': tf['lilly_astrolog_ptolemy'], 'lilly_flatlib': tf['lilly_flatlib'], 'vs_tetrabiblos(школа)': tf['lilly_vs_tetrabiblos']}, 'полуградусов', 0, 'OK', note='flatlib LILLY_TERMS: опечатка в Рыбах (Марс до 25°); сайт совпадает с Лилли и Astrolog')
add('Достоинства по Лилли, альмутен, градусы', 'FEAT.dignityTable, FEAT.degreeRulers, HORARY.essential', ['flatlib (таблицы и баллы)', 'реализация здесь по Лилли'],
    {'planets': d['dignity_table']['n_planets'], 'degree_rulers': d['degree_rulers']['n'], 'horary_essential': d['horary_essential']['n']},
    {'mismatch': len(d['dignity_table']['total_mismatch']) + len(d['dignity_table']['almuten_mismatch']) + len(d['dignity_table']['almuten_point_mismatch']) + d['degree_rulers']['mismatch'] + d['horary_essential']['mismatch']}, 'случаев', 0, 'OK')
add('Диспозиторы', 'FEAT.dispositors', ['реализация здесь'], d['dispositors']['n_charts'], {'mismatch': len(d['dispositors']['mismatch'])}, 'карт', 0, 'OK', note='один источник: правило тривиально')
add('Арабские жребии', 'FEAT.lots', ['flatlib arabicparts.py (7 жребиев)', 'Astrolog 7 ai[] (4 жребия)', 'Павел Александрийский'], d['lots']['n'], d['lots']['max_dev_deg'], '°', 1e-9, 'OK')
add('Неподвижные звёзды', 'FEAT.starContacts', ['Swiss Ephemeris fixstar2', 'Skyfield Star', 'PyEphem stars', 'Astropy SkyCoord'], st['n_star_positions'], st['max_dev_arcmin'], '′', 30, 'OK (S4)', ['B-06'], f"контакты в орбе 1,5°: {len(st['contact_mismatch'])} расхождения на 16 карт")
add('Тридцатиградусник', 'renderDeg30 (tools-view.js)', ['реализация здесь (круговая шкала)'], d30['pairs'], {'missed_pairs': len(d30['missed'])}, 'пар', 0, 'ОШИБКА', ['B-04'])
add('Профекции', 'CYCLES.profections', ['реализация здесь', 'Kerykeion ProfectionsFactory (целые знаки)'], cy['profections']['n'], {'mismatch': len(cy['profections']['mismatch']), 'crash': len(cy['profections']['crash_cases']), 'kery_mismatch': len(k['profections']['mismatch'])}, 'случаев', 0, 'ОШИБКА', ['B-01'], 'kery_mismatch — Тромсё: ASC сайта на 180° от Swiss Ephemeris (вопрос к проверке домов)')
tr = cy['transits']
add('Календарь транзитов: точные даты', 'CYCLES.transitCalendar', ['Swiss Ephemeris (полный пересчёт)', 'Skyfield DE421', 'PyEphem', 'Astropy'], tr['count'], tr['max_residual_arcsec'], '″ (невязка аспекта в момент сайта)', 60, 'OK', note=f"пропущено {tr['n_missing']}, лишних {tr['n_extra']}")
add('Календарь транзитов: проходы и период в орбе 1°', 'CYCLES.transitCalendar', ['Swiss Ephemeris'], tr['window_n'], {'pass_mismatch': tr['n_pass_mismatch'], 'window_days': tr['window_max_dev_days']}, 'случаев / дни', '±2 дня', 'ОШИБКА', ['B-03'])
lf = cy['life']
add('Циклы жизни', 'CYCLES.lifeCycles', ['Swiss Ephemeris (полный пересчёт)', 'Skyfield DE421', 'PyEphem', 'Astropy'], lf['count'], lf['max_residual_arcsec'], '″', 60, 'OK (S4)', ['B-09', 'B-10'], f"узлы: {len(lf['pass_mismatch'])} расхождения числа проходов, {len(lf['missing_on_site'])} сдвига даты > 5 дней")
add('Нумерология', 'CYCLES.numerology', ['реализация здесь по правилам', 'таблица Хейро (халдейская)', 'пример психоматрицы (Халва Медиа, 25.08.1990)'], bn['num']['n'], {'mismatch': bn['num']['n_mismatch']}, 'случаев', 0, 'OK', note='расхождения школ: число пути и личный год с мастер-числами')
add('Биоритмы', 'bioVal/bioCrit (tools-view.js)', ['формула sin(2πt/P) (Википедия, Томмен)', 'реализация здесь'], bn['bio']['n_days'], {'value': bn['bio']['max_value_dev'], 'crit_mismatch': bn['bio']['crit_mismatch_vs_zero_in_day']}, 'доля / дни', 1e-12, 'OK (S4)', ['B-07'])
add('Аспекты натала и орбы', 'NATAL.computeAspects', ['реализация здесь по README', 'Swiss Ephemeris (сходящийся/расходящийся)', 'Astrolog и Kerykeion (сравнение орбов)'], a['natal']['n_aspects'], {'mismatch': len(a['natal']['mismatch']), 'applying_mismatch': len(a['natal']['applying_mismatch'])}, 'аспектов', 0, 'OK')
add('Синастрия', 'FEAT.crossAspects', ['реализация здесь'], a['synastry']['n_aspects'], {'mismatch': len(a['synastry']['mismatch'])}, 'аспектов', 0, 'OK', note='орбы синастрии в README не описаны')
add('Композит', 'FEAT.composite, FEAT.midpoint', ['реализация здесь', 'Kerykeion CompositeSubjectFactory', 'Swiss Ephemeris houses_armc'], a['composite']['n_points'], {'midpoint_deg': a['composite']['max_midpoint_dev_deg'], 'kery_deg': k['composite']['max_dev_deg'], 'asc_vs_swe_deg': a['composite']['asc_vs_swe_houses_armc_deg']}, '°', 1e-6, 'OK', note='ASC композита — от MC композита (у Kerykeion — середина ASC): школа')
add('Хорар: перфекции, курс Луны', 'HORARY.analyse, scanPair', ['Swiss Ephemeris (полный пересчёт)', 'Skyfield DE421', 'PyEphem', 'Astropy', 'таблица Лилли'], ho['perfection_count'], ho['perfection_residual_arcsec'], '″', 180, 'OK', note=f"несовпадений перфекций {ho['n_perfection_mismatch']}, Луны без курса {len(ho['voc_mismatch'])}")
add('Хорар: сроки', 'HORARY.analyse (timing)', ['Фроули, «How to Beat Time» (Skyscript)', 'Kerykeion (традиция)'], 0, {'rule': 'дома наоборот'}, '', '', 'ОШИБКА', ['B-05'])
add('Спорт по Фроули', 'SPORT.judge, SPORT.eventChart', ['реализация здесь на Swiss Ephemeris', 'футбольная база (ветка football-db)'], sp['n'], {'lords': sp['lords_mismatch'], 'moon': sp['moon_mismatch'], 'testimonies': sp['testimony_mismatch'], 'verdict': sp['verdict_mismatch'], 'cusp_deg': sp['cusp_max_dev_deg']}, 'матчей', 0, 'OK (по описанию)', note='шесть примеров книги в репозитории не найдены — не проверены')
add('Звёзды: данные рождения', 'tools/celebs.tsv', ['astro-charts.com (данные Astro-Databank)', 'Astrotheme'], 21, {'date_time_mismatch': 0, 'rating_mismatch': 1}, 'человек', 0, 'OK', note='Хемингуэй: AA на сайте и Astrotheme, A на astro-charts')
add('Звёзды: индекс сходства', 'CELEBS.compare', ['описание в README'], 154, {'readme_mismatch': 1}, '', '', 'OK (S4)', ['B-08'])
add('Лучшие города', 'FEAT.scoreCities', ['реализация здесь (Swiss Ephemeris, точная геометрия линий)'], ci['cities']['n_city_scores'], {'score': ci['cities']['max_score_dev'], 'km': ci['cities']['max_line_distance_dev_km']}, 'балл / км', 0.2, 'OK (S4)', ['B-11'])
add('Оценка места соляра', 'FEAT.scoreSolarPlace, rankSolarCities', ['реализация здесь (дома Плацидуса Swiss Ephemeris)'], ci['solar']['n_city_scores'], {'score': ci['solar']['max_score_dev']}, 'балл', 0, 'OK')
json.dump(S, open(os.path.join(os.path.dirname(__file__), 'summary.json'), 'w'), indent=1, ensure_ascii=False)
print(len(S), 'entries')
