/* Natal chart view: SVG wheel and tables. Reads the shared app state via window.ACG_APP. */
(function () {
  'use strict';
  const ACG = window.ACG, N = window.NATAL;
  const $ = (id) => document.getElementById(id);
  const VS = '︎';
  const g = (s) => s + VS;
  const D2R = Math.PI / 180;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const ELEMENTS = ['Огонь', 'Земля', 'Воздух', 'Вода'];
  const CROSSES = ['Кардинальный', 'Фиксированный', 'Мутабельный'];
  const EL_COLOR = ['var(--el-fire)', 'var(--el-earth)', 'var(--el-air)', 'var(--el-water)'];
  const BODY = Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const DEFAULTS = { house: 'P', minor: false, nodes: true, lilith: true, fortune: true, angles: true };

  let natal = null, hl = null, app = null;

  function opts() {
    const st = app.state;
    st.natal = Object.assign({}, DEFAULTS, st.natal || {});
    return st.natal;
  }
  const visible = (id) => {
    const o = opts();
    if (id === 'Node' || id === 'SNode') return o.nodes;
    if (id === 'Lilith') return o.lilith;
    if (id === 'Fortune') return o.fortune;
    return true;
  };

  /* ------------------------------ formatting ------------------------------ */
  function pos(lon) {
    const z = ACG.formatZodiac(lon);
    return { deg: z.deg, min: z.min, glyph: z.glyph, name: z.name, text: `${z.deg}°${pad(z.min)}′` };
  }
  const orbText = (d) => { let deg = Math.floor(d), min = Math.round((d - deg) * 60); if (min === 60) { deg++; min = 0; } return `${deg}°${pad(min)}′`; };
  const fmtLat = (v) => `${Math.abs(v).toFixed(2).replace('.', ',')}° ${v >= 0 ? 'с.ш.' : 'ю.ш.'}`;
  const fmtLon = (v) => { v = n180(v); return `${Math.abs(v).toFixed(2).replace('.', ',')}° ${v >= 0 ? 'в.д.' : 'з.д.'}`; };
  const pointGlyph = (p) => p.angle ? `<span class="ang">${p.glyph}</span>` : g(p.glyph);

  /* --------------------------------- wheel -------------------------------- */
  // radii: zodiac ring, planet glyph, degree, minutes (stacked radially so neighbours never collide), house ring
  const C = 500, R_OUT = 490, R_ZIN = 420, R_GLYPH = 373, R_DEG = 331, R_MIN = 299, R_HOUT = 276, R_HIN = 240;
  function xy(lon, r) {
    const a = (180 + n360(lon - natal.asc)) * D2R;        // ASC on the left, zodiac counter-clockwise
    return [C + r * Math.cos(a), C - r * Math.sin(a)];
  }
  const f1 = (v) => v.toFixed(1);

  // spread glyphs so they don't overlap, keeping order around the circle
  function spread(points, minSep) {
    const list = points.map((p) => ({ p, a: n360(p.lon) })).sort((x, y) => x.a - y.a);
    const n = list.length;
    if (n < 2) return list.map((x) => ({ p: x.p, d: x.a }));
    const d = list.map((x) => x.a);
    for (let it = 0; it < 200; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        let gap = d[j] - d[i];
        if (j === 0) gap += 360;
        if (gap < minSep) { const push = (minSep - gap) / 2 + 0.01; d[i] -= push; d[j] += push; moved = true; }
      }
      if (!moved) break;
    }
    return list.map((x, i) => ({ p: x.p, d: d[i] }));
  }

  function renderWheel() {
    const o = [];
    // zodiac ring
    o.push(`<circle cx="${C}" cy="${C}" r="${R_OUT}" class="w-ring-out"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${R_ZIN}" class="w-inner"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${R_ZIN}" class="w-ring"/>`);
    for (let s = 0; s < 12; s++) {
      const a0 = s * 30, el = s % 4;
      // tinted sector
      const p1 = xy(a0, R_OUT), p2 = xy(a0 + 30, R_OUT), p3 = xy(a0 + 30, R_ZIN), p4 = xy(a0, R_ZIN);
      o.push(`<path d="M${f1(p1[0])} ${f1(p1[1])} A${R_OUT} ${R_OUT} 0 0 0 ${f1(p2[0])} ${f1(p2[1])} L${f1(p3[0])} ${f1(p3[1])} A${R_ZIN} ${R_ZIN} 0 0 1 ${f1(p4[0])} ${f1(p4[1])}Z" style="fill:${EL_COLOR[el]}" class="w-sector"/>`);
      const b = xy(a0, R_OUT), e = xy(a0, R_ZIN);
      o.push(`<line x1="${f1(b[0])}" y1="${f1(b[1])}" x2="${f1(e[0])}" y2="${f1(e[1])}" class="w-ring"/>`);
      const c = xy(a0 + 15, (R_OUT + R_ZIN) / 2);
      o.push(`<text x="${f1(c[0])}" y="${f1(c[1])}" class="w-sign" style="fill:${EL_COLOR[el]}">${g(ACG.SIGNS[s][0])}</text>`);
    }
    // degree ticks
    let ticks = '';
    for (let dgr = 0; dgr < 360; dgr++) {
      const len = dgr % 10 === 0 ? 15 : dgr % 5 === 0 ? 10 : 5;
      const a = xy(dgr, R_ZIN), b = xy(dgr, R_ZIN - len);
      ticks += `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
    }
    o.push(`<path d="${ticks}" class="w-tick"/>`);
    // house ring and cusps
    o.push(`<circle cx="${C}" cy="${C}" r="${R_HOUT}" class="w-ring-soft"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${R_HIN}" class="w-ring-soft"/>`);
    for (let h = 1; h <= 12; h++) {
      const cu = natal.cusps[h], axis = h === 1 || h === 4 || h === 7 || h === 10;
      const a = xy(cu, R_HIN), b = xy(cu, R_ZIN);
      o.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="${axis ? 'w-axis' : 'w-cusp'}"/>`);
      const next = natal.cusps[h === 12 ? 1 : h + 1];
      const mid = cu + n360(next - cu) / 2, m = xy(mid, (R_HOUT + R_HIN) / 2);
      o.push(`<text x="${f1(m[0])}" y="${f1(m[1])}" class="w-hnum">${h}</text>`);
    }
    // axis labels outside the zodiac
    for (const [lon, lab] of [[natal.asc, 'ASC'], [natal.mc, 'MC'], [natal.asc + 180, 'DSC'], [natal.mc + 180, 'IC']]) {
      const a = xy(lon, R_OUT), b = xy(lon, R_OUT + 16), t = xy(lon, R_OUT + 36);
      o.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="w-axis"/>`);
      o.push(`<text x="${f1(t[0])}" y="${f1(t[1])}" class="w-axlab">${lab}</text>`);
    }
    // aspects
    const asp = [];
    for (const x of natal.aspects) {
      if (x.asp.a === 0) continue;
      const a = xy(x.A.lon, R_HIN), b = xy(x.B.lon, R_HIN);
      const dim = hl && x.A.id !== hl && x.B.id !== hl;
      const k = x.asp.kind;
      const w = Math.max(0.8, 3 * (1 - x.orb / x.maxOrb)) + (k === 'minor' ? 0 : 0.6);
      asp.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="w-asp w-asp-${k}${dim ? ' dim' : ''}" stroke-width="${w.toFixed(2)}"/>`);
    }
    o.push(`<g>${asp.join('')}</g>`);
    // planets
    const pts = natal.points.filter((p) => visible(p.id));
    const lay = spread(pts, 8);
    for (const { p, d } of lay) {
      const t1 = xy(p.lon, R_ZIN), t2 = xy(p.lon, R_ZIN - 16), gp = xy(d, R_GLYPH), dp = xy(d, R_DEG), mp = xy(d, R_MIN), cp = xy(d, R_GLYPH + 25);
      const dim = hl && hl !== p.id && !natal.aspects.some((x) => (x.A.id === hl && x.B.id === p.id) || (x.B.id === hl && x.A.id === p.id));
      const ps = pos(p.lon);
      o.push(`<g class="w-pt${dim ? ' dim' : ''}${hl === p.id ? ' on' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.ru)} ${ps.text} ${ps.name}, дом ${RN[p.house]}">
        <line x1="${f1(t1[0])}" y1="${f1(t1[1])}" x2="${f1(t2[0])}" y2="${f1(t2[1])}" stroke="${p.color}" class="w-ptick"/>
        <line x1="${f1(t2[0])}" y1="${f1(t2[1])}" x2="${f1(cp[0])}" y2="${f1(cp[1])}" stroke="${p.color}" class="w-conn"/>
        <circle cx="${f1(gp[0])}" cy="${f1(gp[1])}" r="28" class="w-hit"/>
        <text x="${f1(gp[0])}" y="${f1(gp[1])}" class="w-planet" style="fill:${p.color}">${g(p.glyph)}</text>
        <text x="${f1(dp[0])}" y="${f1(dp[1])}" class="w-deg">${ps.deg}°</text>
        <text x="${f1(mp[0])}" y="${f1(mp[1])}" class="w-min">${pad(ps.min)}′${p.retro ? '<tspan class="w-rx">R</tspan>' : ''}</text>
      </g>`);
      const e = xy(p.lon, R_HIN);
      o.push(`<circle cx="${f1(e[0])}" cy="${f1(e[1])}" r="3.2" fill="${p.color}" class="w-dot${dim ? ' dim' : ''}"/>`);
    }
    $('wheel').innerHTML = o.join('');
  }

  /* -------------------------------- tables -------------------------------- */
  const signCell = (lon) => { const ps = pos(lon); return `<span class="pos">${ps.text}</span> <span class="sg" title="${ps.name}">${g(ps.glyph)}</span> <span class="sgn">${ps.name}</span>`; };
  const DIGN_CLASS = { dom: 'good', exalt: 'good', det: 'bad', fall: 'bad' };
  const DIGN_SHORT = { dom: 'обит.', exalt: 'экз.', det: 'изгн.', fall: 'пад.' };

  function renderPlanets() {
    const rows = natal.points.filter((p) => visible(p.id)).map((p) => `
      <tr data-id="${p.id}" class="${hl === p.id ? 'on' : ''}">
        <td class="gl" style="color:${p.color}">${pointGlyph(p)}</td>
        <td class="nm">${esc(p.ru)}${p.retro ? ' <span class="rx" title="ретроградный">R</span>' : ''}</td>
        <td class="ps">${signCell(p.lon)}</td>
        <td class="hs">${RN[p.house]}</td>
        <td class="dg">${p.dign.map((d) => `<span class="tag ${DIGN_CLASS[d.k]}" title="${d.ru}"><span class="l">${d.ru}</span><span class="s">${DIGN_SHORT[d.k]}</span></span>`).join(' ')}</td>
      </tr>`).join('');
    $('natPlanets').innerHTML = `<thead><tr><th colspan="2">Планета</th><th>Положение</th><th>Дом</th><th class="dg"><span class="l">Достоинство</span><span class="s">Дост.</span></th></tr></thead><tbody>${rows}</tbody>`;
  }

  function renderHouses() {
    const rows = [];
    for (let h = 1; h <= 12; h++) {
      const s = Math.floor(n360(natal.cusps[h]) / 30);
      const rul = N.RULERS[s].map((id) => `<span style="color:${BODY[id].color}" title="${BODY[id].ru}">${g(BODY[id].glyph)}</span>`).join(' ');
      const lab = h === 1 ? ' <small>ASC</small>' : h === 4 ? ' <small>IC</small>' : h === 7 ? ' <small>DSC</small>' : h === 10 ? ' <small>MC</small>' : '';
      rows.push(`<tr><td class="hs">${RN[h]}${lab}</td><td class="ps">${signCell(natal.cusps[h])}</td><td class="ru">${rul}</td></tr>`);
    }
    $('natHouses').innerHTML = `<thead><tr><th>Дом</th><th>Куспид</th><th>Управитель</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  }

  function renderAspects() {
    const pts = natal.points.filter((p) => visible(p.id) && !p.noAspects).concat(opts().angles ? natal.angles : []);
    const idx = (p) => pts.findIndex((q) => q.id === p.id);
    const M = {};
    for (const x of natal.aspects) { const i = idx(x.A), j = idx(x.B); if (i < 0 || j < 0) continue; M[Math.max(i, j) + ':' + Math.min(i, j)] = x; }
    // triangular aspectarian: the point's glyph sits on the diagonal
    let body = '';
    for (let i = 0; i < pts.length; i++) {
      let cells = '';
      for (let j = 0; j < i; j++) {
        const x = M[i + ':' + j];
        cells += x ? `<td class="ag ag-${x.asp.kind}" title="${esc(x.A.ru)} ${x.asp.ru.toLowerCase()} ${esc(x.B.ru)}, орб ${orbText(x.orb)}">${g(x.asp.glyph)}<small>${Math.round(x.orb)}°</small></td>` : '<td class="ag-e"></td>';
      }
      body += `<tr>${cells}<th class="ag-diag" style="color:${pts[i].color || 'var(--brass)'}" title="${esc(pts[i].ru)}">${pointGlyph(pts[i])}</th></tr>`;
    }
    $('natAspGrid').innerHTML = `<tbody>${body}</tbody>`;
    const list = natal.aspects.filter((x) => idx(x.A) >= 0 && idx(x.B) >= 0);
    $('natAspCount').textContent = `${list.length} ${plural(list.length, 'аспект', 'аспекта', 'аспектов')}`;
    $('natAspList').innerHTML = list.map((x) => `
      <li class="${hl && x.A.id !== hl && x.B.id !== hl ? 'dim' : ''}">
        <span class="al-p" style="color:${x.A.color || 'var(--brass)'}">${pointGlyph(x.A)}</span>
        <span class="al-a ag-${x.asp.kind}">${g(x.asp.glyph)}</span>
        <span class="al-p" style="color:${x.B.color || 'var(--brass)'}">${pointGlyph(x.B)}</span>
        <span class="al-t">${esc(x.A.ru)} — ${esc(x.B.ru)}: ${x.asp.ru.toLowerCase()}</span>
        <span class="al-o">${orbText(x.orb)}${x.applying == null ? '' : x.applying ? ' <abbr title="сходящийся">сх</abbr>' : ' <abbr title="расходящийся">рх</abbr>'}</span>
      </li>`).join('');
  }

  function renderBalance() {
    const planets = natal.points.filter((p) => p.planet);
    const block = (names, key, colors) => names.map((nm, i) => {
      const ps = planets.filter((p) => p.sign % key === i);
      return `<div class="bal-row"><span class="bal-n"${colors ? ` style="color:${colors[i]}"` : ''}>${nm}</span><span class="bal-c">${ps.length}</span><span class="bal-g">${ps.map((p) => `<span style="color:${p.color}" title="${esc(p.ru)}">${g(p.glyph)}</span>`).join('')}</span></div>`;
    }).join('');
    $('natBalance').innerHTML = `<div class="bal">${block(ELEMENTS, 4, EL_COLOR)}</div><div class="bal">${block(CROSSES, 3, null)}</div>
      <p class="bal-note">${natal.isDay ? 'Дневная карта: Солнце над горизонтом.' : 'Ночная карта: Солнце под горизонтом.'} Считаются 10 планет.</p>`;
  }
  function plural(n, one, few, many) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; }

  function renderHead() {
    const st = app.state, P = st.place, conv = app.conv;
    const [y, m, d] = st.date.split('-').map(Number);
    const sys = N.HOUSE_SYSTEMS.find((s) => s.id === natal.used);
    $('natTitle').textContent = `${d} ${MONTHS[m - 1]} ${y} · ${st.time} · ${P.name}`;
    const u = new Date(conv.utc);
    const off = conv.offset, sgn = off < 0 ? '−' : '+';
    $('natSub').textContent = `${fmtLat(P.lat)} · ${fmtLon(P.lon)} · UTC ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())} (${sgn}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}) · дома: ${sys.ru}`;
    $('natNote').textContent = natal.note;
    $('natNote').hidden = !natal.note;
  }

  /* ------------------------------- controls ------------------------------- */
  function initControls() {
    const o = opts();
    const sel = $('natHouse');
    sel.innerHTML = N.HOUSE_SYSTEMS.map((s) => `<option value="${s.id}">${s.ru}</option>`).join('');
    sel.value = o.house;
    sel.addEventListener('change', () => { opts().house = sel.value; changed(); });
    const syncSeg = () => {
      const q = opts();
      $('natAspMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'minor') === !!q.minor)));
      $('natPts').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!!q[b.dataset.p])));
    };
    syncSeg();
    $('natAspMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().minor = b.dataset.m === 'minor'; syncSeg(); changed(); });
    $('natPts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.p; opts()[k] = !opts()[k]; syncSeg(); changed(); });
    // highlight a point's aspects from the wheel or the table
    const pick = (id) => { hl = hl === id ? null : id; renderWheel(); renderPlanets(); renderAspects(); };
    $('wheel').addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); pick(el ? el.dataset.id : null); });
    $('wheel').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.id) { e.preventDefault(); pick(e.target.dataset.id); } });
    $('natPlanets').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr.dataset.id); });
  }
  function changed() { app.save(); update(); }

  /* -------------------------------- update -------------------------------- */
  function update() {
    if (!app || !app.chart || $('natalView').hidden) return;
    const o = opts(), P = app.state.place;
    natal = N.computeNatal(app.chart, P.lat, P.lon, { house: o.house, minor: o.minor, points: visible, anglesAspects: o.angles });
    if (hl && !natal.points.some((p) => p.id === hl && visible(p.id))) hl = null;
    renderHead(); renderWheel(); renderPlanets(); renderHouses(); renderAspects(); renderBalance();
  }

  window.NatalView = {
    init(a) { app = a; opts(); initControls(); },
    update,
  };
})();
