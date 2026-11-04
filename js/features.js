/* Extra calculations: best cities for a goal, solar return, synastry and composite,
   and Sotis-style tools. Depends on Astronomy, ACG (acg-core.js) and NATAL (natal.js). */
(function (root) {
  'use strict';
  const ACG = root.ACG, N = root.NATAL;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const A = () => root.Astronomy;
  const ANG = ['MC', 'IC', 'ASC', 'DSC'];

  /* =============================== best cities =============================== */
  // Weight of each planet line for a goal: positive helps, negative works against it.
  const GOALS = [
    { id: 'love', ru: 'Любовь и отношения', w: {
      Venus: { DSC: 5, ASC: 4, IC: 3, MC: 2.5 }, Moon: { DSC: 2, IC: 2, ASC: 1 }, Jupiter: { DSC: 3, ASC: 1.5 }, Sun: { DSC: 1.5 },
      Saturn: { DSC: -3.5, ASC: -1.5 }, Mars: { DSC: -1.5 }, Pluto: { DSC: -2 }, Uranus: { DSC: -1.5 }, Neptune: { DSC: -1 } } },
    { id: 'career', ru: 'Карьера и признание', w: {
      Sun: { MC: 5, ASC: 2.5 }, Jupiter: { MC: 5, ASC: 2 }, Venus: { MC: 2.5 }, Mercury: { MC: 2.5, ASC: 1 }, Mars: { MC: 2.5, ASC: 1 },
      Moon: { MC: 1 }, Saturn: { MC: 1.5, ASC: -1.5 }, Pluto: { MC: 1.5 }, Uranus: { MC: 1 }, Neptune: { MC: -2.5 } } },
    { id: 'money', ru: 'Деньги и бизнес', w: {
      Jupiter: { MC: 5, ASC: 3, IC: 2.5, DSC: 2.5 }, Venus: { MC: 4, ASC: 2.5, IC: 2 }, Sun: { MC: 2.5 }, Mercury: { MC: 2 }, Pluto: { MC: 1.5 },
      Saturn: { MC: 0.5, IC: -1.5, ASC: -1 }, Mars: { IC: -1 }, Neptune: { MC: -3, ASC: -1.5 } } },
    { id: 'home', ru: 'Дом и семья', w: {
      Moon: { IC: 5, ASC: 1.5 }, Venus: { IC: 4, DSC: 1.5 }, Jupiter: { IC: 4, ASC: 1 }, Sun: { IC: 2 },
      Saturn: { IC: -3 }, Mars: { IC: -2.5 }, Pluto: { IC: -2.5 }, Uranus: { IC: -2.5 }, Neptune: { IC: -1.5 } } },
    { id: 'health', ru: 'Здоровье и энергия', w: {
      Sun: { ASC: 5, MC: 1.5 }, Jupiter: { ASC: 4 }, Venus: { ASC: 2 }, Mars: { ASC: 1.5, MC: 1 }, Moon: { ASC: 1 },
      Saturn: { ASC: -4, MC: -1 }, Neptune: { ASC: -3 }, Pluto: { ASC: -3 }, Uranus: { ASC: -1 } } },
    { id: 'creative', ru: 'Творчество и вдохновение', w: {
      Venus: { ASC: 4, MC: 4, IC: 1.5 }, Neptune: { ASC: 3, MC: 3 }, Sun: { ASC: 2.5, MC: 2 }, Moon: { ASC: 2, IC: 1 },
      Uranus: { ASC: 2, MC: 1.5 }, Mercury: { ASC: 1.5, MC: 1.5 }, Saturn: { ASC: -2, MC: -1 } } },
    { id: 'study', ru: 'Учёба и общение', w: {
      Mercury: { ASC: 4, MC: 4, DSC: 2.5, IC: 2 }, Jupiter: { ASC: 3, MC: 2.5 }, Uranus: { ASC: 2, MC: 1.5 }, Sun: { ASC: 1.5 },
      Saturn: { MC: 1, ASC: -1 }, Neptune: { ASC: -1.5 } } },
    { id: 'spirit', ru: 'Духовный рост', w: {
      Neptune: { ASC: 4, IC: 3, MC: 2.5 }, Jupiter: { IC: 3, ASC: 2.5 }, Moon: { IC: 2.5, ASC: 1.5 }, Pluto: { ASC: 2, IC: 2 },
      Uranus: { ASC: 1.5 }, Sun: { ASC: 1 } } },
  ];
  const INFLUENCE_KM = 600;
  const closeness = (km) => (km >= INFLUENCE_KM ? 0 : Math.pow(1 - km / INFLUENCE_KM, 1.5));

  // distance to an ASC/DSC curve whose points are sorted by latitude
  function curveDist(arr, lat, lon, windowDeg) {
    const n = arr.length / 2;
    if (!n) return Infinity;
    let lo = 0, hi = n;
    const from = lat - windowDeg;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[2 * m + 1] < from) lo = m + 1; else hi = m; }
    let best = Infinity;
    for (let i = lo; i < n && arr[2 * i + 1] <= lat + windowDeg; i++) {
      const d = ACG.hav(lat, lon, arr[2 * i + 1], arr[2 * i]);
      if (d < best) best = d;
    }
    return best;
  }
  function angleDist(body, angle, lat, lon, maxKm) {
    if (angle === 'MC') return ACG.distToMeridianKm(lat, lon, body.mc);
    if (angle === 'IC') return ACG.distToMeridianKm(lat, lon, body.ic);
    return curveDist(angle === 'ASC' ? body.asc : body.dsc, lat, lon, maxKm / 111 + 0.6);
  }

  /* charts: [{ chart, who }] — one person, or a couple (scores are added up).
     cities: [{ ru, c, lat, lon, pop }]. Returns cities sorted by score with the lines that made it. */
  function scoreCities(charts, cities, goalId, opts) {
    opts = opts || {};
    const goal = GOALS.find((x) => x.id === goalId) || GOALS[0];
    const out = [];
    for (const city of cities) {
      let score = 0;
      const parts = [];
      for (const { chart, who } of charts) {
        for (const b of chart.bodies) {
          const wb = goal.w[b.id];
          if (!wb) continue;
          for (const a of ANG) {
            const w = wb[a];
            if (!w) continue;
            const km = angleDist(b, a, city.lat, city.lon, INFLUENCE_KM);
            const f = closeness(km);
            if (f <= 0) continue;
            const s = w * f;
            score += s;
            parts.push({ body: b, angle: a, km, w, s, who });
          }
        }
      }
      if (score > 0 || opts.keepAll) out.push({ city, score, parts: parts.sort((x, y) => Math.abs(y.s) - Math.abs(x.s)) });
    }
    return out.sort((x, y) => y.score - x.score);
  }

  /* =============================== solar return ============================== */
  const sunLon = (t) => A().Ecliptic(A().GeoVector(A().Body.Sun, t, true)).elon;
  // the moment in `year` when the Sun returns to its natal longitude
  function solarReturnUtc(natalUtcMs, natalSunLon, year) {
    const nd = new Date(natalUtcMs);
    let t = A().MakeTime(new Date(Date.UTC(year, nd.getUTCMonth(), nd.getUTCDate(), nd.getUTCHours(), nd.getUTCMinutes())));
    for (let i = 0; i < 30; i++) {
      const d = n180(natalSunLon - sunLon(t));
      if (Math.abs(d) < 1e-9) break;
      t = t.AddDays(d / 0.98564736);
    }
    return t.date.getTime();
  }

  // how good a solar return is in a given place: houses of the solar planets and planets on the angles
  const SOLAR_HOUSE_W = {
    Sun:     { 10: 5, 11: 4, 1: 3.5, 5: 3, 9: 3, 7: 2, 2: 2, 4: 1, 3: 1, 6: -2, 8: -3, 12: -4 },
    Jupiter: { 1: 4, 10: 4, 7: 2.5, 5: 2.5, 9: 2, 11: 2, 2: 2, 4: 2, 3: 1, 8: -0.5, 12: -0.5 },
    Venus:   { 1: 2, 5: 2, 7: 2, 10: 2, 2: 1.5, 11: 1.5, 4: 1, 9: 1, 3: 0.5, 8: -0.5, 12: -0.5 },
    Moon:    { 1: 1, 4: 1, 5: 1, 10: 1, 11: 1, 2: 0.5, 7: 0.5, 9: 0.5, 6: -0.5, 8: -1, 12: -1 },
    Saturn:  { 1: -3, 7: -2, 4: -1.5, 10: -1.5, 5: -1, 8: -1, 12: -1, 2: -0.5, 6: -0.5 },
    Mars:    { 1: -2, 7: -2, 8: -1.5, 12: -1.5, 4: -1, 6: -0.5, 10: 0.5 },
    Uranus:  { 1: -1.5, 4: -1, 7: -1, 11: 0.5 },
    Neptune: { 1: -2, 7: -1, 10: -1 },
    Pluto:   { 1: -2, 7: -1.5, 4: -1, 8: -1, 10: -0.5 },
  };
  const SOLAR_ANGLE_W = { Jupiter: 2, Venus: 1.5, Sun: 1, Saturn: -2, Mars: -1.5, Pluto: -1.5, Neptune: -1, Uranus: -1 };
  const ANGLE_ORB = 6;
  function scoreSolarPlace(chart, lat, lon, house) {
    const ramc = n360(chart.gast + lon);
    const H = N.computeHouses(house || 'P', ramc, chart.eps, lat);
    let score = 0;
    const parts = [];
    for (const b of chart.bodies) {
      const hw = SOLAR_HOUSE_W[b.id];
      if (!hw) continue;
      const h = N.houseOf(b.elon, H.cusps);
      const s = hw[h] || 0;
      if (s) { score += s; parts.push({ body: b, house: h, s }); }
      const aw = SOLAR_ANGLE_W[b.id];
      if (aw) {
        for (const [ang, lonA] of [['ASC', H.asc], ['MC', H.mc]]) {
          if (Math.abs(n180(b.elon - lonA)) <= ANGLE_ORB) { score += aw; parts.push({ body: b, angle: ang, s: aw }); }
        }
      }
    }
    return { score, parts: parts.sort((x, y) => Math.abs(y.s) - Math.abs(x.s)), asc: H.asc, mc: H.mc, used: H.used };
  }
  function rankSolarCities(chart, cities, house) {
    return cities.map((city) => Object.assign({ city }, scoreSolarPlace(chart, city.lat, city.lon, house)))
      .sort((x, y) => y.score - x.score);
  }

  /* ================================ synastry ================================ */
  const SYN_ORB = { 0: 7, 180: 7, 120: 6, 90: 6, 60: 4 };
  function crossAspects(ptsA, ptsB) {
    const majors = N.ASPECTS.filter((x) => x.major);
    const out = [];
    for (const a of ptsA) for (const b of ptsB) {
      const sep = Math.abs(n180(b.lon - a.lon));
      let best = null;
      for (const asp of majors) {
        let orb = SYN_ORB[asp.a];
        if (a.lum || b.lum) orb += 1;
        if (a.small || b.small || a.angle || b.angle) orb = Math.min(orb, 4);
        const d = Math.abs(sep - asp.a);
        if (d <= orb && (!best || d < best.d)) best = { asp, d, orb };
      }
      if (best) out.push({ A: a, B: b, asp: best.asp, orb: best.d, maxOrb: best.orb });
    }
    return out.sort((x, y) => x.orb - y.orb);
  }
  // midpoint on the shorter arc
  const midpoint = (a, b) => n360(a + n180(b - a) / 2);

  /* Composite chart (midpoint method). natA/natB are results of NATAL.computeNatal. */
  function composite(natA, natB, house, aspOpts) {
    const eps = (natA.eps + natB.eps) / 2;
    const mc = midpoint(natA.mc, natB.mc);
    const ramc = n360(Math.atan2(Math.sin(mc * D2R) * Math.cos(eps * D2R), Math.cos(mc * D2R)) * R2D);
    const lat = (natA.lat + natB.lat) / 2;
    const H = N.computeHouses(house || 'P', ramc, eps, lat);
    const pts = [];
    for (const pa of natA.points) {
      const pb = natB.points.find((q) => q.id === pa.id);
      if (!pb || pa.id === 'Fortune') continue;
      const lon = pa.id === 'SNode' ? null : midpoint(pa.lon, pb.lon);
      if (lon == null) continue;
      pts.push(Object.assign({}, pa, { lon, retro: false, sign: Math.floor(lon / 30), house: N.houseOf(lon, H.cusps), dign: [] }));
    }
    const node = pts.find((p) => p.id === 'Node');
    if (node) {
      const lon = n360(node.lon + 180);
      pts.splice(pts.indexOf(node) + 1, 0, { id: 'SNode', ru: 'Юж. узел', glyph: '☋', color: '#A7B4C8', lon, sign: Math.floor(lon / 30), house: N.houseOf(lon, H.cusps), small: true, extra: true, noAspects: true, dign: [] });
    }
    for (const p of pts) if (p.planet) p.dign = N.dignity(p.id, p.sign);
    const angles = [{ id: 'ASC', ru: 'Асцендент', glyph: 'ASC', lon: H.asc, angle: true }, { id: 'MC', ru: 'Середина неба', glyph: 'MC', lon: H.mc, angle: true }];
    const aspects = N.computeAspects(pts.filter((p) => !p.noAspects && (!aspOpts || !aspOpts.points || aspOpts.points(p.id))).concat(aspOpts && aspOpts.angles === false ? [] : angles), aspOpts && aspOpts.minor);
    const el = [0, 0, 0, 0], cr = [0, 0, 0];
    for (const p of pts) if (p.planet) { el[p.sign % 4]++; cr[p.sign % 3]++; }
    return Object.assign({}, H, { ramc, eps, lat, points: pts, angles, aspects, isDay: n360(pts[0].lon - H.asc) > 180, elements: el, crosses: cr });
  }

  /* ================================== tools ================================= */
  const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
  const WEEKDAY_RULER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];  // Sunday … Saturday

  // Planetary rulers of the day and of each of the 24 unequal hours, for a local calendar date and place
  function planetaryHours(y, m, d, place) {
    const Ax = A();
    const obs = new Ax.Observer(place.lat, place.lon, 0);
    const midnight = ACG.localToUtc(y, m, d, 0, 0, place.tz).utc;
    const rise = Ax.SearchRiseSet(Ax.Body.Sun, obs, +1, Ax.MakeTime(new Date(midnight)), 1);
    if (!rise) return { polar: true };
    const set = Ax.SearchRiseSet(Ax.Body.Sun, obs, -1, rise, 1);
    const next = set && Ax.SearchRiseSet(Ax.Body.Sun, obs, +1, set, 1.5);
    if (!set || !next) return { polar: true };
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const dayRuler = WEEKDAY_RULER[weekday];
    const start = CHALDEAN.indexOf(dayRuler);
    const hours = [];
    const r0 = rise.date.getTime(), s0 = set.date.getTime(), n0 = next.date.getTime();
    const dh = (s0 - r0) / 12, nh = (n0 - s0) / 12;
    for (let k = 0; k < 24; k++) {
      const day = k < 12;
      const st = day ? r0 + k * dh : s0 + (k - 12) * nh;
      hours.push({ n: (k % 12) + 1, day, ruler: CHALDEAN[(start + k) % 7], start: st, end: st + (day ? dh : nh) });
    }
    return { dayRuler, weekday, sunrise: r0, sunset: s0, nextSunrise: n0, hours };
  }

  // Moon void of course: from the Moon's last exact major aspect in a sign until it enters the next sign
  function voidOfCourse(fromUtc, days, planetIds) {
    const Ax = A();
    const lonOf = (id, ms) => Ax.Ecliptic(Ax.GeoVector(Ax.Body[id], Ax.MakeTime(new Date(ms)), true)).elon;
    const H = 3600000, t0 = fromUtc - 3 * 86400000, t1 = fromUtc + days * 86400000 + 3 * 86400000;
    const bisect = (f, a, b) => { let fa = f(a); for (let i = 0; i < 40; i++) { const m = (a + b) / 2, fm = f(m); if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; };
    // Moon sign ingresses
    const ingresses = [];
    let prev = lonOf('Moon', t0);
    for (let t = t0 + H; t <= t1; t += H) {
      const cur = lonOf('Moon', t);
      if (Math.floor(cur / 30) !== Math.floor(prev / 30)) {
        const boundary = Math.floor(cur / 30) * 30;
        const ti = bisect((x) => n180(lonOf('Moon', x) - boundary), t - H, t);
        ingresses.push({ t: ti, sign: Math.floor(n360(boundary + 0.5) / 30) });
      }
      prev = cur;
    }
    // exact aspects of the Moon to the planets
    const events = [];
    const ASP = [0, 60, 90, 120, 180];
    for (const id of planetIds) {
      let pm = null;
      for (let t = t0; t <= t1; t += 2 * H) {
        const dl = n360(lonOf('Moon', t) - lonOf(id, t));
        if (pm != null) {
          for (const a of ASP) for (const target of a === 0 || a === 180 ? [a] : [a, 360 - a]) {
            const f = (x) => n180(n360(lonOf('Moon', x) - lonOf(id, x)) - target);
            const fa = n180(pm - target), fb = n180(dl - target);
            if (fa < 0 && fb >= 0 && fb - fa < 60) events.push({ t: bisect(f, t - 2 * H, t), planet: id, aspect: a });
          }
        }
        pm = dl;
      }
    }
    events.sort((x, y) => x.t - y.t);
    const out = [];
    for (let i = 1; i < ingresses.length; i++) {
      const a = ingresses[i - 1], b = ingresses[i];
      const inSign = events.filter((e) => e.t > a.t && e.t < b.t);
      const last = inSign[inSign.length - 1] || null;
      const start = last ? last.t : a.t;
      if (b.t < fromUtc || start > fromUtc + days * 86400000) continue;
      out.push({ start, end: b.t, last, nextSign: b.sign, fromSign: a.sign });
    }
    return out;
  }

  // Lunar days: day 1 starts at the new moon, each next day at moonrise
  function lunarDays(atUtc, place) {
    const Ax = A();
    const obs = new Ax.Observer(place.lat, place.lon, 0);
    const nm1 = Ax.SearchMoonPhase(0, Ax.MakeTime(new Date(atUtc - 30 * 86400000)), 31);
    let start = nm1;
    // make sure we take the last new moon before `atUtc`
    for (;;) { const nx = Ax.SearchMoonPhase(0, start.AddDays(1), 31); if (nx.date.getTime() > atUtc) break; start = nx; }
    const nextNew = Ax.SearchMoonPhase(0, start.AddDays(1), 31);
    const days = [{ n: 1, start: start.date.getTime() }];
    let t = start;
    for (let i = 0; i < 32; i++) {
      const r = Ax.SearchRiseSet(Ax.Body.Moon, obs, +1, t, 3);
      if (!r || r.date.getTime() >= nextNew.date.getTime()) break;
      days.push({ n: days.length + 1, start: r.date.getTime() });
      t = r.AddDays(0.01);
    }
    days.forEach((d, i) => { d.end = i + 1 < days.length ? days[i + 1].start : nextNew.date.getTime(); });
    return { newMoon: start.date.getTime(), nextNewMoon: nextNew.date.getTime(), days };
  }

  // Bright fixed stars, J2000 right ascension (hours) and declination (degrees)
  const STARS = [
    ['Альферац', 0, 8, 23.3, 29, 5, 26, 'Марс, Юпитер'], ['Мирах', 1, 9, 43.9, 35, 37, 14, 'Венера'], ['Ахернар', 1, 37, 42.8, -57, 14, 12, 'Юпитер'],
    ['Хамаль', 2, 7, 10.4, 23, 27, 45, 'Марс, Сатурн'], ['Полярная', 2, 31, 49.1, 89, 15, 51, 'Сатурн, Венера'], ['Менкар', 3, 2, 16.8, 4, 5, 23, 'Сатурн'],
    ['Алголь', 3, 8, 10.1, 40, 57, 20, 'Сатурн, Юпитер'], ['Альциона (Плеяды)', 3, 47, 29.1, 24, 6, 18, 'Луна, Марс'], ['Альдебаран', 4, 35, 55.2, 16, 30, 33, 'Марс'],
    ['Ригель', 5, 14, 32.3, -8, 12, 6, 'Юпитер, Сатурн'], ['Капелла', 5, 16, 41.4, 45, 59, 53, 'Марс, Меркурий'], ['Беллатрикс', 5, 25, 7.9, 6, 20, 59, 'Марс, Меркурий'],
    ['Альнилам', 5, 36, 12.8, -1, 12, 7, 'Юпитер, Сатурн'], ['Бетельгейзе', 5, 55, 10.3, 7, 24, 25, 'Марс, Меркурий'], ['Канопус', 6, 23, 57.1, -52, 41, 45, 'Сатурн, Юпитер'],
    ['Сириус', 6, 45, 8.9, -16, 42, 58, 'Юпитер, Марс'], ['Кастор', 7, 34, 36.0, 31, 53, 18, 'Меркурий'], ['Процион', 7, 39, 18.1, 5, 13, 30, 'Меркурий, Марс'],
    ['Поллукс', 7, 45, 18.9, 28, 1, 34, 'Марс'], ['Альфард', 9, 27, 35.2, -8, 39, 31, 'Сатурн, Венера'], ['Регул', 10, 8, 22.3, 11, 58, 2, 'Марс, Юпитер'],
    ['Денебола', 11, 49, 3.6, 14, 34, 19, 'Сатурн, Венера'], ['Акрукс', 12, 26, 35.9, -63, 5, 57, 'Юпитер'], ['Альгораб', 12, 29, 51.9, -16, 30, 56, 'Марс, Сатурн'],
    ['Виндемиатрикс', 13, 2, 10.6, 10, 57, 33, 'Сатурн, Меркурий'], ['Спика', 13, 25, 11.6, -11, 9, 41, 'Венера, Марс'], ['Хадар', 14, 3, 49.4, -60, 22, 23, 'Венера, Юпитер'],
    ['Арктур', 14, 15, 39.7, 19, 10, 57, 'Марс, Юпитер'], ['Толиман', 14, 39, 36.5, -60, 50, 2, 'Венера, Юпитер'], ['Зубен Эльгенуби', 14, 50, 52.7, -16, 2, 30, 'Юпитер, Марс'],
    ['Зубен Эльшемали', 15, 17, 0.4, -9, 22, 59, 'Юпитер, Меркурий'], ['Унукальхай', 15, 44, 16.1, 6, 25, 32, 'Сатурн, Марс'], ['Антарес', 16, 29, 24.5, -26, 25, 55, 'Марс, Юпитер'],
    ['Расальхаг', 17, 34, 56.1, 12, 33, 36, 'Сатурн, Венера'], ['Вега', 18, 36, 56.3, 38, 47, 1, 'Венера, Меркурий'], ['Альтаир', 19, 50, 47.0, 8, 52, 6, 'Марс, Юпитер'],
    ['Денеб', 20, 41, 25.9, 45, 16, 49, 'Венера, Меркурий'], ['Денеб Альгеди', 21, 47, 2.4, -16, 7, 38, 'Сатурн, Юпитер'], ['Садальмелик', 22, 5, 47.0, 0, -19, 11, 'Сатурн, Меркурий'],
    ['Фомальгаут', 22, 57, 39.0, -29, 37, 20, 'Венера, Меркурий'], ['Маркаб', 23, 4, 45.7, 15, 12, 19, 'Марс, Меркурий'], ['Шеат', 23, 3, 46.5, 28, 4, 58, 'Марс, Меркурий'],
  ];
  function starLongitudes(utcMs) {
    const Ax = A();
    const time = Ax.MakeTime(new Date(utcMs));
    return STARS.map(([ru, h, m, s, dd, dm, ds, nature]) => {
      const ra = (h + m / 60 + s / 3600) * 15 * D2R;
      const sgn = dd < 0 || dm < 0 ? -1 : 1;
      const dec = sgn * (Math.abs(dd) + Math.abs(dm) / 60 + ds / 3600) * D2R;
      const v = new Ax.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), time);
      const e = Ax.Ecliptic(v);
      return { ru, nature, lon: e.elon, lat: e.elat };
    });
  }
  function starContacts(utcMs, points, orb) {
    const stars = starLongitudes(utcMs);
    const out = [];
    for (const st of stars) for (const p of points) {
      const d = Math.abs(n180(p.lon - st.lon));
      if (d <= orb) out.push({ star: st, point: p, orb: d });
    }
    return { stars, contacts: out.sort((a, b) => a.orb - b.orb) };
  }

  // Hermetic lots (Paulus Alexandrinus); by night the two subtracted/added terms swap
  function lots(nat) {
    const P = (id) => (nat.points.find((p) => p.id === id) || {}).lon;
    const asc = nat.asc, day = nat.isDay;
    const lot = (x, y) => n360(day ? asc + x - y : asc + y - x);
    const fortune = lot(P('Moon'), P('Sun')), spirit = lot(P('Sun'), P('Moon'));
    // [name, X, Y, X label, Y label, meaning]: by day ASC + X − Y, by night ASC + Y − X
    const list = [
      ['Фортуны', P('Moon'), P('Sun'), 'Луна', 'Солнце', 'тело, здоровье, благосостояние'],
      ['Духа', P('Sun'), P('Moon'), 'Солнце', 'Луна', 'разум, намерения, профессия'],
      ['Эроса', P('Venus'), spirit, 'Венера', 'жребий Духа', 'желания и любовь'],
      ['Необходимости', fortune, P('Mercury'), 'жребий Фортуны', 'Меркурий', 'ограничения и обязательства'],
      ['Мужества', fortune, P('Mars'), 'жребий Фортуны', 'Марс', 'смелость, решительность, конфликты'],
      ['Победы', P('Jupiter'), spirit, 'Юпитер', 'жребий Духа', 'успех, вера, поддержка'],
      ['Немезиды', fortune, P('Saturn'), 'жребий Фортуны', 'Сатурн', 'испытания, скрытые трудности'],
    ];
    return list.map(([ru, x, y, xl, yl, meaning]) => {
      const lon = lot(x, y);
      return { ru, lon, meaning, formula: day ? `ASC + ${xl} − ${yl}` : `ASC + ${yl} − ${xl}`, house: N.houseOf(lon, nat.cusps) };
    });
  }

  /* Essential dignities with Lilly's points: domicile 5, exaltation 4, triplicity 3, term 2, face 1;
     detriment −5, fall −4, peregrine −5. Egyptian terms, Dorothean triplicities, Chaldean faces. */
  const CLASSIC = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const DOMICILE = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
  const EXALT_SIGN = { Sun: 0, Moon: 1, Mercury: 5, Venus: 11, Mars: 9, Jupiter: 3, Saturn: 6 };
  const TRIPLICITY = [['Sun', 'Jupiter'], ['Venus', 'Moon'], ['Saturn', 'Mercury'], ['Venus', 'Mars']];   // [day, night] by element
  const TERMS = [
    [['Jupiter', 6], ['Venus', 12], ['Mercury', 20], ['Mars', 25], ['Saturn', 30]],
    [['Venus', 8], ['Mercury', 14], ['Jupiter', 22], ['Saturn', 27], ['Mars', 30]],
    [['Mercury', 6], ['Jupiter', 12], ['Venus', 17], ['Mars', 24], ['Saturn', 30]],
    [['Mars', 7], ['Venus', 13], ['Mercury', 19], ['Jupiter', 26], ['Saturn', 30]],
    [['Jupiter', 6], ['Venus', 11], ['Saturn', 18], ['Mercury', 24], ['Mars', 30]],
    [['Mercury', 7], ['Venus', 17], ['Jupiter', 21], ['Mars', 28], ['Saturn', 30]],
    [['Saturn', 6], ['Mercury', 14], ['Jupiter', 21], ['Venus', 28], ['Mars', 30]],
    [['Mars', 7], ['Venus', 11], ['Mercury', 19], ['Jupiter', 24], ['Saturn', 30]],
    [['Jupiter', 12], ['Venus', 17], ['Mercury', 21], ['Saturn', 26], ['Mars', 30]],
    [['Mercury', 7], ['Jupiter', 14], ['Venus', 22], ['Saturn', 26], ['Mars', 30]],
    [['Mercury', 7], ['Venus', 13], ['Jupiter', 20], ['Mars', 25], ['Saturn', 30]],
    [['Venus', 12], ['Jupiter', 16], ['Mercury', 19], ['Mars', 28], ['Saturn', 30]],
  ];
  const FACE_ORDER = ['Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter'];
  const termRuler = (lon) => { const s = Math.floor(n360(lon) / 30), d = n360(lon) - s * 30; return TERMS[s].find(([, end]) => d < end)[0]; };
  const faceRuler = (lon) => FACE_ORDER[Math.floor(n360(lon) / 10) % 7];
  const tripRuler = (sign, day) => TRIPLICITY[sign % 4][day ? 0 : 1];
  // what each classical planet "owns" at a zodiac degree
  function degreeRulers(lon, day) {
    const s = Math.floor(n360(lon) / 30);
    const scores = {};
    const add = (id, v, k) => { (scores[id] = scores[id] || { total: 0, kinds: [] }).total += v; scores[id].kinds.push(k); };
    add(DOMICILE[s], 5, 'обитель');
    for (const [id, sg] of Object.entries(EXALT_SIGN)) if (sg === s) add(id, 4, 'экзальтация');
    add(tripRuler(s, day), 3, 'триплицитет');
    add(termRuler(lon), 2, 'термы');
    add(faceRuler(lon), 1, 'фас');
    return scores;
  }
  function dignityTable(nat) {
    const day = nat.isDay;
    const rows = [];
    for (const id of CLASSIC) {
      const p = nat.points.find((q) => q.id === id);
      if (!p) continue;
      const s = Math.floor(n360(p.lon) / 30);
      const items = [];
      if (DOMICILE[s] === id) items.push(['обитель', 5]);
      if (EXALT_SIGN[id] === s) items.push(['экзальтация', 4]);
      if (tripRuler(s, day) === id) items.push(['триплицитет', 3]);
      if (termRuler(p.lon) === id) items.push(['термы', 2]);
      if (faceRuler(p.lon) === id) items.push(['фас', 1]);
      const positive = items.length > 0;
      if (DOMICILE[(s + 6) % 12] === id) items.push(['изгнание', -5]);
      if (EXALT_SIGN[id] != null && (EXALT_SIGN[id] + 6) % 12 === s) items.push(['падение', -4]);
      if (!positive) items.push(['перегрин', -5]);
      rows.push({ id, p, items, total: items.reduce((a, [, v]) => a + v, 0) });
    }
    // almuten figuris: who has the most dignity over the Sun, Moon, ASC, MC and the Lot of Fortune
    const keyPts = [['Солнце', nat.points.find((q) => q.id === 'Sun').lon], ['Луна', nat.points.find((q) => q.id === 'Moon').lon], ['ASC', nat.asc], ['MC', nat.mc]];
    const f = nat.points.find((q) => q.id === 'Fortune');
    if (f) keyPts.push(['Парс Фортуны', f.lon]);
    const sum = {};
    const perPoint = keyPts.map(([ru, lon]) => {
      const sc = degreeRulers(lon, day);
      for (const [id, v] of Object.entries(sc)) sum[id] = (sum[id] || 0) + v.total;
      const best = Object.entries(sc).sort((a, b) => b[1].total - a[1].total)[0];
      return { ru, lon, almuten: best[0], points: best[1].total };
    });
    const almuten = Object.entries(sum).sort((a, b) => b[1] - a[1]);
    return { rows, perPoint, almuten };
  }

  // chains of rulership: each planet → the ruler of its sign → … until a planet in its own sign or a loop
  function dispositors(nat, modern) {
    const RUL = modern ? N.RULERS.map((r) => r[0]) : DOMICILE;
    const ids = modern ? ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] : CLASSIC;
    const signOf = {};
    for (const id of ids) { const p = nat.points.find((q) => q.id === id); if (p) signOf[id] = Math.floor(n360(p.lon) / 30); }
    const chains = ids.map((id) => {
      const path = [id];
      for (;;) {
        const nx = RUL[signOf[path[path.length - 1]]];
        if (nx === path[path.length - 1]) return { path, end: 'own' };
        if (path.includes(nx)) { path.push(nx); return { path, end: 'loop' }; }
        path.push(nx);
      }
    });
    const finals = new Set(chains.filter((c) => c.end === 'own').map((c) => c.path[c.path.length - 1]));
    const final = finals.size === 1 && chains.every((c) => c.end === 'own') ? [...finals][0] : null;
    return { chains, final, own: ids.filter((id) => RUL[signOf[id]] === id) };
  }

  // daily positions at 0h UT for a calendar month
  function ephemeris(year, month, nodeMode) {
    const rows = [];
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) {
      const ch = ACG.computeChart(Date.UTC(year, month - 1, d), { node: nodeMode });
      rows.push({ d, bodies: ch.bodies });
    }
    return rows;
  }

  root.FEAT = {
    GOALS, INFLUENCE_KM, scoreCities, angleDist,
    solarReturnUtc, scoreSolarPlace, rankSolarCities,
    crossAspects, composite, midpoint,
    CHALDEAN, planetaryHours, voidOfCourse, lunarDays, STARS, starLongitudes, starContacts, lots,
    dignityTable, degreeRulers, dispositors, ephemeris, termRuler, faceRuler,
  };
})(typeof window !== 'undefined' ? window : globalThis);
