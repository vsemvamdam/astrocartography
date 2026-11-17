// Prints the reference values used by AstroSkyTests/EngineTests.swift, computed by the site's own engine in Node:
//   node ios/scripts/expected.js
// The engine is loaded the way the app loads it (no DOM, only window and atob), see AstroEngine.swift.
const vm = require('vm'), fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');
const FILES = ['ios/AstroSky/Engine/prelude.js', 'ios/AstroSky/Engine/astronomy.browser.min.js', 'js/data.js', 'js/chiron-data.js', 'js/asteroids-data.js',
  'js/tz-history.js', 'js/meanings.js', 'js/acg-core.js', 'js/natal.js', 'js/features.js', 'js/horary.js', 'js/cycles.js', 'js/interpret.js', 'ios/AstroSky/Engine/bridge.js'];
const ctx = vm.createContext({});
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8'), ctx, { filename: f });
const call = (fn, arg) => { const r = JSON.parse(vm.runInContext(`AstroAPI.${fn}(${JSON.stringify(JSON.stringify(arg))})`, ctx)); if (!r.ok) throw new Error(r.error); return r.value; };
const P = (date, time, name, lat, lon, tz) => ({ name: '', date, time, place: { name, lat, lon, tz } });
const cases = { voronezh: P('1996-04-11', '05:54', 'Воронеж', 51.67, 39.18, 'Europe/Moscow'), oslo1950: P('1950-06-15', '10:30', 'Осло', 59.91, 10.75, 'Europe/Oslo'),
  moscow1985: P('1985-08-01', '23:15', 'Москва', 55.75, 37.62, 'Europe/Moscow'), ny1975: P('1975-11-03', '07:05', 'Нью-Йорк', 40.71, -74.01, 'America/New_York') };
for (const [k, p] of Object.entries(cases)) {
  const r = call('chart', { mode: 'natal', person: p, opts: {} });
  const lon = (id) => +r.chart.points.find((x) => x.id === id).lon.toFixed(6);
  console.log(k, JSON.stringify({ utc: r.utc, offset: r.offset, asc: +r.chart.asc.toFixed(6), mc: +r.chart.mc.toFixed(6), sun: lon('Sun'), moon: lon('Moon'), chiron: lon('Chiron'), aspects: r.chart.aspects.length }));
}
const me = cases.voronezh;
const s = call('chart', { mode: 'solar', person: me, opts: {}, solar: { year: 2027 } });
console.log('solar 2027', s.solar.utc, s.chart.asc.toFixed(6), s.solar.best[0].city.name);
const l = call('chart', { mode: 'lunar', person: me, opts: {}, lunar: { at: Date.UTC(2026, 10, 17) } });
console.log('lunar', l.lunar.utc, l.lunar.next, l.chart.asc.toFixed(6));
const syn = call('chart', { mode: 'synastry', person: me, partner: Object.assign(P('1997-07-23', '14:30', 'Москва', 55.75, 37.62, 'Europe/Moscow'), { name: 'Настя' }), opts: {} });
console.log('synastry cross', syn.cross.length, 'sections', syn.reading.sections.length);
