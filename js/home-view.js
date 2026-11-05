/* The start page of AstroSky: what the site does, the sky right now, today's Moon and the chart owner's
   biorhythms, and a card for every section with a direct way in. Opened by the brand in the top bar. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ACG = window.ACG, N = window.NATAL;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const pad = (n) => String(n).padStart(2, '0');
  const VS = '︎', g = (s) => s + VS;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const BODY = () => Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const SKY = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const SIGN_IN = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
  const inSign = (s) => (s === 4 ? 'во Льве' : `в ${SIGN_IN[s]}`);
  const EL = ['#F0805E', '#9CC77A', '#E6CB72', '#62A9EF'];
  const PHASES = ['новолуние', 'растущий серп', 'первая четверть', 'растущая Луна', 'полнолуние', 'убывающая Луна', 'последняя четверть', 'убывающий серп'];
  const PL_GEN = { Mercury: 'Меркурий', Venus: 'Венера', Mars: 'Марс', Jupiter: 'Юпитер', Saturn: 'Сатурн', Uranus: 'Уран', Neptune: 'Нептун', Pluto: 'Плутон' };
  let app = null;

  const CARDS = [
    ['natal:natal', '☉', 'Натальная карта', 'Характер, планеты в знаках и домах, аспекты и подробная расшифровка карты.'],
    ['map', '⊕', 'Карта мира', 'Линии планет по всему миру: где легче с любовью, деньгами, карьерой и отдыхом.'],
    ['city', '⌂', 'Город', 'Как меняется ваша карта в любом городе: дома, лучи и сильные стороны места.'],
    ['natal:solar', '☼', 'Соляр', 'Прогноз на год от дня рождения: главные темы, дома и лучшие города для соляра.'],
    ['natal:lunar', '☽', 'Лунар', 'Прогноз на месяц: важные точки и все двенадцать домов с силой каждой планеты.'],
    ['natal:synastry', '⚭', 'Совместимость', 'Синастрия и композит: как ваша карта взаимодействует с картой партнёра.'],
    ['natal:stars', '★', 'Звёзды', 'На кого из знаменитостей похожа ваша карта — и чем именно.'],
    ['natal:horary', '☿', 'Хорар', 'Ответ на конкретный вопрос по карте момента, по правилам Лилли и Фроули.'],
    ['tools:family', '∿', 'Биоритмы семьи', 'Физический, эмоциональный и интеллектуальный циклы всей семьи и PDF на месяц.'],
    ['tools', '⚹', 'Инструменты', 'Лунные дни, эфемериды, жребии, профекции, циклы жизни, нумерология и другое.'],
    ['sport', '♂', 'Спорт', 'Прогноз матчей по Фроули и база игр, на которой проверяются правила.'],
  ];

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
    const S = 300, c = S / 2, R1 = 142, R2 = 112, R3 = 104, B = BODY();
    const pt = (lon, r) => [c - r * Math.cos(lon * Math.PI / 180), c + r * Math.sin(lon * Math.PI / 180)];
    let s = `<circle cx="${c}" cy="${c}" r="${R1}" class="hs-ring"/><circle cx="${c}" cy="${c}" r="${R2}" class="hs-ring"/><circle cx="${c}" cy="${c}" r="34" class="hs-core"/>`;
    for (let k = 0; k < 12; k++) {
      const [x1, y1] = pt(k * 30, R2), [x2, y2] = pt(k * 30, R1), [tx, ty] = pt(k * 30 + 15, (R1 + R2) / 2);
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="hs-tick"/>`;
      s += `<text x="${tx.toFixed(1)}" y="${(ty + 6).toFixed(1)}" class="hs-sign" style="fill:${EL[k % 4]}">${g(ACG.SIGNS[k][0])}</text>`;
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
    return `<svg class="hm-wheel" viewBox="0 0 ${S} ${S}" role="img" aria-label="Положение планет в небе сейчас">${s}</svg>`;
  }
  const bio = (t, per) => Math.sin(2 * Math.PI * t / per);
  const pct = (x) => { const v = Math.round(x * 100); return v === 0 ? '0%' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`; };

  function render() {
    const st = app.state, now = Date.now(), d = new Date(now), B = BODY();
    const sky = skyNow(now), P = (id) => sky.find((x) => x.id === id);
    const sun = P('Sun'), moon = P('Moon'), el = n360(moon.lon - sun.lon);
    const phase = PHASES[Math.floor(n360(el + 22.5) / 45) % 8], illum = Math.round((1 - Math.cos(el * Math.PI / 180)) / 2 * 100);
    const retro = sky.filter((x) => x.retro && PL_GEN[x.id]);
    // the chart owner
    let me = '';
    if (app.chart && st.place) {
      const nat = N.computeNatal(app.chart, st.place.lat, st.place.lon, { house: 'P' }), sg = (s) => ACG.SIGNS[s][1];
      const ps = (id) => nat.points.find((p) => p.id === id);
      const [y, m, dd] = st.date.split('-').map(Number);
      me = `<div class="hm-me"><span class="muted">Ваша карта</span> <b>${dd} ${MONTHS_GEN[m - 1]} ${y}, ${esc(st.time)}, ${esc(st.place.name || '')}</b>
        <span class="hm-big3"><span><i style="color:${B.Sun.color}">${g(B.Sun.glyph)}</i> ${sg(ps('Sun').sign)}</span><span><i style="color:${B.Moon.color}">${g(B.Moon.glyph)}</i> ${sg(ps('Moon').sign)}</span><span><i class="hm-asc">ASC</i> ${sg(Math.floor(n360(nat.asc) / 30))}</span></span>
        <a href="#natal" data-go="edit" class="hm-link">Изменить данные рождения</a></div>`;
    }
    const tb = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(...st.date.split('-').map((v, i) => (i === 1 ? +v - 1 : +v)))) / 86400000);
    const cyc = [['Физ.', 23, '#F2A541'], ['Эмоц.', 28, '#4FB3BF'], ['Интел.', 33, '#A88BEB']];
    const tiles = [
      `<div class="hm-tile"><span class="hm-tk">Луна</span><b><i style="color:${B.Moon.color}">${g(B.Moon.glyph)}</i> ${inSign(Math.floor(moon.lon / 30))}</b><span class="muted">${phase}, освещена на ${illum}%</span><a href="#tools" data-go="tools:lunar" class="hm-link">Лунные дни →</a></div>`,
      `<div class="hm-tile"><span class="hm-tk">Солнце</span><b><i style="color:${B.Sun.color}">${g(B.Sun.glyph)}</i> ${inSign(Math.floor(sun.lon / 30))}</b><span class="muted">${Math.floor(sun.lon % 30)}° знака</span><a href="#tools" data-go="tools:hours" class="hm-link">Управители дня и часа →</a></div>`,
      `<div class="hm-tile"><span class="hm-tk">Ретроградные</span><b>${retro.length ? retro.map((x) => `<i style="color:${B[x.id].color}" title="${PL_GEN[x.id]}">${g(B[x.id].glyph)}</i>`).join(' ') : 'нет'}</b><span class="muted">${retro.length ? retro.map((x) => PL_GEN[x.id]).join(', ') : 'все планеты идут прямо'}</span><a href="#tools" data-go="tools:eph" class="hm-link">Эфемериды →</a></div>`,
      tb >= 0 ? `<div class="hm-tile"><span class="hm-tk">Ваши биоритмы сегодня</span><b class="hm-bio">${cyc.map(([ru, per, col]) => { const t = tb % per, crit = Math.ceil(t / (per / 2) - 1e-9) * (per / 2) < t + 1 - 1e-9; return `<span style="color:${col}"${crit ? ' class="crit"' : ''}>${ru} ${pct(bio(tb, per))}</span>`; }).join('')}</b><span class="muted">по дате рождения из карты</span><a href="#tools" data-go="tools:bio" class="hm-link">Биоритмы →</a></div>` : '',
    ].join('');
    $('homeOut').innerHTML = `
      <div class="hm-hero">
        <div class="hm-copy">
          <p class="hm-kick">Астрология по вашей карте</p>
          <h1 class="hm-title" id="homeH">AstroSky</h1>
          <p class="hm-lead">Натальная карта и её расшифровка, линии планет на карте мира, соляры и лунары, совместимость и инструменты для всей семьи — по дате, времени и месту рождения.</p>
          <div class="hm-cta"><a class="hm-btn primary" href="#natal" data-go="natal:natal">Открыть мою карту</a><a class="hm-btn" href="#map" data-go="map">Карта мира</a></div>
          ${me}
        </div>
        <figure class="hm-sky">${wheel(sky)}<figcaption>Небо сейчас · ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}</figcaption></figure>
      </div>
      <div class="hm-tiles">${tiles}</div>
      <h2 class="hm-h">Разделы</h2>
      <div class="hm-grid">${CARDS.map(([go, ic, t, txt]) => `<a class="hm-card" href="#${go.split(':')[0]}" data-go="${go}"><span class="hm-ic">${g(ic)}</span><b>${t}</b><span>${txt}</span><span class="hm-more">Открыть →</span></a>`).join('')}</div>
      <p class="hm-foot">Положения планет считаются по Astronomy Engine, дома по умолчанию — Плацидус. Данные знаменитостей — Astro-Databank. Все ваши данные хранятся в этом браузере, а с аккаунтом — ещё и в облаке.</p>`;
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
    location.hash = `#${view === 'edit' ? 'natal' : view}`;
    window.scrollTo(0, 0);
    if (view === 'edit') setTimeout(() => { const i = $('bDate'); if (i) { i.scrollIntoView({ behavior: 'smooth', block: 'center' }); i.focus({ preventScroll: true }); } }, 120);
  }

  window.HomeView = {
    init(a) {
      app = a;
      $('homeOut').addEventListener('click', (e) => { const a2 = e.target.closest('[data-go]'); if (!a2) return; e.preventDefault(); go(a2.dataset.go); });
    },
    update() {
      if (!app || $('homeView').hidden) return;
      try { render(); } catch (err) { $('homeOut').innerHTML = `<p class="status">Не получилось показать начальную страницу: ${esc(err.message)}</p>`; }
    },
  };
})();
