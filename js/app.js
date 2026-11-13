(function () {
  'use strict';
  const D = window.ACG_DATA, ACG = window.ACG, MEAN = window.ACG_MEANINGS;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const $ = (id) => document.getElementById(id);
  const VS15 = '︎';
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const tok = (n) => css.getPropertyValue(n).trim();
  const COL = { ocean: tok('--ocean'), void: tok('--void'), land: tok('--land'), coast: tok('--coast'), brass: tok('--brass'), fg: tok('--fg'), muted: tok('--muted'), ink: tok('--ink') };
  const FONT_UI = '"Golos Text", -apple-system, "Segoe UI", Roboto, sans-serif';
  const FONT_GLYPH = '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", sans-serif';
  const ANG = ['MC', 'IC', 'ASC', 'DSC'];
  const VERB = { MC: 'в зените', IC: 'в надире', ASC: 'восходит', DSC: 'заходит' };
  const ANGLE_NAME = { MC: 'зенит, MC', IC: 'надир, IC', ASC: 'восход, ASC', DSC: 'заход, DSC' };
  const KM_PER_DEG = 111.2;

  /* ------------------------------ projection ------------------------------ */
  const millerY = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * Math.max(-89.9, Math.min(89.9, lat)) * D2R)) * R2D;
  const invMiller = (y) => (2.5 * Math.atan(Math.exp(0.8 * y * D2R)) - 0.625 * Math.PI) * R2D;
  const Y85 = millerY(85);

  /* --------------------------- geometry layers ---------------------------- */
  function decode(str, q) {
    const rings = [];
    if (!str) return rings;
    for (const part of str.split(' ')) {
      const out = [];
      let i = 0, lat = 0, lon = 0;
      while (i < part.length) {
        let b, sh = 0, r = 0;
        do { b = part.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
        lat += (r & 1) ? ~(r >> 1) : (r >> 1);
        sh = 0; r = 0;
        do { b = part.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
        lon += (r & 1) ? ~(r >> 1) : (r >> 1);
        out.push(lon / q, lat / q);
      }
      rings.push(out);
    }
    return rings;
  }
  const LAYERS = {
    land110: [100, true], land50: [100, true], land10: [1000, true],
    borders50: [100, false], borders10: [1000, false], lakes: [100, true],
  };
  const paths = {};
  function layer(key) {
    if (paths[key]) return paths[key];
    const [q, closed] = LAYERS[key];
    const p = new Path2D();
    for (const r of decode(D[key], q)) {
      p.moveTo(r[0], -millerY(r[1]));
      for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], -millerY(r[i + 1]));
      if (closed) p.closePath();
    }
    return (paths[key] = p);
  }

  /* -------------------------------- cities -------------------------------- */
  // Latin diacritics are folded (Zurich finds Zürich, Sao Paulo finds São Paulo); й keeps its breve, ё becomes е
  const normName = (s) => s.toLowerCase().replace(/ё/g, 'е').normalize('NFD').replace(/[\u0300-\u0305\u0307-\u036f]/g, '').normalize('NFC')
    .replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i')
    .replace(/[-‐–—'’`.]/g, ' ').replace(/\s+/g, ' ').trim();
  const CITIES = D.cities.split('\n').map((row) => {
    const f = row.split('|');
    const lat = +f[3] / 100;
    return { ru: f[0], en: f[1], c: D.countries[+f[2]], lat, lon: +f[4] / 100, wy: -millerY(lat), tz: D.tzs[+f[5]], pop: +f[6], mz: +f[7] / 10, k: normName(f[0]), ke: normName(f[1] || '') };
  });

  // country names from Natural Earth: shown from their own zoom level, under the cities
  const COUNTRY_LABELS = (window.ACG_COUNTRY_LABELS || []).map(([ru, lon, lat, mz, xz, rank]) => ({ ru: ru.toUpperCase(), lon, lat, wy: -millerY(lat), mz: mz + 0.25, xz, rank, country: true }));
  const MAP_LABELS = CITIES.concat(COUNTRY_LABELS).sort((a, b) => a.mz - b.mz);

  function nearestCity(lat, lon) {
    let best = null, bd = Infinity;
    const cl = Math.cos(lat * D2R);
    for (const c of CITIES) {
      const dx = ACG.norm180(c.lon - lon) * cl, dy = c.lat - lat;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { city: best, km: ACG.hav(lat, lon, best.lat, best.lon) } : null;
  }

  function searchPlaces(q) {
    const n = normName(q);
    if (!n) return [];
    const m = q.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
    const out = [];
    if (m) {
      const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ coord: true, lat, lon });
    }
    const pre = [], sub = [];
    for (const c of CITIES) {
      if (c.k.startsWith(n) || (c.ke && c.ke.startsWith(n))) { pre.push(c); if (pre.length >= 12) break; }
      else if (n.length >= 3 && sub.length < 12 && (c.k.includes(n) || c.ke.includes(n))) sub.push(c);
    }
    return out.concat(pre, sub).slice(0, 12);
  }

  /* ------------------------------ formatting ------------------------------ */
  const num = (x, d) => x.toFixed(d).replace('.', ',');
  const fmtLat = (v) => `${num(Math.abs(v), 2)}° ${v >= 0 ? 'с.ш.' : 'ю.ш.'}`;
  const fmtLon = (v) => { v = ACG.norm180(v); return `${num(Math.abs(v), 2)}° ${v >= 0 ? 'в.д.' : 'з.д.'}`; };
  const pad = (n) => String(n).padStart(2, '0');
  function fmtOffset(min) {
    // mean times have seconds: Moscow +2:30:17, a place at 39.2° E +2:36:48
    const s = min < 0 ? '−' : '+', sec = Math.round(Math.abs(min) * 60), ss = sec % 60;
    return `UTC${s}${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}${ss ? `:${pad(ss)}` : ''}`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const kmText = (km) => km < 10 ? '< 10 км' : `${Math.round(km / 5) * 5} км`;
  const g = (glyph) => glyph + VS15;
  const isoToRu = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; };
  const todayISO = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

  /* -------------------------------- state --------------------------------- */
  const STORE = 'acg.v1';
  const EXAMPLE = {
    date: '1996-12-27', time: '14:20',
    place: { name: 'Иркутск', country: 'Россия', lat: 52.32, lon: 104.25, tz: 'Asia/Irkutsk' },
    manualOffset: null, example: true,
    bodies: { Node: false, Chiron: false }, angles: { MC: true, IC: true, ASC: true, DSC: true }, nodeMode: 'true',
    showNatal: true,
    asp: { on: false, planet: 'Sun', set: { 60: true, 90: true, 120: true }, to: { MC: true, ASC: true } },
    par: { on: false, planet: 'Sun' },
    dyn: { mode: 'off' },
    best: { on: false, goal: 'love', country: '', size: 'big', who: 'me' },
    partner: null, partnerLines: false,
  };
  function loadState() {
    const base = JSON.parse(JSON.stringify(EXAMPLE));
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && s.date && s.place) {
        const st = Object.assign(base, s);
        st.angles = Object.assign({}, EXAMPLE.angles, s.angles);
        st.bodies = Object.assign({}, EXAMPLE.bodies, s.bodies);
        st.asp = Object.assign({}, EXAMPLE.asp, s.asp);
        st.asp.set = Object.assign({}, EXAMPLE.asp.set, s.asp && s.asp.set);
        st.asp.to = Object.assign({}, EXAMPLE.asp.to, s.asp && s.asp.to);
        st.par = Object.assign({}, EXAMPLE.par, s.par);
        st.dyn = Object.assign({}, EXAMPLE.dyn, s.dyn);
        st.best = Object.assign({}, EXAMPLE.best, s.best);
        if (st.showNatal == null) st.showNatal = true;
        st.nodeMode = 'true';                 // the site shows only the true node, as Sotis does
        return st;
      }
    } catch (e) { /* storage unavailable */ }
    return base;
  }
  function saveState() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  const state = loadState();
  state.dynDate = todayISO;
  const bodyOn = (id) => (state.bodies[id] != null ? state.bodies[id] !== false : !(ACG.BODIES.find((b) => b.id === id) || {}).asteroid);
  const bodyById = (id) => ACG.BODIES.find((b) => b.id === id);

  let chart = null, dyn = null, partnerChart = null, partnerConv = null;
  let BEST = [];           // ranked cities for the current goal
  let LINES = [], PARANS = [];
  let selected = null;     // tapped point {lat, lon}
  let lineCard = null;     // line shown in the card
  let focusKey = null;     // highlighted line
  let expandedKey = null;  // expanded row in the point card
  let picking = false;

  /* --------------------------------- lines -------------------------------- */
  const DASH = { MC: [], IC: [0.1, 4.2], ASC: [7, 4.5], DSC: [8, 3.5, 1.6, 3.5] };
  const KIND_ORDER = { paran: 0, aspect: 1, transit: 2, prog: 2, partner: 2, natal: 3 };
  const partnerName = () => (state.partner && state.partner.name) || 'Партнёр';

  function angleLine(kind, b, a) {
    const v = a === 'MC' || a === 'IC';
    const natal = kind === 'natal';
    return {
      key: `${kind}:${b.id}:${a}`, kind, geom: v ? 'v' : 'c',
      lon: a === 'MC' ? b.mc : a === 'IC' ? b.ic : null,
      arr: a === 'ASC' ? b.asc : a === 'DSC' ? b.dsc : null,
      body: b, angle: a, color: b.color, dash: DASH[a],
      width: natal ? (a === 'IC' ? 2.1 : 1.6) : (a === 'IC' ? 1.8 : 1.3),
      cap: a === 'IC' ? 'round' : 'butt', casing: !natal,
      glyph: b.glyph, tag: (kind === 'transit' ? 'т ' : kind === 'prog' ? 'п ' : '') + a + (kind === 'partner' ? '²' : ''),
      label: v ? (natal ? 'top' : 'bottom') : 'curve',
      labelFrac: natal ? (a === 'ASC' ? 0.36 : 0.62) : (a === 'ASC' ? 0.27 : 0.72),
      maxKm: natal || kind === 'partner' ? 1000 : 800,
    };
  }
  function aspectLine(L, to) {
    return {
      key: `asp:${L.body.id}:${L.aspect.a}:${L.sgn}:${to}`, kind: 'aspect', geom: to === 'MC' ? 'v' : 'c',
      lon: L.mc, arr: L.asc, body: L.body, aspect: L.aspect, to, point: L.point,
      color: L.body.color, dash: [1.6, 3.2], width: 1.25, cap: 'round', alpha: 0.85,
      glyph: L.body.glyph, tag: `${L.aspect.glyph}${VS15} ${to}`,
      label: to === 'MC' ? 'bottom' : 'curve', labelFrac: 0.5, maxKm: 500,
    };
  }
  function paranLine(p) {
    return {
      key: `par:${p.A.id}:${p.ea}:${p.B.id}:${p.eb}:${p.lat.toFixed(3)}`, kind: 'paran', geom: 'h',
      lat: p.lat, paran: p, body: p.A, body2: p.B, color: p.A.color, color2: p.B.color,
      width: 1.3, alpha: 0.9, glyph: p.A.glyph, tag: `${p.ea} × ${g(p.B.glyph)} ${p.eb}`,
      label: 'left', maxKm: KM_PER_DEG,
    };
  }

  function buildLines() {
    LINES = []; PARANS = [];
    if (!chart) { renderLegend(); return; }
    const angOn = (a) => !!state.angles[a];
    if (state.showNatal) for (const b of chart.bodies) if (bodyOn(b.id)) for (const a of ANG) if (angOn(a) && (a !== 'ASC' && a !== 'DSC' || b.asc.length)) LINES.push(angleLine('natal', b, a));
    if (dyn) for (const b of dyn.bodies) if (bodyOn(b.id)) for (const a of ANG) if (angOn(a)) LINES.push(angleLine(dyn.mode, b, a));
    if (partnerChart && state.partnerLines) for (const b of partnerChart.bodies) if (bodyOn(b.id)) for (const a of ANG) if (angOn(a) && (a !== 'ASC' && a !== 'DSC' || b.asc.length)) LINES.push(angleLine('partner', b, a));
    if (state.asp.on) {
      const pick = state.asp.planet;
      const pf = pick === 'all' ? bodyOn : (id) => id === pick;
      for (const L of ACG.computeAspectLines(chart, state.asp.set, pf)) {
        if (state.asp.to.MC) LINES.push(aspectLine(L, 'MC'));
        if (state.asp.to.ASC && L.asc.length) LINES.push(aspectLine(L, 'ASC'));
      }
    }
    if (state.par.on) {
      const pick = state.par.planet;
      PARANS = ACG.computeParans(chart, (id) => bodyOn(id) || id === pick, state.angles)
        .filter((p) => pick === 'all' || p.A.id === pick || p.B.id === pick);
      for (const p of PARANS) LINES.push(paranLine(p));
    }
    LINES.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    if (focusKey && !LINES.some((L) => L.key === focusKey)) focusKey = null;
    if (lineCard) lineCard = LINES.find((L) => L.key === lineCard.key) || null;
    renderLegend();
    renderParanList();
  }

  /* distance from a point to a line, km (parans: by latitude only) */
  function curveDistKm(arr, lat, lon, windowDeg) {
    // points are sorted by latitude: binary search the window
    const n = arr.length / 2;
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
  function lineDistKm(L, lat, lon, limitKm) {
    if (L.geom === 'h') return Math.abs(lat - L.lat) * KM_PER_DEG;
    if (L.geom === 'v') return ACG.distToMeridianKm(lat, lon, L.lon);
    return curveDistKm(L.arr, lat, lon, limitKm / KM_PER_DEG + 0.6);
  }

  /* ---------------------------------- map --------------------------------- */
  const wrap = $('mapwrap'), canvas = $('map'), ctx = canvas.getContext('2d');
  const view = { w: 1, h: 1, dpr: 1, s: 1, tx: 0, ty: 0, sMin: 0.5, sMax: 160, headH: 0, ready: false };
  let interacting = false, interactTimer = 0, rafPending = false;

  function markInteracting() {
    interacting = true;
    clearTimeout(interactTimer);
    interactTimer = setTimeout(() => { interacting = false; requestDraw(); }, 180);
  }
  function requestDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; draw(); });
  }
  function clampView() {
    const v = view;
    v.s = Math.max(v.sMin, Math.min(v.sMax, v.s));
    const half = Y85 * v.s;
    if (2 * half <= v.h) {
      const pref = v.headH + (v.h - v.headH) / 2;
      v.ty = Math.min(v.h - half, Math.max(half, pref));
    } else v.ty = Math.min(half, Math.max(v.h - half, v.ty));
    const cLon = (v.w / 2 - v.tx) / v.s;
    if (cLon > 180) v.tx += 360 * v.s; else if (cLon < -180) v.tx -= 360 * v.s;
  }
  function worldTarget() {
    const v = view, s = Math.max(v.sMin, v.w / 360);
    return { s, cx: 10, cy: -millerY(10) };
  }
  function startTarget() {
    const v = view, wt = worldTarget();
    if (v.h < v.w * 0.9) return wt;
    const avail = v.h - v.headH - 56;
    const span = millerY(76) + millerY(56);
    const s = Math.max(wt.s, Math.min(avail / span, wt.s * 2.4));
    const latMid = invMiller((millerY(76) - millerY(56)) / 2);
    return { s, cx: ACG.norm180(state.place.lon), cy: -millerY(latMid) - (v.headH - 56) / 2 / s };
  }
  function applyTarget(t) {
    const v = view;
    v.s = t.s; v.tx = v.w / 2 - t.cx * t.s; v.ty = v.h / 2 - t.cy * t.s;
    clampView();
  }
  function fitWorld() { applyTarget(startTarget()); }
  function resize() {
    const r = wrap.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const v = view;
    const cx = (v.w / 2 - v.tx) / v.s, cy = (v.h / 2 - v.ty) / v.s;
    v.w = W; v.h = H; v.dpr = dpr;
    measureHead();
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (W < 60 || H < 60) return;          // map is hidden (natal view)
    v.sMin = Math.min(W / 360, H / (2 * Y85)) * 0.98;
    if (!v.ready) { fitWorld(); v.ready = true; }
    else { v.s = Math.max(v.sMin, v.s); v.tx = W / 2 - cx * v.s; v.ty = H / 2 - cy * v.s; clampView(); }
    draw();
  }
  function measureHead() {
    const head = wrap.querySelector('.map-head');
    view.headH = head.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 8;
    wrap.style.setProperty('--head-h', Math.round(view.headH) + 'px');
  }
  const toWorld = (x, y) => [ACG.norm180((x - view.tx) / view.s), invMiller(-(y - view.ty) / view.s)];

  function zoomAround(x, y, s1) {
    const v = view, s0 = v.s;
    const wx = (x - v.tx) / s0, wy = (y - v.ty) / s0;
    v.s = Math.max(v.sMin, Math.min(v.sMax, s1));
    v.tx = x - wx * v.s; v.ty = y - wy * v.s;
    clampView(); markInteracting(); requestDraw();
  }
  let anim = 0;
  function animateZoom(x, y, s1) {
    s1 = Math.max(view.sMin, Math.min(view.sMax, s1));
    cancelAnimationFrame(anim);
    if (reduceMotion) { zoomAround(x, y, s1); return; }
    const s0 = view.s, wx = (x - view.tx) / s0, wy = (y - view.ty) / s0, t0 = performance.now(), dur = 260;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      view.s = s0 * Math.pow(s1 / s0, e); view.tx = x - wx * view.s; view.ty = y - wy * view.s;
      clampView(); markInteracting(); draw();
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function animateFit() {
    cancelAnimationFrame(anim);
    const v = view;
    const a = { s: v.s, cx: (v.w / 2 - v.tx) / v.s, cy: (v.h / 2 - v.ty) / v.s };
    applyTarget(worldTarget());
    const b = { s: v.s, cx: (v.w / 2 - v.tx) / v.s, cy: (v.h / 2 - v.ty) / v.s };
    b.cx += 360 * Math.round((a.cx - b.cx) / 360);
    const apply = (s1, cx, cy) => { v.s = s1; v.tx = v.w / 2 - cx * s1; v.ty = v.h / 2 - cy * s1; };
    if (reduceMotion) { apply(b.s, b.cx, b.cy); clampView(); requestDraw(); return; }
    const t0 = performance.now(), dur = 340;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      apply(a.s * Math.pow(b.s / a.s, e), a.cx + (b.cx - a.cx) * e, a.cy + (b.cy - a.cy) * e);
      clampView(); markInteracting(); draw();
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  // bring a latitude into view (used for parans picked from the list)
  function panToLat(lat) {
    const y = -millerY(lat) * view.s + view.ty;
    if (y > view.headH + 30 && y < view.h - 80) return;
    view.ty += (view.headH + (view.h - view.headH) * 0.4) - y;
    clampView(); requestDraw();
  }

  /* --------------------------------- draw --------------------------------- */
  const textW = new Map();
  function measure(t, font) {
    const k = font + '|' + t;
    let w = textW.get(k);
    if (w == null) { ctx.font = font; w = ctx.measureText(t).width; textW.set(k, w); }
    return w;
  }
  const hits = (r, list) => list.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  let labelHits = [];

  function drawGraticule(lonL, lonR, yTop, yBot) {
    const s = view.s;
    const step = s < 4 ? 30 : s < 14 ? 10 : s < 40 ? 5 : 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150, 180, 215, 0.10)';
    ctx.beginPath();
    for (let lon = Math.ceil(lonL / step) * step; lon <= lonR; lon += step) {
      const x = Math.round(lon * s + view.tx) + 0.5;
      ctx.moveTo(x, Math.max(0, yTop)); ctx.lineTo(x, Math.min(view.h, yBot));
    }
    for (let lat = -80; lat <= 80; lat += step) {
      if (lat === 0) continue;
      const y = Math.round(-millerY(lat) * s + view.ty) + 0.5;
      if (y < 0 || y > view.h) continue;
      ctx.moveTo(0, y); ctx.lineTo(view.w, y);
    }
    ctx.stroke();
    const yEq = Math.round(view.ty) + 0.5;
    ctx.strokeStyle = 'rgba(150, 180, 215, 0.22)';
    ctx.beginPath(); ctx.moveTo(0, yEq); ctx.lineTo(view.w, yEq); ctx.stroke();
  }

  function draw() {
    const v = view, W = v.w, H = v.h, s = v.s, dpr = v.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.ocean; ctx.fillRect(0, 0, W, H);
    const yTop = -Y85 * s + v.ty, yBot = Y85 * s + v.ty;
    ctx.fillStyle = COL.void;
    if (yTop > 0) ctx.fillRect(0, 0, W, yTop);
    if (yBot < H) ctx.fillRect(0, yBot, W, H - yBot);
    const lonL = -v.tx / s, lonR = (W - v.tx) / s;
    const kmin = Math.floor((lonL + 180) / 360), kmax = Math.floor((lonR + 180) / 360);

    drawGraticule(lonL, lonR, yTop, yBot);

    const hi = s >= 22 && !interacting && paths.land10;
    const landKey = hi ? 'land10' : (s < 2.4 ? 'land110' : 'land50');
    const borderKey = hi ? 'borders10' : 'borders50';
    const land = layer(landKey), lakes = layer('lakes'), borders = layer(borderKey);
    for (let k = kmin; k <= kmax; k++) {
      ctx.setTransform(s * dpr, 0, 0, s * dpr, (v.tx + k * 360 * s) * dpr, v.ty * dpr);
      ctx.fillStyle = COL.land; ctx.fill(land, 'evenodd');
      ctx.fillStyle = COL.ocean; ctx.fill(lakes, 'evenodd');
      ctx.lineJoin = 'round';
      ctx.lineWidth = 0.75 / s; ctx.strokeStyle = 'rgba(165, 196, 230, 0.32)'; ctx.stroke(borders);
      if (landKey !== 'land10') { ctx.lineWidth = 0.8 / s; ctx.strokeStyle = 'rgba(120, 155, 196, 0.55)'; ctx.stroke(land); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const headH = view.headH;
    const placed = [{ x: 0, y: 0, w: W, h: headH }, { x: W - 72, y: H - 230, w: 72, h: 230 }, { x: 0, y: H - 46, w: Math.min(360, W), h: 46 }];
    labelHits = [];
    drawLines(kmin, kmax, yTop, yBot, headH, placed);
    drawPlaces(kmin, kmax, placed);
  }

  // projected Y of every curve point, computed once per line; screen y = wy * s + ty
  function curveWorld(L) {
    if (L._wy) return L._wy;
    const arr = L.arr, wy = new Float32Array(arr.length / 2);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0, j = 0; i < arr.length; i += 2, j++) {
      wy[j] = -millerY(arr[i + 1]);
      if (arr[i] < mn) mn = arr[i];
      if (arr[i] > mx) mx = arr[i];
    }
    L._lonMin = mn; L._lonMax = mx;
    return (L._wy = wy);
  }

  function drawLines(kmin, kmax, yTop, yBot, headH, placed) {
    const v = view, s = v.s, W = v.w, H = v.h;
    const y0 = Math.max(0, yTop), y1 = Math.min(H, yBot);
    const labels = [];
    for (const L of LINES) {
      const isF = focusKey === L.key, dim = focusKey && !isF;
      const alpha = (L.alpha || 1) * (dim ? 0.16 : 1);
      ctx.beginPath();
      if (L.geom === 'v') {
        for (let k = kmin - 1; k <= kmax + 1; k++) {
          const x = (L.lon + 360 * k) * s + v.tx;
          if (x < -4 || x > W + 4) continue;
          ctx.moveTo(x, y0); ctx.lineTo(x, y1);
          labels.push({ L, x, y: null });
        }
      } else if (L.geom === 'h') {
        const y = -millerY(L.lat) * s + v.ty;
        if (y < y0 || y > y1) continue;
        ctx.moveTo(0, y); ctx.lineTo(W, y);
        labels.push({ L, x: 0, y });
      } else {
        const arr = L.arr, wy = curveWorld(L), M = 160;
        const target = headH + (H - headH) * L.labelFrac;
        for (let k = kmin - 1; k <= kmax + 1; k++) {
          const off = 360 * k * s + v.tx;
          if (L._lonMax * s + off < -M || L._lonMin * s + off > W + M) continue;   // this copy is off screen
          let best = null, pen = false, lx = 0, ly = 0, px = 0, py = 0, pin = false;
          for (let i = 0, j = 0; i < arr.length; i += 2, j++) {
            const x = arr[i] * s + off, y = wy[j] * s + v.ty;
            const inn = x > -M && x < W + M && y > -M && y < H + M;
            if (inn || pin) {
              if (!pen) { if (j) { ctx.moveTo(px, py); lx = px; ly = py; } else { ctx.moveTo(x, y); lx = x; ly = y; } pen = true; }
              if (!inn || Math.abs(x - lx) + Math.abs(y - ly) > 2.5) { ctx.lineTo(x, y); lx = x; ly = y; }
              if (inn && x > 6 && x < W - 76 && y > headH + 26 && y < H - 70) {
                const d = Math.abs(y - target);
                if (!best || d < best.d) best = { d, x, y };
              }
            } else pen = false;
            px = x; py = y; pin = inn;
          }
          if (best) labels.push({ L, x: best.x, y: best.y });
        }
      }
      const width = isF ? L.width + 1.8 : L.width;
      ctx.lineCap = L.cap || 'butt';
      if (L.casing) {
        ctx.globalAlpha = alpha * 0.8; ctx.strokeStyle = COL.ink; ctx.lineWidth = width + 2.6;
        ctx.setLineDash(L.dash); ctx.stroke();
      }
      ctx.globalAlpha = alpha; ctx.lineWidth = width;
      if (L.kind === 'paran') {
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = L.color; ctx.lineDashOffset = 0; ctx.stroke();
        ctx.strokeStyle = L.color2; ctx.lineDashOffset = 10; ctx.stroke();
        ctx.lineDashOffset = 0;
      } else {
        ctx.setLineDash(L.dash); ctx.strokeStyle = L.color; ctx.stroke();
      }
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineCap = 'butt';

    const narrow = W < 600;
    const font = `600 ${narrow ? 10 : 11}px ${FONT_UI}`, gfont = `${narrow ? 12 : 13}px ${FONT_GLYPH}`;
    const rows = narrow ? 3 : 5, h = narrow ? 17 : 19;
    const prio = (l) => l.L.kind === 'natal' ? (l.L.angle === 'MC' ? 0 : l.L.angle === 'IC' ? 1 : 2) : l.L.kind === 'paran' ? 5 : l.L.kind === 'aspect' ? 4 : 3;
    labels.sort((a, b) => prio(a) - prio(b));
    for (const lb of labels) {
      const L = lb.L;
      const gl = g(L.glyph);
      const gw = measure(gl, gfont), tw = measure(L.tag, font);
      const w = gw + tw + (narrow ? 12 : 15);
      let rect = null;
      if (L.label === 'top') {
        for (let row = 0; row < rows && !rect; row++) {
          const r = { x: lb.x - w / 2, y: headH + 2 + row * (h + 3), w, h };
          if (r.x < 2 || r.x + w > W - 2) continue;
          if (!hits(r, placed)) rect = r;
        }
      } else if (L.label === 'bottom') {
        for (let row = 0; row < (narrow ? 2 : 3) && !rect; row++) {
          const r = { x: lb.x - w / 2, y: H - 50 - (row + 1) * (h + 3), w, h };
          if (r.x < 2 || r.x + w > W - 2) continue;
          if (!hits(r, placed)) rect = r;
        }
      } else if (L.label === 'left') {
        const r = { x: Math.max(8, 0) + 4, y: lb.y - h / 2, w, h };
        if (r.y > headH && r.y + h < H - 50 && !hits(r, placed)) rect = r;
      } else {
        for (const dy of [0, -24, 24, -48, 48]) {
          const r = { x: lb.x + 6, y: lb.y - h / 2 + dy, w, h };
          if (r.y < headH || r.y + h > H - 60) continue;
          if (!hits(r, placed)) { rect = r; break; }
        }
      }
      if (!rect) continue;
      placed.push(rect);
      labelHits.push({ rect, key: L.key });
      const dim = focusKey && focusKey !== L.key;
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillStyle = 'rgba(7, 12, 22, 0.86)';
      roundRect(rect.x, rect.y, rect.w, rect.h, 5); ctx.fill();
      ctx.strokeStyle = L.color; ctx.globalAlpha = dim ? 0.2 : (L.kind === 'natal' ? 0.55 : 0.4); ctx.lineWidth = 1;
      if (L.kind !== 'natal') ctx.setLineDash([2, 2]);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.fillStyle = L.color; ctx.textBaseline = 'middle';
      ctx.font = gfont; ctx.fillText(gl, rect.x + (narrow ? 5 : 6), rect.y + h / 2 + 0.5);
      ctx.font = font; ctx.fillStyle = L.kind === 'paran' ? COL.fg : L.color;
      ctx.fillText(L.tag, rect.x + (narrow ? 7.5 : 9) + gw, rect.y + h / 2 + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawPlaces(kmin, kmax, placed) {
    const v = view, s = v.s, W = v.w, H = v.h;
    const copies = (lon, fn) => { for (let k = kmin - 1; k <= kmax + 1; k++) { const x = (lon + 360 * k) * s + v.tx; if (x > -40 && x < W + 40) fn(x); } };

    const P = state.place;
    const py = -millerY(P.lat) * s + v.ty;
    copies(P.lon, (x) => {
      ctx.beginPath(); ctx.arc(x, py, 7, 0, 2 * Math.PI);
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = COL.brass; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, py, 2.4, 0, 2 * Math.PI); ctx.fillStyle = COL.brass; ctx.fill();
      const font = `600 12px ${FONT_UI}`, w = measure(P.name, font);
      const r = { x: x + 11, y: py - 9, w: w + 4, h: 18 };
      placed.push({ x: x - 9, y: py - 9, w: 18, h: 18 }, r);
      ctx.font = font; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(7,12,22,.9)'; ctx.lineJoin = 'round';
      ctx.strokeText(P.name, x + 12, py); ctx.fillStyle = COL.brass; ctx.fillText(P.name, x + 12, py);
    });

    // top cities for the chosen goal: numbered badges
    if (state.best.on && BEST.length) {
      const top = BEST.slice(0, 10);
      for (let i = top.length - 1; i >= 0; i--) {
        const c = top[i].city, y = -millerY(c.lat) * s + v.ty;
        if (y < 0 || y > H) continue;
        copies(c.lon, (x) => {
          ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI);
          ctx.fillStyle = COL.brass; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = COL.ink; ctx.stroke();
          ctx.fillStyle = COL.ink; ctx.font = `700 11px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), x, y + 0.5); ctx.textAlign = 'start';
          const font = `600 12px ${FONT_UI}`, w = measure(c.ru, font), r = { x: x + 13, y: y - 9, w: w + 4, h: 18 };
          placed.push({ x: x - 11, y: y - 11, w: 22, h: 22 });
          if (!hits(r, placed)) {
            placed.push(r);
            ctx.font = font; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(7,12,22,.9)'; ctx.lineJoin = 'round';
            ctx.strokeText(c.ru, x + 14, y); ctx.fillStyle = '#F3E3BF'; ctx.fillText(c.ru, x + 14, y);
          }
        });
      }
    }

    if (selected) {
      const sy = -millerY(selected.lat) * s + v.ty;
      copies(selected.lon, (x) => {
        ctx.beginPath(); ctx.arc(x, sy, 9, 0, 2 * Math.PI);
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 14, sy); ctx.lineTo(x - 5, sy); ctx.moveTo(x + 5, sy); ctx.lineTo(x + 14, sy);
        ctx.moveTo(x, sy - 14); ctx.lineTo(x, sy - 5); ctx.moveTo(x, sy + 5); ctx.lineTo(x, sy + 14); ctx.stroke();
        placed.push({ x: x - 14, y: sy - 14, w: 28, h: 28 });
      });
    }

    // cities and country names compete for space by importance: a country label yields to the
    // biggest cities of its own zoom level, so Moscow or Paris never disappear behind a country name
    const wz = Math.log2(s * 360 / 256) + 0.6;
    const font = `500 11px ${FONT_UI}`, hasLS = 'letterSpacing' in ctx;
    let n = 0, nc = 0;
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const c of MAP_LABELS) {
      if (c.mz > wz + (c.country ? 0.3 : 0)) { if (c.mz > wz + 0.3) break; continue; }
      if (c.country ? (nc > 70 || c.xz + 2.5 < wz) : n > 90) continue;
      const y = c.wy * s + v.ty;
      if (y < 8 || y > H - 8) continue;
      if (c.country) {
        const cf = `600 ${c.rank <= 2 && wz < 5 ? 11 : 10}px ${FONT_UI}`;
        copies(c.lon, (x) => {
          const w = measure(c.ru, cf) + (hasLS ? c.ru.length * 1.2 : 0);
          const r = { x: x - w / 2 - 2, y: y - 7, w: w + 4, h: 14 };
          if (r.x < 2 || r.x + r.w > W - 2 || hits(r, placed)) return;
          placed.push(r); nc++;
          ctx.font = cf; ctx.textAlign = 'center';
          if (hasLS) ctx.letterSpacing = '1.2px';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,12,22,.55)'; ctx.strokeText(c.ru, x, y);
          ctx.fillStyle = 'rgba(160,181,209,.52)'; ctx.fillText(c.ru, x, y);
          if (hasLS) ctx.letterSpacing = '0px';
          ctx.textAlign = 'start';
        });
        continue;
      }
      ctx.font = font;
      copies(c.lon, (x) => {
        if (x < 0 || x > W) return;
        const w = measure(c.ru, font);
        const r = { x: x - 3, y: y - 8, w: w + 10, h: 16 };
        if (r.x + r.w > W - 4 || r.y < 0 || hits(r, placed)) return;
        placed.push(r); n++;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(230,236,244,.75)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,12,22,.75)';
        ctx.strokeText(c.ru, x + 5, y); ctx.fillStyle = 'rgba(214,224,238,.82)'; ctx.fillText(c.ru, x + 5, y);
      });
    }
  }

  /* ------------------------------ hit testing ----------------------------- */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function hitTest(x, y, tol) {
    const v = view, s = v.s;
    const lonL = -v.tx / s, lonR = (v.w - v.tx) / s;
    const kmin = Math.floor((lonL + 180) / 360) - 1, kmax = Math.floor((lonR + 180) / 360) + 1;
    let best = null, bd = tol;
    for (const L of LINES) {
      let d = Infinity;
      if (L.geom === 'v') {
        for (let k = kmin; k <= kmax; k++) d = Math.min(d, Math.abs(x - ((L.lon + 360 * k) * s + v.tx)));
      } else if (L.geom === 'h') {
        d = Math.abs(y - (-millerY(L.lat) * s + v.ty));
      } else {
        const arr = L.arr, wy = curveWorld(L);
        for (let k = kmin; k <= kmax; k++) {
          const off = 360 * k * s + v.tx;
          if (L._lonMax * s + off < x - 80 || L._lonMin * s + off > x + 80) continue;
          let px = null, py = null;
          for (let i = 0, j = 0; i < arr.length; i += 2, j++) {
            const X = arr[i] * s + off, Y = wy[j] * s + v.ty;
            if (px !== null && Math.abs(Y - y) < 80 && Math.abs(X - x) < 80) d = Math.min(d, segDist(x, y, px, py, X, Y));
            px = X; py = Y;
          }
        }
      }
      const adj = d + (L.kind === 'natal' ? 0 : L.kind === 'paran' ? 2.5 : 1.2);
      if (adj < bd) { bd = adj; best = L; }
    }
    return best;
  }

  /* ------------------------------ interaction ----------------------------- */
  const pointers = new Map();
  let gesture = null;
  let tapStart = null, lastTap = null, lastMouse = null;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function startGesture() {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s, wx: (mx - view.tx) / view.s, wy: (my - view.ty) / view.s };
      tapStart = null;
    } else if (pts.length === 1) {
      gesture = { type: 'pan', x: pts[0].x, y: pts[0].y };
    } else gesture = null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(anim);
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) tapStart = { x: p.x, y: p.y, t: performance.now(), moved: false, touch: e.pointerType !== 'mouse' };
    startGesture();
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (e.pointerType === 'mouse') lastMouse = p;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, p);
    if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 7) tapStart.moved = true;
    if (!gesture) return;
    if (gesture.type === 'pan') {
      view.tx += p.x - gesture.x; view.ty += p.y - gesture.y;
      gesture.x = p.x; gesture.y = p.y;
      clampView();
    } else {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      view.s = Math.max(view.sMin, Math.min(view.sMax, gesture.s * d / gesture.d));
      view.tx = mx - gesture.wx * view.s; view.ty = my - gesture.wy * view.s;
      clampView();
    }
    markInteracting(); requestDraw();
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (tapStart && !tapStart.moved && e.type === 'pointerup' && performance.now() - tapStart.t < 500) {
        const p = local(e);
        const now = performance.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30 && !picking) {
          animateZoom(p.x, p.y, view.s * 2.2);
          lastTap = null;
        } else {
          lastTap = { x: p.x, y: p.y, t: now };
          onTap(p.x, p.y, tapStart.touch);
        }
      }
      tapStart = null; gesture = null;
    } else startGesture();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);

  let safariGesture = null;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (safariGesture) return;
    cancelAnimationFrame(anim);
    const p = local(e);
    let dy = e.deltaY, dx = e.deltaX;
    if (e.deltaMode === 1) { dy *= 18; dx *= 18; } else if (e.deltaMode === 2) { dy *= view.h; dx *= view.w; }
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 1.2) {
      view.tx -= dx; clampView(); markInteracting(); requestDraw(); return;
    }
    const k = e.ctrlKey ? 0.011 : 0.0022;
    zoomAround(p.x, p.y, view.s * Math.exp(-Math.max(-300, Math.min(300, dy)) * k));
  }, { passive: false });
  canvas.addEventListener('gesturestart', (e) => { e.preventDefault(); if (pointers.size < 2) safariGesture = { s: view.s }; });
  canvas.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    if (!safariGesture || pointers.size >= 2) return;
    const p = lastMouse || { x: view.w / 2, y: view.h / 2 };
    zoomAround(p.x, p.y, safariGesture.s * e.scale);
  });
  canvas.addEventListener('gestureend', (e) => { e.preventDefault(); safariGesture = null; });
  wrap.addEventListener('gesturestart', (e) => e.preventDefault());

  canvas.addEventListener('keydown', (e) => {
    const step = 60;
    const map = { '+': () => animateZoom(view.w / 2, view.h / 2, view.s * 1.8), '=': () => animateZoom(view.w / 2, view.h / 2, view.s * 1.8), '-': () => animateZoom(view.w / 2, view.h / 2, view.s / 1.8),
      ArrowLeft: () => { view.tx += step; }, ArrowRight: () => { view.tx -= step; }, ArrowUp: () => { view.ty += step; }, ArrowDown: () => { view.ty -= step; }, Escape: () => closeInfo() };
    if (map[e.key]) { e.preventDefault(); map[e.key](); clampView(); requestDraw(); }
  });

  $('zoomIn').addEventListener('click', () => animateZoom(view.w / 2, view.h / 2, view.s * 2));
  $('zoomOut').addEventListener('click', () => animateZoom(view.w / 2, view.h / 2, view.s / 2));
  $('zoomFit').addEventListener('click', animateFit);
  $('expand').addEventListener('click', () => {
    const on = !$('app').classList.contains('map-only');
    $('app').classList.toggle('map-only', on);
    document.body.classList.toggle('lock', on && innerWidth < 900);
    $('expand').setAttribute('aria-pressed', String(on));
    $('expand').setAttribute('aria-label', on ? 'Вернуть панель' : 'Карта на весь экран');
    $('expandIcon').innerHTML = on ? '<path d="M8 3v5H3M12 17v-5h5M3 3l5 5M17 17l-5-5"/>' : '<path d="M12 3h5v5M8 17H3v-5M17 3l-5.5 5.5M3 17l5.5-5.5"/>';
  });

  /* ------------------------------ line texts ------------------------------ */
  const dynDateRu = () => isoToRu(state.dynDate);
  function lineHead(L) {
    const b = L.body;
    switch (L.kind) {
      case 'natal': return { html: `${esc(b.ru)} · <b>${L.angle}</b>`, glyphs: g(b.glyph), kw: `${b.kw} · ${ACG.ANGLES[L.angle].kw}`, sub: `натальная линия · ${ANGLE_NAME[L.angle]}` };
      case 'transit': case 'prog': {
        const m = L.kind === 'transit' ? 'Транзит' : 'Прогрессия';
        return { html: `${m}: ${esc(b.ru)} · <b>${L.angle}</b>`, glyphs: g(b.glyph), kw: `${b.kw} · ${ACG.ANGLES[L.angle].kw}`, sub: `${m.toLowerCase()} на ${dynDateRu()} · ${ANGLE_NAME[L.angle]}` };
      }
      case 'partner': return { html: `${esc(partnerName())}: ${esc(b.ru)} · <b>${L.angle}</b>`, glyphs: g(b.glyph), kw: `${b.kw} · ${ACG.ANGLES[L.angle].kw}`, sub: `линия партнёра · ${ANGLE_NAME[L.angle]}` };
      case 'aspect': return { html: `${esc(b.ru)} <b>${g(L.aspect.glyph)} ${L.to}</b>`, glyphs: g(b.glyph), kw: `${L.aspect.ru} ${L.aspect.a}° ${L.to === 'MC' ? 'к MC' : 'к Асценденту'} · ${b.kw}`, sub: `аспектная линия · ${L.aspect.ru.toLowerCase()} ${L.aspect.a}° ${L.to === 'MC' ? 'к MC' : 'к Асценденту'}` };
      case 'paran': {
        const p = L.paran;
        return { html: `${esc(p.A.ru)} <b>${p.ea}</b> × ${esc(p.B.ru)} <b>${p.eb}</b>`, glyphs: `${g(p.A.glyph)}${g(p.B.glyph)}`, kw: `паран на широте ${fmtLat(p.lat)}`, sub: `паран · широта ${fmtLat(p.lat)}` };
      }
    }
    return { html: '', glyphs: '', kw: '', sub: '' };
  }
  function lineText(L) {
    const b = L.body;
    if (L.kind === 'natal') return [MEAN[b.id][L.angle], `Темы планеты: ${b.kw}. Темы угла: ${ACG.ANGLES[L.angle].kw}.`];
    if (L.kind === 'transit' || L.kind === 'prog') {
      const m = L.kind === 'transit' ? 'Транзит' : 'Прогрессия';
      return [`${m} на ${dynDateRu()}: ${b.ru} ${VERB[L.angle]} в этих местах относительно вашей натальной карты. Влияние временное — оно сильнее, пока планета держится у линии.`, MEAN[b.id][L.angle]];
    }
    if (L.kind === 'partner') return [`Это линия из карты партнёра (${partnerName()}): здесь у него или у неё ${b.ru} ${VERB[L.angle]}.`, MEAN[b.id][L.angle]];
    if (L.kind === 'aspect') {
      const where = L.to === 'MC' ? 'к MC — точке карьеры и статуса' : 'к Асценденту — точке личности и самочувствия';
      return [`Здесь ${b.ru} образует ${L.aspect.ru.toLowerCase()} (${L.aspect.a}°) ${where}: ${L.aspect.tone}.`, `Темы планеты: ${b.kw}. Аспектные линии слабее основных, их обычно учитывают в пределах 300–500 км.`];
    }
    if (L.kind === 'paran') {
      const p = L.paran;
      return [`На этой широте ${p.A.ru} ${VERB[p.ea]} в тот же момент, когда ${p.B.ru} ${VERB[p.eb]}: обе планеты одновременно стоят на углах в течение суток рождения.`,
        `Паран действует не в точке, а полосой около ±1° по широте (примерно 110 км) вокруг всего мира. Темы смешиваются: ${p.A.kw} и ${p.B.kw}.`];
    }
    return [];
  }
  function citiesAlong(L) {
    const lim = L.kind === 'paran' ? KM_PER_DEG : 150;
    const out = [];
    for (const c of CITIES) {
      if (c.pop < 150000) break;
      const d = lineDistKm(L, c.lat, c.lon, lim);
      if (d <= lim) { out.push({ c, d }); if (out.length >= 10) break; }
    }
    return out;
  }

  /* ------------------------------- info card ------------------------------ */
  function onTap(x, y, touch) {
    if (y < 0 || y > view.h) return;
    const [lon, lat] = toWorld(x, y);
    if (Math.abs(lat) > 85) return;
    if (picking) { pickAt(lat, lon); return; }
    const lh = labelHits.find((h) => x >= h.rect.x && x <= h.rect.x + h.rect.w && y >= h.rect.y && y <= h.rect.y + h.rect.h);
    const L = lh ? LINES.find((l) => l.key === lh.key) : hitTest(x, y, touch ? 11 : 6);
    selected = lh ? null : { lat, lon };   // a tap on a label is about the line, not a place
    if (L) openLine(L);
    else { lineCard = null; focusKey = null; expandedKey = null; renderInfo(); }
    requestDraw();
  }
  function openLine(L) {
    lineCard = L; focusKey = L.key; expandedKey = null;
    renderInfo(); requestDraw();
  }

  function renderInfo() {
    const box = $('info');
    if (!selected && !lineCard) { box.hidden = true; $('legend').hidden = false; return; }
    box.hidden = false; $('legend').hidden = true;
    if (lineCard) renderLineCard(lineCard); else renderPointCard();
    $('infoBody').scrollTop = 0;
  }

  function renderLineCard(L) {
    const h = lineHead(L);
    const glyph = $('infoGlyph');
    glyph.hidden = false; glyph.textContent = h.glyphs; glyph.style.setProperty('--c', L.color);
    $('infoPlace').innerHTML = h.html;
    $('infoPlace').style.setProperty('--c', L.color);
    $('infoCoord').textContent = h.sub;
    const cities = citiesAlong(L);
    let here = '';
    if (selected) {
      const d = lineDistKm(L, selected.lat, selected.lon, 3000);
      if (isFinite(d)) here = `<p class="muted">От отмеченной точки до линии ≈ ${kmText(d)}.</p>`;
    }
    $('infoBody').innerHTML = `<div class="lc">
      ${lineText(L).map((t) => `<p>${esc(t)}</p>`).join('')}
      ${here}
      ${cities.length ? `<div><div class="ig-h" style="margin:4px 0 6px">${L.kind === 'paran' ? 'Крупные города на этой широте' : 'Крупные города у линии, до 150 км'}</div>
        <div class="cities">${cities.map((x) => `<span>${esc(x.c.ru)}<small>${L.kind === 'paran' ? num(x.c.lat, 1) + '°' : Math.round(x.d) + ' км'}</small></span>`).join('')}</div></div>` : ''}
      <div class="lc-actions">
        ${selected ? '<button type="button" class="link-btn" data-act="point">Все линии у этой точки</button>' : ''}
        <button type="button" class="link-btn" data-act="unfocus">${focusKey === L.key ? 'Снять подсветку' : 'Подсветить на карте'}</button>
      </div>
    </div>`;
    $('infoBody').querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.act === 'point') { lineCard = null; focusKey = null; renderInfo(); requestDraw(); return; }
      focusKey = focusKey === L.key ? null : L.key;
      renderLineCard(L); requestDraw();
    }));
  }

  function renderPointCard() {
    $('infoGlyph').hidden = true;
    const { lat, lon } = selected;
    const near = nearestCity(lat, lon);
    const close = near && near.km < 150;
    $('infoPlace').textContent = close ? `${near.city.ru}, ${near.city.c}${near.km >= 15 ? ` · ${Math.round(near.km)} км` : ''}` : 'Точка на карте';
    $('infoCoord').textContent = `${fmtLat(lat)} · ${fmtLon(lon)}`;

    const groups = { natal: [], partner: [], dyn: [], aspect: [], paran: [] };
    for (const L of LINES) {
      const km = lineDistKm(L, lat, lon, L.maxKm);
      if (km > L.maxKm) continue;
      const gk = L.kind === 'transit' || L.kind === 'prog' ? 'dyn' : L.kind;
      groups[gk].push({ L, km });
    }
    Object.values(groups).forEach((a) => a.sort((x, y) => x.km - y.km));
    const sect = [
      ['natal', 'Линии рядом, до 1000 км'],
      ['partner', `Линии партнёра (${esc(partnerName())}), до 1000 км`],
      ['dyn', dyn ? `${dyn.mode === 'transit' ? 'Транзиты' : 'Прогрессии'} на ${dynDateRu()}, до 800 км` : ''],
      ['aspect', 'Аспектные линии, до 500 км'],
      ['paran', 'Параны на этой широте, ±1°'],
    ];
    let html = '';
    for (const [k, title] of sect) {
      const list = groups[k];
      if (!list.length) continue;
      html += `<div class="ig-h">${title}</div><ul class="info-list">${list.map((it) => {
        const L = it.L, h = lineHead(L), on = expandedKey === L.key;
        const dist = L.kind === 'paran' ? `${num(Math.abs(lat - L.lat), 1)}°` : kmText(it.km);
        const pct = Math.max(4, Math.round((1 - it.km / L.maxKm) * 100));
        return `<li data-k="${esc(L.key)}" class="${on ? 'on' : ''}" style="--c:${L.color}">
          <span class="il-glyph">${h.glyphs}</span>
          <span class="il-name">${h.html}</span>
          <span class="il-km">${dist}</span>
          <span class="il-kw">${esc(h.kw)}</span>
          <span class="il-bar"><i style="width:${pct}%"></i></span>
          ${on ? lineText(L).map((t) => `<p class="il-text">${esc(t)}</p>`).join('') : ''}
        </li>`;
      }).join('')}</ul>`;
    }
    if (!html) html = '<p class="info-empty">Рядом нет ни одной линии из включённых.</p>';
    html += '<div class="info-foot">Нажмите на строку, чтобы прочитать значение и подсветить линию. Нажатие прямо на линию или её подпись на карте тоже открывает значение.</div>';
    $('infoBody').innerHTML = html;
    $('infoBody').querySelectorAll('li[data-k]').forEach((li) => li.addEventListener('click', () => {
      const k = li.dataset.k;
      if (expandedKey === k) { expandedKey = null; focusKey = null; } else { expandedKey = k; focusKey = k; }
      const keep = $('infoBody').scrollTop;
      renderPointCard();
      $('infoBody').scrollTop = keep;
      requestDraw();
    }));
  }
  function closeInfo() { selected = null; lineCard = null; focusKey = null; expandedKey = null; renderInfo(); requestDraw(); }
  $('infoClose').addEventListener('click', closeInfo);

  /* --------------------------------- legend ------------------------------- */
  function renderLegend() {
    const it = [
      ['<line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" stroke-width="1.8"/>', 'MC'],
      ['<line x1="2" y1="3" x2="21" y2="3" stroke="currentColor" stroke-width="2" stroke-dasharray="0.1 4" stroke-linecap="round"/>', 'IC'],
      ['<line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 3.5"/>', 'ASC'],
      ['<line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 3 1.4 3"/>', 'DSC'],
    ];
    if (state.asp.on) it.push(['<line x1="2" y1="3" x2="21" y2="3" stroke="currentColor" stroke-width="1.4" stroke-dasharray="0.1 3" stroke-linecap="round"/>', 'аспект']);
    if (state.par.on) it.push([`<line x1="1" y1="3" x2="21" y2="3" stroke="${COL.brass}" stroke-width="1.6" stroke-dasharray="5 5"/><line x1="1" y1="3" x2="21" y2="3" stroke="#6A9BFF" stroke-width="1.6" stroke-dasharray="5 5" stroke-dashoffset="5"/>`, 'паран']);
    if (dyn) it.push([`<line x1="1" y1="3" x2="21" y2="3" stroke="${COL.ink}" stroke-width="4"/><line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" stroke-width="1.3"/>`, dyn.mode === 'transit' ? 'т — транзит' : 'п — прогрессия']);
    $('legend').innerHTML = it.map(([svg, t]) => `<span><svg viewBox="0 0 22 6">${svg}</svg>${t}</span>`).join('');
  }

  /* ------------------------------ pick on map ----------------------------- */
  function setPicking(on) {
    picking = on;
    $('pickBanner').hidden = !on;
    canvas.classList.toggle('picking', on);
    if (on) { closeInfo(); if (innerWidth < 900) wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
  }
  function pickAt(lat, lon) {
    const near = nearestCity(lat, lon);
    const name = near && near.km < 25 ? near.city.ru : `${num(lat, 2)}°, ${num(ACG.norm180(lon), 2)}°`;
    setPlace({ name, country: near && near.km < 25 ? near.city.c : '', lat, lon: ACG.norm180(lon), tz: near ? near.city.tz : 'UTC' });
    setPicking(false);
  }
  $('pickOnMap').addEventListener('click', () => setPicking(!picking));
  $('pickCancel').addEventListener('click', () => setPicking(false));

  /* --------------------------------- form --------------------------------- */
  const bDate = $('bDate'), bTime = $('bTime'), bPlace = $('bPlace'), sug = $('suggest');
  bDate.value = state.date; bTime.value = state.time;
  const placeLabel = (p) => p.country ? `${p.name}, ${p.country}` : p.name;
  bPlace.value = placeLabel(state.place);

  const offs = [];
  for (let m = -12 * 60; m <= 14 * 60; m += 30) offs.push(m);
  offs.push(345, 525, 765);
  [...new Set(offs)].sort((a, b) => a - b).forEach((m) => {
    const o = document.createElement('option'); o.value = m; o.textContent = fmtOffset(m); $('manualOffset').appendChild(o);
  });

  function userEdited() { if (state.example) { state.example = false; $('exampleNote').hidden = true; } }
  $('exampleNote').hidden = !state.example;

  let recomputeTimer = 0;
  const schedule = () => { clearTimeout(recomputeTimer); recomputeTimer = setTimeout(recompute, 120); };
  for (const el of [bDate, bTime]) {
    el.addEventListener('input', () => { userEdited(); schedule(); });
    el.addEventListener('change', () => { userEdited(); schedule(); });
  }
  $('manualTz').addEventListener('change', (e) => {
    $('manualOffset').hidden = !e.target.checked;
    if (e.target.checked) {
      const cur = currentOffset != null ? currentOffset : 0;
      const sel = $('manualOffset');
      if (![...sel.options].some((o) => +o.value === cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = fmtOffset(cur); sel.appendChild(o); }
      sel.value = String(cur);
      state.manualOffset = cur;
    } else state.manualOffset = null;
    userEdited(); recompute();
  });
  $('manualOffset').addEventListener('change', (e) => { state.manualOffset = +e.target.value; userEdited(); recompute(); });
  if (state.manualOffset != null) { $('manualTz').checked = true; $('manualOffset').hidden = false; }

  // manual coordinates: decimal (51,6667 or -73.98) or degrees and minutes (51°40′, 51 40, 39°12' E)
  function parseCoord(text, max) {
    const t = String(text).trim().replace(/,/g, '.').toUpperCase();
    if (!t) return null;
    const neg = /^\s*-/.test(t) || /[SWЮЗ]/.test(t);   // minus, S/W, ю.ш./з.д.
    const nums = t.match(/\d+(?:\.\d+)?/g);
    if (!nums) return null;
    let v = +nums[0] + (nums[1] ? +nums[1] / 60 : 0) + (nums[2] ? +nums[2] / 3600 : 0);
    if (neg) v = -v;
    return Math.abs(v) <= max ? v : null;
  }
  for (const [id, max, key] of [['bLat', 90, 'lat'], ['bLon', 180, 'lon']]) {
    $(id).addEventListener('change', () => {
      const v = parseCoord($(id).value, max);
      if (v == null) { $(id).setAttribute('aria-invalid', 'true'); return; }
      $(id).removeAttribute('aria-invalid');
      setPlace(Object.assign({}, state.place, { [key]: v }));
    });
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $(id).blur(); } });
  }

  function setPlace(p) {
    state.place = p;
    bPlace.value = placeLabel(p);
    userEdited();
    recompute();
  }

  // City search with suggestions, reused by every place field on the page
  function makePlaceSearch(input, list, current, onChoose) {
    let items = [], idx = -1;
    const label = () => (current() ? placeLabel(current()) : '');
    const opt = (i) => `${input.id}-o${i}`;
    function render() {
      const q = input.value;
      items = searchPlaces(q);
      idx = items.length ? 0 : -1;
      if (!q.trim()) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      list.innerHTML = items.length ? items.map((c, i) => c.coord
        ? `<li role="option" id="${opt(i)}" data-i="${i}" aria-selected="${i === idx}"><span class="s-name">Координаты ${num(c.lat, 2)}°, ${num(c.lon, 2)}°</span><span class="s-meta">${fmtLat(c.lat)} · ${fmtLon(c.lon)}</span></li>`
        : `<li role="option" id="${opt(i)}" data-i="${i}" aria-selected="${i === idx}"><span class="s-name">${esc(c.ru)}${c.en && normName(c.en) !== c.k ? ` <span class="s-meta">${esc(c.en)}</span>` : ''}</span><span class="s-meta">${esc(c.c)} · ${fmtLat(c.lat)} · ${fmtLon(c.lon)}</span></li>`).join('')
        : `<li class="s-none">Не нашли такой город. Введите координаты через запятую (например 52.3, 104.2).</li>`;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', idx >= 0 ? opt(idx) : '');
    }
    function pick(i) {
      const c = items[i];
      if (!c) return;
      let p;
      if (c.coord) { const near = nearestCity(c.lat, c.lon); p = { name: `${num(c.lat, 2)}°, ${num(c.lon, 2)}°`, country: '', lat: c.lat, lon: c.lon, tz: near ? near.city.tz : 'UTC' }; }
      else p = { name: c.ru, country: c.c, lat: c.lat, lon: c.lon, tz: c.tz };
      list.hidden = true; input.setAttribute('aria-expanded', 'false');
      onChoose(p);
      input.value = label() || placeLabel(p);
      input.blur();
    }
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        list.querySelectorAll('li[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === idx)));
        const cur = $(opt(idx)); if (cur) cur.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', opt(idx));
      } else if (e.key === 'Enter') { e.preventDefault(); pick(idx); }
      else if (e.key === 'Escape') { list.hidden = true; input.value = label(); }
    });
    list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
    // leaving the field after typing a new town (the keyboard's "Done", a tap elsewhere) takes the first
    // suggestion: on a phone people rarely tap the list, and silently going back to the old town looks like a bug
    input.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement === input) return;
      const typed = input.value.trim();
      if (typed && typed !== label() && items.length) { pick(0); return; }
      list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.value = label();
    }, 150));
    input.value = label();
  }
  makePlaceSearch(bPlace, sug, () => state.place, setPlace);
  $('birthForm').addEventListener('submit', (e) => e.preventDefault());

  /* ------------------------------ angle chips ----------------------------- */
  const CHIP_SVG = {
    MC: '<line x1="1" y1="4" x2="27" y2="4" stroke="currentColor" stroke-width="1.8"/>',
    IC: '<line x1="2" y1="4" x2="27" y2="4" stroke="currentColor" stroke-width="2.2" stroke-dasharray="0.1 4.4" stroke-linecap="round"/>',
    ASC: '<line x1="1" y1="4" x2="27" y2="4" stroke="currentColor" stroke-width="1.8" stroke-dasharray="7 4"/>',
    DSC: '<line x1="1" y1="4" x2="27" y2="4" stroke="currentColor" stroke-width="1.8" stroke-dasharray="7 3 1.6 3"/>',
  };
  const ANGLE_SHORT = { MC: 'зенит · карьера', IC: 'надир · дом', ASC: 'восход · личность', DSC: 'заход · партнёры' };
  $('angles').innerHTML = ANG.map((a) =>
    `<button type="button" class="chip" data-a="${a}" aria-pressed="${!!state.angles[a]}"><svg viewBox="0 0 28 8">${CHIP_SVG[a]}</svg><span class="c-t"><b>${a}</b><small>${ANGLE_SHORT[a]}</small></span></button>`).join('');
  $('angles').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const a = b.dataset.a;
    state.angles[a] = !state.angles[a];
    b.setAttribute('aria-pressed', String(state.angles[a]));
    layersChanged();
  });

  /* ----------------------------- planets ledger ---------------------------- */
  function posHTML(body, cls) {
    const z = ACG.formatZodiac(body.elon);
    return `${z.deg}°${pad(z.min)}′<span class="sg" aria-hidden="true">${g(z.glyph)}</span>${body.retro ? '<span class="rx" title="ретроградный">R</span>' : ''}`;
  }
  function renderPlanets() {
    const ul = $('planets');
    ul.innerHTML = ACG.BODIES.map((b) => {
      const cb = chart && chart.bodies.find((x) => x.id === b.id);
      const db = dyn && dyn.bodies.find((x) => x.id === b.id);
      const z = cb ? ACG.formatZodiac(cb.elon) : null;
      const on = bodyOn(b.id);
      return `<li class="${on ? '' : 'off'}" style="--c:${b.color}">
        <label for="pb-${b.id}">
          <input type="checkbox" id="pb-${b.id}" data-id="${b.id}" ${on ? 'checked' : ''}>
          <span class="p-glyph${b.short ? ' txt' : ''}" aria-hidden="true">${b.short ? b.glyph : g(b.glyph)}</span>
          <span class="p-name">${esc(b.ru)}${z ? `<small>${z.name}</small>` : ''}</span>
          <span class="p-pos">${cb ? posHTML(cb) : ''}${db ? `<small class="p-dyn">${dyn.mode === 'transit' ? 'т' : 'п'} ${posHTML(db)}</small>` : ''}</span>
        </label>
      </li>`;
    }).join('');
  }
  $('planets').addEventListener('change', (e) => {
    const id = e.target.dataset.id; if (!id) return;
    state.bodies[id] = e.target.checked;
    if (e.target.checked && EXTRA_AST.includes(id) && !needExtraAsteroids()) return;   // lines appear when the tables arrive
    e.target.closest('li').classList.toggle('off', !e.target.checked);
    layersChanged();
  });
  const SETS = { all: () => true, none: () => false, personal: (id) => ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'].includes(id), social: (id) => ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].includes(id) };
  document.querySelectorAll('.filters .pill').forEach((p) => p.addEventListener('click', () => {
    const f = SETS[p.dataset.set];
    ACG.BODIES.forEach((b) => { state.bodies[b.id] = b.minorAst && p.dataset.set === 'all' ? state.bodies[b.id] === true : f(b.id); });
    renderPlanets(); layersChanged();
  }));

  /* ------------------------------ extra layers ---------------------------- */
  function layersChanged() {
    buildLines();
    saveState();
    if (selected || lineCard) renderInfo();
    requestDraw();
  }
  function setSwitch(el, on) { el.setAttribute('aria-checked', String(on)); el.querySelector('.sw-t').textContent = on ? 'Вкл' : 'Выкл'; }
  function fillPlanetSelect(sel, withNode, value) {
    sel.innerHTML = `<option value="all">Все включённые планеты</option>` + ACG.BODIES.filter((b) => withNode || b.id !== 'Node')
      .map((b) => `<option value="${b.id}">${b.glyph}${VS15} ${esc(b.ru)}</option>`).join('');
    sel.value = value;
  }

  // aspects
  fillPlanetSelect($('aspPlanet'), false, state.asp.planet);
  $('aspSet').innerHTML = ACG.ASPECTS.map((a) => `<button type="button" data-a="${a.a}" aria-pressed="${!!state.asp.set[a.a]}"><span class="g">${g(a.glyph)}</span>${a.ru} ${a.a}°</button>`).join('');
  $('aspTo').innerHTML = ['MC', 'ASC'].map((t) => `<button type="button" data-t="${t}" aria-pressed="${!!state.asp.to[t]}">${t === 'MC' ? 'к MC' : 'к Асценденту'}</button>`).join('');
  function syncAsp() { setSwitch($('aspOn'), state.asp.on); $('aspBody').hidden = !state.asp.on; }
  syncAsp();
  $('aspOn').addEventListener('click', () => { state.asp.on = !state.asp.on; syncAsp(); layersChanged(); });
  $('aspPlanet').addEventListener('change', (e) => { state.asp.planet = e.target.value; layersChanged(); });
  $('aspSet').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = +b.dataset.a; state.asp.set[a] = !state.asp.set[a]; b.setAttribute('aria-pressed', String(state.asp.set[a])); layersChanged();
  });
  $('aspTo').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const t = b.dataset.t; state.asp.to[t] = !state.asp.to[t]; b.setAttribute('aria-pressed', String(state.asp.to[t])); layersChanged();
  });

  // parans
  fillPlanetSelect($('parPlanet'), true, state.par.planet);
  function syncPar() { setSwitch($('parOn'), state.par.on); $('parBody').hidden = !state.par.on; }
  syncPar();
  $('parOn').addEventListener('click', () => { state.par.on = !state.par.on; syncPar(); layersChanged(); });
  $('parPlanet').addEventListener('change', (e) => { state.par.planet = e.target.value; layersChanged(); });
  function renderParanList() {
    if (!state.par.on) return;
    const lat = state.place.lat;
    const near = PARANS.filter((p) => Math.abs(p.lat - lat) <= 1);
    $('parCount').textContent = `На карте ${PARANS.length} ${plural(PARANS.length, 'паран', 'парана', 'паранов')}.`;
    $('parBirthTitle').textContent = `На широте рождения, ${fmtLat(lat)} ± 1°`;
    $('parBirth').innerHTML = near.length ? near.map((p) => {
      const key = paranLine(p).key;
      return `<li><button type="button" data-k="${esc(key)}"><span><span class="pl-g" style="color:${p.A.color}">${g(p.A.glyph)}</span> ${esc(p.A.ru)} ${p.ea} × <span class="pl-g" style="color:${p.B.color}">${g(p.B.glyph)}</span> ${esc(p.B.ru)} ${p.eb}</span><span class="pl-lat">${num(p.lat, 2)}°</span></button></li>`;
    }).join('') : '<li class="par-empty">Нет паранов с выбранными планетами в пределах ±1°.</li>';
  }
  $('parBirth').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const L = LINES.find((l) => l.key === b.dataset.k); if (!L) return;
    selected = null; panToLat(L.lat); openLine(L);
    if (innerWidth < 900) wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  }

  // dynamics
  $('dynDate').value = state.dynDate;
  function syncDyn() {
    $('dynMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === state.dyn.mode)));
    $('dynBody').hidden = state.dyn.mode === 'off';
    $('showNatal').checked = !!state.showNatal;
  }
  syncDyn();
  function computeDyn() {
    dyn = null;
    if (!chart || state.dyn.mode === 'off') return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.dynDate || '');
    if (!m) return;
    const t = new Date(+m[1], +m[2] - 1, +m[3], 12, 0).getTime();
    dyn = ACG.computeDynamic(chart, state.dyn.mode, t);
  }
  function dynChanged() { computeDyn(); renderPlanets(); updateHeadMeta(); measureHead(); layersChanged(); }
  $('dynMode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.dyn.mode = b.dataset.m; syncDyn(); dynChanged();
  });
  $('dynDate').addEventListener('change', (e) => { state.dynDate = e.target.value || todayISO; dynChanged(); });
  $('dynToday').addEventListener('click', () => { state.dynDate = todayISO; $('dynDate').value = todayISO; dynChanged(); });
  $('showNatal').addEventListener('change', (e) => { state.showNatal = e.target.checked; layersChanged(); });

  /* ------------------------------ best cities ----------------------------- */
  const F = window.FEAT;
  const BIG = CITIES.filter((c) => c.pop >= 150000), ALL = CITIES.filter((c) => c.pop >= 20000);
  (function initBest() {
    $('bestGoal').innerHTML = F.GOALS.map((x) => `<button type="button" data-g="${x.id}">${x.ru}</button>`).join('');
    const countries = [...new Set(CITIES.map((c) => c.c))].sort((a, b) => a.localeCompare(b, 'ru'));
    $('bestCountry').innerHTML = '<option value="">Весь мир</option>' + countries.map((c) => `<option>${esc(c)}</option>`).join('');
    const sync = () => {
      setSwitch($('bestOn'), state.best.on); $('bestBody').hidden = !state.best.on;
      $('bestGoal').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === state.best.goal)));
      $('bestWho').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === state.best.who)));
      $('bestCountry').value = state.best.country; $('bestSize').value = state.best.size;
    };
    sync();
    const changed = () => { sync(); saveState(); rankCities(); requestDraw(); };
    $('bestOn').addEventListener('click', () => { state.best.on = !state.best.on; changed(); });
    $('bestGoal').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.best.goal = b.dataset.g; changed(); } });
    $('bestWho').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { state.best.who = b.dataset.w; changed(); } });
    $('bestCountry').addEventListener('change', (e) => { state.best.country = e.target.value; changed(); });
    $('bestSize').addEventListener('change', (e) => { state.best.size = e.target.value; changed(); });
    $('bestList').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) focusCity(BEST[+li.dataset.i].city); });
  })();
  function rankCities() {
    $('bestWho').hidden = !partnerChart;
    if (!state.best.on || !chart) { BEST = []; return; }
    const pair = state.best.who === 'pair' && partnerChart;
    const pool = (state.best.size === 'all' ? ALL : BIG).filter((c) => !state.best.country || c.c === state.best.country);
    const charts = [{ chart, who: 'Вы' }].concat(pair ? [{ chart: partnerChart, who: partnerName() }] : []);
    BEST = F.scoreCities(charts, pool, state.best.goal).slice(0, 30);
    const top = BEST.length ? BEST[0].score : 1;
    $('bestList').innerHTML = BEST.length ? BEST.slice(0, 20).map((r, i) => {
      const chips = r.parts.slice(0, 4).map((pt) => `<span class="lc-chip ${pt.s < 0 ? 'neg' : ''}" style="--c:${pt.body.color}"><i>${g(pt.body.glyph)}</i>${pt.angle}${pair ? `<small>${esc(pt.who === 'Вы' ? 'вы' : pt.who)}</small>` : ''} <small>${Math.round(pt.km)} км</small></span>`).join('');
      return `<li data-i="${i}" tabindex="0"><span class="bl-n">${i + 1}</span><span class="bl-main"><span class="bl-city">${esc(r.city.ru)}<small>${esc(r.city.c)}</small></span><span class="bl-chips">${chips}</span></span><span class="bl-score"><b>${num(r.score, 1)}</b><i style="width:${Math.max(6, Math.round(r.score / top * 100))}%"></i></span></li>`;
    }).join('') : '<li class="par-empty">Нет городов, где линии помогают этой цели. Попробуйте другую страну или «все города».</li>';
  }
  $('bestList').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const li = e.target.closest('li[data-i]'); if (li) focusCity(BEST[+li.dataset.i].city); } });
  // fly the map to a city and show the lines around it
  function focusCity(c) {
    if (location.hash !== '#map') location.hash = '#map';
    const v = view;
    const s1 = Math.max(v.s, (v.w / 360) * 5);
    v.s = s1; v.tx = v.w / 2 - c.lon * s1; v.ty = (v.headH + v.h) / 2 + millerY(c.lat) * s1;
    clampView();
    selected = { lat: c.lat, lon: c.lon }; lineCard = null; focusKey = null; expandedKey = null;
    renderInfo(); requestDraw();
    if (innerWidth < 900) wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* -------------------------------- partner -------------------------------- */
  function computePartner() {
    partnerChart = null; partnerConv = null;
    const p = state.partner;
    const m = p && /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date || ''), t = p && /^(\d{1,2}):(\d{2})/.exec(p.time || '');
    if (!p || !m || !t || !p.place) { renderPartnerStatus(); return; }
    try { partnerConv = ACG.localToUtc(+m[1], +m[2], +m[3], +t[1], +t[2], p.place.tz || 'UTC', p.manualOffset, p.place.lon); }
    catch (e) { partnerConv = ACG.localToUtc(+m[1], +m[2], +m[3], +t[1], +t[2], 'UTC', 0); }
    partnerChart = ACG.computeChart(partnerConv.utc, { node: state.nodeMode });
    partnerChart.bodies.forEach((b) => { if (b.id === 'Node') b.retro = b.speed < 0.005; });
    renderPartnerStatus();
  }
  function renderPartnerStatus() {
    const p = state.partner;
    $('pClear').hidden = !p;
    $('pStatus').textContent = partnerChart ? `UTC ${new Date(partnerConv.utc).toISOString().slice(0, 16).replace('T', ' ')} · ${fmtOffset(partnerConv.offset)}` : 'Заполните дату, время и место — появятся синастрия, композит и карта пары.';
  }
  function setPartner(p) {
    state.partner = p;
    $('pName').value = p ? p.name || '' : ''; $('pDate').value = p ? p.date || '' : ''; $('pTime').value = p ? p.time || '' : '';
    $('pPlace').value = p && p.place ? placeLabel(p.place) : '';
    partnerChanged();
  }
  function partnerChanged() {
    computePartner(); saveState(); buildLines(); rankCities();
    if (selected || lineCard) renderInfo();
    requestDraw();
    if (window.NatalView) NatalView.update();
  }
  (function initPartner() {
    const ensure = () => (state.partner = state.partner || { name: '', date: '', time: '12:00', place: null });
    $('pName').addEventListener('input', (e) => { ensure().name = e.target.value.trim(); saveState(); if (window.NatalView) NatalView.update(); });
    for (const id of ['pDate', 'pTime']) $(id).addEventListener('change', (e) => { ensure()[id === 'pDate' ? 'date' : 'time'] = e.target.value; partnerChanged(); });
    makePlaceSearch($('pPlace'), $('pSuggest'), () => state.partner && state.partner.place, (pl) => { ensure().place = pl; partnerChanged(); });
    $('pClear').addEventListener('click', () => { state.partnerLines = false; $('pLines').checked = false; setPartner(null); });
    $('pLines').checked = !!state.partnerLines;
    $('pLines').addEventListener('change', (e) => { state.partnerLines = e.target.checked; saveState(); buildLines(); requestDraw(); });
    if (state.partner) setPartner(state.partner);
  })();

  /* ------------------------------- compute -------------------------------- */
  let currentOffset = null, lastConv = null;
  function showStatus(msg) { $('status').textContent = msg || ''; $('status').hidden = !msg; }
  function updateHeadMeta() {
    if (!lastConv) return;
    const u = new Date(lastConv.utc);
    const dynPart = dyn ? ` · ${dyn.mode === 'transit' ? 'транзиты' : 'прогрессии'} на ${dynDateRu()}` : '';
    $('mhMeta').innerHTML = `UTC ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())} · ${fmtOffset(lastConv.offset)}${dynPart}<span class="long"> · геоцентрический горизонт, без рефракции</span>`;
  }
  /* Eros, Psyche, Amor, Hygiea and Proserpina (half a megabyte of tables) load only when someone turns
     one of them on, on the map or in the natal chart; the charts are recomputed once they arrive */
  const EXTRA_AST = ACG.BODIES.filter((b) => b.minorAst).map((b) => b.id);
  let extraAst = window.ACG_ASTEROIDS && window.ACG_ASTEROIDS.data && window.ACG_ASTEROIDS.data.Eros ? 'ready' : null;
  function needExtraAsteroids() {
    if (extraAst) return extraAst === 'ready';
    extraAst = 'loading';
    const core = document.querySelector('script[src*="acg-core.js"]'), v = core && core.src.split('?')[1];
    const sc = document.createElement('script');
    sc.src = `js/asteroids-extra-data.js${v ? '?' + v : ''}`;
    sc.onload = () => { extraAst = 'ready'; recompute(); };
    sc.onerror = () => { extraAst = null; showStatus('Не загрузились таблицы дополнительных астероидов. Проверьте интернет.'); };
    document.head.appendChild(sc);
    return false;
  }
  const wantsExtra = () => EXTRA_AST.some((id) => state.bodies[id] === true) || !!(state.natal && state.natal.asteroids2);

  function recompute() {
    if (wantsExtra()) needExtraAsteroids();
    if (!window.Astronomy) { showStatus('Не загрузилась астрономическая библиотека. Проверьте интернет и обновите страницу.'); return; }
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bDate.value), tm = /^(\d{1,2}):(\d{2})/.exec(bTime.value);
    if (!dm) { showStatus('Укажите дату рождения.'); return; }
    if (!tm) { showStatus('Укажите время рождения. Если оно неизвестно, поставьте 12:00 — линии сдвинутся, но общую картину вы увидите.'); return; }
    const y = +dm[1], mo = +dm[2], d = +dm[3], hh = +tm[1], mi = +tm[2];
    if (y < 1800 || y > 2100) { showStatus('Год должен быть между 1800 и 2100.'); return; }
    showStatus('');
    state.date = bDate.value; state.time = bTime.value.slice(0, 5);
    const P = state.place;
    let conv;
    try { conv = ACG.localToUtc(y, mo, d, hh, mi, P.tz, state.manualOffset, P.lon); }
    catch (e) { conv = ACG.localToUtc(y, mo, d, hh, mi, 'UTC', 0); }
    currentOffset = conv.offset; lastConv = conv;
    chart = ACG.computeChart(conv.utc, { node: state.nodeMode });
    // nodes are conventionally retrograde; mark them direct only when clearly moving forward
    chart.bodies.forEach((b) => { if (b.id === 'Node') b.retro = b.speed < 0.005; });
    computeDyn();
    computePartner();
    rankCities();

    const u = new Date(conv.utc);
    const utcStr = `${pad(u.getUTCDate())}.${pad(u.getUTCMonth() + 1)}.${u.getUTCFullYear()} ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}`;
    $('tzName').textContent = state.manualOffset != null ? 'вручную' : P.tz;
    $('tzOffset').textContent = fmtOffset(conv.offset);
    const tzNote = conv.source === 'lmt' ? 'Поясного времени тогда ещё не было: взято местное среднее время места рождения, по его долготе (4 минуты на градус). Если в документах время другого города, задайте смещение вручную.'
      : conv.gap ? 'В этот день часы переводили вперёд, и такого времени на часах не было. Оно взято по смещению до перевода; если в документах другое, задайте смещение вручную.'
      : conv.ambiguous ? 'В этот день часы переводили назад, и такое время было дважды. Взято первое, по смещению до перевода; если имелось в виду второе, задайте смещение вручную.' : '';
    $('tzNote').textContent = tzNote; $('tzNote').hidden = !tzNote;
    $('utcOut').textContent = `${utcStr} UTC`;
    const dmS = (v) => { const a = Math.abs(v), d = Math.floor(a); let m = Math.round((a - d) * 60); return m === 60 ? `${d + 1}°00′` : `${d}°${pad(m)}′`; };
    $('placeCoords').textContent = `${dmS(P.lat)} ${P.lat >= 0 ? 'с.ш.' : 'ю.ш.'} · ${dmS(ACG.norm180(P.lon))} ${ACG.norm180(P.lon) >= 0 ? 'в.д.' : 'з.д.'}`;
    for (const [id, v] of [['bLat', P.lat], ['bLon', ACG.norm180(P.lon)]]) {
      const el = $(id);
      if (document.activeElement !== el) { el.value = num(v, 4); el.removeAttribute('aria-invalid'); }
    }
    $('mhDate').textContent = `${d} ${MONTHS[mo - 1]} ${y} · ${pad(hh)}:${pad(mi)} · ${P.name}`;
    updateHeadMeta();
    renderPlanets();
    buildLines();
    if (selected || lineCard) renderInfo();
    saveState();
    measureHead();
    requestDraw();
    if (window.NatalView) NatalView.update();
    if (window.ToolsView) ToolsView.update();
    if (window.CityView) CityView.update();
    if (window.HomeView) HomeView.update();
  }

  /* --------------------------------- views -------------------------------- */
  // load a saved chart into the form (from the personal account)
  function loadChart(d) {
    state.date = d.date; state.time = d.time; state.place = d.place; state.manualOffset = d.manualOffset == null ? null : d.manualOffset;
    bDate.value = d.date; bTime.value = d.time; bPlace.value = placeLabel(d.place);
    $('manualTz').checked = state.manualOffset != null; $('manualOffset').hidden = state.manualOffset == null;
    if (state.manualOffset != null) $('manualOffset').value = String(state.manualOffset);
    userEdited(); recompute(); fitWorld(); requestDraw();
  }
  const APP = {
    state,
    save: saveState,
    get chart() { return chart; },
    get conv() { return lastConv; },
    get partnerChart() { return partnerChart; },
    get partnerConv() { return partnerConv; },
    recompute: () => recompute(),
    needExtraAsteroids: () => needExtraAsteroids(),
    cities: CITIES,
    placeLabel, makePlaceSearch, nearestCity, focusCity, setPartner, loadChart, fmtOffset,
    current: () => ({ date: state.date, time: state.time, place: state.place, manualOffset: state.manualOffset }),
  };
  window.ACG_APP = APP;
  const VIEWS = ['home', 'map', 'natal', 'city', 'tools', 'sport'];
  function setView(v) {
    if (!VIEWS.includes(v)) v = 'home';
    document.body.dataset.view = v;
    wrap.hidden = v !== 'map';
    $('natalView').hidden = v !== 'natal';
    $('toolsView').hidden = v !== 'tools';
    $('cityView').hidden = v !== 'city';
    $('sportView').hidden = v !== 'sport';
    $('homeView').hidden = v !== 'home';
    // the city map lives inside the Map section: its tab stays lit for both
    const tabView = v === 'city' ? 'map' : v;
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.view === tabView) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (v !== 'map' && $('app').classList.contains('map-only')) $('expand').click();
    if (v === 'natal') NatalView.update();
    else if (v === 'tools') ToolsView.update();
    else if (v === 'city') { if (window.CityView) CityView.update(); window.scrollTo(0, 0); }
    else if (v === 'sport') { if (window.SportView) SportView.update(); }
    else if (v === 'home') { if (window.HomeView) HomeView.update(); window.scrollTo(0, 0); }
    else requestAnimationFrame(() => { resize(); if (!view.ready) return; measureHead(); requestDraw(); });
  }
  const viewFromHash = () => (location.hash || '#home').slice(1);
  window.addEventListener('hashchange', () => setView(viewFromHash()));
  if (window.NatalView) NatalView.init(APP);
  if (window.ToolsView) ToolsView.init(APP);
  if (window.CityView) CityView.init(APP);
  if (window.SportView) SportView.init(APP);
  if (window.HomeView) HomeView.init(APP);
  if (window.Account) Account.init(APP);

  /* --------------------------------- boot --------------------------------- */
  const ro = new ResizeObserver(() => resize());
  ro.observe(wrap);
  setView(viewFromHash());
  resize();
  recompute();
  if (view.w >= 60) { measureHead(); fitWorld(); requestDraw(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { textW.clear(); requestDraw(); });
  setTimeout(() => { layer('land50'); setTimeout(() => { layer('land10'); layer('borders10'); requestDraw(); }, 300); }, 700);
})();
