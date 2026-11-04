'use strict';
const S = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const C = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/';
const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'astrocartography-probe' } }); console.log('GET', r.status, u); return r.ok ? r.json() : null; };
const cut = (o, n) => { const s = JSON.stringify(o); return s && s.length > n ? s.slice(0, n) + '…' : s; };
(async () => {
  for (const [lg, mo] of [['eng.1', '202410'], ['esp.1', '202503'], ['uefa.champions', '202503'], ['eng.1', '201809'], ['eng.1', '201509']]) {
    const j = await get(`${S}${lg}/scoreboard?dates=${mo}&limit=300`);
    if (!j) continue;
    const ev = j.events || [];
    const withOdds = ev.filter((e) => e.competitions[0].odds && e.competitions[0].odds.length).length;
    const withVenue = ev.filter((e) => e.competitions[0].venue && e.competitions[0].venue.address).length;
    console.log(lg, mo, 'events', ev.length, 'withOdds', withOdds, 'withVenueAddr', withVenue);
    const names = {}; for (const e of ev) { const n = e.competitions[0].status.type.name + ' / ' + e.competitions[0].status.type.shortDetail; names[n] = (names[n] || 0) + 1; }
    console.log('  statuses', cut(names, 600));
    const e0 = ev[0];
    if (e0) {
      const c = e0.competitions[0];
      console.log('  comp keys', Object.keys(c).join(','));
      console.log('  competitor keys', Object.keys(c.competitors[0]).join(','));
      console.log('  sample', e0.id, e0.date, cut(c.venue, 300), c.competitors.map((x) => x.team.displayName + ' ' + x.score + ' w=' + x.winner + ' so=' + x.shootoutScore).join(' | '));
    }
    const pen = ev.find((e) => /PEN|AET|EXTRA/i.test(e.competitions[0].status.type.name));
    for (const e of [e0, pen].filter(Boolean).slice(0, 2)) {
      const sm = await get(`${S}${lg}/summary?event=${e.id}`);
      if (!sm) continue;
      console.log('  summary keys', Object.keys(sm).join(','));
      console.log('  pickcenter', cut(sm.pickcenter, 900));
      console.log('  odds', cut(sm.odds, 900));
      const hc = sm.header && sm.header.competitions && sm.header.competitions[0];
      if (hc) console.log('  header comp keys', Object.keys(hc).join(','), 'status', cut(hc.status, 300), 'competitors', cut(hc.competitors.map((x) => ({ ha: x.homeAway, score: x.score, so: x.shootoutScore, w: x.winner })), 300));
      const ke = (sm.keyEvents || []).filter((k) => k.scoringPlay);
      console.log('  keyEvents scoring', ke.length, cut(ke.slice(0, 3).map((k) => ({ type: k.type, clock: k.clock, period: k.period, team: k.team && k.team.displayName, shootout: k.shootout })), 900));
      if (hc && hc.details) console.log('  details', hc.details.length, cut(hc.details.filter((d) => d.scoringPlay).slice(0, 3), 900));
      const core = await get(`${C}${lg}/events/${e.id}/competitions/${e.id}/odds`);
      if (core) { console.log('  core odds count', core.count, cut((core.items || []).slice(0, 2), 1500)); }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
