/* Turn the site's chart calculations into a plan for each civil day of a month. */
(function (root) {
  'use strict';
  const A = root.ACG, N = root.NATAL, F = root.FEAT, C = root.CYCLES;
  const DAY = 86400000;
  const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const dayNumber = (iso) => Date.parse(iso + 'T00:00:00Z') / DAY;
  const planets = A.BODIES.slice(0, 10).map((p) => p.id);
  const aspects = N.ASPECTS.filter((a) => a.major);
  const personal = new Set(['Moon', 'Sun', 'Mercury', 'Venus', 'Mars']);
  const houses = ['', 'initiative', 'resources', 'communication', 'home', 'creative', 'routine', 'people',
    'resources', 'learning', 'work', 'people', 'rest'];
  const themes = {
    Sun: 'initiative', Moon: 'home', Mercury: 'communication', Venus: 'people', Mars: 'initiative', Jupiter: 'learning',
    Saturn: 'work', Uranus: 'creative', Neptune: 'rest', Pluto: 'resources', ASC: 'initiative', MC: 'work',
  };
  // Each topic has a concrete next action and a separate action to approach with care.
  const topics = {
    initiative: [['Начинания', 'Сделайте первый обратимый шаг в деле, которое давно откладывали.', 'Не меняйте весь план из-за одного препятствия.'],
      ['Initiative', 'Take the first reversible step on a task you have put off.', 'Avoid changing the entire plan over one setback.']],
    resources: [['Ресурсы', 'Сверьте бюджет, сроки и то, что уже есть для текущего проекта.', 'Перед новым обязательством проверьте полную стоимость и условия.'],
      ['Resources', 'Review the budget, deadlines and resources already available for your project.', 'Check the full costs and terms before agreeing to a new commitment.']],
    communication: [['Общение', 'Напишите письмо или уточните на встрече один вопрос, который тормозит работу.', 'Перечитайте важное сообщение перед отправкой, особенно если разговор напряжённый.'],
      ['Communication', 'Send a message or clarify one point that is holding up your work.', 'Reread important messages before sending them, especially during a tense conversation.']],
    home: [['Дом и близкие', 'Закройте одно домашнее дело или согласуйте общий план с близкими.', 'Уточните, что человек имел в виду, прежде чем отвечать на эмоциях.'],
      ['Home and family', 'Finish a household task or agree on a shared plan with someone close to you.', 'Ask what someone meant before responding in the heat of the moment.']],
    creative: [['Творчество', 'Сделайте черновик и попробуйте один новый вариант без обязательства его использовать.', 'Отложите окончательную оценку идеи до следующего просмотра.'],
      ['Creativity', 'Make a draft and try one new option without committing to it.', 'Save your final judgment until you can look at the idea again.']],
    routine: [['Повседневные дела', 'Разберите накопившиеся мелкие задачи и закройте одну из них полностью.', 'Оставьте свободное время между задачами, чтобы не делать всё в спешке.'],
      ['Daily routines', 'Sort through small tasks and finish one of them completely.', 'Leave space between tasks so you can work without rushing.']],
    people: [['Отношения', 'Назначьте спокойный разговор и сформулируйте, о чём хотите договориться.', 'Сверьтесь с собеседником, прежде чем считать договорённость окончательной.'],
      ['Relationships', 'Make time for a calm conversation and decide what you want to agree on.', 'Check with the other person before treating an agreement as final.']],
    learning: [['Учёба и развитие', 'Выберите один открытый вопрос и выделите время на его изучение.', 'Проверьте новую идею на небольшом примере, прежде чем строить на ней весь план.'],
      ['Learning and growth', 'Choose one open question and set aside time to study it.', 'Try a new idea on a small example before building an entire plan around it.']],
    work: [['Работа и цели', 'Выберите задачу с понятным результатом и доведите её до следующей контрольной точки.', 'Сверьте сроки и объём работы перед тем, как давать обещания.'],
      ['Work and goals', 'Pick a task with a clear outcome and carry it to the next checkpoint.', 'Check timing and scope before making promises.']],
    rest: [['Пауза и порядок', 'Оставьте в расписании свободное окно и подведите итоги одного незакрытого дела.', 'Перенесите решение, если для него пока не хватает фактов.'],
      ['Reflection', 'Leave some unscheduled time and review the status of one unfinished task.', 'Give a decision more time if you are still missing essential information.']],
  };

  function contacts(targets, utc) {
    const hits = [];
    let moon;
    for (const id of planets) {
      const lon = C.lonOf(id, utc);
      if (id === 'Moon') moon = lon;
      const limit = id === 'Moon' ? 5 : personal.has(id) ? 2.5 : 1.25;
      for (const p of targets) {
        const separation = Math.abs(A.norm180(lon - p.lon));
        for (const aspect of aspects) {
          const orb = Math.abs(separation - aspect.a);
          if (orb > limit) continue;
          const score = (1 - orb / limit) * (personal.has(id) ? 1.4 : 0.8) + (p.lum || p.angle ? 0.18 : 0);
          hits.push({ id, p, aspect, orb, score });
        }
      }
    }
    return { moon, hits: hits.sort((a, b) => b.score - a.score || a.orb - b.orb) };
  }

  function month(chart, state, firstDay) {
    const birth = dayNumber(state.date), place = state.place, year = new Date(firstDay * DAY).getUTCFullYear();
    const house = (state.natal && state.natal.house) || 'P';
    const solarPlace = (state.solar && state.solar.place) || place;
    const lunarPlace = (state.lunar && state.lunar.place) || place;
    const natal = N.computeNatal(chart, place.lat, place.lon, { house });
    const targets = natal.points.filter((p) => p.planet).concat(natal.angles);
    const sun = natal.points.find((p) => p.id === 'Sun'), moon = natal.points.find((p) => p.id === 'Moon');
    const solarDates = [year - 1, year, year + 1].map((y) => F.solarReturnUtc(chart.utcMs, sun.lon, y));
    const solarCache = new Map(), lunarCache = new Map();
    const period = (utc, location, id, system, cache) => {
      if (!cache.has(utc)) {
        const returnChart = A.computeChart(utc, { node: state.nodeMode });
        const reading = N.computeNatal(returnChart, location.lat, location.lon, { house: system });
        const p = reading.points.find((point) => point.id === id);
        cache.set(utc, { utc, location, house: p.house, topic: houses[p.house] });
      }
      return cache.get(utc);
    };
    const first = new Date(firstDay * DAY);
    const end = Date.UTC(year, first.getUTCMonth() + 1, 1) / DAY;
    const days = new Map();
    let lunar, nextLunar;
    for (let n = Math.max(firstDay, birth); n < end; n++) {
      const date = new Date(n * DAY);
      // Keep dates as civil days in the grid and evaluate the sky at noon in the device's zone.
      const utc = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12).getTime();
      if (utc < chart.utcMs) continue;
      const solarUtc = solarDates.findLast((t) => t <= utc);
      const solar = period(solarUtc, solarPlace, 'Sun', house, solarCache);
      if (!lunar || utc >= nextLunar) {
        const lunarUtc = F.lunarReturnUtc(moon.lon, utc);
        lunar = period(lunarUtc, lunarPlace, 'Moon', 'P', lunarCache);
        nextLunar = F.nextLunarReturnUtc(moon.lon, lunarUtc);
      }
      const sky = contacts(targets, utc), moonHouse = N.houseOf(sky.moon, natal.cusps);
      const good = sky.hits.find((h) => h.aspect.kind === 'soft'), hard = sky.hits.find((h) => h.aspect.kind === 'hard');
      const focus = good ? themes[good.p.id] : houses[moonHouse];
      const caution = hard ? themes[hard.p.id] : houses[moonHouse];
      const rhythms = [23, 28, 33].map((p) => ({ value: Math.round(100 * F.biorhythmValue(n - birth, p)), crossing: F.biorhythmCrossesZero(n - birth, p) }));
      days.set(n, {
        focus, caution, moonHouse, solar, lunar, rhythms,
        contacts: [...new Set([good, hard, ...sky.hits].filter(Boolean))].slice(0, 3),
      });
    }
    return { days, natal: { sun, moon, asc: { sign: Math.floor(A.norm360(natal.asc) / 30) } } };
  }

  root.DIARY = { DAY, isoDay, dayNumber, month, topics, houses };
})(typeof window !== 'undefined' ? window : globalThis);
