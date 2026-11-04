/* Football matches and their astrological judgement.
   Data: ESPN's public JSON (fixtures, venues, odds, squads, lineups), fetched from the browser.
   Judgement: event chart for the kickoff at the venue, after John Frawley's "Sports Astrology" as
   his students describe it: the favourite has the 1st and 10th houses, the underdog the 7th and 4th;
   testimonies are their rulers on cusps, the Moon and Fortuna, the nodes, combustion, Pluto on a cusp,
   and the Moon's last aspect. The player index is our own experiment, not Frawley's.
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
  const cache = new Map();
  async function getJSON(url, ttlMin) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < (ttlMin || 15) * 60000) return hit.v;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      cache.set(url, { t: Date.now(), v });
      return v;
    } finally { if (timer) clearTimeout(timer); }
  }
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
    const once = (url) => getJSON(url, 20).catch(() => getJSON(url, 20));
    for (const lg of leagueIds) for (const mo of months) tasks.push(() => once(`${API}${lg}/scoreboard?dates=${mo}&limit=300`).then((j) => ({ lg, j })));
    const res = await pool(tasks, 4);
    const seen = new Map(); let failed = 0;
    for (const r of res) {
      if (!r || r.error) { failed++; continue; }
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
      getJSON(`${API}${m.league}/summary?event=${m.id}`, 5).catch(() => null),
      getJSON(`${API}${m.league}/teams/${m.home.id}/roster`, 60).catch(() => null),
      getJSON(`${API}${m.league}/teams/${m.away.id}/roster`, 60).catch(() => null),
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
  function venuePlace(m, cities) {
    const v = m.venue, key = norm(v.city), k2 = ALIAS[key] || key;
    const label = v.city || v.name || m.home.name;
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
  const GEN = { Sun: 'Солнца', Moon: 'Луны', Mercury: 'Меркурия', Venus: 'Венеры', Mars: 'Марса', Jupiter: 'Юпитера', Saturn: 'Сатурна', Fortune: 'Фортуны', FortuneA: 'антисции Фортуны' };
  const DAT = { Sun: 'Солнцу', Moon: 'Луне', Mercury: 'Меркурию', Venus: 'Венере', Mars: 'Марсу', Jupiter: 'Юпитеру', Saturn: 'Сатурну', Fortune: 'Фортуне', FortuneA: 'антисции Фортуны' };
  const INS = { Sun: 'Солнцем', Moon: 'Луной', Mercury: 'Меркурием', Venus: 'Венерой', Mars: 'Марсом', Jupiter: 'Юпитером', Saturn: 'Сатурном', Fortune: 'Фортуной', FortuneA: 'антисцией Фортуны' };
  const NAT_PREP = { Sun: 'натальном Солнце', Mars: 'натальном Марсе', Jupiter: 'натальном Юпитере' };
  const NAT_DAT = { Sun: 'натальному Солнцу', Mars: 'натальному Марсу' };
  const ASP_IN = { 0: 'соединении', 60: 'секстиле', 90: 'квадрате', 120: 'трине', 180: 'оппозиции' };
  const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const ORB = 5;                    // "anything more than five degrees away is too far for football"
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

  /* fav: 'home' | 'away'. Returns testimonies for both teams and a verdict. */
  function judge(m, place, fav, house) {
    const E = eventChart(m.date, place, house);
    const { P, cusps, fortune } = E;
    const teams = {
      fav: { side: fav, own: [1, 10], opp: [7, 4], name: fav === 'home' ? m.home.name : m.away.name },
      dog: { side: fav === 'home' ? 'away' : 'home', own: [7, 4], opp: [1, 10], name: fav === 'home' ? m.away.name : m.home.name },
    };
    // significators: the rulers of each team's two angles; the Moon is the flow of events, so her dispositor stands in
    const notes = [];
    const claim = {};
    for (const k of ['fav', 'dog']) {
      const T = teams[k];
      T.sigs = [];
      for (const h of T.own) {
        let r = DOMICILE[signOf(cusps[h])], via = null;
        if (r === 'Moon') { via = r; r = DOMICILE[signOf(P.Moon.lon)]; }
        T.sigs.push({ id: r, house: h, via });
      }
    }
    for (const k of ['fav', 'dog']) for (const s of teams[k].sigs) (claim[s.id] = claim[s.id] || new Set()).add(k);
    for (const k of ['fav', 'dog']) {
      const T = teams[k];
      T.sigs = T.sigs.filter((s, i, a) => {
        if (s.via && s.id === 'Moon') return false;
        if (claim[s.id].size > 1) { if (!notes.some((n) => n.includes(RU[s.id]))) notes.push(`${RU[s.id]} управляет углами обеих команд и не считается ни за одну.`); return false; }
        return a.findIndex((x) => x.id === s.id) === i;
      });
    }
    const T = [];       // testimonies
    const add = (k, w, text, kind) => T.push({ team: k, w, text, kind: kind || 'other' });
    const cuspDist = (lon, h) => n180(lon - cusps[h]);      // > 0: inside the house that begins at the cusp
    const cname = (h) => ({ 1: 'Асцендента', 10: 'MC', 7: 'Десцендента', 4: 'IC' }[h]);
    for (const k of ['fav', 'dog']) {
      const me = teams[k];
      for (const s of me.sigs) {
        const p = P[s.id], role = `${RU[s.id]} (управитель ${RN[s.house]}${s.via ? ', вместо Луны' : ''})`;
        for (const h of me.own) {
          const d = cuspDist(p.lon, h);
          if (Math.abs(d) <= ORB) add(k, 2, `${role} на куспиде ${cname(h)} (${Math.abs(d).toFixed(1)}°): команда в силе на своём углу`, 'cusp');
          else { const da = n180(anti(p.lon) - cusps[h]); if (Math.abs(da) <= ORB) add(k, 1, `Антисция ${GEN[s.id] || RU[s.id]} на куспиде ${cname(h)} (${Math.abs(da).toFixed(1)}°)`, 'cusp'); }
        }
        for (const h of me.opp) {
          const d = cuspDist(p.lon, h);
          if (d < 0 && d >= -ORB) add(k, 1.5, `${role} перед куспидом ${cname(h)} соперника (${(-d).toFixed(1)}°): давит на чужой угол`, 'cusp');
          if (d >= 0 && d <= ORB) add(k, -2, `${role} внутри дома соперника, сразу за куспидом ${cname(h)} (${d.toFixed(1)}°): во власти соперника`, 'cusp');
        }
        // Fortuna: an applying conjunction helps, an applying opposition hurts (Fortuna runs with the Ascendant)
        for (const [pt, nm, w] of [[fortune, 'Фортуной', 1], [anti(fortune), 'антисцией Фортуны', 0.5]]) {
          const c = n180(p.lon - pt), o = n180(p.lon - pt - 180);
          if (Math.abs(c) <= ORB && c > 0) add(k, 2 * w, `${RU[s.id]} в сходящемся соединении с ${nm} (${c.toFixed(1)}°)`, 'fortuna');
          if (Math.abs(o) <= ORB && o > 0) add(k, -1.5 * w, `${RU[s.id]} в сходящейся оппозиции с ${nm} (${o.toFixed(1)}°)`, 'fortuna');
        }
        const nn = P.Node && Math.abs(n180(p.lon - P.Node.lon)), sn = P.Node && Math.abs(n180(p.lon - P.Node.lon - 180));
        if (nn != null && nn <= 3) add(k, 1, `${RU[s.id]} на северном узле (${nn.toFixed(1)}°): прибавляет`, 'node');
        if (sn != null && sn <= 3) add(k, -1, `${RU[s.id]} на южном узле (${sn.toFixed(1)}°): отнимает`, 'node');
        if (s.id !== 'Sun') {
          const ds = Math.abs(n180(p.lon - P.Sun.lon));
          if (ds <= 17 / 60) add(k, 1, `${RU[s.id]} в сердце Солнца (кацими)`, 'sun');
          else if (ds <= 2) add(k, -1.5, `${RU[s.id]} сожжён Солнцем (${ds.toFixed(1)}°)`, 'sun');
        }
      }
      // the Moon and Fortuna on the team's own cusps
      for (const h of me.own) {
        const dm = Math.abs(cuspDist(P.Moon.lon, h));
        if (dm <= ORB) add(k, 2, `Луна на куспиде ${cname(h)} (${dm.toFixed(1)}°)`, 'moon');
        else { const da = Math.abs(n180(anti(P.Moon.lon) - cusps[h])); if (da <= ORB) add(k, 1, `Антисция Луны на куспиде ${cname(h)} (${da.toFixed(1)}°)`, 'moon'); }
        const nearNew = Math.abs(n180(P.Moon.lon - P.Sun.lon)) < 15;      // then Fortuna sits on the Ascendant anyway
        const df = Math.abs(cuspDist(fortune, h)), dfa = Math.abs(n180(anti(fortune) - cusps[h]));
        if (df <= ORB && !nearNew) add(k, 1, `Фортуна на куспиде ${cname(h)} (${df.toFixed(1)}°)`, 'fortuna');
        if (dfa <= ORB) add(k, 1, `Антисция Фортуны на куспиде ${cname(h)} (${dfa.toFixed(1)}°)`, 'fortuna');
        if (P.Pluto) { const dp = Math.abs(cuspDist(P.Pluto.lon, h)); if (dp <= 3) add(k, -2, `Плутон на куспиде ${cname(h)} (${dp.toFixed(1)}°): тяжёлое поражение угла`, 'pluto'); }
      }
    }

    // the Moon's applying aspects within 6°: the last one is usually the final word
    const targets = [];
    for (const k of ['fav', 'dog']) for (const s of teams[k].sigs) targets.push({ id: s.id, lon: P[s.id].lon, speed: P[s.id].speed, team: k, label: RU[s.id] });
    targets.push({ id: 'Fortune', lon: fortune, speed: 0, label: 'Фортуна' });
    targets.push({ id: 'FortuneA', lon: anti(fortune), speed: 0, label: 'антисция Фортуны' });
    const moon = P.Moon, moonAsp = [];
    for (const t of targets) {
      if (t.id === 'Moon') continue;
      for (const a of ASPECTS) for (const sgn of a === 0 || a === 180 ? [1] : [1, -1]) {
        const target = n360(t.lon + sgn * a);
        const ahead = n360(target - moon.lon);                // degrees the Moon still has to travel
        const rel = moon.speed - (t.speed || 0);
        if (ahead > 0 && ahead <= 6 && rel > 0) moonAsp.push({ to: t, asp: a, deg: ahead, hours: ahead / rel * 24 });
      }
    }
    moonAsp.sort((x, y) => x.deg - y.deg);
    if (moonAsp.length) {
      const last = moonAsp[moonAsp.length - 1];
      const lt = last.asp === 0 ? `соединение с ${INS[last.to.id]}` : `${ASP_RU[last.asp]} к ${DAT[last.to.id]}`;
      if (last.to.team) add(last.to.team, last.asp === 0 ? 3.5 : 3, `Последний аспект Луны в пределах 6° — ${lt} (${last.deg.toFixed(1)}°): решающее свидетельство`, 'lastmoon');
      else add(last.asp === 90 || last.asp === 180 ? 'dog' : 'fav', 2, `Последний аспект Луны в пределах 6° — ${lt}: ${last.asp === 90 || last.asp === 180 ? 'напряжённый, в пользу аутсайдера' : 'гармоничный, в пользу фаворита'}`, 'lastmoon');
      for (const x of moonAsp.slice(0, -1)) if (x.asp === 0 && x.to.team) add(x.to.team, 1.5, `Луна идёт к соединению с ${INS[x.to.id]} (${x.deg.toFixed(1)}°)`, 'moon');
    }

    const score = { fav: 0, dog: 0 };
    for (const t of T) score[t.team] += t.w;
    const diff = score.fav - score.dog;
    const strength = Math.abs(diff) >= 3.5 ? 'явный' : Math.abs(diff) >= 1.5 ? 'умеренный' : null;
    const winner = strength ? (diff > 0 ? 'fav' : 'dog') : null;
    const verdict = winner
      ? { v: winner, side: teams[winner].side, strength, text: `${strength === 'явный' ? 'Явный' : 'Умеренный'} перевес: ${teams[winner].name}${winner === 'dog' ? ' (аутсайдер)' : ''}.` }
      : { v: 'draw', side: null, strength: null, text: T.length ? 'Свидетельства уравновешены: равная игра, возможна ничья.' : 'Сильных свидетельств нет ни у одной команды: равная игра, возможна ничья.' };
    return { E, teams, testimonies: T, score, diff, verdict, moonAsp, notes, fortune };
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

  root.SPORT = { LEAGUES, fixtures, squads, venuePlace, judge, playerIndex, eventChart, implied, RU, RN };
})(typeof window !== 'undefined' ? window : globalThis);
