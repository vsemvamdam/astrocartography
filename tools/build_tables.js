/* Builds js/chiron-data.js and js/asteroids-data.js: heliocentric J2000 equatorial positions of Chiron
   (every 20 days) and of Ceres, Pallas, Juno, Vesta (every 30 days), 1800–2100.
   Each grid point is integrated (Sun + 8 planets, astronomy-engine's GravitySimulator) from the nearest
   of 16 JPL Horizons state vectors, one every 20 years (tools/horizons-states.json), so the error stays
   at a few arcseconds over the whole range.
   Usage: npm install astronomy-engine@2.1.19 && node tools/build_tables.js */
const A = require(process.env.ASTRONOMY_JS || 'astronomy-engine');
const fs = require('fs');
const path = require('path');
const STATES = JSON.parse(fs.readFileSync(path.join(__dirname, 'horizons-states.json'), 'utf8')).bodies;
const timeTT = (tt) => { const t = A.MakeTime(tt); return t.AddDays(tt - t.tt); };   // MakeTime(number) is UT days

function table(name, step, tStart, tEnd) {
  const ep = STATES[name].map((r) => ({ tt: r[0] - 2451545.0, r: r.slice(1, 4), v: r.slice(4, 7) }));
  const grid = [];
  for (let tt = Math.ceil(tStart / step) * step; tt <= tEnd; tt += step) grid.push(tt);
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
  return { t0: grid[0], step, n: grid.length, data: Buffer.from(arr.buffer).toString('base64') };
}

const root = path.join(__dirname, '..', 'js');
const ch = table('Chiron', 20, -73050 - 10, 36525 + 40);
fs.writeFileSync(path.join(root, 'chiron-data.js'),
  `/* (2060) Chiron, heliocentric J2000 equatorial x,y,z in 1e-8 AU, every ${ch.step} days of TT from ${ch.t0} (days since J2000). Built by tools/build_tables.js from JPL Horizons states */\n` +
  `window.ACG_CHIRON={t0:${ch.t0},step:${ch.step},n:${ch.n},data:"${ch.data}"};\n`);
console.log('Chiron', ch.n);
const out = {};
let meta = null;
for (const name of ['Ceres', 'Pallas', 'Juno', 'Vesta']) {
  const t = table(name, 30, -73050 - 20, 36525 + 60);
  out[name] = t.data; meta = t;
  console.log(name, t.n);
}
fs.writeFileSync(path.join(root, 'asteroids-data.js'),
  `/* Ceres, Pallas, Juno, Vesta: heliocentric J2000 equatorial x,y,z in 1e-8 AU, every ${meta.step} days of TT from ${meta.t0} (days since J2000). Built by tools/build_tables.js from JPL Horizons states */\n` +
  `window.ACG_ASTEROIDS={t0:${meta.t0},step:${meta.step},n:${meta.n},data:${JSON.stringify(out)}};\n`);
