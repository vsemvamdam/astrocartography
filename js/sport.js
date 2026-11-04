/* Football matches and their astrological judgement.
   Data: ESPN's public JSON (fixtures, venues, odds, squads, lineups): a half-hourly copy on GitHub, or ESPN directly.
   Judgement: event chart for the kickoff at the venue, after John Frawley's "Sports Astrology"
   (chapter 2, "The event chart", and its checklist): the favourite has the 1st and 10th houses, the
   underdog the 7th and 4th. The player index is our own experiment, not Frawley's.
   Depends on Astronomy, ACG, NATAL, HORARY. */
(function (root) {
  'use strict';
  const ACG = root.ACG;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const DAY = 86400000;
  const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
  const LEAGUES = [
    { id: 'eng.1', ru: 'АПЛ', long: 'Английская Премьер-лига' },
    { id: 'esp.1', ru: 'Ла Лига', long: 'Ла Лига' },
    { id: 'uefa.champions', ru: 'ЛЧ', long: 'Лига чемпионов' },
    { id: 'uefa.europa', ru: 'ЛЕ', long: 'Лига Европы' },
    { id: 'uefa.europa.conf', ru: 'ЛК', long: 'Лига конференций' },
  ];

  /* -------------------------------- fetching ------------------------------- */
  /* A copy of the same ESPN data is rebuilt every half hour by GitHub Actions (tools/sport_mirror.js) and
     published to the repository's `data` branch: it opens wherever the site itself opens, including networks
     where ESPN is blocked. The copy is used while fresh; otherwise ESPN is asked directly, and if that
     fails too the stale copy is still better than nothing. */
  const MIRROR = 'https://raw.githubusercontent.com/vsemvamdam/astrocartography/data/espn/';
  function mirrorPath(url) {
    const rest = url.startsWith(API) ? url.slice(API.length) : null;
    if (!rest) return null;
    let m;
    if ((m = rest.match(/^([\w.]+)\/scoreboard\?dates=(\d{6})/))) return `${m[1]}/scoreboard-${m[2]}.json`;
    if ((m = rest.match(/^([\w.]+)\/summary\?event=([\w.-]+)/))) return `${m[1]}/summary-${m[2]}.json`;
    if ((m = rest.match(/^([\w.]+)\/teams\/(\w+)\/roster/))) return `${m[1]}/roster-${m[2]}.json`;
    return null;
  }
  async function fetchJSON(url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { if (timer) clearTimeout(timer); }
  }
  const cache = new Map();
  let source = { mirror: 0, live: 0, stale: 0 };
  const origin = new Map();          // url → {copy: time of the copy} or {live: true}: what the page shows
  // when ESPN itself last failed: on a network that blocks it every request would hang until the timeout,
  // so for the next ten minutes an older copy is taken straight away instead of asking ESPN again
  let espnFailed = 0;
  // ttlMin: how long a result stays in memory; freshMin: how old the mirror copy may be before ESPN is asked
  async function getJSON(url, ttlMin, freshMin) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < (ttlMin || 15) * 60000) return hit.v;
    const mp = mirrorPath(url);
    let copy = null;
    if (mp) { try { copy = await fetchJSON(MIRROR + mp, 10000); } catch (e) { copy = null; } }
    const fromCopy = (kind) => {
      source[kind]++; origin.set(url, { copy: copy.fetched }); cache.set(url, { t: Date.now(), v: copy.data }); return copy.data;
    };
    if (copy && copy.data && Date.now() - copy.fetched < (freshMin || 120) * 60000) return fromCopy('mirror');
    if (copy && copy.data && Date.now() - espnFailed < 10 * 60000) return fromCopy('stale');
    try {
      const v = await fetchJSON(url, 10000);
      source.live++; origin.set(url, { live: true }); cache.set(url, { t: Date.now(), v }); return v;
    } catch (e) {
      espnFailed = Date.now();
      if (copy && copy.data) return fromCopy('stale');
      throw e;
    }
  }
  /* where the last fixture list came from: {live: requests answered by ESPN, copyAt: the oldest copy used, or 0} */
  let fixturesFrom = { live: 0, copyAt: 0 };
  async function pool(tasks, n) {
    const out = new Array(tasks.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (i < tasks.length) { const k = i++; try { out[k] = await tasks[k](); } catch (e) { out[k] = { error: e }; } }
    }));
    return out;
  }
  const ym = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

  // American odds → implied probability
  function implied(odds) {
    if (odds == null || odds === '' || odds === 'EVEN') return odds === 'EVEN' ? 0.5 : null;
    const v = typeof odds === 'number' ? odds : parseFloat(String(odds).replace('+', ''));
    if (!isFinite(v) || v === 0) return null;
    return v < 0 ? -v / (-v + 100) : 100 / (v + 100);
  }
  function readOdds(comp) {
    const o = comp.odds && comp.odds[0];
    if (!o) return null;
    const ml = o.moneyline || {};
    const pick = (side, alt) => (ml[side] && (ml[side].close || ml[side].open) && (ml[side].close || ml[side].open).odds) || (alt && alt.moneyLine);
    const h = implied(pick('home', o.homeTeamOdds)), a = implied(pick('away', o.awayTeamOdds)), d = implied(pick('draw', o.drawOdds));
    if (h == null || a == null) return null;
    const s = h + a + (d || 0);
    const total = o.overUnder != null ? { line: o.overUnder, over: implied(o.total && o.total.over && (o.total.over.close || o.total.over.open) && (o.total.over.close || o.total.over.open).odds) } : null;
    return { home: h / s, away: a / s, draw: d != null ? d / s : null, provider: (o.provider && o.provider.name) || '', total };
  }
  function normalize(ev, lg) {
    const c = ev.competitions[0];
    const side = (ha) => {
      const x = c.competitors.find((t) => t.homeAway === ha) || {};
      const t = x.team || {};
      return { id: t.id, name: t.displayName || t.name, short: t.shortDisplayName || t.displayName, abbr: t.abbreviation, logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href), color: t.color, score: x.score, form: x.form };
    };
    const v = c.venue || {};
    return {
      id: ev.id, league: lg, date: Date.parse(ev.date), state: c.status && c.status.type && c.status.type.state,
      status: c.status && c.status.type && (c.status.type.shortDetail || c.status.type.description),
      venue: { name: v.fullName || '', city: (v.address && v.address.city) || '', country: (v.address && v.address.country) || '' },
      home: side('home'), away: side('away'), odds: readOdds(c),
    };
  }
  /* Upcoming and live matches for the next `days` days: one request per league and calendar month
     (ESPN takes a month in `dates`, but not a range of days). A failed request is tried once more. */
  async function fixtures(leagueIds, days) {
    const now = Date.now(), tasks = [];
    const months = [...new Set([ym(now - DAY), ym(now + days * DAY)])];
    const once = (url) => getJSON(url, 20, 90);
    for (const lg of leagueIds) for (const mo of months) {
      const url = `${API}${lg}/scoreboard?dates=${mo}&limit=300`;
      tasks.push(() => once(url).then((j) => ({ lg, j, url })));
    }
    const venues = loadVenues();
    const res = await pool(tasks, 4);
    await Promise.race([venues, new Promise((r) => setTimeout(r, 3000))]);
    const seen = new Map(); let failed = 0;
    fixturesFrom = { live: 0, copyAt: 0 };
    for (const r of res) {
      if (!r || r.error) { failed++; continue; }
      const o = origin.get(r.url) || {};
      if (o.live) fixturesFrom.live++;
      else if (o.copy && (!fixturesFrom.copyAt || o.copy < fixturesFrom.copyAt)) fixturesFrom.copyAt = o.copy;
      for (const ev of r.j.events || []) if (!seen.has(ev.id)) seen.set(ev.id, normalize(ev, r.lg));
    }
    if (failed === res.length) throw new Error('Не удалось получить расписание');
    return [...seen.values()].filter((m) => m.state !== 'post' && m.date > now - 3 * 3600000 && m.date < now + days * DAY).sort((a, b) => a.date - b.date || a.league.localeCompare(b.league));
  }

  /* --------------------------------- squads -------------------------------- */
  const statOf = (a) => {
    const m = {};
    const cats = (a.statistics && a.statistics.splits && a.statistics.splits.categories) || [];
    for (const c of cats) for (const s of c.stats || []) m[s.name] = s.value;
    return m;
  };
  const group = (abbr) => {
    const p = String(abbr || '').toUpperCase();
    if (p === 'G' || p === 'GK') return 'G';
    if (p === 'D' || /B$/.test(p) || /^CD|^CB|^SW/.test(p)) return 'D';
    if (p === 'F' || /^CF|^ST|^LF|^RF|^LW|^RW|^SS/.test(p)) return 'F';
    return p === 'SUB' || !p ? null : 'M';
  };
  function rosterPlayers(j) {
    return (j && j.athletes || []).map((a) => {
      const s = statOf(a);
      return {
        id: a.id, name: a.displayName || a.fullName, short: a.shortName, jersey: a.jersey, pos: group(a.position && a.position.abbreviation) || 'M',
        dob: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null, age: a.age,
        apps: s.appearances || 0, subs: s.subIns || 0, goals: s.totalGoals || 0, assists: s.goalAssists || 0,
        injured: (a.injuries || []).length > 0, injury: (a.injuries || []).map((i) => i.status || i.type || '').filter(Boolean).join(', '),
      };
    });
  }
  // a probable XI from the season: the most-used goalkeeper, four defenders, three midfielders, three forwards
  function probableXI(players) {
    const fit = players.filter((p) => !p.injured);
    const starts = (p) => p.apps - p.subs;
    const by = (g, n) => fit.filter((p) => p.pos === g).sort((a, b) => starts(b) - starts(a) || b.apps - a.apps).slice(0, n);
    let xi = [...by('G', 1), ...by('D', 4), ...by('M', 3), ...by('F', 3)];
    if (xi.length < 11) xi = xi.concat(fit.filter((p) => !xi.includes(p) && p.pos !== 'G').sort((a, b) => starts(b) - starts(a)).slice(0, 11 - xi.length));
    return xi.filter((p) => p.apps > 0 || xi.length <= 11);
  }
  /* Squads for a match: the official lineup when it is out, otherwise the squad with a probable XI. */
  async function squads(m) {
    const [sum, rh, ra] = await Promise.all([
      // lineups are published about an hour before kickoff, so earlier there is nothing to ask for
      m.date - Date.now() < 36 * 3600000 ? getJSON(`${API}${m.league}/summary?event=${m.id}`, 5, m.date - Date.now() < 4 * 3600000 ? 40 : 360).catch(() => null) : null,
      getJSON(`${API}${m.league}/teams/${m.home.id}/roster`, 60, 48 * 60).catch(() => null),
      getJSON(`${API}${m.league}/teams/${m.away.id}/roster`, 60, 48 * 60).catch(() => null),
    ]);
    const out = {};
    for (const [key, ro, ha] of [['home', rh, 'home'], ['away', ra, 'away']]) {
      const squad = rosterPlayers(ro), byId = new Map(squad.map((p) => [p.id, p]));
      const lu = sum && (sum.rosters || []).find((r) => r.homeAway === ha);
      let lineup = null;
      if (lu && lu.roster && lu.roster.length) {
        lineup = lu.roster.map((r) => {
          const base = byId.get(r.athlete && r.athlete.id) || {};
          return Object.assign({}, base, {
            id: r.athlete && r.athlete.id, name: (r.athlete && r.athlete.displayName) || base.name, jersey: r.jersey || base.jersey,
            pos: group(r.position && r.position.abbreviation) || base.pos || 'M', starter: !!r.starter, place: +r.formationPlace || 99,
          });
        });
      }
      out[key] = { squad, lineup, formation: lu && lu.formation, official: !!lineup, xi: lineup ? lineup.filter((p) => p.starter) : probableXI(squad) };
    }
    out.injuries = sum && sum.injuries;
    return out;
  }

  /* ------------------------------ venue place ------------------------------ */
  // cities ESPN uses that are missing from the map's city list or spelled differently
  const EXTRA = {
    'san sebastian': [43.3013, -1.9737, 'Europe/Madrid'], 'elche': [38.2669, -0.6638, 'Europe/Madrid'], 'getafe': [40.3257, -3.7146, 'Europe/Madrid'],
    'villarreal': [39.9441, -0.1036, 'Europe/Madrid'], 'girona': [41.9610, 2.8288, 'Europe/Madrid'], 'palma': [39.5900, 2.6300, 'Europe/Madrid'],
    'palma de mallorca': [39.5900, 2.6300, 'Europe/Madrid'], 'mallorca': [39.5900, 2.6300, 'Europe/Madrid'], 'leganes': [40.3402, -3.7606, 'Europe/Madrid'],
    'vitoria gasteiz': [42.8372, -2.6882, 'Europe/Madrid'], 'vitoria': [42.8372, -2.6882, 'Europe/Madrid'], 'pamplona': [42.7966, -1.6370, 'Europe/Madrid'],
    'vila real': [39.9441, -0.1036, 'Europe/Madrid'], 'eibar': [43.1814, -2.4757, 'Europe/Madrid'], 'huesca': [42.1310, -0.4180, 'Europe/Madrid'],
    'wolverhampton': [52.5902, -2.1304, 'Europe/London'], 'burnley': [53.7890, -2.2302, 'Europe/London'], 'brentford': [51.4907, -0.2886, 'Europe/London'],
    'falmer': [50.8616, -0.0837, 'Europe/London'], 'brighton': [50.8616, -0.0837, 'Europe/London'], 'bournemouth': [50.7352, -1.8384, 'Europe/London'],
    'west bromwich': [52.5090, -1.9639, 'Europe/London'], 'luton': [51.8842, -0.4316, 'Europe/London'], 'watford': [51.6498, -0.4015, 'Europe/London'],
    'randers': [56.4597, 10.0361, 'Europe/Copenhagen'], 'herning': [56.1360, 8.9750, 'Europe/Copenhagen'], 'celje': [46.2310, 15.2653, 'Europe/Ljubljana'],
  };
  const ALIAS = { milano: 'milan', torino: 'turin', napoli: 'naples', roma: 'rome', firenze: 'florence', genova: 'genoa', sevilla: 'seville', lisboa: 'lisbon',
    praha: 'prague', wien: 'vienna', munchen: 'munich', koln: 'cologne', bruxelles: 'brussels', warszawa: 'warsaw', kobenhavn: 'copenhagen', goteborg: 'gothenburg',
    zurich: 'zurich', geneve: 'geneva', 'den haag': 'the hague', beograd: 'belgrade', bucuresti: 'bucharest', athina: 'athens', kyiv: 'kiev', 'a coruna': 'la coruna',
    'newcastle upon tyne': 'newcastle', 'nottingham forest': 'nottingham', 'saint petersburg': 'st petersburg', 'frankfurt am main': 'frankfurt', 'monchengladbach': 'monchengladbach' };
  const COUNTRY = { England: 'Великобритания', Scotland: 'Великобритания', Wales: 'Великобритания', 'Northern Ireland': 'Великобритания', Spain: 'Испания', Italy: 'Италия',
    Germany: 'Германия', France: 'Франция', Portugal: 'Португалия', Netherlands: 'Нидерланды', Belgium: 'Бельгия', 'Türkiye': 'Турция', Turkey: 'Турция', Greece: 'Греция',
    Denmark: 'Дания', Norway: 'Норвегия', Sweden: 'Швеция', Switzerland: 'Швейцария', Austria: 'Австрия', 'Czech Republic': 'Чехия', Czechia: 'Чехия', Poland: 'Польша',
    Croatia: 'Хорватия', Serbia: 'Сербия', Ukraine: 'Украина', Romania: 'Румыния', Hungary: 'Венгрия', Cyprus: 'Кипр', Israel: 'Израиль', };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  /* Stadium towns found in GeoNames by tools/sport_db.js, kept in the football-db branch as venues.json:
     {"<town>|<country>": {lat, lon, tz}}. Loaded together with the fixtures; while it is missing (or if it
     fails to load) the city list below is used, which knows only larger towns. */
  const VENUES_URL = 'https://raw.githubusercontent.com/vsemvamdam/astrocartography/football-db/venues.json';
  const FOLD = { 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae', 'ß': 'ss', 'ł': 'l', 'Ł': 'l', 'đ': 'd', 'Đ': 'd', 'ı': 'i', 'œ': 'oe', 'þ': 'th', 'ð': 'd' };
  const venueKey = (s) => norm(String(s || '').replace(/[øØæÆßłŁđĐıœþð]/g, (c) => FOLD[c]));
  let venueTable = null, venueLoad = null;
  function loadVenues() {
    if (!venueLoad) venueLoad = fetchJSON(VENUES_URL, 8000).then((j) => { venueTable = j || {}; }).catch(() => { venueLoad = null; });
    return venueLoad;
  }
  function venuePlace(m, cities) {
    const v = m.venue, key = norm(v.city), k2 = ALIAS[key] || key;
    const label = v.city || v.name || m.home.name;
    const known = venueTable && venueTable[venueKey(v.city) + '|' + venueKey(v.country)];
    if (known) return { name: label, lat: known.lat, lon: known.lon, tz: known.tz, approx: false };
    if (EXTRA[k2]) { const [lat, lon, tz] = EXTRA[k2]; return { name: label, lat, lon, tz, approx: false }; }
    const country = COUNTRY[v.country];
    const hits = cities.filter((c) => c.en && norm(c.en) === k2);
    const best = hits.find((c) => c.c === country) || hits.sort((a, b) => b.pop - a.pop)[0];
    if (best) return { name: label, lat: best.lat, lon: best.lon, tz: best.tz, approx: false };
    // unknown city: the largest city of the country, marked as approximate
    const inCountry = country && cities.filter((c) => c.c === country).sort((a, b) => b.pop - a.pop)[0];
    if (inCountry) return { name: `${label} (≈ ${inCountry.ru})`, lat: inCountry.lat, lon: inCountry.lon, tz: inCountry.tz, approx: true };
    return { name: label || 'Неизвестно', lat: 51.5, lon: 0, tz: 'Europe/London', approx: true };
  }

  /* -------------------------------- judgement ------------------------------ */
  const DOMICILE = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
  const RU = { Sun: 'Солнце', Moon: 'Луна', Mercury: 'Меркурий', Venus: 'Венера', Mars: 'Марс', Jupiter: 'Юпитер', Saturn: 'Сатурн', Uranus: 'Уран', Neptune: 'Нептун', Pluto: 'Плутон' };
  const GEN = { Sun: 'Солнца', Moon: 'Луны', Mercury: 'Меркурия', Venus: 'Венеры', Mars: 'Марса', Jupiter: 'Юпитера', Saturn: 'Сатурна', Uranus: 'Урана', Neptune: 'Нептуна', Pluto: 'Плутона', Fortune: 'Фортуны', FortuneA: 'антисции Фортуны' };
  const DAT = { Sun: 'Солнцу', Moon: 'Луне', Mercury: 'Меркурию', Venus: 'Венере', Mars: 'Марсу', Jupiter: 'Юпитеру', Saturn: 'Сатурну', Fortune: 'Фортуне', FortuneA: 'антисции Фортуны' };
  const INS = { Sun: 'Солнцем', Moon: 'Луной', Mercury: 'Меркурием', Venus: 'Венерой', Mars: 'Марсом', Jupiter: 'Юпитером', Saturn: 'Сатурном', Fortune: 'Фортуной', FortuneA: 'антисцией Фортуны' };
  const NAT_PREP = { Sun: 'натальном Солнце', Mars: 'натальном Марсе', Jupiter: 'натальном Юпитере' };
  const NAT_DAT = { Sun: 'натальному Солнцу', Mars: 'натальному Марсу' };
  const ASP_IN = { 0: 'соединении', 60: 'секстиле', 90: 'квадрате', 120: 'трине', 180: 'оппозиции' };
  const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const anti = (lon) => n360(180 - lon);   // antiscion: mirror over the Cancer–Capricorn axis
  const signOf = (lon) => Math.floor(n360(lon) / 30);
  const ASPECTS = [0, 60, 90, 120, 180];
  const ASP_RU = { 0: 'соединение', 60: 'секстиль', 90: 'квадрат', 120: 'трин', 180: 'оппозиция' };

  // a light event chart: positions, speeds and houses only (the full chart also builds map lines, too slow for a list)
  const BODY_IDS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  function eventChart(utcMs, place, house) {
    const Ax = root.Astronomy, H = root.HORARY;
    const time = Ax.MakeTime(new Date(utcMs));
    const gast = Ax.SiderealTime(time) * 15, eps = Ax.e_tilt(time).tobl;
    const nat = root.NATAL.computeHouses(house || 'P', n360(gast + place.lon), eps, place.lat);
    const P = {};
    for (const id of BODY_IDS) {
      const lon = H.lonAt(id, utcMs), speed = n180(H.lonAt(id, utcMs + 0.05 * DAY) - H.lonAt(id, utcMs - 0.05 * DAY)) / 0.1;
      P[id] = { id, lon, speed, retro: speed < 0 };
    }
    P.Node = { id: 'Node', lon: ACG.trueNodeLon(time) };
    const fortune = n360(nat.asc + P.Moon.lon - P.Sun.lon);    // the day formula, by day and by night
    return { nat, P, fortune, cusps: nat.cusps };
  }

  /* Judgement of an event chart after John Frawley, "Sports Astrology", chapter 2 and its checklist.
     fav: 'home' | 'away'; opts.extra: 0 — 90 minutes (the Moon's aspects within 5°), 1 — extra time possible (6°),
     2 — a final that may go to penalties (7°, "the absolute limit for football").
     Frawley names testimonies "strong" or "minor" in words; the numbers below are our reading of that. */
  const CUSP_ORB = 3;                 // "on the cusp or a couple of degrees from it"; 3° is the limit, 5° too far
  const near = (d) => (Math.abs(d) <= 1 ? 1 : Math.max(0, 1 - 0.3 * (Math.abs(d) - 1)));   // 1 … 0.4 at 3°
  const SEVEN_PL = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const ALL_PL = SEVEN_PL.concat(['Uranus', 'Neptune', 'Pluto']);
  const HNAME = { 1: 'I', 2: 'II', 4: 'IV', 7: 'VII', 10: 'X' };
  const CUSP_RU = { 1: 'Асцендента', 2: 'II дома', 4: 'IC', 7: 'Десцендента', 10: 'MC' };
  const HOUSE_IN = { 1: 'в I доме', 4: 'в IV доме', 7: 'в VII доме', 10: 'в X доме' };
  const OWNER = { 1: 'fav', 10: 'fav', 7: 'dog', 4: 'dog' };

  // does a planet moving from its place reach `target` (a fixed point) within `maxDeg` before turning back?
  function reaches(id, t0, target, maxDeg) {
    const H = root.HORARY, v = H.lonAt(id, t0 + 0.05 * DAY) - H.lonAt(id, t0 - 0.05 * DAY);
    const d0 = n180(target - H.lonAt(id, t0));
    if (Math.abs(d0) > maxDeg || Math.sign(d0) !== Math.sign(n180(v)) || !v) return null;
    const vAbs = Math.abs(n180(v)) / 0.1, step = Math.max(1 / 24, Math.min(2, 0.25 / Math.max(vAbs, 0.01))) * DAY;
    let t = t0, prev = d0;
    for (let i = 0; i < 3000 && t < t0 + 400 * DAY; i++) {
      t += step;
      const d = n180(target - H.lonAt(id, t));
      if ((d < 0) !== (prev < 0) && Math.abs(d) < 10) return t;        // crossed the point
      if (Math.abs(d) > Math.abs(prev) + 1e-6 && Math.abs(prev) < Math.abs(d0)) return null;   // turned back first
      prev = d;
    }
    return null;
  }
  // a slower planet that the significator meets first prohibits its aspect to Fortuna
  function prohibitedBefore(id, t0, tEnd, P) {
    const H = root.HORARY, v = Math.abs(P[id].speed);
    for (const x of ALL_PL) {
      if (x === id || x === 'Moon' || Math.abs(P[x].speed) >= v) continue;
      const r = H.scanPair(id, x, t0, tEnd, 1);
      if (r && r.t && r.t < tEnd) return { x, asp: r.asp };
    }
    return null;
  }

  function judge(m, place, fav, opts) {
    opts = opts || {};
    const E = eventChart(m.date, place, 'P');
    const { P, cusps, fortune } = E;
    const fA = anti(fortune), t0 = m.date;
    const favSide = fav, dogSide = fav === 'home' ? 'away' : 'home';
    const teams = {
      fav: { side: favSide, own: [1, 10], name: favSide === 'home' ? m.home.name : m.away.name },
      dog: { side: dogSide, own: [7, 4], name: dogSide === 'home' ? m.home.name : m.away.name },
    };
    const notes = [];
    // the lords of I, VII, X and IV; the Moon shows the flow of events and is nobody's
    const ruler = (h) => DOMICILE[signOf(cusps[h])];
    const L = {};
    for (const h of [1, 7]) {
      let r = ruler(h), via = false;
      if (r === 'Moon') { r = DOMICILE[signOf(P.Moon.lon)]; via = true; if (r === 'Moon') { r = null; notes.push(`Луна управляет ${HNAME[h]} домом и стоит в Раке: у ${h === 1 ? 'фаворита' : 'аутсайдера'} нет главного сигнификатора.`); } }
      L[h] = r ? { id: r, h, via, main: true } : null;
      if (via && r) notes.push(`${HNAME[h]} домом управляет Луна, поэтому её роль играет диспозитор Луны — ${RU[r]}.`);
    }
    for (const h of [10, 4]) {
      const r = ruler(h);
      if (r === 'Moon') { L[h] = null; notes.push(`Луна управляет ${HNAME[h]} домом: обходимся без этого управителя.`); continue; }
      if ((L[1] && L[1].id === r) || (L[7] && L[7].id === r)) { L[h] = null; notes.push(`${RU[r]} уже служит управителем ${L[1] && L[1].id === r ? 'I' : 'VII'} дома, поэтому без управителя ${HNAME[h]}.`); continue; }
      L[h] = { id: r, h, via: false, main: false };
    }
    const lords = [1, 10, 7, 4].map((h) => L[h]).filter(Boolean).map((s) => Object.assign(s, { team: OWNER[s.h] }));
    teams.fav.sigs = lords.filter((s) => s.team === 'fav').map((s) => ({ id: s.id, house: s.h, via: s.via }));
    teams.dog.sigs = lords.filter((s) => s.team === 'dog').map((s) => ({ id: s.id, house: s.h, via: s.via }));
    const other = (k) => (k === 'fav' ? 'dog' : 'fav');
    const T = [];
    // rule: a code of the rule that gave the testimony, for checking each rule on past matches (tools/sport_rules.js)
    const add = (k, w, text, kind, rule) => { if (w > 0.05) T.push({ team: k, w: Math.round(w * 10) / 10, text, kind: kind || 'other', rule: rule || kind || 'other' }); };
    const lordName = (s) => `${RU[s.id]} (управитель ${HNAME[s.h]}${s.via ? ', за Луну' : ''})`;
    const deg = (x) => `${Math.abs(x).toFixed(1)}°`;

    // 1. house position of the four lords: on a cusp it rules that house, just inside it is in that house's power
    for (const s of lords) {
      const p = P[s.id], base = s.main ? 3 : 2, sfx = (isA, h) => `${isA ? '.anti' : ''}${s.main ? '' : '.sec'}.h${h}`;
      for (const [lon, isAnti] of [[p.lon, false], [anti(p.lon), true]]) {
        const k0 = isAnti ? 0.5 : 1, who = isAnti ? `Антисция ${GEN[s.id] || RU[s.id]} (управитель ${HNAME[s.h]})` : lordName(s);
        for (const h of [1, 10, 7, 4]) {
          const d = n180(lon - cusps[h]);
          if (Math.abs(d) > CUSP_ORB) continue;
          const onCusp = d < 0.34, owner = OWNER[h];
          if (owner === s.team) {
            add(s.team, (s.main ? 2 : 1.5) * near(d) * k0, `${who} ${onCusp ? 'на куспиде' : 'сразу за куспидом'} ${CUSP_RU[h]} (${deg(d)}): своя команда крепче`, 'cusp', 'lord-own-angle' + sfx(isAnti, h));
          } else if (onCusp) {
            const retro = !isAnti && p.retro ? 0.6 : 1;
            add(s.team, base * near(d) * k0 * retro, `${who} на куспиде ${CUSP_RU[h]} соперника (${deg(d)}): господствует над его домом${retro < 1 ? ', но ретроградный — слабее' : ''}`, 'cusp', 'lord-on-opp-cusp' + sfx(isAnti, h));
          } else {
            add(owner, base * near(d) * k0, `${who} сразу за куспидом ${CUSP_RU[h]} (${deg(d)}): команда во власти соперника`, 'cusp', 'lord-in-opp-house' + sfx(isAnti, h));
          }
        }
      }
    }
    // 2. the Moon and her antiscion near the cusps of I and X (favourite) or VII and IV (underdog)
    for (const [lon, isAnti] of [[P.Moon.lon, false], [anti(P.Moon.lon), true]]) {
      for (const h of [1, 10, 7, 4]) {
        const d = n180(lon - cusps[h]);
        if (Math.abs(d) <= CUSP_ORB) add(OWNER[h], (isAnti ? 1.5 : 2) * near(d), `${isAnti ? 'Антисция Луны' : 'Луна'} ${d < 0 ? 'подходит к куспиду' : 'у куспида'} ${CUSP_RU[h]} (${deg(d)}): поток событий на стороне команды`, 'moon', `moon-angle${isAnti ? '.anti' : ''}.h${h}`);
      }
    }
    // 3. Fortuna's place counts by its antiscion only, near the Ascendant or the Descendant
    for (const h of [1, 7]) {
      const d = n180(fA - cusps[h]);
      if (Math.abs(d) <= CUSP_ORB) add(OWNER[h], 3.5 * near(d), `Антисция Фортуны у ${h === 1 ? 'Асцендента' : 'Десцендента'} (${deg(d)}): одно из сильнейших свидетельств`, 'fortuna', `fortuna-anti-angle.h${h}`);
    }

    // 4. the Moon's applying aspects within 5° (6° if extra time is possible), not past the end of her sign
    const window = 5 + Math.max(0, Math.min(2, opts.extra || 0));
    const moon = P.Moon, leftInSign = 30 - (n360(moon.lon) % 30);
    const targets = [];
    for (const s of lords) {
      targets.push({ key: s.id, lon: P[s.id].lon, speed: P[s.id].speed, lord: s, anti: false, label: RU[s.id], dat: DAT[s.id], ins: INS[s.id] });
      targets.push({ key: s.id + '*', lon: anti(P[s.id].lon), speed: -P[s.id].speed, lord: s, anti: true, label: `антисция ${GEN[s.id]}`, dat: `антисции ${GEN[s.id]}`, ins: `антисцией ${GEN[s.id]}` });
    }
    targets.push({ key: 'F', lon: fortune, speed: 0, fortuna: true, anti: false, label: 'Фортуна', dat: 'Фортуне', ins: 'Фортуной' });
    targets.push({ key: 'F*', lon: fA, speed: 0, fortuna: true, anti: true, label: 'антисция Фортуны', dat: 'антисции Фортуны', ins: 'антисцией Фортуны' });
    const moonAsp = [];
    for (const t of targets) {
      for (const a of ASPECTS) for (const sgn of a === 0 || a === 180 ? [1] : [1, -1]) {
        const goal = n360(t.lon + sgn * a), rel = moon.speed - t.speed;
        if (rel <= 0) continue;
        const gap = n360(goal - moon.lon);                    // relative degrees still to go
        if (gap > window || gap === 0) continue;
        const moonTravel = gap / rel * moon.speed;
        if (moonTravel > leftInSign) continue;               // the end of the sign is the limit
        moonAsp.push({ to: t, asp: a, deg: gap, hours: gap / rel * 24 });
      }
    }
    moonAsp.sort((x, y) => x.deg - y.deg);
    const walked = [];
    let final = null;
    for (const x of moonAsp) {
      walked.push(x);
      if (x.to.fortuna) { final = x; break; }                  // aspects to Fortuna are always final
      if (!x.to.anti && x.asp === 0) { final = x; break; }     // a bodily conjunction ends the Moon's course
    }
    const aspText = (x) => `${x.asp === 0 ? `соединение с ${x.to.ins}` : `${ASP_RU[x.asp]} к ${x.to.dat}`} (${x.deg.toFixed(1)}°)`;
    const lordHits = walked.filter((x) => x.to.lord);
    const lastFortuna = final && final.to.fortuna ? final : null;
    if (lastFortuna) {
      const good = lastFortuna.asp === 0 || lastFortuna.asp === 60 || lastFortuna.asp === 120;
      const w = lastFortuna.to.anti ? (lastFortuna.asp === 0 || lastFortuna.asp === 180 ? 2.5 : 0.75) : (lastFortuna.asp === 0 ? 3 : 2.5);
      add(good ? 'fav' : 'dog', w, `Заключительный аспект Луны — ${aspText(lastFortuna)}: ${good ? 'гармоничный аспект к Фортуне за фаворита' : 'напряжённый аспект к Фортуне за аутсайдера'}`, 'lastmoon', `last-fortuna-${good ? 'good' : 'hard'}${lastFortuna.to.anti ? '.anti' : ''}.a${lastFortuna.asp}`);
    }
    const lastLord = lordHits.length ? lordHits[lordHits.length - 1] : null;
    if (lastLord && !lastFortuna) {
      const w = lastLord.to.anti && lastLord.asp !== 0 && lastLord.asp !== 180 ? 2 : 3;
      add(lastLord.to.lord.team, w, `Заключительный аспект Луны — ${aspText(lastLord)}: указывает на победителя`, 'lastmoon', `last-lord${lastLord.to.anti ? '.anti' : ''}${lastLord.to.lord.main ? '' : '.sec'}.a${lastLord.asp}`);
    }
    for (const x of lordHits) if (x !== lastLord || lastFortuna) add(x.to.lord.team, 0.5, `Луна по пути — ${aspText(x)}: преимущество в начале игры`, 'moon', `moon-way${x.to.anti ? '.anti' : ''}`);

    // 5. significators applying to Fortuna or its antiscion within 5° (and they must get there)
    const disp = DOMICILE[signOf(fortune)];
    const dispIsLord = lords.find((s) => s.id === disp);
    const dispUsed = disp !== 'Moon' && !(dispIsLord && dispIsLord.main);
    for (const s of lords) {
      if (dispUsed && s.id === disp) continue;                 // its role as Fortuna's dispositor comes first
      const W = s.main ? 3 : 1;
      for (const [pt, isAnti] of [[fortune, false], [fA, true]]) {
        for (const asp of [0, 180]) {
          const goal = n360(pt + asp), tHit = reaches(s.id, t0, goal, 5);
          if (!tHit) continue;
          const pro = prohibitedBefore(s.id, t0, tHit, P);
          const what = `${lordName(s)} идёт к ${asp === 0 ? 'соединению' : 'оппозиции'} с ${isAnti ? 'антисцией Фортуны' : 'Фортуной'} (${deg(n180(goal - P[s.id].lon))})`;
          if (pro) { notes.push(`${what}, но раньше встречает ${RU[pro.x]} — аспект запрещён.`); continue; }
          let team;
          if (asp === 0) team = s.team;                                   // conjunction: for the lord's team
          else if (s.team === 'fav') team = 'dog';                        // opposition to the favourite's lord: underdog
          else team = isAnti ? 'fav' : 'dog';                             // underdog's lord: antiscion → favourite, bodily → underdog (Frawley's anomaly)
          add(team, W, `${what}: в пользу ${team === 'fav' ? 'фаворита' : 'аутсайдера'}`, 'fortuna', `lord-fortuna-${asp === 0 ? 'conj' : 'opp'}.${s.team}${isAnti ? '.anti' : ''}${s.main ? '' : '.sec'}`);
        }
      }
    }
    // 6. Fortuna's dispositor applying to Fortuna
    if (dispUsed) {
      for (const asp of [0, 180]) {
        const tHit = reaches(disp, t0, n360(fortune + asp), 5);
        if (tHit && !prohibitedBefore(disp, t0, tHit, P)) add(asp === 0 ? 'fav' : 'dog', 2, `Диспозитор Фортуны ${RU[disp]} идёт к ${asp === 0 ? 'соединению' : 'оппозиции'} с Фортуной (${deg(n180(fortune + asp - P[disp].lon))})`, 'fortuna', `disp-fortuna-${asp === 0 ? 'conj' : 'opp'}`);
      }
    }
    // 7. nodes (close conjunctions only), combustion within 2° (cazimi counts for nothing here)
    const NN = P.Node && P.Node.lon, SN = NN != null ? n360(NN + 180) : null;
    const conj = (a, b, orb) => Math.abs(n180(a - b)) <= orb;
    for (const s of lords) {
      const p = P[s.id];
      if (NN != null && conj(p.lon, NN, 2)) add(s.team, 1.5, `${lordName(s)} на северном узле (${deg(n180(p.lon - NN))})`, 'node', 'lord-north-node' + (s.main ? '' : '.sec'));
      if (SN != null && conj(p.lon, SN, 2)) add(other(s.team), 1.5, `${lordName(s)} на южном узле (${deg(n180(p.lon - SN))})`, 'node', 'lord-south-node' + (s.main ? '' : '.sec'));
      if (s.id !== 'Sun') { const ds = Math.abs(n180(p.lon - P.Sun.lon)); if (ds <= 2 && ds > 17 / 60) add(other(s.team), s.main ? 2 : 1.5, `${lordName(s)} сожжён Солнцем (${ds.toFixed(1)}°)`, 'sun', 'lord-combust' + (s.main ? '' : '.sec')); }
    }
    if (NN != null && conj(fortune, NN, 2)) add('fav', 1.5, `Фортуна на северном узле (${deg(n180(fortune - NN))}): Фортуна — на стороне фаворита`, 'node', 'fortuna-north-node');
    if (SN != null && conj(fortune, SN, 2)) add('dog', 1.5, `Фортуна на южном узле (${deg(n180(fortune - SN))})`, 'node', 'fortuna-south-node');
    { const ds = Math.abs(n180(fortune - P.Sun.lon)); if (ds <= 2) add('dog', 2, `Фортуна сожжена Солнцем (${ds.toFixed(1)}°)`, 'sun', 'fortuna-combust'); }

    // 8. the planets beyond Saturn, and Saturn as a malefic
    if (P.Pluto) {
      const pl = P.Pluto.lon;
      for (const [h, team, w] of [[1, 'dog', 3], [10, 'dog', 2.5], [2, 'dog', 1.5], [7, 'fav', 1], [4, 'fav', 1]]) {
        const d = n180(pl - cusps[h]);
        if (Math.abs(d) <= 2) add(team, w * near(d), `Плутон на куспиде ${CUSP_RU[h]} (${deg(d)}): разрушает${team === 'dog' ? ' — особенно не любит фаворита' : ''}`, 'outer', `pluto-cusp.h${h}`);
      }
      for (const [nm, pt] of [['Фортуной', fortune], ['диспозитором Фортуны', P[disp] ? P[disp].lon : null]]) {
        if (pt == null) continue;
        for (const [lon, an] of [[pl, ''], [anti(pl), 'антисция ']]) {
          if (conj(lon, pt, 1)) add('dog', 2.5, `${an ? 'Антисция Плутона' : 'Плутон'} в соединении с ${nm}`, 'outer', `pluto-${nm === 'Фортуной' ? 'fortuna' : 'disp'}-conj${an ? '.anti' : ''}`);
          if (conj(lon, pt + 180, 1)) add('dog', 2.5, `${an ? 'Антисция Плутона' : 'Плутон'} в оппозиции с ${nm}`, 'outer', `pluto-${nm === 'Фортуной' ? 'fortuna' : 'disp'}-opp${an ? '.anti' : ''}`);
        }
      }
    }
    if (P.Uranus) {
      if (conj(P.Uranus.lon, E.nat.mc, 1)) add('fav', 2.5, 'Уран в тесном соединении с MC', 'outer', 'uranus-mc');
      if (conj(P.Uranus.lon, fortune, 1)) add('fav', 2.5, 'Уран в тесном соединении с Фортуной', 'outer', 'uranus-fortuna-conj');
      if (conj(P.Uranus.lon, fortune + 180, 1)) add('dog', 2.5, 'Уран в оппозиции с Фортуной', 'outer', 'uranus-fortuna-opp');
    }
    if (!(L[1] && L[1].id === 'Saturn') && !(L[7] && L[7].id === 'Saturn')) {
      const sat = P.Saturn.lon;
      for (const s of lords) if (s.id !== 'Saturn' && conj(sat, P[s.id].lon, 2)) add(other(s.team), 1.5, `Сатурн-вредитель в соединении с ${INS[s.id] || RU[s.id]} (управитель ${HNAME[s.h]})`, 'saturn', 'saturn-lord' + (s.main ? '' : '.sec'));
      for (const h of [1, 10, 7, 4]) { const d = n180(sat - cusps[h]); if (Math.abs(d) <= 2) add(other(OWNER[h]), 1.5 * near(d), `Сатурн-вредитель на куспиде ${CUSP_RU[h]} (${deg(d)})`, 'saturn', `saturn-cusp.h${h}`); }
      if (conj(sat, fortune, 2)) add('dog', 1.5, 'Сатурн-вредитель на Фортуне', 'saturn', 'saturn-fortuna');
    }

    // verdict: the balance of testimonies; their number gives a rough score (Frawley does this for football only)
    const score = { fav: 0, dog: 0 };
    for (const t of T) score[t.team] += t.w;
    score.fav = Math.round(score.fav * 10) / 10; score.dog = Math.round(score.dog * 10) / 10;
    const diff = score.fav - score.dog;
    const strength = Math.abs(diff) >= 4 ? 'явный' : Math.abs(diff) >= 1.5 ? 'умеренный' : null;
    const winner = strength ? (diff > 0 ? 'fav' : 'dog') : null;
    // no testimony: hardly a goal; each strong one is worth about a goal; the loser rarely scores more than one
    const goals = (pts) => (pts < 0.7 ? 0 : Math.min(4, 1 + Math.floor((pts - 0.7) / 3)));
    let gF = goals(score.fav), gD = goals(score.dog);
    if (winner === 'fav') { if (gF <= gD) gF = gD + 1; if (gD > 1 && score.dog < 6) gD = 1; if (gF - gD > 3) gF = gD + 3; }
    if (winner === 'dog') { if (gD <= gF) gD = gF + 1; if (gF > 1 && score.fav < 6) gF = 1; if (gD - gF > 3) gD = gF + 3; }
    if (!winner) { const g = Math.min(gF, gD); gF = gD = g; }
    const verdict = winner
      ? { v: winner, side: teams[winner].side, strength, text: `${strength === 'явный' ? 'Явный' : 'Умеренный'} перевес: ${teams[winner].name}${winner === 'dog' ? ' (аутсайдер)' : ''}.` }
      : { v: 'draw', side: null, strength: null, text: T.length ? 'Свидетельства уравновешены: по Фроули это указывает на ничью.' : 'Свидетельств нет ни у одной команды: карта «пустая», как у нулевой ничьей.' };
    verdict.score = { fav: gF, dog: gD };
    return { E, teams, testimonies: T, score, diff, verdict, moonAsp, walked, final, notes, fortune, window, disp };
  }

  /* ---------------------- experimental player index ---------------------- */
  // natal Sun, Mars and Jupiter at noon of the birth date (birth time is unknown)
  const natalCache = new Map();
  function natalOf(dob) {
    if (!dob) return null;
    if (natalCache.has(dob)) return natalCache.get(dob);
    const [y, mo, d] = dob.split('-').map(Number), t = Date.UTC(y, mo - 1, d, 12);
    const H = root.HORARY, v = {};
    for (const id of ['Sun', 'Mars', 'Jupiter', 'Venus']) v[id] = H.lonAt(id, t);
    natalCache.set(dob, v);
    return v;
  }
  function playerIndex(pl, J, teamKey) {
    const nat = natalOf(pl.dob);
    if (!nat) return null;
    const { P, cusps } = J.E, me = J.teams[teamKey], why = [];
    let idx = 0;
    const near = (a, b, orb) => Math.abs(n180(a - b)) <= orb;
    const aspect = (a, b, orb) => ASPECTS.find((x) => Math.abs(Math.abs(n180(a - b)) - x) <= orb);
    for (const pt of ['Sun', 'Mars', 'Jupiter']) {
      if (near(J.E.nat.asc, nat[pt], 3)) { idx += 2; why.push(`Асцендент матча на ${NAT_PREP[pt]}`); }
      if (near(J.E.nat.mc, nat[pt], 3)) { idx += 2; why.push(`MC матча на ${NAT_PREP[pt]}`); }
    }
    for (const ev of ['Mars', 'Jupiter', 'Sun']) for (const nt of ['Sun', 'Mars']) {
      if (ev === nt && ev === 'Sun') continue;
      const a = aspect(P[ev].lon, nat[nt], 2);
      if (a == null) continue;
      if (a === 0) { idx += 1.5; why.push(`${RU[ev]} матча на ${NAT_PREP[nt]}`); }
      else if (a === 60 || a === 120) { idx += 1; why.push(`${RU[ev]} матча в ${ASP_IN[a]} к ${NAT_DAT[nt]}`); }
    }
    for (const ev of ['Saturn', 'Pluto']) for (const nt of ['Sun', 'Mars']) {
      if (!P[ev]) continue;
      const a = aspect(P[ev].lon, nat[nt], 2);
      if (a === 0 || a === 90 || a === 180) { idx -= 1; why.push(`${RU[ev]} матча в ${ASP_IN[a]} ${a === 0 ? 'с ' + (nt === 'Sun' ? 'натальным Солнцем' : 'натальным Марсом') : 'к ' + NAT_DAT[nt]}`); }
    }
    for (const nt of ['Sun', 'Mars']) for (const h of me.own) if (near(nat[nt], cusps[h], 3)) { idx += 1.5; why.push(`${nt === 'Sun' ? 'натальное Солнце' : 'натальный Марс'} на углу своей команды`); }
    return { idx, why };
  }

  root.SPORT = { LEAGUES, fixtures, squads, venuePlace, venueKey, judge, playerIndex, eventChart, implied, RU, RN, source: () => Object.assign({}, source), fixturesFrom: () => Object.assign({}, fixturesFrom) };
})(typeof window !== 'undefined' ? window : globalThis);
