"""Ranks of both players at the tournament for tennis singles, from Jeff Sackmann's tennis_atp and tennis_wta
on GitHub (CC BY-NC-SA 4.0) → small CSVs: date (the tournament's first day), winner, loser, their ranks.
tennis-data.co.uk, which also has odds, refuses automated downloads, so tennis is judged by ranks.
python3 research/tennis_data.py <out-dir> 2019 2026"""
import sys, os, io, csv, urllib.request

out, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
os.makedirs(out, exist_ok=True)
UA = 'astrocartography-research (github actions)'
COLS = ['Date', 'Winner', 'Loser', 'WRank', 'LRank', 'Score']
clean = lambda v: '' if v is None else str(v).replace(',', ' ').strip()
for y in range(a, b + 1):
    for tour, repo in (('atp', 'tennis_atp'), ('wta', 'tennis_wta')):
        url = f'https://raw.githubusercontent.com/JeffSackmann/{repo}/master/{tour}_matches_{y}.csv'
        try:
            text = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read().decode('utf-8', 'replace')
        except Exception as e:
            print('skip', url, e); continue
        n = 0
        with open(os.path.join(out, f'{tour}-{y}.csv'), 'w') as f:
            f.write(','.join(COLS) + '\n')
            for d in csv.DictReader(io.StringIO(text)):
                t = d.get('tourney_date', '')
                if len(t) != 8 or not d.get('winner_name') or not d.get('loser_name'): continue
                f.write(','.join([f'{t[:4]}-{t[4:6]}-{t[6:]}', clean(d['winner_name']), clean(d['loser_name']), clean(d.get('winner_rank')), clean(d.get('loser_rank')), clean(d.get('score'))]) + '\n')
                n += 1
        print(tour, y, n)
