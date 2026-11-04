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
    return fill(st.city || (st.city = {}), { place: null, home: null, ls: true, natal: true, acg: true });
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
  let labelLayer = null;
  function drawLabels() {
    if (!map) return;
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
      homeMarker = LL.marker([h.lat, h.lon], { draggable: true, keyboard: true, title: 'Ваш дом: перетащите', icon: LL.divIcon({ className: 'cm-home', html: '<span>⌂</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
      homeMarker.on('dragend', () => { const ll = homeMarker.getLatLng(); opts().home = { lat: +ll.lat.toFixed(5), lon: +ll.lng.toFixed(5) }; app.save(); refresh(false); });
    }
    drawLabels();
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
      .setContent(`<div class="cm-pop-h">${kmText(km)} от дома · ${Math.round(az)}° ${compass(az)}</div><p>${txt}</p>`).openOn(map);
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
    const c = cityPlace(), o = app.state.natal || {}, house = o.house || 'P';
    const pts = (id) => IDS.includes(id) || id === 'Node';
    const base = N.computeNatal(app.chart, app.state.place.lat, app.state.place.lon, { house, minor: false, points: pts, anglesAspects: false });
    const here = N.computeNatal(app.chart, c.lat, c.lon, { house, minor: false, points: pts, anglesAspects: false });
    return { base, here, sys: N.HOUSE_SYSTEMS.find((s) => s.id === here.used) };
  }
  const signText = (lon) => { const z = ACG.formatZodiac(lon); return `${g(z.glyph)} ${z.name} ${z.deg}°`; };
  function renderReloc() {
    const { base, here, sys } = cityCharts(), c = cityPlace();
    const same = Math.abs(c.lat - app.state.place.lat) < 0.05 && Math.abs(n180(c.lon - app.state.place.lon)) < 0.05;
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
      <table class="nat-table cr-tab"><thead><tr><th></th><th>При рождении</th><th>${esc(c.name)}</th></tr></thead><tbody>${rows}</tbody></table>
      ${ascText ? `<p class="cr-asc"><b>Асцендент здесь.</b> ${esc(ascText)}</p>` : ''}
      <h4 class="nat-h4">${changed.length ? 'Планеты, которые меняют дом' : 'Дома планет'}</h4>
      <div class="soul">${(changed.length ? changed : moved).map((m) => `<div class="soul-row"><span class="tg" style="color:${m.p.color}">${g(m.p.glyph)}</span><div><b>${esc(m.p.ru)}: ${changed.length ? `${RN[m.from]} → ${RN[m.to]} дом` : `${RN[m.to]} дом`}</b><p>${esc(HOUSES()[m.to] ? 'Здесь планета работает в сфере: ' + HOUSES()[m.to] + '.' : '')}</p></div></div>`).join('')}</div>
      <p class="bal-note">Дома: ${esc(sys ? sys.ru : '')}, как в натальной карте. Положения планет в знаках не меняются — меняются дома и углы.</p>`;
  }
  function renderNear() {
    const c = cityPlace();
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
    $('citySub').textContent = `Дом: ${num(h.lat, 4)}°, ${num(h.lon, 4)}° · лучи — направления планет в момент вашего рождения, как их видно из этой точки`;
    syncControls();
    if (ensureMap()) {
      if (recenter) map.setView([h.lat, h.lon], Math.max(map.getZoom(), 12));
      drawMap();
    }
    renderRays(); renderReloc(); renderNear(); renderGoals();
  }
  function update() { refresh(false); }
  function setPlace(p, home) { const o = opts(); o.place = p; o.home = home || null; hlId = null; app.save(); refresh(true); }

  function init(a) {
    app = a; opts();
    app.makePlaceSearch($('cityPlace'), $('citySuggest'), () => opts().place, (p) => setPlace(p, null));
    $('cityBirth').addEventListener('click', () => setPlace(null, null));
    $('cityCenter').addEventListener('click', () => { opts().home = null; app.save(); refresh(true); });
    $('cityHere').addEventListener('click', () => {
      if (!navigator.geolocation) { $('cityHereNote').textContent = 'Браузер не умеет определять место.'; return; }
      $('cityHereNote').textContent = 'Определяем место…';
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude, near = app.nearestCity(lat, lon);
        const p = near && near.km < 60 ? { name: near.city.ru, country: near.city.c, lat: near.city.lat, lon: near.city.lon, tz: near.city.tz } : { name: `${num(lat, 2)}°, ${num(lon, 2)}°`, country: '', lat, lon, tz: near ? near.city.tz : 'UTC' };
        $('cityHereNote').textContent = '';
        setPlace(p, { lat: +lat.toFixed(5), lon: +lon.toFixed(5) });
      }, () => { $('cityHereNote').textContent = 'Не удалось определить место: разрешите доступ к геопозиции или выберите город.'; }, { timeout: 10000, maximumAge: 600000 });
    });
    $('cityLayers').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b) return; const o = opts(); o[b.dataset.k] = !o[b.dataset.k]; app.save(); syncControls(); drawMap(); });
    const rowPick = (e) => { const li = e.target.closest('li[data-id]'); if (li) pick(li.dataset.id); };
    $('cityRays').addEventListener('click', rowPick);
    $('cityRays').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rowPick(e); } });
    $('cityToWorld').addEventListener('click', () => { const c = cityPlace(); app.focusCity({ ru: c.name, c: c.country || '', lat: c.lat, lon: c.lon }); });
  }

  // exposed for tests: the geometry has to agree with the ephemeris
  window.CityView = { init, update, _horizon: horizon, _natalSegment: natalSegment };
})();
