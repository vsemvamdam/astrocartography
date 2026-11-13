/* "Город": astrocartography inside one city.
   1. A street map (Leaflet, OpenStreetMap data) with three layers:
      - local space rays from your home: the azimuth of each planet at the moment of birth, as seen from
        the home point (relocated local space). The direction of a planet is where its themes are found;
      - natal local space lines: the great circles that start at the birthplace in each planet's azimuth,
        where they cross the city;
      - astrocartography lines (MC, IC, ASC, DSC) that pass through the city, if any.
   2. A reading of the city: the chart recalculated for it (relocation), the lines nearby with their
      meanings, and how the city ranks for each goal among the world's large cities. */
(function () {
  'use strict';
  const ACG = window.ACG, N = window.NATAL, F = window.FEAT, MEAN = window.ACG_MEANINGS;
  const $ = (id) => document.getElementById(id);
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, R_KM = 6371.0088;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g = (s) => s + '︎';
  const num = (v, d) => v.toFixed(d).replace('.', ',');
  const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const BODY = Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const IDS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const COMPASS = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
  const compass = (az) => COMPASS[Math.round(n360(az) / 22.5) % 16];
  const ANG_RU = { MC: 'MC', IC: 'IC', ASC: 'ASC', DSC: 'DSC' };

  // what lies in a planet's direction from home (local space, as in Michael Erlewine's and Steve Cozzi's books)
  const LS_TEXT = {
    Sun: 'признание и жизненная сила: места, где вас замечают, — офисы, сцены, центры власти. Хорошо для работы на виду и важных встреч.',
    Moon: 'дом и чувства: здесь легче найти уютное жильё, семейные места, рынки и кафе «как дома». Тянет к воде и покою.',
    Mercury: 'общение и дела: учёба, переговоры, магазины, транспорт, короткие поездки. Хорошо для офиса и деловых встреч.',
    Venus: 'удовольствия: свидания, красота, искусство, кафе и магазины. Здесь проще отдыхать, знакомиться и тратить с радостью.',
    Mars: 'энергия: спорт, соревнования, ремонт, активная работа. Хорошо для спортзала, хуже для спокойной жизни: больше спешки и стычек.',
    Jupiter: 'удача и рост: учёба, полезные знакомства, крупные покупки, щедрые люди. Одно из лучших направлений для работы и жилья.',
    Saturn: 'труд и ответственность: здесь хорошо работать на результат, но жить и отдыхать тяжелее — больше ограничений и усталости.',
    Uranus: 'перемены: неожиданные встречи, новые идеи, технологии, свобода. Хорошо для экспериментов, хуже для стабильности.',
    Neptune: 'вдохновение и туман: творчество, музыка, вода, храмы. Легко потерять ориентиры — не лучшее направление для договоров.',
    Pluto: 'глубокие перемены и сила: кризисы и обновление, вопросы власти и больших денег. Сильное, но тяжёлое направление для жилья.',
  };

  let app = null, map = null, LL = null, layer = null, homeMarker = null, tileIx = 0, tileLayer = null, tileOk = false, tileErr = 0;
  let rays = [], hlId = null, poolCache = { key: null, scores: {} };

  const fill = (o, defs) => { for (const k in defs) if (!(k in o)) o[k] = defs[k]; return o; };
  function opts() {
    const st = app.state;
    return fill(st.city || (st.city = {}), { place: null, home: null, ls: true, natal: true, acg: true, dial: true });
  }
  const cityPlace = () => opts().place || app.state.place;
  const homePt = () => opts().home || { lat: cityPlace().lat, lon: cityPlace().lon };

  /* ------------------------------- geometry ------------------------------- */
  // horizon coordinates of a body at the moment of the chart, seen from (lat, lon); azimuth from north, clockwise
  function horizon(b, gast, lat, lon) {
    const H = (gast + lon - b.ra) * D2R, d = b.dec * D2R, f = lat * D2R;
    const E = -Math.cos(d) * Math.sin(H);
    const Nn = Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.cos(H) * Math.sin(f);
    const U = Math.sin(d) * Math.sin(f) + Math.cos(d) * Math.cos(H) * Math.cos(f);
    return { az: n360(Math.atan2(E, Nn) * R2D), alt: Math.asin(Math.max(-1, Math.min(1, U))) * R2D };
  }
  const vec = (lat, lon) => { const f = lat * D2R, l = lon * D2R; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; };
  const toLL = (v) => [Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D, Math.atan2(v[1], v[0]) * R2D];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function tangent(lat, lon, az) {
    const f = lat * D2R, l = lon * D2R, a = az * D2R;
    const north = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)], east = [-Math.sin(l), Math.cos(l), 0];
    return [0, 1, 2].map((i) => north[i] * Math.cos(a) + east[i] * Math.sin(a));
  }
  const along = (p, t, s) => toLL([0, 1, 2].map((i) => p[i] * Math.cos(s) + t[i] * Math.sin(s)));
  function bearing(a, b) {
    const f1 = a.lat * D2R, f2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    return n360(Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) * R2D);
  }
  const kmText = (km) => (km < 1 ? `${Math.round(km * 1000)} м` : km < 10 ? `${num(km, 1)} км` : `${Math.round(km)} км`);

  /* --------------------------------- data --------------------------------- */
  // local space rays from the home point (relocated) and the natal lines from the birthplace
  function computeRays() {
    const ch = app.chart, h = homePt(), B = app.state.place;
    return IDS.map((id) => {
      const b = ch.bodies.find((x) => x.id === id);
      if (!b) return null;
      const here = horizon(b, ch.gast, h.lat, h.lon), birth = horizon(b, ch.gast, B.lat, B.lon);
      return { id, b, az: here.az, alt: here.alt, natAz: birth.az };
    }).filter(Boolean);
  }
  // the natal local space great circle of a planet near the home point: [{pts, side}] or null when it passes far away
  function natalSegment(r, h, halfKm) {
    const B = app.state.place, p = vec(B.lat, B.lon), t = tangent(B.lat, B.lon, r.natAz), c = vec(h.lat, h.lon);
    const s0 = Math.atan2(dot(c, t), dot(c, p));
    const q = vec(...along(p, t, s0));
    const off = Math.acos(Math.max(-1, Math.min(1, dot(q, c)))) * R_KM;
    if (off > halfKm * 1.2) return null;
    const w = halfKm / R_KM, pts = [];
    for (let k = -12; k <= 12; k++) pts.push(along(p, t, s0 + (k / 12) * w));
    return { pts, off, side: s0 >= 0 ? 'planet' : 'opposite' };
  }
  // astrocartography lines of the natal chart that run through the area around the city
  function acgInArea(h, dLat, dLon) {
    const out = [];
    for (const b of app.chart.bodies) {
      if (!IDS.includes(b.id)) continue;
      for (const [ang, m] of [['MC', b.mc], ['IC', b.ic]]) {
        if (Math.abs(n180(m - h.lon)) < dLon) out.push({ b, ang, pts: [[h.lat - dLat, h.lon + n180(m - h.lon)], [h.lat + dLat, h.lon + n180(m - h.lon)]] });
      }
      for (const [ang, arr] of [['ASC', b.asc], ['DSC', b.dsc]]) {
        const pts = [];
        for (let i = 0; i < arr.length; i += 2) {
          const lon = arr[i], lat = arr[i + 1];
          if (Math.abs(lat - h.lat) < dLat * 1.6 && Math.abs(n180(lon - h.lon)) < dLon * 1.6) pts.push([lat, h.lon + n180(lon - h.lon)]);
        }
        if (pts.length >= 2) out.push({ b, ang, pts });
      }
    }
    return out;
  }

  /* ---------------------------------- map --------------------------------- */
  // CARTO raster basemaps need a key since 25 Sep 2026 (without one every tile is an
  // "API KEY REQUIRED" picture that loads fine, so no error fallback can catch it).
  // Free key: carto.com/basemaps/apikey — put it here to get the native dark map back.
  const CARTO_KEY = '';
  const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const TILES = [
    CARTO_KEY && { url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`, o: { subdomains: 'abcd', maxZoom: 19, attribution: `${OSM_ATTR} · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>` } },
    // OpenStreetMap's own tiles, darkened by a CSS filter (.osm-dark in index.html)
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', o: { maxZoom: 19, className: 'osm-dark', attribution: OSM_ATTR } },
    { url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png', o: { maxZoom: 18, className: 'osm-dark', attribution: OSM_ATTR } },
  ].filter(Boolean);
  function setTiles(i) {
    if (tileLayer) map.removeLayer(tileLayer);
    tileIx = i; tileOk = false; tileErr = 0;
    if (i >= TILES.length) { $('cityMapNote').textContent = 'Подложка с улицами не загрузилась: линии показаны без карты. Проверьте интернет или откройте сайт позже.'; return; }
    tileLayer = LL.tileLayer(TILES[i].url, TILES[i].o).addTo(map);
    tileLayer.on('tileload', () => { tileOk = true; $('cityMapNote').textContent = ''; });
    tileLayer.on('tileerror', () => { if (!tileOk && ++tileErr >= 4) setTiles(i + 1); });
  }
  function loadLeaflet(cb) {
    if (window.L && window.L.map) { cb(); return; }
    if (loadLeaflet.busy) { loadLeaflet.busy.push(cb); return; }
    loadLeaflet.busy = [cb];
    const core = document.querySelector('script[src*="acg-core.js"]'), v = core && core.src.split('?')[1];
    const sc = document.createElement('script');
    sc.src = `js/vendor/leaflet.js${v ? '?' + v : ''}`;
    sc.onload = () => { const w = loadLeaflet.busy; loadLeaflet.busy = null; w.forEach((f) => f()); };
    sc.onerror = () => { loadLeaflet.busy = null; $('cityMapNote').textContent = 'Не загрузилась библиотека карты. Проверьте интернет и обновите страницу.'; };
    document.head.appendChild(sc);
  }
  function ensureMap() {
    if (map) { map.invalidateSize(); return true; }
    if (!window.L || !window.L.map) { loadLeaflet(() => { ensureMap(); update(); }); return false; }
    LL = window.L;
    const h = homePt();
    map = LL.map('cityMap', { zoomControl: false, attributionControl: true, worldCopyJump: false }).setView([h.lat, h.lon], 12);
    LL.control.zoom({ position: 'bottomright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map);   // away from the popups
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    setTiles(0);
    layer = LL.layerGroup().addTo(map);
    map.on('click', (e) => pointInfo(e.latlng.lat, e.latlng.lng));
    map.on('zoomend', drawLabels);
    return true;
  }
  let labelLayer = null, dialLayer = null;
  function drawLabels() {
    if (!map) return;
    drawDial();
    if (labelLayer) labelLayer.clearLayers(); else labelLayer = LL.layerGroup().addTo(map);
    if (!opts().ls) return;
    const h = homePt(), size = map.getSize(), z = map.getZoom();
    const mpp = 156543.03392 * Math.cos(h.lat * D2R) / Math.pow(2, z);
    const km = Math.min(size.x, size.y) * 0.42 * mpp / 1000;
    const p = vec(h.lat, h.lon);
    // spread labels that would overlap: rays closer than 7° get pushed outwards in turn
    const sorted = rays.slice().sort((a, b) => a.az - b.az);
    let prev = -99, step = 0;
    for (const r of sorted) {
      step = r.az - prev < 7 ? step + 1 : 0; prev = r.az;
      const at = along(p, tangent(h.lat, h.lon, r.az), (km * (1 + step * 0.13)) / R_KM);
      LL.marker(at, { interactive: false, keyboard: false, icon: LL.divIcon({ className: 'cm-lbl', html: `<span style="--c:${r.b.color}">${g(r.b.glyph)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(labelLayer);
    }
    // the dashed back sides get faint glyphs too, otherwise they read as stray marks
    prev = -99; step = 0;
    for (const r of sorted.map((x) => ({ r: x, az: n360(x.az + 180) })).sort((a, b) => a.az - b.az)) {
      step = r.az - prev < 7 ? step + 1 : 0; prev = r.az;
      const at = along(p, tangent(h.lat, h.lon, r.az), (km * (0.78 + step * 0.11)) / R_KM);
      LL.marker(at, { interactive: false, keyboard: false, icon: LL.divIcon({ className: 'cm-lbl back', html: `<span style="--c:${r.r.b.color}">${g(r.r.b.glyph)}</span>`, iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(labelLayer);
    }
  }
  function drawMap() {
    if (!map) return;
    layer.clearLayers();
    const o = opts(), h = homePt(), p = vec(h.lat, h.lon);
    const reach = 60;   // km of each ray
    if (o.acg) {
      for (const a of acgInArea(h, 0.9, 1.4)) {
        LL.polyline(a.pts, { color: a.b.color, weight: 3, opacity: 0.85, dashArray: a.ang === 'MC' || a.ang === 'ASC' ? null : '10 6', className: 'cm-acg' })
          .bindTooltip(`${a.b.ru} ${ANG_RU[a.ang]} — линия астрокартографии`, { sticky: true }).addTo(layer);
      }
    }
    if (o.natal) {
      for (const r of rays) {
        const seg = natalSegment(r, h, 40);
        if (!seg) continue;
        LL.polyline(seg.pts, { color: r.b.color, weight: 3.2, opacity: 0.8, dashArray: '0.1 8', lineCap: 'round' })
          .bindTooltip(`${r.b.ru}: натальный луч от места рождения${seg.side === 'opposite' ? ' (обратная сторона)' : ''}, в ${kmText(seg.off)} от дома`, { sticky: true }).addTo(layer);
      }
    }
    if (o.ls) {
      for (const r of rays) {
        const t = tangent(h.lat, h.lon, r.az), on = !hlId || hlId === r.id;
        const fwd = [], back = [];
        for (let k = 0; k <= 12; k++) { fwd.push(along(p, t, (k / 12) * reach / R_KM)); back.push(along(p, t, -(k / 12) * reach / R_KM)); }
        LL.polyline(back, { color: r.b.color, weight: 1.2, opacity: on ? 0.35 : 0.12, dashArray: '4 6', interactive: false }).addTo(layer);
        LL.polyline(fwd, { color: r.b.color, weight: hlId === r.id ? 4.5 : 2.4, opacity: on ? 0.95 : 0.25 })
          .bindTooltip(`${r.b.ru}: ${Math.round(r.az)}° ${compass(r.az)}`, { sticky: true })
          .on('click', (e) => { LL.DomEvent.stopPropagation(e); pick(r.id); }).addTo(layer);
      }
    }
    if (homeMarker) homeMarker.setLatLng([h.lat, h.lon]);
    else {
      homeMarker = LL.marker([h.lat, h.lon], { draggable: true, keyboard: true, title: 'Точка отсчёта (0°): перетащите', icon: LL.divIcon({ className: 'cm-home', html: '<span>⌂</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
      homeMarker.on('dragend', () => { const ll = homeMarker.getLatLng(); setHome(ll.lat, ll.lng, false); });
    }
    drawLabels();
  }

  // the reference point (0°) set by the person: by dragging, from the map, by address or by geolocation.
  // When it lands in another town, the town follows, so the title and the reading stay true.
  function setHome(lat, lon, recenter, name) {
    const o = opts(), c = cityPlace();
    o.home = { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
    o.homeName = name || null;
    if (ACG.hav(c.lat, c.lon, lat, lon) > 30) {
      const near = app.nearestCity(lat, lon);
      o.place = near && near.km < 40 ? { name: near.city.ru, country: near.city.c, lat: near.city.lat, lon: near.city.lon, tz: near.city.tz }
        : { name: `${num(lat, 2)}°, ${num(lon, 2)}°`, country: '', lat: o.home.lat, lon: o.home.lon, tz: near ? near.city.tz : 'UTC' };
      hlId = null;
    }
    if (map) map.closePopup();
    app.save(); refresh(!!recenter);
  }
  // the 360° scale around the reference point: a spoke every 10°, a label every 30°, the cardinal points,
  // and a ring of 10° sectors coloured by the planet whose ray (or its back side, fainter) passes through it
  function drawDial() {
    if (!map) return;
    if (dialLayer) dialLayer.clearLayers(); else dialLayer = LL.layerGroup().addTo(map);
    if (!opts().dial) return;
    const h = homePt(), size = map.getSize(), z = map.getZoom();
    const mpp = 156543.03392 * Math.cos(h.lat * D2R) / Math.pow(2, z);
    const km = Math.min(size.x, size.y) * 0.34 * mpp / 1000, p = vec(h.lat, h.lon);
    const at = (az, f) => along(p, tangent(h.lat, h.lon, az), (km * f) / R_KM);
    const arc = (a0, a1, f) => { const out = []; for (let a = a0; a <= a1 + 1e-9; a += 1) out.push(at(a, f)); return out; };
    for (let a = 0; a < 360; a += 10) {
      const major = a % 30 === 0, card = a % 90 === 0;
      LL.polyline([at(a, 0.06), at(a, 1)], { color: card ? '#D8A4A6' : '#9FB3D1', weight: card ? 1.4 : major ? 1 : 0.6, opacity: card ? 0.7 : major ? 0.42 : 0.22, interactive: false }).addTo(dialLayer);
    }
    LL.polyline(arc(0, 360, 1), { color: '#9FB3D1', weight: 1, opacity: 0.45, interactive: false }).addTo(dialLayer);
    LL.polyline(arc(0, 360, 0.5), { color: '#9FB3D1', weight: 0.6, opacity: 0.2, dashArray: '2 6', interactive: false }).addTo(dialLayer);
    for (let a = 0; a < 360; a += 10) {
      const mid = a + 5;
      let best = null;
      for (const r of rays) {
        const d = Math.abs(n180(mid - r.az)), d2 = Math.abs(n180(mid - r.az - 180));
        if (d <= 7.5 && (!best || d < best.d || best.back)) best = { r, d, back: false };
        else if (d2 <= 7.5 && (!best || (best.back && d2 < best.d))) best = { r, d: d2, back: true };
      }
      const seg = LL.polyline(arc(a + 0.6, a + 9.4, 1.04), { color: best ? best.r.b.color : '#56657E', weight: 7, opacity: best ? (best.back ? 0.35 : 0.9) : 0.25, lineCap: 'butt', interactive: !!best }).addTo(dialLayer);
      if (best) seg.bindTooltip(`${a}°–${a + 10}°: ${best.r.b.ru}${best.back ? ' (обратная сторона луча)' : ''}`, { sticky: true });
    }
    const CARD = { 0: 'С', 90: 'В', 180: 'Ю', 270: 'З' };
    for (let a = 0; a < 360; a += 30) {
      LL.marker(at(a, 1.16), { interactive: false, keyboard: false, icon: LL.divIcon({ className: 'cm-deg' + (CARD[a] != null ? ' card' : ''), html: `<span>${CARD[a] != null ? `${CARD[a]} ` : ''}${a}°</span>`, iconSize: [56, 18], iconAnchor: [28, 9] }) }).addTo(dialLayer);
    }
  }
  // address or coordinates of the reference point: coordinates are read directly, an address goes to
  // OpenStreetMap's Nominatim, first within the chosen town and then anywhere
  async function findAddress() {
    const q = $('cityAddr').value.trim(), box = $('cityAddrSuggest'), note = $('cityHereNote');
    box.hidden = true; box.innerHTML = '';
    if (!q) return;
    const m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(q);
    if (m) {
      const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { setHome(lat, lon, true, 'введённые координаты'); return; }
    }
    note.textContent = 'Ищем адрес…';
    const c = cityPlace();
    const ask = async (bounded) => {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.search = new URLSearchParams({ q, format: 'jsonv2', limit: '6', 'accept-language': 'ru', addressdetails: '0', ...(bounded ? { viewbox: `${c.lon - 0.7},${c.lat + 0.45},${c.lon + 0.7},${c.lat - 0.45}`, bounded: '1' } : {}) }).toString();
      const r = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    };
    try {
      let res = await ask(true);
      if (!res.length) res = await ask(false);
      note.textContent = res.length ? '' : 'Адрес не найден. Уточните улицу и дом или введите координаты, например 55.7558, 37.6173.';
      if (!res.length) return;
      if (res.length === 1) { const x = res[0]; setHome(+x.lat, +x.lon, true, x.display_name.split(',').slice(0, 2).join(',').trim()); return; }
      box.innerHTML = res.map((x, i) => `<li role="option" tabindex="0" data-i="${i}">${esc(x.display_name.split(',').slice(0, 4).join(','))}</li>`).join('');
      box.hidden = false;
      const pickAddr = (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; const x = res[+li.dataset.i]; box.hidden = true; setHome(+x.lat, +x.lon, true, x.display_name.split(',').slice(0, 2).join(',').trim()); };
      box.onclick = pickAddr;
      box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickAddr(e); } };
    } catch (e) {
      note.textContent = 'Поиск адреса сейчас недоступен. Поставьте точку на карте: нажмите на нужное место и выберите «Сделать точкой отсчёта», или введите координаты.';
    }
  }
  // what is at a clicked point: distance and direction from home, the nearest ray
  function pointInfo(lat, lon) {
    const h = homePt();
    const km = ACG.hav(h.lat, h.lon, lat, lon), az = bearing(h, { lat, lon });
    let best = null;
    for (const r of rays) {
      const d = Math.abs(n180(az - r.az)), d2 = Math.abs(n180(az - r.az - 180));
      if (!best || d < best.d) best = { r, d, opp: false };
      if (d2 < best.d) best = { r, d: d2, opp: true };
    }
    const txt = best && best.d <= 10
      ? `<b style="color:${best.r.b.color}">${g(best.r.b.glyph)} ${esc(best.r.b.ru)}</b>${best.opp ? ' — обратная сторона луча' : ''}, отклонение ${Math.round(best.d)}°.<br>${esc(best.opp ? 'Обратная сторона луча слабее, но тема та же.' : 'Направление: ' + LS_TEXT[best.r.id])}`
      : 'Рядом нет лучей планет (дальше 10°): нейтральное направление.';
    LL.popup({ maxWidth: 300, className: 'cm-pop' }).setLatLng([lat, lon])
      .setContent(`<div class="cm-pop-h">${kmText(km)} от точки 0° · азимут ${Math.round(az)}° ${compass(az)}</div><p>${txt}</p>
        <button type="button" class="pill cm-sethome" data-lat="${lat.toFixed(6)}" data-lon="${lon.toFixed(6)}">Сделать точкой отсчёта (0°)</button>`).openOn(map);
  }
  function pick(id) { hlId = hlId === id ? null : id; drawMap(); renderRays(); }

  /* -------------------------------- panels -------------------------------- */
  function renderRays() {
    const list = rays.slice().sort((a, b) => a.az - b.az);
    $('cityRays').innerHTML = list.map((r) => `<li data-id="${r.id}" tabindex="0"${hlId === r.id ? ' aria-current="true"' : ''}>
      <span class="cr-g" style="color:${r.b.color}">${g(r.b.glyph)}</span>
      <span class="cr-main"><b>${esc(r.b.ru)}</b> <span class="cr-az">${Math.round(r.az)}° · ${compass(r.az)}</span><small>${r.alt >= 0 ? 'над горизонтом' : 'под горизонтом'} ${num(Math.abs(r.alt), 0)}°</small>
      <span class="cr-t">${esc(LS_TEXT[r.id][0].toUpperCase() + LS_TEXT[r.id].slice(1))}</span></span></li>`).join('');
  }
  const HOUSES = () => (window.INTERP && window.INTERP.HOUSE) || [];
  function cityCharts() {
    const c = homePt(), o = app.state.natal || {}, house = o.house || 'P';
    const pts = (id) => IDS.includes(id) || id === 'Node';
    const base = N.computeNatal(app.chart, app.state.place.lat, app.state.place.lon, { house, minor: false, points: pts, anglesAspects: false });
    // the chart for the reference point itself: a few kilometres move the angles by a fraction of a degree
    const here = N.computeNatal(app.chart, c.lat, c.lon, { house, minor: false, points: pts, anglesAspects: false });
    return { base, here, sys: N.HOUSE_SYSTEMS.find((s) => s.id === here.used) };
  }
  const signText = (lon) => { const z = ACG.formatZodiac(lon); return `${g(z.glyph)} ${z.name} ${z.deg}°`; };
  function renderReloc() {
    const { base, here, sys } = cityCharts(), c = cityPlace(), h0 = homePt();
    const same = Math.abs(h0.lat - app.state.place.lat) < 0.05 && Math.abs(n180(h0.lon - app.state.place.lon)) < 0.05;
    let ascText = '';
    try {
      const sec = window.INTERP.natal(here).find((s) => s.key === 'portrait');
      const it = sec && sec.items.find((x) => x.id === 'ASC');
      if (it) ascText = it.text;
    } catch (e) { console.error(e); }
    const rows = [['Асцендент', base.asc, here.asc], ['MC', base.mc, here.mc]].map(([nm, a, b]) => `<tr><th>${nm}</th><td>${signText(a)}</td><td>${signText(b)}</td></tr>`).join('');
    const moved = IDS.map((id) => {
      const a = base.points.find((p) => p.id === id), b = here.points.find((p) => p.id === id);
      return a && b ? { p: b, from: a.house, to: b.house } : null;
    }).filter(Boolean);
    const changed = moved.filter((m) => m.from !== m.to);
    $('cityReloc').innerHTML = `${same ? '<p class="bal-note">Это место рождения: карта та же, что натальная. Выберите другой город, чтобы увидеть, что меняется.</p>' : ''}
      <table class="nat-table cr-tab"><thead><tr><th></th><th>При рождении</th><th>${esc(c.name)}, точка 0°</th></tr></thead><tbody>${rows}</tbody></table>
      ${ascText ? `<p class="cr-asc"><b>Асцендент здесь.</b> ${esc(ascText)}</p>` : ''}
      <h4 class="nat-h4">${changed.length ? 'Планеты, которые меняют дом' : 'Дома планет'}</h4>
      <div class="soul">${(changed.length ? changed : moved).map((m) => `<div class="soul-row"><span class="tg" style="color:${m.p.color}">${g(m.p.glyph)}</span><div><b>${esc(m.p.ru)}: ${changed.length ? `${RN[m.from]} → ${RN[m.to]} дом` : `${RN[m.to]} дом`}</b><p>${esc(HOUSES()[m.to] ? 'Здесь планета работает в сфере: ' + HOUSES()[m.to] + '.' : '')}</p></div></div>`).join('')}</div>
      <p class="bal-note">Дома: ${esc(sys ? sys.ru : '')}, как в натальной карте. Положения планет в знаках не меняются — меняются дома и углы.</p>`;
  }
  function renderNear() {
    const c = homePt();
    const near = ACG.linesNear(app.chart, c.lat, c.lon, 800, (id) => IDS.includes(id));
    const power = (km) => (km <= 150 ? ['сильно', 'hi'] : km <= 400 ? ['заметно', 'mid'] : ['слабо', 'lo']);
    $('cityNear').innerHTML = near.length ? near.map((x) => {
      const [pw, cls] = power(x.km);
      return `<div class="soul-row"><span class="tg" style="color:${x.body.color}">${g(x.body.glyph)}</span><div><b>${esc(x.body.ru)} ${x.angle} · ${kmText(x.km)} <span class="cn-p ${cls}">${pw}</span></b><p>${esc((MEAN[x.body.id] || {})[x.angle] || '')}</p></div></div>`;
    }).join('') : '<p class="muted">В пределах 800 км линий нет: город нейтрален для астрокартографии, больше значат дома релокационной карты и лучи на карте выше.</p>';
  }
  const BIG = () => app.cities.filter((x) => x.pop >= 150000);
  function renderGoals() {
    const c = cityPlace(), ch = app.chart, charts = [{ chart: ch, who: 'Вы' }];
    const key = ch.utcMs + '|' + ch.nodeMode;
    if (poolCache.key !== key) poolCache = { key, scores: {} };
    const city = { ru: c.name, c: c.country || '', lat: c.lat, lon: c.lon, pop: 0 };
    const rows = F.GOALS.map((goal) => {
      if (!poolCache.scores[goal.id]) poolCache.scores[goal.id] = F.scoreCities(charts, BIG(), goal.id, { keepAll: true }).map((r) => r.score).sort((a, b) => a - b);
      const pool = poolCache.scores[goal.id];
      const r = F.scoreCities(charts, [city], goal.id, { keepAll: true })[0];
      let below = 0; while (below < pool.length && pool[below] < r.score - 1e-9) below++;
      const pct = Math.round(below / pool.length * 100), top = pool[pool.length - 1] || 1;
      return { goal, r, pct, top };
    });
    $('cityGoals').innerHTML = rows.map(({ goal, r, pct, top }) => {
      const chips = r.parts.slice(0, 3).map((pt) => `<span class="lc-chip ${pt.s < 0 ? 'neg' : ''}" style="--c:${pt.body.color}"><i>${g(pt.body.glyph)}</i>${pt.angle} <small>${Math.round(pt.km)} км</small></span>`).join('');
      const note = r.score >= 0.3 ? `лучше, чем ${pct}% крупных городов` : r.score <= -0.3 ? 'линии мешают этой цели' : 'линии почти не влияют';
      return `<li><span class="cg-name">${esc(goal.ru)}<small>${note}</small></span>
        <span class="bl-chips">${chips}</span>
        <span class="bl-score"><b>${num(r.score, 1)}</b><i style="width:${Math.max(4, Math.round(Math.max(0, r.score) / top * 100))}%"></i></span></li>`;
    }).join('');
  }

  /* -------------------------------- update -------------------------------- */
  function syncControls() {
    const o = opts();
    if (document.activeElement !== $('cityPlace')) $('cityPlace').value = o.place ? app.placeLabel(o.place) : '';
    $('cityLayers').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!!o[b.dataset.k])));
    $('cityCenter').disabled = !o.home;
    // with no city chosen the tab shows the birthplace: say so, otherwise people take it for the only choice
    $('cityNote').hidden = !!o.place;
    $('cityBirth').disabled = !o.place;
  }
  function refresh(recenter) {
    if (!app || !app.chart || $('cityView').hidden) return;
    const c = cityPlace();
    rays = computeRays();
    $('cityTitle').textContent = `${c.name}${c.country ? ', ' + c.country : ''}${opts().place ? '' : ' · город рождения'}`;
    const h = homePt();
    $('citySub').textContent = `Точка отсчёта (0°) — ${opts().home ? (opts().homeName || 'ваша точка') : 'центр города'}: ${num(h.lat, 5)}°, ${num(h.lon, 5)}° · лучи — направления планет в момент вашего рождения, как их видно из этой точки; шкала вокруг неё — азимут от 0° (север) до 360°`;
    syncControls();
    if (ensureMap()) {
      if (recenter) map.setView([h.lat, h.lon], Math.max(map.getZoom(), 12));
      drawMap();
    }
    renderRays(); renderReloc(); renderNear(); renderGoals(); renderSpread();
  }
  // when every planet stood in one part of the sky at birth, all rays go one way: say so, it looks like an error
  function renderSpread() {
    const az = rays.map((r) => r.az).sort((a, b) => a - b);
    let gap = 0, after = 0;
    for (let i = 0; i < az.length; i++) { const d = n360(az[(i + 1) % az.length] - az[i]) || 360; if (d > gap) { gap = d; after = (i + 1) % az.length; } }
    const from = az[after], to = az[(after - 1 + az.length) % az.length];
    $('citySpread').textContent = gap >= 120
      ? `Все лучи идут в одну сторону, от ${compass(from)} до ${compass(to)}: в момент вашего рождения все планеты стояли в этой части неба. Это не ошибка расчёта, а особенность карты. Пунктир с другой стороны дома — продолжение тех же лучей (значок показывает, какой планеты): тема та же, но слабее.`
      : 'Пунктир — продолжение каждого луча за домом в обратную сторону (значок показывает, какой планеты): тема та же, но слабее.';
  }
  function update() { refresh(false); }
  function setPlace(p, home, name) { const o = opts(); o.place = p; o.home = home || null; o.homeName = home ? name || null : null; hlId = null; app.save(); refresh(true); }

  function init(a) {
    app = a; opts();
    app.makePlaceSearch($('cityPlace'), $('citySuggest'), () => opts().place, (p) => setPlace(p, null));
    $('cityBirth').addEventListener('click', () => setPlace(null, null));
    $('cityCenter').addEventListener('click', () => { opts().home = null; opts().homeName = null; app.save(); refresh(true); });
    $('cityHere').addEventListener('click', () => {
      if (!navigator.geolocation) { $('cityHereNote').textContent = 'Браузер не умеет определять место.'; return; }
      $('cityHereNote').textContent = 'Определяем место…';
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude, near = app.nearestCity(lat, lon);
        const p = near && near.km < 60 ? { name: near.city.ru, country: near.city.c, lat: near.city.lat, lon: near.city.lon, tz: near.city.tz } : { name: `${num(lat, 2)}°, ${num(lon, 2)}°`, country: '', lat, lon, tz: near ? near.city.tz : 'UTC' };
        $('cityHereNote').textContent = '';
        setPlace(p, { lat: +lat.toFixed(6), lon: +lon.toFixed(6) }, 'ваше местоположение');
      }, () => { $('cityHereNote').textContent = 'Не удалось определить место: разрешите доступ к геопозиции или выберите город.'; }, { timeout: 10000, maximumAge: 600000 });
    });
    $('cityAddrGo').addEventListener('click', findAddress);
    $('cityAddr').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findAddress(); } });
    $('cityMap').addEventListener('click', (e) => { const b = e.target.closest('.cm-sethome'); if (b) { e.stopPropagation(); setHome(+b.dataset.lat, +b.dataset.lon, false, 'точка на карте'); } });
    $('cityLayers').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b) return; const o = opts(); o[b.dataset.k] = !o[b.dataset.k]; app.save(); syncControls(); drawMap(); });
    const rowPick = (e) => { const li = e.target.closest('li[data-id]'); if (li) pick(li.dataset.id); };
    $('cityRays').addEventListener('click', rowPick);
    $('cityRays').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rowPick(e); } });
    $('cityToWorld').addEventListener('click', () => { const c = cityPlace(); app.focusCity({ ru: c.name, c: c.country || '', lat: c.lat, lon: c.lon }); });
  }

  // exposed for tests: the geometry has to agree with the ephemeris
  window.CityView = { init, update, _horizon: horizon, _natalSegment: natalSegment };
})();
