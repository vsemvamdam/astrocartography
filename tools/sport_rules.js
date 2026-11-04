/* Checks every rule of the "Спорт" judgement (Frawley, "Sports Astrology") on the football base and fits
   their weights: on seasons 2015/16–2022/23 (learning) and checks the result on 2023/24 onwards (test).

   The question each time is not "does the team the rule favours win often" (favourites win often anyway)
   but "does it win more often than the bookmakers expected". So the odds come first:
   1. the bookmakers' probabilities are calibrated on the learning seasons (favourites win a little more
      often than the odds say: a multinomial logit a_k + b·ln p_k);
   2. a rule's effect = how often the team it supports won − how often the calibrated odds expected it;
   3. the weights: a multinomial logit over the calibrated odds, where the "astrological advantage"
      A = Σ w_r·x_r (x_r = testimonies of rule r for the favourite − for the underdog) moves the chances
      of the favourite by +A/2 and of the underdog by −A/2; empty and balanced charts move the draw.
      Ridge penalty, its strength chosen by leaving one learning season out at a time.
   Writes RULES.md and rules.json to the base. Usage: node tools/sport_rules.js <db-dir> */
'use strict';
const fs = require('fs');
const path = require('path');

const DB = process.argv[2];
if (!DB) { console.error('usage: node tools/sport_rules.js <db-dir>'); process.exit(2); }
const TRAIN = [2015, 2022], TEST_FROM = 2023;

const RULE_RU = {
  'lord-own-angle': 'Управитель команды на куспиде своего угла или сразу за ним',
  'lord-on-opp-cusp': 'Управитель команды на куспиде угла соперника',
  'lord-in-opp-house': 'Управитель сразу за куспидом угла соперника — за соперника',
  'moon-angle': 'Луна или её антисция у куспида угла команды',
  'fortuna-anti-angle': 'Антисция Фортуны у Асцендента или Десцендента',
  'last-lord': 'Заключительный аспект Луны — к управителю команды',
  'last-fortuna-good': 'Заключительный аспект Луны — гармоничный к Фортуне (за фаворита)',
  'last-fortuna-hard': 'Заключительный аспект Луны — напряжённый к Фортуне (за аутсайдера)',
  'moon-way': 'Луна по пути аспектирует управителя команды',
  'lord-fortuna-conj': 'Управитель идёт к соединению с Фортуной',
  'lord-fortuna-opp': 'Управитель идёт к оппозиции с Фортуной',
  'disp-fortuna-conj': 'Диспозитор Фортуны идёт к соединению с ней (за фаворита)',
  'disp-fortuna-opp': 'Диспозитор Фортуны идёт к оппозиции с ней (за аутсайдера)',
  'lord-north-node': 'Управитель на северном узле',
  'lord-south-node': 'Управитель на южном узле — за соперника',
  'lord-combust': 'Управитель сожжён Солнцем — за соперника',
  'fortuna-north-node': 'Фортуна на северном узле (за фаворита)',
  'fortuna-south-node': 'Фортуна на южном узле (за аутсайдера)',
  'fortuna-combust': 'Фортуна сожжена Солнцем (за аутсайдера)',
  'pluto-cusp': 'Плутон на куспиде I, X, II, VII или IV',
  'pluto-fortuna-conj': 'Плутон в соединении с Фортуной (за аутсайдера)',
  'pluto-fortuna-opp': 'Плутон в оппозиции с Фортуной (за аутсайдера)',
  'pluto-disp-conj': 'Плутон в соединении с диспозитором Фортуны (за аутсайдера)',
  'pluto-disp-opp': 'Плутон в оппозиции с диспозитором Фортуны (за аутсайдера)',
  'uranus-mc': 'Уран на MC (за фаворита)',
  'uranus-fortuna-conj': 'Уран в соединении с Фортуной (за фаворита)',
  'uranus-fortuna-opp': 'Уран в оппозиции с Фортуной (за аутсайдера)',
  'saturn-lord': 'Сатурн в соединении с управителем — за соперника',
  'saturn-cusp': 'Сатурн на куспиде угла — за соперника',
  'saturn-fortuna': 'Сатурн на Фортуне (за аутсайдера)',
};
const PART_RU = { anti: 'антисция', sec: 'второй управитель (X или IV)', h1: 'I', h10: 'X', h7: 'VII', h4: 'IV', h2: 'II', a0: 'соединение', a60: 'секстиль', a90: 'квадрат', a120: 'трин', a180: 'оппозиция', fav: 'управитель фаворита', dog: 'управитель аутсайдера' };
const base = (code) => code.split('.')[0];
const detailRu = (code) => code.split('.').slice(1).map((p) => PART_RU[p] || p).join(', ');

/* ------------------------------------- data -------------------------------------- */
const rows = [];
for (const f of fs.readdirSync(path.join(DB, 'matches')).filter((x) => x.endsWith('.json')).sort()) {
  for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(DB, 'matches', f), 'utf8')))) {
    if (!r.result || !r.result.winner90 || !r.fav || !r.judge || !r.judge.t || (r.place && r.place.approx)) continue;
    const p = r.fav.p, fs_ = r.fav.side, ds = fs_ === 'home' ? 'away' : 'home';
    if (p.draw == null || !(p[fs_] > 0 && p[ds] > 0 && p.draw > 0)) continue;
    const d = new Date(r.kickoff), season = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    const w = r.result.winner90, y = w === fs_ ? 0 : w === 'draw' ? 1 : 2;     // 0 favourite, 1 draw, 2 underdog
    const t = r.judge.t.filter((x) => x[4]);
    const f90 = r.result.ft90;
    rows.push({ id: r.id, nil: !!(f90 && f90.home === 0 && f90.away === 0), season, y, lp: [Math.log(p[fs_]), Math.log(p.draw), Math.log(p[ds])], t, diff: r.judge.diff, n: t.length, judged: r.judge.winner });
  }
}
const train = rows.filter((r) => r.season >= TRAIN[0] && r.season <= TRAIN[1]);
const test = rows.filter((r) => r.season >= TEST_FROM);
if (!train.length || !test.length) { console.error('not enough matches', train.length, test.length); process.exit(1); }

/* ------------------------------ multinomial logit --------------------------------- */
// design: X[k] — feature vector for outcome k (0 fav, 1 draw, 2 dog); o[k] — offset; y — outcome
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function inverse(A) { const n = A.length; return A.map((_, j) => solve(A, A.map((__, i) => (i === j ? 1 : 0)))).map((col, j, all) => all.map((c) => c[j])); }
function probs(d, th) {
  const e = [0, 1, 2].map((k) => d.o[k] + d.X[k].reduce((s, x, j) => s + x * th[j], 0));
  const m = Math.max(...e), z = e.map((v) => Math.exp(v - m)), s = z[0] + z[1] + z[2];
  return z.map((v) => v / s);
}
function fit(data, P, lambda) {
  let th = new Array(P).fill(0);
  for (let it = 0; it < 50; it++) {
    const g = new Array(P).fill(0), H = Array.from({ length: P }, () => new Array(P).fill(0));
    for (const d of data) {
      const pi = probs(d, th), mean = new Array(P).fill(0);
      for (let k = 0; k < 3; k++) for (let j = 0; j < P; j++) mean[j] += pi[k] * d.X[k][j];
      for (let j = 0; j < P; j++) g[j] += d.X[d.y][j] - mean[j];
      for (let k = 0; k < 3; k++) for (let a = 0; a < P; a++) { const xa = d.X[k][a] - mean[a]; if (!xa) continue; for (let b = 0; b < P; b++) H[a][b] += pi[k] * xa * (d.X[k][b] - mean[b]); }
    }
    for (let j = 0; j < P; j++) { g[j] -= lambda * th[j]; H[j][j] += lambda; }
    const step = solve(H, g);
    th = th.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) {
      const cov = inverse(H);
      return { th, se: cov.map((row, j) => Math.sqrt(Math.max(0, row[j]))) };
    }
  }
  return { th, se: th.map(() => NaN) };
}
const logloss = (data, th) => data.map((d) => -Math.log(probs(d, th)[d.y]));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function meanSe(a) { const m = mean(a), v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); return { m, se: Math.sqrt(v / a.length) }; }

/* 1. calibration of the odds on the learning seasons: a_fav, a_draw, b (a_dog = 0) */
const calX = (r) => [[1, 0, r.lp[0]], [0, 1, r.lp[1]], [0, 0, r.lp[2]]];
const cal = fit(train.map((r) => ({ X: calX(r), o: [0, 0, 0], y: r.y })), 3, 0).th;
for (const r of rows) {
  r.o = [0, 1, 2].map((k) => calX(r)[k].reduce((s, x, j) => s + x * cal[j], 0));
  const m = Math.max(...r.o), z = r.o.map((v) => Math.exp(v - m)), s = z[0] + z[1] + z[2];
  r.q = z.map((v) => v / s);                 // calibrated probabilities: favourite, draw, underdog
}

/* 2. each rule on its own: the supported team's wins against the calibrated expectation */
function effect(set, code, full) {
  let n = 0, hit = 0, exp = 0, v = 0;
  for (const r of set) {
    let x = 0;
    for (const t of r.t) if ((full ? t[4] : base(t[4])) === code) x += t[0] === 'fav' ? 1 : -1;
    if (!x) continue;
    const k = x > 0 ? 0 : 2, q = r.q[k];
    n++; exp += q; v += q * (1 - q); if (r.y === k) hit++;
  }
  return n ? { n, d: (hit - exp) / n, se2: 2 * Math.sqrt(v) / n, act: hit / n, exp: exp / n } : { n: 0 };
}
const codes = new Map();                      // base code → Frawley's usual weight
const fullCodes = new Map();
for (const r of rows) for (const t of r.t) {
  const b = base(t[4]);
  if (!codes.has(b)) codes.set(b, []);
  codes.get(b).push(t[1]);
  if (r.season <= TRAIN[1]) fullCodes.set(t[4], (fullCodes.get(t[4]) || 0) + 1);
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const RULES = [...codes.keys()].sort((a, b) => Object.keys(RULE_RU).indexOf(a) - Object.keys(RULE_RU).indexOf(b));

/* 3. weights over the calibrated odds; features: the rules, then "empty chart" and "balanced chart" for the draw */
const P = RULES.length + 2;
function design(r) {
  const x = new Array(RULES.length).fill(0);
  for (const t of r.t) { const j = RULES.indexOf(base(t[4])); if (j >= 0) x[j] += t[0] === 'fav' ? 1 : -1; }
  const empty = r.n === 0 ? 1 : 0, balanced = r.n > 0 && r.judged === 'draw' ? 1 : 0;
  return { X: [x.map((v) => v / 2).concat([0, 0]), new Array(RULES.length).fill(0).concat([empty, balanced]), x.map((v) => -v / 2).concat([0, 0])], o: r.o, y: r.y, season: r.season };
}
const Dtrain = train.map(design), Dtest = test.map(design);
const LAMBDAS = [1, 10, 100, 1000, 10000];
let best = null;
for (const lam of LAMBDAS) {
  let ll = 0;
  for (let s = TRAIN[0]; s <= TRAIN[1]; s++) {
    const tr = Dtrain.filter((d) => d.season !== s), va = Dtrain.filter((d) => d.season === s);
    if (!va.length) continue;
    ll += logloss(va, fit(tr, P, lam).th).reduce((a, b) => a + b, 0);
  }
  if (!best || ll < best.ll) best = { lam, ll };
}
const model = fit(Dtrain, P, best.lam);
const loose = fit(Dtrain, P, 1);              // the same without the penalty: what plain fitting would give
const zero = new Array(P).fill(0);
const gain = (data, th) => meanSe(logloss(data, zero).map((v, i) => v - logloss(data, th)[i]));
const gTrain = gain(Dtrain, model.th), gTest = gain(Dtest, model.th);
const lTrain = gain(Dtrain, loose.th), lTest = gain(Dtest, loose.th);

/* Frawley's own sum of points as one feature */
const fr = (r) => ({ X: [[r.diff / 2], [0], [-r.diff / 2]], o: r.o, y: r.y });
const frModel = fit(train.map(fr), 1, 0), frTest = meanSe(logloss(test.map(fr), [0]).map((v, i, a) => v - logloss(test.map(fr), frModel.th)[i]));
const frTestOnly = fit(test.map(fr), 1, 0);

/* the chart's pick with the fitted weights, on the test seasons: the team with A > 0 against the calibrated odds */
function picks(set, th) {
  let n = 0, hit = 0, exp = 0, v = 0;
  for (const r of set) {
    const d = design(r), A = d.X[0].slice(0, RULES.length).reduce((s, x, j) => s + 2 * x * th[j], 0);
    if (Math.abs(A) < 0.05) continue;
    const k = A > 0 ? 0 : 2, q = r.q[k];
    n++; exp += q; v += q * (1 - q); if (r.y === k) hit++;
  }
  return n ? { n, d: (hit - exp) / n, se2: 2 * Math.sqrt(v) / n, act: hit / n, exp: exp / n } : { n: 0 };
}
// how a weight moves the favourite's chance in an ordinary match (50% / 25% / 25%)
const shift = (w) => { const a = 0.5 * Math.exp(w / 2), b = 0.25 * Math.exp(-w / 2); return a / (a + 0.25 + b) - 0.5; };

/* ------------------------------------- report ------------------------------------- */
const pp = (x) => (x == null || isNaN(x) ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}`);
const eff = (e) => (e.n ? `${pp(e.d)} ± ${(Math.round(e.se2 * 1000) / 10).toFixed(1).replace('.', ',')}` : '—');
const sig = (e) => e.n && Math.abs(e.d) > e.se2;
const verdict = (a, b) => (!a.n || !b.n ? '' : sig(a) && sig(b) && Math.sign(a.d) === Math.sign(b.d) ? (a.d > 0 ? 'да, работает' : 'да, но наоборот') : sig(a) ? 'нет' : '');
const seasons = (a) => `${a[0]}/${String(a[0] + 1).slice(2)}–${a[1]}/${String(a[1] + 1).slice(2)}`;
const lastSeason = Math.max(...test.map((r) => r.season));
const L = [];
L.push('# Правила Фроули по отдельности', '');
L.push(`Обновлено ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Обучение — сезоны ${seasons(TRAIN)} (${train.length} матчей), проверка — ${seasons([TEST_FROM, lastSeason])} (${test.length} матчей). Учтены матчи с коэффициентами и точным местом стадиона; исход — за 90 минут.`, '');
L.push('Эффект правила — насколько чаще (+) или реже (−) команда, за которую говорит правило, выигрывала, чем обещали коэффициенты, в процентных пунктах. ' +
  `Коэффициенты предварительно выправлены на сезонах обучения: фаворит выигрывает чуть чаще, чем закладывают букмекеры (ln-калибровка, b = ${cal[2].toFixed(2).replace('.', ',')}), иначе любое правило «за фаворита» выглядело бы рабочим. ` +
  '«±» — две стандартные ошибки. Правило считается подтверждённым, если эффект больше «±» и на обучении, и на проверке, с одним знаком. Среди 30 правил одно-два «значимых» на обучении появятся случайно — поэтому и нужна проверка.', '');

L.push('## Сумма баллов Фроули целиком', '');
L.push(`Разница баллов фаворита и аутсайдера как один признак поверх коэффициентов: коэффициент ${frModel.th[0].toFixed(3).replace('.', ',')} ± ${(2 * frModel.se[0]).toFixed(3).replace('.', ',')} на обучении, ${frTestOnly.th[0].toFixed(3).replace('.', ',')} ± ${(2 * frTestOnly.se[0]).toFixed(3).replace('.', ',')} на проверке ` +
  `(1 балл сдвигает шанс фаворита в обычном матче на ${pp(shift(frModel.th[0]))} п. п.). Выигрыш в точности на проверке: ${(frTest.m * 1000).toFixed(2).replace('.', ',')} ± ${(2 * frTest.se * 1000).toFixed(2).replace('.', ',')} тысячных натуральной единицы на матч (больше нуля — карта добавляет к коэффициентам).`, '');

L.push('## Каждое правило', '');
L.push('| Правило | Баллы у Фроули | Случаев (обуч.) | Эффект, обучение | Случаев (пров.) | Эффект, проверка | Подобранный вес, п. п. | Подтвердилось |', '|---|---|---|---|---|---|---|---|');
const out = { updated: Date.now(), train: TRAIN, testFrom: TEST_FROM, calibration: cal, lambda: best.lam, rules: {} };
RULES.forEach((code, j) => {
  const a = effect(train, code, false), b = effect(test, code, false);
  out.rules[code] = { frawley: median(codes.get(code)), train: a, test: b, weight: model.th[j], se: model.se[j], shift: shift(model.th[j]) };
  L.push(`| ${RULE_RU[code] || code} | ${String(median(codes.get(code))).replace('.', ',')} | ${a.n} | ${eff(a)} | ${b.n} | ${eff(b)} | ${pp(shift(model.th[j]))} ± ${(Math.abs(shift(2 * model.se[j])) * 100).toFixed(1).replace('.', ',')} | ${verdict(a, b)} |`);
});
L.push('', `Подобранный вес — сдвиг шанса команды в обычном матче (фаворит 50%, ничья 25%, аутсайдер 25%) от одного такого свидетельства, когда все правила учтены вместе; штраф за сложность λ = ${best.lam} выбран по сезонам обучения.`, '');

L.push('## Подробнее: варианты правил', '', 'Только варианты, которые встречались на обучении не меньше 150 раз.', '');
L.push('| Правило | Вариант | Случаев (обуч.) | Эффект, обучение | Случаев (пров.) | Эффект, проверка | Подтвердилось |', '|---|---|---|---|---|---|---|');
for (const [code, n] of [...fullCodes].sort((x, y) => x[0].localeCompare(y[0]))) {
  if (n < 150 || !code.includes('.')) continue;
  const a = effect(train, code, true), b = effect(test, code, true);
  L.push(`| ${RULE_RU[base(code)] || base(code)} | ${detailRu(code)} | ${a.n} | ${eff(a)} | ${b.n} | ${eff(b)} | ${verdict(a, b)} |`);
}

L.push('', '## Ничьи', '');
const drawRow = (label, set, f) => {
  const s = set.filter(f); let hit = 0, exp = 0, v = 0;
  for (const r of s) { exp += r.q[1]; v += r.q[1] * (1 - r.q[1]); if (r.y === 1) hit++; }
  return `| ${label} | ${s.length} | ${s.length ? pp((hit - exp) / s.length) + ' ± ' + (Math.round(2 * Math.sqrt(v) / s.length * 1000) / 10).toFixed(1).replace('.', ',') : '—'} |`;
};
L.push('| Карта | Матчей, обучение | Ничьих сверх ожидания, обучение | Матчей, проверка | Ничьих сверх ожидания, проверка |', '|---|---|---|---|---|');
for (const [label, f] of [['Пустая (нет свидетельств) — по Фроули 0:0', (r) => r.n === 0], ['Свидетельства уравновешены', (r) => r.n > 0 && r.judged === 'draw']]) {
  const a = drawRow(label, train, f).split(' | '), b = drawRow(label, test, f).split(' | ');
  L.push(`${a[0]} | ${a[1]} | ${a[2].replace(' |', '')} | ${b[1]} | ${b[2]}`);
}

{
  const nil = (set, f) => { const s = set.filter(f), k = s.filter((r) => r.nil).length; return { n: s.length, p: s.length ? k / s.length : 0 }; };
  const all = train.concat(test), e = nil(all, (r) => r.n === 0), o = nil(all, (r) => r.n > 0);
  const se2 = 2 * Math.sqrt(e.p * (1 - e.p) / e.n + o.p * (1 - o.p) / o.n);
  L.push('', `Счёт 0:0 за 90 минут при пустой карте — ${Math.round(e.p * 1000) / 10}% (${e.n} матчей), в остальных матчах — ${Math.round(o.p * 1000) / 10}% (${o.n}); разница ${pp(e.p - o.p)} ± ${(Math.round(se2 * 1000) / 10).toFixed(1).replace('.', ',')} п. п.`.replace(/(\d)\.(\d)/g, '$1,$2'));
}
L.push('', '## Все правила вместе, с подобранными весами', '');
const pk = picks(test, model.th), pkt = picks(train, model.th);
L.push(`- Выигрыш в точности поверх коэффициентов: на обучении ${(gTrain.m * 1000).toFixed(2).replace('.', ',')} ± ${(2 * gTrain.se * 1000).toFixed(2).replace('.', ',')}, на проверке ${(gTest.m * 1000).toFixed(2).replace('.', ',')} ± ${(2 * gTest.se * 1000).toFixed(2).replace('.', ',')} тысячных на матч. На обучении он почти всегда больше нуля: веса подогнаны под эти матчи. Важна проверка.`);
L.push(`- Те же веса без штрафа за сложность (так подбирают «на глаз»): на обучении ${(lTrain.m * 1000).toFixed(2).replace('.', ',')} ± ${(2 * lTrain.se * 1000).toFixed(2).replace('.', ',')}, на проверке ${(lTest.m * 1000).toFixed(2).replace('.', ',')} ± ${(2 * lTest.se * 1000).toFixed(2).replace('.', ',')} тысячных на матч.`);
L.push(`- Штраф за сложность, лучший по сезонам обучения: λ = ${best.lam}${best.lam === LAMBDAS[LAMBDAS.length - 1] ? ' — самый большой из проверенных, то есть лучше всего, когда все веса почти ноль' : ''}.`);
L.push(`- Команда, за которую карта с новыми весами, выигрывала: на обучении ${pkt.n ? `${Math.round(pkt.act * 100)}% при ожидании ${Math.round(pkt.exp * 100)}% (${eff(pkt)})` : '—'}, на проверке ${pk.n ? `${Math.round(pk.act * 100)}% при ожидании ${Math.round(pk.exp * 100)}% (${eff(pk)})` : '—'}.`, '');

// a rule's name inside a sentence: lower case, except planets and points
const lc = (x) => (/^(Плутон|Сатурн|Уран|Луна|Фортуна|Солнце|Марс|Венера|Юпитер|Меркурий)/.test(x) ? x : x[0].toLowerCase() + x.slice(1));
const confirmed = RULES.filter((c) => verdict(out.rules[c].train, out.rules[c].test).startsWith('да'));
const faded = RULES.filter((c) => verdict(out.rules[c].train, out.rules[c].test) === 'нет');
L.push('## Итог', '');
if (!confirmed.length) L.push('Ни одно правило не подтвердилось.' + (faded.length ? ` Выглядели рабочими на обучении, но не повторились на проверке: ${faded.map((c) => lc(RULE_RU[c] || c)).join('; ')}.` : ''));
else L.push('Подтвердились: ' + confirmed.map((c) => `${RULE_RU[c] || c} (${verdict(out.rules[c].train, out.rules[c].test)})`).join('; ') + '.' + (faded.length ? ` Не повторились на проверке: ${faded.map((c) => lc(RULE_RU[c] || c)).join('; ')}.` : ''));
L.push(gTest.m - 2 * gTest.se > 0 ? 'Карта с подобранными весами на проверке добавляет к коэффициентам больше, чем случайный разброс.' : 'Карта с подобранными весами на проверке не добавляет к коэффициентам ничего сверх случайного разброса.', '');
L.push('Отчёт пересчитывает `tools/sport_rules.js` после каждого обновления базы.', '');

fs.writeFileSync(path.join(DB, 'RULES.md'), L.join('\n'));
fs.writeFileSync(path.join(DB, 'rules.json'), JSON.stringify(out, null, 1));
console.log(`train ${train.length}, test ${test.length}, lambda ${best.lam}, gain test ${(gTest.m * 1000).toFixed(2)}±${(2 * gTest.se * 1000).toFixed(2)}, confirmed ${confirmed.join(',') || 'none'}`);
