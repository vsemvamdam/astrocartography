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
    { id: 'Chiron',  ru: 'Хирон',    glyph: '⚷', color: '#8FD6B4', kw: 'исцеление, уязвимость, наставничество', optional: true },
    { id: 'Ceres',   ru: 'Церера',   glyph: '⚳', color: '#B6D97A', kw: 'забота, питание, материнство, утрата и возвращение', optional: true, asteroid: true },
    { id: 'Pallas',  ru: 'Паллада',  glyph: '⚴', color: '#7FB2E5', kw: 'мудрость, стратегия, творческий ум, справедливость', optional: true, asteroid: true },
    { id: 'Juno',    ru: 'Юнона',    glyph: '⚵', color: '#E58FB3', kw: 'брак, партнёрство на равных, верность, ревность', optional: true, asteroid: true },
    { id: 'Vesta',   ru: 'Веста',    glyph: '⚶', color: '#F2A65A', kw: 'служение, преданность делу, сосредоточенность, святость', optional: true, asteroid: true },
    { id: 'Eros',    ru: 'Эрос',     glyph: 'Эр', color: '#F07A8C', kw: 'страсть, влечение, искра, эротика', optional: true, asteroid: true, minorAst: true, short: true },
    { id: 'Psyche',  ru: 'Психея',   glyph: 'Пс', color: '#C9A3F0', kw: 'родство душ, психологическая близость, уязвимость', optional: true, asteroid: true, minorAst: true, short: true },
    { id: 'Amor',    ru: 'Амор',     glyph: 'Ам', color: '#F5B8C8', kw: 'безусловная, платоническая любовь, нежность без подтекста', optional: true, asteroid: true, minorAst: true, short: true },
    { id: 'Hygiea',  ru: 'Гигея',    glyph: 'Ги', color: '#8FD6C0', kw: 'здоровье, гигиена, очищение, целительство', optional: true, asteroid: true, minorAst: true, short: true },
    { id: 'Proserpina', ru: 'Прозерпина', glyph: 'Пр', color: '#B08FD0', kw: 'глубокая трансформация, регенерация, переход на новый уровень', optional: true, asteroid: true, minorAst: true, short: true },
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
  // js/tz-history.js, when loaded: the history before 1970 that browsers lack (zones merged by IANA, kept in
  // "backzone") and the years each zone was still on a mean time
  const TZH = () => root.TZ_HISTORY;
  function histOffsetSec(tz, sec) {
    const H = TZH(), z = H && sec < H.until && H.hist[tz];
    if (!z) return null;
    let lo = 0, hi = z.length / 2 - 1;                  // the last period starting at or before sec; period 0 has no start
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (z[2 * m] <= sec) lo = m; else hi = m - 1; }
    return z[2 * lo + 1];
  }
  function inMeanTime(tz, sec) {
    const H = TZH(), z = H && sec < H.until && H.mean[tz];
    if (!z) return false;
    for (let i = 0; i < z.length; i += 2) if ((z[i] == null || z[i] <= sec) && sec < z[i + 1]) return true;
    return false;
  }
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
    const h = histOffsetSec(tz, Math.floor(utcMs / 1000));
    if (h != null) return h / 60;
    const parts = tzFormatter(tz).formatToParts(new Date(utcMs));
    const g = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : '0'; };
    let year = +g('year');
    if (/^B/.test(g('era'))) year = 1 - year;
    let hour = +g('hour'); if (hour === 24) hour = 0;
    const asUtc = Date.UTC(year, +g('month') - 1, +g('day'), hour, +g('minute'), +g('second'));
    const base = Math.floor(utcMs / 1000) * 1000;
    return (asUtc - base) / 60000;                      // whole seconds: mean times have them (Moscow +2:30:17)
  }
  /** Local wall-clock time in zone tz → UTC ms. offsetOverrideMin bypasses tzdb. lon (degrees east), when given,
      replaces a mean time of the zone (the time of the city that names it) with the mean time of the place itself.
      A wall time that happened twice (clocks put back) gives the first instant, ambiguous: true; one that never
      happened (clocks put forward) is read with the offset before the change, gap: true — as Temporal does. */
  function localToUtc(y, mo, d, hh, mi, tz, offsetOverrideMin, lon) {
    const local = Date.UTC(y, mo - 1, d, hh, mi);
    if (offsetOverrideMin != null) return { utc: local - offsetOverrideMin * 60000, offset: offsetOverrideMin, source: 'manual' };
    if (lon != null && isFinite(lon)) {
      const lmt = Math.round(norm180(lon) * 240) / 60;    // 4 minutes a degree, to the second
      const utc = local - lmt * 60000;
      if (inMeanTime(tz, Math.floor(utc / 1000))) return { utc, offset: lmt, source: 'lmt' };
    }
    const before = tzOffsetMin(tz, local - 86400000), after = tzOffsetMin(tz, local + 86400000);
    const ok = [...new Set([before, after, tzOffsetMin(tz, local)])].filter((o) => tzOffsetMin(tz, local - o * 60000) === o).sort((a, b) => b - a);
    if (!ok.length) return { utc: local - before * 60000, offset: before, source: 'tz', gap: true };
    return { utc: local - ok[0] * 60000, offset: ok[0], source: 'tz', ambiguous: ok.length > 1 };
  }

  /* ---------------------------- ephemeris ---------------------------- */
  function meanNodeLon(time) {
    const T = time.tt / 36525;
    return norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
  }

  /* True node: osculating ascending node of the Moon's geocentric orbit on the ecliptic of date. */
  function trueNodeLon(time) {
    const A = root.Astronomy, dt = 1 / 1440;
    const ecl = (t) => { const v = A.RotateVector(A.Rotation_EQJ_ECT(t), A.GeoMoon(t)); return [v.x, v.y, v.z]; };
    const p = ecl(time), a = ecl(time.AddDays(dt)), b = ecl(time.AddDays(-dt));
    const v = [(a[0] - b[0]) / (2 * dt), (a[1] - b[1]) / (2 * dt), (a[2] - b[2]) / (2 * dt)];
    const h = [p[1] * v[2] - p[2] * v[1], p[2] * v[0] - p[0] * v[2], p[0] * v[1] - p[1] * v[0]];
    return norm360(Math.atan2(h[0], -h[1]) * R2D);
  }
  // the mean node is on the mean equinox of date; nutation in longitude puts it on the true equinox, as the planets are
  const nodeLon = (time, mode) => (mode === 'mean' ? norm360(meanNodeLon(time) + root.Astronomy.e_tilt(time).dpsi / 3600) : trueNodeLon(time));

  /* (2060) Chiron from a precomputed heliocentric table (tools/build_chiron.js), 1800–2100. */
  let CH = null;
  function chironTable() {
    if (CH !== null) return CH;
    const src = root.ACG_CHIRON;
    if (!src) return (CH = false);
    const bin = atob(src.data), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return (CH = { t0: src.t0, step: src.step, n: src.n, xyz: new Int32Array(u8.buffer) });
  }
  function chironHelio(tt) {
    const T = chironTable();
    if (!T) return null;
    const f = (tt - T.t0) / T.step, k = Math.floor(f) - 1;
    if (k < 0 || k + 3 >= T.n) return null;
    const u = f - (k + 1);                      // 4-point Lagrange on k … k+3, u ∈ [0,1) between k+1 and k+2
    const w = [-u * (u - 1) * (u - 2) / 6, (u + 1) * (u - 1) * (u - 2) / 2, -(u + 1) * u * (u - 2) / 2, (u + 1) * u * (u - 1) / 6];
    const r = [0, 0, 0];
    for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) r[c] += w[j] * T.xyz[(k + j) * 3 + c] * 1e-8;
    return r;
  }
  /* asteroids: the same kind of table (tools/build_tables.js), 1800–2100; a body may have its own grid
     ({t0, step, n, data}) — the near-Earth Eros and Amor need a finer one */
  const AST = {};
  function asteroidHelio(id, tt) {
    const src = root.ACG_ASTEROIDS;
    if (!src || !src.data[id]) return null;
    if (!AST[id]) {
      const d = src.data[id], meta = typeof d === 'string' ? { t0: src.t0, step: src.step, n: src.n, data: d } : d;
      const bin = atob(meta.data), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      AST[id] = { t0: meta.t0, step: meta.step, n: meta.n, xyz: new Int32Array(u8.buffer) };
    }
    const T = AST[id], f = (tt - T.t0) / T.step, k = Math.floor(f) - 1;
    if (k < 0 || k + 3 >= T.n) return null;
    const u = f - (k + 1);
    const w = [-u * (u - 1) * (u - 2) / 6, (u + 1) * (u - 1) * (u - 2) / 2, -(u + 1) * u * (u - 2) / 2, (u + 1) * u * (u - 1) / 6];
    const r = [0, 0, 0];
    for (let j = 0; j < 4; j++) for (let c = 0; c < 3; c++) r[c] += w[j] * T.xyz[(k + j) * 3 + c] * 1e-8;
    return r;
  }
  const TABLE_BODIES = { Chiron: (tt) => chironHelio(tt) };
  for (const id of ['Ceres', 'Pallas', 'Juno', 'Vesta', 'Eros', 'Psyche', 'Amor', 'Hygiea', 'Proserpina']) TABLE_BODIES[id] = (tt) => asteroidHelio(id, tt);
  // apparent geocentric vector of a table body: its place at t−τ seen from the Earth at t−τ (light time and annual aberration)
  function tableGeo(id, time) {
    const A = root.Astronomy, helio = TABLE_BODIES[id];
    let tau = 0, v = null;
    for (let i = 0; i < 3; i++) {
      const t = time.AddDays(-tau), c = helio(t.tt);
      if (!c) return null;
      const e = A.HelioVector(A.Body.Earth, t);
      v = new A.Vector(c[0] - e.x, c[1] - e.y, c[2] - e.z, time);
      tau = v.Length() * 0.0057755183;
    }
    return v;
  }
  const chironGeo = (time) => tableGeo('Chiron', time);

  function bodyPosition(id, time, rot, opts) {
    const A = root.Astronomy;
    if (id === 'Node') {
      const lam = nodeLon(time, opts && opts.node) * D2R;
      const eps = A.e_tilt(time).tobl * D2R;
      const ra = norm360(Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)) * R2D);
      const dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D;
      return { ra, dec, elon: lam * R2D, elat: 0 };
    }
    const vec = TABLE_BODIES[id] ? tableGeo(id, time) : A.GeoVector(A.Body[id], time, true);
    if (!vec) return null;
    const eq = A.EquatorFromVector(A.RotateVector(rot, vec));
    const ecl = A.Ecliptic(vec);
    return { ra: eq.ra * 15, dec: eq.dec, elon: ecl.elon, elat: ecl.elat };
  }

  function eclAt(id, time, opts) {
    const A = root.Astronomy;
    if (id === 'Node') return { elon: nodeLon(time, opts && opts.node), elat: 0 };
    const vec = TABLE_BODIES[id] ? tableGeo(id, time) : A.GeoVector(A.Body[id], time, true);
    return vec ? A.Ecliptic(vec) : null;
  }
  function speedAt(id, time, opts) {
    const a = eclAt(id, time.AddDays(-0.5), opts), b = eclAt(id, time.AddDays(0.5), opts);
    return a && b ? norm180(b.elon - a.elon) : 0;
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

  function computeChart(utcMs, opts) {
    const A = root.Astronomy;
    opts = opts || {};
    const time = A.MakeTime(new Date(utcMs));
    const gast = A.SiderealTime(time) * 15;
    const rot = A.Rotation_EQJ_EQD(time);
    const out = { utcMs, gast, eps: A.e_tilt(time).tobl, nodeMode: opts.node === 'mean' ? 'mean' : 'true', bodies: [] };
    for (const b of BODIES) {
      const pos = bodyPosition(b.id, time, rot, opts);
      if (!pos) continue;                                  // table bodies outside 1800–2100
      const speed = speedAt(b.id, time, opts);             // deg/day
      out.bodies.push(Object.assign({}, b, pos, { speed, retro: speed < 0 && !(b.id === 'Node' && out.nodeMode === 'mean') }, computeLines(pos.ra, pos.dec, gast)));
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
        const cross = (a, b) => (a < 0 && b >= 0) || (a > 0 && b <= 0);
        const root = (lo, hi, flo) => {
          for (let k = 0; k < 40; k++) {
            const mid = (lo + hi) / 2, fm = f(A, ea, B, eb, mid);
            if (fm == null) break;
            if (cross(flo, fm)) hi = mid; else { lo = mid; flo = fm; }
          }
          out.push({ A, ea, B, eb, lat: (lo + hi) / 2 });
        };
        // the latitude where a rising or setting starts or stops happening (the planet becomes circumpolar)
        const edge = (good, bad) => { for (let k = 0; k < 50; k++) { const m = (good + bad) / 2; if (f(A, ea, B, eb, m) == null) bad = m; else good = m; } return good; };
        let p0 = null, f0 = null, pp = null, vp = null;
        for (let phi = -LAT_LIMIT; phi <= LAT_LIMIT + 1e-9; phi += 0.25) {
          const v = f(A, ea, B, eb, phi);
          // a root can lie between the last sample with the event and that latitude: check the edge as a sample too
          if (pp != null && (vp == null) !== (v == null)) {
            const e = edge(v != null ? phi : pp, v != null ? pp : phi), fe = f(A, ea, B, eb, e);
            if (v == null && f0 != null && fe != null && cross(f0, fe) && Math.abs(fe - f0) < 90) root(p0, e, f0);
            if (v != null && fe != null && cross(fe, v) && Math.abs(v - fe) < 90) root(e, phi, fe);
          }
          if (v == null) f0 = null;
          else {
            if (f0 != null && cross(f0, v) && Math.abs(v - f0) < 90) root(p0, phi, f0);
            p0 = phi; f0 = v;
          }
          pp = phi; vp = v;
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
    const opts = { node: natal.nodeMode };
    for (const b of BODIES) {
      const e = eclAt(b.id, time, opts);
      if (!e) continue;
      const q = eclToEq(e.elon, e.elat, natal.eps);
      const speed = speedAt(b.id, time, opts);
      out.bodies.push(Object.assign({}, b, { elon: e.elon, ra: q.ra, dec: q.dec, retro: speed < 0 && !(b.id === 'Node' && natal.nodeMode === 'mean') }, computeLines(q.ra, q.dec, natal.gast)));
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
    // cut, not rounded: the way the natal tables, Sotis and astro.com show positions
    let min = Math.floor(((L - sign * 30) - deg) * 60 + 1e-9);
    if (min === 60) { min = 0; deg += 1; }
    if (deg === 30) { deg = 0; sign = (sign + 1) % 12; }
    return { deg, min, glyph: SIGNS[sign][0], name: SIGNS[sign][1] };
  }

  root.ACG = {
    BODIES, ANGLES, SIGNS, ASPECTS, LAT_LIMIT, norm180, norm360, eclToEq,
    tzOffsetMin, localToUtc, computeChart, computeLines, linesNear, hav, formatZodiac,
    computeAspectLines, computeParans, computeDynamic, distToMeridianKm, distToCurveKm,
    meanNodeLon, trueNodeLon, chironGeo, tableGeo,
  };
})(typeof window !== 'undefined' ? window : globalThis);
