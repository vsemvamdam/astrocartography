/* Loads the site's calculation modules in Node, the same files the browser runs.
   const S = require('./qa/lib/site'); S.ACG, S.NATAL, S.FEAT, S.HORARY, S.CYCLES, S.SPORT, S.CELEBS, S.INTERP, S.DATA, S.cities
   Needs astronomy-engine 2.1.19: `npm i --prefix qa astronomy-engine@2.1.19` or ASTRONOMY_JS=<path>. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis;
let A;
try { A = require(process.env.ASTRONOMY_JS || path.join(__dirname, '..', 'node_modules', 'astronomy-engine')); } catch (e) { A = require('astronomy-engine'); }
globalThis.Astronomy = A;
for (const f of ['data', 'country-labels', 'chiron-data', 'asteroids-data', 'asteroids-extra-data', 'acg-core', 'meanings', 'natal', 'features',
  'horary', 'interpret', 'celebs-data', 'celebs', 'cycles', 'sport']) require(path.join(ROOT, 'js', f + '.js'));
const D = globalThis.ACG_DATA;
const cities = D.cities.split('\n').map((r) => { const f = r.split('|'); return { ru: f[0], en: f[1], country: D.countries[+f[2]], lat: +f[3] / 100, lon: +f[4] / 100, tz: D.tzs[+f[5]], pop: +f[6] }; });
module.exports = { Astronomy: A, ACG: globalThis.ACG, NATAL: globalThis.NATAL, FEAT: globalThis.FEAT, HORARY: globalThis.HORARY, CYCLES: globalThis.CYCLES,
  SPORT: globalThis.SPORT, CELEBS: globalThis.CELEBS, INTERP: globalThis.INTERP, DATA: D, cities, ROOT };
