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
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
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
    { id: 'prof', ru: 'Профекции', kind: 'natal' },
    { id: 'transits', ru: 'Календарь транзитов', kind: 'natal' },
    { id: 'cycles', ru: 'Циклы жизни', kind: 'natal' },
    { id: 'num', ru: 'Нумерология', kind: 'birth' },
    { id: 'bio', ru: 'Биоритмы', kind: 'bio' },
  ];
  const C = window.CYCLES;
  const SIGN_ACC = ['Овна', 'Тельца', 'Близнецы', 'Рака', 'Льва', 'Деву', 'Весы', 'Скорпиона', 'Стрельца', 'Козерога', 'Водолея', 'Рыбы'];
  const SIGN_LOC = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
  const HOUSE_TOPIC = ['', 'тело, характер, новые начинания', 'деньги и имущество', 'братья и сёстры, соседи, поездки, учёба, общение', 'дом, родители, корни', 'дети, творчество, удовольствия, романы',
    'работа, здоровье, повседневные дела', 'брак, партнёры, открытые противники', 'кризисы, чужие деньги, долги, наследство', 'дальние поездки, высшее образование, вера', 'карьера, статус, достижения',
    'друзья, покровители, надежды', 'уединение, скрытые дела, усталость и восстановление'];
  const ptName = (p) => (p.angle ? `<span class="ang">${p.glyph}</span> ${p.ru}` : bodyName(p.id));
  const MONTHS_NOM = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const monthYear = (ms, tz) => { const d = new Date(ms + ACG.tzOffsetMin(tz || 'UTC', ms) * 60000); return `${MONTHS_NOM[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const dayMonth = (ms, tz, year) => { const d = new Date(ms + ACG.tzOffsetMin(tz || 'UTC', ms) * 60000); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`; };
  const transitPoints = (nat) => nat.points.filter((p) => p.planet).concat(nat.angles);

  let app = null;
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function opts() {
    const o = app.state.tools || (app.state.tools = {}), defs = { tool: 'hours', date: null, place: null, classic: false, modern: false, year: null, mars: false, name: '', bioBirth: null, bioDate: null, bioDays: 30 };
    for (const k in defs) if (!(k in o)) o[k] = defs[k];
    return o;
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
        <td>в ${SIGN_ACC[v.nextSign]} ${g(ACG.SIGNS[v.nextSign][0])}</td></tr>`;
    }).join('');
    return `<p class="muted">Луна без курса — время от последнего точного мажорного аспекта Луны к планетам до её перехода в следующий знак. Время местное для ${esc(P.name)}; ${o.classic ? 'учитываются только классические планеты.' : 'учитываются все планеты до Плутона.'}</p>
      <label class="chk"><input type="checkbox" id="vocClassic" ${o.classic ? 'checked' : ''}> Только классические планеты (без Урана, Нептуна, Плутона)</label>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Начало</th><th>Конец</th><th>Длится</th><th>Последний аспект</th><th>Переход</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // the Moon's sign changes: search forward or back from `ms` in 2-hour steps, then bisect
  function moonIngress(ms, dir) {
    const sign = (t) => Math.floor(n360(C.lonOf('Moon', t)) / 30), s0 = sign(ms);
    let a = ms, b = ms;
    for (let k = 0; k < 40; k++) { b = a + dir * 7200000; if (sign(b) !== s0) break; a = b; }
    for (let k = 0; k < 30; k++) { const mid = (a + b) / 2; if (sign(mid) === s0) a = mid; else b = mid; }
    return dir > 0 ? b : a;
  }
  function moonPhase(ms) {
    const el = n360(C.lonOf('Moon', ms) - C.lonOf('Sun', ms)), lit = Math.round((1 - Math.cos(el * Math.PI / 180)) / 2 * 100);
    const name = el < 12 ? 'новолуние' : el < 84 ? 'растущий серп' : el < 96 ? 'первая четверть' : el < 168 ? 'растущая Луна' : el < 192 ? 'полнолуние'
      : el < 264 ? 'убывающая Луна' : el < 276 ? 'последняя четверть' : el < 348 ? 'убывающий серп' : 'новолуние';
    return { el, lit, name, waxing: el < 180 };
  }
  function renderLunar() {
    const { y, m, d } = dateParts(), P = place();
    const today = !opts().date || opts().date === todayISO();
    const at = today ? Date.now() : ACG.localToUtc(y, m, d, 12, 0, P.tz).utc;
    const r = F.lunarDays(at, P);
    const signOf = (t) => Math.floor(n360(C.lonOf('Moon', t)) / 30);
    const sgShort = (t0, t1) => { const a = signOf(t0), b = signOf(t1); const one = (s) => `<span class="sg" title="${ACG.SIGNS[s][1]}">${g(ACG.SIGNS[s][0])}</span>`; return a === b ? one(a) : `${one(a)}<span class="arr">→</span>${one(b)}`; };
    const rows = r.days.map((x) => `<tr class="${at >= x.start && at < x.end ? 'on' : ''}"><td class="hs">${x.n}</td><td class="pos">${tLocal(x.start, P.tz, true)}</td><td class="pos">${tLocal(x.end, P.tz, true)}</td><td class="lsg">${sgShort(x.start, x.end - 60000)}</td></tr>`).join('');
    const cur = r.days.find((x) => at >= x.start && at < x.end);
    const mLon = C.lonOf('Moon', at), ms = Math.floor(n360(mLon) / 30), z = ACG.formatZodiac(mLon), ph = moonPhase(at);
    const entered = moonIngress(at, -1), leaves = moonIngress(at, 1), next = (ms + 1) % 12;
    return `<div class="tool-lead"><div class="big-num">${cur ? cur.n : '—'}</div><div><b>${cur ? `${cur.n}-й лунный день` : ''} на ${d} ${MONTHS[m - 1]} ${y}, ${esc(P.name)}</b>
      <p class="muted">Первый лунный день начинается в момент новолуния (${tLocal(r.newMoon, P.tz, true)}), каждый следующий — с восходом Луны. Следующее новолуние: ${tLocal(r.nextNewMoon, P.tz, true)}.</p></div></div>
      <div class="tool-lead"><div class="big-glyph" style="color:${BODY.Moon.color}">${g(ACG.SIGNS[ms][0])}</div><div><b>Луна в ${SIGN_LOC[ms]}, ${z.deg}°${pad(z.min)}′</b>
      <p class="muted">${today ? `Сейчас, ${tLocal(at, P.tz)}` : 'В полдень'}: ${ph.name}, освещено ${ph.lit}%. В знаке с ${tLocal(entered, P.tz, true)}, перейдёт в ${SIGN_ACC[next]} ${g(ACG.SIGNS[next][0])} ${tLocal(leaves, P.tz, true)}.</p></div></div>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>День</th><th>Начало</th><th>Конец</th><th>Знак</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
    // the aspect the pair actually makes in the chart: the nearest multiple of 30°
    const ASP30 = [['соединение', ''], ['полусекстиль', ''], ['секстиль', 'good'], ['квадрат', 'bad'], ['трин', 'good'], ['квинконс', ''], ['оппозиция', 'bad']];
    const asp30 = (a, b) => ASP30[Math.round(Math.abs(n180(a.lon - b.lon)) / 30)];
    const pName = (p) => (p.angle ? p.glyph : `<span style="color:${p.color}">${g(p.glyph)}</span>`);
    return `<p class="muted">Вся карта сложена в один знак: каждая точка стоит на своём градусе от 0 до 30, без учёта знака. Так 5° Овна, 5° Рака и 5° Скорпиона попадают в одно место шкалы. Точки, которые стоят друг под другом, связаны в карте аспектом.</p>
      <div class="nat-scroll"><svg class="d30" viewBox="0 0 ${W} ${H}" role="img" aria-label="Тридцатиградусник">${svg}</svg></div>
      ${pairs.length ? `<h4>Близкие градусы (до 1,5°) и какой это аспект в карте</h4><ul class="chains">${pairs.sort((a, b) => a[2] - b[2]).map(([a, b, dv]) => { const [an, cl] = asp30(a, b); return `<li>${pName(a)} ${esc(a.ru)} <span class="arr">·</span> ${pName(b)} ${esc(b.ru)} <span class="tag${cl ? ` ${cl}` : ''}">${an}</span> <span class="muted">${dv.toFixed(2).replace('.', ',')}°</span></li>`; }).join('')}</ul>` : ''}
      <details class="more d30-about"><summary>Что такое тридцатиградусник и зачем он нужен</summary>
        <p><b>Какие аспекты он показывает.</b> Если две точки стоят на шкале рядом, расстояние между ними в карте кратно 30°. Это весь 30-градусный ряд: соединение (0°), полусекстиль (30°), секстиль (60°), квадрат (90°), трин (120°), квинконс (150°) и оппозиция (180°). Сама шкала не различает, какой из них: это видно по знакам, и в списке выше аспект подписан. Полуквадрат (45°) и полуторный квадрат (135°) здесь не видны — для них нужен 45- или 90-градусный круг.</p>
        <p><b>Зачем он нужен.</b></p>
        <ul>
          <li>Увидеть одним взглядом все связи этого ряда, в том числе между далёкими знаками, и не пропустить точные аспекты.</li>
          <li>Заметить скопления: если на одном градусе собрались три-четыре точки, этот градус — узел карты, все они связаны между собой и включаются вместе.</li>
          <li>Работать со временем: транзитная планета, придя на этот градус любого знака, задевает сразу всю группу — видно, какие темы запустятся одновременно.</li>
          <li>Проверять время рождения: ASC и MC быстро идут по шкале, и их совпадение с градусами планет помогает при ректификации.</li>
        </ul>
        <p><b>Как читать.</b> Смотреть, какие точки стоят друг под другом. Чем ближе градусы, тем сильнее связь: до 1° — точный аспект. Зелёным в списке подписаны гармоничные аспекты (секстиль, трин), красным — напряжённые (квадрат, оппозиция).</p>
      </details>`;
  }

  /* Annual profections, Hellenistic whole signs from the Ascendant (Demetra George, Chris Brennan) */
  function renderProf() {
    const nat = natal(), birth = app.chart.utcMs, tz = app.state.place.tz, now = Date.now();
    const pr = C.profections(nat, birth, now), cur = pr.cur, lord = cur.lord;
    const lp = nat.points.find((p) => p.id === lord);
    const inSign = nat.points.filter((p) => (p.planet || p.id === 'Node') && p.sign === cur.sign);
    const ascIn = Math.floor(n360(nat.asc) / 30) === cur.sign;
    const [sg, sname] = ACG.SIGNS[cur.sign];
    let lordTr = '';
    if (lord !== 'Moon') {
      const slow = lord === 'Mars' || lord === 'Jupiter' || lord === 'Saturn';
      const hits = C.transitCalendar(transitPoints(nat), cur.from, cur.to, [lord]).filter((h) => slow || h.asp === 0);
      lordTr = hits.length ? `<h4>Транзиты управителя года (${BODY[lord].ru}) в этом году</h4>
        <p class="muted">Управитель года «включает» натальные точки, которых касается: эти даты — самые заметные моменты года.${slow ? '' : ' Для быстрой планеты показаны только соединения.'}</p>
        ${(() => { const tbl = `<div class="nat-scroll"><table class="nat-table"><tbody>${hits.map((h) => `<tr class="${Math.abs(now - h.t) < 3 * 86400000 ? 'on' : ''}"><td class="pos">${dayMonth(h.t, tz, true)}</td><td>${bodyG(h.tr)} ${g(ASP_G[h.asp])} ${ptName(h.natal)}</td><td class="muted">${ASP_RU[h.asp]}${h.passes > 1 ? `, ${h.pass}-й проход из ${h.passes}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
          return hits.length > 10 ? `<details class="more"><summary>Показать ${hits.length} ${plural(hits.length, 'дату', 'даты', 'дат')}</summary>${tbl}</details>` : tbl; })()}` : '';
    }
    const months = pr.months.map((m) => `<tr class="${now >= m.from && now < m.to ? 'on' : ''}"><td class="pos">${dayMonth(m.from, tz)} – ${dayMonth(m.to - 86400000, tz)}</td><td><span class="sg">${g(ACG.SIGNS[m.sign][0])}</span> ${ACG.SIGNS[m.sign][1]}</td><td>${bodyName(m.lord)}</td><td class="hs">${RN[((cur.house - 1 + m.k) % 12) + 1]}</td></tr>`).join('');
    const wheel = Array.from({ length: 12 }, (_, h) => {
      const sign = (Math.floor(n360(nat.asc) / 30) + h) % 12, ages = [];
      for (let a = h; a <= 95; a += 12) ages.push(a === pr.age ? `<b>${a}</b>` : a);
      return `<tr class="${h + 1 === cur.house ? 'on' : ''}"><td class="hs">${RN[h + 1]}</td><td><span class="sg">${g(ACG.SIGNS[sign][0])}</span> ${ACG.SIGNS[sign][1]}</td><td>${bodyName(C.DOMICILE[sign])}</td><td class="pos">${ages.join(', ')}</td></tr>`;
    }).join('');
    return `<div class="tool-lead"><div class="big-glyph" style="color:${BODY[lord].color}">${g(BODY[lord].glyph)}</div><div><b>${pr.age} ${plural(pr.age, 'год', 'года', 'лет')}: год ${RN[cur.house]} дома, знак ${sname} ${g(sg)}. Управитель года — ${BODY[lord].ru}</b>
        <p class="muted">С ${dayMonth(cur.from, tz, true)} по ${dayMonth(cur.to - 86400000, tz, true)}. Темы года: ${HOUSE_TOPIC[cur.house]}.</p></div></div>
      <p>${lp ? `${BODY[lord].ru} в натальной карте стоит в ${SIGN_LOC[lp.sign]}, в ${RN[lp.house]} доме${lp.retro ? ', ретроградный' : ''}: дела этого дома (${HOUSE_TOPIC[lp.house]}) тоже выходят на первый план, а состояние планеты показывает, как пройдёт год.` : ''}
        ${inSign.length || ascIn ? ` В знаке года в натальной карте ${inSign.length ? `стоят: ${inSign.map((p) => bodyName(p.id)).join(', ')}` : ''}${ascIn ? `${inSign.length ? '; ' : ''}это знак Асцендента` : ''} — они «активируются» и проявятся сильнее обычного.` : ' Натальных планет в знаке года нет, поэтому главное — управитель года и его транзиты.'}</p>
      <p class="muted">Метод эллинистической астрологии (его возродили Роберт Хэнд и Project Hindsight, подробно изложила Деметра Джордж): каждый год жизни Асцендент сдвигается на один знак, начиная с дня рождения; через 12 лет цикл повторяется. Внутри года так же по месяцам сдвигается знак месяца.</p>
      ${lordTr}
      <h4>Месяцы этого года</h4>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Период</th><th>Знак месяца</th><th>Управитель</th><th>Дом</th></tr></thead><tbody>${months}</tbody></table></div>
      <h4>Колесо профекций</h4>
      <div class="nat-scroll"><table class="nat-table"><thead><tr><th>Дом</th><th>Знак</th><th>Управитель</th><th>Возраст (лет)</th></tr></thead><tbody>${wheel}</tbody></table></div>`;
  }

  /* Transit calendar: exact dates of the slow planets' aspects to the natal planets and angles (Robert Hand, "Planets in Transit") */
  function renderTransits() {
    const o = opts(), nat = natal(), tz = app.state.place.tz, now = Date.now();
    const by = +app.state.date.slice(0, 4), cy = new Date().getFullYear();
    const yr = o.year && o.year >= by && o.year <= by + 100 ? o.year : Math.max(cy, by);
    const from = ACG.localToUtc(yr, 1, 1, 0, 0, tz).utc, to = ACG.localToUtc(yr + 1, 1, 1, 0, 0, tz).utc;
    const ids = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    if (o.mars) ids.unshift('Mars');
    const hits = C.transitCalendar(transitPoints(nat), from, to, ids);
    const pr = C.profections(nat, app.chart.utcMs, Math.min(Math.max(now, from), to - 1));
    const years = []; for (let y = Math.max(by, cy - 30); y <= Math.min(by + 100, cy + 30); y++) years.push(`<option value="${y}" ${y === yr ? 'selected' : ''}>${y}</option>`);
    // "active now": a transit whose period (from entering the 1° orb to leaving it) covers today
    const seen = new Set(), active = hits.filter((h) => { const k = `${h.tr}${h.asp}${h.natal.id}`; if (seen.has(k) || now < h.win[0] || now > h.win[1]) return false; seen.add(k); return true; });
    const orbNow = (h) => Math.abs(Math.abs(n180(C.lonOf(h.tr, now) - h.natal.lon)) - h.asp);
    let lastM = -1, rows = '';
    for (const h of hits) {
      const d = new Date(h.t + ACG.tzOffsetMin(tz, h.t) * 60000);
      if (d.getUTCMonth() !== lastM) { lastM = d.getUTCMonth(); rows += `<tr class="mh"><td colspan="3">${MONTHS_FULL[lastM]} ${yr}</td></tr>`; }
      const lordTag = h.tr === pr.cur.lord ? ' <span class="tag good">управитель года</span>' : '';
      const per = `${h.passes > 1 ? `${h.pass}-й проход из ${h.passes}<br>` : ''}${monthYear(h.win[0], tz)}${monthYear(h.win[0], tz) !== monthYear(h.win[1], tz) ? ` – ${monthYear(h.win[1], tz)}` : ''}`;
      rows += `<tr class="${now >= h.win[0] && now <= h.win[1] ? 'on' : ''}"><td class="pos">${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}</td>
        <td><div class="tr-h">${bodyG(h.tr)} ${BODY[h.tr].ru} <span class="tg">${g(ASP_G[h.asp])}</span> <span class="muted">${ASP_RU[h.asp]}</span> ${ptName(h.natal)}${lordTag}</div>
          <div class="tr-m">${esc(C.meaning(h))}</div><div class="tr-pm">${per.replace('<br>', ', ')}</div></td>
        <td class="muted tr-p">${per}</td></tr>`;
    }
    return `<div class="tool-ctl"><div class="field"><label for="trYear">Год</label><select class="inp" id="trYear">${years.join('')}</select></div>
        <label class="chk"><input type="checkbox" id="trMars" ${o.mars ? 'checked' : ''}> Добавить Марс (быстрые, короткие транзиты)</label></div>
      <p class="muted">Точные даты аспектов ${o.mars ? 'Марса, ' : ''}Юпитера, Сатурна, Урана, Нептуна и Плутона к планетам и углам карты. Из-за попятного движения транзит часто проходит точку два или три раза — это один процесс, он длится весь указанный период (в орбе 1°). Толкования составлены по схеме Роберта Хэнда: что несёт транзитная планета + какую сферу она затрагивает + характер аспекта.</p>
      ${yr === cy || (now >= from && now < to) ? `<h4>Действуют сейчас</h4>${active.length ? `<ul class="chains">${active.map((h) => `<li>${bodyG(h.tr)} <span class="cn">${BODY[h.tr].ru}</span> <span class="arr">${g(ASP_G[h.asp])}</span> ${h.natal.angle ? `<span class="cn">${h.natal.ru}</span>` : `${bodyG(h.natal.id)}<span class="cn">${BODY[h.natal.id].ru}</span>`} <span class="muted">${orbNow(h) <= 1 ? `сейчас орб ${orbNow(h).toFixed(1).replace('.', ',')}°` : 'между проходами'}, до ${dayMonth(h.win[1], tz, true)}</span></li>`).join('')}</ul>` : '<p class="muted">Сейчас нет транзитов медленных планет в орбе 1°.</p>'}` : ''}
      <div class="nat-scroll"><table class="nat-table tr-table"><thead><tr><th>Дата</th><th>Транзит и смысл</th><th>Проход, период</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">В этом году точных транзитов нет.</td></tr>'}</tbody></table></div>`;
  }

  /* Life cycles: returns, squares and oppositions of the slow planets to themselves (Liz Greene's Saturn, Robert Hand) */
  function renderCycles() {
    const nat = natal(), birth = app.chart.utcMs, tz = app.state.place.tz, now = Date.now();
    const pts = nat.points.filter((p) => p.planet || p.id === 'Chiron' || p.id === 'Node');
    const list = C.lifeCycles(pts, birth, 90);
    const next = list.find((x) => x.last >= now);
    const topic = (h) => `<b>${RN[h]}</b> — ${HOUSE_TOPIC[h]}`;
    // the part of life a milestone touches: where the natal point stands, the house the moving planet crosses then, the houses the planet rules
    function spheres(x) {
      const np = pts.find((p) => p.id === x.id), nm = BODY[x.id].ru;
      if (!np) return '';
      const trH = N.houseOf(n360(C.lonOf(x.id, x.t)), nat.cusps), out = [];
      if (x.id === 'Node') {
        const sh = (np.house + 5) % 12 + 1;
        out.push(`Северный узел в карте — в доме ${topic(np.house)}: сюда жизнь зовёт расти.`);
        out.push(`Южный узел — в доме ${topic(sh)}: здесь опыт уже наработан, и отсюда пора двигаться дальше.`);
        if (x.asp === 180) out.push(`В это время Северный узел идёт через дом ${topic(trH)}.`);
      } else {
        out.push(`Натальный ${nm} — в доме ${topic(np.house)}.`);
        if (trH !== np.house) out.push(`Транзитный ${nm} в это время идёт через дом ${topic(trH)}.`);
        const ruled = [];
        for (let h = 1; h <= 12; h++) if ((N.RULERS[Math.floor(n360(nat.cusps[h]) / 30)] || []).includes(x.id)) ruled.push(h);
        if (ruled.length) out.push(`${nm} управляет ${ruled.length > 1 ? 'домами' : 'домом'} ${ruled.map(topic).join('; ')}.`);
      }
      return out.map((l) => `<li>${l}</li>`).join('');
    }
    function reading(x) {
      const r = C.lifeRead(x);
      if (!r) return '';
      return `<div class="cyc-read">
          <p>${esc(r.how)}${r.age ? ` <span class="cyc-age">${esc(r.age)}</span>` : ''}</p>
          <h5>Какие сферы жизни задействованы</h5><ul class="cyc-sph">${spheres(x)}</ul>
          <div class="bio-dd cyc-pm"><div class="ok"><h5>В плюсе</h5><ul>${r.plus.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div><div class="no"><h5>В минусе</h5><ul>${r.minus.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div></div>
          <p class="cyc-tip"><b>Совет:</b> ${esc(r.tip)}</p>
        </div>`;
    }
    const rows = list.map((x) => {
      const span = monthYear(x.t, tz) + (x.passes > 1 && monthYear(x.t, tz) !== monthYear(x.last, tz) ? ` – ${monthYear(x.last, tz)}` : '');
      const rd = x === next ? '' : reading(x);
      return `<tr class="${x === next ? 'on' : ''} ${x.last < now ? 'past' : ''}"><td class="hs">${Math.floor(x.age)}</td><td class="pos tr-p">${span}</td><td>${bodyG(x.id)} <b>${esc(x.ru)}</b>${x.passes > 1 ? ` <span class="muted">(${x.passes} ${plural(x.passes, 'проход', 'прохода', 'проходов')})</span>` : ''}<div class="tr-m">${esc(x.text)}</div><div class="tr-pm">${span}</div>${x === next ? '<div class="tr-m cyc-up">расшифровка — выше</div>' : rd ? `<details class="more cyc-more"><summary>Расшифровка</summary>${rd}</details>` : ''}</td></tr>`;
    }).join('');
    return `<p class="muted">Большие циклы: медленные планеты возвращаются на своё натальное место или встают к нему в квадрат и оппозицию. Это общие для всех вехи (около 7, 14, 21, 29, 42 лет), но точный возраст у каждого свой. Лиз Грин в книге «Сатурн» описывает возвращение Сатурна как время, когда приходится строить жизнь на собственном фундаменте; Роберт Хэнд разбирает каждую веху в «Planets in Transit».</p>
      ${next ? `<div class="tool-lead"><div class="big-glyph" style="color:${BODY[next.id].color}">${g(BODY[next.id].glyph)}</div><div><b>${next.t <= now ? 'Сейчас' : 'Следующая веха'}: ${esc(next.ru)}</b><p class="muted">${monthYear(next.t, tz)}${next.passes > 1 ? ` – ${monthYear(next.last, tz)}` : ''}, в ${Math.floor(next.age)} ${plural(Math.floor(next.age), 'год', 'года', 'лет')}. ${esc(next.text)[0].toUpperCase() + esc(next.text).slice(1)}.</p></div></div>
      ${reading(next)}` : ''}
      <p class="muted">У каждой вехи в таблице есть расшифровка: как она действует, какие сферы жизни затрагивает в этой карте и как может проявиться в плюсе и в минусе. Сферы берутся по домам: где стоит натальная планета, через какой дом она идёт в это время и какими домами управляет.</p>
      <div class="nat-scroll"><table class="nat-table cyc-table"><thead><tr><th>Возраст</th><th>Когда</th><th>Веха</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* Numerology: Pythagorean numbers (Russian and Latin letters), the Chaldean name number as used by Anupam Kapil, and the Pythagoras square */
  function renderNum() {
    const o = opts(), dob = app.state.date, cy = new Date().getFullYear();
    const r = C.numerology(o.name || '', dob, cy);
    const tile = (n, ru, sub) => `<div class="num-tile"><div class="big-num">${n == null ? '—' : n}</div><div><b>${ru}</b>${sub ? `<span class="muted"> ${sub}</span>` : ''}<p>${n == null ? 'Введите имя, чтобы посчитать.' : esc(C.NUM_TEXT[n] || '')}</p></div></div>`;
    const cell = (k) => `<div class="psy-c ${r.square[k] ? '' : 'empty'}"><span class="psy-d">${r.square[k] ? String(k).repeat(r.square[k]) : '—'}</span><span class="psy-l">${C.SQUARE_TEXT[k]}</span></div>`;
    const [y, m, d] = dob.split('-');
    const years = [0, 1, 2].map((k) => { const v = C.numerology('', dob, cy + k).personalYear; return `<li><b>${cy + k}</b> <span class="big-mini">${v}</span> ${esc(C.YEAR_TEXT[v])}</li>`; }).join('');
    return `<form class="tool-ctl" id="numForm" autocomplete="off"><div class="field tool-where"><label for="numName">Имя и фамилия</label><input class="inp" type="text" id="numName" value="${esc(o.name || '')}" placeholder="Например: Анна Иванова" spellcheck="false" autocapitalize="words"></div>
        <button type="submit" class="pill">Посчитать</button></form>
      <p class="muted">Дата рождения ${d}.${m}.${y} берётся из натальной карты. Буквы считаются по пифагорейской таблице (для русского алфавита: А, И, С, Ъ = 1; Б, Й, Т, Ы = 2 и так далее). Мастер-числа 11, 22 и 33 не сокращаются.</p>
      <div class="num-grid">
        ${tile(r.life, 'Число жизненного пути', 'сумма цифр даты рождения')}
        ${tile(r.birthday, 'Число дня рождения', `${+d}-е число`)}
        ${tile(r.expr, 'Число имени (выражения)', 'все буквы')}
        ${tile(r.soul, 'Число души', 'гласные')}
        ${tile(r.pers, 'Число личности', 'согласные')}
      </div>
      <h4>Халдейское число имени</h4>
      ${r.chaldean ? `<div class="tool-lead"><div class="big-num">${r.chaldean.single}</div><div><b>${r.chaldean.compound} → ${r.chaldean.single}</b> <span class="muted">(латиницей: ${esc(r.chaldean.latin)})</span><p>${esc(C.NUM_TEXT[r.chaldean.single] || '')}</p></div></div>` : '<p class="muted">Введите имя, чтобы посчитать.</p>'}
      <p class="muted">Анупам Капил работает с халдейской системой: буквы латиницы получают значения от 1 до 8 по звучанию (девятка не используется), считается то имя, которым человека зовут в жизни. Составное число (до сокращения) в этой школе тоже имеет значение.</p>
      <h4>Личный год</h4>
      <ul class="chains num-years">${years}</ul>
      <h4>Квадрат Пифагора (психоматрица)</h4>
      <div class="psy">${[1, 4, 7, 2, 5, 8, 3, 6, 9].map(cell).join('')}</div>
      <p class="muted">Цифры даты рождения и четырёх рабочих чисел (${r.work.join(', ')}), без нулей. Чем больше одинаковых цифр в клетке, тем сильнее качество; пустая клетка — качество надо развивать.</p>`;
  }


  /* Biorhythms: sine waves from the day of birth with periods of 23 (physical), 28 (emotional) and 33 days
     (intellectual), after Wilhelm Fliess, Hermann Swoboda and Alfred Teltscher. A critical day is the day the
     wave crosses zero (the crossing falls inside it); two or three on the same day make a double or triple one. */
  const BIO = [
    { id: 'p', ru: 'Физический', short: 'Физ.', per: 23, color: '#F2A541', up: 'силы и выносливость на подъёме', down: 'силы восстанавливаются, лучше не перегружаться' },
    { id: 'e', ru: 'Эмоциональный', short: 'Эмоц.', per: 28, color: '#4FB3BF', up: 'настроение и чувствительность на подъёме', down: 'эмоции тише, легче устать от людей' },
    { id: 'i', ru: 'Интеллектуальный', short: 'Интел.', per: 33, color: '#A88BEB', up: 'голова ясная, хорошо думать и решать', down: 'внимание рассеивается, сложное лучше отложить' },
  ];
  /* What a critical day means and what to do with it, for each cycle, each pair, all three, and the days when all
     three are below zero. Keys: p, e, i, pe, pi, ei, pei, low. */
  const BIO_READ = {
    p: {
      ru: 'Физический критический день',
      sum: 'Физический цикл меняет знак: тело переключается между фазой отдачи и фазой восстановления. По теории биоритмов в такой день быстрее приходит усталость, хуже координация и реакция, легче получить травму или простыть.',
      ok: ['лёгкое движение: прогулка, растяжка, спокойная йога', 'привычные дела в своём темпе, без спешки', 'работа за столом, планирование, учёба', 'ранний сон, вода, лёгкая еда'],
      no: ['тяжёлые тренировки, рекорды, соревнования', 'рискованные занятия: высота, электроинструмент, экстрим', 'долгая дорога за рулём, особенно ночью', 'физические авралы: переезд, генеральная уборка, тяжести', 'алкоголь и переедание'],
    },
    e: {
      ru: 'Эмоциональный критический день',
      sum: 'Эмоциональный цикл меняет знак, и настроение становится неустойчивым. Легче обидеться, вспылить или расстроиться из-за мелочи, реакции бывают сильнее повода. Такие дни всегда выпадают на тот день недели, в который человек родился, и повторяются каждые 14 дней.',
      ok: ['спокойные дела в одиночку или с самыми близкими', 'прогулка, природа, музыка, творчество для себя', 'рутина, которая успокаивает: уборка, готовка, порядок в вещах', 'отложить ответ на неприятное сообщение до завтра'],
      no: ['выяснять отношения и поднимать больные темы', 'важные разговоры: признания, расставания, ультиматумы', 'переговоры, собеседования, публичные выступления', 'покупки и решения на эмоциях', 'споры в чатах и письма сгоряча'],
    },
    i: {
      ru: 'Интеллектуальный критический день',
      sum: 'Интеллектуальный цикл меняет знак. Внимание рассеивается, память и логика подводят, растёт число ошибок и мелкой забывчивости: оставленные ключи, перепутанные цифры, пропущенные пункты.',
      ok: ['привычная работа, которую делаешь «на автомате»', 'повторение уже знакомого, разбор и сортировка', 'ручной труд, уборка, прогулка', 'списки дел и перепроверка всего, что уходит другим'],
      no: ['экзамены, тесты, собеседования, если их можно перенести', 'подписание договоров и крупные денежные решения', 'сложные расчёты, отчёты, важный код и релизы', 'изучение сложного нового материала', 'дорога по незнакомому маршруту'],
    },
    pe: {
      ru: 'Двойной: физический и эмоциональный',
      sum: 'Усталость тела накладывается на неустойчивое настроение: силы кончаются быстро, а раздражение приходит легко. По теории это самые конфликтные дни, и в них же выше риск травм.',
      ok: ['разгрузить день: только необходимое', 'отдых, сон, тёплый душ, неспешная прогулка', 'время с теми, с кем спокойно', 'заранее предупредить близких, что день тяжёлый'],
      no: ['тренировки на пределе и физические авралы', 'выяснение отношений, споры, ссоры', 'праздники, шумные компании, алкоголь', 'дела, где легко устать и вспылить: пробки, очереди, долгие поездки'],
    },
    pi: {
      ru: 'Двойной: физический и интеллектуальный',
      sum: 'Реакция и координация снижены, а внимание рассеяно. Это сочетание теория считает самым «аварийным»: ошибки за рулём, с техникой, на кухне, на лестнице.',
      ok: ['делать всё медленно и по одному делу', 'отдых, лёгкая растяжка, сон', 'простая привычная работа без спешки', 'чек-листы: выключена ли плита, закрыта ли дверь'],
      no: ['садиться за руль без необходимости', 'работать с острым, горячим, электроинструментом', 'спорт с риском травмы', 'сложные задачи, где ошибка дорого стоит'],
    },
    ei: {
      ru: 'Двойной: эмоциональный и интеллектуальный',
      sum: 'Решения рождаются на эмоциях, а голова не успевает их проверить. Велик риск сказать, написать, купить или подписать то, о чём потом пожалеешь.',
      ok: ['движение и спорт в обычном объёме', 'дела руками: уборка, ремонт, готовка', 'тишина, одиночество, прогулка', 'записывать мысли, а решать — завтра'],
      no: ['важные решения о работе, деньгах, отношениях', 'договоры, крупные покупки, кредиты', 'серьёзные разговоры и переписка «на нервах»', 'экзамены, переговоры, выступления'],
    },
    pei: {
      ru: 'Тройной критический день',
      sum: 'Все три цикла меняют знак одновременно. Это редкость: за первые 58 лет жизни таких дней всего семь. Теория считает их самыми неустойчивыми, поэтому день лучше заранее освободить от всего важного.',
      ok: ['отдых, сон, спокойная прогулка', 'только простые привычные дела', 'побыть с близкими, без выяснения отношений', 'перенести важное на соседние дни'],
      no: ['всё важное и необратимое: решения, договоры, серьёзные разговоры', 'дорога за рулём, тяжёлый спорт, работа с риском', 'алкоголь, переедание, бессонная ночь', 'начинать новые дела'],
    },
    low: {
      ru: 'Все три цикла ниже нуля',
      sum: 'Это не критический день, а общий спад: все три цикла в фазе восстановления. Сил, настроения и концентрации меньше обычного, но день устойчивый — просто тихий.',
      ok: ['отдых и восстановление', 'плановая рутина, доделать начатое', 'спокойные встречи с близкими'],
      no: ['начинать большие новые дела', 'брать лишние обязательства', 'требовать от себя рекордов'],
    },
  };
  const bioList = (r) => `<div class="bio-dd"><div class="ok"><h5>Можно</h5><ul>${r.ok.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div><div class="no"><h5>Лучше воздержаться</h5><ul>${r.no.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div></div>`;
  const isoDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
  const dayIso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const bioVal = (t, per) => Math.sin(2 * Math.PI * t / per);
  // a crossing of zero at t = k·per/2 falls inside day t when t ≤ k·per/2 < t + 1
  const bioCrit = (t, per) => { const h = per / 2, k = Math.ceil(t / h - 1e-9); return k * h < t + 1 - 1e-9; };
  function renderBio() {
    const o = opts(), birthIso = o.bioBirth || app.state.date, dateIso = o.bioDate || todayISO(), span = [30, 60, 90].includes(o.bioDays) ? o.bioDays : 30;
    const b0 = isoDay(birthIso), d0 = isoDay(dateIso), from = d0 - 3, to = from + span;
    const ctl = `<form class="tool-ctl bio-ctl" id="bioForm" autocomplete="off">
        <div class="field"><label for="bioBirth">Дата рождения</label><input class="inp" type="date" id="bioBirth" value="${birthIso}" min="1800-01-01" max="2100-12-31"></div>
        <div class="field"><label for="bioDate">Дата расчёта</label><input class="inp" type="date" id="bioDate" value="${dateIso}" min="1800-01-01" max="2100-12-31"></div>
        <div class="seg" id="bioSpan" role="group" aria-label="Период">${[30, 60, 90].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === span}">${n === 30 ? 'Месяц' : n === 60 ? '2 месяца' : '3 месяца'}</button>`).join('')}</div>
        ${o.bioBirth || o.bioDate ? '<button type="button" class="pill" id="bioReset">Из карты и сегодня</button>' : ''}
      </form>`;
    if (d0 < b0) return ctl + '<p class="status">Дата расчёта раньше даты рождения.</p>';
    const days = [];
    for (let n = from; n <= to; n++) {
      const t = n - b0;
      if (t < 0) continue;
      const v = BIO.map((c) => ({ c, v: bioVal(t, c.per), next: bioVal(t + 1, c.per), crit: bioCrit(t, c.per) }));
      days.push({ n, t, v, crit: v.filter((x) => x.crit).length, low: v.every((x) => x.v < 0) });
    }
    const today = days.find((x) => x.n === d0);
    const pct = (x) => { const v = Math.round(x * 100); return v === 0 ? '0%' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`; };
    const word = (x) => (x.crit ? 'критический день' : x.v >= 0 ? (x.next >= x.v ? 'подъём' : 'на подъёме, но уже идёт вниз') : (x.next >= x.v ? 'спад, но уже идёт вверх' : 'спад'));
    const [by, bm, bd] = birthIso.split('-').map(Number), [ty, tm, td] = dateIso.split('-').map(Number);
    const lead = today ? `<div class="bio-tiles">${today.v.map((x) => `<div class="bio-tile${x.crit ? ' crit' : ''}" style="--c:${x.c.color}"><span class="bio-n">${pct(x.v)}</span><b>${x.c.ru}</b><span class="bio-w">${word(x)}</span><span class="muted">${x.crit ? 'кривая пересекает ноль: день перехода, самый неустойчивый в цикле' : esc(x.v >= 0 ? x.c.up : x.c.down)}</span></div>`).join('')}</div>
      <p class="muted">${td} ${MONTHS[tm - 1]} ${ty} — ${today.t}-й день жизни (рождение ${bd} ${MONTHS[bm - 1]} ${by}). Циклы: физический ${BIO[0].per}, эмоциональный ${BIO[1].per}, интеллектуальный ${BIO[2].per} дня.${today.crit >= 2 ? ` <b class="bio-alarm">${today.crit === 3 ? 'Тройной' : 'Двойной'} критический день.</b>` : ''}</p>` : '';

    // the chart
    const W = Math.round(Math.max(300, Math.min(720, ($('toolOut').clientWidth || 720) - 30))), H = W < 480 ? 220 : 250, X0 = 34, X1 = W - 10, Y0 = 16, Y1 = H - 40, mid = (Y0 + Y1) / 2, amp = (Y1 - Y0) / 2;
    const x = (n) => X0 + (n - from) / (to - from) * (X1 - X0), y = (v) => mid - v * amp;
    let svg = '';
    for (const d of days) if (d.crit) svg += `<rect x="${x(d.n - 0.5).toFixed(1)}" y="${Y0}" width="${(x(1) - x(0)).toFixed(1)}" height="${Y1 - Y0}" class="bio-band${d.crit >= 2 ? ' strong' : ''}"/>`;
    for (const v of [1, 0.5, 0, -0.5, -1]) svg += `<line x1="${X0}" x2="${X1}" y1="${y(v)}" y2="${y(v)}" class="${v ? 'bio-grid' : 'bio-zero'}"/><text x="${X0 - 5}" y="${y(v) + 4}" class="bio-ylab">${v ? (v > 0 ? '+' : '−') + Math.abs(v * 100) : '0'}</text>`;
    const step = [1, 2, 3, 5, 7, 10, 14].find((k) => (X1 - X0) / (to - from) * k >= 26) || 14;   // day labels at least 26 px apart
    for (const d of days) {
      const dt = new Date(d.n * 86400000), first = dt.getUTCDate() === 1;
      if ((d.n - from) % step === 0 || first) svg += `<line x1="${x(d.n)}" x2="${x(d.n)}" y1="${Y1}" y2="${Y1 + 4}" class="bio-tick"/><text x="${x(d.n)}" y="${Y1 + 17}" class="bio-xlab${first ? ' m' : ''}">${first ? MONTHS_NOM[dt.getUTCMonth()] : dt.getUTCDate()}</text>`;
    }
    if (today) svg += `<line x1="${x(d0)}" x2="${x(d0)}" y1="${Y0 - 6}" y2="${Y1}" class="bio-now"/><text x="${x(d0)}" y="${Y1 + 32}" class="bio-xlab now">${td} ${MONTHS_NOM[tm - 1]}</text>`;
    const tStart = Math.max(from - b0, 0), tEnd = to - b0;
    for (const c of BIO) {
      const pts = [];
      for (let t = tStart; t <= tEnd + 1e-9; t += 0.25) pts.push(`${x(t + b0).toFixed(1)},${y(bioVal(t, c.per)).toFixed(1)}`);
      svg += `<polyline points="${pts.join(' ')}" class="bio-line" style="stroke:${c.color}"/>`;
    }
    for (const d of days) for (const z of d.v) if (z.crit) svg += `<circle cx="${x(d.n)}" cy="${y(z.v)}" r="3.6" class="bio-dot" style="fill:${z.c.color}"/>`;
    const chart = `<div class="bio-legend">${BIO.map((c) => `<span><i style="background:${c.color}"></i>${c.ru} · ${c.per} дн.</span>`).join('')}<span><i class="crit"></i>критический день</span></div>
      <svg class="bio-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="График биоритмов">${svg}</svg>`;

    const crits = days.filter((d) => d.crit && d.n >= d0), sel = crits.length ? crits[0].n : null;
    // the list
    const rows = days.map((d) => {
      const dt = new Date(d.n * 86400000), names = d.v.filter((z) => z.crit).map((z) => z.c.ru.toLowerCase());
      const mark = d.crit === 3 ? 'тройной критический' : d.crit === 2 ? `двойной критический: ${names.join(' и ')}` : d.crit ? `критический: ${names[0]}` : d.low ? 'все три ниже нуля' : '';
      const cls = [d.crit >= 2 ? 'crit2' : d.crit ? 'crit' : d.low ? 'low' : '', d.n === d0 ? 'on' : '', d.crit && d.n === sel ? 'sel' : ''].filter(Boolean).join(' ');
      return `<tr class="${cls}"${d.crit ? ` data-bio-pick="${d.n}"` : ''}><td class="pos">${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} <span class="muted">${WD[dt.getUTCDay()]}</span></td>${d.v.map((z) => `<td class="bio-v${z.crit ? ' c' : ''}" style="--c:${z.c.color}">${pct(z.v)}</td>`).join('')}<td class="bio-mark">${mark}</td></tr>`;
    }).join('');
    const cName = (d) => (d.crit === 3 ? 'тройной' : d.v.filter((z) => z.crit).map((z) => z.c.short.toLowerCase()).join(' + '));
    const nextList = crits.slice(0, 6).map((d) => { const dt = new Date(d.n * 86400000); return `<button type="button" class="bio-chip${d.crit >= 2 ? ' strong' : ''}" data-bio-pick="${d.n}" aria-pressed="${d.n === sel}">${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} · ${cName(d)}</button>`; }).join('');

    // what each critical day means: one card per critical day of the period, the chosen one shown
    const key = (d) => (d.crit === 3 ? 'pei' : d.v.filter((z) => z.crit).map((z) => z.c.id).join(''));
    const when = (n) => (n === d0 ? 'сегодня' : n === d0 + 1 ? 'завтра' : n === d0 - 1 ? 'вчера'
      : n > d0 ? `через ${n - d0} ${plural(n - d0, 'день', 'дня', 'дней')}` : `${d0 - n} ${plural(d0 - n, 'день', 'дня', 'дней')} назад`);
    const WD_PO = ['по воскресеньям', 'по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам'];
    const birthWd = WD_PO[new Date(b0 * 86400000).getUTCDay()];
    const cards = days.filter((d) => d.crit).map((d) => {
      const r = BIO_READ[key(d)], dt = new Date(d.n * 86400000), cr = d.v.filter((z) => z.crit), rest = d.v.filter((z) => !z.crit);
      const dir = [true, false].map((up) => { const g = cr.filter((z) => (z.next > z.v) === up).map((z) => z.c.ru.toLowerCase()); return g.length ? `${g.join(' и ')} ${g.length > 1 ? 'циклы идут' : 'цикл идёт'} ${up ? 'из спада в подъём' : 'из подъёма в спад'}` : ''; }).filter(Boolean).join(', а ');
      const other = rest.map((z) => `${z.c.ru.toLowerCase()} ${pct(z.v)} — ${z.v >= 0 ? z.c.up : z.c.down}`).join('; ');
      return `<div class="bio-read${d.crit >= 2 ? ' strong' : ''}" data-bio-card="${d.n}"${d.n === sel ? '' : ' hidden'}>
          <div class="bio-read-h"><b>${dt.getUTCDate()} ${MONTHS_GEN[dt.getUTCMonth()]}, ${WD_FULL[dt.getUTCDay()]}</b><span class="bio-type">${esc(r.ru)}</span><span class="muted">${when(d.n)}</span></div>
          <p>${esc(r.sum)}${key(d) === 'e' ? ` Для этой даты рождения — ${birthWd}.` : ''}</p>
          <p class="bio-note">${esc(dir[0].toUpperCase() + dir.slice(1))}.${other ? ` Остальные циклы: ${esc(other)}.` : ''}</p>
          ${bioList(r)}
        </div>`;
    }).join('');
    const ref = ['p', 'e', 'i', 'pe', 'pi', 'ei', 'pei', 'low'].map((k) => { const r = BIO_READ[k]; return `<div class="bio-read ref"><div class="bio-read-h"><span class="bio-type">${esc(r.ru)}</span></div><p>${esc(r.sum)}</p>${bioList(r)}</div>`; }).join('');
    return `${ctl}${lead}
      ${nextList ? `<h4>Ближайшие критические дни</h4><div class="bio-chips">${nextList}</div>
      <p class="muted">Нажмите на дату — ниже расшифровка: что этот день значит, что можно делать и чего лучше избегать. Критические строки в таблице тоже нажимаются.</p>` : ''}
      ${cards}
      <h4>График</h4>${chart}
      <h4>По дням</h4>
      <div class="nat-scroll"><table class="nat-table bio-table"><thead><tr><th>Дата</th>${BIO.map((c) => `<th style="color:${c.color}">${c.short}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">Красным — критические дни, когда кривая пересекает ноль; двойные и тройные выделены сильнее. Оранжевым — дни, когда все три цикла ниже нуля. Значения — от −100% до +100%, на начало суток. Циклы 23, 28 и 33 дня взяты из теории биоритмов Вильгельма Флисса, Германа Свободы и Альфреда Тельчера.</p>
      <details class="more bio-ref"><summary>Справочник: все типы критических дней</summary>
        <p class="muted">Критический день — сутки, в которые кривая цикла пересекает ноль и переходит из подъёма в спад или обратно. Одинарные случаются часто, около 69 раз в год: физический — каждые 11–12 дней, эмоциональный — каждые 14, интеллектуальный — каждые 16–17. Двойные бывают около пяти раз в год, тройные — считаные разы за жизнь.</p>
        ${ref}
      </details>`;
  }

  const RENDER = { bio: renderBio, hours: renderHours, voc: renderVoc, lunar: renderLunar, eph: renderEph, dign: renderDign, disp: renderDisp, lots: renderLots, stars: renderStars, deg30: renderDeg30, prof: renderProf, transits: renderTransits, cycles: renderCycles, num: renderNum };

  /* ------------------------------- controls ------------------------------- */
  // biorhythms: show the reading of one critical day (from a date chip or a row of the table)
  function bioPick(n, scroll) {
    const out = $('toolOut');
    out.querySelectorAll('[data-bio-card]').forEach((c) => { c.hidden = +c.dataset.bioCard !== n; });
    out.querySelectorAll('button[data-bio-pick]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.bioPick === n)));
    out.querySelectorAll('tr[data-bio-pick]').forEach((r) => r.classList.toggle('sel', +r.dataset.bioPick === n));
    const c = out.querySelector(`[data-bio-card="${n}"]`);
    if (scroll && c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
      if (e.target.id === 'trYear') { opts().year = +e.target.value; app.save(); update(); }
      if (e.target.id === 'trMars') { opts().mars = e.target.checked; app.save(); update(); }
      if (e.target.id === 'bioBirth') { opts().bioBirth = e.target.value && e.target.value !== app.state.date ? e.target.value : null; app.save(); update(); }
      if (e.target.id === 'bioDate') { opts().bioDate = e.target.value && e.target.value !== todayISO() ? e.target.value : null; app.save(); update(); }
    });
    $('toolOut').addEventListener('click', (e) => {
      const pk = e.target.closest('[data-bio-pick]');
      if (pk) { bioPick(+pk.dataset.bioPick, pk.tagName === 'TR'); return; }
      const sp = e.target.closest('#bioSpan button');
      if (sp) { opts().bioDays = +sp.dataset.n; app.save(); update(); return; }
      if (e.target.closest('#bioReset')) { opts().bioBirth = null; opts().bioDate = null; app.save(); update(); }
    });
    $('toolOut').addEventListener('submit', (e) => {
      if (e.target.id === 'bioForm') { e.preventDefault(); return; }
      if (e.target.id !== 'numForm') return;
      e.preventDefault();
      opts().name = $('numName').value.trim().slice(0, 120); app.save(); update();
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
    $('toolSub').textContent = tool.kind === 'natal' ? `По натальной карте: ${d} ${MONTHS[m - 1]} ${y}, ${st.time}, ${st.place.name}`
      : tool.kind === 'birth' ? `По дате рождения: ${d} ${MONTHS[m - 1]} ${y}`
      : tool.kind === 'bio' ? 'Физический, эмоциональный и интеллектуальный циклы по дате рождения' : `На дату и место: ${(o.date || todayISO()).split('-').reverse().join('.')}, ${place().name}`;
    try { $('toolOut').innerHTML = RENDER[tool.id](); }
    catch (err) { $('toolOut').innerHTML = `<p class="status">Не получилось посчитать: ${esc(err.message)}</p>`; }
  }

  window.ToolsView = { init(a) { app = a; opts(); initControls(); }, update };
})();
