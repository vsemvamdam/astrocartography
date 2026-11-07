/* Builds js/chiron-data.js and js/asteroids-data.js: heliocentric J2000 equatorial positions of Chiron
   (every 20 days) and of the asteroids (every 30 days; Eros and Amor every 10 days, straight from Horizons),
   1800 to the end of 2100, and js/asteroids-extra-data.js for the five that load on demand.
   Each grid point is integrated (Sun + 8 planets, astronomy-engine's GravitySimulator) from the nearest
   of the JPL Horizons state vectors in tools/horizons-states.json (every 20 years, or every 5 years for the
   newer bodies; tools/fetch_horizons.js), so the error stays small over the whole range.
   Usage: npm install astronomy-engine@2.1.19 && node tools/build_tables.js */
const A = require(process.env.ASTRONOMY_JS || 'astronomy-engine');
const fs = require('fs');
const path = require('path');
const STATES = JSON.parse(fs.readFileSync(path.join(__dirname, 'horizons-states.json'), 'utf8')).bodies;
const timeTT = (tt) => { const t = A.MakeTime(tt); return t.AddDays(tt - t.tt); };   // MakeTime(number) is UT days

function table(name, step, tStart, tEnd, origin = 0) {    // grid: origin + k·step
  const ep = STATES[name].map((r) => ({ tt: r[0] - 2451545.0, r: r.slice(1, 4), v: r.slice(4, 7) }));
  const grid = [];
  for (let tt = origin + Math.ceil((tStart - origin) / step) * step; tt <= tEnd; tt += step) grid.push(tt);
  const res = new Map();
  ep.forEach((e, k) => {
    const lo = k === 0 ? -Infinity : (ep[k - 1].tt + e.tt) / 2, hi = k === ep.length - 1 ? Infinity : (e.tt + ep[k + 1].tt) / 2;
    for (const dir of [-1, 1]) {
      const start = timeTT(e.tt);
      const sim = new A.GravitySimulator(A.Body.Sun, start, [new A.StateVector(...e.r, ...e.v, start)]);
      let cur = e.tt;
      const targets = grid.filter((g) => g >= lo && g < hi && (dir < 0 ? g <= e.tt : g > e.tt)).sort((a, b) => dir * (a - b));
      for (const g of targets) {
        while (dir * (g - cur) > 1) { cur += dir; sim.Update(timeTT(cur)); }
        cur = g;
        const st = sim.Update(timeTT(cur))[0];
        res.set(g, [st.x, st.y, st.z]);
      }
    }
  });
  const arr = new Int32Array(grid.length * 3);
  grid.forEach((g, k) => res.get(g).forEach((v, j) => { arr[k * 3 + j] = Math.round(v * 1e8); }));
  return { t0: grid[0], step, n: grid.length, data: Buffer.from(arr.buffer).toString('base64'), arr };
}

const GRIDS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'horizons-grid.json'), 'utf8')).grid; } catch (e) { return {}; } })();
// a body tabulated directly by Horizons (tools/horizons-grid.json): positions as they are, no integration
// past the end of the Horizons grid the positions are integrated from the last Horizons state, on the same grid
function gridTable(name, tEnd) {
  const G = GRIDS[name], t0 = G.jd0 - 2451545.0, last = t0 + (G.n - 1) * G.step;
  let xyz = Int32Array.from(G.xyz), n = G.n;
  if (tEnd > last) {
    const ext = table(name, G.step, last + G.step, tEnd, t0), add = ext.arr;
    if (ext.t0 !== last + G.step) throw new Error(name + ': extension does not continue the grid');
    const joined = new Int32Array(xyz.length + add.length); joined.set(xyz); joined.set(add, xyz.length);
    xyz = joined; n += ext.n;
  }
  return { t0, step: G.step, n, data: Buffer.from(xyz.buffer).toString('base64') };
}
const root = path.join(__dirname, '..', 'js');
const T0 = -73050, T1 = 36891;                       // 1800-01-01 … 2101-01-01 in TT days from J2000 (the form takes all of 2100)
// Ceres–Vesta load with the page; the five others (asteroids-extra-data.js) only when someone turns them on
const MAIN = ['Ceres', 'Pallas', 'Juno', 'Vesta'], EXTRA = ['Eros', 'Psyche', 'Amor', 'Hygiea', 'Proserpina'];
if (require.main === module) {
  const ch = table('Chiron', 20, T0 - 60, T1 + 60);   // interpolation needs points on both sides of the first and last day
  fs.writeFileSync(path.join(root, 'chiron-data.js'),
    `/* (2060) Chiron, heliocentric J2000 equatorial x,y,z in 1e-8 AU, every ${ch.step} days of TT from ${ch.t0} (days since J2000). Built by tools/build_tables.js from JPL Horizons states */\n` +
    `window.ACG_CHIRON={t0:${ch.t0},step:${ch.step},n:${ch.n},data:"${ch.data}"};\n`);
  console.log('Chiron', ch.n);
  const build = (name) => (GRIDS[name] ? gridTable(name, T1 + 60) : table(name, 30, T0 - 60, T1 + 60));
  const main = {}; let base = null;
  for (const name of MAIN) { const t = build(name); main[name] = t.data; base = t; console.log(name, t.step, t.n); }
  fs.writeFileSync(path.join(root, 'asteroids-data.js'),
    `/* Ceres, Pallas, Juno, Vesta: heliocentric J2000 equatorial x,y,z in 1e-8 AU, every ${base.step} days of TT from ${base.t0} (days since J2000). Built by tools/build_tables.js from JPL Horizons states */\n` +
    `window.ACG_ASTEROIDS={t0:${base.t0},step:${base.step},n:${base.n},data:${JSON.stringify(main)}};\n`);
  const extra = {};
  for (const name of EXTRA) { const t = build(name); extra[name] = { t0: t.t0, step: t.step, n: t.n, data: t.data }; console.log(name, t.step, t.n); }
  fs.writeFileSync(path.join(root, 'asteroids-extra-data.js'),
    `/* Eros, Psyche, Amor, Hygiea, Proserpina: heliocentric J2000 equatorial x,y,z in 1e-8 AU, each with its own grid {t0, step, n} in TT days since J2000. Eros and Amor are JPL Horizons positions every 10 days; the others are integrated from Horizons states. Built by tools/build_tables.js */\n` +
    `(window.ACG_ASTEROIDS = window.ACG_ASTEROIDS || { data: {} }).data = Object.assign(window.ACG_ASTEROIDS.data || {}, ${JSON.stringify(extra)});\n`);
}
module.exports = { table };
