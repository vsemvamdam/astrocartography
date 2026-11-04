/* Natal chart: angles, house systems, extra points, aspects, dignities.
   Depends on ACG (acg-core.js) and the global Astronomy. */
(function (root) {
  'use strict';
  const ACG = root.ACG;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const sin = (d) => Math.sin(d * D2R), cos = (d) => Math.cos(d * D2R), tan = (d) => Math.tan(d * D2R);
  const asin = (x) => Math.asin(Math.max(-1, Math.min(1, x))) * R2D;
  const atan2 = (y, x) => Math.atan2(y, x) * R2D;

  /* -------------------------------- angles -------------------------------- */
  // Ascendant for a given sidereal angle (RAMC) and pole height.
  const ascFor = (ramc, pole, eps) => n360(atan2(cos(ramc), -(sin(ramc) * cos(eps) + tan(pole) * sin(eps))));
  const mcFor = (ramc, eps) => n360(atan2(sin(ramc), cos(ramc) * cos(eps)));
  const lonFromRa = (ra, eps) => n360(atan2(sin(ra), cos(ra) * cos(eps)));     // ecliptic point (β = 0) with this RA
  const decOf = (lam, eps) => asin(sin(eps) * sin(lam));
  // ascensional difference; null where the point is circumpolar
  const ascDiff = (dec, phi) => { const x = tan(phi) * tan(dec); return Math.abs(x) > 1 ? null : asin(x); };

  /* -------------------------------- houses -------------------------------- */
  const HOUSE_SYSTEMS = [
    { id: 'P', ru: 'Плацидус' },
    { id: 'K', ru: 'Кох' },
    { id: 'R', ru: 'Региомонтан' },
    { id: 'C', ru: 'Кампанус' },
    { id: 'O', ru: 'Порфирий' },
    { id: 'E', ru: 'Равнодомная от ASC' },
    { id: 'W', ru: 'Знак = дом' },
  ];

  function placidusCusp(ramc, eps, phi, house) {
    // fraction of the semi-arc measured from the meridian
    const spec = { 11: [1 / 3, 'd'], 12: [2 / 3, 'd'], 2: [2 / 3, 'n'], 3: [1 / 3, 'n'] }[house];
    let lam = n360(mcFor(ramc, eps) + (house === 11 ? 30 : house === 12 ? 60 : house === 2 ? 120 : 150));
    for (let i = 0; i < 60; i++) {
      const ad = ascDiff(decOf(lam, eps), phi);
      if (ad == null) return null;
      const dsa = 90 + ad, nsa = 180 - dsa;
      // eastern half: hour angle H = −f·DSA above the horizon, H = −(180 − f·NSA) below it
      const ra = spec[1] === 'd' ? ramc + spec[0] * dsa : ramc + 180 - spec[0] * nsa;
      const next = lonFromRa(ra, eps);
      if (Math.abs(n180(next - lam)) < 1e-9) { lam = next; break; }
      lam = next;
    }
    return lam;
  }

  function computeHouses(sys, ramc, eps, phi) {
    const asc = ascFor(ramc, phi, eps), mc = mcFor(ramc, eps);
    const c = new Array(13);
    c[1] = asc; c[10] = mc;
    let used = sys, note = '';
    const quad = (c11, c12, c2, c3) => { c[11] = c11; c[12] = c12; c[2] = c2; c[3] = c3; };
    const polar = Math.abs(phi) >= 90 - eps;
    if ((sys === 'P' || sys === 'K') && polar) { used = 'O'; note = 'За полярным кругом Плацидус и Кох не определены — дома посчитаны по Порфирию.'; }
    if (used === 'P') {
      const v = [11, 12, 2, 3].map((h) => placidusCusp(ramc, eps, phi, h));
      if (v.some((x) => x == null)) { used = 'O'; note = 'Для этой широты Плацидус не определён — дома посчитаны по Порфирию.'; }
      else quad(...v);
    }
    if (used === 'K') {
      const ad = ascDiff(decOf(mc, eps), phi);
      if (ad == null) { used = 'O'; note = 'Для этой широты Кох не определён — дома посчитаны по Порфирию.'; }
      else {
        const a3 = ad / 3;
        quad(ascFor(ramc - 60 - 2 * a3, phi, eps), ascFor(ramc - 30 - a3, phi, eps),
             ascFor(ramc + 30 + a3, phi, eps), ascFor(ramc + 60 + 2 * a3, phi, eps));
      }
    }
    if (used === 'R') {
      const p1 = atan2(tan(phi) * 0.5, 1), p2 = atan2(tan(phi) * cos(30), 1);
      quad(ascFor(ramc - 60, p1, eps), ascFor(ramc - 30, p2, eps), ascFor(ramc + 30, p2, eps), ascFor(ramc + 60, p1, eps));
    }
    if (used === 'C') {
      const p1 = asin(sin(phi) / 2), p2 = asin(Math.sqrt(3) / 2 * sin(phi));
      const x1 = atan2(Math.sqrt(3), cos(phi)), x2 = atan2(1 / Math.sqrt(3), cos(phi));
      quad(ascFor(ramc - x1, p1, eps), ascFor(ramc - x2, p2, eps), ascFor(ramc + x2, p2, eps), ascFor(ramc + x1, p1, eps));
    }
    if (used === 'O') {
      const q1 = n360(asc - mc) / 3, q2 = n360(mc + 180 - asc) / 3;
      quad(n360(mc + q1), n360(mc + 2 * q1), n360(asc + q2), n360(asc + 2 * q2));
    }
    if (used === 'E' || used === 'W') {
      const start = used === 'E' ? asc : Math.floor(asc / 30) * 30;
      for (let h = 1; h <= 12; h++) c[h] = n360(start + (h - 1) * 30);
    } else {
      c[4] = n360(c[10] + 180); c[5] = n360(c[11] + 180); c[6] = n360(c[12] + 180);
      c[7] = n360(c[1] + 180); c[8] = n360(c[2] + 180); c[9] = n360(c[3] + 180);
    }
    return { cusps: c, asc, mc, used, note };
  }

  const houseOf = (lam, cusps) => {
    for (let h = 1; h <= 12; h++) {
      const a = cusps[h], b = cusps[h === 12 ? 1 : h + 1];
      const span = n360(b - a), d = n360(lam - a);
      if (d < span || (span === 0 && d === 0)) return h;
    }
    return 1;
  };

  /* ---------------------------- extra points ------------------------------ */
  // Mean Black Moon Lilith: mean lunar apogee (Meeus ch. 47 mean perigee + 180°), which lies in the
  // plane of the lunar orbit, projected onto the ecliptic through the mean node — as Sotis and Swiss Ephemeris do.
  const MOON_INC = 5.1453964;
  function lilithLon(time) {
    const T = time.tt / 36525;
    const apogee = n360(83.3532465 + 4069.0137287 * T - 0.0103200 * T * T - T * T * T / 80053 + T * T * T * T / 18999000 + 180);
    const node = ACG.meanNodeLon(time);
    const u = apogee - node;
    return n360(node + atan2(sin(u) * cos(MOON_INC), cos(u)));
  }

  /* ------------------------------- dignities ------------------------------ */
  // sign index 0 = Aries … 11 = Pisces
  const RULERS = [['Mars'], ['Venus'], ['Mercury'], ['Moon'], ['Sun'], ['Mercury'], ['Venus'], ['Pluto', 'Mars'], ['Jupiter'], ['Saturn'], ['Uranus', 'Saturn'], ['Neptune', 'Jupiter']];
  const EXALT = { Sun: 0, Moon: 1, Mercury: 5, Venus: 11, Mars: 9, Jupiter: 3, Saturn: 6 };
  function dignity(id, sign) {
    const out = [];
    const rules = (s) => RULERS[s].includes(id);
    if (rules(sign)) out.push({ k: 'dom', ru: 'обитель' });
    if (EXALT[id] === sign) out.push({ k: 'exalt', ru: 'экзальтация' });
    if (rules((sign + 6) % 12)) out.push({ k: 'det', ru: 'изгнание' });
    if (EXALT[id] != null && (EXALT[id] + 6) % 12 === sign) out.push({ k: 'fall', ru: 'падение' });
    return out;
  }

  /* -------------------------------- aspects ------------------------------- */
  const ASPECTS = [
    { a: 0,   id: 'conj',  ru: 'Соединение',   glyph: '☌', kind: 'neutral', orb: 8,   major: true },
    { a: 180, id: 'opp',   ru: 'Оппозиция',    glyph: '☍', kind: 'hard',    orb: 8,   major: true },
    { a: 120, id: 'trine', ru: 'Трин',         glyph: '△', kind: 'soft',    orb: 7,   major: true },
    { a: 90,  id: 'sq',    ru: 'Квадрат',      glyph: '□', kind: 'hard',    orb: 7,   major: true },
    { a: 60,  id: 'sext',  ru: 'Секстиль',     glyph: '⚹', kind: 'soft',    orb: 5,   major: true },
    { a: 150, id: 'qx',    ru: 'Квинконс',     glyph: '⚻', kind: 'minor',   orb: 3,   major: false },
    { a: 30,  id: 'ssx',   ru: 'Полусекстиль', glyph: '⚺', kind: 'minor',   orb: 2,   major: false },
    { a: 45,  id: 'ssq',   ru: 'Полуквадрат',  glyph: '∠', kind: 'minor',   orb: 2,   major: false },
    { a: 135, id: 'sesq',  ru: 'Сесквиквадрат', glyph: '⚼', kind: 'minor',  orb: 2,   major: false },
    { a: 72,  id: 'quin',  ru: 'Квинтиль',     glyph: 'Q', kind: 'minor',   orb: 1.5, major: false },
    { a: 144, id: 'bq',    ru: 'Биквинтиль',   glyph: 'bQ', kind: 'minor',  orb: 1.5, major: false },
  ];
  const LUMINARY_BONUS = 2;   // Sun and Moon get a wider orb on major aspects

  function computeAspects(points, withMinor) {
    const out = [];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const A = points[i], B = points[j];
      if (A.noAspects || B.noAspects) continue;
      if ((A.id === 'Node' && B.id === 'SNode') || (A.id === 'SNode' && B.id === 'Node')) continue;
      if ((A.id === 'ASC' && B.id === 'MC') || (A.id === 'MC' && B.id === 'ASC')) continue;
      const sep = Math.abs(n180(B.lon - A.lon));
      let best = null;
      for (const asp of ASPECTS) {
        if (!asp.major && !withMinor) continue;
        let orb = asp.orb;
        if (asp.major && (A.lum || B.lum)) orb += LUMINARY_BONUS;
        if (A.small || B.small) orb = Math.min(orb, asp.major ? 5 : 1.5);
        const d = Math.abs(sep - asp.a);
        if (d <= orb && (!best || d < best.d)) best = { asp, d, orb };
      }
      if (!best) continue;
      // applying if the separation is moving toward the exact angle
      let applying = null;
      if (A.speed != null && B.speed != null) {
        const sepNext = Math.abs(n180((B.lon + B.speed * 0.01) - (A.lon + A.speed * 0.01)));
        applying = Math.abs(sepNext - best.asp.a) < best.d;
      }
      out.push({ A, B, asp: best.asp, orb: best.d, maxOrb: best.orb, applying });
    }
    return out.sort((x, y) => x.orb - y.orb);
  }

  /* --------------------------------- chart -------------------------------- */
  function computeNatal(chart, lat, lon, opts) {
    const A = root.Astronomy;
    opts = opts || {};
    const time = A.MakeTime(new Date(chart.utcMs));
    const eps = chart.eps;
    const ramc = n360(chart.gast + lon);
    const H = computeHouses(opts.house || 'P', ramc, eps, lat);
    const pts = [];
    const add = (p) => { p.sign = Math.floor(n360(p.lon) / 30); p.house = houseOf(p.lon, H.cusps); pts.push(p); return p; };
    for (const b of chart.bodies) {
      const minor = b.id === 'Node' || b.id === 'Chiron';
      add({ id: b.id, ru: b.ru, glyph: b.glyph, color: b.color, lon: b.elon, lat: b.elat, speed: b.speed, retro: b.retro, lum: b.id === 'Sun' || b.id === 'Moon', planet: !minor, small: minor });
    }
    const node = pts.find((p) => p.id === 'Node');
    // the south node mirrors the north node's aspects, so it gets none of its own
    add({ id: 'SNode', ru: 'Юж. узел', glyph: '☋', color: '#A7B4C8', lon: n360(node.lon + 180), speed: node.speed, retro: node.retro, small: true, extra: true, noAspects: true });
    const lil = lilithLon(time);
    add({ id: 'Lilith', ru: 'Лилит', glyph: '⚸', color: '#B9A7D8', lon: lil, speed: 0.111404, small: true, extra: true });
    const ch = pts.findIndex((p) => p.id === 'Chiron');
    if (ch >= 0) pts.push(pts.splice(ch, 1)[0]);
    const sun = pts.find((p) => p.id === 'Sun'), moon = pts.find((p) => p.id === 'Moon');
    const sunAbove = n360(sun.lon - H.asc) > 180;             // houses 7–12 are above the horizon
    const fortune = n360(sunAbove ? H.asc + moon.lon - sun.lon : H.asc + sun.lon - moon.lon);
    add({ id: 'Fortune', ru: 'Парс Фортуны', glyph: '⊗', color: '#D9B56E', lon: fortune, small: true, extra: true, noAspects: !opts.fortuneAspects });
    const angles = [
      { id: 'ASC', ru: 'Асцендент', glyph: 'ASC', lon: H.asc, angle: true },
      { id: 'MC', ru: 'Середина неба', glyph: 'MC', lon: H.mc, angle: true },
    ];
    const aspPoints = pts.filter((p) => !p.noAspects && (opts.points ? opts.points(p.id) : true)).concat(opts.anglesAspects === false ? [] : angles);
    const aspects = computeAspects(aspPoints, !!opts.minor);
    for (const p of pts) p.dign = p.planet ? dignity(p.id, p.sign) : [];
    // balance of elements and crosses for the ten planets
    const el = [0, 0, 0, 0], cr = [0, 0, 0];
    for (const p of pts) if (p.planet) { el[p.sign % 4]++; cr[p.sign % 3]++; }
    return { ...H, ramc, eps, lat, lon, points: pts, angles, aspects, isDay: sunAbove, elements: el, crosses: cr, rulers: RULERS };
  }

  root.NATAL = { HOUSE_SYSTEMS, ASPECTS, RULERS, EXALT, computeNatal, computeHouses, computeAspects, houseOf, ascFor, mcFor, dignity, lilithLon };
})(typeof window !== 'undefined' ? window : globalThis);
