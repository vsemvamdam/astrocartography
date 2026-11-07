/* Loads the site's calculation modules in Node, the same files the browser runs.
   const S = require('./qa/lib/site'); S.ACG, S.NATAL, S.FEAT, S.HORARY, S.CYCLES, S.SPORT, S.CELEBS, S.INTERP, S.DATA, S.cities
   Needs astronomy-engine 2.1.19: `npm i --prefix qa astronomy-engine@2.1.19` or ASTRONOMY_JS=<path>. */
'use strict';
const path = require('path');
const ROOT = process.env.QA_SITE ? path.resolve(process.env.QA_SITE) : path.join(__dirname, '..', '..');   // QA_SITE: another checkout of the site
globalThis.window = globalThis;
let A;
try { A = require(process.env.ASTRONOMY_JS || path.join(__dirname, '..', 'node_modules', 'astronomy-engine')); } catch (e) { A = require('astronomy-engine'); }
globalThis.Astronomy = A;
for (const f of ['data', 'tz-history', 'country-labels', 'chiron-data', 'asteroids-data', 'asteroids-extra-data', 'acg-core', 'meanings', 'natal', 'features',
  'horary', 'interpret', 'celebs-data', 'celebs', 'cycles', 'sport']) {
  const file = path.join(ROOT, 'js', f + '.js');
  if (f === 'tz-history' && !require('fs').existsSync(file)) continue;   // older copies of the site have no table
  require(file);
}
const D = globalThis.ACG_DATA;
const cities = D.cities.split('\n').map((r) => { const f = r.split('|'); return { ru: f[0], en: f[1], country: D.countries[+f[2]], lat: +f[3] / 100, lon: +f[4] / 100, tz: D.tzs[+f[5]], pop: +f[6] }; });
module.exports = { Astronomy: A, ACG: globalThis.ACG, NATAL: globalThis.NATAL, FEAT: globalThis.FEAT, HORARY: globalThis.HORARY, CYCLES: globalThis.CYCLES,
  SPORT: globalThis.SPORT, CELEBS: globalThis.CELEBS, INTERP: globalThis.INTERP, DATA: D, cities, ROOT };
