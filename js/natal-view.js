/* Natal chart view: natal, solar return and compatibility (synastry, composite).
   SVG wheel and tables. Reads the shared app state via the object passed to init(). */
(function () {
  'use strict';
  const ACG = window.ACG, N = window.NATAL, F = window.FEAT, H = window.HORARY;
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
  const DEFAULTS = { house: 'P', minor: false, nodes: true, chiron: true, lilith: true, fortune: true, angles: true, asteroids: false, mode: 'natal', syn: 'syn' };
  const ASTEROIDS = ['Ceres', 'Pallas', 'Juno', 'Vesta'];

  let natal = null;     // the chart drawn as the main wheel (natal, solar or composite)
  let outer = null;     // partner's points in the outer ring (synastry)
  let cross = [];       // synastry aspects
  let hl = null, app = null, solarInfo = null, natB = null, natBase = null, horInfo = null, horCache = null;

  function opts() {
    const st = app.state;
    st.natal = Object.assign({}, DEFAULTS, st.natal || {});
    return st.natal;
  }
  function solarOpts() {
    const st = app.state;
    st.solar = Object.assign({ year: null, place: null }, st.solar || {});
    return st.solar;
  }
  const HOR_POINTS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Node', 'SNode', 'Fortune'];
  function horOpts() {
    const st = app.state;
    st.horary = Object.assign({ date: null, time: null, place: null, q: '', base: 1, rel: 7 }, st.horary || {});
    return st.horary;
  }
  const visible = (id) => {
    const o = opts();
    if (o.mode === 'horary') return HOR_POINTS.includes(id);
    if (id === 'Node' || id === 'SNode') return o.nodes;
    if (id === 'Lilith') return o.lilith;
    if (id === 'Chiron') return o.chiron;
    if (ASTEROIDS.includes(id)) return o.asteroids;
    if (id === 'Fortune') return o.fortune;
    return true;
  };
  const partnerName = () => (app.state.partner && app.state.partner.name) || 'Партнёр';

  /* ------------------------------ formatting ------------------------------ */
  // degrees, minutes and seconds within the sign (truncated like Sotis, never rounded up into the next sign)
  function pos(lon) {
    const L = n360(lon), sign = Math.floor(L / 30), totalSec = Math.floor((L - sign * 30) * 3600 + 1e-6);
    const deg = Math.floor(totalSec / 3600), min = Math.floor(totalSec / 60) % 60, sec = totalSec % 60;
    return { deg, min, sec, glyph: ACG.SIGNS[sign][0], name: ACG.SIGNS[sign][1], text: `${deg}°${pad(min)}′` };
  }
  const orbText = (d) => { let deg = Math.floor(d), min = Math.round((d - deg) * 60); if (min === 60) { deg++; min = 0; } return `${deg}°${pad(min)}′`; };
  const dm = (v) => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60); return m === 60 ? `${d + 1}°00′` : `${d}°${pad(m)}′`; };
  const fmtLat = (v) => `${dm(v)} ${v >= 0 ? 'с.ш.' : 'ю.ш.'}`;
  const fmtLon = (v) => { v = n180(v); return `${dm(v)} ${v >= 0 ? 'в.д.' : 'з.д.'}`; };
  const pointGlyph = (p) => p.angle ? `<span class="ang">${p.glyph}</span>` : g(p.glyph);
  const localTime = (ms, tz) => {
    const off = ACG.tzOffsetMin(tz || 'UTC', ms), d = new Date(ms + off * 60000);
    return { text: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, off };
  };
  const offText = (off) => `UTC${off < 0 ? '−' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  function plural(n, one, few, many) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; }

  /* --------------------------------- wheel -------------------------------- */
  const C = 500, R_OUT = 490, R_ZIN = 420;
  const LAY1 = { glyph: 373, deg: 331, min: 299, hout: 276, hin: 240 };
  const LAY2 = { oglyph: 392, odeg: 359, sep: 338, glyph: 312, deg: 279, min: null, hout: 258, hin: 224 };
  function xy(lon, r) {
    const a = (180 + n360(lon - natal.asc)) * D2R;        // ASC on the left, zodiac counter-clockwise
    return [C + r * Math.cos(a), C - r * Math.sin(a)];
  }
  const f1 = (v) => v.toFixed(1);
  const line = (a, b, cls, extra) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="${cls}"${extra || ''}/>`;

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
  const related = (id, other) => {
    const list = outer ? cross : natal.aspects;
    return list.some((x) => (x.A.id === id && x.B.id === other) || (x.B.id === id && x.A.id === other));
  };

  function renderWheel() {
    const L = outer ? LAY2 : LAY1;
    const o = [];
    o.push(`<circle cx="${C}" cy="${C}" r="${R_OUT}" class="w-ring-out"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${R_ZIN}" class="w-inner"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${R_ZIN}" class="w-ring"/>`);
    for (let s = 0; s < 12; s++) {
      const a0 = s * 30, el = s % 4;
      const p1 = xy(a0, R_OUT), p2 = xy(a0 + 30, R_OUT), p3 = xy(a0 + 30, R_ZIN), p4 = xy(a0, R_ZIN);
      o.push(`<path d="M${f1(p1[0])} ${f1(p1[1])} A${R_OUT} ${R_OUT} 0 0 0 ${f1(p2[0])} ${f1(p2[1])} L${f1(p3[0])} ${f1(p3[1])} A${R_ZIN} ${R_ZIN} 0 0 1 ${f1(p4[0])} ${f1(p4[1])}Z" style="fill:${EL_COLOR[el]}" class="w-sector"/>`);
      o.push(line(xy(a0, R_OUT), xy(a0, R_ZIN), 'w-ring'));
      const c = xy(a0 + 15, (R_OUT + R_ZIN) / 2);
      o.push(`<text x="${f1(c[0])}" y="${f1(c[1])}" class="w-sign" style="fill:${EL_COLOR[el]}">${g(ACG.SIGNS[s][0])}</text>`);
    }
    let ticks = '';
    for (let dgr = 0; dgr < 360; dgr++) {
      const len = dgr % 10 === 0 ? 15 : dgr % 5 === 0 ? 10 : 5;
      const a = xy(dgr, R_ZIN), b = xy(dgr, R_ZIN - len);
      ticks += `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
    }
    o.push(`<path d="${ticks}" class="w-tick"/>`);
    if (outer) o.push(`<circle cx="${C}" cy="${C}" r="${L.sep}" class="w-ring-soft"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${L.hout}" class="w-ring-soft"/>`);
    o.push(`<circle cx="${C}" cy="${C}" r="${L.hin}" class="w-ring-soft"/>`);
    for (let h = 1; h <= 12; h++) {
      const cu = natal.cusps[h], axis = h === 1 || h === 4 || h === 7 || h === 10;
      o.push(line(xy(cu, L.hin), xy(cu, R_ZIN), axis ? 'w-axis' : 'w-cusp'));
      const next = natal.cusps[h === 12 ? 1 : h + 1];
      const m = xy(cu + n360(next - cu) / 2, (L.hout + L.hin) / 2);
      o.push(`<text x="${f1(m[0])}" y="${f1(m[1])}" class="w-hnum">${h}</text>`);
    }
    for (const [lon, lab] of [[natal.asc, 'ASC'], [natal.mc, 'MC'], [natal.asc + 180, 'DSC'], [natal.mc + 180, 'IC']]) {
      o.push(line(xy(lon, R_OUT), xy(lon, R_OUT + 16), 'w-axis'));
      const t = xy(lon, R_OUT + 36);
      o.push(`<text x="${f1(t[0])}" y="${f1(t[1])}" class="w-axlab">${lab}</text>`);
    }
    // aspects: within the chart, or between the two charts in synastry
    const asp = [];
    for (const x of outer ? cross : natal.aspects) {
      if (x.asp.a === 0) continue;
      const dim = hl && x.A.id !== hl && x.B.id !== hl;
      const k = x.asp.kind;
      const w = Math.max(0.8, 3 * (1 - x.orb / x.maxOrb)) + (k === 'minor' ? 0 : 0.6);
      asp.push(line(xy(x.A.lon, L.hin), xy(x.B.lon, L.hin), `w-asp w-asp-${k}${dim ? ' dim' : ''}`, ` stroke-width="${w.toFixed(2)}"`));
    }
    o.push(`<g>${asp.join('')}</g>`);
    // inner planets (the main chart)
    const pts = natal.points.filter((p) => visible(p.id));
    for (const { p, d } of spread(pts, outer ? 9 : 8)) {
      const dim = hl && hl !== p.id && !related(hl, p.id);
      const ps = pos(p.lon);
      const t1 = outer ? xy(p.lon, L.sep) : xy(p.lon, R_ZIN), t2 = outer ? xy(p.lon, L.sep - 12) : xy(p.lon, R_ZIN - 16);
      const gp = xy(d, L.glyph), dp = xy(d, L.deg), cp = xy(d, L.glyph + 24);
      o.push(`<g class="w-pt${dim ? ' dim' : ''}${hl === p.id ? ' on' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.ru)} ${ps.text} ${ps.name}, дом ${RN[p.house]}">
        ${line(t1, t2, 'w-ptick', ` stroke="${p.color}"`)}${line(t2, cp, 'w-conn', ` stroke="${p.color}"`)}
        <circle cx="${f1(gp[0])}" cy="${f1(gp[1])}" r="26" class="w-hit"/>
        <text x="${f1(gp[0])}" y="${f1(gp[1])}" class="w-planet" style="fill:${p.color}">${g(p.glyph)}</text>
        ${L.min ? `<text x="${f1(dp[0])}" y="${f1(dp[1])}" class="w-deg">${ps.deg}°</text>
        <text x="${f1(xy(d, L.min)[0])}" y="${f1(xy(d, L.min)[1])}" class="w-min">${pad(ps.min)}′${p.retro ? '<tspan class="w-rx">R</tspan>' : ''}</text>`
        : `<text x="${f1(dp[0])}" y="${f1(dp[1])}" class="w-deg w-deg-s">${ps.deg}°${pad(ps.min)}${p.retro ? '<tspan class="w-rx">R</tspan>' : ''}</text>`}
      </g>`);
      const e = xy(p.lon, L.hin);
      o.push(`<circle cx="${f1(e[0])}" cy="${f1(e[1])}" r="3.2" fill="${p.color}" class="w-dot${dim ? ' dim' : ''}"/>`);
    }
    // outer ring: partner's planets
    if (outer) {
      for (const { p, d } of spread(outer, 8.5)) {
        const key = p.id;
        const dim = hl && hl !== key && !related(hl, key);
        const ps = pos(p.lon);
        const gp = xy(d, L.oglyph), dp = xy(d, L.odeg);
        o.push(`<g class="w-pt w-outer${dim ? ' dim' : ''}${hl === key ? ' on' : ''}" data-id="${key}" tabindex="0" role="button" aria-label="${esc(partnerName())}: ${esc(p.ru)} ${ps.text} ${ps.name}">
          ${line(xy(p.lon, R_ZIN), xy(p.lon, R_ZIN - 10), 'w-ptick', ` stroke="${p.color}"`)}
          <circle cx="${f1(gp[0])}" cy="${f1(gp[1])}" r="22" class="w-hit"/>
          <text x="${f1(gp[0])}" y="${f1(gp[1])}" class="w-planet w-planet-o" style="fill:${p.color}">${g(p.glyph)}</text>
          <text x="${f1(dp[0])}" y="${f1(dp[1])}" class="w-deg w-deg-s">${ps.deg}°${pad(ps.min)}${p.retro ? '<tspan class="w-rx">R</tspan>' : ''}</text>
        </g>`);
        const e = xy(p.lon, L.hin);
        o.push(`<circle cx="${f1(e[0])}" cy="${f1(e[1])}" r="3.4" fill="none" stroke="${p.color}" stroke-width="1.6" class="w-dot${dim ? ' dim' : ''}"/>`);
      }
    }
    $('wheel').innerHTML = o.join('');
  }

  /* -------------------------------- tables -------------------------------- */
  const signCell = (lon) => { const ps = pos(lon); return `<span class="pos">${ps.text}<span class="sec">${pad(ps.sec)}″</span></span> <span class="sg" title="${ps.name}">${g(ps.glyph)}</span> <span class="sgn">${ps.name}</span>`; };
  const DIGN_CLASS = { dom: 'good', exalt: 'good', det: 'bad', fall: 'bad' };
  const DIGN_SHORT = { dom: 'обит.', exalt: 'экз.', det: 'изгн.', fall: 'пад.' };

  function renderPlanets() {
    const rows = natal.points.filter((p) => visible(p.id)).map((p) => `
      <tr data-id="${p.id}" class="${hl === p.id ? 'on' : ''}">
        <td class="gl" style="color:${p.color}">${pointGlyph(p)}</td>
        <td class="nm">${esc(p.ru)}${p.retro ? ' <span class="rx" title="ретроградный">R</span>' : ''}</td>
        <td class="ps">${signCell(p.lon)}</td>
        <td class="hs">${RN[p.house]}</td>
        <td class="dg">${(p.dign || []).map((d) => `<span class="tag ${DIGN_CLASS[d.k]}" title="${d.ru}"><span class="l">${d.ru}</span><span class="s">${DIGN_SHORT[d.k]}</span></span>`).join(' ')}</td>
      </tr>`).join('');
    $('natPlanets').innerHTML = `<thead><tr><th colspan="2">Планета</th><th>Положение</th><th>Дом</th><th class="dg"><span class="l">Достоинство</span><span class="s">Дост.</span></th></tr></thead><tbody>${rows}</tbody>`;
    // partner's planets: own house and the house of your chart they fall into
    const card = $('natPartnerCard');
    card.hidden = !outer;
    if (outer) {
      $('natPartnerTitle').textContent = `Планеты: ${partnerName()}`;
      $('natPartner').innerHTML = `<thead><tr><th colspan="2">Планета</th><th>Положение</th><th title="дом в собственной карте">Свой дом</th><th title="в какой ваш дом попадает">В ваших домах</th></tr></thead><tbody>${outer.map((p) => `
        <tr data-id="${p.id}" class="${hl === p.id ? 'on' : ''}">
          <td class="gl" style="color:${p.color}">${g(p.glyph)}</td>
          <td class="nm">${esc(p.ru)}${p.retro ? ' <span class="rx">R</span>' : ''}</td>
          <td class="ps">${signCell(p.lon)}</td>
          <td class="hs">${RN[p.house]}</td>
          <td class="hs">${RN[N.houseOf(p.lon, natal.cusps)]}</td>
        </tr>`).join('')}</tbody>`;
    }
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

  const aspItem = (x, nameA, nameB) => `
      <li class="${hl && x.A.id !== hl && x.B.id !== hl ? 'dim' : ''}">
        <span class="al-p" style="color:${x.A.color || 'var(--brass)'}">${pointGlyph(x.A)}</span>
        <span class="al-a ag-${x.asp.kind}">${g(x.asp.glyph)}</span>
        <span class="al-p" style="color:${x.B.color || 'var(--brass)'}">${pointGlyph(x.B)}</span>
        <span class="al-t">${nameA}${esc(x.A.ru)} — ${nameB}${esc(x.B.ru)}: ${x.asp.ru.toLowerCase()}</span>
        <span class="al-o">${orbText(x.orb)}${x.applying == null ? '' : x.applying ? ' <abbr title="сходящийся">сх</abbr>' : ' <abbr title="расходящийся">рх</abbr>'}</span>
      </li>`;
  const aspCell = (x, nmA, nmB) => x ? `<td class="ag ag-${x.asp.kind}" title="${esc(nmA)} ${x.asp.ru.toLowerCase()} ${esc(nmB)}, орб ${orbText(x.orb)}">${g(x.asp.glyph)}<small>${Math.round(x.orb)}°</small></td>` : '<td class="ag-e"></td>';

  function renderAspects() {
    if (outer) return renderCrossAspects();
    const pts = natal.points.filter((p) => visible(p.id) && !p.noAspects).concat(opts().angles && opts().mode !== 'horary' ? natal.angles : []);
    const idx = (p) => pts.findIndex((q) => q.id === p.id);
    const M = {};
    for (const x of natal.aspects) { const i = idx(x.A), j = idx(x.B); if (i < 0 || j < 0) continue; M[Math.max(i, j) + ':' + Math.min(i, j)] = x; }
    let body = '';
    for (let i = 0; i < pts.length; i++) {
      let cells = '';
      for (let j = 0; j < i; j++) { const x = M[i + ':' + j]; cells += aspCell(x, x ? x.A.ru : '', x ? x.B.ru : ''); }
      body += `<tr>${cells}<th class="ag-diag" style="color:${pts[i].color || 'var(--brass)'}" title="${esc(pts[i].ru)}">${pointGlyph(pts[i])}</th></tr>`;
    }
    $('natAspGrid').innerHTML = `<tbody>${body}</tbody>`;
    const list = natal.aspects.filter((x) => idx(x.A) >= 0 && idx(x.B) >= 0);
    $('natAspTitle').firstChild.textContent = 'Аспекты ';
    $('natAspCount').textContent = `${list.length} ${plural(list.length, 'аспект', 'аспекта', 'аспектов')}`;
    $('natAspList').innerHTML = list.map((x) => aspItem(x, '', '')).join('');
  }
  // rectangular grid: your points down, partner's points across
  function renderCrossAspects() {
    const rowsP = natal.points.filter((p) => visible(p.id) && !p.noAspects).concat(opts().angles ? natal.angles : []);
    const colsP = outer.filter((p) => !p.noAspects);
    const M = {};
    for (const x of cross) M[x.A.id + '|' + x.B.id] = x;
    const head = `<tr><th></th>${colsP.map((p) => `<th class="ag-diag" style="color:${p.color || 'var(--brass)'}" title="${esc(partnerName())}: ${esc(p.ru)}">${pointGlyph(p)}</th>`).join('')}</tr>`;
    const body = rowsP.map((a) => `<tr><th class="ag-diag" style="color:${a.color || 'var(--brass)'}" title="${esc(a.ru)}">${pointGlyph(a)}</th>${colsP.map((b) => { const x = M[a.id + '|' + b.id]; return aspCell(x, a.ru, partnerName() + ': ' + b.ru); }).join('')}</tr>`).join('');
    $('natAspGrid').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    $('natAspTitle').firstChild.textContent = 'Аспекты между картами ';
    const soft = cross.filter((x) => x.asp.kind === 'soft').length, hard = cross.filter((x) => x.asp.kind === 'hard').length;
    $('natAspCount').textContent = `${cross.length} ${plural(cross.length, 'аспект', 'аспекта', 'аспектов')} · гармоничных ${soft}, напряжённых ${hard}`;
    $('natAspList').innerHTML = cross.map((x) => aspItem(x, '', `${esc(partnerName())}: `)).join('');
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

  /* ------------------------------ solar return ----------------------------- */
  const SOLAR_POOL = () => app.cities.filter((c) => c.pop >= 300000);
  function renderSolarCard() {
    const card = $('natSolarCard');
    card.hidden = opts().mode !== 'solar' || !solarInfo;
    if (card.hidden) return;
    const { chart, place, score } = solarInfo;
    const reasons = (parts) => parts.slice(0, 5).map((pt) => `<span class="lc-chip ${pt.s < 0 ? 'neg' : ''}" style="--c:${pt.body.color}"><i>${g(pt.body.glyph)}</i>${pt.house ? `${pt.house} дом` : `на ${pt.angle}`}</span>`).join('');
    const per = {};   // at most two cities per country, so one longitude band doesn't fill the list
    const top = F.rankSolarCities(chart, SOLAR_POOL(), opts().house).filter((r) => (per[r.city.c] = (per[r.city.c] || 0) + 1) <= 2).slice(0, 12);
    const best = top.length ? top[0].score : 1;
    $('natSolarScore').innerHTML = `<div class="sol-now"><span class="sol-place">${esc(place.name)}</span><span class="sol-val ${score.score < 0 ? 'neg' : ''}">${score.score > 0 ? '+' : ''}${score.score.toFixed(1).replace('.', ',')}</span></div>
      <div class="bl-chips">${reasons(score.parts) || '<span class="muted">Нет сильных факторов</span>'}</div>`;
    $('natSolarList').innerHTML = top.map((r, i) => `<li data-i="${i}" tabindex="0"><span class="bl-n">${i + 1}</span><span class="bl-main"><span class="bl-city">${esc(r.city.ru)}<small>${esc(r.city.c)}</small></span><span class="bl-chips">${reasons(r.parts)}</span></span><span class="bl-score"><b>${r.score.toFixed(1).replace('.', ',')}</b><i style="width:${Math.max(6, Math.round(r.score / best * 100))}%"></i></span></li>`).join('');
    $('natSolarList').onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) { solarOpts().place = { name: top[+li.dataset.i].city.ru, country: top[+li.dataset.i].city.c, lat: top[+li.dataset.i].city.lat, lon: top[+li.dataset.i].city.lon, tz: top[+li.dataset.i].city.tz }; changed(); syncSolarControls(); } };
  }

  /* ------------------- evolutionary axis and asteroids ------------------- */
  // Steven Forrest and Jeffrey Wolf Green: the lunar nodes and the Pluto polarity point
  const HTHEME = [null, 'своя воля, самостоятельность, собственный путь', 'своё: ресурсы, ценности, самодостаточность', 'знания, слова, общение, близкое окружение',
    'дом, семья, корни, эмоциональная безопасность', 'творчество, любовь, радость, дети', 'работа, служение, мастерство, здоровье', 'партнёрство, другие люди, равенство',
    'близость, общие ресурсы, кризисы и обновление', 'вера, смысл, учёба, дальние горизонты', 'призвание, статус, ответственность перед миром', 'друзья, сообщества, идеалы, будущее',
    'духовность, уединение, сострадание, отпускание'];
  const NN_SIGN = [
    'от уступчивости и жизни ради других — к смелости, самостоятельности и праву на свои желания',
    'от кризисов, накала и чужих ресурсов — к устойчивости, простоте, своим ценностям и телу',
    'от проповеди «больших истин» — к любопытству, умению слушать, деталям и живому общению',
    'от контроля, статуса и вечной работы — к чувствам, дому, заботе и уязвимости',
    'от растворения в группе и холодной отстранённости — к самовыражению, творчеству и радости сердца',
    'от бегства в мечты и хаос — к порядку, практической пользе, ремеслу и заботе о здоровье',
    'от привычки всё решать в одиночку — к партнёрству, дипломатии и вниманию к другому',
    'от цепляния за комфорт и вещи — к глубине, близости, общим ресурсам и умению отпускать',
    'от разбросанности и мелочей — к смыслу, вере, широкой картине мира и путешествиям',
    'от зависимости и тёплого семейного гнезда — к зрелости, целям, ответственности и своему месту в мире',
    'от жажды аплодисментов и личной драмы — к сообществу, идеалам, дружбе и будущему',
    'от перфекционизма и тревожного контроля — к доверию, состраданию, вере и потоку'];
  const AST_TEXT = {
    Ceres: 'Великая Мать: как вы заботитесь и принимаете заботу, отношение к еде и телу, опыт утраты и возвращения, ощущение себя нужным.',
    Pallas: 'Дочь мудрости: стратегический и творческий ум, умение видеть узоры, чувство справедливости, равновесие ума и чувств.',
    Juno: 'Царица-супруга: какой союз вам нужен, ожидания от брака, верность и равенство, ревность и власть в паре.',
    Vesta: 'Хранительница огня: чему вы готовы посвятить себя целиком, сосредоточенность, служение, священное отношение к телу.',
  };
  function renderSoulCards() {
    const show = opts().mode === 'natal' && !outer;
    $('natSoulCard').hidden = !show; $('natAstCard').hidden = !show;
    if (!show) return;
    const pt = (id) => natal.points.find((p) => p.id === id);
    const nn = pt('Node'), sn = pt('SNode'), pl = pt('Pluto');
    const sgn = (lon) => Math.floor(n360(lon) / 30);
    const rulerOf = (lon) => N.RULERS[sgn(lon)][N.RULERS[sgn(lon)].length - 1];   // the traditional ruler
    const LOC = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
    const where = (id) => { const p = pt(id); return p ? `в ${LOC[sgn(p.lon)]}, в ${RN[p.house]} доме` : ''; };
    let h = '';
    if (nn && sn) {
      const nr = rulerOf(nn.lon), sr = rulerOf(sn.lon);
      h += `<div class="soul-row"><span class="tg" style="color:${nn.color}">${g('☋')}</span><div><b>Южный узел: ${pos(sn.lon).text} ${esc(pos(sn.lon).name)}, ${RN[sn.house]} дом</b>
        <p>Что душа уже умеет и куда по привычке тянется: ${esc(HTHEME[sn.house])}. Управитель южного узла ${BODY[sr].ru} (${esc(where(sr))}) показывает, через что прошлый опыт проявляется сейчас.</p></div></div>
        <div class="soul-row"><span class="tg" style="color:${nn.color}">${g('☊')}</span><div><b>Северный узел: ${pos(nn.lon).text} ${esc(pos(nn.lon).name)}, ${RN[nn.house]} дом</b>
        <p>Путь роста: ${esc(NN_SIGN[sgn(nn.lon)])}. Сфера жизни, где это происходит: ${esc(HTHEME[nn.house])}. Управитель ${BODY[nr].ru} (${esc(where(nr))}) — помощник на этом пути.</p></div></div>`;
    }
    if (pl) {
      const ppp = n360(pl.lon + 180), ph = N.houseOf(ppp, natal.cusps), pp = pos(ppp);
      h += `<div class="soul-row"><span class="tg" style="color:${pl.color}">${g('♇')}</span><div><b>Плутон: ${pos(pl.lon).text} ${esc(pos(pl.lon).name)}, ${RN[pl.house]} дом</b>
        <p>Самая глубокая привязанность души: ${esc(HTHEME[pl.house])}. Здесь сильнее всего страх потери и желание всё контролировать.</p></div></div>
        <div class="soul-row"><span class="tg" style="color:${pl.color}">${g('☍')}</span><div><b>Точка полярности Плутона: ${pp.text} ${esc(pp.name)}, ${RN[ph]} дом</b>
        <p>Эволюционная задача по Джеффри Вольфу Грину — двигаться к противоположному: ${esc(HTHEME[ph])}.</p></div></div>`;
    }
    $('natSoul').innerHTML = h;
    const INSTR = { Sun: 'Солнцем', Moon: 'Луной', Mercury: 'Меркурием', Venus: 'Венерой', Mars: 'Марсом', Jupiter: 'Юпитером', Saturn: 'Сатурном' };
    const near = [...natal.points.filter((p) => ['Sun', 'Moon', 'Venus', 'Mars', 'Mercury', 'Jupiter', 'Saturn'].includes(p.id)), ...natal.angles];
    const asp = (a, b) => { const d = Math.abs(n180(a - b)); for (const [x, nm] of [[0, 'соединение'], [180, 'оппозиция'], [90, 'квадрат'], [120, 'трин']]) if (Math.abs(d - x) <= 2) return nm; return null; };
    const rows = ASTEROIDS.map((id) => {
      const p = pt(id);
      if (!p) return '';
      const links = near.map((q) => { const a = asp(p.lon, q.lon); return a ? `${a} с ${q.angle ? q.glyph : INSTR[q.id]}` : null; }).filter(Boolean);
      return `<div class="soul-row"><span class="tg" style="color:${p.color}">${g(p.glyph)}</span><div><b>${esc(p.ru)}: ${pos(p.lon).text} ${esc(pos(p.lon).name)}, ${RN[p.house]} дом${p.retro ? ' <span class="rx">R</span>' : ''}</b>
        <p>${esc(AST_TEXT[id])} Сфера: ${esc(HTHEME[p.house])}.${links.length ? ` Контакты до 2°: ${esc(links.join(', '))}.` : ''}</p></div></div>`;
    }).join('');
    $('natAst').innerHTML = rows || '<p class="muted">Астероиды считаются для 1800–2100 годов.</p>';
  }

  /* --------------- readings: solar return, synastry, composite --------------- */
  function renderReading() {
    const card = $('natReadCard'), o = opts(), I = window.INTERP;
    let secs = null, title = '', sub = '';
    try {
      if (I && o.mode === 'solar' && solarInfo) { secs = I.solar(natal, natBase); title = `Расшифровка соляра ${solarInfo.year}`; sub = 'на год от дня рождения до дня рождения'; }
      else if (I && o.mode === 'synastry' && natB && outer) { secs = I.synastry(natBase, natB, cross, partnerName()); title = 'Расшифровка синастрии'; sub = `вы и ${partnerName()}`; }
      else if (I && o.mode === 'synastry' && natB) { secs = I.composite(natal); title = 'Расшифровка композита'; sub = 'отношения как отдельная карта'; }
    } catch (e) { secs = null; }
    card.hidden = !secs;
    if (!secs) return;
    $('natReadTitle').firstChild.textContent = title + ' ';
    $('natReadSub').textContent = sub;
    const gl = (id, partner) => {
      if (id === 'ASC' || id === 'MC') return `<span class="rd-ang">${id}</span>`;
      const b = BODY[id];
      return b ? `<span style="color:${b.color}"${partner ? ' class="rd-b"' : ''}>${g(b.glyph)}</span>` : '';
    };
    // aspect rows carry the aspect's glyph in its colour, the others the planet's glyph
    const row = (it) => `<div class="soul-row"><span class="tg">${it.asp ? `<span class="ag-${it.asp.kind}">${g(it.asp.glyph)}</span>` : gl(it.id, it.partner)}</span><div>
        <b>${esc(it.head)}</b>
        <p>${esc(it.text)}</p></div></div>`;
    $('natRead').innerHTML = secs.filter((sec) => sec.items.length).map((sec) => `<section class="rd-sec"><h4 class="nat-h4">${esc(sec.title)}</h4>${sec.note ? `<p class="bal-note">${esc(sec.note)}</p>` : ''}<div class="soul">${sec.items.map(row).join('')}</div></section>`).join('');
  }

  /* -------------------------------- horary -------------------------------- */
  const HG = (id) => `<span class="tg" style="color:${BODY[id].color}">${g(BODY[id].glyph)}</span>`;
  const HN = (id) => `${HG(id)} ${H.RU[id]}`;
  const INS = { Sun: 'Солнцем', Moon: 'Луной', Mercury: 'Меркурием', Venus: 'Венерой', Mars: 'Марсом', Jupiter: 'Юпитером', Saturn: 'Сатурном' };
  const meets = (x, asp) => (asp === 0 ? `соединение с ${INS[x]}` : `${H.ASP[asp].ru} к ${H.DAT[x]}`);
  const ASP_NATURE = { 0: 'соединение — встреча напрямую', 60: 'секстиль — легко, при небольшом усилии', 120: 'трин — легко и естественно', 90: 'квадрат — через трудности и препятствия', 180: 'оппозиция — случится, но часто с сожалением' };
  const VERDICT = { yes: ['Да', 'good'], via: ['Да, через посредника', 'good'], maybe: ['Под вопросом', 'warn'], no: ['Скорее нет', 'bad'], look: ['Смотрите состояние планеты', 'warn'], past: ['Уже было', 'warn'] };
  const whenText = (ms, tz) => localTime(ms, tz).text;
  function inDays(ms, t0) {
    const h = (ms - t0) / 3600000;
    if (h < 48) return `${Math.max(1, Math.round(h))} ${plural(Math.max(1, Math.round(h)), 'час', 'часа', 'часов')}`;
    const d = Math.round(h / 24);
    return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
  }
  const andJoin = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} и ${list[list.length - 1]}`);
  const recText = (who, host, kinds) => kinds.length ? `${H.RU[who]} стоит в ${andJoin(kinds.map((k) => ({ domicile: 'обители', exalt: 'экзальтации', trip: 'триплицитете', term: 'термах', face: 'фасе', detriment: 'изгнании', fall: 'падении' }[k])))} ${H.GEN[host]}` : '';
  function pairHtml(p, an, tz) {
    if (p.same) return `<p>${esc(p.label)}: одна планета, ${HN(p.a)}.</p>`;
    const lines = [];
    const now = `${H.ASP[p.now.asp].g} ${H.ASP[p.now.asp].ru}, орб ${orbText(p.now.orb)}, ${p.now.applying ? 'сходящийся' : 'расходящийся'}`;
    lines.push(`<p class="hp-h">${HN(p.a)} <span class="muted">и</span> ${HN(p.b)} <span class="muted">· ${esc(p.label)}</span></p>`);
    if (p.perfects) {
      lines.push(`<p><b>${H.ASP[p.asp].g} ${H.ASP[p.asp].ru} станет точным</b> через ${orbText(p.degrees)} — в небе ${whenText(p.t, tz)} (через ${inDays(p.t, an.t0)}). Характер: ${ASP_NATURE[p.asp]}.</p>`);
      lines.push(`<p class="muted">Срок по Фроули: около ${Math.max(1, Math.round(p.degrees))} единиц; к перфекции идёт ${H.RU[p.timing.fast]} (${ACG.SIGNS[Math.floor(n360(an.P[p.timing.fast].lon) / 30)][1]}, ${RN[an.P[p.timing.fast].house]} дом) — единицы скорее ${p.timing.units}. Кардинальные знаки и угловые дома ускоряют, фиксированные знаки и падающие дома замедляют; единицу выбирайте и по смыслу вопроса.</p>`);
      if (p.prohibit.length) lines.push(`<p class="hp-warn">Возможный запрет: раньше ${p.prohibit.slice(0, 2).map((x) => `${H.RU[x.x]} образует ${meets(x.s, x.asp)} (через ${inDays(x.t, an.t0)})`).join('; ')}. Если эта планета мешает по смыслу вопроса, дело может сорваться.</p>`);
    } else {
      if (!p.now.applying && p.now.orb < 1) lines.push(`<p class="hp-good">Аспект (${H.ASP[p.now.asp].ru}) только что был точным: событие, скорее всего, уже произошло или происходит сейчас.</p>`);
      lines.push(`<p>Сейчас: ${now}. До смены знака (${H.RU[p.signChange.id]} уходит через ${inDays(p.signChange.t, an.t0)}) точного аспекта не будет.</p>`);
      if (p.afterSign) lines.push(`<p class="muted">Аспект (${H.ASP[p.afterSign.asp].ru}) станет точным уже после смены знака, ${whenText(p.afterSign.t, tz)}.</p>`);
      if (p.refranation) lines.push(`<p class="hp-warn">Рефранация: ${H.RU[p.refranation.id]} разворачивается до перфекции.</p>`);
      for (const t of p.translation) lines.push(`<p class="hp-good">Перенос света: ${HN(t.x)} отходит от ${H.GEN[t.from]} и через ${inDays(t.t, an.t0)} образует ${meets(t.to, t.asp)}.</p>`);
      for (const c of p.collection) lines.push(`<p class="hp-good">Сбор света: оба сигнификатора приходят к ${H.DAT[c.x]} (${H.ASP[c.aspA].ru} и ${H.ASP[c.aspB].ru}).</p>`);
    }
    const r1 = recText(p.a, p.b, p.recAB), r2 = recText(p.b, p.a, p.recBA);
    lines.push(`<p class="muted">Рецепция: ${[r1, r2].filter(Boolean).join('; ') || 'нет'}${p.mutual ? ' — взаимная рецепция' : ''}. Планета-хозяин относится к гостю благосклонно, если он в её обители или экзальтации, и с неприязнью — если в её изгнании или падении.</p>`);
    return `<div class="hp">${lines.join('')}</div>`;
  }
  function renderHoraryCard() {
    const card = $('natHoraryCard');
    card.hidden = opts().mode !== 'horary' || !horInfo;
    if (card.hidden) return;
    const an = horInfo.an, tz = horInfo.place.tz, ho = horOpts();
    const [label, cls] = VERDICT[an.verdict.v];
    $('horVerdict').innerHTML = `<div class="hv ${cls}"><b>${label}</b><span>${esc(an.verdict.t)}</span></div>`;
    $('horHouseNote').textContent = an.base === 1 ? `Дом вопроса: ${RN[an.qh]}` : `Дом вопроса: ${RN[an.qh]} (${RN[an.rel]} от ${RN[an.base]})`;
    const roles = [[an.sigBase, an.base === 1 ? 'Вы (управитель I)' : `О ком вопрос (управитель ${RN[an.base]})`]];
    if (an.base === 1) roles.push(['Moon', 'Вы (Луна)']);
    roles.push([an.sigQ, `Предмет вопроса (управитель ${RN[an.qh]})`]);
    const tag = (k) => `<span class="tag ${['detriment', 'fall', 'peregrine'].includes(k) ? 'bad' : 'good'}">${H.DIGN_RU[k]}</span>`;
    const atag = ([t, v]) => `<span class="tag ${v > 0 ? 'good' : v < 0 ? 'bad' : ''}">${t}</span>`;
    $('horSig').innerHTML = roles.map(([id, role]) => {
      const p = an.P[id];
      return `<li><span class="hs-role">${role}</span>
        <span class="hs-main"><span class="nm">${HN(id)}${p.retro ? ' <span class="rx">R</span>' : ''}</span><span class="ps">${signCell(p.lon)}</span><span class="hs">${RN[p.house]} дом${p.nearCusp ? ' <small title="в пределах 5° до куспида, читается в следующем доме">у куспида</small>' : ''}</span></span>
        <span class="hs-tags">${p.ess.map(tag).join(' ')} ${p.acc.map(atag).join(' ')}</span></li>`;
    }).join('');
    $('horPairs').innerHTML = an.pairs.map((p) => pairHtml(p, an, tz)).join('');
    const M = an.P.Moon, ms = pos(M.lon);
    const next = an.moonNext.map((x) => `${H.ASP[x.asp].g} ${meets(x.id, x.asp)} через ${inDays(x.t, an.t0)}`);
    const prev = an.moonPrev[0];
    $('horMoon').innerHTML = `<p>Луна: ${ms.text} ${esc(ms.name)}, ${RN[M.house]} дом. ${prev ? `Последний аспект — ${meets(prev.id, prev.asp)}, ${inDays(an.t0, prev.t)} назад.` : 'В этом знаке Луна ещё не делала аспектов.'}</p>
      <p>${an.voc ? '<b>Луна без курса</b>: до ухода из знака аспектов больше не будет.' : `Дальше: ${next.join(', ')}.`} Из знака Луна уйдёт через ${inDays(an.exit.Moon, an.t0)}.</p>`;
    $('horWarn').innerHTML = an.warn.length ? an.warn.map((w) => `<li>${esc(w.t)}</li>`).join('') : '<li class="muted">Препятствий к суждению нет.</li>';
  }
  function horaryChart() {
    const ho = horOpts(), place = ho.place || app.state.place;
    if (!ho.date || !ho.time) setHoraryNow(false);
    const [y, m, d] = ho.date.split('-').map(Number), [hh, mi] = ho.time.split(':').map(Number);
    const conv = ACG.localToUtc(y, m, d, hh, mi, place.tz || 'UTC');
    const key = [conv.utc, place.lat, place.lon, ho.base, ho.rel, app.state.nodeMode].join('|');
    if (horCache && horCache.key === key) return horCache.v;
    const chart = ACG.computeChart(conv.utc, { node: app.state.nodeMode });
    chart.bodies.forEach((b) => { if (b.id === 'Node') b.retro = b.speed < 0.005; });
    const nat = N.computeNatal(chart, place.lat, place.lon, { house: 'R', minor: false, points: (id) => HOR_POINTS.includes(id), anglesAspects: false });
    // Lot of Fortune as Lilly and Frawley take it in horary: ASC + Moon − Sun by day and by night
    const f = nat.points.find((p) => p.id === 'Fortune'), sun = nat.points.find((p) => p.id === 'Sun'), moon = nat.points.find((p) => p.id === 'Moon');
    if (f) { f.lon = n360(nat.asc + moon.lon - sun.lon); f.sign = Math.floor(f.lon / 30); f.house = N.houseOf(f.lon, nat.cusps); }
    const v = { utc: conv.utc, place, chart, nat, an: H.analyse(chart, nat, { base: ho.base, rel: ho.rel }) };
    horCache = { key, v };
    return v;
  }
  // the question's moment: now, at the question's place
  function setHoraryNow(redraw) {
    const ho = horOpts(), place = ho.place || app.state.place, now = Date.now();
    const loc = new Date(now + ACG.tzOffsetMin(place.tz || 'UTC', now) * 60000);
    ho.date = `${loc.getUTCFullYear()}-${pad(loc.getUTCMonth() + 1)}-${pad(loc.getUTCDate())}`;
    ho.time = `${pad(loc.getUTCHours())}:${pad(loc.getUTCMinutes())}`;
    if (redraw) { syncHoraryControls(); changed(); }
  }
  function syncHoraryControls() {
    const ho = horOpts();
    $('horQ').value = ho.q || '';
    $('horDate').value = ho.date || '';
    $('horTime').value = ho.time || '';
    if (document.activeElement !== $('horPlace')) $('horPlace').value = app.placeLabel(ho.place || app.state.place);
    $('horBase').value = String(ho.base);
    $('horRel').value = String(ho.rel);
  }
  function initHoraryControls() {
    $('horBase').innerHTML = H.BASES.map(([n, t]) => `<option value="${n}">${t}</option>`).join('');
    $('horRel').innerHTML = H.HOUSES.map((t, i) => (i ? `<option value="${i}">${RN[i]} — ${t}</option>` : '')).join('');
    const ho = () => horOpts();
    $('horQ').addEventListener('change', (e) => { ho().q = e.target.value.trim().slice(0, 140); changed(); });
    $('horDate').addEventListener('change', (e) => { if (e.target.value) { ho().date = e.target.value; changed(); } });
    $('horTime').addEventListener('change', (e) => { if (e.target.value) { ho().time = e.target.value.slice(0, 5); changed(); } });
    $('horNow').addEventListener('click', () => setHoraryNow(true));
    $('horBase').addEventListener('change', (e) => { ho().base = +e.target.value; changed(); });
    $('horRel').addEventListener('change', (e) => { ho().rel = +e.target.value; changed(); });
    app.makePlaceSearch($('horPlace'), $('horSuggest'), () => ho().place || app.state.place, (p) => { ho().place = p; changed(); });
    $('horHome').addEventListener('click', () => { ho().place = null; syncHoraryControls(); changed(); });
    $('horHere').addEventListener('click', () => {
      if (!navigator.geolocation) { $('horHereNote').textContent = 'Браузер не умеет определять место.'; return; }
      $('horHereNote').textContent = 'Определяем место…';
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude, near = app.nearestCity(lat, lon);
        ho().place = { name: near && near.km < 40 ? near.city.ru : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, country: near ? near.city.c : '', lat, lon, tz: near ? near.city.tz : 'UTC' };
        $('horHereNote').textContent = '';
        syncHoraryControls(); changed();
      }, () => { $('horHereNote').textContent = 'Не удалось определить место: разрешите доступ к геопозиции или выберите город.'; }, { timeout: 10000, maximumAge: 600000 });
    });
    syncHoraryControls();
  }

  /* ------------------------------- headings ------------------------------- */
  function renderHead() {
    const st = app.state, mode = opts().mode;
    const sys = N.HOUSE_SYSTEMS.find((s) => s.id === natal.used);
    const [y, m, d] = st.date.split('-').map(Number);
    const birth = `${d} ${MONTHS[m - 1]} ${y} · ${st.time} · ${st.place.name}`;
    let title = birth, sub = '';
    if (mode === 'horary' && horInfo) {
      const P = horInfo.place, lt = localTime(horInfo.utc, P.tz);
      title = horOpts().q ? `«${horOpts().q}»` : 'Хорарная карта';
      sub = `${lt.text} (${offText(lt.off)}) · ${P.name} · ${fmtLat(P.lat)} · ${fmtLon(P.lon)} · дома: Региомонтан`;
    } else if (mode === 'solar' && solarInfo) {
      const P = solarInfo.place, lt = localTime(solarInfo.utc, P.tz), sp = pos(solarInfo.sunLon);
      title = `Соляр ${solarInfo.year} · ${P.name}`;
      sub = `Солнце возвращается в ${sp.text}${pad(sp.sec)}″ ${sp.name}: ${lt.text} (${offText(lt.off)}) · ${fmtLat(P.lat)} · ${fmtLon(P.lon)} · дома: ${sys.ru}`;
    } else if (mode === 'synastry' && natB) {
      const P = app.state.partner;
      title = opts().syn === 'comp' ? `Композит · вы и ${partnerName()}` : `Синастрия · вы и ${partnerName()}`;
      sub = `Вы: ${birth} · ${partnerName()}: ${P.date.split('-').reverse().join('.')} · ${P.time} · ${P.place.name} · дома: ${sys.ru}${opts().syn === 'comp' ? ' · композит по средним точкам' : ''}`;
    } else {
      const P = st.place, conv = app.conv, u = new Date(conv.utc);
      sub = `${fmtLat(P.lat)} · ${fmtLon(P.lon)} · UTC ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())} (${offText(conv.offset)}) · дома: ${sys.ru}`;
    }
    $('natH').textContent = mode === 'solar' ? 'Соляр' : mode === 'synastry' ? 'Совместимость' : mode === 'horary' ? 'Хорар' : 'Натальная карта';
    $('natTitle').textContent = title;
    $('natSub').textContent = sub;
    const note = mode === 'synastry' && !natB ? 'Добавьте данные партнёра в панели слева (на телефоне — ниже), чтобы увидеть синастрию и композит.' : mode === 'horary' ? '' : natal.note;
    $('natNote').textContent = note || '';
    $('natNote').hidden = !note;
  }

  /* ------------------------------- controls ------------------------------- */
  function syncSolarControls() {
    const so = solarOpts();
    $('solYear').value = so.year || '';
    $('solPlace').value = so.place ? app.placeLabel(so.place) : '';
  }
  function initControls() {
    const o = opts();
    const nodeSel = $('natNode');
    nodeSel.value = app.state.nodeMode === 'mean' ? 'mean' : 'true';
    nodeSel.addEventListener('change', () => { app.state.nodeMode = nodeSel.value; app.save(); app.recompute(); });
    const sel = $('natHouse');
    sel.innerHTML = N.HOUSE_SYSTEMS.map((s) => `<option value="${s.id}">${s.ru}</option>`).join('');
    sel.value = o.house;
    sel.addEventListener('change', () => { opts().house = sel.value; changed(); });
    const syncSeg = () => {
      const q = opts();
      $('natAspMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'minor') === !!q.minor)));
      $('natPts').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(!!q[b.dataset.p])));
      $('natMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === q.mode)));
      $('natSyn').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === q.syn)));
      $('natSyn').hidden = q.mode !== 'synastry';
      document.body.dataset.natmode = q.mode;
    };
    syncSeg();
    $('natAspMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().minor = b.dataset.m === 'minor'; syncSeg(); changed(); });
    $('natPts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.p; opts()[k] = !opts()[k]; syncSeg(); changed(); });
    $('natMode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.m === 'horary' && opts().mode !== 'horary' && !horOpts().date) setHoraryNow(false);
      opts().mode = b.dataset.m; hl = null; syncSeg(); if (b.dataset.m === 'horary') syncHoraryControls(); changed();
    });
    $('natSyn').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().syn = b.dataset.s; hl = null; syncSeg(); changed(); });
    if (H) initHoraryControls();
    // solar return controls
    syncSolarControls();
    $('solYear').addEventListener('change', (e) => { const v = parseInt(e.target.value, 10); solarOpts().year = v >= 1800 && v <= 2100 ? v : null; changed(); syncSolarControls(); });
    app.makePlaceSearch($('solPlace'), $('solSuggest'), () => solarOpts().place, (p) => { solarOpts().place = p; changed(); });
    $('solHome').addEventListener('click', () => { solarOpts().place = null; changed(); syncSolarControls(); });
    // highlight a point's aspects from the wheel or the tables
    const pick = (id) => { hl = hl === id ? null : id; renderWheel(); renderPlanets(); renderAspects(); };
    $('wheel').addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); pick(el ? el.dataset.id : null); });
    $('wheel').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.id) { e.preventDefault(); pick(e.target.dataset.id); } });
    for (const id of ['natPlanets', 'natPartner']) $(id).addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr.dataset.id); });
  }
  function changed() { app.save(); update(); }

  /* -------------------------------- update -------------------------------- */
  function defaultSolarYear() {
    const now = new Date(), [, m, d] = app.state.date.split('-').map(Number);
    const passed = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() > d);
    return now.getFullYear() + (passed ? 1 : 0);
  }
  function update() {
    if (!app || !app.chart || $('natalView').hidden) return;
    const o = opts(), P = app.state.place;
    const natOpts = { house: o.house, minor: o.minor, points: visible, anglesAspects: o.angles };
    outer = null; cross = []; solarInfo = null; natB = null; horInfo = null;
    const natA = N.computeNatal(app.chart, P.lat, P.lon, natOpts);
    natal = natA; natBase = natA;
    if (o.mode === 'horary' && H) {
      horInfo = horaryChart();
      natal = horInfo.nat;
    } else if (o.mode === 'solar') {
      const so = solarOpts(), year = so.year || defaultSolarYear(), place = so.place || P;
      const sunLon = app.chart.bodies.find((b) => b.id === 'Sun').elon;
      const utc = F.solarReturnUtc(app.chart.utcMs, sunLon, year);
      const chart = ACG.computeChart(utc, { node: app.state.nodeMode });
      chart.bodies.forEach((b) => { if (b.id === 'Node') b.retro = b.speed < 0.005; });
      natal = N.computeNatal(chart, place.lat, place.lon, natOpts);
      solarInfo = { year, utc, place, chart, sunLon, score: F.scoreSolarPlace(chart, place.lat, place.lon, o.house) };
      $('solYear').placeholder = String(year);
    } else if (o.mode === 'synastry' && app.partnerChart) {
      const PB = app.state.partner.place;
      natB = N.computeNatal(app.partnerChart, PB.lat, PB.lon, natOpts);
      if (o.syn === 'comp') natal = F.composite(natA, natB, o.house, { points: visible, minor: o.minor, angles: o.angles });
      else {
        outer = natB.points.filter((p) => visible(p.id)).map((p) => Object.assign({}, p, { id: 'B:' + p.id, baseId: p.id }));
        const A = natA.points.filter((p) => visible(p.id) && !p.noAspects).concat(o.angles ? natA.angles : []);
        const B = outer.filter((p) => !p.noAspects).concat(o.angles ? natB.angles.map((p) => Object.assign({}, p, { id: 'B:' + p.id })) : []);
        cross = F.crossAspects(A, B);
      }
    }
    if (hl && !natal.points.some((p) => p.id === hl) && !(outer && outer.some((p) => p.id === hl))) hl = null;
    $('natBalanceCard').hidden = !!outer || o.mode === 'horary';
    renderHead(); renderWheel(); renderPlanets(); renderHouses(); renderAspects(); if (!outer) renderBalance(); renderSolarCard(); renderHoraryCard(); renderSoulCards(); renderReading();
  }

  window.NatalView = {
    init(a) { app = a; opts(); solarOpts(); initControls(); },
    update,
  };
})();
