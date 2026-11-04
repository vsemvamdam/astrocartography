/* Natal chart view: natal, solar return and compatibility (synastry, composite).
   SVG wheel and tables. Reads the shared app state via the object passed to init(). */
(function () {
  'use strict';
  const ACG = window.ACG, N = window.NATAL, F = window.FEAT;
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
  const DEFAULTS = { house: 'P', minor: false, nodes: true, chiron: true, lilith: true, fortune: true, angles: true, mode: 'natal', syn: 'syn' };

  let natal = null;     // the chart drawn as the main wheel (natal, solar or composite)
  let outer = null;     // partner's points in the outer ring (synastry)
  let cross = [];       // synastry aspects
  let hl = null, app = null, solarInfo = null, natB = null;

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
  const visible = (id) => {
    const o = opts();
    if (id === 'Node' || id === 'SNode') return o.nodes;
    if (id === 'Lilith') return o.lilith;
    if (id === 'Chiron') return o.chiron;
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
    const pts = natal.points.filter((p) => visible(p.id) && !p.noAspects).concat(opts().angles ? natal.angles : []);
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

  /* ------------------------------- headings ------------------------------- */
  function renderHead() {
    const st = app.state, mode = opts().mode;
    const sys = N.HOUSE_SYSTEMS.find((s) => s.id === natal.used);
    const [y, m, d] = st.date.split('-').map(Number);
    const birth = `${d} ${MONTHS[m - 1]} ${y} · ${st.time} · ${st.place.name}`;
    let title = birth, sub = '';
    if (mode === 'solar' && solarInfo) {
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
    $('natH').textContent = mode === 'solar' ? 'Соляр' : mode === 'synastry' ? 'Совместимость' : 'Натальная карта';
    $('natTitle').textContent = title;
    $('natSub').textContent = sub;
    const note = mode === 'synastry' && !natB ? 'Добавьте данные партнёра в панели слева (на телефоне — ниже), чтобы увидеть синастрию и композит.' : natal.note;
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
    $('natMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().mode = b.dataset.m; hl = null; syncSeg(); changed(); });
    $('natSyn').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().syn = b.dataset.s; hl = null; syncSeg(); changed(); });
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
    outer = null; cross = []; solarInfo = null; natB = null;
    const natA = N.computeNatal(app.chart, P.lat, P.lon, natOpts);
    natal = natA;
    if (o.mode === 'solar') {
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
    $('natBalanceCard').hidden = !!outer;
    renderHead(); renderWheel(); renderPlanets(); renderHouses(); renderAspects(); if (!outer) renderBalance(); renderSolarCard();
  }

  window.NatalView = {
    init(a) { app = a; opts(); solarOpts(); initControls(); },
    update,
  };
})();
