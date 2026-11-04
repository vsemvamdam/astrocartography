/* Horary astrology after John Frawley ("The Horary Textbook"): Regiomontanus houses, the seven
   traditional planets, Lilly's table of essential dignities (Ptolemaic terms, Mars rules the water
   triplicity by day and night), perfection of aspects before a change of sign, prohibition,
   refranation, translation and collection of light, receptions, the Moon's course, timing.
   Depends on Astronomy, ACG (acg-core.js), NATAL (natal.js) and FEAT (features.js, for fixed stars). */
(function (root) {
  'use strict';
  const ACG = root.ACG;
  const A = () => root.Astronomy;
  const n360 = (x) => ((x % 360) + 360) % 360;
  const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  const DAY = 86400000;
  const SEVEN = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const RU = { Sun: 'Солнце', Moon: 'Луна', Mercury: 'Меркурий', Venus: 'Венера', Mars: 'Марс', Jupiter: 'Юпитер', Saturn: 'Сатурн' };

  /* ---------------------------- Lilly's dignities --------------------------- */
  const DOMICILE = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
  const EXALT = { Sun: 0, Moon: 1, Mercury: 5, Venus: 11, Mars: 9, Jupiter: 3, Saturn: 6 };
  const TRIP = [['Sun', 'Jupiter'], ['Venus', 'Moon'], ['Saturn', 'Mercury'], ['Mars', 'Mars']];   // [day, night] for fire, earth, air, water
  const TERMS = [                                                                                     // Ptolemaic terms as printed by Lilly
    [['Jupiter', 6], ['Venus', 14], ['Mercury', 21], ['Mars', 26], ['Saturn', 30]],
    [['Venus', 8], ['Mercury', 15], ['Jupiter', 22], ['Saturn', 26], ['Mars', 30]],
    [['Mercury', 7], ['Jupiter', 14], ['Venus', 21], ['Saturn', 25], ['Mars', 30]],
    [['Mars', 6], ['Jupiter', 13], ['Mercury', 20], ['Venus', 27], ['Saturn', 30]],
    [['Saturn', 6], ['Mercury', 13], ['Venus', 19], ['Jupiter', 25], ['Mars', 30]],
    [['Mercury', 7], ['Venus', 13], ['Jupiter', 18], ['Saturn', 24], ['Mars', 30]],
    [['Saturn', 6], ['Venus', 11], ['Jupiter', 19], ['Mercury', 24], ['Mars', 30]],
    [['Mars', 6], ['Jupiter', 14], ['Venus', 21], ['Mercury', 27], ['Saturn', 30]],
    [['Jupiter', 8], ['Venus', 14], ['Mercury', 19], ['Saturn', 25], ['Mars', 30]],
    [['Venus', 6], ['Mercury', 12], ['Jupiter', 19], ['Mars', 25], ['Saturn', 30]],
    [['Saturn', 6], ['Mercury', 12], ['Venus', 20], ['Jupiter', 25], ['Mars', 30]],
    [['Venus', 8], ['Jupiter', 14], ['Mercury', 20], ['Mars', 26], ['Saturn', 30]],
  ];
  const FACE = ['Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter'];
  const signOf = (lon) => Math.floor(n360(lon) / 30);
  const termOf = (lon) => { const s = signOf(lon), d = n360(lon) - s * 30; return TERMS[s].find(([, e]) => d < e)[0]; };
  const faceOf = (lon) => FACE[Math.floor(n360(lon) / 10) % 7];
  // who holds each dignity at this degree
  function rulersAt(lon, day) {
    const s = signOf(lon), ex = Object.keys(EXALT).find((k) => EXALT[k] === s) || null;
    return {
      domicile: DOMICILE[s], exalt: ex, trip: TRIP[s % 4][day ? 0 : 1], term: termOf(lon), face: faceOf(lon),
      detriment: DOMICILE[(s + 6) % 12], fall: Object.keys(EXALT).find((k) => (EXALT[k] + 6) % 12 === s) || null,
    };
  }
  const DIGN_RU = { domicile: 'обитель', exalt: 'экзальтация', trip: 'триплицитет', term: 'термы', face: 'фас', detriment: 'изгнание', fall: 'падение', peregrine: 'перегрин' };
  function essential(id, lon, day) {
    const r = rulersAt(lon, day), out = [];
    for (const k of ['domicile', 'exalt', 'trip', 'term', 'face']) if (r[k] === id) out.push(k);
    if (!out.length) out.push('peregrine');
    if (r.detriment === id) out.push('detriment');
    if (r.fall === id) out.push('fall');
    return out;
  }

  /* -------------------------------- motion -------------------------------- */
  const MEAN = { Moon: 13.18, Mercury: 1.383, Venus: 1.2, Sun: 0.9856, Mars: 0.524, Jupiter: 0.083, Saturn: 0.034 };   // mean daily motion
  const MOIETY = { Sun: 8.5, Moon: 6.25, Mercury: 3.5, Venus: 3.5, Mars: 3.75, Jupiter: 6, Saturn: 5 };               // half of Lilly's orbs
  const lonAt = (id, ms) => A().Ecliptic(A().GeoVector(A().Body[id], A().MakeTime(new Date(ms)), true)).elon;
  const speedAt = (id, ms) => n180(lonAt(id, ms + 0.05 * DAY) - lonAt(id, ms - 0.05 * DAY)) / 0.1;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const TARGETS = [0, 60, 90, 120, 180, 240, 270, 300];
  const ASP = { 0: { ru: 'соединение', g: '☌' }, 60: { ru: 'секстиль', g: '⚹' }, 90: { ru: 'квадрат', g: '□' }, 120: { ru: 'трин', g: '△' }, 180: { ru: 'оппозиция', g: '☍' } };
  const aspOfTarget = (T) => (T <= 180 ? T : 360 - T);

  function bisect(f, a, b) {
    let fa = f(a);
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2, fm = f(m); if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m; }
    return (a + b) / 2;
  }
  // when a planet next leaves (or, going back, entered) its current sign
  function signBoundary(id, t0, dir, maxDays) {
    const s0 = signOf(lonAt(id, t0)), v = Math.abs(speedAt(id, t0)) || 0.01;
    const step = clamp(0.5 / v, 1 / 24, 3) * DAY * dir;
    let t = t0;
    for (let i = 0; i < 2000; i++) {
      const t2 = t + step;
      if (Math.abs(t2 - t0) > maxDays * DAY) return dir > 0 ? Infinity : -Infinity;
      if (signOf(lonAt(id, t2)) !== s0) return bisect((x) => (signOf(lonAt(id, x)) === s0 ? -1 : 1), t, t2);
      t = t2;
    }
    return dir > 0 ? Infinity : -Infinity;
  }
  /* First exact Ptolemaic aspect between a and b after (dir = 1) or before (dir = −1) t0, up to tEnd.
     Also reports stations met on the way (for refranation). */
  function scanPair(a, b, t0, tEnd, dir) {
    dir = dir || 1;
    const v = Math.abs(speedAt(a, t0)) + Math.abs(speedAt(b, t0));
    const step = clamp(0.2 / Math.max(v, 0.02), 1 / 48, 3) * DAY;
    const diff = (t) => n360(lonAt(b, t) - lonAt(a, t));
    let t = t0, d = diff(t);
    let va = Math.sign(speedAt(a, t0)), vb = Math.sign(speedAt(b, t0));
    let la = lonAt(a, t), lb = lonAt(b, t);
    const stations = [];
    for (let i = 0; i < 4000; i++) {
      let t2 = t + dir * step;
      if ((dir > 0 && t2 > tEnd) || (dir < 0 && t2 < tEnd)) t2 = tEnd;
      if (t2 === t) break;
      const la2 = lonAt(a, t2), lb2 = lonAt(b, t2), d2 = n360(lb2 - la2);
      const sa = Math.sign(n180(la2 - la)) * dir, sb = Math.sign(n180(lb2 - lb)) * dir;
      if (sa && va && sa !== va) { stations.push({ id: a, t: t2 }); va = sa; }
      if (sb && vb && sb !== vb) { stations.push({ id: b, t: t2 }); vb = sb; }
      for (const T of TARGETS) {
        const e1 = n180(d - T), e2 = n180(d2 - T);
        if (Math.abs(e1) < 30 && Math.abs(e2) < 30 && (e1 === 0 || (e1 < 0) !== (e2 < 0))) {
          const tx = bisect((x) => n180(diff(x) - T), t, t2);
          return { t: tx, asp: aspOfTarget(T), stations };
        }
      }
      t = t2; d = d2; la = la2; lb = lb2;
      if (t === tEnd) break;
    }
    return { t: null, stations };
  }
  // the aspect a pair is closest to right now, and whether it is applying
  function current(a, b, t0) {
    const d = n360(lonAt(b, t0) - lonAt(a, t0)), dn = n360(lonAt(b, t0 + 0.02 * DAY) - lonAt(a, t0 + 0.02 * DAY));
    let best = null;
    for (const T of TARGETS) { const e = n180(d - T); if (!best || Math.abs(e) < Math.abs(best.e)) best = { T, e }; }
    const en = n180(dn - best.T);
    return { asp: aspOfTarget(best.T), orb: Math.abs(best.e), applying: Math.abs(en) < Math.abs(best.e) };
  }

  /* ------------------------------- the chart ------------------------------- */
  const ANGULAR = [1, 4, 7, 10], SUCCEDENT = [2, 5, 8, 11];
  // a planet within 5° before the next cusp, in the cusp's sign, is read in that house
  function houseFrawley(lon, cusps, houseOf) {
    const h = houseOf(lon, cusps), next = h === 12 ? 1 : h + 1;
    const gap = n360(cusps[next] - lon);
    return gap <= 5 && signOf(cusps[next]) === signOf(lon) ? { h: next, near: true } : { h, near: false };
  }
  const SIGN_QUAL = (s) => s % 3;    // 0 cardinal, 1 fixed, 2 mutable
  const UNITS = ['дни', 'дни или недели', 'недели', 'месяцы', 'годы'];

  /* nat: NATAL.computeNatal(chart, lat, lon, { house: 'R' }); opt: { base, rel } houses (1 = querent). */
  function analyse(chart, nat, opt) {
    const N = root.NATAL;
    const t0 = chart.utcMs, day = nat.isDay;
    const P = {};
    for (const id of SEVEN) {
      const p = nat.points.find((q) => q.id === id);
      const hf = houseFrawley(p.lon, nat.cusps, N.houseOf);
      P[id] = { id, ru: RU[id], color: p.color, glyph: p.glyph, lon: p.lon, speed: p.speed, retro: p.speed < 0, house: hf.h, nearCusp: hf.near };
    }
    const ruler = (h) => DOMICILE[signOf(nat.cusps[h])];
    const base = opt.base || 1, rel = opt.rel || 7;
    const qh = ((base - 1) + (rel - 1)) % 12 + 1;
    const sigBase = ruler(base), sigQ = ruler(qh);

    // strength of each planet
    const stars = root.FEAT ? root.FEAT.starLongitudes(t0) : [];
    const node = nat.points.find((q) => q.id === 'Node');
    const sun = P.Sun;
    for (const id of SEVEN) {
      const p = P[id];
      p.ess = essential(id, p.lon, day);
      const acc = [];
      acc.push(ANGULAR.includes(p.house) ? ['угловой дом', 1] : SUCCEDENT.includes(p.house) ? ['последующий дом', 0] : ['падающий дом', -1]);
      if (p.retro) acc.push(['ретроградный', -1]);
      const sp = Math.abs(p.speed) / MEAN[id];
      if (id !== 'Sun' && id !== 'Moon' && sp < 0.1) acc.push(['почти стоит (станция)', -1]);
      else if (id !== 'Sun' && !p.retro && sp > 1.15) acc.push(['быстрее среднего', 1]);
      else if (id !== 'Sun' && !p.retro && sp < 0.6) acc.push(['медленнее среднего', -1]);
      if (id !== 'Sun') {
        const ds = Math.abs(n180(p.lon - sun.lon));
        if (ds <= 17 / 60) acc.push(['кацими (в сердце Солнца)', 2]);
        else if (ds <= 8.5) acc.push(['сожжён Солнцем', -2]);
        else if (ds <= 17) acc.push(['под лучами Солнца', -1]);
      }
      if (node) {
        if (Math.abs(n180(p.lon - node.lon)) <= 3) acc.push(['с северным узлом', 1]);
        if (Math.abs(n180(p.lon - node.lon - 180)) <= 3) acc.push(['с южным узлом', -1]);
      }
      for (const st of stars) {
        if (Math.abs(n180(p.lon - st.lon)) > 1) continue;
        if (/^Регул|^Спика/.test(st.ru)) acc.push([`на звезде ${st.ru}`, 1]);
        if (/^Алгол/.test(st.ru)) acc.push(['на звезде Алголь', -2]);
      }
      p.acc = acc;
    }

    // sign changes and every pair's next perfection before either planet leaves its sign
    const exit = {}, entry = {};
    for (const id of SEVEN) { exit[id] = signBoundary(id, t0, 1, 400); entry[id] = signBoundary(id, t0, -1, 400); }
    const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const events = {};
    for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
      const a = SEVEN[i], b = SEVEN[j];
      const end = Math.min(exit[a], exit[b], t0 + 400 * DAY);
      const r = scanPair(a, b, t0, end, 1);
      events[key(a, b)] = Object.assign(r, { a, b, end, now: current(a, b, t0) });
    }
    const ev = (a, b) => events[key(a, b)];

    // the Moon: aspects until it leaves the sign, and the last one since it entered
    const moonNext = [], moonPrev = [];
    for (const id of SEVEN) {
      if (id === 'Moon') continue;
      const f = scanPair('Moon', id, t0, exit.Moon, 1);
      if (f.t) moonNext.push({ id, t: f.t, asp: f.asp });
      const b = scanPair('Moon', id, t0, entry.Moon, -1);
      if (b.t) moonPrev.push({ id, t: b.t, asp: b.asp });
    }
    moonNext.sort((x, y) => x.t - y.t); moonPrev.sort((x, y) => y.t - x.t);
    const voc = moonNext.length === 0;
    const moonSign = signOf(P.Moon.lon);

    // receptions: B "receives" A when A stands in B's dignity
    function reception(a, b) {
      const r = rulersAt(P[a].lon, day), out = [];
      for (const k of ['domicile', 'exalt', 'trip', 'term', 'face', 'detriment', 'fall']) if (r[k] === b) out.push(k);
      return out;
    }
    function judgePair(a, b, label) {
      if (a === b) return { a, b, label, same: true };
      const e = ev(a, b);
      const res = { a, b, label, now: e.now, recAB: reception(a, b), recBA: reception(b, a) };
      res.mutual = ['domicile', 'exalt'].some((k) => res.recAB.includes(k)) && ['domicile', 'exalt'].some((k) => res.recBA.includes(k));
      if (e.t) {
        res.perfects = true; res.t = e.t; res.asp = e.asp;
        const d0 = n360(P[b].lon - P[a].lon);
        res.degrees = Math.min(...TARGETS.filter((T) => aspOfTarget(T) === e.asp).map((T) => Math.abs(n180(d0 - T))));
        // who is moving to perfection: the faster one
        const fast = Math.abs(P[a].speed) >= Math.abs(P[b].speed) ? a : b;
        const score = SIGN_QUAL(signOf(P[fast].lon)) === 0 ? 0 : SIGN_QUAL(signOf(P[fast].lon)) === 2 ? 1 : 2;
        const hs = ANGULAR.includes(P[fast].house) ? 0 : SUCCEDENT.includes(P[fast].house) ? 1 : 2;
        res.timing = { fast, units: UNITS[score + hs], days: (e.t - t0) / DAY };
        // prohibition: another planet perfects with one of them first (the Moon meets everyone on the way, so it is listed apart)
        res.prohibit = [];
        for (const x of SEVEN) {
          if (x === a || x === b || x === 'Moon') continue;
          for (const s of [a, b]) { const f = ev(x, s); if (f.t && f.t < e.t) res.prohibit.push({ x, s, t: f.t, asp: f.asp }); }
        }
        res.prohibit.sort((u, v) => u.t - v.t);
      } else {
        res.perfects = false;
        const st = e.stations.find((s) => s.id === a || s.id === b);
        res.refranation = e.now.applying && st ? st : null;
        res.signChange = exit[a] < exit[b] ? { id: a, t: exit[a] } : { id: b, t: exit[b] };
        // does it perfect soon after the change of sign?
        if (isFinite(e.end) && e.now.applying) {
          const later = scanPair(a, b, e.end + 60000, Math.min(e.end + 60 * DAY, t0 + 400 * DAY), 1);
          if (later.t) res.afterSign = { t: later.t, asp: later.asp };
        }
        // translation: a faster planet separating from one and applying to the other
        res.translation = [];
        for (const x of SEVEN) {
          if (x === a || x === b) continue;
          for (const [from, to] of [[a, b], [b, a]]) {
            const sep = ev(x, from).now, go = ev(x, to);
            if (!sep.applying && sep.orb <= MOIETY[x] + MOIETY[from] && Math.abs(P[x].speed) > Math.abs(P[from].speed) && go.t) res.translation.push({ x, from, to, t: go.t, asp: go.asp, sepAsp: sep.asp });
          }
        }
        // collection: a slower planet that both apply to
        res.collection = [];
        for (const x of SEVEN) {
          if (x === a || x === b) continue;
          if (Math.abs(P[x].speed) < Math.abs(P[a].speed) && Math.abs(P[x].speed) < Math.abs(P[b].speed)) {
            const ea = ev(a, x), eb = ev(b, x);
            if (ea.t && eb.t) res.collection.push({ x, ta: ea.t, tb: eb.t, aspA: ea.asp, aspB: eb.asp });
          }
        }
      }
      return res;
    }

    const pairs = [];
    if (base === 1) {
      if (qh === 1) pairs.push({ same: true, a: sigBase, b: sigBase, label: 'Вопрос о самом спрашивающем' });
      else {
        pairs.push(judgePair(sigBase, sigQ, 'управитель I дома (вы) и управитель дома вопроса'));
        if (sigBase !== 'Moon' && sigQ !== 'Moon') pairs.push(judgePair('Moon', sigQ, 'Луна (ваш со-сигнификатор) и управитель дома вопроса'));
        if (sigBase === sigQ) pairs[0].same = true;
      }
    } else {
      pairs.push(judgePair(sigBase, sigQ, `управитель ${base} дома (о ком вопрос) и управитель дома вопроса`));
    }

    // considerations before judgement
    const ascDeg = n360(nat.asc) % 30, warn = [];
    if (ascDeg < 3) warn.push({ k: 'early', t: `Асцендент в ${Math.floor(ascDeg)}° знака: ситуация ещё только складывается, спрашивать может быть рано.` });
    if (ascDeg > 27) warn.push({ k: 'late', t: `Асцендент в ${Math.floor(ascDeg)}° знака: дело почти решено, повлиять на него уже трудно.` });
    if (voc) warn.push({ k: 'voc', t: `Луна без курса: до ухода из знака она не делает аспектов к планетам. Обычно «из этого ничего не выйдет»${[1, 3, 8, 11].includes(moonSign) ? '; но Луна в Тельце, Раке, Стрельце или Рыбах, по Лилли, ещё может что-то принести' : ''}.` });
    const ml = n360(P.Moon.lon);
    if (ml >= 195 && ml <= 225) warn.push({ k: 'via', t: 'Луна в «Сожжённом пути» (15° Весов — 15° Скорпиона): время тревожное, события непредсказуемы.' });
    if (P.Saturn.house === 7) warn.push({ k: 'sat7', t: 'Сатурн в VII доме: по традиции суждение астролога может быть ошибочным, проверьте себя внимательнее.' });
    if (P.Saturn.house === 1) warn.push({ k: 'sat1', t: 'Сатурн в I доме: спрашивающий подавлен или ситуация тяжела для него.' });

    // verdict
    const judged = pairs.filter((p) => !p.same), main = judged[0];
    let verdict;
    const good = judged.find((p) => p.perfects);
    if (!main) verdict = { v: 'look', t: `Обе стороны вопроса показывает одна планета (${RU[sigBase]}): смотрите её силу и состояние, и куда направляется Луна.` };
    else if (good) verdict = { v: 'yes', pair: good, t: `Сигнификаторы приходят к точному аспекту (${ASP[good.asp].ru}) до смены знака — по Фроули это «да».` };
    else {
      const tr = pairs.flatMap((p) => p.translation || []), co = pairs.flatMap((p) => p.collection || []);
      if (!main.now.applying && main.now.orb < 1) verdict = { v: 'past', t: `Сигнификаторы только что разошлись после точного аспекта (${ASP[main.now.asp].ru}): событие уже позади — то, о чём вы спрашиваете, вероятно, уже произошло или было упущено.` };
      else if (tr.length) verdict = { v: 'via', t: `Прямого аспекта нет, но ${RU[tr[0].x]} переносит свет от ${GEN[tr[0].from]} к ${DAT[tr[0].to]} — «да» с помощью третьего лица или обстоятельства.` };
      else if (co.length) verdict = { v: 'via', t: `Прямого аспекта нет, но ${RU[co[0].x]} собирает свет обоих сигнификаторов — «да» через посредника.` };
      else if (main.afterSign) verdict = { v: 'maybe', t: `Точный аспект (${ASP[main.afterSign.asp].ru}) будет только после того, как ${RU[main.signChange.id]} сменит знак. Это ослабляет «да»: дело может состояться, но в сильно изменившихся обстоятельствах.` };
      else if (main.refranation) verdict = { v: 'no', t: `${RU[main.refranation.id]} разворачивается раньше, чем аспект станет точным (рефранация): дело сорвётся в последний момент.` };
      else verdict = { v: 'no', t: 'Сигнификаторы не приходят к аспекту до смены знака, и нет переноса или сбора света — по Фроули ответ скорее «нет».' };
    }
    return { t0, qh, base, rel, sigBase, sigQ, P, pairs, moonNext, moonPrev, voc, warn, verdict, exit, ascDeg, isDay: day };
  }
  const GEN = { Sun: 'Солнца', Moon: 'Луны', Mercury: 'Меркурия', Venus: 'Венеры', Mars: 'Марса', Jupiter: 'Юпитера', Saturn: 'Сатурна' };
  const DAT = { Sun: 'Солнцу', Moon: 'Луне', Mercury: 'Меркурию', Venus: 'Венере', Mars: 'Марсу', Jupiter: 'Юпитеру', Saturn: 'Сатурну' };

  const HOUSES = [
    null,
    'вы сами, ваше тело, жизнь и состояние',
    'деньги, имущество, потерянные вещи',
    'братья и сёстры, соседи, короткие поездки, письма и новости',
    'отец, дом, квартира, земля, недвижимость',
    'дети, беременность, любовь без обязательств, удовольствия, азарт',
    'болезнь, подчинённые, домашние животные',
    'партнёр, супруг(а), любой «другой человек», открытый противник, сделка',
    'смерть, долги, деньги партнёра, налоги, наследство',
    'дальние поездки, учёба, вера, сны, знания',
    'мать, начальник, работа и карьера, власть, репутация',
    'друзья, надежды, покровители',
    'тайные враги, тюрьма, изоляция, больница',
  ];
  const BASES = [[1, 'Мой'], [7, 'Партнёра или другого человека'], [5, 'Ребёнка'], [3, 'Брата или сестры'], [4, 'Отца'], [10, 'Матери или начальника'], [11, 'Друга']];

  root.HORARY = { SEVEN, RU, GEN, DAT, ASP, DIGN_RU, HOUSES, BASES, MEAN, essential, rulersAt, analyse, scanPair, lonAt, signBoundary };
})(typeof window !== 'undefined' ? window : globalThis);
