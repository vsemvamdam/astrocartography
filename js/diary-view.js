/* Monthly calendar and reading. The birth form is shared with the other AstroSky tools. */
(function () {
  'use strict';
  const { DAY, isoDay, dayNumber, month, topics, houses } = window.DIARY;
  const $ = (id) => document.getElementById(id);
  const eng = document.documentElement.lang.startsWith('en');
  const t = (ru, en) => eng ? en : ru;
  const titleOf = (topic) => topics[topic][Number(eng)][0];
  const actionOf = (topic, kind) => topics[topic][Number(eng)][kind];
  const MONTHS = new Intl.DateTimeFormat(t('ru-RU', 'en-GB'), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const DATE = new Intl.DateTimeFormat(t('ru-RU', 'en-GB'), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const BIRTH = new Intl.DateTimeFormat(t('ru-RU', 'en-GB'), { dateStyle: 'medium', timeZone: 'UTC' });
  const ORB = new Intl.NumberFormat(t('ru-RU', 'en-GB'), { maximumFractionDigits: 1 });
  const SHORT = {
    initiative: ['Старт', 'Start'], resources: ['Ресурс', 'Budget'], communication: ['Связь', 'Talk'], home: ['Дом', 'Home'],
    creative: ['Идеи', 'Ideas'], routine: ['Быт', 'Tasks'], people: ['Люди', 'People'], learning: ['Учёба', 'Study'],
    work: ['Цели', 'Goals'], rest: ['Пауза', 'Pause'],
  };
  const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const ASPECTS = { conj: 'Conjunction', opp: 'Opposition', trine: 'Trine', sq: 'Square', sext: 'Sextile' };
  const NAMES = { ...Object.fromEntries(ACG.BODIES.map((p) => [p.id, p.ru])), ASC: 'Асцендент', MC: 'Середина неба' };
  const sign = (p) => t(ACG.SIGNS[p.sign][1], SIGNS[p.sign]);
  const name = (id) => t(NAMES[id], id === 'ASC' ? 'Ascendant' : id === 'MC' ? 'Midheaven' : id);
  const min = dayNumber('1800-01-01'), max = dayNumber('2100-12-31');
  const today = () => {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
  };
  const firstOf = (n, shift = 0) => {
    const d = new Date(n * DAY);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + shift, 1) / DAY;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const make = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
  let app, birth, selected, first, forecast, builtFor, error, calendarKey;
  let currentDay;

  function pick(n, { focus = false, reveal = false } = {}) {
    selected = Math.max(min, Math.min(max, n));
    update();
    if (focus) $('diaryDays').querySelector('[aria-pressed="true"]')?.focus();
    if (reveal && matchMedia('(max-width: 899px)').matches) {
      $('diaryDate').focus({ preventScroll: true });
      $('diaryReading').scrollIntoView({ block: 'start' });
    }
  }

  function drawCalendar() {
    const caption = cap(MONTHS.format(first * DAY));
    if ($('diaryMonth').textContent !== caption) $('diaryMonth').textContent = caption;
    const key = [first, builtFor, Boolean(forecast), currentDay].join('|');
    const grid = $('diaryDays');
    if (key !== calendarKey) {
      calendarKey = key;
      const cells = document.createDocumentFragment();
      const leading = (new Date(first * DAY).getUTCDay() + 6) % 7;
      for (let i = 0; i < leading; i++) cells.append(make('span', ''));
      const end = firstOf(first, 1);
      for (let n = first; n < end; n++) {
        const day = forecast && forecast.days.get(n);
        const label = day ? titleOf(day.focus) : '';
        const b = make('button', '');
        b.type = 'button';
        b.className = 'diary-day';
        b.dataset.day = n;
        b.setAttribute('aria-label', [DATE.format(n * DAY), label].filter(Boolean).join(', '));
        if (n === currentDay) b.setAttribute('aria-current', 'date');
        if (day) b.dataset.topic = day.focus;
        b.append(make('span', String(n - first + 1)));
        if (label) {
          const small = make('small', label);
          small.title = label;
          const brief = make('small', SHORT[day.focus][Number(eng)]);
          brief.className = 'diary-day-brief';
          b.append(small, brief);
        }
        cells.append(b);
      }
      const trailing = (7 - ((leading + end - first) % 7)) % 7;
      for (let i = 0; i < trailing; i++) cells.append(make('span', ''));
      grid.replaceChildren(cells);
    }
    for (const b of grid.querySelectorAll('button')) {
      const active = +b.dataset.day === selected;
      b.setAttribute('aria-pressed', String(active));
      b.tabIndex = active ? 0 : -1;
    }
    $('diaryPrev').disabled = first === min;
    $('diaryNext').disabled = firstOf(first, 1) > max;
  }

  function aspectLine(hit) {
    const aspect = t(hit.aspect.ru, ASPECTS[hit.aspect.id]);
    const orb = ORB.format(hit.orb);
    const reading = hit.aspect.kind === 'soft' ? t('поддерживающий аспект', 'supportive aspect')
      : hit.aspect.kind === 'hard' ? t('напряжённый аспект', 'challenging aspect') : t('акцент на теме', 'area of focus');
    return t(`${name(hit.id)} → ${name(hit.p.id)}, ${aspect.toLowerCase()}, орбис ${orb}°. ${cap(reading)}.`,
      `${name(hit.id)} → ${name(hit.p.id)}, ${aspect.toLowerCase()}, ${orb}° orb. ${cap(reading)}.`);
  }

  function cycleLine(p, body) {
    const date = new Intl.DateTimeFormat(t('ru-RU', 'en-GB'), { dateStyle: 'medium', timeZone: p.location.tz || 'UTC' }).format(p.utc);
    return t(`${body} в доме №${p.house} · ${titleOf(p.topic)}. Возвращение ${date}, ${p.location.name}.`,
      `${body} in house ${p.house}. ${titleOf(p.topic)}. Return on ${date}, ${p.location.name}.`);
  }

  function source(label, lines, spec) {
    const details = document.createElement('details');
    details.append(make('summary', label));
    const body = document.createElement('div');
    for (const line of lines) body.append(make('p', line));
    const link = make('a', t('Открыть инструмент', 'Open the tool'));
    link.href = ROUTES.path(spec);
    link.setAttribute('aria-label', `${link.textContent} «${label}»`);
    body.append(link);
    details.append(body);
    return details;
  }

  function drawReading(day) {
    const heading = cap(DATE.format(selected * DAY));
    if ($('diaryDate').textContent !== heading) $('diaryDate').textContent = heading;
    $('diaryFocus').textContent = day ? titleOf(day.focus) : '';
    $('diaryForecast').hidden = !day;
    $('diaryMessage').hidden = !!day;
    if (!day) {
      $('diaryMessage').textContent = !window.Astronomy
        ? t('Не загрузилась астрономическая библиотека. Обновите страницу.', 'The astronomy library did not load. Refresh the page to try again.')
        : error || (app.state.example
        ? t('Откройте данные рождения, чтобы заполнить календарь и получить план на выбранную дату.', 'Enter your birth details to fill the calendar and see a plan for the selected date.')
        : forecast ? t('На эту дату прогноз ещё не рассчитывается: она раньше момента рождения.', 'This date is before the birth time.')
          : t('Рассчитываем карту…', 'Calculating the chart…'));
      return;
    }

    const { sun, moon, asc } = forecast.natal;
    const second = [day.lunar.topic, day.solar.topic, houses[day.moonHouse]].find((topic) => topic !== day.focus);
    const rhythmCaution = day.rhythms.some((r) => r.crossing)
      ? t('Оставьте время на повторную проверку задач, в которых легко ошибиться в спешке.', 'Allow time to double-check tasks where rushing could cause errors.')
      : t('Если день уже расписан, перенесите одну необязательную задачу, прежде чем добавлять новую.', 'If the day is full, move one optional task before adding another.');
    $('diaryDo').replaceChildren(...[actionOf(day.focus, 1), second && actionOf(second, 1)].filter(Boolean).map((s) => make('li', s)));
    $('diarySlow').replaceChildren(...[actionOf(day.caution, 2), rhythmCaution].map((s) => make('li', s)));

    const rhythmNames = t(['Физический', 'Эмоциональный', 'Интеллектуальный'], ['Physical', 'Emotional', 'Intellectual']);
    const rhythms = day.rhythms.map(({ value, crossing }, i) => {
      const phase = crossing ? t('переход через ноль', 'zero crossing')
        : value > 0 ? t('положительная фаза', 'positive phase') : t('отрицательная фаза', 'negative phase');
      return `${rhythmNames[i]} ${value > 0 ? '+' : ''}${value}% (${phase})`;
    });
    const transitLines = day.contacts.map(aspectLine);
    if (!transitLines.length) transitLines.push(t('На полдень нет близких мажорных аспектов.', 'There are no close major aspects at noon.'));
    const previousOpen = [...$('diarySources').children].map((s) => s.open);
    const sources = [
      source(t('Транзиты', 'Transits'), transitLines, 'tools:transits'),
      source(t('Биоритмы', 'Biorhythms'), rhythms, 'tools:bio'),
      source(t('Натальная карта', 'Natal chart'), [
        t(`Солнце — ${sign(sun)}, Луна — ${sign(moon)}, Асцендент — ${sign(asc)}.`, `Sun in ${sign(sun)}, Moon in ${sign(moon)}, Ascendant in ${sign(asc)}.`),
        t(`Транзитная Луна в натальном доме №${day.moonHouse}. Тема — ${titleOf(houses[day.moonHouse]).toLowerCase()}.`,
          `Transiting Moon in natal house ${day.moonHouse}. Theme: ${titleOf(houses[day.moonHouse]).toLowerCase()}.`),
      ], 'natal:natal'),
      source(t('Соляр', 'Solar return'), [cycleLine(day.solar, t('Солнце', 'Sun')),
        t('Тема года. ', 'Theme for the year. ') + actionOf(day.solar.topic, 1)], 'natal:solar'),
      source(t('Лунар', 'Lunar return'), [cycleLine(day.lunar, t('Луна', 'Moon')),
        t('Тема текущего лунного цикла. ', 'Theme for the current lunar cycle. ') + actionOf(day.lunar.topic, 1)], 'natal:lunar'),
    ];
    sources.forEach((s, i) => { s.open = previousOpen[i] ?? i === 0; });
    $('diarySources').replaceChildren(...sources);
  }

  function update() {
    if (!app || $('diaryView').hidden) return;
    const state = app.state;
    currentDay = today();
    if (selected == null) selected = currentDay;
    first = firstOf(selected);
    const hasProfile = !state.example;
    const chart = app.chart;
    const key = hasProfile && chart
      ? JSON.stringify([first, chart.utcMs, state.date, state.place, state.natal?.house, state.solar?.place, state.lunar?.place, state.nodeMode])
      : '';
    if (builtFor !== key) {
      builtFor = key;
      forecast = null;
      error = '';
      try { if (key) forecast = month(chart, state, first); }
      catch (e) {
        console.error('AstroSky diary:', e);
        error = t('Не удалось посчитать прогноз. Проверьте данные рождения и попробуйте ещё раз.', 'The forecast could not be calculated. Check the birth details and try again.');
      }
    }
    $('diaryProfile').textContent = hasProfile
      ? `${BIRTH.format(dayNumber(state.date) * DAY)}, ${state.time}, ${state.place.name}`
      : t('Добавьте дату, время и место рождения для персонального прогноза.', 'Enter your date, time and place of birth to see a personal forecast.');
    $('diaryLayout').hidden = false;
    drawCalendar();
    drawReading(forecast && forecast.days.get(selected));
  }

  function edit(on, restoreFocus = true) {
    $('diaryBirthSlot').hidden = !on;
    $('diaryBirthEdit').setAttribute('aria-expanded', String(on));
    if (on) $('bDate').focus();
    else if (restoreFocus) $('diaryBirthEdit').focus();
  }

  function init(a) {
    app = a;
    birth = $('birthForm').parentElement;
    const text = {
      intro: 'Astrological insights for planning each day.', free: 'Free access',
      noProfile: 'Enter your date, time and place of birth to see a personal forecast.', edit: 'Birth details', done: 'Show forecast',
      today: 'Today', do: 'Make time for', slow: 'Proceed with care', why: 'Daily readings',
      method: 'Transits are calculated at noon in the device’s time zone. The suggestions are based on astrological interpretation and biorhythm theory.',
    };
    if (eng) {
      $('diaryTitle').textContent = 'Personal assistant';
      for (const el of $('diaryView').querySelectorAll('[data-diary-copy]')) el.textContent = text[el.dataset.diaryCopy];
      $('diaryPrev').setAttribute('aria-label', 'Previous month');
      $('diaryNext').setAttribute('aria-label', 'Next month');
    }
    $('diaryWeek').replaceChildren(...t(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((s) => make('span', s)));
    $('diaryPrev').onclick = () => pick(firstOf(selected, -1));
    $('diaryNext').onclick = () => pick(firstOf(selected, 1));
    $('diaryToday').onclick = () => pick(today());
    $('diaryDays').onclick = (e) => {
      const b = e.target.closest('button[data-day]');
      if (b) pick(+b.dataset.day, { reveal: e.detail > 0 });
    };
    $('diaryDays').onkeydown = (e) => {
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      const next = e.key in offsets ? selected + offsets[e.key] : e.key === 'PageUp' ? firstOf(selected, -1) : e.key === 'PageDown' ? firstOf(selected, 1) : null;
      if (next == null) return;
      e.preventDefault();
      pick(next, { focus: true });
    };
    $('diaryBirthEdit').onclick = () => edit($('diaryBirthSlot').hidden);
    $('diaryBirthDone').onclick = () => {
      if (!$('birthForm').reportValidity()) return;
      if (app.state.example) { $('bDate').focus(); return; }
      app.recompute();
      edit(false);
    };
  }

  function activate(active) {
    if (active) {
      if (birth.parentElement !== $('diaryBirthSlot')) $('diaryBirthSlot').prepend(birth);
    } else if (birth.parentElement !== $('panel')) {
      edit(false, false);
      $('panel').prepend(birth);
    }
  }

  window.DiaryView = { init, activate, update };
})();
