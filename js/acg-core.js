/* Astrocartography core: ephemeris → angular lines, time zones, distances.
   Depends on global Astronomy (astronomy-engine 2.1.19). */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const LAT_LIMIT = 85;      // lines are drawn between ±85° (projection bounds)
  const EARTH_KM = 6371.0;

  const BODIES = [
    { id: 'Sun',     ru: 'Солнце',   glyph: '☉', color: '#F6C445', kw: 'признание, жизненная сила, самовыражение' },
    { id: 'Moon',    ru: 'Луна',     glyph: '☽', color: '#DCE3EE', kw: 'дом, эмоции, семья, комфорт' },
    { id: 'Mercury', ru: 'Меркурий', glyph: '☿', color: '#9BE07A', kw: 'общение, учёба, торговля, поездки' },
    { id: 'Venus',   ru: 'Венера',   glyph: '♀', color: '#FF8FC8', kw: 'любовь, красота, удовольствие, деньги' },
    { id: 'Mars',    ru: 'Марс',     glyph: '♂', color: '#FF5A4E', kw: 'энергия, спорт, амбиции, конфликты' },
    { id: 'Jupiter', ru: 'Юпитер',   glyph: '♃', color: '#FFA94D', kw: 'удача, рост, щедрость, обучение' },
    { id: 'Saturn',  ru: 'Сатурн',   glyph: '♄', color: '#C9B07A', kw: 'дисциплина, ответственность, испытания' },
    { id: 'Uranus',  ru: 'Уран',     glyph: '♅', color: '#4FE3E0', kw: 'перемены, свобода, неожиданности' },
    { id: 'Neptune', ru: 'Нептун',   glyph: '♆', color: '#6A9BFF', kw: 'вдохновение, духовность, иллюзии' },
    { id: 'Pluto',   ru: 'Плутон',   glyph: '♇', color: '#C07BFF', kw: 'трансформация, власть, глубина' },
    { id: 'Node',    ru: 'Сев. узел', glyph: '☊', color: '#A7B4C8', kw: 'путь развития, судьбоносные встречи', optional: true },
  ];

  const ANGLES = {
    MC:  { ru: 'MC',  name: 'Середина неба',   kw: 'карьера, репутация, статус' },
    IC:  { ru: 'IC',  name: 'Глубина неба',    kw: 'дом, корни, частная жизнь' },
    ASC: { ru: 'ASC', name: 'Асцендент',       kw: 'личность, внешность, самочувствие' },
    DSC: { ru: 'DSC', name: 'Десцендент',      kw: 'партнёрство, отношения, союзы' },
  };

  const SIGNS = [
    ['♈', 'Овен'], ['♉', 'Телец'], ['♊', 'Близнецы'], ['♋', 'Рак'], ['♌', 'Лев'], ['♍', 'Дева'],
    ['♎', 'Весы'], ['♏', 'Скорпион'], ['♐', 'Стрелец'], ['♑', 'Козерог'], ['♒', 'Водолей'], ['♓', 'Рыбы'],
  ];

  const norm360 = (x) => ((x % 360) + 360) % 360;
  const norm180 = (x) => { const y = norm360(x); return y > 180 ? y - 360 : y; };

  /* ---------- time zones (IANA history from the browser's tzdb) ---------- */
  const fmtCache = {};
  function tzFormatter(tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', era: 'short',
      });
    }
    return fmtCache[tz];
  }
  /** Offset of zone tz from UTC at instant utcMs, in minutes (east positive). */
  function tzOffsetMin(tz, utcMs) {
    const parts = tzFormatter(tz).formatToParts(new Date(utcMs));
    const g = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : '0'; };
    let year = +g('year');
    if (/^B/.test(g('era'))) year = 1 - year;
    let hour = +g('hour'); if (hour === 24) hour = 0;
    const asUtc = Date.UTC(year, +g('month') - 1, +g('day'), hour, +g('minute'), +g('second'));
    const base = Math.floor(utcMs / 1000) * 1000;
    return Math.round((asUtc - base) / 60000 * 4) / 4;
  }
  /** Local wall-clock time in zone tz → UTC ms. offsetOverrideMin bypasses tzdb. */
  function localToUtc(y, mo, d, hh, mi, tz, offsetOverrideMin) {
    const local = Date.UTC(y, mo - 1, d, hh, mi);
    if (offsetOverrideMin != null) return { utc: local - offsetOverrideMin * 60000, offset: offsetOverrideMin, source: 'manual' };
    let off = tzOffsetMin(tz, local);
    let utc = local - off * 60000;
    const off2 = tzOffsetMin(tz, utc);
    if (off2 !== off) { utc = local - off2 * 60000; off = off2; }
    return { utc, offset: off, source: 'tz' };
  }

  /* ---------------------------- ephemeris ---------------------------- */
  function meanNodeLon(time) {
    const T = time.tt / 36525;
    return norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
  }

  function bodyPosition(id, time, rot) {
    const A = root.Astronomy;
    if (id === 'Node') {
      const lam = meanNodeLon(time) * D2R;
      const eps = A.e_tilt(time).tobl * D2R;
      const ra = norm360(Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * R2D);
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D;
      return { ra, dec, elon: lam * R2D, elat: 0 };
    }
    const vec = A.GeoVector(A.Body[id], time, true);
    const eq = A.EquatorFromVector(A.RotateVector(rot, vec));
    const ecl = A.Ecliptic(vec);
    return { ra: eq.ra * 15, dec: eq.dec, elon: ecl.elon, elat: ecl.elat };
  }

  function eclLonAt(id, time) {
    if (id === 'Node') return meanNodeLon(time);
    const A = root.Astronomy;
    return A.Ecliptic(A.GeoVector(A.Body[id], time, true)).elon;
  }

  /* ------------------------------ lines ------------------------------ */
  /* MC: λ = α − GAST.  ASC/DSC: λ = α − GAST ∓ H₀, cos H₀ = −tan φ · tan δ
     (geometric horizon, geocentric, no refraction). Longitudes are left
     unwrapped so curves stay continuous; the renderer repeats the world. */
  function computeLines(ra, dec, gast) {
    const mc = norm180(ra - gast);
    const ic = norm180(mc + 180);
    const tanD = Math.tan(dec * D2R);
    const pts = [];
    for (let phi = -LAT_LIMIT; phi <= LAT_LIMIT + 1e-9; phi += 0.25) {
      const c = -Math.tan(phi * D2R) * tanD;
      if (c >= -1 && c <= 1) pts.push([phi, Math.acos(c) * R2D]);
    }
    if (Math.abs(tanD) > 1e-12) {
      for (let h = 0; h <= 180 + 1e-9; h += 0.5) {
        const phi = Math.atan(-Math.cos(h * D2R) / tanD) * R2D;
        if (Math.abs(phi) <= LAT_LIMIT) pts.push([phi, h]);
      }
    }
    pts.sort((a, b) => a[0] - b[0]);
    const clean = [];
    for (const p of pts) {
      const q = clean[clean.length - 1];
      if (!q || Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6) clean.push(p);
    }
    const asc = new Float64Array(clean.length * 2), dsc = new Float64Array(clean.length * 2);
    clean.forEach(([phi, h], i) => {
      asc[2 * i] = mc - h; asc[2 * i + 1] = phi;
      dsc[2 * i] = mc + h; dsc[2 * i + 1] = phi;
    });
    return { mc, ic, asc, dsc };
  }

  function computeChart(utcMs) {
    const A = root.Astronomy;
    const time = A.MakeTime(new Date(utcMs));
    const gast = A.SiderealTime(time) * 15;
    const rot = A.Rotation_EQJ_EQD(time);
    const out = { utcMs, gast, eps: A.e_tilt(time).tobl, bodies: [] };
    for (const b of BODIES) {
      const pos = bodyPosition(b.id, time, rot);
      const t1 = time.AddDays(-0.5), t2 = time.AddDays(0.5);
      let speed = norm180(eclLonAt(b.id, t2) - eclLonAt(b.id, t1)); // deg/day
      out.bodies.push(Object.assign({}, b, pos, { speed, retro: b.id !== 'Node' && speed < 0 }, computeLines(pos.ra, pos.dec, gast)));
    }
    return out;
  }

  /* ------------------------- aspect lines ---------------------------- */
  const ASPECTS = [
    { a: 60,  glyph: '⚹', ru: 'Секстиль', gen: 'секстиля', tone: 'мягкая поддержка: возможности приходят, если ими пользоваться' },
    { a: 90,  glyph: '□', ru: 'Квадрат',  gen: 'квадрата', tone: 'напряжение и вызов, которые подталкивают к действию' },
    { a: 120, glyph: '△', ru: 'Трин',     gen: 'трина',    tone: 'лёгкость и удача: тема планеты раскрывается без усилий' },
  ];
  function eclToEq(lam, beta, eps) {
    const l = lam * D2R, b = beta * D2R, e = eps * D2R;
    const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) * R2D;
    const ra = norm360(Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) * R2D);
    return { ra, dec };
  }
  /* A planet at ecliptic longitude λ aspects the MC where the culminating degree
     is λ ± A, and the Ascendant where the rising degree is λ ± A. Those are the
     MC and ASC lines of the ecliptic points λ ± A (zodiacal, latitude 0). */
  function computeAspectLines(chart, aspectOn, bodyOn) {
    const out = [];
    for (const b of chart.bodies) {
      if (b.id === 'Node' || (bodyOn && !bodyOn(b.id))) continue;
      for (const asp of ASPECTS) {
        if (!aspectOn[asp.a]) continue;
        for (const sgn of [1, -1]) {
          const point = norm360(b.elon + sgn * asp.a);
          const q = eclToEq(point, 0, chart.eps);
          const ln = computeLines(q.ra, q.dec, chart.gast);
          out.push({ body: b, aspect: asp, sgn, point, mc: ln.mc, asc: ln.asc });
        }
      }
    }
    return out;
  }

  /* ------------------------------ parans ------------------------------ */
  /* Latitudes where, during the day of birth, one planet is on an angle at the same
     moment another planet is on an angle. Rising/setting depend on latitude, so a
     root of LST_a(φ) − LST_b(φ) is found by scanning φ and bisecting. */
  function eventLst(b, ev, phi) {
    if (ev === 'MC') return b.ra;
    if (ev === 'IC') return b.ra + 180;
    const c = -Math.tan(phi * D2R) * Math.tan(b.dec * D2R);
    if (c < -1 || c > 1) return null;
    const h = Math.acos(c) * R2D;
    return ev === 'ASC' ? b.ra - h : b.ra + h;
  }
  function computeParans(chart, bodyOn, evOn) {
    const EV = ['MC', 'IC', 'ASC', 'DSC'];
    const bodies = chart.bodies.filter((b) => !bodyOn || bodyOn(b.id));
    const out = [];
    const f = (A, ea, B, eb, phi) => {
      const la = eventLst(A, ea, phi), lb = eventLst(B, eb, phi);
      return la == null || lb == null ? null : norm180(la - lb);
    };
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      for (const ea of EV) for (const eb of EV) {
        if ((ea === 'MC' || ea === 'IC') && (eb === 'MC' || eb === 'IC')) continue;
        if (evOn && (!evOn[ea] || !evOn[eb])) continue;
        let p0 = null, f0 = null;
        for (let phi = -LAT_LIMIT; phi <= LAT_LIMIT + 1e-9; phi += 0.25) {
          const v = f(A, ea, B, eb, phi);
          if (v == null) { f0 = null; continue; }
          if (f0 != null && ((f0 < 0 && v >= 0) || (f0 > 0 && v <= 0)) && Math.abs(v - f0) < 90) {
            let lo = p0, hi = phi, flo = f0;
            for (let k = 0; k < 40; k++) {
              const mid = (lo + hi) / 2, fm = f(A, ea, B, eb, mid);
              if (fm == null) break;
              if ((flo < 0 && fm >= 0) || (flo > 0 && fm <= 0)) hi = mid; else { lo = mid; flo = fm; }
            }
            out.push({ A, ea, B, eb, lat: (lo + hi) / 2 });
          }
          p0 = phi; f0 = v;
        }
      }
    }
    return out.sort((x, y) => y.lat - x.lat);
  }

  /* ----------------------------- dynamics ----------------------------- */
  /* Transits and secondary progressions drawn on the natal frame (as in
     Cyclo*Carto*Graphy): tropical positions of the target moment are placed
     on the natal sidereal time and obliquity. Progressions: one day after
     birth for each year of life. */
  function computeDynamic(natal, mode, targetUtcMs) {
    const A = root.Astronomy;
    const t = mode === 'prog' ? natal.utcMs + (targetUtcMs - natal.utcMs) / 365.2422 : targetUtcMs;
    const time = A.MakeTime(new Date(t));
    const out = { mode, utcMs: t, targetUtcMs, bodies: [] };
    for (const b of BODIES) {
      let lam, beta = 0;
      if (b.id === 'Node') lam = meanNodeLon(time);
      else { const e = A.Ecliptic(A.GeoVector(A.Body[b.id], time, true)); lam = e.elon; beta = e.elat; }
      const q = eclToEq(lam, beta, natal.eps);
      const t1 = time.AddDays(-0.5), t2 = time.AddDays(0.5);
      const speed = norm180(eclLonAt(b.id, t2) - eclLonAt(b.id, t1));
      out.bodies.push(Object.assign({}, b, { elon: lam, ra: q.ra, dec: q.dec, retro: b.id !== 'Node' && speed < 0 }, computeLines(q.ra, q.dec, natal.gast)));
    }
    return out;
  }

  /* ---------------------------- distances ---------------------------- */
  function hav(lat1, lon1, lat2, lon2) {
    const a = Math.sin((lat2 - lat1) * D2R / 2) ** 2 +
      Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin((lon2 - lon1) * D2R / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * EARTH_KM;
  }
  function distToMeridianKm(lat, lon, mlon) {
    const dl = norm180(lon - mlon) * D2R;
    if (Math.cos(dl) >= 0) return Math.asin(Math.min(1, Math.cos(lat * D2R) * Math.abs(Math.sin(dl)))) * EARTH_KM;
    return (90 - Math.abs(lat)) * D2R * EARTH_KM;
  }
  function distToCurveKm(lat, lon, arr) {
    let best = Infinity;
    for (let i = 0; i < arr.length; i += 2) {
      const d = hav(lat, lon, arr[i + 1], arr[i]);
      if (d < best) best = d;
    }
    return best;
  }
  /** All lines within maxKm of a point, nearest first. */
  function linesNear(chart, lat, lon, maxKm, enabled) {
    const res = [];
    for (const b of chart.bodies) {
      if (enabled && !enabled(b.id)) continue;
      const cand = [
        ['MC', distToMeridianKm(lat, lon, b.mc)],
        ['IC', distToMeridianKm(lat, lon, b.ic)],
        ['ASC', b.asc.length ? distToCurveKm(lat, lon, b.asc) : Infinity],
        ['DSC', b.dsc.length ? distToCurveKm(lat, lon, b.dsc) : Infinity],
      ];
      for (const [angle, km] of cand) if (km <= maxKm) res.push({ body: b, angle, km });
    }
    return res.sort((a, b) => a.km - b.km);
  }

  /* ---------------------------- formatting --------------------------- */
  function formatZodiac(elon) {
    const L = norm360(elon);
    let sign = Math.floor(L / 30);
    let deg = Math.floor(L - sign * 30);
    let min = Math.round(((L - sign * 30) - deg) * 60);
    if (min === 60) { min = 0; deg += 1; }
    if (deg === 30) { deg = 0; sign = (sign + 1) % 12; }
    return { deg, min, glyph: SIGNS[sign][0], name: SIGNS[sign][1] };
  }

  root.ACG = {
    BODIES, ANGLES, SIGNS, ASPECTS, LAT_LIMIT, norm180, norm360, eclToEq,
    tzOffsetMin, localToUtc, computeChart, computeLines, linesNear, hav, formatZodiac,
    computeAspectLines, computeParans, computeDynamic, distToMeridianKm, distToCurveKm,
  };
})(typeof window !== 'undefined' ? window : globalThis);
