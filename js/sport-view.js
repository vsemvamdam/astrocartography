/* "Спорт": upcoming matches of АПЛ, Ла Лига, ЛЧ, ЛЕ, ЛК with an astrological judgement for each. */
(function () {
  'use strict';
  const S = window.SPORT, ACG = window.ACG;
  const $ = (id) => document.getElementById(id);
  const VS = '︎', g = (s) => s + VS;
  const pad = (n) => String(n).padStart(2, '0');
  const n360 = (x) => ((x % 360) + 360) % 360;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BODY = Object.fromEntries(ACG.BODIES.map((b) => [b.id, b]));
  const POS = { G: 'Вр', D: 'Защ', M: 'Пз', F: 'Нап' };
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  let app = null, matches = null, loading = false, loadError = null, selected = null, squadsCache = new Map(), judged = new Map();

  function opts() {
    app.state.sport = Object.assign({ league: 'all', fav: {}, place: {} }, app.state.sport || {});
    return app.state.sport;
  }
  const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
  function dayLabel(ms) {
    const d = new Date(ms), t = new Date(), tm = new Date(Date.now() + 86400000);
    const base = `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
    if (dayKey(ms) === dayKey(t)) return `Сегодня, ${base}`;
    if (dayKey(ms) === dayKey(tm)) return `Завтра, ${base}`;
    return base[0].toUpperCase() + base.slice(1);
  }
  const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const atVenue = (ms, tz) => { const off = ACG.tzOffsetMin(tz || 'UTC', ms), d = new Date(ms + off * 60000); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const num = (x) => (x > 0 ? '+' : '') + (Math.round(x * 10) / 10).toString().replace('.', ',').replace('-', '−');
  const ru = (t) => String(t).replace(/(\d)\.(\d)/g, '$1,$2');
  const leagueOf = (id) => S.LEAGUES.find((l) => l.id === id) || { ru: id, long: id };
  // team badge: the logo over the team's initials, so a blocked or slow image still leaves a mark
  const logo = (t, size) => `<span class="sp-logo" style="width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size * 0.3))}px${t.color ? `;--tc:#${esc(t.color)}` : ''}"><i>${esc((t.abbr || t.short || '?').slice(0, 3))}</i>${t.logo ? `<img src="${esc(t.logo)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>`;

  /* ------------------------------- judgement ------------------------------ */
  function favSide(m) {
    const o = opts().fav[m.id];
    if (o) return { side: o, src: 'manual' };
    if (m.odds) return { side: m.odds.home >= m.odds.away ? 'home' : 'away', src: 'odds' };
    return { side: 'home', src: 'home' };
  }
  function placeOf(m) { return opts().place[m.id] || S.venuePlace(m, app.cities); }
  function judgeOf(m) {
    const f = favSide(m), pl = placeOf(m), key = `${m.id}|${f.side}|${pl.lat}|${pl.lon}`;
    if (judged.has(key)) return judged.get(key);
    const J = S.judge(m, pl, f.side);
    J.fav = f; J.place = pl;
    judged.set(key, J);
    return J;
  }
  function verdictChip(m) {
    let J;
    try { J = judgeOf(m); } catch (e) { return '<span class="vc">—</span>'; }
    if (J.verdict.v === 'draw') return '<span class="vc draw">равно</span>';
    const t = J.verdict.side === 'home' ? m.home : m.away;
    return `<span class="vc ${J.verdict.v}" title="${esc(J.verdict.text)}">${esc(t.abbr || t.short)} · ${J.verdict.strength === 'явный' ? 'явно' : 'умеренно'}</span>`;
  }

  /* ---------------------------------- list --------------------------------- */
  function renderLeagues() {
    const o = opts();
    $('spLeagues').innerHTML = [{ id: 'all', ru: 'Все' }].concat(S.LEAGUES).map((l) => `<button type="button" data-l="${l.id}" aria-pressed="${o.league === l.id}" title="${esc(l.long || '')}">${l.id === 'all' ? 'Все' : `<span class="l">${esc(l.long)}</span><span class="s">${esc(l.ru)}</span>`}</button>`).join('');
  }
  function renderList() {
    const box = $('spList');
    if (loading && !matches) { box.innerHTML = '<p class="muted sp-msg">Загружаем расписание…</p>'; return; }
    if (loadError) {
      box.innerHTML = `<div class="sp-msg"><p>Не удалось загрузить матчи: ${esc(loadError)}.</p><p class="muted">Расписание берётся с ESPN прямо из браузера. В превью внутри Claude такие запросы закрыты — откройте сайт <a href="https://vsemvamdam.github.io/astrocartography/#sport" target="_blank" rel="noopener">vsemvamdam.github.io</a>.</p><button type="button" class="pill" id="spRetry">Повторить</button></div>`;
      return;
    }
    const o = opts(), list = (matches || []).filter((m) => o.league === 'all' || m.league === o.league);
    if (!list.length) { box.innerHTML = '<p class="muted sp-msg">В ближайшие две недели матчей нет.</p>'; return; }
    let html = '', day = null;
    for (const m of list) {
      const dk = dayKey(m.date);
      if (dk !== day) { if (day) html += '</ul>'; html += `<h3 class="sp-day">${dayLabel(m.date)}</h3><ul class="sp-rows">`; day = dk; }
      const live = m.state === 'in';
      html += `<li><button type="button" class="sp-row${selected === m.id ? ' on' : ''}" data-id="${m.id}">
        <span class="sp-time">${live ? '<b class="live">LIVE</b>' : hm(m.date)}<small>${esc(leagueOf(m.league).ru)}</small></span>
        <span class="sp-teams"><span class="sp-t">${logo(m.home, 20)}<span>${esc(m.home.short)}</span>${live ? `<b>${esc(m.home.score)}</b>` : ''}</span><span class="sp-t">${logo(m.away, 20)}<span>${esc(m.away.short)}</span>${live ? `<b>${esc(m.away.score)}</b>` : ''}</span></span>
        <span class="sp-v">${verdictChip(m)}</span>
      </button></li>`;
    }
    box.innerHTML = html + '</ul>';
  }

  /* --------------------------------- detail -------------------------------- */
  const sig = (s) => `<span class="tg" style="color:${BODY[s.id].color}">${g(BODY[s.id].glyph)}</span> ${S.RU[s.id]}`;
  function teamBox(J, k, m) {
    const T = J.teams[k], tm = T.side === 'home' ? m.home : m.away;
    const list = J.testimonies.filter((t) => t.team === k).sort((a, b) => b.w - a.w);
    return `<div class="sp-team ${J.verdict.v === k ? 'win' : ''}">
      <div class="sp-team-h">${logo(tm, 28)}<div><b>${esc(tm.name)}</b><small>${k === 'fav' ? 'Фаворит · I и X дома' : 'Аутсайдер · VII и IV дома'}</small></div><span class="sp-score">${num(J.score[k])}</span></div>
      <p class="muted">Сигнификаторы: ${T.sigs.length ? T.sigs.map((s) => `${sig(s)} <span class="muted">(${S.RN[s.house]}${s.via ? ', за Луну' : ''})</span>`).join(', ') : 'нет'}</p>
      <ul class="sp-test">${list.length ? list.map((t) => `<li class="${t.w > 0 ? 'p' : 'n'}"><span class="w">${t.w > 0 ? '+' : '−'}${Math.abs(t.w).toString().replace('.', ',')}</span><span>${esc(ru(t.text))}</span></li>`).join('') : '<li class="muted">Свидетельств нет</li>'}</ul>
    </div>`;
  }
  const zod = (lon) => { const z = ACG.formatZodiac(lon); return `${z.deg}°${pad(z.min)}′ <span class="sg">${g(z.glyph)}</span>`; };
  function renderDetail() {
    const box = $('spDetail'), m = matches && matches.find((x) => x.id === selected);
    $('spLayout').classList.toggle('open', !!m);
    box.hidden = !m;
    if (!m) return;
    const J = judgeOf(m), o = m.odds, lg = leagueOf(m.league), pl = J.place;
    const d = new Date(m.date);
    const favName = J.fav.side === 'home' ? m.home.short : m.away.short;
    const src = J.fav.src === 'odds' ? `по коэффициентам${o.provider ? ' ' + esc(o.provider) : ''}` : J.fav.src === 'manual' ? 'выбран вручную' : 'коэффициентов нет — взяты хозяева поля';
    const vcls = J.verdict.v === 'draw' ? 'warn' : 'good';
    const E = J.E, cuspRow = (lab, lon, h) => `<tr><td class="hs">${lab}</td><td class="ps">${zod(lon)}</td><td>${h === 1 || h === 10 ? 'фаворит' : 'аутсайдер'}</td></tr>`;
    box.innerHTML = `
      <button type="button" class="link-btn sp-back" id="spBack">← Все матчи</button>
      <div class="sp-head">
        <p class="muted">${esc(lg.long)} · ${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}, ${hm(m.date)} по вашему времени${pl.tz ? ` · ${atVenue(m.date, pl.tz)} на месте` : ''}</p>
        <div class="sp-vs"><span class="sp-big">${logo(m.home, 44)}<b>${esc(m.home.name)}</b><small>хозяева</small></span><span class="sp-x">${m.state === 'in' ? `${esc(m.home.score)} : ${esc(m.away.score)}` : '—'}</span><span class="sp-big">${logo(m.away, 44)}<b>${esc(m.away.name)}</b><small>гости</small></span></div>
        <p class="muted">${esc(m.venue.name)}${m.venue.city ? ', ' + esc(m.venue.city) : ''}</p>
      </div>
      <div class="sp-ctl">
        <div class="field"><label>Фаворит (I дом) <span class="muted">${src}</span></label>
          <div class="seg" id="spFav"><button type="button" data-f="home" aria-pressed="${J.fav.side === 'home'}">${esc(m.home.short)}</button><button type="button" data-f="away" aria-pressed="${J.fav.side === 'away'}">${esc(m.away.short)}</button></div></div>
        <div class="field sp-where"><label for="spPlace">Место карты <span class="muted">${pl.approx ? 'город стадиона не найден, взят примерно' : 'по городу стадиона'}</span></label>
          <div class="place-box"><input class="inp" id="spPlace" type="text" spellcheck="false" autocapitalize="words"><ul class="suggest" id="spSuggest" role="listbox" hidden></ul></div></div>
      </div>
      <div class="hv ${vcls}"><b>${J.verdict.v === 'draw' ? 'Равная игра' : esc(J.verdict.side === 'home' ? m.home.name : m.away.name)}</b><span>${J.verdict.v === 'draw' ? esc(J.verdict.text) : `${J.verdict.strength === 'явный' ? 'Явный' : 'Умеренный'} перевес${J.verdict.v === 'dog' ? ' аутсайдера' : ' фаворита'} по свидетельствам карты матча.`} Счёт: фаворит ${num(J.score.fav)}, аутсайдер ${num(J.score.dog)}.</span></div>
      <div class="sp-teams2">${teamBox(J, 'fav', m)}${teamBox(J, 'dog', m)}</div>
      ${J.notes.length ? `<p class="muted">${J.notes.map(esc).join(' ')}</p>` : ''}
      <div class="sp-cols">
        <section><h4 class="nat-h4">Луна</h4><p>${J.moonAsp.length ? 'Сходящиеся аспекты в пределах 6°: ' + J.moonAsp.map((x) => `${x.asp === 0 ? 'соединение' : x.asp === 60 ? 'секстиль' : x.asp === 90 ? 'квадрат' : x.asp === 120 ? 'трин' : 'оппозиция'} — ${esc(x.to.label)} (${x.deg.toFixed(1).replace('.', ',')}°)`).join(', ') + '. Последний из них Фроули считает обычно решающим.' : 'В пределах 6° Луна не делает аспектов к сигнификаторам и Фортуне.'}</p>
          <h4 class="nat-h4">Углы карты матча</h4>
          <table class="nat-table"><tbody>${cuspRow('ASC', E.nat.asc, 1)}${cuspRow('MC', E.nat.mc, 10)}${cuspRow('DSC', E.cusps[7], 7)}${cuspRow('IC', E.cusps[4], 4)}<tr><td class="hs">⊗</td><td class="ps">${zod(J.fortune)}</td><td class="muted">Фортуна</td></tr></tbody></table>
          <p class="bal-note">Карта на ${atVenue(m.date, pl.tz)} по расписанию, ${esc(pl.name)}. Задержка начала на 4–5 минут сдвигает Асцендент примерно на градус.</p>
        </section>
        <section><h4 class="nat-h4">Букмекеры</h4>${o ? `<div class="sp-odds">
            <div><span>${esc(m.home.short)}</span><i style="width:${pct(o.home)}"></i><b>${pct(o.home)}</b></div>
            ${o.draw != null ? `<div><span>Ничья</span><i style="width:${pct(o.draw)}"></i><b>${pct(o.draw)}</b></div>` : ''}
            <div><span>${esc(m.away.short)}</span><i style="width:${pct(o.away)}"></i><b>${pct(o.away)}</b></div></div>
            ${o.total && o.total.line != null ? `<p class="muted">Тотал ${String(o.total.line).replace('.', ',')}${o.total.over != null ? `: больше — ${pct(o.total.over)}` : ''}</p>` : ''}
            <p class="bal-note">Вероятности из коэффициентов ${esc(o.provider)}, без маржи. Для сравнения с астрологией.</p>` : '<p class="muted">Коэффициентов пока нет.</p>'}
        </section>
      </div>
      <h4 class="nat-h4">Составы</h4>
      <div id="spSquads"><p class="muted">Загружаем составы…</p></div>
      <p class="bal-note">Метод Джона Фроули («Спортивная астрология») в изложении его учеников: карта на момент стартового свистка на месте матча, дома Плацидуса. Фаворит по ставкам получает I и X дома, аутсайдер — VII и IV; свидетельства — управители углов на куспидах (своих — сила, сразу за куспидом соперника — слабость), Луна и Фортуна на куспидах и их антисции, сходящееся соединение с Фортуной, узлы, сожжение, Плутон на куспиде, последний аспект Луны в пределах 6°. Орбы — до 5°. Это астрологический прогноз для интереса, а не гарантия результата; не используйте его как основание для ставок.</p>`;
    $('spBack').onclick = () => { selected = null; renderAll(); window.scrollTo({ top: 0 }); };
    $('spFav').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; opts().fav[m.id] = b.dataset.f; app.save(); renderAll(); };
    const inp = $('spPlace');
    app.makePlaceSearch(inp, $('spSuggest'), () => placeOf(m), (p) => { opts().place[m.id] = p; app.save(); renderAll(); });
    loadSquads(m, J);
  }

  function playerRow(p, J, k) {
    const r = S.playerIndex(p, J, k), idx = r ? r.idx : null;
    const cls = idx == null ? '' : idx >= 2 ? 'p' : idx <= -1 ? 'n' : '';
    return `<li class="${p.injured ? 'inj' : ''}"><span class="no">${esc(p.jersey || '')}</span><span class="nm">${esc(p.name)}${p.injured ? ` <span class="tag bad">${esc(p.injury || 'травма')}</span>` : ''}</span><span class="pz">${POS[p.pos] || ''}</span><span class="gs">${p.apps ? `${p.goals}/${p.apps}` : ''}</span><span class="ix ${cls}" title="${r && r.why.length ? esc(r.why.join('; ')) : 'астроиндекс'}">${idx == null ? '' : (idx > 0 ? '+' : '') + String(idx).replace('.', ',')}</span></li>`;
  }
  async function loadSquads(m, J) {
    const box = $('spSquads');
    let sq = squadsCache.get(m.id);
    if (!sq) {
      try { sq = await S.squads(m); squadsCache.set(m.id, sq); }
      catch (e) { if (selected === m.id) box.innerHTML = '<p class="muted">Составы не загрузились.</p>'; return; }
    }
    if (selected !== m.id || !$('spSquads')) return;
    const side = (key) => (J.teams.fav.side === key ? 'fav' : 'dog');
    // goal chances: outfield starters with a high index, then by their scoring rate
    const cands = [];
    for (const key of ['home', 'away']) for (const p of sq[key].xi) {
      if (p.pos === 'G') continue;
      const r = S.playerIndex(p, J, side(key));
      const rate = p.apps ? p.goals / p.apps : { F: 0.3, M: 0.12, D: 0.04 }[p.pos] || 0;
      if (r && r.idx >= 2) cands.push({ p, r, team: m[key], rate, key: r.idx * (0.25 + Math.min(rate, 1)) });
    }
    cands.sort((a, b) => b.key - a.key);
    const col = (key) => {
      const s = sq[key], k = side(key), xiIds = new Set(s.xi.map((p) => p.id));
      const rest = (s.lineup ? s.lineup.filter((p) => !p.starter) : s.squad.filter((p) => !xiIds.has(p.id))).sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos));
      const xi = s.xi.slice().sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos));
      return `<div class="sp-sq"><div class="sp-team-h">${logo(m[key], 24)}<div><b>${esc(m[key].name)}</b><small>${s.official ? `Официальный состав${s.formation ? ', ' + esc(s.formation) : ''}` : 'Примерный состав — по числу игр в сезоне'}</small></div></div>
        <ul class="sp-pl"><li class="hd"><span class="no">№</span><span class="nm">Игрок</span><span class="pz">Поз</span><span class="gs">Г/И</span><span class="ix">Астро</span></li>${xi.map((p) => playerRow(p, J, k)).join('')}</ul>
        ${rest.length ? `<details class="more"><summary>${s.official ? 'Запасные' : 'Остальной состав'} (${rest.length})</summary><ul class="sp-pl">${rest.map((p) => playerRow(p, J, k)).join('')}</ul></details>` : ''}</div>`;
    };
    box.innerHTML = `${cands.length ? `<div class="sp-goal"><h4 class="nat-h4">Повышенный шанс гола <span class="muted">астроиндекс с поправкой на результативность · эксперимент, не из книги Фроули</span></h4><ul>${cands.slice(0, 6).map((c) => `<li>${logo(c.team, 18)}<b>${esc(c.p.name)}</b> <span class="ix p">+${String(c.r.idx).replace('.', ',')}</span> <span class="muted">${esc(c.r.why.join('; '))}${c.p.apps ? ` · ${c.p.goals} г. в ${c.p.apps} играх` : ''}</span></li>`).join('')}</ul></div>` : '<p class="muted">Ни у кого из основы нет сильных контактов натальной карты с картой матча.</p>'}
      <div class="sp-sqs">${col('home')}${col('away')}</div>
      <p class="bal-note">Астроиндекс игрока — наша экспериментальная оценка, не метод Фроули: время рождения игроков неизвестно, поэтому берутся Солнце, Марс и Юпитер на полдень даты рождения и их контакты с углами и планетами карты матча (орбы 2–3°). «Г/И» — голы и игры в этом турнире по данным ESPN.</p>`;
  }

  /* --------------------------------- flow ---------------------------------- */
  function renderAll() { renderLeagues(); renderList(); renderDetail(); }
  async function load(force) {
    if (loading) return;
    loading = true; loadError = null;
    if (force) { matches = null; judged.clear(); }
    renderList();
    try { matches = await S.fixtures(S.LEAGUES.map((l) => l.id), 14); }
    catch (e) { loadError = e && e.name === 'AbortError' ? 'сервер ESPN не ответил вовремя' : (e && e.message) || 'ошибка сети'; }
    loading = false;
    renderAll();
  }
  function init(a) {
    app = a; opts();
    $('spLeagues').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts().league = b.dataset.l; app.save(); renderAll(); });
    $('spList').addEventListener('click', (e) => {
      if (e.target.id === 'spRetry') { load(true); return; }
      const b = e.target.closest('.sp-row'); if (!b) return;
      selected = b.dataset.id; renderAll();
      if (innerWidth < 1100) $('spDetail').scrollIntoView({ block: 'start' });
    });
  }
  function update() {
    if (!app || $('sportView').hidden) return;
    renderLeagues();
    if (!matches && !loading) load(false); else renderAll();
  }
  window.SportView = { init, update };
})();
