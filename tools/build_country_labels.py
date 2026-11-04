"""Builds js/country-labels.js: Russian country names with Natural Earth's label points and zoom levels.
Usage: python3 tools/build_country_labels.py natural-earth-vector/geojson/ne_50m_admin_0_countries.geojson js/country-labels.js"""
import json, sys

SHORT = {  # names too long for a map label
    'CHN': 'Китай', 'COD': 'ДР Конго', 'COG': 'Конго', 'ARE': 'ОАЭ', 'CAF': 'ЦАР', 'KOR': 'Южная Корея', 'PRK': 'КНДР',
    'HTI': 'Гаити', 'KOS': 'Косово', 'CYN': 'Сев. Кипр', 'ATF': 'Фр. Южные территории', 'SGS': 'Южная Георгия',
    'DOM': 'Доминикана', 'BIH': 'Босния и Герцеговина', 'GNQ': 'Экв. Гвинея', 'TTO': 'Тринидад и Тобаго',
    'PNG': 'Папуа — Новая Гвинея', 'SAU': 'Саудовская Аравия', 'MKD': 'Сев. Македония', 'FLK': 'Фолкленды',
}
SKIP = {'IOA', 'IOT', 'HMD', 'ATC', 'CLP', 'SPM', 'ALD', 'BRN'}
feats = json.load(open(sys.argv[1], encoding='utf-8'))['features']
rows = []
for f in feats:
    p = f['properties']
    a3 = p.get('ADM0_A3')
    ru = SHORT.get(a3) or (p.get('NAME_RU') or '').strip()
    if not ru or a3 in SKIP:
        continue
    rows.append([ru, round(p['LABEL_X'], 2), round(p['LABEL_Y'], 2), p['MIN_LABEL'], p['MAX_LABEL'], p['LABELRANK']])
rows.sort(key=lambda r: (r[3], r[5]))
with open(sys.argv[2], 'w', encoding='utf-8') as out:
    out.write('/* Country labels: [name, lon, lat, min zoom, max zoom, rank], from Natural Earth 1:50m admin-0 (tools/build_country_labels.py) */\n')
    out.write('window.ACG_COUNTRY_LABELS=' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(rows), 'labels')
