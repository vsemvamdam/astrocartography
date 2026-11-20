/* Addresses of the sections. Every section and every mode inside it has its own page (/natalnaya-karta/, /solyar/,
   /lunnye-dni/ …) with its own title, description and heading, so search engines can find each one.
   - The router in js/app.js turns an address into a section (spec "view" or "view:mode") and back.
   - tools/build_pages.js writes one small page per entry for GitHub Pages (Jekyll copies index.html into it and swaps
     the title, description and heading) and the sitemap. After changing this list run `node tools/build_pages.js`.
   Loaded in <head> before everything else; also read by Node (tools/build_pages.js). */
(function (g) {
  'use strict';
  const SITE = 'https://astrosky.pro';
  // path, spec, <title>, meta description, name: the link text in the list of sections and, for the modes of the
  // natal chart and the tools, the page's <h1> (the same heading the section shows for that mode)
  const PAGES = [
    ['/', 'home', 'AstroSky — натальная карта, астрокартография и гороскопы онлайн',
      'Натальная карта с расшифровкой, линии планет на карте мира, соляр, лунар, совместимость и гороскоп ребёнка — по дате, времени и месту рождения.', 'Главная'],

    ['/natalnaya-karta/', 'natal:natal', 'Натальная карта онлайн с расшифровкой — AstroSky',
      'Натальная карта по дате, времени и месту рождения: планеты в знаках и домах, аспекты, достоинства планет и подробная расшифровка характера.', 'Натальная карта'],
    ['/solyar/', 'natal:solar', 'Соляр онлайн: прогноз на год от дня рождения — AstroSky',
      'Соляр на год: карта возвращения Солнца, главные темы года по домам и аспектам, соляр на любой город и лучшие города для дня рождения.', 'Соляр'],
    ['/lunar/', 'natal:lunar', 'Лунар онлайн: прогноз на месяц — AstroSky',
      'Лунар на месяц: карта возвращения Луны в натальную точку, важные точки месяца и все двенадцать домов с силой каждой планеты.', 'Лунар'],
    ['/sovmestimost/', 'natal:synastry', 'Совместимость по натальной карте: синастрия и композит — AstroSky',
      'Совместимость по дате рождения: синастрия с двойным колесом, аспекты между картами, композит и расшифровка отношений.', 'Совместимость'],
    ['/goroskop-rebenka/', 'natal:child', 'Гороскоп ребёнка по дате рождения — AstroSky',
      'Натальная карта ребёнка: характер, чувства, учёба и таланты, подсказки родителям и совместимость родителя с ребёнком.', 'Гороскоп ребёнка'],
    ['/horar/', 'natal:horary', 'Хорарная астрология онлайн: ответ на вопрос — AstroSky',
      'Хорар: ответ на конкретный вопрос по карте момента, когда он задан, — сигнификаторы, их сила и аспекты по правилам Лилли и Фроули.', 'Хорар'],
    ['/zvezdy/', 'natal:stars', 'Натальные карты знаменитостей: на кого вы похожи — AstroSky',
      'Карты известных людей с расшифровкой и сравнение с вашей натальной картой: на кого из знаменитостей вы похожи и чем именно.', 'Звёзды'],

    ['/astrokartografiya/', 'map', 'Астрокартография онлайн: линии планет на карте мира — AstroSky',
      'Линии MC, IC, ASC и DSC всех планет на карте мира по вашей натальной карте, аспектные линии, параны и лучшие города для любви, карьеры и денег.', 'Астрокартография'],
    ['/relokaciya/', 'city', 'Релокация: ваша натальная карта в любом городе — AstroSky',
      'Как меняется натальная карта в другом городе: дома и углы на новом месте, лучи планет от вашего дома на карте улиц, сильные стороны места.', 'Релокация'],

    ['/planetarnye-chasy/', 'tools:hours', 'Планетарные часы и управитель дня — AstroSky',
      'Управитель дня и планетарные часы на любую дату и город: какая планета управляет каждым часом дня и ночи.', 'Управители дня и часа'],
    ['/luna-bez-kursa/', 'tools:voc', 'Луна без курса: периоды на две недели — AstroSky',
      'Когда Луна без курса: начало и конец каждого периода на ближайшие две недели, по классическим или современным планетам.', 'Луна без курса'],
    ['/lunnye-dni/', 'tools:lunar', 'Лунные дни сегодня и на любую дату — AstroSky',
      'Какой сейчас лунный день, когда он начался и когда начнётся следующий, фаза Луны и её знак — для любой даты и города.', 'Лунные дни'],
    ['/efemeridy/', 'tools:eph', 'Эфемериды планет на месяц — AstroSky',
      'Таблица эфемерид на месяц: положения Солнца, Луны, планет, лунного узла и Хирона по знакам и градусам на каждый день.', 'Эфемериды'],
    ['/bioritmy/', 'tools:bio', 'Биоритмы по дате рождения — AstroSky',
      'Физический, эмоциональный и интеллектуальный биоритмы по дате рождения, критические дни, биоритмы всей семьи и PDF на месяц.', 'Биоритмы'],
    ['/numerologiya/', 'tools:num', 'Квадрат Пифагора: нумерология по дате рождения — AstroSky',
      'Психоматрица (квадрат Пифагора) по дате рождения: цифры в каждой клетке и что они говорят о характере.', 'Нумерология'],
    ['/tridcatigradusnik/', 'tools:deg30', 'Тридцатиградусник натальной карты — AstroSky',
      'Все планеты и углы натальной карты на одной шкале от 0 до 30 градусов: видно, какие точки стоят на близких градусах разных знаков.', 'Тридцатиградусник'],
    ['/profekcii/', 'tools:prof', 'Профекции: управитель года по натальной карте — AstroSky',
      'Годовые профекции: какой дом и знак активен в этом году, управитель года и планеты в знаке года.', 'Профекции'],
    ['/tranzity/', 'tools:transits', 'Календарь транзитов по натальной карте — AstroSky',
      'Транзиты Юпитера, Сатурна, Урана, Нептуна и Плутона к вашей натальной карте на год: даты точных аспектов.', 'Календарь транзитов'],
    ['/cikly-zhizni/', 'tools:cycles', 'Циклы жизни: возвраты и кризисы по натальной карте — AstroSky',
      'Главные циклы жизни по натальной карте до 90 лет: возвращения Юпитера и Сатурна, оппозиция Урана, возвращение Хирона и сферы, которые они затрагивают.', 'Циклы жизни'],
    ['/arabskie-zhrebii/', 'tools:lots', 'Арабские жребии в натальной карте — AstroSky',
      'Арабские жребии Павла Александрийского в вашей натальной карте: положение, дом, формула и тема каждого жребия.', 'Арабские жребии'],
    ['/dispozitory/', 'tools:disp', 'Диспозиторы планет в натальной карте — AstroSky',
      'Цепочки диспозиторов вашей натальной карты и конечный диспозитор, по классическим или современным управителям.', 'Диспозиторы'],

    ['/sport/', 'sport', 'Астропрогноз матчей по Фроули — AstroSky',
      'Ближайшие матчи АПЛ, Ла Лиги, Лиги 1, еврокубков и НХЛ: карта начала матча и прогноз по методу Джона Фроули.', 'Спорт'],
  ].map(([path, spec, title, desc, name]) => ({ path, spec, title, desc, name }));

  // a section opened without a mode shows its first page
  const DEFAULT_MODE = { natal: 'natal', tools: 'hours' };
  const ALIAS = { 'tools:family': 'tools:bio' };   // the family biorhythms are a view of the biorhythms page
  const byPath = new Map(PAGES.map((p) => [p.path, p]));
  const bySpec = new Map(PAGES.map((p) => [p.spec, p]));

  const norm = (pathname) => { const p = String(pathname || '/').replace(/index\.html$/, ''); return p.endsWith('/') ? p : p + '/'; };
  const pageOfPath = (pathname) => byPath.get(norm(pathname)) || null;
  function pageOf(spec) {
    const [view, mode] = String(ALIAS[spec] || spec).split(':');
    return bySpec.get(`${view}:${mode}`) || bySpec.get(`${view}:${DEFAULT_MODE[view]}`) || bySpec.get(view) || null;
  }

  const R = { SITE, PAGES, pageOf, pageOfPath, path: (spec) => (pageOf(spec) || PAGES[0]).path, go: null, sync: null };
  if (typeof module === 'object' && module.exports) module.exports = R;
  else g.ROUTES = R;
})(typeof window !== 'undefined' ? window : globalThis);
