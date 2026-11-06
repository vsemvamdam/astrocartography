/* One-off probe: what ESPN gives for other sports (scoreboards, odds, venues), saved raw for reading. */
'use strict';
const fs = require('fs'), path = require('path');
const OUT = process.argv[2] || 'probe';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/';
const CORE = 'https://sports.core.api.espn.com/v2/sports/';
const get = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'astrocartography-research (github actions)' } });
    const t = await r.text();
    return { status: r.status, body: t };
  } catch (e) { return { status: 0, body: String(e) }; }
};
const SAMPLES = [
  ['hockey', 'nhl', ['20191115', '20231115', '20260115', '20231101-20231107']],
  ['basketball', 'nba', ['20191115', '20240115']],
  ['baseball', 'mlb', ['20190615', '20250615']],
  ['football', 'nfl', ['20191110', '20251109']],
  ['tennis', 'atp', ['20190121', '20250120', '20250905']],
  ['tennis', 'wta', ['20250120']],
  ['mma', 'ufc', ['20250405']],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const log = [];
  for (const [sport, lg, days] of SAMPLES) {
    for (const d of days) {
      const url = `${SITE}${sport}/${lg}/scoreboard?dates=${d}&limit=300`;
      const r = await get(url);
      const f = `${sport}-${lg}-${d}.json`;
      fs.writeFileSync(path.join(OUT, f), r.body);
      let n = 0, ids = [];
      try {
        const j = JSON.parse(r.body);
        for (const ev of j.events || []) {
          const comps = (ev.competitions || []).concat(...(ev.groupings || []).map((g) => g.competitions || []));
          n += comps.length;
          for (const c of comps.slice(0, 2)) ids.push([ev.id, c.id]);
        }
      } catch (e) { /* not json */ }
      log.push(`${f}: HTTP ${r.status}, ${r.body.length} bytes, competitions ${n}`);
      // odds and summary for the first two competitions
      for (const [eid, cid] of ids.slice(0, 2)) {
        for (const [k, u] of [
          ['core-odds', `${CORE}${sport}/leagues/${lg}/events/${eid}/competitions/${cid}/odds`],
          ['core-comp', `${CORE}${sport}/leagues/${lg}/events/${eid}/competitions/${cid}`],
          ['summary', `${SITE}${sport}/${lg}/summary?event=${cid || eid}`],
        ]) {
          const x = await get(u);
          const g = `${sport}-${lg}-${d}-${k}-${cid || eid}.json`;
          fs.writeFileSync(path.join(OUT, g), x.body.slice(0, 400000));
          log.push(`  ${g}: HTTP ${x.status}, ${x.body.length} bytes`);
        }
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'LOG.txt'), log.join('\n') + '\n');
  console.log(log.join('\n'));
})();
