/* "Инструменты": Sotis-style tools built on the current birth chart or on a date and place. */
(function () {
  'use strict';
  const ACG = window.ACG, N = window.NATAL, F = window.FEAT;
  const $ = (id) => document.getElementById(id);
  const VS = '︎', g = (s) => s + VS;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const BODY = Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const ASP_RU = { 0: 'соединение', 60: 'секстиль', 90: 'квадрат', 120: 'трин', 180: 'оппозиция' };
  const ASP_G = { 0: '☌', 60: '⚹', 90: '□', 120: '△', 180: '☍' };
  const GEN = { Sun: 'Солнца', Moon: 'Луны', Mercury: 'Меркурия', Venus: 'Венеры', Mars: 'Марса', Jupiter: 'Юпитера', Saturn: 'Сатурна' };
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };

  const TOOLS = [
    { id: 'hours', ru: 'Управители дня и часа', kind: 'date' },
    { id: 'voc', ru: 'Луна без курса', kind: 'date' },
    { id: 'lunar', ru: 'Лунные дни', kind: 'date' },
    { id: 'eph', ru: 'Эфемериды', kind: 'date' },
    { id: 'dign', ru: 'Достоинства и альмутен', kind: 'natal' },
    { id: 'disp', ru: 'Диспозиторы', kind: 'natal' },
    { id: 'lots', ru: 'Арабские жребии', kind: 'natal' },
    { id: 'stars', ru: 'Неподвижные звёзды', kind: 'natal' },
    { id: 'deg30', ru: 'Тридцатиградусник', kind: 'natal' },
  ];

  let app = null;
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function opts() {
    app.state.tools = Object.assign({ tool: 'hours', date: null, place: null, classic: false, modern: false }, app.state.tools || {});
    return app.state.tools;
  }
  const place = () => opts().place || app.state.place;
  const dateParts = () => { const [y, m, d] = (opts().date || todayISO()).split('-').map(Number); return { y, m, d }; };
  const zpos = (lon) => { const z = ACG.formatZodiac(lon); return `<span class="pos">${z.deg}°${pad(z.min)}′</span> <span class="sg" title="${z.name}">${g(z.glyph)}</span> <span class="sgn">${z.name}</span>`; };
  const bodyG = (id) => `<span class="tg" style="color:${BODY[id].color}" title="${BODY[id].ru}">${g(BODY[id].glyph)}</span>`;
  const bodyName = (id) => `${bodyG(id)} ${BODY[id].ru}`;
  function tLocal(ms, tz, withDate) {
    const off = ACG.tzOffsetMin(tz || 'UTC', ms), d = new Date(ms + off * 60000);
    const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return withDate ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${WD[d.getUTCDay()]} ${hm}` : hm;
  }
  function natal() {
    const P = app.state.place, o = app.state.natal || {};
    return N.computeNatal(app.chart, P.lat, P.lon, { house: o.house || 'P' });
  }

  /* ------------------------------- the tools ------------------------------ */
  function renderHours() {
    const { y, m, d } = dateParts(), P = place();
    const r = F.planetaryHours(y, m, d, P);
    if (r.polar) return `<p class="muted">В этот день Солнце в ${esc(P.name)} не восходит или не заходит, поэтому неравные часы не определены.</p>`;
    const now = Date.now();
    const row = (h) => `<tr class="${now >= h.start && now < h.end ? 'on' : ''}"><td class="hs">${h.n}</td><td>${bodyName(h.ruler)}</td><td class="pos">${tLocal(h.start, P.tz)} – ${tLocal(h.end, P.tz)}</td></tr>`;
    return `<div class="tool-lead"><div class="big-glyph" style="color:${BODY[r.dayRuler].color}">${g(BODY[r.dayRuler].glyph)}</div><div><b>${WD_FULL[r.weekday][0].toUpperCase() + WD_FULL[r.weekday].slice(1)}: день ${GEN[r.dayRuler]}</b>
        <p class="muted">Восход ${tLocal(r.sunrise, P.tz)}, закат ${tLocal(r.sunset, P.tz)}. Дневной час длится ${Math.round((r.sunset - r.sunrise) / 12 / 60000)} мин, ночной — ${Math.round((r.nextSunrise - r.sunset) / 12 / 60000)} мин. Порядок халдейский: Сатурн, Юпитер, Марс, Солнце, Венера, Меркурий, Луна.</p></div></div>
      <div class="two-col">
        <div><h4>Дневные часы</h4><table class="nat-table"><tbody>${r.hours.filter((h) => h.day).map(row).join('')}</tbody></table></div>
        <div><h4>Ночные часы</h4><table class="nat-table"><tbody>${r.hours.filter((h) => !h.day).map(row).join('')}</tbody></table></div>
      </div>`;
  }

  function renderVoc() {
    const { y, m, d } = dateParts(), P = place(), o = opts();
    const from = ACG.localToUtc(y, m, d, 0, 0, P.tz).utc;
    const ids = o.classic ? ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] : ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const list = F.voidOfCourse(from, 14, ids);
    const now = Date.now();
    const rows = list.map((v) => {
      const hrs = (v.end - v.start) / 3600000;
      const dur = hrs >= 1 ? `${Math.floor(hrs)} ч ${pad(Math.round((hrs % 1) * 60))} мин` : `${Math.round(hrs * 60)} мин`;
      return `<tr class="${now >= v.start && now < v.end ? 'on' : ''}"><td class="pos">${tLocal(v.start, P.tz, true)}</td><td class="pos">${tLocal(v.end, P.tz, true)}</td><td>${dur}</td>
        <td>${v.last ? `${g(ASP_G[v.last.aspect])} ${ASP_RU[v.last.aspect]} с ${bodyName(v.last.planet)}` : 'без аспектов в знаке'}</td>
        <td>в ${ACG.SIGNS[v.nextSign][1]} ${g(ACG.SIGNS[v.nextSign][0])}</td></tr>`;
    }).join('');
    return `<p class="muted">Луна без курса — время от последнего точного мажорного аспекта Луны к планетам до её перехода в следующий знак. Время местное для ${esc(P.name)}; ${o.classic ? 'учитываются только классические планеты.' : 'учитываются все планеты до Плутона.'}</p>
      <label class="chk"><input type="checkbox" id="vocClassic" ${o.classic ? 'checked' : ''}> Только классические планеты (без Урана, Нептуна, Плутона)</label>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Начало</th><th>Конец</th><th>Длится</th><th>Последний аспект</th><th>Переход</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderLunar() {
    const { y, m, d } = dateParts(), P = place();
    const at = ACG.localToUtc(y, m, d, 12, 0, P.tz).utc;
    const r = F.lunarDays(at, P);
    const rows = r.days.map((x) => `<tr class="${at >= x.start && at < x.end ? 'on' : ''}"><td class="hs">${x.n}</td><td class="pos">${tLocal(x.start, P.tz, true)}</td><td class="pos">${tLocal(x.end, P.tz, true)}</td></tr>`).join('');
    const cur = r.days.find((x) => at >= x.start && at < x.end);
    return `<div class="tool-lead"><div class="big-num">${cur ? cur.n : '—'}</div><div><b>${cur ? `${cur.n}-й лунный день` : ''} на ${d} ${MONTHS[m - 1]} ${y}, ${esc(P.name)}</b>
      <p class="muted">Первый лунный день начинается в момент новолуния (${tLocal(r.newMoon, P.tz, true)}), каждый следующий — с восходом Луны. Следующее новолуние: ${tLocal(r.nextNewMoon, P.tz, true)}.</p></div></div>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>День</th><th>Начало</th><th>Конец</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderEph() {
    const { y, m } = dateParts();
    const rows = F.ephemeris(y, m, app.state.nodeMode);
    const ids = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Node', 'Chiron'];
    const head = ids.filter((id) => rows[0].bodies.some((b) => b.id === id)).map((id) => `<th title="${BODY[id].ru}" style="color:${BODY[id].color}">${g(BODY[id].glyph)}</th>`).join('');
    const body = rows.map((r) => `<tr><td class="hs">${r.d}</td>${ids.map((id) => {
      const b = r.bodies.find((x) => x.id === id); if (!b) return '';
      const z = ACG.formatZodiac(b.elon);
      return `<td class="eph"><span>${z.deg}°${pad(z.min)}</span><span class="sg">${g(z.glyph)}</span>${b.retro && id !== 'Node' ? '<span class="rx">R</span>' : ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<p class="muted">${MONTHS_FULL[m - 1]} ${y}: положения на 0:00 по Гринвичу (UTC), тропический зодиак, ${app.state.nodeMode === 'mean' ? 'средний' : 'истинный'} узел.</p>
      <div class="nat-scroll"><table class="nat-table eph-table"><thead><tr><th>День</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function renderDign() {
    const nat = natal(), r = F.dignityTable(nat);
    const rows = r.rows.map((x) => `<tr><td>${bodyName(x.id)}</td><td class="ps">${zpos(x.p.lon)}</td>
      <td>${x.items.map(([k, v]) => `<span class="tag ${v > 0 ? 'good' : 'bad'}">${k} ${v > 0 ? '+' : ''}${v}</span>`).join(' ')}</td>
      <td class="pos ${x.total < 0 ? 'neg-t' : 'pos-t'}">${x.total > 0 ? '+' : ''}${x.total}</td></tr>`).join('');
    const al = r.almuten;
    return `<p class="muted">Баллы по Лилли: обитель +5, экзальтация +4, триплицитет +3, термы +2, фас +1; изгнание −5, падение −4, перегрин (нет ни одного достоинства) −5. Египетские термы, триплицитеты Дорофея, халдейские фасы. ${nat.isDay ? 'Карта дневная.' : 'Карта ночная.'}</p>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Планета</th><th>Положение</th><th>Достоинства</th><th>Сумма</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h4>Альмутен карты</h4>
      <div class="tool-lead"><div class="big-glyph" style="color:${BODY[al[0][0]].color}">${g(BODY[al[0][0]].glyph)}</div><div><b>${BODY[al[0][0]].ru}: ${al[0][1]} ${plural(al[0][1], 'балл', 'балла', 'баллов')}</b>
        <p class="muted">Планета с наибольшей властью над Солнцем, Луной, Асцендентом, MC и жребием Фортуны. Следом: ${al.slice(1, 3).map(([id, v]) => `${BODY[id].ru} ${v}`).join(', ')}.</p></div></div>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Точка</th><th>Положение</th><th>Альмутен точки</th></tr></thead><tbody>${r.perPoint.map((p) => `<tr><td>${esc(p.ru)}</td><td class="ps">${zpos(p.lon)}</td><td>${bodyName(p.almuten)} <span class="muted">${p.points}</span></td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderDisp() {
    const nat = natal(), o = opts(), r = F.dispositors(nat, o.modern);
    const chain = (c) => c.path.map((id, i) => `${i ? '<span class="arr">→</span>' : ''}${bodyG(id)}<span class="cn">${BODY[id].ru}</span>`).join('') + (c.end === 'own' ? '<span class="tag good">в своём знаке</span>' : '<span class="tag">цикл</span>');
    return `<p class="muted">Каждая планета «подчиняется» управителю знака, в котором стоит; цепочка идёт дальше, пока не дойдёт до планеты в своём знаке или не замкнётся в цикл (взаимная рецепция). ${o.modern ? 'Управители современные: Уран — Водолей, Нептун — Рыбы, Плутон — Скорпион.' : 'Управители классические, семь планет.'}</p>
      <label class="chk"><input type="checkbox" id="dispModern" ${o.modern ? 'checked' : ''}> Современные управители (с Ураном, Нептуном, Плутоном)</label>
      <ul class="chains">${r.chains.map((c) => `<li>${chain(c)}</li>`).join('')}</ul>
      <p>${r.final ? `<b>Конечный диспозитор: ${bodyName(r.final)}.</b> Все цепочки сходятся к этой планете.` : `Единого конечного диспозитора нет. ${r.own.length ? `В своём знаке: ${r.own.map(bodyName).join(', ')}.` : ''}`}</p>`;
  }

  function renderLots() {
    const nat = natal(), list = F.lots(nat);
    return `<p class="muted">Жребии Павла Александрийского. ${nat.isDay ? 'Карта дневная — формулы дневные.' : 'Карта ночная — слагаемые в формулах меняются местами.'}</p>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Жребий</th><th>Положение</th><th>Дом</th><th>Формула</th><th>Тема</th></tr></thead><tbody>${list.map((l) => `<tr><td class="nm">${esc(l.ru)}</td><td class="ps">${zpos(l.lon)}</td><td class="hs">${RN[l.house]}</td><td class="muted">${esc(l.formula)}</td><td>${esc(l.meaning)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderStars() {
    const nat = natal(), pts = nat.points.filter((p) => p.id !== 'SNode').concat(nat.angles);
    const r = F.starContacts(app.chart.utcMs, pts, 1.5);
    const contact = r.contacts.length ? r.contacts.map((c) => `<tr><td class="nm">★ ${esc(c.star.ru)}</td><td>${c.point.angle ? `<span class="ang">${c.point.glyph}</span>` : `<span style="color:${c.point.color}">${g(c.point.glyph)}</span>`} ${esc(c.point.ru)}</td><td class="pos">${c.orb.toFixed(2).replace('.', ',')}°</td><td class="muted">${esc(c.star.nature)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Соединений с яркими звёздами в пределах 1,5° нет.</td></tr>';
    const all = r.stars.slice().sort((a, b) => a.lon - b.lon).map((s) => `<tr><td>${esc(s.ru)}</td><td class="ps">${zpos(s.lon)}</td><td class="muted">${esc(s.nature)}</td></tr>`).join('');
    return `<p class="muted">Соединения планет и углов карты с яркими звёздами, орб до 1,5°. Положения звёзд пересчитаны на дату рождения с учётом прецессии. «Природа» — традиционное сравнение звезды с планетами.</p>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Звезда</th><th>Точка карты</th><th>Орб</th><th>Природа</th></tr></thead><tbody>${contact}</tbody></table></div>
      <details class="more"><summary>Все звёзды на дату рождения (${r.stars.length})</summary><div class="nat-scroll"><table class="nat-table"><tbody>${all}</tbody></table></div></details>`;
  }

  function renderDeg30() {
    const nat = natal(), pts = nat.points.filter((p) => p.id !== 'SNode').concat(nat.angles);
    const W = 1000, X0 = 30, X1 = 970, sx = (v) => X0 + (v / 30) * (X1 - X0);
    const items = pts.map((p) => ({ p, v: n360(p.lon) % 30 })).sort((a, b) => a.v - b.v);
    // stack labels that would collide
    const rows = [];
    for (const it of items) { let r = 0; while (rows[r] != null && sx(it.v) - rows[r] < 46) r++; rows[r] = sx(it.v); it.row = r; }
    const H = 90 + rows.length * 46;
    let svg = `<line x1="${X0}" y1="40" x2="${X1}" y2="40" class="d30-axis"/>`;
    for (let dgr = 0; dgr <= 30; dgr++) svg += `<line x1="${sx(dgr)}" y1="${dgr % 5 ? 34 : 28}" x2="${sx(dgr)}" y2="40" class="d30-tick"/>${dgr % 5 ? '' : `<text x="${sx(dgr)}" y="20" class="d30-lab">${dgr}°</text>`}`;
    for (const it of items) {
      const x = sx(it.v), y = 72 + it.row * 46;
      svg += `<line x1="${x}" y1="40" x2="${x}" y2="${y - 16}" class="d30-conn" stroke="${it.p.color || 'var(--brass)'}"/>`;
      svg += it.p.angle ? `<text x="${x}" y="${y}" class="d30-ang">${it.p.glyph}</text>` : `<text x="${x}" y="${y}" class="d30-pl" style="fill:${it.p.color}">${g(it.p.glyph)}</text>`;
      svg += `<text x="${x}" y="${y + 22}" class="d30-deg">${Math.floor(it.v)}°${pad(Math.floor((it.v % 1) * 60))}</text>`;
    }
    // close pairs: degree conjunctions regardless of sign
    const pairs = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const dv = Math.abs(items[i].v - items[j].v);
      if (dv <= 1.5) pairs.push([items[i].p, items[j].p, dv]);
    }
    return `<p class="muted">Все точки карты на шкале 0–30°, без учёта знака. Точки на одном градусе разных знаков связаны между собой (на этом строятся полуаспекты и «градусные» соответствия).</p>
      <div class="nat-scroll"><svg class="d30" viewBox="0 0 ${W} ${H}" role="img" aria-label="Тридцатиградусник">${svg}</svg></div>
      ${pairs.length ? `<h4>Близкие градусы (до 1,5°)</h4><ul class="chains">${pairs.sort((a, b) => a[2] - b[2]).map(([a, b, dv]) => `<li>${a.angle ? a.glyph : `<span style="color:${a.color}">${g(a.glyph)}</span>`} ${esc(a.ru)} <span class="arr">·</span> ${b.angle ? b.glyph : `<span style="color:${b.color}">${g(b.glyph)}</span>`} ${esc(b.ru)} <span class="muted">${dv.toFixed(2).replace('.', ',')}°</span></li>`).join('')}</ul>` : ''}`;
  }

  const RENDER = { hours: renderHours, voc: renderVoc, lunar: renderLunar, eph: renderEph, dign: renderDign, disp: renderDisp, lots: renderLots, stars: renderStars, deg30: renderDeg30 };

  /* ------------------------------- controls ------------------------------- */
  function initControls() {
    $('toolList').innerHTML = TOOLS.map((t) => `<button type="button" data-t="${t.id}">${t.ru}</button>`).join('');
    $('toolList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().tool = b.dataset.t; app.save(); update(); });
    $('toolDate').addEventListener('change', (e) => { opts().date = e.target.value || null; app.save(); update(); });
    $('toolToday').addEventListener('click', () => { opts().date = null; app.save(); update(); });
    app.makePlaceSearch($('toolPlace'), $('toolSuggest'), place, (p) => { opts().place = p; app.save(); update(); });
    $('toolHome').addEventListener('click', () => { opts().place = null; $('toolPlace').value = app.placeLabel(place()); app.save(); update(); });
    $('toolOut').addEventListener('change', (e) => {
      if (e.target.id === 'vocClassic') { opts().classic = e.target.checked; app.save(); update(); }
      if (e.target.id === 'dispModern') { opts().modern = e.target.checked; app.save(); update(); }
    });
  }

  function update() {
    if (!app || !app.chart || $('toolsView').hidden) return;
    const o = opts(), tool = TOOLS.find((t) => t.id === o.tool) || TOOLS[0];
    $('toolList').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === tool.id)));
    const nav = $('toolList'), on = nav.querySelector('[aria-pressed="true"]');
    if (on && nav.scrollWidth > nav.clientWidth) {   // phones: keep the chosen tool visible in the scrolling row
      const l = on.offsetLeft - nav.offsetLeft, r = l + on.offsetWidth;
      if (l < nav.scrollLeft || r > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = l - 16;
    }
    $('toolDateBox').hidden = tool.kind !== 'date';
    $('toolDate').value = o.date || todayISO();
    if (document.activeElement !== $('toolPlace')) $('toolPlace').value = app.placeLabel(place());
    const st = app.state, [y, m, d] = st.date.split('-').map(Number);
    $('toolTitle').textContent = tool.ru;
    $('toolSub').textContent = tool.kind === 'natal' ? `По натальной карте: ${d} ${MONTHS[m - 1]} ${y}, ${st.time}, ${st.place.name}` : `На дату и место: ${(o.date || todayISO()).split('-').reverse().join('.')}, ${place().name}`;
    try { $('toolOut').innerHTML = RENDER[tool.id](); }
    catch (err) { $('toolOut').innerHTML = `<p class="status">Не получилось посчитать: ${esc(err.message)}</p>`; }
  }

  window.ToolsView = { init(a) { app = a; opts(); initControls(); }, update };
})();
