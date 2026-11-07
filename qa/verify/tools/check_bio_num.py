"""Biorhythms (values and critical days) and numerology, against implementations written here from the published rules:
biorhythms — sin(2πt/P), t in days since the birth date (Wikipedia "Biorhythm (pseudoscience)", Thommen 1973);
numerology — Pythagorean letter table, master numbers 11/22/33, Chaldean table after Cheiro, the Russian 'psychomatrix'
of A. Aleksandrov with four working numbers."""
import json, os, math, re
TMP = os.environ.get('TOOLS_TMP')
B = json.load(open(os.path.join(TMP, 'site_bio.json')))
res = {}
# ------------------------------------------------------------------ biorhythms
vdev = 0.0
for t, p, e, i, cp, ce, ci in B:
    for v, P in ((p, 23), (e, 28), (i, 33)):
        vdev = max(vdev, abs(v - math.sin(2 * math.pi * t / P)))
def crit_sign(t, P):   # the curve changes sign between the start of day t and the start of day t+1 (or is 0 at t)
    a, b = math.sin(2 * math.pi * t / P), math.sin(2 * math.pi * (t + 1) / P)
    return abs(a) < 1e-12 or (a > 0) != (b > 0) and abs(b) > 1e-12
def crit_exact(t, P):  # a zero t·2/P ∈ Z lies in [t, t+1)
    h = P / 2.0; k = math.ceil(t / h - 1e-9)
    return k * h < t + 1 - 1e-9
cbad = 0; cbad_sign = 0
N = 21252
single = double = triple = anyc = 0
for t, p, e, i, cp, ce, ci in B:
    for c, P in ((cp, 23), (ce, 28), (ci, 33)):
        cbad += c != crit_exact(t, P)
        cbad_sign += c != crit_sign(t, P)
    if t < N:
        k = cp + ce + ci
        anyc += k >= 1; double += k == 2; triple += k == 3
yrs = N / 365.25
res['bio'] = {'n_days': len(B), 'max_value_dev': vdev, 'crit_mismatch_vs_zero_in_day': cbad, 'crit_mismatch_vs_sign_change': cbad_sign,
              'per_year': {'days_with_any_critical': round(anyc / yrs, 1), 'crossings': round((N / 11.5 + N / 14 + N / 16.5) / yrs, 1),
                           'double': round(double / yrs, 2), 'triple_in_58y': triple},
              'claims': {'single_per_year': 69, 'double_per_year': 5, 'triple_in_58y': 7}}
# ------------------------------------------------------------------ numerology
Nm = json.load(open(os.path.join(TMP, 'site_num.json')))
RU = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'; LA = 'abcdefghijklmnopqrstuvwxyz'
VAL = {c: i % 9 + 1 for i, c in enumerate(RU)}; VAL.update({c: i % 9 + 1 for i, c in enumerate(LA)})
VOW = set('аеёиоуыэюяaeiou')
CHAL = dict(zip('abcdefghijklmnopqrstuvwxyz', [1, 2, 3, 4, 5, 8, 3, 5, 1, 1, 2, 3, 4, 5, 7, 8, 1, 2, 3, 4, 6, 6, 6, 5, 1, 7]))
TR = {'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'}
ds = lambda n: sum(int(c) for c in str(n))
def red(n, master=True):
    while n > 9 and not (master and n in (11, 22, 33)): n = ds(n)
    return n
def mine(name, dob, year):
    y, m, d = map(int, dob.split('-'))
    life_total = red(ds(f'{d}{m}{y}'))                          # all digits at once (the site's rule)
    life_parts = red(red(d) + red(m) + red(ds(y)))              # day, month, year reduced first (Decoz)
    nm = name.strip().lower()
    expr = red(sum(VAL.get(c, 0) for c in nm)) if nm else None
    soul = red(sum(VAL.get(c, 0) for c in nm if c in VOW)) if nm else None
    pers = red(sum(VAL.get(c, 0) for c in nm if c in VAL and c not in VOW)) if nm else None
    lat = ''.join(TR.get(c, c) for c in nm)
    ch = sum(CHAL.get(c, 0) for c in lat)
    py = red(red(d) + red(m) + red(ds(year)))
    py_site = red(ds(d) + ds(m) + ds(year))
    dd = (f'{d:02d}{m:02d}{y}').replace('0', '')
    w1 = ds(f'{d}{m}{y}'); w2 = ds(w1); fd = int(str(d)[0]); w3 = w1 - 2 * fd; w4 = ds(abs(w3))
    pool = dd + str(w1) + str(w2) + str(abs(w3)) + str(w4)
    sq = {k: pool.count(str(k)) for k in range(1, 10)}
    return dict(life=life_total, life_parts=life_parts, expr=expr, soul=soul, pers=pers, chal=(ch, red(ch, False)) if nm else None, py=py_site, py_parts=py, square=sq, work=[w1, w2, w3, w4])
nb = []; school = {'life_parts_differs': [], 'py_parts_differs': []}
for x in Nm:
    r = x['r']; m = mine(x['name'], x['dob'], x['year'])
    got = dict(life=r['life'], expr=r['expr'], soul=r['soul'], pers=r['pers'], chal=(r['chaldean']['compound'], r['chaldean']['single']) if r['chaldean'] else None, py=r['personalYear'], square={int(k): v for k, v in r['square'].items()}, work=r['work'])
    for k in got:
        if got[k] != m[k]: nb.append((x['name'], x['dob'], k, got[k], m[k]))
    if m['life'] != m['life_parts'] and x['name'] == '': school['life_parts_differs'].append((x['dob'], m['life'], m['life_parts']))
    if m['py'] != m['py_parts'] and x['name'] == '': school['py_parts_differs'].append((x['dob'], m['py'], m['py_parts']))
res['num'] = {'n': len(Nm), 'mismatch': nb[:20], 'n_mismatch': len(nb), 'school_differences': school}
json.dump(res, open(os.path.join(TMP, 'res_bio_num.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(res, indent=1, ensure_ascii=False))
