// npm install astronomy-engine@2.1.19, then: node tools/natal-check.js
globalThis.Astronomy = require('astronomy-engine');
require('../js/acg-core.js');
require('../js/natal.js');
const ACG = globalThis.ACG, N = globalThis.NATAL, A = Astronomy;
const RN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const fz = (l) => { const z = ACG.formatZodiac(l); return `${z.deg}°${String(z.min).padStart(2, '0')}' ${z.name}`; };
// ZEUS screenshots, Placidus, Voronezh 51.67 / 39.19
const ZEUS = {
  240: { Sun: 'I', Moon: 'XI', Mercury: 'I', Venus: 'II', Mars: 'I', Jupiter: 'XI', Saturn: 'I', Uranus: 'XI', Neptune: 'XI', Pluto: 'VIII', Node: 'VII', SNode: 'I', Fortune: ['III', "22°07' Близнецы"] },
  180: { Sun: 'XII', Moon: 'X', Mercury: 'I', Venus: 'II', Mars: 'XII', Jupiter: 'X', Saturn: 'XII', Uranus: 'XI', Neptune: 'X', Pluto: 'VII', Node: 'VI', SNode: 'XII', Fortune: ['X', "0°15' Водолей"] },
};
for (const off of [240, 180]) {
  const chart = ACG.computeChart(ACG.localToUtc(1996, 4, 11, 5, 54, 'Europe/Moscow', off).utc);
  const nat = N.computeNatal(chart, 51.67, 39.19, { house: 'P' });
  console.log(`\n=== UTC+${off / 60}: ASC ${fz(nat.asc)}, MC ${fz(nat.mc)}, ${nat.isDay ? 'дневная' : 'ночная'} карта`);
  console.log('Куспиды:', nat.cusps.slice(1).map((c, i) => `${RN[i + 1]} ${fz(c)}`).join(' | '));
  let ok = 0, bad = [];
  for (const p of nat.points) {
    const z = ZEUS[off][p.id]; if (!z) continue;
    const exp = Array.isArray(z) ? z[0] : z, got = RN[p.house];
    const line = `${p.ru.padEnd(13)} ${fz(p.lon).padEnd(20)} дом ${got.padEnd(5)} ZEUS ${exp}${Array.isArray(z) ? ' ' + z[1] : ''}`;
    if (got === exp) ok++; else bad.push(line);
    if (p.id === 'Fortune' || got !== exp) console.log((got === exp ? '  ✓ ' : '  ✗ ') + line);
  }
  console.log(`  дома совпали: ${ok} из ${Object.keys(ZEUS[off]).length}`, bad.length ? '' : '');
}
// self-consistency of Placidus: cusp 11 & 12 hour angle = −DSA/3, −2DSA/3
const chart = ACG.computeChart(ACG.localToUtc(1996, 4, 11, 5, 54, 'Europe/Moscow').utc);
for (const sys of N.HOUSE_SYSTEMS) { const h = N.computeHouses(sys.id, ACG.norm360(chart.gast + 39.27), chart.eps, 51.73); console.log(sys.ru.padEnd(20), h.cusps.slice(1).map((c) => c.toFixed(1)).join(' '), h.note); }
// Koch sanity: ASC(RAMC − DSA_mc) must equal MC degree
// polar
console.log(N.computeHouses('P', 100, 23.44, 70).note);
console.log('Lilith J2000:', fz(N.lilithLon(A.MakeTime(new Date(Date.UTC(2000, 0, 1, 12))))), '| жена:', fz(N.lilithLon(A.MakeTime(new Date(chart.utcMs)))));
