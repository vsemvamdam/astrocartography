/* One table over all sports: how often the winner named by Frawley's event chart wins, against the favourite
   and against what the odds promised.  node research/compare.js <results-dir> <football-db-dir> */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const [RES, DB] = process.argv.slice(2);

const pc = (x) => (x == null ? '—' : `${(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}%`);
const pp = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}`);
const se = (x) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',');
// side → won?, p of that side by the odds
function stat(rows) {
  let n = 0, hit = 0, exp = 0, v = 0;
  for (const [won, p] of rows) { n++; if (won) hit++; exp += p; v += p * (1 - p); }
  return n ? { n, act: hit / n, exp: exp / n, diff: (hit - exp) / n, se2: 2 * Math.sqrt(v) / n } : null;
}
const rowsOut = [];
function add(label, games, picks, chart, favSame, clear, clearFav, early, late) {
  rowsOut.push({ label, games, picks, chart, favSame, clear, clearFav, early, late });
}

/* ------------------------------- other sports ------------------------------- */
for (const sp of ['nhl', 'nba', 'mlb', 'nfl', 'tennis']) {
  let list;
  try { list = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RES, sp, 'games.json.gz'))).toString()); } catch (e) { continue; }
  const sum = JSON.parse(fs.readFileSync(path.join(RES, sp, 'summary.json'), 'utf8'));
  const ok = list.filter((g) => g.j && g.fav && g.fav.p != null);
  const pickRows = ok.filter((g) => g.j.w !== 'draw');
  const pOf = (g, side) => (side === g.fav.side ? g.fav.p : 1 - g.fav.p);
  const chart = (rs) => stat(rs.map((g) => [g.winner === g.j.side, pOf(g, g.j.side)]));
  const fav = (rs) => stat(rs.map((g) => [g.winner === g.fav.side, g.fav.p]));
  add(sum.ru, ok.length, pickRows.length, chart(pickRows), fav(pickRows),
    chart(pickRows.filter((g) => g.j.str === 'явный')), fav(pickRows.filter((g) => g.j.str === 'явный')),
    chart(pickRows.filter((g) => g.season < 2023)), chart(pickRows.filter((g) => g.season >= 2023)));
}

/* --------------------------------- football --------------------------------- */
const LG = { 'eng.1': 'Футбол: АПЛ', 'esp.1': 'Футбол: Ла Лига', 'fra.1': 'Футбол: Лига 1', 'uefa.champions': 'Футбол: Лига чемпионов', 'uefa.europa': 'Футбол: Лига Европы', 'uefa.europa.conf': 'Футбол: Лига конференций' };
const all = [];
for (const f of fs.readdirSync(path.join(DB, 'matches'))) for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(DB, 'matches', f), 'utf8')))) all.push(r);
const done = all.filter((r) => r.result && r.result.winner90 && r.judge && r.fav && r.fav.p && !(r.place && r.place.approx));
const season = (r) => { const d = new Date(r.kickoff); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
for (const lg of Object.keys(LG)) {
  const ok = done.filter((r) => r.league === lg);
  if (!ok.length) continue;
  const picks = ok.filter((r) => r.judge.winner !== 'draw');
  const chart = (rs) => stat(rs.map((r) => [r.result.winner90 === r.judge.winner, r.fav.p[r.judge.winner]]));
  const fav = (rs) => stat(rs.map((r) => [r.result.winner90 === r.fav.side, r.fav.p[r.fav.side]]));
  add(LG[lg], ok.length, picks.length, chart(picks), fav(picks),
    chart(picks.filter((r) => r.judge.strength === 'явный')), fav(picks.filter((r) => r.judge.strength === 'явный')),
    chart(picks.filter((r) => season(r) < 2023)), chart(picks.filter((r) => season(r) >= 2023)));
}

/* ---------------------------------- output ---------------------------------- */
const diffCell = (s) => (s ? `${pp(s.diff)} ± ${se(s.se2)}${Math.abs(s.diff) > s.se2 ? ' **' : ''}` : '—');
const L = ['# Карта Фроули по видам спорта', '',
  `Обновлено ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '',
  'Одна и та же карта по «Спортивной астрологии» Фроули (js/sport.js): фаворит по ставкам — I и X дома, аутсайдер — VII и IV; карта на назначенное начало в городе арены. ' +
  'В теннисе ESPN хранит фактическое начало матча, назначенного времени у большинства матчей нет.', '',
  '«Угадано» — как часто побеждал тот, кого назвала карта (в футболе — за 90 минут). «Фаворит» — как часто в тех же играх побеждал фаворит по ставкам. «По ставкам» — сколько обещали коэффициенты для стороны карты. ' +
  'Разница «Угадано» − «По ставкам» и есть то, что карта добавляет к ставкам; «±» — две стандартные ошибки, ** — разница больше неё.', '',
  '| Вид спорта | Игр | Карта назвала победителя | Угадано | Фаворит | По ставкам | Разница, п. п. | Явный перевес: угадано / фаворит | До 2023 | С 2023 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rowsOut.map((r) => `| ${r.label} | ${r.games} | ${r.picks} (${pc(r.picks / r.games)}) | ${pc(r.chart && r.chart.act)} | ${pc(r.favSame && r.favSame.act)} | ${pc(r.chart && r.chart.exp)} | ${diffCell(r.chart)} | ${pc(r.clear && r.clear.act)} / ${pc(r.clearFav && r.clearFav.act)} (${r.clear ? r.clear.n : 0}) | ${diffCell(r.early)} | ${diffCell(r.late)} |`),
  '', 'Подробно по каждому виду, по сезонам и по правилам — `results/<вид>/SUMMARY.md`.', ''];
fs.writeFileSync(path.join(RES, 'README.md'), L.join('\n'));
fs.writeFileSync(path.join(RES, 'compare.json'), JSON.stringify(rowsOut, null, 1));
console.log(L.join('\n'));
