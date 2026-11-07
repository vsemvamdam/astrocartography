"""Sport (Frawley): the judgement of real matches of the football base, rewritten here from the rules as js/sport.js and the
README describe them, on Swiss Ephemeris positions and Placidus cusps. Compares the significators, the Moon's applying aspects
and her final aspect, every testimony (rule code, team, weight) and the verdict."""
import json, os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import refeph as R
import swisseph as swe
TMP = os.environ.get('TOOLS_TMP')
D = json.load(open(os.path.join(TMP, 'site_sport.json')))
n360, n180 = R.n360, R.n180
DOM = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter']
OWNER = {1: 'fav', 10: 'fav', 7: 'dog', 4: 'dog'}
PL = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
anti = lambda x: n360(180 - x)
near = lambda d: 1 if abs(d) <= 1 else max(0, 1 - 0.3 * (abs(d) - 1))
sign = lambda x: int(n360(x) // 30)
other = lambda k: 'dog' if k == 'fav' else 'fav'
def reaches(pid, t0, target, maxdeg):
    l0, v = R.swe_lonspeed(pid, t0)
    d0 = n180(target - l0)
    if abs(d0) > maxdeg or v == 0 or (d0 > 0) != (v > 0): return None
    step = max(1 / 24, min(2, 0.25 / max(abs(v), 0.01))) * R.DAY
    t, prev = t0, d0
    for _ in range(3000):
        t += step
        if t > t0 + 400 * R.DAY: return None
        d = n180(target - R.swe_lon(pid, t))
        if (d < 0) != (prev < 0) and abs(d) < 10: return t
        if abs(d) > abs(prev) + 1e-6 and abs(prev) < abs(d0): return None
        prev = d
    return None
def first_aspect(a, b, t0, t1):
    TG = [0, 60, 90, 120, 180, 240, 270, 300]
    step = 0.1 * R.DAY
    t = t0; d = n360(R.swe_lon(b, t) - R.swe_lon(a, t))
    while t < t1:
        t2 = min(t + step, t1); d2 = n360(R.swe_lon(b, t2) - R.swe_lon(a, t2))
        for T in TG:
            e1, e2 = n180(d - T), n180(d2 - T)
            if abs(e1) < 30 and abs(e2) < 30 and (e1 < 0) != (e2 < 0): return t2
        t, d = t2, d2
    return None
def exit_time(pid, t0):
    s0 = sign(R.swe_lon(pid, t0)); t = t0
    while t < t0 + 400 * R.DAY:
        t += 0.25 * R.DAY
        if sign(R.swe_lon(pid, t)) != s0: return t
    return float('inf')
def prohibited(pid, t0, tend, P):
    v = abs(P[pid]['v'])
    for x in PL:
        if x in (pid, 'Moon') or abs(P[x]['v']) >= v: continue
        te = min(exit_time(pid, t0), exit_time(x, t0), t0 + 400 * R.DAY, tend)
        r = first_aspect(pid, x, t0, te)
        if r and r < tend: return x
    return None

def judge(m):
    t0 = m['kickoff']; lat, lon = m['place']['lat'], m['place']['lon']
    jd = R.jd_of(t0)
    cusps, ascmc = swe.houses(jd, lat, lon, b'P')
    c = [None] + list(cusps)
    P = {}
    for pid in PL:
        l, v = R.swe_lonspeed(pid, t0); P[pid] = {'lon': l, 'v': v}
    NN = R.swe_lon('Node', t0)
    fortune = n360(ascmc[0] + P['Moon']['lon'] - P['Sun']['lon']); fA = anti(fortune)
    T = []
    def add(team, w, rule):
        if w > 0.05: T.append((rule, team, round(w * 10) / 10))
    L = {}
    for h in (1, 7):
        r = DOM[sign(c[h])]; via = False
        if r == 'Moon':
            r = DOM[sign(P['Moon']['lon'])]; via = True
            if r == 'Moon': r = None
        L[h] = (r, h, via, True) if r else None
    for h in (10, 4):
        r = DOM[sign(c[h])]
        if r == 'Moon' or (L[1] and L[1][0] == r) or (L[7] and L[7][0] == r): L[h] = None; continue
        L[h] = (r, h, False, False)
    lords = [dict(id=L[h][0], h=h, via=L[h][2], main=L[h][3], team=OWNER[h]) for h in (1, 10, 7, 4) if L[h]]
    # 1. lords at the cusps
    for s in lords:
        p = P[s['id']]; base = 3 if s['main'] else 2
        for lo, isA in ((p['lon'], False), (anti(p['lon']), True)):
            k0 = 0.5 if isA else 1
            sfx = lambda hh: ('.anti' if isA else '') + ('' if s['main'] else '.sec') + f'.h{hh}'
            for h in (1, 10, 7, 4):
                d = n180(lo - c[h])
                if abs(d) > 3: continue
                onc = d < 0.34; owner = OWNER[h]
                if owner == s['team']: add(s['team'], (2 if s['main'] else 1.5) * near(d) * k0, 'lord-own-angle' + sfx(h))
                elif onc:
                    rt = 0.6 if (not isA and p['v'] < 0) else 1
                    add(s['team'], base * near(d) * k0 * rt, 'lord-on-opp-cusp' + sfx(h))
                else: add(owner, base * near(d) * k0, 'lord-in-opp-house' + sfx(h))
    # 2. the Moon and her antiscion at the cusps
    for lo, isA in ((P['Moon']['lon'], False), (anti(P['Moon']['lon']), True)):
        for h in (1, 10, 7, 4):
            d = n180(lo - c[h])
            if abs(d) <= 3: add(OWNER[h], (1.5 if isA else 2) * near(d), f"moon-angle{'.anti' if isA else ''}.h{h}")
    # 3. Fortuna's antiscion at ASC/DSC
    for h in (1, 7):
        d = n180(fA - c[h])
        if abs(d) <= 3: add(OWNER[h], 3.5 * near(d), f'fortuna-anti-angle.h{h}')
    # 4. the Moon's applying aspects within 5°
    moon = P['Moon']; left = 30 - n360(moon['lon']) % 30
    tg = []
    for s in lords:
        tg.append(dict(key=s['id'], lon=P[s['id']]['lon'], v=P[s['id']]['v'], lord=s, anti=False))
        tg.append(dict(key=s['id'] + '*', lon=anti(P[s['id']]['lon']), v=-P[s['id']]['v'], lord=s, anti=True))
    tg.append(dict(key='F', lon=fortune, v=0, fortuna=True, anti=False)); tg.append(dict(key='F*', lon=fA, v=0, fortuna=True, anti=True))
    ma = []
    for t in tg:
        for a in (0, 60, 90, 120, 180):
            for sg in ([1] if a in (0, 180) else [1, -1]):
                goal = n360(t['lon'] + sg * a); rel = moon['v'] - t['v']
                if rel <= 0: continue
                gap = n360(goal - moon['lon'])
                if gap > 5 or gap == 0: continue
                if gap / rel * moon['v'] > left: continue
                ma.append(dict(to=t, asp=a, deg=gap))
    ma.sort(key=lambda x: x['deg'])
    walked = []; final = None
    for x in ma:
        walked.append(x)
        if x['to'].get('fortuna'): final = x; break
        if not x['to']['anti'] and x['asp'] == 0: final = x; break
    lh = [x for x in walked if x['to'].get('lord')]
    lf = final if final and final['to'].get('fortuna') else None
    if lf:
        good = lf['asp'] in (0, 60, 120)
        w = (2.5 if lf['asp'] in (0, 180) else 0.75) if lf['to']['anti'] else (3 if lf['asp'] == 0 else 2.5)
        add('fav' if good else 'dog', w, f"last-fortuna-{'good' if good else 'hard'}{'.anti' if lf['to']['anti'] else ''}.a{lf['asp']}")
    ll = lh[-1] if lh else None
    if ll and not lf:
        w = 2 if (ll['to']['anti'] and ll['asp'] not in (0, 180)) else 3
        add(ll['to']['lord']['team'], w, f"last-lord{'.anti' if ll['to']['anti'] else ''}{'' if ll['to']['lord']['main'] else '.sec'}.a{ll['asp']}")
    for x in lh:
        if x is not ll or lf: add(x['to']['lord']['team'], 0.5, f"moon-way{'.anti' if x['to']['anti'] else ''}")
    # 5–6. lords and Fortuna's dispositor applying to Fortuna
    disp = DOM[sign(fortune)]
    dl = next((s for s in lords if s['id'] == disp), None)
    dused = disp != 'Moon' and not (dl and dl['main'])
    for s in lords:
        if dused and s['id'] == disp: continue
        W = 3 if s['main'] else 1
        for pt, isA in ((fortune, False), (fA, True)):
            for a in (0, 180):
                th = reaches(s['id'], t0, n360(pt + a), 5)
                if not th: continue
                if prohibited(s['id'], t0, th, P): continue
                team = s['team'] if a == 0 else ('dog' if s['team'] == 'fav' else ('fav' if isA else 'dog'))
                add(team, W, f"lord-fortuna-{'conj' if a == 0 else 'opp'}.{s['team']}{'.anti' if isA else ''}{'' if s['main'] else '.sec'}")
    if dused:
        for a in (0, 180):
            th = reaches(disp, t0, n360(fortune + a), 5)
            if th and not prohibited(disp, t0, th, P): add('fav' if a == 0 else 'dog', 2, f"disp-fortuna-{'conj' if a == 0 else 'opp'}")
    # 7. nodes, combustion
    SN = n360(NN + 180); conj = lambda a, b, o: abs(n180(a - b)) <= o
    for s in lords:
        p = P[s['id']]
        if conj(p['lon'], NN, 2): add(s['team'], 1.5, 'lord-north-node' + ('' if s['main'] else '.sec'))
        if conj(p['lon'], SN, 2): add(other(s['team']), 1.5, 'lord-south-node' + ('' if s['main'] else '.sec'))
        if s['id'] != 'Sun':
            ds = abs(n180(p['lon'] - P['Sun']['lon']))
            if 17 / 60 < ds <= 2: add(other(s['team']), 2 if s['main'] else 1.5, 'lord-combust' + ('' if s['main'] else '.sec'))
    if conj(fortune, NN, 2): add('fav', 1.5, 'fortuna-north-node')
    if conj(fortune, SN, 2): add('dog', 1.5, 'fortuna-south-node')
    if abs(n180(fortune - P['Sun']['lon'])) <= 2: add('dog', 2, 'fortuna-combust')
    # 8. Pluto, Uranus, Saturn
    pl = P['Pluto']['lon']; c2 = c[2]
    for h, team, w in ((1, 'dog', 3), (10, 'dog', 2.5), (2, 'dog', 1.5), (7, 'fav', 1), (4, 'fav', 1)):
        d = n180(pl - c[h])
        if abs(d) <= 2: add(team, w * near(d), f'pluto-cusp.h{h}')
    for nm, pt in (('fortuna', fortune), ('disp', P[disp]['lon'] if disp in P else None)):
        if pt is None: continue
        for lo, an in ((pl, ''), (anti(pl), '.anti')):
            if conj(lo, pt, 1): add('dog', 2.5, f'pluto-{nm}-conj{an}')
            if conj(lo, pt + 180, 1): add('dog', 2.5, f'pluto-{nm}-opp{an}')
    ur = P['Uranus']['lon']
    if conj(ur, ascmc[1], 1): add('fav', 2.5, 'uranus-mc')
    if conj(ur, fortune, 1): add('fav', 2.5, 'uranus-fortuna-conj')
    if conj(ur, fortune + 180, 1): add('dog', 2.5, 'uranus-fortuna-opp')
    if not (L[1] and L[1][0] == 'Saturn') and not (L[7] and L[7][0] == 'Saturn'):
        sat = P['Saturn']['lon']
        for s in lords:
            if s['id'] != 'Saturn' and conj(sat, P[s['id']]['lon'], 2): add(other(s['team']), 1.5, 'saturn-lord' + ('' if s['main'] else '.sec'))
        for h in (1, 10, 7, 4):
            d = n180(sat - c[h])
            if abs(d) <= 2: add(other(OWNER[h]), 1.5 * near(d), f'saturn-cusp.h{h}')
        if conj(sat, fortune, 2): add('dog', 1.5, 'saturn-fortuna')
    sc = {'fav': 0.0, 'dog': 0.0}
    for rule, team, w in T: sc[team] += w
    sc = {k: round(v * 10) / 10 for k, v in sc.items()}
    diff = sc['fav'] - sc['dog']
    win = ('fav' if diff > 0 else 'dog') if abs(diff) >= 1.5 else None
    return dict(lords=[(s['id'], s['h']) for s in lords], moon=[(x['to']['key'], x['asp'], round(x['deg'], 2)) for x in ma], final=(final['to']['key'], final['asp']) if final else None, T=sorted(T), score=sc, win=win, cusps=c)

res = {'n': 0, 'lords_mismatch': 0, 'moon_mismatch': 0, 'final_mismatch': 0, 'testimony_mismatch': 0, 'verdict_mismatch': 0, 'examples': [], 'cusp_max_dev_deg': 0.0}
for m in D:
    r = judge(m); res['n'] += 1
    res['cusp_max_dev_deg'] = max(res['cusp_max_dev_deg'], max(abs(n180(m['cusps'][h] - r['cusps'][h])) for h in (1, 4, 7, 10)))
    sl = [(s['id'], s['house']) for k in ('fav', 'dog') for s in m['lords'][k]]
    if sorted(sl) != sorted(r['lords']): res['lords_mismatch'] += 1; res['examples'].append(('lords', m['id'], sl, r['lords']))
    smoon = [(x['key'], x['asp'], round(x['deg'], 2)) for x in m['moonAsp']]
    if [x[:2] for x in smoon] != [x[:2] for x in r['moon']]: res['moon_mismatch'] += 1; res['examples'].append(('moon', m['id'], smoon, r['moon']))
    sf = (m['final']['key'], m['final']['asp']) if m['final'] else None
    if sf != r['final']: res['final_mismatch'] += 1
    st = sorted((t['rule'], t['team'], t['w']) for t in m['T'])
    if st != r['T']:
        res['testimony_mismatch'] += 1
        if len(res['examples']) < 12: res['examples'].append(('T', m['id'], [x for x in st if x not in r['T']], [x for x in r['T'] if x not in st]))
    vs = m['verdict']['v'] if m['verdict']['v'] != 'draw' else None
    if vs != r['win']: res['verdict_mismatch'] += 1
json.dump(res, open(os.path.join(TMP, 'res_sport.json'), 'w'), indent=1, ensure_ascii=False, default=str)
print(json.dumps(res, indent=1, ensure_ascii=False, default=str)[:5000])
