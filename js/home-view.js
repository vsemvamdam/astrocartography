/* The start page of AstroSky: what the site does, the sky right now, today's Moon and the chart owner's
   biorhythms, and a card for every section with a direct way in. Opened by the brand in the top bar. */
(function () {
  'use strict';
  const build = typeof module === 'object' && module.exports;
  const R = build ? require('./routes.js') : window.ROUTES;
  const $ = (id) => document.getElementById(id);
  const ACG = build ? null : window.ACG, N = build ? null : window.NATAL;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const pad = (n) => String(n).padStart(2, '0');
  const VS = '︎', g = (s) => s + VS;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const BODY = () => Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const SKY = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const SIGN_IN = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
  const inSign = (s) => (s === 4 ? 'во Льве' : `в ${SIGN_IN[s]}`);
  const EL = ['#F0805E', '#9CC77A', '#E6CB72', '#62A9EF'];
  const PHASES = ['новолуние', 'растущий серп', 'первая четверть', 'растущая Луна', 'полнолуние', 'убывающая Луна', 'последняя четверть', 'убывающий серп'];
  const PL_GEN = { Mercury: 'Меркурий', Venus: 'Венера', Mars: 'Марс', Jupiter: 'Юпитер', Saturn: 'Сатурн', Uranus: 'Уран', Neptune: 'Нептун', Pluto: 'Плутон' };
  let app = null, shownMinute = 0;
  const minuteNow = () => Math.floor(Date.now() / 60000);

  const CARDS = [
    ['diary', '▦', 'Персональный ежедневник', 'Календарь на месяц с подсказками, чем заняться и где не торопиться по вашей карте.'],
    ['natal:natal', '☉', 'Натальная карта', 'Характер, планеты в знаках и домах, аспекты и подробная расшифровка карты.'],
    ['map', '⊕', 'Карта мира', 'Линии планет по всему миру: где легче с любовью, деньгами, карьерой и отдыхом.'],
    ['city', '⌂', 'Город', 'Как меняется ваша карта в любом городе: дома, лучи и сильные стороны места.'],
    ['natal:solar', '☼', 'Соляр', 'Прогноз на год от дня рождения: главные темы, дома и лучшие города для соляра.'],
    ['natal:lunar', '☽', 'Лунар', 'Прогноз на месяц: важные точки и все двенадцать домов с силой каждой планеты.'],
    ['natal:child', '☺', 'Гороскоп ребёнка', 'Характер, чувства, учёба и таланты ребёнка, подсказки родителям и ваша совместимость.'],
    ['natal:synastry', '⚭', 'Совместимость', 'Синастрия и композит: как ваша карта взаимодействует с картой партнёра.'],
    ['natal:stars', '★', 'Звёзды', 'На кого из знаменитостей похожа ваша карта — и чем именно.'],
    ['natal:horary', '☿', 'Хорар', 'Ответ на конкретный вопрос по карте момента, по правилам Лилли и Фроули.'],
    ['tools:family', '∿', 'Биоритмы семьи', 'Физический, эмоциональный и интеллектуальный циклы всей семьи и PDF на месяц.'],
    ['tools', '⚹', 'Инструменты', 'Лунные дни, эфемериды, жребии, профекции, циклы жизни, нумерология и другое.'],
    ['sport', '♂', 'Спорт', 'Прогноз матчей по Фроули и база игр, на которой проверяются правила.'],
  ];
  // the page of a section (js/routes.js): a real link, so search engines and a new tab can follow it
  const href = (spec) => (R ? R.path(spec) : `#${spec.split(':')[0]}`);

  // Use the same navigation and layout in the generated HTML and after an in-app return to Home.
  function homeMarkup() {
    const featured = new Set(CARDS.map(([spec]) => href(spec)));
    const extraTools = R ? R.PAGES.filter((p) => p.spec.startsWith('tools:') && !featured.has(p.path)) : [];
    const skyLinks = [['tools:lunar', 'Луна', 'Лунные дни'], ['tools:hours', 'Солнце', 'Управители дня и часа'], ['tools:eph', 'Планеты', 'Эфемериды']];
    return `
      <div class="hm-hero">
        <div class="hm-copy">
          <h1 class="hm-h1" id="homeH">Астрология по вашей карте</h1>
          <p class="hm-lead">Натальная карта и её расшифровка, линии планет на карте мира, соляры и лунары, совместимость и инструменты для всей семьи — по дате, времени и месту рождения.</p>
          <div class="hm-cta"><a class="hm-btn primary" href="${href('natal:natal')}" data-go="natal:natal">Открыть мою карту</a><a class="hm-btn" href="${href('map')}" data-go="map">Карта мира</a></div>
          <div class="hm-me" id="homeOwner">
            <span class="muted">Ваша карта</span>
            <span class="hm-big3">Солнце, Луна и Асцендент</span>
            <a href="${href('natal')}" data-go="edit" class="hm-link">Ввести свои данные рождения</a>
          </div>
        </div>
        <figure class="hm-sky">
          <svg class="hm-wheel" id="homeSkyWheel" viewBox="0 0 300 300" role="img" aria-label="Положение планет в небе сейчас" aria-hidden="true">${wheel([])}</svg>
          <figcaption id="homeSkyCaption">Карта неба</figcaption>
        </figure>
      </div>
      <div class="hm-now">
        <h2 class="hm-h">Сейчас на небе</h2>
        <p class="hm-when" id="homeClock" hidden><i aria-hidden="true"></i><time id="homeWhen"></time></p>
      </div>
      <div class="hm-tiles" id="homeTiles">${skyLinks.map(([spec, label, text]) => `<div class="hm-tile"><span class="hm-tk">${label}</span><a href="${href(spec)}" data-go="${spec}" class="hm-link">${text}</a></div>`).join('')}</div>
      <h2 class="hm-h">Разделы</h2>
      <div class="hm-grid">${CARDS.map(([go, ic, title, text]) => `<a class="hm-card" href="${href(go)}" data-go="${go}"><span class="hm-ic">${g(ic)}</span><b>${title}</b><span>${text}</span><span class="hm-more">Открыть →</span></a>`).join('')}</div>
      ${extraTools.length ? `<details class="hm-all-tools"><summary class="hm-btn">Все инструменты</summary><ul class="hm-links">${extraTools.map((p) => `<li><a class="hm-link" href="${p.path}">${esc(p.name)}</a></li>`).join('')}</ul></details>` : ''}
      <p class="hm-foot">Положения планет считаются по Astronomy Engine, дома по умолчанию — Плацидус. Данные знаменитостей — Astro-Databank. Все ваши данные хранятся в этом браузере, а с аккаунтом — ещё и в облаке.</p>`;
  }

  if (build) { module.exports = homeMarkup; return; }

  // longitudes now and a day later (for retrograde motion)
  function skyNow(ms) {
    const C = window.CYCLES, out = [];
    for (const id of SKY) {
      const l = C.lonOf(id, ms), l2 = C.lonOf(id, ms + 86400000);
      if (l == null) continue;
      out.push({ id, lon: n360(l), retro: n180(l2 - l) < 0 });
    }
    return out;
  }
  function wheel(sky) {
    const S = 300, c = S / 2, R1 = 142, R2 = 112, R3 = 104, B = sky.length ? BODY() : null;
    const pt = (lon, r) => [c - r * Math.cos(lon * Math.PI / 180), c + r * Math.sin(lon * Math.PI / 180)];
    let s = `<circle cx="${c}" cy="${c}" r="${R1}" class="hs-ring"/><circle cx="${c}" cy="${c}" r="${R2}" class="hs-ring"/><circle cx="${c}" cy="${c}" r="34" class="hs-core"/>`;
    for (let k = 0; k < 12; k++) {
      const [x1, y1] = pt(k * 30, R2), [x2, y2] = pt(k * 30, R1), [tx, ty] = pt(k * 30 + 15, (R1 + R2) / 2);
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="hs-tick"/>`;
      const glyph = String.fromCodePoint(0x2648 + k); // Aries through Pisces occupy a contiguous range in Unicode.
      s += `<text x="${tx.toFixed(1)}" y="${(ty + 6).toFixed(1)}" class="hs-sign" style="fill:${EL[k % 4]}">${g(glyph)}</text>`;
    }
    // planets on the inner track; close ones step inwards so the glyphs do not overlap
    const placed = [];
    for (const p of sky.slice().sort((a, b) => a.lon - b.lon)) {
      let r = R3 - 16;
      while (placed.some((q) => Math.abs(n180(q.lon - p.lon)) < 9 && Math.abs(q.r - r) < 4)) r -= 19;
      placed.push({ lon: p.lon, r });
      const [x, y] = pt(p.lon, r), [ax, ay] = pt(p.lon, R2), [bx, by] = pt(p.lon, R2 - 7), b = B[p.id];
      s += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${b.color}" stroke-width="2"/>`;
      s += `<text x="${x.toFixed(1)}" y="${(y + 6).toFixed(1)}" class="hs-pl" style="fill:${b.color}">${g(b.glyph)}</text>`;
      if (p.retro) s += `<text x="${(x + 9).toFixed(1)}" y="${(y + 11).toFixed(1)}" class="hs-r">R</text>`;
    }
    s += `<text x="${c}" y="${c + 6}" class="hs-mid">${g('⊕')}</text>`;
    return s;
  }
  const bio = (t, per) => Math.sin(2 * Math.PI * t / per);
  const pct = (x) => { const v = Math.round(x * 100); return v === 0 ? '0%' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`; };

  function render() {
    const st = app.state, now = Date.now(), d = new Date(now), B = BODY();
    shownMinute = minuteNow();
    const sky = skyNow(now), P = (id) => sky.find((x) => x.id === id);
    const sun = P('Sun'), moon = P('Moon'), el = n360(moon.lon - sun.lon);
    const phase = PHASES[Math.floor(n360(el + 22.5) / 45) % 8], illum = Math.round((1 - Math.cos(el * Math.PI / 180)) / 2 * 100);
    const retro = sky.filter((x) => x.retro && PL_GEN[x.id]);
    // the chart owner
    if (app.chart && st.place) {
      const nat = N.computeNatal(app.chart, st.place.lat, st.place.lon, { house: 'P' }), sg = (s) => ACG.SIGNS[s][1];
      const ps = (id) => nat.points.find((p) => p.id === id);
      const [y, m, dd] = st.date.split('-').map(Number);
      $('homeOwner').innerHTML = `<span class="muted">${st.example ? 'Сейчас' : 'Ваша карта'}</span> <b>${dd} ${MONTHS_GEN[m - 1]} ${y}, ${esc(st.time)}, ${esc(st.place.name || '')}</b>
        <span class="hm-big3"><span><i style="color:${B.Sun.color}">${g(B.Sun.glyph)}</i> ${sg(ps('Sun').sign)}</span><span><i style="color:${B.Moon.color}">${g(B.Moon.glyph)}</i> ${sg(ps('Moon').sign)}</span><span><i class="hm-asc">ASC</i> ${sg(Math.floor(n360(nat.asc) / 30))}</span></span>
        <a href="${href('natal')}" data-go="edit" class="hm-link">${st.example ? 'Ввести свои данные рождения' : 'Изменить данные рождения'}</a>`;
    }
    const tb = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(...st.date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)))) / 86400000);
    const cyc = [['Физ.', 23, '#F2A541'], ['Эмоц.', 28, '#4FB3BF'], ['Интел.', 33, '#A88BEB']];
    const tiles = [
      `<div class="hm-tile"><span class="hm-tk">Луна</span><b><i style="color:${B.Moon.color}">${g(B.Moon.glyph)}</i> ${inSign(Math.floor(moon.lon / 30))}</b><span class="muted">${phase}, освещена на ${illum}%</span><a href="${href('tools:lunar')}" data-go="tools:lunar" class="hm-link">Лунные дни →</a></div>`,
      `<div class="hm-tile"><span class="hm-tk">Солнце</span><b><i style="color:${B.Sun.color}">${g(B.Sun.glyph)}</i> ${inSign(Math.floor(sun.lon / 30))}</b><span class="muted">${Math.floor(sun.lon % 30)}° знака</span><a href="${href('tools:hours')}" data-go="tools:hours" class="hm-link">Управители дня и часа →</a></div>`,
      `<div class="hm-tile"><span class="hm-tk">Ретроградные</span><b>${retro.length ? retro.map((x) => `<i style="color:${B[x.id].color}" title="${PL_GEN[x.id]}">${g(B[x.id].glyph)}</i>`).join(' ') : 'нет'}</b><span class="muted">${retro.length ? retro.map((x) => PL_GEN[x.id]).join(', ') : 'все планеты идут прямо'}</span><a href="${href('tools:eph')}" data-go="tools:eph" class="hm-link">Эфемериды →</a></div>`,
      tb >= 0 && !st.example ? `<div class="hm-tile"><span class="hm-tk">Ваши биоритмы сегодня</span><b class="hm-bio">${cyc.map(([ru, per, col]) => { const t = tb % per, crit = Math.ceil(t / (per / 2) - 1e-9) * (per / 2) < t + 1 - 1e-9; return `<span style="color:${col}"${crit ? ' class="crit"' : ''}>${ru} ${pct(bio(tb, per))}</span>`; }).join('')}</b><span class="muted">по дате рождения из карты</span><a href="${href('tools:bio')}" data-go="tools:bio" class="hm-link">Биоритмы →</a></div>` : '',
    ].join('');
    $('homeSkyWheel').innerHTML = wheel(sky);
    $('homeSkyWheel').removeAttribute('aria-hidden');
    const date = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`, time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $('homeSkyCaption').textContent = `Небо сейчас · ${date}, ${time}`;
    $('homeWhen').dateTime = d.toISOString();
    $('homeWhen').textContent = `${WEEKDAYS[d.getDay()]}, ${date} · ${time}`;
    $('homeClock').hidden = false;
    $('homeTiles').innerHTML = tiles;
  }

  // a card or link: switch to the section (and the mode inside it) the card points to
  function go(spec) {
    const [view, sub] = spec.split(':'), st = app.state;
    if (view === 'natal' && sub) {
      if (sub === 'lunar') { st.natal = st.natal || {}; st.natal.lunTab = 'houses'; }
      const b = document.querySelector(`#natMode button[data-m="${sub}"]`);
      if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
    }
    if (view === 'tools' && sub) {
      st.tools = st.tools || {};
      if (sub === 'family') Object.assign(st.tools, { tool: 'bio', bioMode: 'family' });
      else if (sub === 'bio') Object.assign(st.tools, { tool: 'bio', bioMode: 'one', bioBirth: null, bioWho: null });
      else st.tools.tool = sub;
    }
    app.save();
    const to = view === 'edit' ? 'natal' : view;
    if (window.ROUTES && ROUTES.go) ROUTES.go(to); else location.hash = `#${to}`;
    window.scrollTo(0, 0);
    if (view === 'edit') setTimeout(() => { const i = $('bDate'); if (i) { i.scrollIntoView({ behavior: 'smooth', block: 'center' }); i.focus({ preventScroll: true }); } }, 120);
  }

  // "now" has to stay true on a page left open: redrawn when the minute changes or the tab comes back
  function refreshIfStale() {
    if ($('homeView').hidden || document.hidden || $('homeOut').contains(document.activeElement) || minuteNow() === shownMinute) return;
    window.HomeView.update();
  }

  window.HomeView = {
    init(a) {
      app = a;
      setInterval(refreshIfStale, 10000);
      document.addEventListener('visibilitychange', refreshIfStale);
      $('homeOut').addEventListener('click', (e) => { const a2 = e.target.closest('[data-go]'); if (!a2 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); go(a2.dataset.go); });
    },
    update() {
      if (!app || $('homeView').hidden) return;
      if (!$('homeH')) $('homeOut').innerHTML = homeMarkup();
      if (!window.Astronomy || !window.CYCLES) return;
      try { render(); } catch (err) { console.error('AstroSky home:', err); }
    },
  };
})();
