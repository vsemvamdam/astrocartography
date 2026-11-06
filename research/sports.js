/* Frawley's event chart over past seasons of other sports, to see where the verdict comes true often.
   node research/sports.js <out-dir> --sport nhl|nba|mlb|nfl|tennis --geonames <dir> [--from YYYY-MM-DD --to YYYY-MM-DD]
   For every finished game: the scheduled start (tennis: the start ESPN records), the arena's town by GeoNames,
   the favourite by the bookmakers (US sports: the median two-way moneyline of ESPN's core API; tennis has no odds
   there, so the player with the higher Elo rating, built from ESPN's own results), the winner, and the chart's verdict by js/sport.js — the same judgement
   as for football: the favourite has I and X, the underdog VII and IV.
   Writes <out-dir>/<sport>/games.json, summary.json and SUMMARY.md. Needs Node 18+ and astronomy-engine 2.1.19. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.Astronomy = require(process.env.ASTRONOMY_JS || 'astronomy-engine');
for (const f of ['data', 'acg-core', 'natal', 'horary', 'sport']) require(path.join(ROOT, 'js', f + '.js'));
const S = globalThis.SPORT;

const args = process.argv.slice(2);
const OUT = args[0];
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
const SPORT = opt('--sport');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/';
const CORE = 'https://sports.core.api.espn.com/v2/sports/';
const DAY = 86400000;
const NOW = Date.now();

const CONF = {
  nhl: { ru: 'НХЛ (хоккей)', paths: ['hockey/nhl'], from: '2018-10-01', step: 1, season: (d) => (d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1) },
  nba: { ru: 'НБА (баскетбол)', paths: ['basketball/nba'], from: '2018-10-01', step: 1, season: (d) => (d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1) },
  mlb: { ru: 'MLB (бейсбол)', paths: ['baseball/mlb'], from: '2019-03-15', step: 1, season: (d) => d.getUTCFullYear() },
  nfl: { ru: 'NFL (американский футбол)', paths: ['football/nfl'], from: '2018-09-01', step: 1, season: (d) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1) },
  tennis: { ru: 'Теннис (ATP и WTA, одиночки)', paths: ['tennis/atp', 'tennis/wta'], from: '2019-01-01', step: 5, season: (d) => d.getUTCFullYear() },
};
const C = CONF[SPORT];
if (!OUT || !C) { console.error('usage: node research/sports.js <out> --sport ' + Object.keys(CONF).join('|')); process.exit(2); }

/* ------------------------------------ fetching ------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0, failures = 0;
async function get(url) {
  for (let k = 0; k < 4; k++) {
    try {
      requests++;
      const r = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'user-agent': 'astrocartography-research (github actions)' } });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (k === 3) { failures++; console.warn('fail', url, e.message); return null; }
      await sleep(2000 * (k + 1));
    }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { console.warn('fail', e.message); } } }));
}
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/* ------------------------------------- places ------------------------------------- */
const key = S.venueKey;
const US_STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' };
const US_ABBR = new Set(Object.values(US_STATES));
// GeoNames admin1 codes of Canadian provinces
const CA_PROV = { AB: '01', BC: '02', MB: '03', NB: '04', NL: '05', NS: '07', ON: '08', PE: '09', QC: '10', SK: '11', alberta: '01', 'british columbia': '02', manitoba: '03',
  'new brunswick': '04', newfoundland: '05', 'nova scotia': '07', ontario: '08', 'prince edward island': '09', quebec: '10', saskatchewan: '11' };
const COUNTRY_ALIAS = { usa: 'US', 'united states': 'US', 'u s a': 'US', canada: 'CA', england: 'GB', 'great britain': 'GB', uk: 'GB', 'united kingdom': 'GB', scotland: 'GB', wales: 'GB',
  'china pr': 'CN', china: 'CN', 'korea republic': 'KR', 'south korea': 'KR', korea: 'KR', 'chinese taipei': 'TW', 'hong kong': 'HK', 'hong kong china': 'HK', 'czech republic': 'CZ',
  czechia: 'CZ', turkiye: 'TR', turkey: 'TR', russia: 'RU', 'united arab emirates': 'AE', uae: 'AE', holland: 'NL', netherlands: 'NL', 'the netherlands': 'NL', 'bosnia herzegovina': 'BA',
  'bosnia and herzegovina': 'BA', 'puerto rico': 'PR', mexico: 'MX', japan: 'JP', germany: 'DE', australia: 'AU', 'new zealand': 'NZ', 'saudi arabia': 'SA', qatar: 'QA' };
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
    const c = { lat: +f[4], lon: +f[5], cc: f[8], a1: f[10], pop: +f[14] || 0, tz: f[17] };
    const names = new Set([key(f[1]), key(f[2])]);
    for (const n of (f[3] || '').split(',')) if (n.length <= 40 && /^[\x20-\x7eÀ-ɏ]+$/.test(n)) names.add(key(n));
    for (const n of names) {
      if (!n) continue;
      for (const k of [n + '|' + c.cc, n + '|' + c.cc + '|' + c.a1]) { const o = idx.get(k); if (!o || o.pop < c.pop) idx.set(k, c); }
    }
  }
  GEO = { cc, idx };
  console.log(`geonames: ${idx.size} names`);
}
const CITY_ALIAS = { mallorca: 'Santa Ponsa', 'los cabos': 'Cabo San Lucas', sardinia: 'Cagliari' };
const placeCache = new Map();
// city, state (US / Canada) and country as ESPN gives them → {lat, lon, tz} or null
function placeOf(city, state, country) {
  const ck = [city, state, country].join('|');
  if (placeCache.has(ck)) return placeCache.get(ck);
  if (CITY_ALIAS[key(city)]) city = CITY_ALIAS[key(city)];
  let cc = key(city) === 'hong kong' ? 'HK' : country ? GEO.cc[key(country)] : null, a1 = null;
  const st = String(state || '').trim();
  if (!cc && (US_ABBR.has(st.toUpperCase()) || US_STATES[key(st)])) cc = 'US';
  if (!cc && (CA_PROV[st.toUpperCase()] || CA_PROV[key(st)])) cc = 'CA';
  if (cc === 'US') a1 = US_ABBR.has(st.toUpperCase()) ? st.toUpperCase() : US_STATES[key(st)] || null;
  if (cc === 'CA') a1 = CA_PROV[st.toUpperCase()] || CA_PROV[key(st)] || null;
  const names = [city, String(city || '').replace(/^st\.? /i, 'saint '), String(city || '').replace(/^saint /i, 'st '), String(city || '').split(/[\/,(]/)[0]];
  let hit = null;
  for (const n of names) {
    if (!n) continue;
    hit = (a1 && GEO.idx.get(key(n) + '|' + cc + '|' + a1)) || (cc && GEO.idx.get(key(n) + '|' + cc));
    if (hit) break;
  }
  const p = hit ? { lat: Math.round(hit.lat * 1e4) / 1e4, lon: Math.round(hit.lon * 1e4) / 1e4, tz: hit.tz } : null;
  placeCache.set(ck, p);
  return p;
}

/* -------------------------------------- odds -------------------------------------- */
function am(x) {
  if (x == null || x === '' || x === 0) return null;
  const s = String(x).trim();
  if (/^(evs|even|evens)$/i.test(s)) return 0.5;
  const v = parseFloat(s.replace('+', ''));
  if (!isFinite(v) || Math.abs(v) < 100) return null;
  return v < 0 ? -v / (-v + 100) : 100 / (v + 100);
}
// the median of the sportsbooks' two-way moneylines; three-way (regulation) prices, puck and run lines fall out by
// their sum, in-play prices and models by name
function coreOdds(j) {
  const ps = [];
  let det = null;
  for (const it of (j && j.items) || []) {
    const name = (it.provider && it.provider.name) || '';
    if (/live|numberfire|teamrankings|accuscore|consensus|bloomberg/i.test(name)) continue;
    if (!det && it.details) det = it.details;
    const ml = (x) => x && ((x.close && x.close.moneyLine && x.close.moneyLine.american) || x.moneyLine);
    const h = am(ml(it.homeTeamOdds)), a = am(ml(it.awayTeamOdds));
    if (h == null || a == null) continue;
    const s = h + a;
    if (s < 0.99 || s > 1.15) continue;
    ps.push(h / s);
  }
  if (!ps.length) return det ? { details: det } : null;
  ps.sort((x, y) => x - y);
  const m = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
  return { home: Math.round(m * 1000) / 1000, books: ps.length };
}

/* ------------------------------------ tennis Elo ------------------------------------ */
/* ESPN has no tennis odds and keeps ranks only for the top players, so the favourite is the player with the higher
   Elo rating before the match, built from ESPN's own results since 2019 (K = 250 / (matches + 5)^0.4, as in the
   usual tennis Elo). A match is judged once both players have at least 10 rated matches; retirements and walkovers
   change nothing. */
function tennisElo(list) {
  const R = new Map(), N = new Map();
  let n = 0;
  for (const g of list) {
    const a = g.home.id, b = g.away.id;
    if (!a || !b) continue;
    const ra = R.get(a) || 1500, rb = R.get(b) || 1500, na = N.get(a) || 0, nb = N.get(b) || 0;
    const pA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
    if (na >= 10 && nb >= 10) {
      g.fav = { side: pA >= 0.5 ? 'home' : 'away', p: Math.round(Math.max(pA, 1 - pA) * 1000) / 1000, elo: [Math.round(ra), Math.round(rb)], src: 'elo' };
      n++;
    }
    if (g.ret) continue;
    const sA = g.winner === 'home' ? 1 : 0, K = (m) => 250 / Math.pow(m + 5, 0.4);
    R.set(a, ra + K(na) * (sA - pA)); R.set(b, rb + K(nb) * ((1 - sA) - (1 - pA)));
    N.set(a, na + 1); N.set(b, nb + 1);
  }
  return n;
}

/* ------------------------------------ collecting ----------------------------------- */
const games = new Map();
function competitionsOf(ev) {
  const out = [];
  for (const c of ev.competitions || []) out.push({ c, ev, grp: null });
  for (const g of ev.groupings || []) for (const c of g.competitions || []) out.push({ c, ev, grp: g.grouping && g.grouping.slug });
  return out;
}
function take({ c, ev, grp }, lgPath) {
  if (games.has(c.id)) return;
  const st = c.status && c.status.type;
  if (!st || st.state !== 'post' || st.completed === false) return;
  if (/POSTPONED|CANCELED|CANCELLED|ABANDONED|FORFEIT|SUSPENDED/i.test(st.name)) return;
  if (SPORT === 'tennis' && !/singles/.test(grp || '')) return;
  if (c.timeValid === false) return;
  const t = Date.parse(c.date || ev.date);
  if (!isFinite(t)) return;
  const side = (ha) => c.competitors.find((x) => x.homeAway === ha) || {};
  const H = side('home'), A = side('away');
  const nm = (x) => (x.team && (x.team.displayName || x.team.name)) || (x.athlete && x.athlete.displayName) || '';
  if (!nm(H) || !nm(A)) return;
  let winner = H.winner ? 'home' : A.winner ? 'away' : null;
  if (!winner && H.score != null && A.score != null && +H.score !== +A.score) winner = +H.score > +A.score ? 'home' : 'away';
  if (!winner) return;                                              // ties (NFL) and unknown results
  const v = c.venue || {};
  let city, state, country;
  if (SPORT === 'tennis') {
    const parts = String(v.fullName || (ev.venue && ev.venue.displayName) || '').split(',').map((s) => s.trim());
    city = parts[0]; country = parts[parts.length - 1]; state = parts.length > 2 ? parts[1] : '';
  } else {
    city = v.address && v.address.city; state = v.address && v.address.state; country = v.address && v.address.country;
  }
  const note = ((c.notes || [])[0] || {}).text || '';
  games.set(c.id, {
    id: c.id, ev: ev.id, lg: lgPath, grp: grp || undefined, t: new Date(t).toISOString().slice(0, 16) + 'Z', season: C.season(new Date(t)),
    home: { name: nm(H), abbr: H.team && H.team.abbreviation, id: SPORT === 'tennis' ? H.id : undefined },
    away: { name: nm(A), abbr: A.team && A.team.abbreviation, id: SPORT === 'tennis' ? A.id : undefined },
    venue: { name: v.fullName || '', city: city || '', state: state || '', country: country || '' }, neutral: !!c.neutralSite || undefined,
    winner, detail: st.shortDetail || st.description, ret: SPORT === 'tennis' && /\bret\b|w\/o|walkover|def\b/i.test(note) ? true : undefined,
  });
}

/* ------------------------------------ judgement ------------------------------------ */
const r1 = (x) => Math.round(x * 10) / 10;
function judgeGame(g) {
  const m = { id: g.id, date: Date.parse(g.t), venue: g.venue, home: { name: g.home.name }, away: { name: g.away.name } };
  const J = S.judge(m, g.place, g.fav.side, { extra: 0 });
  const J1 = S.judge(m, g.place, g.fav.side, { extra: 1 });
  const w = J.verdict.v;                                             // 'fav' | 'dog' | 'draw'
  return {
    w, side: w === 'draw' ? null : J.verdict.side, str: J.verdict.strength || null, diff: r1(J.diff), sf: J.score.fav, sd: J.score.dog,
    w6: J1.verdict.v !== w ? J1.verdict.v : undefined,
    rules: [...new Set(J.testimonies.map((t) => t.team + ':' + t.rule))],
  };
}

/* ------------------------------------ statistics ------------------------------------ */
function stat(rows, sideOf) {
  let n = 0, hit = 0, exp = 0, v = 0, nq = 0;
  for (const g of rows) {
    const side = sideOf(g);
    if (!side) continue;
    n++;
    if (g.winner === side) hit++;
    const p = g.fav.p != null ? (side === g.fav.side ? g.fav.p : 1 - g.fav.p) : null;
    if (p != null) { nq++; exp += p; v += p * (1 - p); }
  }
  if (!n) return null;
  const o = { n, act: hit / n };
  if (nq === n) { o.exp = exp / n; o.diff = o.act - o.exp; o.se2 = 2 * Math.sqrt(v) / n; }
  return o;
}
const pc = (x) => (x == null ? '—' : `${(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}%`);
const pp = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}`);
function line(label, st, favOnSame) {
  if (!st) return `| ${label} | 0 | — | — | — | — |`;
  const sure = st.diff != null && Math.abs(st.diff) > st.se2 ? ' **' : '';
  return `| ${label} | ${st.n} | ${pc(st.act)} | ${pc(favOnSame && favOnSame.act)} | ${pc(st.exp)} | ${st.diff != null ? `${pp(st.diff)} ± ${(Math.round(st.se2 * 1000) / 10).toFixed(1).replace('.', ',')}${sure}` : '—'} |`;
}
function summarize(list) {
  const ok = list.filter((g) => g.fav && g.fav.p != null && g.j);
  const favSide = (g) => g.fav.side;
  const picks = ok.filter((g) => g.j.w !== 'draw');
  const pick = (g) => g.j.side;
  const S_ = {
    sport: SPORT, ru: C.ru, games: list.length, judged: ok.length, picks: picks.length,
    seasons: [...new Set(ok.map((g) => g.season))].sort(),
    fav: stat(ok, favSide), chart: stat(picks, pick), chartFavSame: stat(picks, favSide),
    forFav: stat(picks.filter((g) => g.j.w === 'fav'), pick), forDog: stat(picks.filter((g) => g.j.w === 'dog'), pick),
    clear: stat(picks.filter((g) => g.j.str === 'явный'), pick), clearFav: stat(picks.filter((g) => g.j.str === 'явный'), favSide),
    moderate: stat(picks.filter((g) => g.j.str === 'умеренный'), pick),
    early: stat(picks.filter((g) => g.season < 2023), pick), late: stat(picks.filter((g) => g.season >= 2023), pick),
    bySeason: {}, rules: [],
  };
  for (const s of S_.seasons) S_.bySeason[s] = { chart: stat(picks.filter((g) => g.season === s), pick), fav: stat(ok.filter((g) => g.season === s), favSide) };
  // every rule: the side it speaks for, how often that side won against the odds
  const byRule = new Map();
  for (const g of ok) for (const tr of g.j.rules) {
    const [team, rule] = tr.split(/:(.*)/s);
    const k = team + ':' + rule;
    if (!byRule.has(k)) byRule.set(k, []);
    byRule.get(k).push(g);
  }
  for (const [k, rows] of byRule) {
    if (rows.length < 150) continue;
    const team = k.slice(0, 3);
    const st = stat(rows, (g) => (team === 'fav' ? g.fav.side : g.fav.side === 'home' ? 'away' : 'home'));
    S_.rules.push(Object.assign({ rule: k }, st, { z: st.diff / (st.se2 / 2) }));
  }
  S_.rules.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return S_;
}
function markdown(S_, extra) {
  const BY = SPORT === 'tennis' ? 'По рейтингу' : 'По ставкам';
  const T = ['| | Игр | Угадано | Фаворит в тех же играх | ' + BY + ' | Разница, п. п. |', '|---|---|---|---|---|---|'];
  const L = [`# ${S_.ru}: карта Фроули против ставок`, '',
    `Сезоны ${S_.seasons[0]}–${S_.seasons[S_.seasons.length - 1]}. Сыгранных игр: ${S_.games}; с коэффициентами и точным местом: ${S_.judged}; карта назвала победителя в ${S_.picks} (${pc(S_.picks / S_.judged)}), в остальных свидетельства уравновешены.`, '',
    '«Угадано» — как часто побеждал тот, кого назвала карта. «Фаворит в тех же играх» — сколько угадал бы человек, всегда ставящий на фаворита. «По ставкам» — сколько обещали коэффициенты без маржи. Если карта что-то знает, «Угадано» должно быть заметно выше «По ставкам». «±» — две стандартные ошибки; ** — разница больше неё.', '',
    ...T,
    ...(SPORT === 'tennis' ? ['', 'В теннисе у ESPN нет коэффициентов, поэтому фаворит — игрок с более высоким рейтингом Эло перед матчем (посчитан по результатам ESPN с 2019 года, учитываются игроки, у которых уже не меньше 10 матчей), а «По рейтингу» — его шанс по Эло. Время матча — фактическое начало по ESPN: назначенного времени у большинства теннисных матчей нет.', ''] : []),
    line(SPORT === 'tennis' ? 'Фаворит по рейтингу (для сравнения)' : 'Фаворит по ставкам (для сравнения)', S_.fav),
    line('Карта назвала победителя', S_.chart, S_.chartFavSame),
    line('— карта за фаворита', S_.forFav),
    line('— карта за аутсайдера', S_.forDog),
    line('— явный перевес', S_.clear, S_.clearFav),
    line('— умеренный перевес', S_.moderate),
    line('— сезоны до 2023', S_.early),
    line('— сезоны с 2023', S_.late), '',
    '## По сезонам', '', '| Сезон | Карта: игр | Угадано | По ставкам | Разница | Фаворит выиграл |', '|---|---|---|---|---|---|',
    ...S_.seasons.map((s) => { const b = S_.bySeason[s]; return `| ${s} | ${b.chart ? b.chart.n : 0} | ${pc(b.chart && b.chart.act)} | ${pc(b.chart && b.chart.exp)} | ${b.chart ? pp(b.chart.diff) : '—'} | ${pc(b.fav && b.fav.act)} |`; }), '',
    '## Правила с самым большим отклонением', '', 'Сторона, за которую говорит правило: как часто она выигрывала против обещанного ставками. Правил несколько десятков, поэтому одно-два с ** могут выйти случайно.', '',
    '| Правило | Игр | Вышло | По ставкам | Разница, п. п. |', '|---|---|---|---|---|',
    ...S_.rules.slice(0, 15).map((r) => `| \`${r.rule}\` | ${r.n} | ${pc(r.act)} | ${pc(r.exp)} | ${pp(r.diff)} ± ${(Math.round(r.se2 * 1000) / 10).toFixed(1).replace('.', ',')}${Math.abs(r.diff) > r.se2 ? ' **' : ''} |`),
    '', ...(extra || [])];
  return L.join('\n') + '\n';
}

/* --------------------------------------- run --------------------------------------- */
(async () => {
  const t0 = Date.now();
  loadGeo(opt('--geonames'));
  const days = [];
  const end = opt('--to') ? Date.parse(opt('--to') + 'T12:00:00Z') : NOW - DAY;
  for (let d = Date.parse((opt('--from') || C.from) + 'T12:00:00Z'); d <= end; d += C.step * DAY) days.push(d);
  for (const p of C.paths) {
    let k = 0;
    await pool(days, 6, async (d) => {
      const j = await get(`${SITE}${p}/scoreboard?dates=${ymd(d)}&limit=400`);
      for (const ev of (j && j.events) || []) for (const x of competitionsOf(ev)) take(x, p);
      if (++k % 200 === 0) console.log(`${p}: ${k}/${days.length} days, ${games.size} games`);
    });
  }
  console.log(`${games.size} finished games, ${requests} requests`);

  const list = [...games.values()].sort((a, b) => a.t.localeCompare(b.t));
  let placed = 0, odds = 0;
  for (const g of list) { g.place = placeOf(g.venue.city, g.venue.state, g.venue.country); if (g.place) placed++; }
  if (SPORT === 'tennis') {
    odds = tennisElo(list);
  } else {
    const [sp, lg] = C.paths[0].split('/');
    let k = 0;
    await pool(list, 8, async (g) => {
      const o = coreOdds(await get(`${CORE}${sp}/leagues/${lg}/events/${g.ev}/competitions/${g.id}/odds`));
      if (o && o.home != null) { g.fav = { side: o.home >= 0.5 ? 'home' : 'away', p: Math.max(o.home, 1 - o.home), books: o.books, src: 'core' }; odds++; }
      else if (o && o.details) {
        const m = String(o.details).match(/^([A-Z]{2,4})\s+-/);
        if (m) g.fav = { side: m[1] === g.home.abbr ? 'home' : m[1] === g.away.abbr ? 'away' : null, p: null, src: 'details' };
        if (g.fav && !g.fav.side) delete g.fav;
      }
      if (++k % 1000 === 0) console.log(`odds: ${k}/${list.length}`);
    });
  }
  let judged = 0;
  for (const g of list) {
    if (g.ret) continue;
    if (!g.place || !g.fav || !g.fav.side) continue;
    g.j = judgeGame(g); judged++;
  }
  console.log(`placed ${placed}, odds ${odds}, judged ${judged}`);
  const dir = path.join(OUT, SPORT);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'games.json'), '[\n' + list.map((g) => JSON.stringify(g)).join(',\n') + '\n]\n');
  const unplaced = {};
  for (const g of list) if (!g.place) { const k = [g.venue.city, g.venue.state, g.venue.country].join(', '); unplaced[k] = (unplaced[k] || 0) + 1; }
  const SUM = summarize(list);
  SUM.placed = placed; SUM.withOdds = odds; SUM.requests = requests; SUM.failures = failures; SUM.unplaced = unplaced; SUM.seconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(SUM, null, 1));
  fs.writeFileSync(path.join(dir, 'SUMMARY.md'), markdown(SUM, [`Не нашлось место для ${list.length - placed} игр: ${Object.entries(unplaced).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} (${v})`).join('; ') || 'нет'}.`, '', `Запросов к ESPN: ${requests}, неудачных: ${failures}.`]));
  console.log(`done in ${SUM.seconds} s`);
})().catch((e) => { console.error(e); process.exit(1); });
