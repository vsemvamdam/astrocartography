"""Online spot checks: astro.com swetest (Swiss Ephemeris 2.10.04 with asteroid files) and a direct JPL Horizons query.
python3 compare_online.py <site_dump.json>"""
import json, sys, os, subprocess
H = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(sys.argv[1]))
n180 = lambda x: (x + 180) % 360 - 180
A = json.load(open(os.path.join(H, 'online', 'astrocom_charts.json')))
for cid, a in A['charts'].items():
    c = [x for x in d['charts'] if x['id'] == cid][0]
    B = {b['id']: b['elon'] for b in c['bodies']}
    B['TrueNode'] = B['Node']; B['MeanNode'] = c['meanNode']['elon']; B['Lilith'] = c['lilith']
    print(cid, a['sys'], ' '.join('%s %.1f″' % (k, n180(B[k] - v) * 3600) for k, v in a['bodies'].items()))
    print('   cusps site−astro.com, ″:', [round(n180(x - y) * 3600, 1) for x, y in zip(c['natal'][a['sys']]['cusps'], a['cusps'])])
M = json.load(open(os.path.join(H, 'online', 'astrocom_minor.json')))
Z = json.load(open(os.path.join(H, 'online', 'horizons_webfetch.json')))
js = ("const S=require('/home/claude/astrocartography/qa/lib/site.js');const ds=%s;const o={};"
      "for(const id of ['Eros','Psyche','Amor','Hygiea','Proserpina']){o[id]=ds.map(d=>{const b=S.ACG.computeChart(Date.parse(d+'T00:00:00Z')).bodies.find(x=>x.id===id);return b?[b.elon,b.elat]:null;});}"
      "console.log(JSON.stringify(o));") % json.dumps(M['dates'])
site = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True).stdout)
for id_ in ['Eros', 'Psyche', 'Amor', 'Hygiea', 'Proserpina']:
    v = [n180(s[0] - r[0]) * 3600 for s, r in zip(site[id_], M[id_]) if s]
    print('%-10s site−astro.com lon, ″: max %.1f  %s' % (id_, max(abs(x) for x in v), ' '.join('%.1f' % x for x in v)))
for iso, (lo, la) in Z['Amor'].items():
    k = M['dates'].index(iso[:10])
    print('Amor %s: site−Horizons %.1f″, astro.com−Horizons %.1f″' % (iso[:10], n180(site['Amor'][k][0] - lo) * 3600, n180(M['Amor'][k][0] - lo) * 3600))
