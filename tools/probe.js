'use strict';
const S = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const C = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/';
const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'astrocartography-probe' } }); console.log('GET', r.status, u); return r.ok ? r.json() : null; };
const cut = (o, n) => { const s = JSON.stringify(o); return s && s.length > n ? s.slice(0, n) + '…' : s; };
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === '$ref' || k === 'betSlipUrl' || k === 'links' || k === 'team' || k === 'homeTeam' || k === 'awayTeam' ? undefined : v)));
(async () => {
  for (const [lg, mo, k] of [['eng.1', '202410', 0], ['uefa.champions', '202503', 0], ['eng.1', '202010', 0], ['eng.1', '201809', 0], ['eng.1', '201509', 0], ['uefa.europa.conf', '202503', 0]]) {
    const j = await get(`${S}${lg}/scoreboard?dates=${mo}&limit=300`);
    const ev = j.events, e = ev[k], c = e.competitions[0];
    console.log(lg, mo, e.id, c.competitors.map((x) => x.homeAway + ':' + x.team.displayName + ' ' + x.score).join(' | '));
    console.log('  SCOREBOARD odds', cut(strip(c.odds), 1500));
    const sm = await get(`${S}${lg}/summary?event=${e.id}`);
    for (const o of sm.odds || []) {
      const to = o.bettingOdds && o.bettingOdds.teamOdds;
      console.log('  SUMMARY odds provider', o.provider && o.provider.name, 'teamOdds keys', to ? Object.keys(to).join(',') : '-');
      if (to) console.log('   prematch', cut(Object.fromEntries(Object.entries(to).filter(([kk]) => /preMatch/i.test(kk)).map(([kk, v]) => [kk, v.value])), 800));
    }
    const core = await get(`${C}${lg}/events/${e.id}/competitions/${e.id}/odds`);
    for (const it of (core && core.items) || []) console.log('  CORE', it.provider && it.provider.name, cut(strip(Object.fromEntries(Object.entries(it).filter(([kk]) => !/bettingOdds|links|propBets/.test(kk)))), 1200));
  }
  // count matches per season for the five leagues (one month each) to see how far back data goes
  for (const lg of ['uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'esp.1']) for (const mo of ['201510', '201810', '202110']) {
    const j = await get(`${S}${lg}/scoreboard?dates=${mo}&limit=300`);
    const ev = (j && j.events) || [];
    console.log('  COUNT', lg, mo, ev.length, 'odds', ev.filter((e) => e.competitions[0].odds && e.competitions[0].odds.length).length, 'venue', ev.filter((e) => e.competitions[0].venue && e.competitions[0].venue.address && e.competitions[0].venue.address.city).length);
  }
})().catch((e) => { console.error(e); process.exit(1); });
