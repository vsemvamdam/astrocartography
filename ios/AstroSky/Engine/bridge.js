/* AstroSky for iOS: a JSON API over the site's engine (js/*.js), run in JavaScriptCore.
   The app loads, in order: prelude.js (window, atob), Astronomy Engine, the site's data and engine files,
   then this file. Every call takes and returns a JSON string, so the Swift side decodes plain Codable
   structs. The numbers are exactly the site's: the same code computes them. */
(function (root) {
  'use strict';
  const ACG = root.ACG, N = root.NATAL, F = root.FEAT, I = root.INTERP;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const pad = (n) => String(n).padStart(2, '0');
  const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const ASTEROIDS = ['Ceres', 'Pallas', 'Juno', 'Vesta'];
  const ASTEROIDS2 = ['Eros', 'Psyche', 'Amor', 'Hygiea', 'Proserpina'];
  const BODY = Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const DEFAULTS = { house: 'P', minor: false, nodes: true, chiron: true, lilith: true, fortune: true, angles: true, asteroids: false, asteroids2: false, node: 'true' };

  /* ------------------------------ formatting ------------------------------ */
  // the same as natal-view.js: degrees within the sign truncated like Sotis
  function pos(lon) {
    const L = n360(lon), sign = Math.floor(L / 30), totalSec = Math.floor((L - sign * 30) * 3600 + 1e-6);
    const deg = Math.floor(totalSec / 3600), min = Math.floor(totalSec / 60) % 60, sec = totalSec % 60;
    return { deg, min, sec, glyph: ACG.SIGNS[sign][0], name: ACG.SIGNS[sign][1], text: `${deg}°${pad(min)}′` };
  }
  const dm = (v) => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60); return m === 60 ? `${d + 1}°00′` : `${d}°${pad(m)}′`; };
  const fmtLat = (v) => `${dm(v)} ${v >= 0 ? 'с.ш.' : 'ю.ш.'}`;
  const fmtLon = (v) => { v = n180(v); return `${dm(v)} ${v >= 0 ? 'в.д.' : 'з.д.'}`; };
  const offText = (off) => { const sec = Math.round(Math.abs(off) * 60), ss = sec % 60; return `UTC${off < 0 ? '−' : '+'}${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}${ss ? `:${pad(ss)}` : ''}`; };
  function localTime(ms, tz) {
    const off = ACG.tzOffsetMin(tz || 'UTC', ms), d = new Date(ms + off * 60000);
    return {
      text: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      wd: WD[d.getUTCDay()],
      iso: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      off,
    };
  }

  /* -------------------------------- cities -------------------------------- */
  // js/data.js: "name|english|country|lat*100|lon*100|tz|population|zoom*10"
  let CITIES = null;
  function cities() {
    if (CITIES) return CITIES;
    const D = root.ACG_DATA;
    if (!D) return (CITIES = []);
    CITIES = D.cities.split('\n').map((row) => {
      const f = row.split('|');
      return { ru: f[0], en: f[1], c: D.countries[+f[2]], lat: +f[3] / 100, lon: +f[4] / 100, tz: D.tzs[+f[5]], pop: +f[6] };
    });
    return CITIES;
  }

  /* -------------------------------- charts -------------------------------- */
  const fill = (o, defs) => { const r = Object.assign({}, defs); for (const k in o || {}) if (o[k] != null) r[k] = o[k]; return r; };
  const visibleFn = (o) => (id) => {
    if (id === 'Node' || id === 'SNode') return o.nodes;
    if (id === 'Lilith') return o.lilith;
    if (id === 'Chiron') return o.chiron;
    if (ASTEROIDS.includes(id)) return o.asteroids;
    if (ASTEROIDS2.includes(id)) return o.asteroids2;
    if (id === 'Fortune') return o.fortune;
    return true;
  };
  const nodesRetro = (chart) => { chart.bodies.forEach((b) => { if (b.id === 'Node') b.retro = b.speed < 0.005; }); return chart; };

  // a person: {date: 'YYYY-MM-DD', time: 'HH:MM', place: {name, lat, lon, tz}, offset: minutes or null}
  function birth(p, o) {
    const [y, mo, d] = p.date.split('-').map(Number), [hh, mi] = p.time.split(':').map(Number);
    let conv;
    try { conv = ACG.localToUtc(y, mo, d, hh, mi, p.place.tz || 'UTC', p.offset == null ? null : p.offset, p.place.lon); }
    catch (e) { conv = ACG.localToUtc(y, mo, d, hh, mi, 'UTC', 0); }
    return { conv, chart: nodesRetro(ACG.computeChart(conv.utc, { node: o.node })) };
  }

  // plain JSON for the Swift side
  const pt = (p) => ({
    id: p.id, ru: p.ru, glyph: p.glyph, color: p.color || null, lon: p.lon, lat: p.lat || 0, speed: p.speed || 0,
    retro: !!p.retro, sign: p.sign != null ? p.sign : Math.floor(n360(p.lon) / 30), house: p.house || 0,
    dign: (p.dign || []).map((d) => ({ k: d.k, ru: d.ru })), angle: !!p.angle, short: !!(BODY[p.id] && BODY[p.id].short),
    planet: !!p.planet, noAspects: !!p.noAspects,
  });
  const asp = (x, prefixB) => ({
    a: x.A.id, b: String(x.B.id).replace(/^B:/, ''), aLon: x.A.lon, bLon: x.B.lon, partner: !!prefixB,
    aspect: x.asp.id, angle: x.asp.a, glyph: x.asp.glyph, ru: x.asp.ru, kind: x.asp.kind, major: !!x.asp.major,
    orb: x.orb, maxOrb: x.maxOrb || x.asp.orb, applying: x.applying == null ? null : !!x.applying,
  });
  function chartOut(nat, vis) {
    return {
      asc: nat.asc, mc: nat.mc, cusps: nat.cusps.slice(1, 13), houseSystem: nat.used,
      houseSystemRu: (N.HOUSE_SYSTEMS.find((s) => s.id === nat.used) || {}).ru || '',
      note: nat.note || '', isDay: !!nat.isDay,
      points: nat.points.filter((p) => vis(p.id)).map(pt),
      angles: (nat.angles || []).map(pt),
      aspects: (nat.aspects || []).filter((x) => (x.A.angle || vis(x.A.id)) && (x.B.angle || vis(x.B.id))).map((x) => asp(x)),
      elements: nat.elements || [], crosses: nat.crosses || [],
      rulers: (nat.rulers || []).slice(0, 12),
    };
  }

  // reading model, the same as the site's PDF model: sections of items with a glyph, a colour and the text
  const glyphOf = (id) => {
    const b = BODY[String(id).replace(/^B:/, '')];
    return b ? { glyph: b.glyph, color: b.color } : id === 'Lilith' ? { glyph: '⚸', color: '#B9A7D8' } : id === 'Fortune' ? { glyph: '⊗', color: '#D9B56E' } : null;
  };
  const EL_COLOR = ['#F0805E', '#9CC77A', '#E6CB72', '#62A9EF'];
  function item(it) {
    let g = null;
    if (it.asp) g = { glyph: it.asp.glyph, color: it.asp.kind === 'soft' ? '#5C9DFF' : it.asp.kind === 'hard' ? '#FF6A5C' : '#D8A4A6' };
    else if (it.id === 'ASC' || it.id === 'MC') g = { glyph: it.id, color: '#D8A4A6' };
    else if (typeof it.mark === 'number') g = { glyph: '●', color: EL_COLOR[it.mark] || '#D8A4A6' };
    else g = glyphOf(it.mark != null ? it.mark : it.id);
    return {
      glyph: g ? g.glyph : '', color: g ? g.color : null, head: it.head || '', text: it.text || '',
      tone: it.tone === 'soft' || it.tone === 'hard' ? it.tone : (it.asp ? it.asp.kind : null),
      partner: !!it.partner, house: false, indent: false,
    };
  }
  function readingOut(secs, houses) {
    const out = { sections: (secs || []).filter((s) => s.items && s.items.length).map((s) => ({ key: s.key || s.title, title: s.title, note: s.note || null, items: s.items.map(item) })) };
    if (houses) {
      out.points = houses.points.map((p) => {
        const g = p.id ? glyphOf(p.id) : null;
        return { glyph: g ? g.glyph : p.house ? String(p.house) : (p.sign != null ? ACG.SIGNS[p.sign][0] : ''), color: g ? g.color : (p.sign != null ? EL_COLOR[p.sign % 4] : '#D8A4A6'),
          head: p.head, text: p.text, house: !!p.house, tone: null, partner: false, indent: false };
      });
      out.houses = houses.houses.map((x) => ({
        h: x.h, roman: RN[x.h], topic: x.topic, power: x.power, cuspSign: x.cusp.sign, cuspSignIn: I.SIGN_IN[x.cusp.sign],
        cuspText: x.cusp.text, projText: x.proj.text, empty: x.empty || 'Планет здесь нет.',
        planets: x.planets.map((p) => {
          const g = glyphOf(p.id) || {};
          return { id: p.id, ru: p.ru, glyph: g.glyph || '', color: g.color || '#D8A4A6', score: p.score == null ? null : p.score,
            signIn: I.SIGN_IN[p.sign], retro: !!p.retro, label: p.label || null, why: p.why || [], key: p.key || null,
            text: p.text || '', power: p.power || '', natText: p.natText || '' };
        }),
      }));
      out.housesGen = houses.gen; out.housesSys = houses.sys; out.housesKind = houses.kind;
    }
    return out;
  }

  const MODE_TITLE = { natal: 'Натальная карта', solar: 'Соляр', lunar: 'Лунар', synastry: 'Синастрия', composite: 'Композит' };

  /* request: {mode, person, partner?, opts?, solar?: {year, place}, lunar?: {at, place}} */
  function chart(req) {
    const o = fill(req.opts, DEFAULTS), vis = visibleFn(o), mode = req.mode || 'natal';
    const P = req.person, place = P.place;
    const natOpts = { house: mode === 'lunar' ? 'P' : o.house, minor: !!o.minor, points: vis, anglesAspects: !!o.angles };
    const A = birth(P, o);
    const natA = N.computeNatal(A.chart, place.lat, place.lon, natOpts);
    const [y, m, d] = P.date.split('-').map(Number);
    const birthLine = `${d} ${MONTHS[m - 1]} ${y} · ${P.time} · ${place.name || ''}`;
    const res = { mode, kind: MODE_TITLE[mode], title: birthLine, sub: '', note: natA.note || '', utc: A.conv.utc, offset: A.conv.offset, offsetSource: A.conv.source,
      ambiguous: !!A.conv.ambiguous, gap: !!A.conv.gap };
    let nat = natA, secs = null, houses = null, rtitle = 'Расшифровка натальной карты', rsub = 'характер, планеты в знаках и домах, аспекты';
    const sysRu = () => (N.HOUSE_SYSTEMS.find((s) => s.id === nat.used) || {}).ru || '';

    if (mode === 'solar') {
      const S = req.solar || {}, sp = S.place || place;
      const now = new Date(), passed = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() > d);
      const year = S.year || now.getFullYear() + (passed ? 1 : 0);
      const sunLon = A.chart.bodies.find((b) => b.id === 'Sun').elon;
      const utc = F.solarReturnUtc(A.chart.utcMs, sunLon, year);
      const ch = nodesRetro(ACG.computeChart(utc, { node: o.node }));
      nat = N.computeNatal(ch, sp.lat, sp.lon, natOpts);
      const score = F.scoreSolarPlace(ch, sp.lat, sp.lon, o.house);
      const per = {};
      const pool = cities().filter((c) => c.pop >= 300000);
      const top = F.rankSolarCities(ch, pool, o.house).filter((r) => (per[r.city.c] = (per[r.city.c] || 0) + 1) <= 2).slice(0, 12);
      const parts = (ps) => ps.slice(0, 5).map((x) => ({ glyph: x.body.glyph, color: x.body.color, label: x.house ? `${x.house} дом` : `на ${x.angle}`, neg: x.s < 0 }));
      const lt = localTime(utc, sp.tz), spos = pos(sunLon);
      res.title = `Соляр ${year} · ${sp.name || ''}`;
      res.sub = `Солнце возвращается в ${spos.text}${pad(spos.sec)}″ ${spos.name}: ${lt.text} (${offText(lt.off)}) · ${fmtLat(sp.lat)} · ${fmtLon(sp.lon)} · дома: ${sysRu()}`;
      res.solar = { year, utc, local: lt.text, place: sp, score: score.score, parts: parts(score.parts),
        best: top.map((r) => ({ city: { name: r.city.ru, country: r.city.c, lat: r.city.lat, lon: r.city.lon, tz: r.city.tz }, score: r.score, parts: parts(r.parts) })) };
      secs = I.solar(nat, natA); houses = I.solarHouses(nat, natA);
      rtitle = `Расшифровка соляра ${year}`; rsub = 'на год от дня рождения до дня рождения';
    } else if (mode === 'lunar') {
      const L = req.lunar || {}, lp = L.place || place;
      const moonLon = A.chart.bodies.find((b) => b.id === 'Moon').elon;
      const utc = F.lunarReturnUtc(moonLon, L.at == null ? Date.now() : L.at);
      const ch = nodesRetro(ACG.computeChart(utc, { node: o.node }));
      nat = N.computeNatal(ch, lp.lat, lp.lon, natOpts);
      const next = F.nextLunarReturnUtc(moonLon, utc);
      const list = [F.lunarReturnUtc(moonLon, utc - 60000), utc];
      while (list.length < 14) list.push(F.nextLunarReturnUtc(moonLon, list[list.length - 1]));
      const lt = localTime(utc, lp.tz), mp = pos(moonLon);
      res.title = `Лунар ${lt.date} · ${lp.name || ''}`;
      res.sub = `Луна возвращается в ${mp.text}${pad(mp.sec)}″ ${mp.name}: ${lt.text} (${offText(lt.off)}) · следующий лунар ${localTime(next, lp.tz).text} · ${fmtLat(lp.lat)} · ${fmtLon(lp.lon)} · дома: ${sysRu()}`;
      res.lunar = { utc, next, local: lt.text, nextLocal: localTime(next, lp.tz).text, place: lp,
        list: list.map((t) => { const x = localTime(t, lp.tz); return { utc: t, date: x.date, time: x.time, wd: x.wd, current: t === utc }; }) };
      secs = I.lunar(nat, natA); houses = I.lunarHouses(nat, natA);
      rtitle = 'Расшифровка лунара'; rsub = `на месяц: ${lt.date} — ${localTime(next, lp.tz).date}`;
    } else if ((mode === 'synastry' || mode === 'composite') && req.partner) {
      const Q = req.partner, B = birth(Q, o);
      const natB = N.computeNatal(B.chart, Q.place.lat, Q.place.lon, natOpts);
      const name = Q.name || 'Партнёр';
      const [qy, qm, qd] = Q.date.split('-').map(Number);
      res.partnerUtc = B.conv.utc;
      if (mode === 'composite') {
        nat = F.composite(natA, natB, o.house, { points: vis, minor: !!o.minor, angles: !!o.angles });
        secs = I.composite(nat); rtitle = 'Расшифровка композита'; rsub = 'отношения как отдельная карта';
        res.title = `Композит · вы и ${name}`;
      } else {
        const outer = natB.points.filter((p) => vis(p.id)).map((p) => Object.assign({}, p, { id: 'B:' + p.id, baseId: p.id }));
        const As = natA.points.filter((p) => vis(p.id) && !p.noAspects).concat(o.angles ? natA.angles : []);
        const Bs = outer.filter((p) => !p.noAspects).concat(o.angles ? natB.angles.map((p) => Object.assign({}, p, { id: 'B:' + p.id })) : []);
        const cross = F.crossAspects(As, Bs);
        res.outer = outer.map((p) => Object.assign(pt(Object.assign({}, p, { id: p.baseId })), { houseIn: N.houseOf(p.lon, natA.cusps) }));
        res.outerAngles = natB.angles.map(pt);
        res.cross = cross.map((x) => asp(x, true));
        secs = I.synastry(natA, natB, cross, name); rtitle = 'Расшифровка синастрии'; rsub = `вы и ${name}`;
        res.title = `Синастрия · вы и ${name}`;
      }
      res.sub = `Вы: ${birthLine} · ${name}: ${pad(qd)}.${pad(qm)}.${qy} · ${Q.time} · ${Q.place.name || ''} · дома: ${sysRu()}${mode === 'composite' ? ' · композит по средним точкам' : ''}`;
    } else {
      const u = new Date(A.conv.utc);
      res.sub = `${fmtLat(place.lat)} · ${fmtLon(place.lon)} · UTC ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())} (${offText(A.conv.offset)}) · дома: ${sysRu()}`;
      secs = I.natal(nat);
    }
    res.chart = chartOut(nat, vis);
    res.reading = Object.assign({ title: rtitle, sub: rsub }, readingOut(secs, houses));
    return res;
  }

  // glyph and position text for a longitude, used by tables
  function position(lon) { const p = pos(lon); return { deg: p.deg, min: p.min, sec: p.sec, sign: Math.floor(n360(lon) / 30), glyph: p.glyph, name: p.name, text: p.text }; }

  const wrap = (fn) => (json) => {
    try { return JSON.stringify({ ok: true, value: fn(json ? JSON.parse(json) : null) }); }
    catch (e) { return JSON.stringify({ ok: false, error: String(e && e.message || e), stack: String(e && e.stack || '') }); }
  };
  root.AstroAPI = {
    version: () => '1',
    chart: wrap(chart),
    position: wrap((r) => position(r.lon)),
    cities: wrap(() => cities().map((c) => [c.ru, c.en, c.c, c.lat, c.lon, c.tz, c.pop])),
    meta: wrap(() => ({
      bodies: ACG.BODIES.map((b) => ({ id: b.id, ru: b.ru, glyph: b.glyph, color: b.color, short: !!b.short })),
      signs: ACG.SIGNS.map(([glyph, name], i) => ({ glyph, name, signIn: I.SIGN_IN[i] })),
      houseSystems: N.HOUSE_SYSTEMS,
      rulers: N.RULERS,
    })),
    needsExtra: wrap(() => !(root.ACG_ASTEROIDS && root.ACG_ASTEROIDS.data && root.ACG_ASTEROIDS.data.Eros)),
  };
})(typeof window !== 'undefined' ? window : globalThis);
