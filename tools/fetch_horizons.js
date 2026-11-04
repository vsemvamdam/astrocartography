/* Fetches heliocentric ICRF state vectors (AU, AU/day, TDB) of small bodies from the JPL Horizons API,
   every 5 years from 1800 to 2100, plus geocentric ecliptic longitudes at check dates to validate the
   tables built from them. Runs in GitHub Actions (.github/workflows/horizons.yml), because Horizons is
   not reachable from every network.
   Usage: [GRID="Eros=433,Amor=1221"] node tools/fetch_horizons.js "Psyche=16,Hygiea=10" out.json   (Node 18+) */
'use strict';
const fs = require('fs');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const JD0 = 2378496.5, STEP = 1826.25, N = 61;                  // 1800-01-01 … 2100-01-01
const CHECK = [2378496.5, 2397000.5, 2415020.5, 2433282.5, 2442435.5, 2450184.5795, 2455957.5, 2461349.5, 2470000.5, 2479000.5, 2488069.5];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function horizons(params) {
  const q = new URLSearchParams(Object.assign({ format: 'json', OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', CSV_FORMAT: 'YES' }, params));
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(`${API}?${q}`, { signal: AbortSignal.timeout(60000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const txt = j.result || '';
      const a = txt.indexOf('$$SOE'), b = txt.indexOf('$$EOE');
      if (a < 0 || b < 0) throw new Error('no ephemeris block: ' + txt.slice(0, 400));
      return txt.slice(a + 5, b).trim().split('\n').map((l) => l.split(',').map((x) => x.trim()));
    } catch (e) {
      if (k === 3) throw e;
      await sleep(3000 * (k + 1));
    }
  }
}
const tlist = (jds) => jds.map((x) => `'${x}'`).join(' ');

(async () => {
  const want = (process.argv[2] || '').split(',').filter(Boolean).map((s) => s.split('='));
  const out = { source: `JPL Horizons API, heliocentric (500@10) ICRF state vectors, AU and AU/day, TDB Julian dates, every ${STEP} days; check: geocentric ecliptic longitude (quantity 31); retrieved ${new Date().toISOString().slice(0, 10)}`, bodies: {}, check: {}, numbers: {} };
  const jds = Array.from({ length: N }, (_, k) => JD0 + k * STEP);
  for (const [name, num] of want) {
    const rows = await horizons({ COMMAND: `'${num};'`, EPHEM_TYPE: 'VECTORS', CENTER: "'500@10'", REF_PLANE: 'FRAME', REF_SYSTEM: 'ICRF', VEC_TABLE: '2', OUT_UNITS: 'AU-D', VEC_LABELS: 'NO', TLIST_TYPE: 'JD', TLIST: tlist(jds) });
    out.bodies[name] = rows.map((r) => [+r[0], +r[2], +r[3], +r[4], +r[5], +r[6], +r[7]]);
    const obs = await horizons({ COMMAND: `'${num};'`, EPHEM_TYPE: 'OBSERVER', CENTER: "'500@399'", QUANTITIES: "'31'", ANG_FORMAT: 'DEG', CAL_FORMAT: 'JD', TLIST_TYPE: 'JD', TLIST: tlist(CHECK) });
    out.check[name] = obs.map((r) => { const nums = r.map(Number).filter((x, i) => i > 0 && r[i] !== '' && isFinite(x)); return [+r[0] || CHECK[obs.indexOf(r)], nums[nums.length - 2]]; });
    out.numbers[name] = num;
    console.log(name, out.bodies[name].length, 'states,', out.check[name].length, 'checks');
    await sleep(1500);
  }
  // near-Earth bodies: positions straight from Horizons on a 10-day grid, no integration needed
  const grid = (process.env.GRID || '').split(',').filter(Boolean).map((s) => s.split('='));
  if (grid.length) out.grid = {};
  for (const [name, num] of grid) {
    const rows = await horizons({ COMMAND: `'${num};'`, EPHEM_TYPE: 'VECTORS', CENTER: "'500@10'", REF_PLANE: 'FRAME', REF_SYSTEM: 'ICRF', VEC_TABLE: '1', OUT_UNITS: 'AU-D', VEC_LABELS: 'NO',
      START_TIME: "'1799-11-21'", STOP_TIME: "'2100-02-10'", STEP_SIZE: "'10 d'" });
    out.grid[name] = { jd0: +rows[0][0], step: 10, n: rows.length, xyz: rows.map((r) => [+r[2], +r[3], +r[4]].map((v) => Math.round(v * 1e8))).flat() };
    out.numbers[name] = num;
    console.log(name, rows.length, 'grid points');
    await sleep(1500);
  }
  fs.writeFileSync(process.argv[3] || 'horizons-new.json', JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });
