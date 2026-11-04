/* New ideas for the "Спорт" judgement, taken from the books (Frawley's "Horary Textbook", "The Real
   Astrology", "Real Astrology Applied"; Hofman; Merriman), checked on the football base the same way as
   the rules already in js/sport.js (tools/sport_rules.js): the odds are calibrated on seasons
   2015/16–2022/23, and an idea is kept only if the team it supports wins more often than the calibrated
   odds expected both there (learning) and on 2023/24 onwards (test).

   An idea is { id, ru, src, kind, f(c) }:
     kind 'side'  — f returns > 0 for the favourite, < 0 for the underdog, 0 when silent;
     kind 'upset' — f returns true on matches where, by the idea, surprises are likelier (underdog wins);
     kind 'draw'  — f returns true where a draw is likelier.
   c is the chart of the kickoff at the venue (see context() below).
   Writes IDEAS.md to the base. Usage: node tools/sport_ideas.js <db-dir> */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'));
globalThis.Astronomy = require(process.env.ASTRONOMY_JS || 'astronomy-engine');
for (const f of ['data', 'acg-core', 'natal', 'features', 'horary', 'sport']) require(path.join(ROOT, 'js', f + '.js'));
const S = globalThis.SPORT, H = globalThis.HORARY, N = globalThis.NATAL, ACG = globalThis.ACG, FEAT = globalThis.FEAT;
const DB = process.argv[2];
if (!DB) { console.error('usage: node tools/sport_ideas.js <db-dir>'); process.exit(2); }
const TRAIN = [2015, 2022], TEST_FROM = 2023;
const DAY = 86400000;
const n360 = (x) => ((x % 360) + 360) % 360;
const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
const signOf = (lon) => Math.floor(n360(lon) / 30);
const DOMICILE = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const EXALT = { Sun: 0, Moon: 1, Mercury: 5, Venus: 11, Mars: 9, Jupiter: 3, Saturn: 6 };
const SEVEN = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const MEAN = { Moon: 13.18, Mercury: 1.383, Venus: 1.2, Sun: 0.9856, Mars: 0.524, Jupiter: 0.083, Saturn: 0.034 };
const POINTS = { domicile: 5, exalt: 4, trip: 3, term: 2, face: 1, detriment: -5, fall: -4, peregrine: -5 };

/* ------------------------------------ the chart ------------------------------------ */
// everything an idea may ask about the chart of one match; the lords follow js/sport.js
function context(r) {
  const t0 = Date.parse(r.kickoff), E = S.eventChart(t0, r.place, 'P');
  const { P, cusps, fortune } = E, asc = E.nat.asc, mc = E.nat.mc;
  const house = (lon) => N.houseOf(lon, cusps);
  const sun = P.Sun.lon, isDay = [7, 8, 9, 10, 11, 12].includes(house(sun));
  const ruler = (h) => DOMICILE[signOf(cusps[h])];
  const L = {};
  for (const h of [1, 7]) { let x = ruler(h); if (x === 'Moon') x = DOMICILE[signOf(P.Moon.lon)]; L[h] = x === 'Moon' ? null : x; }
  for (const h of [10, 4]) { const x = ruler(h); L[h] = x === 'Moon' || x === L[1] || x === L[7] ? null : x; }
  const stars = FEAT ? FEAT.starLongitudes(t0) : [];
  const ess = {}, acc = {};
  for (const id of SEVEN) {
    const p = P[id];
    ess[id] = H.essential(id, p.lon, isDay).reduce((s, k) => s + (POINTS[k] || 0), 0);
    let a = 0;
    const hs = house(p.lon);
    a += [1, 4, 7, 10].includes(hs) ? 1 : [2, 5, 8, 11].includes(hs) ? 0 : -1;
    if (p.retro) a -= 1;
    const sp = Math.abs(p.speed) / MEAN[id];
    if (id !== 'Sun' && id !== 'Moon' && sp < 0.1) a -= 1; else if (id !== 'Sun' && !p.retro && sp > 1.15) a += 1; else if (id !== 'Sun' && !p.retro && sp < 0.6) a -= 1;
    if (id !== 'Sun') { const ds = Math.abs(n180(p.lon - sun)); if (ds <= 17 / 60) a += 2; else if (ds <= 8.5) a -= 2; else if (ds <= 17) a -= 1; }
    if (Math.abs(n180(p.lon - P.Node.lon)) <= 3) a += 1;
    if (Math.abs(n180(p.lon - P.Node.lon - 180)) <= 3) a -= 1;
    for (const st of stars) if (Math.abs(n180(p.lon - st.lon)) <= 1) { if (/^Регул|^Спика/.test(st.ru)) a += 1; if (/^Алгол/.test(st.ru)) a -= 2; }
    acc[id] = a;
  }
  // receptions: does planet a stand in a dignity of planet b
  const rec = (a, b, kinds) => { const k = H.rulersAt(P[a].lon, isDay); return (kinds || ['domicile', 'exalt']).some((x) => k[x] === b); };
  // the Moon's next exact aspect to one of the seven planets before she leaves her sign (computed on demand)
  let mn;
  const moonNext = () => {
    if (mn !== undefined) return mn;
    const exit = H.signBoundary('Moon', t0, 1, 5);
    mn = null;
    for (const id of SEVEN) { if (id === 'Moon') continue; const f = H.scanPair('Moon', id, t0, exit, 1); if (f && f.t && (!mn || f.t < mn.t)) mn = { id, t: f.t, asp: f.asp }; }
    return mn;
  };
  const cal = () => windowAt(Math.floor(t0 / DAY) - CAL.d0);
  return { r, t0, E, P, cusps, asc, mc, fortune, isDay, L, ess, acc, rec, house, stars, moonNext, cal };
}

/* ------------------------------------- ideas -------------------------------------- */
const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const ASPS = [0, 60, 90, 120, 180];
const aspect = (a, b, orb) => ASPS.find((x) => Math.abs(Math.abs(n180(a - b)) - x) <= orb);
const near = (a, b, orb) => Math.abs(n180(a - b)) <= orb;
const dig = (c, id) => H.essential(id, c.P[id].lon, c.isDay);
const dignified = (c, id) => dig(c, id).some((k) => k === 'domicile' || k === 'exalt');
const debilitated = (c, id) => dig(c, id).some((k) => k === 'detriment' || k === 'fall');
// the house after Frawley: a planet up to 5° before a cusp, in the cusp's sign, already counts in that house
function hF(c, lon) {
  let h = c.house(lon);
  const nx = h % 12 + 1, d = n180(c.cusps[nx] - lon);
  if (d > 0 && d <= 5 && signOf(lon) === signOf(c.cusps[nx])) h = nx;
  return h;
}
// the planets of the two sides as the books take them: the rulers of the 1st and 7th cusps, the Moon included
const M1 = (c) => DOMICILE[signOf(c.cusps[1])], M7 = (c) => DOMICILE[signOf(c.cusps[7])];
const both = (f) => (c) => { const a = M1(c), b = M7(c); return a === b ? 0 : f(c, a, 1) - f(c, b, 1); };   // f(c, planet) for each side
// Lilly's table of strength ("The Real Astrology", ch. 17, pp. 294–295)
const HOUSE_PTS = { 1: 5, 10: 5, 7: 4, 4: 4, 11: 4, 2: 3, 5: 3, 9: 2, 3: 1, 12: -5, 6: -4, 8: -4 };
function besieged(c, id) {
  const lon = c.P[id].lon, others = SEVEN.filter((x) => x !== id && x !== 'Moon');
  let fw = null, bw = null;
  for (const x of others) { const d = n360(c.P[x].lon - lon); if (!fw || d < fw.d) fw = { x, d }; if (!bw || 360 - d < bw.d) bw = { x, d: 360 - d }; }
  const pair = [fw.x, bw.x].sort().join('+');
  const same = signOf(c.P[fw.x].lon) === signOf(lon) && signOf(c.P[bw.x].lon) === signOf(lon);
  return !same ? 0 : pair === 'Mars+Saturn' ? -1 : pair === 'Jupiter+Venus' ? 1 : 0;
}
function lilly(c, id) {
  const p = c.P[id], sun = c.P.Sun.lon;
  let s = c.ess[id] + (HOUSE_PTS[c.house(p.lon)] || 0);
  if (id !== 'Sun' && id !== 'Moon') s += p.retro ? -5 : 4;
  const sp = Math.abs(p.speed) / MEAN[id]; s += sp > 1 ? 2 : -2;
  for (const [x, pts] of [['Jupiter', { 0: 5, 120: 4, 60: 3 }], ['Venus', { 0: 5, 120: 4, 60: 3 }], ['Saturn', { 0: -5, 180: -4, 90: -3 }], ['Mars', { 0: -5, 180: -4, 90: -3 }]]) {
    if (x === id) continue;
    const a = aspect(p.lon, c.P[x].lon, 1); if (a != null && pts[a] != null) s += pts[a];
  }
  if (near(p.lon, c.P.Node.lon, 1)) s += 4; if (near(p.lon, c.P.Node.lon + 180, 1)) s -= 4;
  s += 5 * besieged(c, id);
  if (id !== 'Sun') { const ds = Math.abs(n180(p.lon - sun)); s += ds <= 17.5 / 60 ? 5 : ds <= 8.5 ? -5 : ds <= 17.5 ? -4 : 5; }
  if (id === 'Moon') s += n360(p.lon - sun) < 180 ? 2 : -2;
  const oriental = n180(p.lon - sun) < 0;
  if (['Saturn', 'Jupiter', 'Mars'].includes(id)) s += oriental ? 2 : -2;
  if (['Venus', 'Mercury'].includes(id)) s += oriental ? -2 : 2;
  for (const st of c.stars) if (near(p.lon, st.lon, 1)) { if (/^Регул/.test(st.ru)) s += 6; if (/^Спика/.test(st.ru)) s += 5; if (/^Алгол/.test(st.ru)) s -= 5; }
  return s;
}
// the house strength that Frawley's "Horary Textbook" puts first in sports questions (p. 185)
function houseStrength(c, id, side) {
  const lon = c.P[id].lon, h = hF(c, lon);
  let s = [1, 4, 7, 10].includes(h) ? (signOf(lon) === signOf(c.cusps[h]) ? 2 : 1) : [6, 8, 12].includes(h) ? -1 : 0;
  const own = side > 0 ? 1 : 7, opp = side > 0 ? 7 : 1;
  if (h === own) s += 1; if (h === opp) s -= 2;
  return s;
}
const ROYAL = /^(Альдебаран|Регул|Антарес|Спика|Поллукс|Зубен Эльгенуби)/;
function royal(c, pts, orb) { let k = 0; for (const lon of pts) for (const st of c.stars) if (ROYAL.test(st.ru) && near(lon, st.lon, orb)) k++; return k; }
// a part (lot): dispositor, angle and half of the chart
function partTests(id, ru, src, lotOf) {
  return [
    { id: id + '-disp', ru: `${ru}: её диспозитор — управитель команды`, src, kind: 'side', f: (c) => { const d = DOMICILE[signOf(lotOf(c))]; return (d === M1(c) || d === c.L[10] ? 1 : 0) - (d === M7(c) || d === c.L[4] ? 1 : 0); } },
    { id: id + '-angle', ru: `${ru} у куспида угла команды (3°)`, src, kind: 'side', f: (c) => { const l = lotOf(c); return (near(l, c.cusps[1], 3) || near(l, c.cusps[10], 3) ? 1 : 0) - (near(l, c.cusps[7], 3) || near(l, c.cusps[4], 3) ? 1 : 0); } },
    { id: id + '-east', ru: `${ru} в восточной половине (сторона фаворита) или в западной`, src, kind: 'side', f: (c) => ([10, 11, 12, 1, 2, 3].includes(c.house(lotOf(c))) ? 1 : -1) },
  ];
}
const FR_H = 'Фроули, «Хорарная астрология»', FR_R = 'Фроули, «Подлинная астрология», гл. 17', FR_W = 'Фроули, «Мастерская традиционного астролога»';
const IDEAS = [
  // strength of the two significators
  { id: 'house-1-7', ru: 'Управитель I сильнее по дому, чем управитель VII (угловой, у куспида, в своём доме; в доме соперника — проигрыш)', src: FR_H + ', с. 185 — главный критерий в спортивных вопросах', kind: 'side', f: (c) => { const a = M1(c), b = M7(c); return a === b ? 0 : sgn(houseStrength(c, a, 1) - houseStrength(c, b, -1)); } },
  { id: 'combust-8', ru: 'Управитель сожжён (до 8,5°, в одном знаке с Солнцем) — команда проигрывает', src: FR_H + ', с. 59, 185: «сожжённый сигнификатор говорит о том, что команда проиграет»', kind: 'side', f: both((c, id) => { if (id === 'Sun') return 0; const ds = Math.abs(n180(c.P[id].lon - c.P.Sun.lon)); return ds > 17.5 / 60 && ds <= 8.5 && signOf(c.P[id].lon) === signOf(c.P.Sun.lon) ? -1 : 0; }) },
  { id: 'beams', ru: 'Управитель под лучами Солнца (8,5–17,5°) — против команды', src: FR_H + ', с. 60; ' + FR_R, kind: 'side', f: both((c, id) => { if (id === 'Sun') return 0; const ds = Math.abs(n180(c.P[id].lon - c.P.Sun.lon)); return ds > 8.5 && ds <= 17.5 ? -1 : 0; }) },
  { id: 'cazimi', ru: 'Управитель в кацими (до 17,5′ от Солнца) — за команду', src: FR_W + '; ' + FR_R, kind: 'side', f: both((c, id) => (id !== 'Sun' && Math.abs(n180(c.P[id].lon - c.P.Sun.lon)) <= 17.5 / 60 ? 1 : 0)) },
  { id: 'sun-opp', ru: 'Управитель в оппозиции к Солнцу (8°) — против команды', src: FR_H + ', с. 61', kind: 'side', f: both((c, id) => (id !== 'Sun' && id !== 'Moon' && near(c.P[id].lon, c.P.Sun.lon + 180, 8) ? -1 : 0)) },
  { id: 'retro', ru: 'Управитель ретрограден — против команды', src: FR_H + ', с. 56–57', kind: 'side', f: both((c, id) => (c.P[id].retro ? -1 : 0)) },
  { id: 'station', ru: 'Управитель почти стоит (станция) — против команды', src: FR_H + ', с. 57', kind: 'side', f: both((c, id) => (id !== 'Sun' && id !== 'Moon' && Math.abs(c.P[id].speed) / MEAN[id] < 0.1 ? -1 : 0)) },
  { id: 'speed', ru: 'Управитель команды быстрее своего среднего хода, чем управитель соперника', src: FR_H + ', с. 58–59', kind: 'side', f: (c) => { const a = M1(c), b = M7(c); if (a === b) return 0; const v = (id) => (c.P[id].retro ? -1 : Math.abs(c.P[id].speed) / MEAN[id]); return sgn(v(a) - v(b)); } },
  { id: 'exalt', ru: 'Управитель в экзальтации — за команду (в состязаниях сильнее обители)', src: FR_H + ', с. 48, 184', kind: 'side', f: both((c, id) => (dig(c, id).includes('exalt') ? 1 : 0)) },
  { id: 'ess-1-7', ru: 'Управитель I сильнее по эссенциальным достоинствам, чем управитель VII', src: FR_H + ', с. 184: «кто более достоин победы»', kind: 'side', f: (c) => { const a = M1(c), b = M7(c); return a === b ? 0 : sgn(c.ess[a] - c.ess[b]); } },
  { id: 'lilly-1-7', ru: 'Управитель I сильнее по полной таблице Лилли, чем управитель VII', src: FR_R + ', с. 294–295', kind: 'side', f: (c) => { const a = M1(c), b = M7(c); return a === b ? 0 : sgn(lilly(c, a) - lilly(c, b)); } },
  { id: 'rec-power', ru: 'Управитель команды в обители или экзальтации управителя соперника — во власти соперника', src: FR_H + ', с. 185; ' + FR_W + ', с. 133', kind: 'side', f: (c) => { const a = M1(c), b = M7(c); return a === b ? 0 : (c.rec(b, a) ? 1 : 0) - (c.rec(a, b) ? 1 : 0); } },
  { id: 'aspect-dignity', ru: 'Тесный аспект (5°) управителя с планетой в достоинстве — за команду, в ущербе — против', src: FR_H + ', с. 185', kind: 'side', f: both((c, id) => SEVEN.reduce((s, x) => { if (x === id || aspect(c.P[id].lon, c.P[x].lon, 5) == null) return s; return s + (dignified(c, x) ? 1 : 0) - (debilitated(c, x) ? 1 : 0); }, 0)) },
  { id: 'aspect-benefic', ru: 'Тесный аспект (3°) управителя с Юпитером или Венерой — за команду; соединение, квадрат или оппозиция с Марсом или Сатурном — против', src: FR_R + ', с. 297–298', kind: 'side', f: both((c, id) => ['Jupiter', 'Venus'].reduce((s, x) => s + (x !== id && aspect(c.P[id].lon, c.P[x].lon, 3) != null ? 1 : 0), 0) - ['Mars', 'Saturn'].reduce((s, x) => s + (x !== id && [0, 90, 180].includes(aspect(c.P[id].lon, c.P[x].lon, 3)) ? 1 : 0), 0)) },
  { id: 'besieged', ru: 'Управитель осаждён Марсом и Сатурном — против; Юпитером и Венерой — за', src: FR_R + ', с. 298; ' + FR_H + ', с. 61', kind: 'side', f: both((c, id) => besieged(c, id)) },
  { id: 'stars-lords', ru: 'Управитель на Регуле или Спике (1°) — за команду, на Алголе — против', src: FR_R + ', с. 299–301', kind: 'side', f: both((c, id) => c.stars.reduce((s, st) => s + (near(c.P[id].lon, st.lon, 1) ? (/^(Регул|Спика)/.test(st.ru) ? 1 : /^Алгол/.test(st.ru) ? -1 : 0) : 0), 0)) },
  { id: 'royal-1', ru: 'Королевские звёзды (1°) на ASC, MC, управителях I и X — за фаворита; на DSC, IC, управителях VII и IV — за аутсайдера', src: FR_W + ', с. 50–52', kind: 'side', f: (c) => royal(c, [c.asc, c.mc, c.P[M1(c)].lon].concat(c.L[10] ? [c.P[c.L[10]].lon] : []), 1) - royal(c, [n360(c.asc + 180), n360(c.mc + 180), c.P[M7(c)].lon].concat(c.L[4] ? [c.P[c.L[4]].lon] : []), 1) },
  { id: 'royal-5', ru: 'То же с орбом 5° («кто из двух принцев взойдёт на престол»)', src: FR_W + ', с. 51', kind: 'side', f: (c) => royal(c, [c.asc, c.mc, c.P[M1(c)].lon].concat(c.L[10] ? [c.P[c.L[10]].lon] : []), 5) - royal(c, [n360(c.asc + 180), n360(c.mc + 180), c.P[M7(c)].lon].concat(c.L[4] ? [c.P[c.L[4]].lon] : []), 5) },
  { id: 'lord-12', ru: 'Управитель в своём XII доме (фаворит — в XII, аутсайдер — в VI) — против команды', src: FR_W + ', с. 156', kind: 'side', f: (c) => (hF(c, c.P[M1(c)].lon) === 12 ? -1 : 0) + (hF(c, c.P[M7(c)].lon) === 6 ? 1 : 0) },
  // what stands in the 1st and 7th houses and on the angles
  { id: 'planets-in-1-7', ru: 'Планета в I доме (в знаке куспида) в достоинстве — за фаворита, в ущербе — против; так же VII для аутсайдера', src: FR_H + ', с. 184', kind: 'side', f: (c) => SEVEN.reduce((s, x) => { const lon = c.P[x].lon, h = hF(c, lon); const w = (dignified(c, x) ? 1 : 0) - (debilitated(c, x) ? 1 : 0); if (h === 1 && signOf(lon) === signOf(c.cusps[1])) return s + w; if (h === 7 && signOf(lon) === signOf(c.cusps[7])) return s - w; return s; }, 0) },
  { id: 'nodes-in-1-7', ru: 'Северный узел в I доме — за фаворита, южный — против; в VII — так же для аутсайдера', src: FR_H + ', с. 184', kind: 'side', f: (c) => { let s = 0; for (const [lon, w] of [[c.P.Node.lon, 1], [n360(c.P.Node.lon + 180), -1]]) { const h = hF(c, lon); if (h === 1 && signOf(lon) === signOf(c.cusps[1])) s += w; if (h === 7 && signOf(lon) === signOf(c.cusps[7])) s -= w; } return s; } },
  { id: 'mars-angle', ru: 'Марс у куспида ASC или MC (4°) — против фаворита; у DSC или IC — против аутсайдера', src: FR_R + ', разбор Ковентри, с. 241', kind: 'side', f: (c) => (near(c.P.Mars.lon, c.cusps[7], 4) || near(c.P.Mars.lon, c.cusps[4], 4) ? 1 : 0) - (near(c.P.Mars.lon, c.cusps[1], 4) || near(c.P.Mars.lon, c.cusps[10], 4) ? 1 : 0) },
  { id: 'sn-angle', ru: 'Южный узел у куспида ASC или MC (4°) — против фаворита; у DSC или IC — против аутсайдера', src: FR_R + ', с. 241, 245; ' + FR_W + ', с. 138', kind: 'side', f: (c) => { const sn = n360(c.P.Node.lon + 180); return (near(sn, c.cusps[7], 4) || near(sn, c.cusps[4], 4) ? 1 : 0) - (near(sn, c.cusps[1], 4) || near(sn, c.cusps[10], 4) ? 1 : 0); } },
  { id: 'anti-exact', ru: 'Антисция управителя команды точно (1°) на куспиде любого угла — за команду', src: FR_H + ', с. 97 (пример выигранного матча)', kind: 'side', f: both((c, id) => ([1, 4, 7, 10].some((h) => near(n360(180 - c.P[id].lon), c.cusps[h], 1)) ? 1 : 0)) },
  { id: 'fortuna-anti-1', ru: 'Антисция Фортуны у ASC — за фаворита, у DSC — за аутсайдера, с орбом 1° вместо 3°', src: FR_R + ', с. 309: антисции — «не больше градуса»', kind: 'side', f: (c) => { const a = n360(180 - c.fortune); return (near(a, c.cusps[1], 1) ? 1 : 0) - (near(a, c.cusps[7], 1) ? 1 : 0); } },
  { id: 'determination', ru: 'Куспид и управитель стороны в неподвижных знаках — решимость (за), в кардинальных — нетвёрдость (против)', src: FR_R + ', с. 303', kind: 'side', f: (c) => { const q = (lon) => signOf(lon) % 3, d = (cusp, id) => (q(cusp) === 1 ? 1 : q(cusp) === 0 ? -1 : 0) + (q(c.P[id].lon) === 1 ? 1 : q(c.P[id].lon) === 0 ? -1 : 0); return sgn(d(c.cusps[1], M1(c)) - d(c.cusps[7], M7(c))); } },
  { id: 'human-asc', ru: 'Человеческий знак на ASC — за фаворита, на DSC — за аутсайдера', src: FR_R + ', с. 304', kind: 'side', f: (c) => { const hum = (lon) => [2, 5, 6, 10].includes(signOf(lon)) || (signOf(lon) === 8 && n360(lon) % 30 < 15); return (hum(c.asc) ? 1 : 0) - (hum(c.asc + 180) ? 1 : 0); } },
  { id: 'moon-next', ru: 'Следующий аспект Луны (до смены знака, любой орб) — к управителю I или VII: за эту команду', src: FR_H + ', с. 185: второстепенное свидетельство', kind: 'side', f: (c) => { const n = c.moonNext(); if (!n) return 0; return (n.id === M1(c) ? 1 : 0) - (n.id === M7(c) ? 1 : 0); } },
  ...partTests('lot-luck', 'Часть Удачи (ASC + Юпитер − Фортуна)', FR_W + ', с. 26: «кто выигрывает битву, футбольный матч»', (c) => n360(c.asc + c.P.Jupiter.lon - c.fortune)),
  ...partTests('lot-victory', 'Жребий Победы (ASC + Юпитер − Дух)', FR_R + ', с. 308', (c) => n360(c.asc + c.P.Jupiter.lon - n360(c.asc + c.P.Sun.lon - c.P.Moon.lon))),
  // Hofman
  { id: 'hof-neg-rec', ru: 'Управитель соперника стоит в знаке, где управитель команды в изгнании или падении, — вредит ей', src: 'Хофман, «Практикум», с. 21, 32, 70', kind: 'side', f: (c) => { const a = M1(c), b = M7(c); if (a === b) return 0; const harms = (x, y) => { const sg = signOf(c.P[x].lon); return DOMICILE[(sg + 6) % 12] === y || (EXALT[y] != null && (EXALT[y] + 6) % 12 === sg); }; return (harms(a, b) ? 1 : 0) - (harms(b, a) ? 1 : 0); } },
  { id: 'hof-station', ru: 'Управитель в ближайшие 3 дня встаёт в станцию директно — за команду; в ретроградную станцию — против', src: 'Хофман, «Практикум», с. 11, 45, 47', kind: 'side', f: both((c, id) => { if (id === 'Sun' || id === 'Moon') return 0; const v1 = H.lonAt(id, c.t0 + 3 * DAY + 0.05 * DAY) - H.lonAt(id, c.t0 + 3 * DAY - 0.05 * DAY); const now = c.P[id].speed, later = n180(v1); return now < 0 && later > 0 ? 1 : now > 0 && later < 0 ? -1 : 0; }) },
  // Merriman: days of clustered signatures — by the hypothesis, surprises are likelier then
  { id: 'mer-cluster', ru: 'Кластер планетарных сигнатур (аспекты, станции, смены знака) в окне ±3 дня — чаще побеждает аутсайдер', src: 'Мерриман, «Основы астрологии для биржевых решений», с. 56, 69 (гипотеза для футбола)', kind: 'upset', f: (c) => c.cal().count >= CAL_Q75 },
  { id: 'mer-level1', ru: 'Станция Венеры или ретроградная станция Сатурна в окне ±3 дня — чаще побеждает аутсайдер', src: 'Мерриман, с. 62, 78 (гипотеза)', kind: 'upset', f: (c) => c.cal().level1 },
  { id: 'mer-uranus', ru: 'Точный аспект Урана с Солнцем, Меркурием, Венерой, Марсом, Юпитером или Сатурном в окне ±2 дня — чаще побеждает аутсайдер', src: 'Мерриман, с. 37–38 (гипотеза)', kind: 'upset', f: (c) => c.cal().uranus },
  { id: 'mer-mercury', ru: 'Станция Меркурия в окне ±3 дня — чаще побеждает аутсайдер (слабый контроль)', src: 'Мерриман, с. 79 (гипотеза)', kind: 'upset', f: (c) => c.cal().mercury },
  // draws
  { id: 'moon-voc', ru: 'Луна без курса — ничья', src: FR_H + ', с. 186: в обычных матчах роли не играет', kind: 'draw', f: (c) => !c.moonNext() },
  { id: 'lights-weak', ru: 'Новолуние или полнолуние (12°): «для события может не хватить энергии» — ничья', src: FR_R + ', с. 199, 299', kind: 'draw', f: (c) => { const e = Math.abs(n180(c.P.Moon.lon - c.P.Sun.lon)); return e <= 12 || e >= 168; } },
];

/* the calendar of Merriman's signatures, day by day (0h UTC): exact aspects between the Sun and the planets
   up to Pluto (the Moon left out), stations and changes of sign */
const SLOW = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
let CAL = null, CAL_Q75 = Infinity;
function buildCalendar(from, to) {
  const d0 = Math.floor(from / DAY) - 5, d1 = Math.ceil(to / DAY) + 5, n = d1 - d0 + 1;
  const lon = {}, spd = {};
  for (const id of SLOW) { lon[id] = new Float64Array(n); spd[id] = new Float64Array(n); }
  for (let i = 0; i < n; i++) for (const id of SLOW) { const t = (d0 + i) * DAY; lon[id][i] = H.lonAt(id, t); if (id !== 'Sun') spd[id][i] = n180(H.lonAt(id, t + 0.05 * DAY) - H.lonAt(id, t - 0.05 * DAY)); }
  const ev = Array.from({ length: n }, () => ({ k: 0, level1: false, uranus: false, mercury: false }));
  for (let i = 0; i < n - 1; i++) {
    for (let a = 0; a < SLOW.length; a++) for (let b = a + 1; b < SLOW.length; b++) {
      const A = SLOW[a], B = SLOW[b];
      for (const asp of [0, 60, 90, 120, 180, 240, 270, 300]) {
        const f0 = n180(lon[B][i] - lon[A][i] - asp), f1 = n180(lon[B][i + 1] - lon[A][i + 1] - asp);
        if (Math.sign(f0) !== Math.sign(f1) && Math.abs(f0) < 20 && Math.abs(f1) < 20) {
          ev[i].k++;
          if (B === 'Uranus' && ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].includes(A)) ev[i].uranus = true;
        }
      }
    }
    for (const id of SLOW) {
      if (signOf(lon[id][i]) !== signOf(lon[id][i + 1])) ev[i].k++;
      if (id !== 'Sun' && Math.sign(spd[id][i]) !== Math.sign(spd[id][i + 1])) {
        ev[i].k++;
        if (id === 'Venus' || (id === 'Saturn' && spd[id][i + 1] < 0)) ev[i].level1 = true;
        if (id === 'Mercury') ev[i].mercury = true;
      }
    }
  }
  CAL = { d0, ev };
  // the "cluster" threshold: the upper quarter of 7-day counts over the whole period
  const counts = [];
  for (let i = 3; i < n - 4; i++) counts.push(windowAt(i).count);
  counts.sort((x, y) => x - y);
  CAL_Q75 = counts[Math.floor(counts.length * 0.75)];
  console.log(`calendar: ${n} days, 7-day signature counts: median ${counts[counts.length >> 1]}, upper quarter from ${CAL_Q75}`);
}
function windowAt(i) {
  let count = 0, level1 = false, uranus = false, mercury = false;
  for (let j = i - 3; j <= i + 3; j++) { const e = CAL.ev[j]; if (!e) continue; count += e.k; level1 = level1 || e.level1; mercury = mercury || e.mercury; if (Math.abs(j - i) <= 2) uranus = uranus || e.uranus; }
  return { count, level1, uranus, mercury };
}

/* ----------------------------------- statistics ----------------------------------- */
function loadRows() {
  const rows = [];
  for (const f of fs.readdirSync(path.join(DB, 'matches')).filter((x) => x.endsWith('.json')).sort()) {
    for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(DB, 'matches', f), 'utf8')))) {
      if (!r.result || !r.result.winner90 || !r.fav || !r.place || r.place.approx) continue;
      const p = r.fav.p, fs_ = r.fav.side, ds = fs_ === 'home' ? 'away' : 'home';
      if (p.draw == null || !(p[fs_] > 0 && p[ds] > 0 && p.draw > 0)) continue;
      const d = new Date(r.kickoff), season = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
      const w = r.result.winner90, y = w === fs_ ? 0 : w === 'draw' ? 1 : 2;
      rows.push({ r, season, y, lp: [Math.log(p[fs_]), Math.log(p.draw), Math.log(p[ds])] });
    }
  }
  return rows;
}
// the odds calibrated on the learning seasons: P(k) ∝ exp(a_k + b·ln p_k), a_dog = 0 (Newton's method)
function calibrate(train) {
  let th = [0, 0, 1];
  const X = (r) => [[1, 0, r.lp[0]], [0, 1, r.lp[1]], [0, 0, r.lp[2]]];
  for (let it = 0; it < 30; it++) {
    const g = [0, 0, 0], Hm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const r of train) {
      const x = X(r), e = x.map((v) => v[0] * th[0] + v[1] * th[1] + v[2] * th[2]), m = Math.max(...e), z = e.map((v) => Math.exp(v - m)), s = z[0] + z[1] + z[2], pi = z.map((v) => v / s);
      const mean = [0, 1, 2].map((j) => pi[0] * x[0][j] + pi[1] * x[1][j] + pi[2] * x[2][j]);
      for (let j = 0; j < 3; j++) g[j] += x[r.y][j] - mean[j];
      for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) Hm[a][b] += pi[k] * (x[k][a] - mean[a]) * (x[k][b] - mean[b]);
    }
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(Hm), step = [0, 1, 2].map((j) => det(Hm.map((row, i) => row.map((v, k) => (k === j ? g[i] : v)))) / D);
    th = th.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return (r) => { const e = [th[0] + th[2] * r.lp[0], th[1] + th[2] * r.lp[1], th[2] * r.lp[2]], m = Math.max(...e), z = e.map((v) => Math.exp(v - m)), s = z[0] + z[1] + z[2]; return z.map((v) => v / s); };
}
// k: 0 favourite, 1 draw, 2 underdog; the share of rows where outcome k came, against the calibrated chance
function versus(set, kOf) {
  let n = 0, hit = 0, exp = 0, v = 0;
  for (const r of set) { const k = kOf(r); if (k == null) continue; const q = r.q[k]; n++; exp += q; v += q * (1 - q); if (r.y === k) hit++; }
  return n ? { n, d: (hit - exp) / n, se2: 2 * Math.sqrt(v) / n } : { n: 0 };
}

/* -------------------------------------- run --------------------------------------- */
const t0 = Date.now();
const rows = loadRows();
const train = rows.filter((r) => r.season >= TRAIN[0] && r.season <= TRAIN[1]), test = rows.filter((r) => r.season >= TEST_FROM);
const cal = calibrate(train);
for (const r of rows) r.q = cal(r);
buildCalendar(Math.min(...rows.map((r) => Date.parse(r.r.kickoff))), Math.max(...rows.map((r) => Date.parse(r.r.kickoff))));
const only = process.env.IDEAS ? process.env.IDEAS.split(',') : null;
const ideas = IDEAS.filter((i) => !only || only.includes(i.id));
for (const r of rows) {
  const c = context(r.r);
  r.v = {};
  for (const i of ideas) { try { r.v[i.id] = i.f(c); } catch (e) { r.v[i.id] = 0; if (!i.err) { i.err = e.message; console.warn(i.id, e.message); } } }
}
const pp = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}`;
const eff = (e) => (e.n ? `${pp(e.d)} ± ${(Math.round(e.se2 * 1000) / 10).toFixed(1).replace('.', ',')}` : '—');
const sig = (e) => e.n && Math.abs(e.d) > e.se2;
const verdict = (a, b) => (!a.n || !b.n ? '' : sig(a) && sig(b) && Math.sign(a.d) === Math.sign(b.d) ? (a.d > 0 ? 'да, работает' : 'да, но наоборот') : sig(a) ? 'нет' : '');
const kOf = (i) => (i.kind === 'side' ? (r) => (r.v[i.id] > 0 ? 0 : r.v[i.id] < 0 ? 2 : null) : i.kind === 'upset' ? (r) => (r.v[i.id] ? 2 : null) : (r) => (r.v[i.id] ? 1 : null));
const L = ['# Новые идеи из книг', '', `Обновлено ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Проверка та же, что в RULES.md: обучение — сезоны 2015/16–2022/23 (${train.length} матчей), проверка — с 2023/24 (${test.length}). ` +
  'Эффект — насколько чаще (+) или реже (−) случалось то, что обещает идея (победа поддержанной команды; для «неожиданностей» — победа аутсайдера; для ничьих — ничья), чем по выправленным коэффициентам, в процентных пунктах; «±» — две стандартные ошибки.', '',
  '| Идея | Откуда | Случаев (обуч.) | Эффект, обучение | Случаев (пров.) | Эффект, проверка | Подтвердилась |', '|---|---|---|---|---|---|---|'];
const KIND_HEAD = { side: 'За одну из команд: эффект — победы поддержанной команды', upset: 'Дни неожиданностей: эффект — победы аутсайдера', draw: 'Ничьи: эффект — ничьи' };
const out = {};
let lastKind = null;
for (const i of ideas) {
  if (i.kind !== lastKind) { L.push(`| **${KIND_HEAD[i.kind]}** | | | | | | |`); lastKind = i.kind; }
  const a = versus(train, kOf(i)), b = versus(test, kOf(i));
  out[i.id] = { train: a, test: b, verdict: verdict(a, b) };
  L.push(`| ${i.ru} | ${i.src} | ${a.n} | ${eff(a)} | ${b.n} | ${eff(b)} | ${verdict(a, b)} |`);
}
const ok = ideas.filter((i) => out[i.id].verdict.startsWith('да'));
L.push('', ok.length ? `Подтвердились: ${ok.map((i) => i.ru).join('; ')}.` : 'Ни одна идея не подтвердилась на сезонах проверки.', '');
fs.writeFileSync(path.join(DB, 'IDEAS.md'), L.join('\n'));
fs.writeFileSync(path.join(DB, 'ideas.json'), JSON.stringify({ updated: Date.now(), ideas: out }, null, 1));
console.log(`rows ${rows.length} (train ${train.length}, test ${test.length}), ideas ${ideas.length}, confirmed ${ok.map((i) => i.id).join(',') || 'none'}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
