"""Yearly ATP and WTA workbooks of tennis-data.co.uk (results with Bet365/Pinnacle odds) → small CSVs.
python3 research/tennis_data.py <out-dir> 2019 2026"""
import sys, os, io, urllib.request, datetime
import openpyxl

out, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
os.makedirs(out, exist_ok=True)
COLS = ['Date', 'Location', 'Tournament', 'Winner', 'Loser', 'WRank', 'LRank', 'B365W', 'B365L', 'PSW', 'PSL', 'AvgW', 'AvgL', 'MaxW', 'MaxL', 'Comment']
for y in range(a, b + 1):
    for tour, url in (('atp', f'http://www.tennis-data.co.uk/{y}/{y}.xlsx'), ('wta', f'http://www.tennis-data.co.uk/{y}w/{y}.xlsx')):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'astrocartography-research (github actions)'})
            data = urllib.request.urlopen(req, timeout=60).read()
            wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception as e:
            print('skip', url, e); continue
        ws = wb.worksheets[0]
        rows = ws.iter_rows(values_only=True)
        head = [str(h).strip() if h is not None else '' for h in next(rows)]
        idx = {c: head.index(c) for c in COLS if c in head}
        n = 0
        with open(os.path.join(out, f'{tour}-{y}.csv'), 'w') as f:
            f.write(','.join(COLS) + '\n')
            for r in rows:
                vals = []
                for c in COLS:
                    v = r[idx[c]] if c in idx and idx[c] < len(r) else ''
                    if isinstance(v, (datetime.datetime, datetime.date)): v = v.strftime('%Y-%m-%d')
                    vals.append('' if v is None else str(v).replace(',', ' ').replace('\n', ' ').strip())
                if vals[3] and vals[4]:
                    f.write(','.join(vals) + '\n'); n += 1
        print(tour, y, n)
