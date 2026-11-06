/* Football base for checking the "Спорт" judgement against real results.
   For every match of the five leagues the site follows it keeps what cannot be recomputed later: the
   scheduled kickoff, the venue and the place the chart is cast for, the bookmakers' odds and the result.
   The chart depends only on the kickoff and the place, so any later version of the method can be run
   over the whole base again (--rejudge). Two judgements are kept apart:
     pre   — what the site said before the kickoff, written once and never changed afterwards;
     judge — the current version of js/sport.js, recomputed whenever that file changes.
   Past seasons are added with --months; their judgement is made afterwards, so they have no `pre`.

   Runs in GitHub Actions (.github/workflows/sport-db.yml) after every run of the ESPN copy and by hand;
   the base lives in the `football-db` branch (README.md there explains the fields).

   node tools/sport_db.js <db-dir>                                   the last week and the next three days
   node tools/sport_db.js <db-dir> --months 201808-202606 [--leagues eng.1,esp.1]   past seasons
   node tools/sport_db.js <db-dir> --rejudge                         recompute `judge` everywhere, offline
   --geonames <dir> with cities500.txt and countryInfo.txt from download.geonames.org places stadiums in
   towns the site's own city list lacks (it falls back to the country's largest city, and the houses go wrong).
   Needs Node 18+ and astronomy-engine 2.1.19 (ASTRONOMY_JS may point to it). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.Astronomy = require(process.env.ASTRONOMY_JS || 'astronomy-engine');
for (const f of ['data', 'acg-core', 'natal', 'horary', 'sport']) require(path.join(ROOT, 'js', f + '.js'));
const S = globalThis.SPORT, D = globalThis.ACG_DATA;
// the version of the method: a hash of the judgement part of js/sport.js, so that fetching or layout
// changes there do not count as a new method
const VERSION = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'sport.js'), 'utf8');
  const a = src.indexOf('/* -------------------------------- judgement'), b = src.indexOf('/* ---------------------- experimental player index');
  return crypto.createHash('sha1').update(a >= 0 && b > a ? src.slice(a, b) : src).digest('hex').slice(0, 8);
})();

const SITE = process.env.ESPN_API || 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const CORE = process.env.ESPN_CORE || 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/';
const H = 3600000, DAY = 24 * H;
const args = process.argv.slice(2);
const DB = args[0];
if (!DB || DB.startsWith('--')) { console.error('usage: node tools/sport_db.js <db-dir> [--months YYYYMM-YYYYMM] [--leagues a,b] [--rejudge]'); process.exit(2); }
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
const LEAGUES = (opt('--leagues') || S.LEAGUES.map((l) => l.id).join(',')).split(',');
const now = Date.now();

/* ------------------------------------ cities ------------------------------------ */
const CITIES = D.cities.split('\n').map((row) => {
  const f = row.split('|');
  return { ru: f[0], en: f[1], c: D.countries[+f[2]], lat: +f[3] / 100, lon: +f[4] / 100, tz: D.tzs[+f[5]], pop: +f[6] };
});

/* ------------------------------------- places ------------------------------------- */
const key = S.venueKey;     // the site looks the stadium up in venues.json by the same key
const COUNTRY_ALIAS = { england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', turkiye: 'TR', turkey: 'TR', 'czech republic': 'CZ', czechia: 'CZ',
  'republic of ireland': 'IE', ireland: 'IE', kosovo: 'XK', 'bosnia herzegovina': 'BA', 'bosnia and herzegovina': 'BA', 'north macedonia': 'MK', macedonia: 'MK', 'fyr macedonia': 'MK',
  russia: 'RU', moldova: 'MD', 'faroe islands': 'FO', usa: 'US', 'united states': 'US', holland: 'NL', netherlands: 'NL', 'the netherlands': 'NL',
  'south korea': 'KR', 'north korea': 'KP', 'ivory coast': 'CI', gibraltar: 'GI', 'san marino': 'SM', belarus: 'BY', ukraine: 'UA', georgia: 'GE' };
let GEO = null;
function loadGeo(dir) {
  const cc = Object.assign({}, COUNTRY_ALIAS);
  for (const line of fs.readFileSync(path.join(dir, 'countryInfo.txt'), 'utf8').split('\n')) {
    if (!line || line[0] === '#') continue;
    const f = line.split('\t');
    if (f[4]) cc[key(f[4])] = cc[key(f[4])] || f[0];
  }
  const idx = new Map();
  const text = fs.readFileSync(path.join(dir, 'cities500.txt'), 'utf8');
  let a = 0;
  while (a < text.length) {
    let b = text.indexOf('\n', a); if (b < 0) b = text.length;
    const f = text.slice(a, b).split('\t'); a = b + 1;
    if (f.length < 18 || f[6] !== 'P') continue;
    const c = { id: f[0], name: f[2] || f[1], lat: +f[4], lon: +f[5], cc: f[8], pop: +f[14] || 0, tz: f[17] };
    const names = new Set([key(f[1]), key(f[2])]);
    for (const n of (f[3] || '').split(',')) if (n.length <= 40 && /^[\x20-\x7e\u00c0-\u024f]+$/.test(n)) names.add(key(n));
    for (const n of names) {
      if (!n) continue;
      const k = n + '|' + c.cc, o = idx.get(k);
      if (!o || o.pop < c.pop) idx.set(k, c);
    }
  }
  GEO = { cc, idx };
  console.log(`geonames: ${idx.size} names`);
}
let VENUES = {};
const VENUES_FILE = () => path.join(DB, 'venues.json');
function placeOf(venue, home) {
  const vk = key(venue.city) + '|' + key(venue.country);
  if (VENUES[vk]) return VENUES[vk];
  if (GEO && venue.city) {
    const cc = GEO.cc[key(venue.country)];
    const tries = [venue.city, venue.city.split(/[\/,(]/)[0], venue.city.replace(/\b(fc|cf|sc|fk|bk)\b/ig, '')];
    for (const t of tries) {
      const c = cc && GEO.idx.get(key(t) + '|' + cc);
      if (c) return (VENUES[vk] = { name: venue.city, lat: Math.round(c.lat * 1e4) / 1e4, lon: Math.round(c.lon * 1e4) / 1e4, tz: c.tz, src: 'geonames', gid: c.id });
    }
  }
  const p = S.venuePlace({ venue, home }, CITIES);
  return { name: p.name, lat: p.lat, lon: p.lon, tz: p.tz, src: 'site', approx: p.approx || undefined };
}

/* ------------------------------------- ESPN -------------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
async function get(url) {
  for (let k = 0; k < 4; k++) {
    try {
      requests++;
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'astrocartography-football-db (github actions)' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (k === 3) throw e;
      await sleep(2000 * (k + 1));
    }
  }
}
async function pool(items, n, fn) {
  let i = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { failed++; console.warn('fail', it.id || it.url || it, e.message); } }
  }));
  return failed;
}
const ym = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
function monthRange(a, b) {
  const out = [];
  let y = +a.slice(0, 4), m = +a.slice(4, 6);
  while (y * 100 + m <= +b) { out.push(`${y}${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/* ------------------------------------- odds -------------------------------------- */
// American (+150, -200), fractional (4/1, EVS) or decimal (2.5) odds → implied probability
function prob(x) {
  if (x == null || x === '') return null;
  const s = String(x).trim();
  if (/^(evs|evens|even)$/i.test(s)) return 0.5;
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/))) return +m[2] / (+m[1] + +m[2]);
  if (/^[+-]\d+(\.\d+)?$/.test(s) || (typeof x === 'number' && Math.abs(x) >= 100)) { const v = parseFloat(s); return v < 0 ? -v / (-v + 100) : 100 / (v + 100); }
  const d = parseFloat(s);
  return d > 1 ? 1 / d : null;
}
// three prices → probabilities without the bookmaker's margin. Some old closing lines (Caesars, 2017–2019)
// price only the two wins: the draw is then what a usual three-way book (5% over 100) leaves for it
function norm3(h, d, a) {
  const ph = prob(h), pa = prob(a);
  let pd = prob(d);
  if (ph == null || pa == null) return null;
  const est = pd == null;
  if (est) pd = Math.max(0.03, 1.05 - ph - pa);
  const s = ph + pa + pd;
  const r = (x) => Math.round(x / s * 1000) / 1000;
  return Object.assign({ home: r(ph), draw: r(pd), away: r(pa) }, est ? { drawEst: true } : {});
}
// the scoreboard before kickoff: American moneylines, opening and current ("close")
function scoreboardOdds(c) {
  const o = c.odds && c.odds[0];
  if (!o) return null;
  const ml = o.moneyline || {};
  const side = (k, alt) => {
    const x = ml[k] || {};
    return { open: x.open && x.open.odds, close: (x.close && x.close.odds) || (alt && alt.moneyLine) };
  };
  const h = side('home', o.homeTeamOdds), d = side('draw', o.drawOdds), a = side('away', o.awayTeamOdds);
  if (!h.close || !a.close) return null;
  return { provider: (o.provider && o.provider.name) || '', close: { home: h.close, draw: d.close, away: a.close }, open: h.open && a.open ? { home: h.open, draw: d.open, away: a.open } : undefined };
}
// the summary after the match: Bet365's pre-match full-time result (the plain "odds" there are in-play)
function b365Odds(sm) {
  for (const o of sm.odds || []) {
    const to = o.bettingOdds && o.bettingOdds.teamOdds;
    if (!to || !to.preMatchFullTimeResultHome) continue;
    const v = (k) => to[k] && to[k].value;
    return { home: v('preMatchFullTimeResultHome'), draw: v('preMatchFullTimeResultDraw'), away: v('preMatchFullTimeResultAway') };
  }
  return null;
}
// ESPN's core API: the closing moneyline of a sportsbook, or as a last resort a model's win chances
function coreOdds(j) {
  let model = null;
  for (const it of (j && j.items) || []) {
    const name = (it.provider && it.provider.name) || '';
    const ho = it.homeTeamOdds || {}, ao = it.awayTeamOdds || {}, dr = it.drawOdds || {};
    if (/bloomberg/i.test(name)) {
      if (ho.winPercentage != null && ao.winPercentage != null && ho.winPercentage + ao.winPercentage > 0) model = { provider: name, home: ho.winPercentage, away: ao.winPercentage };
      continue;
    }
    if (/live/i.test(name) || (it.provider && it.provider.id === '2000')) continue;   // in-play prices
    const ml = (x) => (x.close && x.close.moneyLine && (x.close.moneyLine.american || x.close.moneyLine.alternateDisplayValue)) || (x.moneyLine != null ? String(x.moneyLine > 0 ? '+' + x.moneyLine : x.moneyLine) : null);
    const h = ml(ho), a = ml(ao);
    const d = ml(dr) || (it.close && it.close.draw && it.close.draw.american) || (it.current && it.current.draw && it.current.draw.american);
    if (h && a) return { odds: { provider: name, home: h, draw: d || undefined, away: a } };
  }
  return model ? { model } : null;
}
// the favourite by the best source at hand: the prices the site saw before kickoff come first
function favourite(r) {
  const o = r.odds || {};
  let p = null, src = null;
  if (o.espn && (p = norm3(o.espn.close.home, o.espn.close.draw, o.espn.close.away))) src = 'espn';
  else if (o.b365 && (p = norm3(o.b365.home, o.b365.draw, o.b365.away))) src = 'b365';
  else if (o.core && (p = norm3(o.core.home, o.core.draw, o.core.away))) src = 'core';
  else if (o.model) {
    // the model gives win chances of both teams; what is left is the draw
    const s = Math.max(1, o.model.home + o.model.away), r = (x) => Math.round(x * 1000) / 1000;
    p = { home: r(o.model.home / s), draw: r(Math.max(0, 1 - (o.model.home + o.model.away) / s)), away: r(o.model.away / s) }; src = 'model';
  }
  if (!p) return null;
  return { side: p.home >= p.away ? 'home' : 'away', src, p };
}

/* ------------------------------------ results ------------------------------------ */
function result(ev, sm) {
  const c = ev.competitions[0], st = c.status.type;
  const hc = sm && sm.header && sm.header.competitions && sm.header.competitions[0];
  const comp = (ha) => ((hc && hc.competitors) || c.competitors).find((x) => x.homeAway === ha) || {};
  const H_ = comp('home'), A_ = comp('away');
  const r = { status: st.name, home: +H_.score, away: +A_.score };
  if (H_.shootoutScore != null || A_.shootoutScore != null) r.so = { home: +H_.shootoutScore || 0, away: +A_.shootoutScore || 0 };
  // the score after 90 minutes: the same unless extra time was played; then goals of the first two periods
  r.ft90 = { home: r.home, away: r.away };
  if (/AET|PEN|EXTRA/i.test(st.name) && sm) {
    const hid = String((H_.team && H_.team.id) || (H_.id) || ''), hname = H_.team && H_.team.displayName;
    const goals = (sm.keyEvents || []).filter((k) => k.scoringPlay && !k.shootout);
    r.goals = goals.map((k) => ({ side: (k.team && (String(k.team.id) === hid || k.team.displayName === hname)) ? 'home' : 'away', min: k.clock && k.clock.displayValue, period: k.period && k.period.number }));
    if (r.goals.length === r.home + r.away) {
      const reg = r.goals.filter((g) => g.period <= 2);
      r.ft90 = { home: reg.filter((g) => g.side === 'home').length, away: reg.filter((g) => g.side === 'away').length };
    } else r.ft90 = null;
  }
  const w = (x) => (!x ? null : x.home > x.away ? 'home' : x.home < x.away ? 'away' : 'draw');
  r.winner90 = w(r.ft90);
  r.winner = r.so ? (r.so.home > r.so.away ? 'home' : 'away') : w(r);
  return r;
}

/* ----------------------------------- judgement ----------------------------------- */
function asMatch(r) {
  return { id: r.id, league: r.league, date: Date.parse(r.kickoff), venue: r.venue, home: { name: r.home.name }, away: { name: r.away.name } };
}
const r1 = (x) => Math.round(x * 10) / 10;
function judgement(r, extra) {
  const f = r.fav || { side: 'home', src: 'home' };
  const J = S.judge(asMatch(r), r.place, f.side, { extra: extra || 0 });
  const sideOf = (k) => J.teams[k].side;
  return {
    v: VERSION, fav: f.side, favSrc: f.src,
    winner: J.verdict.v === 'draw' ? 'draw' : J.verdict.side, strength: J.verdict.strength || null,
    score: { fav: J.score.fav, dog: J.score.dog }, diff: r1(J.diff),
    goals: { [sideOf('fav')]: J.verdict.score.fav, [sideOf('dog')]: J.verdict.score.dog },
    t: J.testimonies.map((t) => [t.team, t.w, t.kind, t.text, t.rule]),
    asc: r1(J.E.nat.asc), mc: r1(J.E.nat.mc),
  };
}
function judgeRecord(r, live) {
  if (!r.place) return;
  r.judge = judgement(r, 0);
  // with extra time or penalties the Moon's window is wider (6° and 7°): only the verdict is kept
  const alt = {};
  for (const x of [1, 2]) { const j = judgement(r, x); if (j.winner !== r.judge.winner || j.diff !== r.judge.diff) alt[x] = { winner: j.winner, diff: j.diff }; }
  if (Object.keys(alt).length) r.judge.alt = alt; else delete r.judge.alt;
  if (live) r.pre = { v: VERSION, at: new Date(now).toISOString(), fav: r.judge.fav, favSrc: r.judge.favSrc, winner: r.judge.winner, strength: r.judge.strength, diff: r.judge.diff };
}

/* ------------------------------------- base -------------------------------------- */
const months = new Map();      // 'YYYY-MM' → Map(id → record)
const dirty = new Set();
const fileOf = (key) => path.join(DB, 'matches', key + '.json');
function month(key) {
  if (!months.has(key)) {
    let m = new Map();
    try { m = new Map(Object.entries(JSON.parse(fs.readFileSync(fileOf(key), 'utf8')))); } catch (e) { /* new month */ }
    months.set(key, m);
  }
  return months.get(key);
}
const keyOf = (iso) => iso.slice(0, 7);
function find(id, iso) {
  const m = month(keyOf(iso));
  if (m.has(id)) return m;
  for (const [, mm] of months) if (mm.has(id)) return mm;
  return null;
}
function save() {
  for (const key of dirty) {
    const m = months.get(key);
    const rows = [...m.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
    fs.mkdirSync(path.dirname(fileOf(key)), { recursive: true });
    fs.writeFileSync(fileOf(key), '{\n' + rows.map((r) => JSON.stringify(r.id) + ': ' + JSON.stringify(r)).join(',\n') + '\n}\n');
  }
}
function loadAll() {
  let files = [];
  try { files = fs.readdirSync(path.join(DB, 'matches')).filter((f) => f.endsWith('.json')); } catch (e) { /* empty */ }
  for (const f of files) month(f.replace('.json', ''));
}

/* ESPN sometimes keeps no venue for a match of a domestic league (all of Ligue 1 2020/21, a few dozen elsewhere):
   such a match is played at the home side's ground, so the place it had in its other home matches is taken.
   Cup competitions are left out, their finals are on neutral grounds. */
const DOMESTIC = new Set(['eng.1', 'esp.1', 'fra.1']);
function fillFromTeam() {
  const seen = new Map();                                       // league|team → Map(place json → count)
  for (const [, m] of months) for (const r of m.values()) {
    if (!DOMESTIC.has(r.league) || !r.venue || !r.venue.city || !r.place || r.place.approx || !r.home || !r.home.id) continue;
    const k = r.league + '|' + r.home.id, pj = JSON.stringify(r.place);
    if (!seen.has(k)) seen.set(k, new Map());
    seen.get(k).set(pj, (seen.get(k).get(pj) || 0) + 1);
  }
  let n = 0;
  for (const [key, m] of months) for (const r of m.values()) {
    if (!DOMESTIC.has(r.league) || (r.venue && r.venue.city) || !(r.place && r.place.approx) || !r.home || !r.home.id) continue;
    const c = seen.get(r.league + '|' + r.home.id);
    if (!c) continue;
    const best = [...c].sort((a, b) => b[1] - a[1])[0][0];
    r.place = Object.assign(JSON.parse(best), { src: 'team' });
    delete r.judge;
    dirty.add(key); n++;
  }
  if (n) console.log(`places from the home side's other matches: ${n}`);
}

/* the facts of one match from the scoreboard; the record moves to another month if the kickoff moved */
function upsert(ev, lg) {
  const c = ev.competitions[0], t = Date.parse(ev.date), iso = new Date(t).toISOString().slice(0, 16) + 'Z';
  const side = (ha) => { const x = c.competitors.find((y) => y.homeAway === ha) || {}; return { id: x.team && x.team.id, name: x.team && (x.team.displayName || x.team.name) }; };
  let m = find(ev.id, iso), r = m && m.get(ev.id);
  if (r && keyOf(r.kickoff) !== keyOf(iso)) { m.delete(ev.id); dirty.add(keyOf(r.kickoff)); m = null; }
  if (!r) r = { id: ev.id, league: lg };
  const v = c.venue || {};
  const venue = { name: v.fullName || '', city: (v.address && v.address.city) || '', country: (v.address && v.address.country) || '' };
  const before = JSON.stringify([r.kickoff, r.venue, r.place]);
  Object.assign(r, { kickoff: iso, home: side('home'), away: side('away'), venue });
  if (!r.place || r.place.approx || before !== JSON.stringify([r.kickoff, r.venue, r.place])) r.place = placeOf(venue, r.home);
  if (before !== JSON.stringify([r.kickoff, r.venue, r.place])) {
    delete r.judge;                                              // another moment or place: another chart
    if (r.pre && Date.parse(r.kickoff) > now) delete r.pre;
  }
  month(keyOf(iso)).set(ev.id, r);
  dirty.add(keyOf(iso));
  return r;
}

async function finish(r, ev) {
  const sm = await get(`${SITE}${r.league}/summary?event=${r.id}`);
  r.result = result(ev, sm);
  r.odds = r.odds || {};
  const b = sm && b365Odds(sm);
  if (b) r.odds.b365 = b;
  if (!r.odds.espn && !r.odds.b365) {
    const co = coreOdds(await get(`${CORE}${r.league}/events/${r.id}/competitions/${r.id}/odds`).catch(() => null));
    if (co && co.odds) r.odds.core = co.odds;
    if (co && co.model) r.odds.model = co.model;
  }
}

const SKIP = /POSTPONED|CANCELED|CANCELLED|ABANDONED|SUSPENDED|FORFEIT|DELAYED/i;
async function processEvent(ev, lg, live) {
  const c = ev.competitions[0], st = c.status.type, t = Date.parse(ev.date);
  const r = upsert(ev, lg);
  r.status = SKIP.test(st.name) ? st.name.replace('STATUS_', '').toLowerCase() : st.state;
  if (SKIP.test(st.name)) return;
  if (st.state === 'pre') {
    const o = scoreboardOdds(c);
    if (o) { r.odds = r.odds || {}; r.odds.espn = Object.assign(o, { at: new Date(now).toISOString() }); }
    r.fav = favourite(r) || undefined;
    if (live && t - now < 3 * DAY) judgeRecord(r, true);
    return;
  }
  if (st.state === 'post' && st.completed !== false && !r.result) {
    await finish(r, ev);
    r.fav = favourite(r) || undefined;
  }
  if (!r.judge || r.judge.v !== VERSION || (r.fav && r.judge.fav !== r.fav.side)) judgeRecord(r, false);
}

/* -------------------------------- table and summary ------------------------------- */
const LG_RU = Object.fromEntries(S.LEAGUES.map((l) => [l.id, l.ru]));
function mskTime(iso) {
  const d = new Date(Date.parse(iso) + 3 * H);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
const pct = (x) => (x == null ? '' : String(Math.round(x * 100)));
function writeTable(all) {
  const head = ['Дата МСК', 'Турнир', 'Хозяева', 'Гости', 'Счёт', 'Итог 90 мин', 'Фаворит', 'Фаворит, %', 'Ничья, %', 'Кэфы', 'Прогноз карты', 'Сила', 'Баллы фаворита', 'Баллы аутсайдера', 'Карта угадала', 'Фаворит выиграл', 'Прогноз до матча', 'Место примерное'];
  const q = (s) => (/[;"\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const name = (r, side) => (side === 'home' ? r.home.name : side === 'away' ? r.away.name : side === 'draw' ? 'ничья' : '');
  const lines = [head.join(';')];
  for (const r of all) {
    if (!r.result || !r.judge) continue;
    const res = r.result, j = r.judge, f = r.fav;
    lines.push([mskTime(r.kickoff), LG_RU[r.league] || r.league, r.home.name, r.away.name,
      `${res.home}:${res.away}${res.so ? ` (пен. ${res.so.home}:${res.so.away})` : ''}${/AET/.test(res.status) ? ' доп.' : ''}`,
      res.ft90 ? name(r, res.winner90) : '?', f ? name(r, f.side) : '', f ? pct(f.p[f.side]) : '', f ? pct(f.p.draw) : '', f ? f.src : '',
      name(r, j.winner), j.strength || '', String(j.score.fav).replace('.', ','), String(j.score.dog).replace('.', ','),
      res.winner90 ? (j.winner === res.winner90 ? 'да' : 'нет') : '', f && res.winner90 ? (f.side === res.winner90 ? 'да' : 'нет') : '',
      r.pre ? name(r, r.pre.winner) : '', r.place && r.place.approx ? 'да' : ''].map(q).join(';'));
  }
  fs.writeFileSync(path.join(DB, 'football.csv'), '﻿' + lines.join('\r\n') + '\r\n');
}
const KIND_RU = { cusp: 'Управители у куспидов углов', moon: 'Луна у углов и по пути', lastmoon: 'Заключительный аспект Луны', fortuna: 'Фортуна и её диспозитор',
  node: 'Узлы', sun: 'Сожжение', outer: 'Уран и Плутон', saturn: 'Сатурн-вредитель', other: 'Прочее' };
/* actual share against the share the odds promised: n, actual %, expected %, difference and its 2σ */
function vsOdds(rows, sideOf) {
  let n = 0, hit = 0, exp = 0, v = 0;
  for (const r of rows) {
    const side = sideOf(r), p = r.fav.p[side];
    if (p == null) continue;
    n++; exp += p; v += p * (1 - p);
    if (r.result.winner90 === side) hit++;
  }
  if (!n) return null;
  return { n, act: hit / n, exp: exp / n, diff: (hit - exp) / n, se2: 2 * Math.sqrt(v) / n };
}
const pp = (x) => `${Math.round(x * 100)}%`;
const sgn = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10).toString().replace('.', ',')}`;
function row(label, st) {
  if (!st) return `| ${label} | — | — | — | — |`;
  const sure = Math.abs(st.diff) > st.se2 ? ' **' : '';
  return `| ${label} | ${st.n} | ${pp(st.act)} | ${pp(st.exp)} | ${sgn(st.diff)} ± ${(Math.round(st.se2 * 1000) / 10).toString().replace('.', ',')}${sure} |`;
}
function summary(all) {
  const done = all.filter((r) => r.result && r.result.winner90 && r.judge && r.fav && !(r.place && r.place.approx));
  const live = done.filter((r) => r.pre);
  const sides = done.filter((r) => r.judge.winner !== 'draw');
  const picked = (r) => r.judge.winner;
  const by = {};
  for (const r of all) by[r.league] = (by[r.league] || 0) + 1;
  const T = ['| | Матчей | Вышло | По ставкам | Разница, п. п. |', '|---|---|---|---|---|'];
  const lines = [
    '# Сводка', '',
    `Обновлено ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC. Версия расчёта: \`${VERSION}\`.`, '',
    `Матчей в базе: ${all.length} (${Object.entries(by).map(([k, v]) => `${LG_RU[k] || k} ${v}`).join(', ')}). Сыграно, с коэффициентами и точным местом стадиона: ${done.length}; из них с прогнозом, записанным до матча: ${live.length}.`, '',
    'Везде сравнивается, как часто событие случилось на самом деле («Вышло») и как часто его обещали ставки без маржи букмекера («По ставкам»). ' +
    'Если карта что-то знает, «Вышло» должно быть заметно выше. «±» — две стандартные ошибки: разница меньше неё может быть случайной; ** — разница больше.', '',
    '## Прогноз карты', '', ...T,
    row('Фаворит по ставкам выиграл (для сравнения)', vsOdds(done, (r) => r.fav.side)),
    row('Карта назвала победителя — он выиграл', vsOdds(sides, picked)),
    row('— карта за фаворита', vsOdds(sides.filter((r) => r.judge.winner === r.fav.side), picked)),
    row('— карта за аутсайдера', vsOdds(sides.filter((r) => r.judge.winner !== r.fav.side), picked)),
    row('— явный перевес', vsOdds(sides.filter((r) => r.judge.strength === 'явный'), picked)),
    row('— умеренный перевес', vsOdds(sides.filter((r) => r.judge.strength === 'умеренный'), picked)),
    row('Карта за ничью — была ничья', vsOdds(done.filter((r) => r.judge.winner === 'draw'), () => 'draw')),
    row('Прогноз до матча — победитель угадан', vsOdds(live.filter((r) => r.pre.winner !== 'draw'), (r) => r.pre.winner)), '',
    '## Свидетельства по видам', '',
    'Команда, в пользу которой в карте есть хотя бы одно свидетельство этого вида: как часто она выигрывала.', '', ...T,
  ];
  for (const kind of Object.keys(KIND_RU)) for (const team of ['fav', 'dog']) {
    const rows = done.filter((r) => r.judge.t.some((t) => t[2] === kind && t[0] === team));
    if (rows.length < 30) continue;
    const sideOf = (r) => (team === 'fav' ? r.fav.side : r.fav.side === 'home' ? 'away' : 'home');
    lines.push(row(`${KIND_RU[kind]} — за ${team === 'fav' ? 'фаворита' : 'аутсайдера'}`, vsOdds(rows, sideOf)));
  }
  lines.push('', 'Прогнозы прошлых сезонов посчитаны задним числом; по ним можно искать закономерности. Проверять найденное честно — только на матчах, которых не было при поиске (например, на новых, с прогнозом до матча).', '');
  fs.writeFileSync(path.join(DB, 'SUMMARY.md'), lines.join('\n'));
  fs.writeFileSync(path.join(DB, 'index.json'), JSON.stringify({ updated: now, version: VERSION, matches: all.length, finished: done.length, live: live.length }));
}

/* -------------------------------------- run --------------------------------------- */
(async () => {
  const t0 = Date.now();
  let failed = 0;
  try { VENUES = JSON.parse(fs.readFileSync(VENUES_FILE(), 'utf8')); } catch (e) { VENUES = {}; }
  if (opt('--geonames')) loadGeo(opt('--geonames'));
  if (args.includes('--rejudge')) {
    loadAll();
    fillFromTeam();
    for (const [key, m] of months) for (const r of m.values()) {
      const f = favourite(r) || undefined;
      if (JSON.stringify(f) !== JSON.stringify(r.fav)) { r.fav = f; dirty.add(key); }
      if (r.place && (!r.judge || r.judge.v !== VERSION || (r.fav && r.judge.fav !== r.fav.side))) { judgeRecord(r, false); dirty.add(key); }
    }
  } else {
    const range = opt('--months');
    const live = !range;
    const list = live ? [...new Set([ym(now - 7 * DAY), ym(now), ym(now + 3 * DAY)])] : monthRange(...range.split('-'));
    const boards = [];
    failed += await pool(LEAGUES.flatMap((lg) => list.map((mo) => ({ lg, mo, url: `${SITE}${lg}/scoreboard?dates=${mo}&limit=400` }))), 4, async (x) => {
      const j = await get(x.url);
      if (j) boards.push(Object.assign(x, { j }));
    });
    if (!boards.length) { console.error('no scoreboards'); process.exit(1); }
    const evs = [];
    for (const b of boards) for (const ev of b.j.events || []) {
      const t = Date.parse(ev.date);
      if (live && (t < now - 7 * DAY || t > now + 3 * DAY)) continue;
      if (!live && t > now) continue;
      evs.push({ ev, lg: b.lg, id: ev.id });
    }
    failed += await pool(evs, 6, ({ ev, lg }) => processEvent(ev, lg, live));
    console.log(`events ${evs.length}`);
    fillFromTeam();
    for (const [key, m] of months) for (const r of m.values()) if (r.place && !r.judge && r.result) { judgeRecord(r, false); dirty.add(key); }
  }
  save();
  fs.mkdirSync(DB, { recursive: true });
  fs.writeFileSync(VENUES_FILE(), '{\n' + Object.keys(VENUES).sort().map((k) => JSON.stringify(k) + ': ' + JSON.stringify(VENUES[k])).join(',\n') + '\n}\n');
  loadAll();
  const all = [...months.values()].flatMap((m) => [...m.values()]).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  writeTable(all);
  summary(all);
  console.log(`version ${VERSION}, months written ${dirty.size}, matches ${all.length}, requests ${requests}, failed ${failed}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})().catch((e) => { console.error(e); process.exit(1); });
