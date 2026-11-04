/* Builds js/chiron-data.js: heliocentric J2000 equatorial positions of (2060) Chiron,
   every 20 days from 1800 to 2100, by numerical integration (Sun + 8 planets) of the
   AstDyS osculating orbit (Wood et al. 2017, arXiv:1712.04995, Table 1).
   Usage: npm install astronomy-engine@2.1.19 && node tools/build_chiron.js js/chiron-data.js */
const A = require(process.env.ASTRONOMY_JS || 'astronomy-engine');
const fs = require('fs');
const D = Math.PI / 180;
const EL = { epochJD: 2457600.5, a: 13.6395, e: 0.382727, i: 6.947, node: 209.216, peri: 339.537, M: 145.978 };
const GM = 0.2959122082855911e-03, EPS0 = 23.4392911 * D;
const STEP = 20, T_START = -73050 - 10, T_END = 36525 + 40;   // TT days from J2000: 1800 … 2100

function stateFromElements(el) {
  let E = el.M * D;
  for (let k = 0; k < 50; k++) E -= (E - el.e * Math.sin(E) - el.M * D) / (1 - el.e * Math.cos(E));
  const n = Math.sqrt(GM / el.a ** 3), b = el.a * Math.sqrt(1 - el.e ** 2), den = 1 - el.e * Math.cos(E);
  const xo = el.a * (Math.cos(E) - el.e), yo = b * Math.sin(E);
  const vxo = -el.a * n * Math.sin(E) / den, vyo = b * n * Math.cos(E) / den;
  const [O, w, i] = [el.node * D, el.peri * D, el.i * D];
  const rot = (x, y) => [
    x * (Math.cos(O) * Math.cos(w) - Math.sin(O) * Math.sin(w) * Math.cos(i)) - y * (Math.cos(O) * Math.sin(w) + Math.sin(O) * Math.cos(w) * Math.cos(i)),
    x * (Math.sin(O) * Math.cos(w) + Math.cos(O) * Math.sin(w) * Math.cos(i)) - y * (Math.sin(O) * Math.sin(w) - Math.cos(O) * Math.cos(w) * Math.cos(i)),
    x * Math.sin(w) * Math.sin(i) + y * Math.cos(w) * Math.sin(i)];
  const toEq = ([x, y, z]) => [x, y * Math.cos(EPS0) - z * Math.sin(EPS0), y * Math.sin(EPS0) + z * Math.cos(EPS0)];
  return { r: toEq(rot(xo, yo)), v: toEq(rot(vxo, vyo)) };
}

const tt0 = EL.epochJD - 2451545.0;
const timeTT = (tt) => { let t = A.MakeTime(tt); return t.AddDays(tt - t.tt); };   // MakeTime(number) is UT days
const s0 = stateFromElements(EL);
const grid = [];
for (let tt = Math.ceil(T_START / STEP) * STEP; tt <= T_END; tt += STEP) grid.push(tt);
const out = new Map();
for (const dir of [-1, 1]) {
  const start = timeTT(tt0);
  const sim = new A.GravitySimulator(A.Body.Sun, start, [new A.StateVector(...s0.r, ...s0.v, start)]);
  let cur = tt0;
  const targets = grid.filter((g) => dir < 0 ? g <= tt0 : g > tt0).sort((a, b) => dir * (a - b));
  for (const g of targets) {
    while (dir * (g - cur) > 1) { cur += dir; sim.Update(timeTT(cur)); }
    cur = g;
    const st = sim.Update(timeTT(cur))[0];
    out.set(g, [st.x, st.y, st.z]);
  }
}
const n = grid.length, arr = new Int32Array(n * 3);
grid.forEach((g, k) => out.get(g).forEach((v, j) => { arr[k * 3 + j] = Math.round(v * 1e8); }));
const b64 = Buffer.from(arr.buffer).toString('base64');
fs.writeFileSync(process.argv[2] || 'js/chiron-data.js',
  `/* (2060) Chiron, heliocentric J2000 equatorial x,y,z in 1e-8 AU, every ${STEP} days of TT from ${grid[0]} (days since J2000). Built by tools/build_chiron.js */\n` +
  `window.ACG_CHIRON={t0:${grid[0]},step:${STEP},n:${n},data:"${b64}"};\n`);
console.log('samples', n, 'bytes', b64.length);
