// Compares the natal chart 11.04.1996 05:54, Voronezh with Sotis. npm install astronomy-engine@2.1.19, then: node tools/sotis-check.js
globalThis.Astronomy = require('astronomy-engine');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.window = globalThis;
require('../js/chiron-data.js');
require('../js/acg-core.js');
require('../js/natal.js');
const ACG = globalThis.ACG, N = globalThis.NATAL;
const S = (sign, d, m, s) => sign * 30 + d + m / 60 + s / 3600;
const SOTIS = { Sun: S(0,21,27,50), Moon: S(9,22,44,8), Mercury: S(1,5,39,59), Venus: S(2,6,54,37), Mars: S(0,13,30,18), Jupiter: S(9,16,47,55), Saturn: S(0,0,26,37), Uranus: S(10,4,15,58), Neptune: S(9,27,39,36), Pluto: S(8,2,45,32), Node: S(6,17,7,22), SNode: S(0,17,7,22), Lilith: S(3,21,49,4), Chiron: S(6,10,21,30) };
const RETRO = { Pluto: 1, Node: 1, SNode: 1, Chiron: 1 };
const dms = (x) => { x = ((x % 30) + 30) % 30; let d = Math.floor(x), m = Math.floor((x - d) * 60), s = Math.round(((x - d) * 60 - m) * 60); if (s === 60) { s = 0; m++; } return `${d}°${String(m).padStart(2,'0')}′${String(s).padStart(2,'0')}″`; };
const chart = ACG.computeChart(ACG.localToUtc(1996, 4, 11, 5, 54, 'Europe/Moscow').utc, { node: 'true' });
const nat = N.computeNatal(chart, 51.6725, 39.185, {});
let worst = 0;
for (const p of nat.points) {
  if (SOTIS[p.id] == null) continue;
  const d = ACG.norm180(p.lon - SOTIS[p.id]) * 3600; worst = Math.max(worst, Math.abs(d));
  console.log(p.ru.padEnd(10), dms(SOTIS[p.id]).padEnd(12), dms(p.lon).padEnd(12), (d.toFixed(0) + '″').padStart(6), (!!p.retro === !!RETRO[p.id]) ? 'R совпадает' : 'R РАЗНОЕ');
}
console.log('max |Δ| =', worst.toFixed(0) + '″');
const t = Date.now(); for (let i = 0; i < 20; i++) ACG.computeChart(Date.UTC(1900 + i * 10, 0, 1)); console.log('20 карт за', Date.now() - t, 'мс;', 'Хирон в 1790:', ACG.computeChart(Date.UTC(1790, 0, 1)).bodies.some((b) => b.id === 'Chiron'));
{
  const A = Astronomy, t = A.MakeTime(new Date(ACG.localToUtc(1996, 4, 11, 5, 54, 'Europe/Moscow').utc));
  for (const h of [0.5, 0.1, 0.02]) console.log('true node speed ±' + h + ' d:', ((ACG.norm180(ACG.trueNodeLon(t.AddDays(h)) - ACG.trueNodeLon(t.AddDays(-h)))) / (2 * h)).toFixed(4), '°/сут');
  const s = []; for (let d = -10; d <= 10; d += 2) s.push(ACG.trueNodeLon(t.AddDays(d)).toFixed(3)); console.log('узел по дням -10…+10:', s.join(' '));
}
