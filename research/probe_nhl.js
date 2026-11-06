/* One-off probe of what ESPN gives for upcoming NHL games (schedule by month or by day, odds, rosters, lineups). */
'use strict';
const fs = require('fs'), path = require('path');
const OUT = process.argv[2] || 'probe-nhl';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/';
const CORE = 'https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/';
const get = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'astrocartography-research (github actions)' } });
    return { status: r.status, body: await r.text() };
  } catch (e) { return { status: 0, body: String(e) }; }
};
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const log = [], now = Date.now();
  const save = (name, r) => { fs.writeFileSync(path.join(OUT, name), r.body.slice(0, 600000)); log.push(`${name}: HTTP ${r.status}, ${r.body.length} bytes`); };
  const mo = ymd(now).slice(0, 6);
  for (const [name, url] of [['month', `${SITE}scoreboard?dates=${mo}&limit=400`], ['today', `${SITE}scoreboard?dates=${ymd(now)}`], ['tomorrow', `${SITE}scoreboard?dates=${ymd(now + 864e5)}`], ['plain', `${SITE}scoreboard`], ['range', `${SITE}scoreboard?dates=${ymd(now)}-${ymd(now + 6 * 864e5)}`]]) {
    const r = await get(url); save(`scoreboard-${name}.json`, r);
    try { const j = JSON.parse(r.body); log.push(`  events ${(j.events || []).length}, first ${j.events && j.events[0] && j.events[0].date}, last ${j.events && j.events.length && j.events[j.events.length - 1].date}`); } catch (e) { /* */ }
  }
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(OUT, 'scoreboard-tomorrow.json'), 'utf8')); } catch (e) { /* */ }
  const ev = j && j.events && j.events[0];
  if (ev) {
    const c = ev.competitions[0];
    save('summary.json', await get(`${SITE}summary?event=${ev.id}`));
    save('core-odds.json', await get(`${CORE}events/${ev.id}/competitions/${c.id}/odds`));
    for (const t of c.competitors) save(`roster-${t.team.id}.json`, await get(`${SITE}teams/${t.team.id}/roster`));
  }
  fs.writeFileSync(path.join(OUT, 'LOG.txt'), log.join('\n') + '\n');
  console.log(log.join('\n'));
})();
