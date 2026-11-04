// npm install astronomy-engine@2.1.19, then: node tools/test-core.js
globalThis.Astronomy = require('astronomy-engine');
require('../js/acg-core.js');
const A = Astronomy, ACG = globalThis.ACG;
const t = ACG.localToUtc(1996, 12, 27, 14, 20, 'Asia/Irkutsk');
console.log('UTC', new Date(t.utc).toISOString(), 'offset min', t.offset);
const ch = ACG.computeChart(t.utc);
console.log('GAST deg', ch.gast.toFixed(3));
for (const b of ch.bodies) {
  const z = ACG.formatZodiac(b.elon);
  console.log(b.ru.padEnd(10), `${z.deg}°${String(z.min).padStart(2,'0')}' ${z.name}`.padEnd(18), b.retro?'R':' ', 'RA', b.ra.toFixed(2).padStart(7), 'Dec', b.dec.toFixed(2).padStart(6), 'MC', b.mc.toFixed(2).padStart(7), 'IC', b.ic.toFixed(2).padStart(7), 'pts', b.asc.length/2);
}
// Self-consistency: altitude 0 on ASC/DSC lines, culmination on MC
const time = A.MakeTime(new Date(t.utc));
let worst = 0, azBad = 0;
for (const b of ch.bodies) {
  for (const [arr, rising] of [[b.asc, true], [b.dsc, false]]) {
    for (let i = 0; i < arr.length; i += 2 * 37) {
      const lon = ACG.norm180(arr[i]), lat = arr[i+1];
      const h = A.Horizon(time, new A.Observer(lat, lon, 0), b.ra/15, b.dec, null);
      worst = Math.max(worst, Math.abs(h.altitude));
      // rising body azimuth in east half (0..180), setting in west half
      if (Math.abs(lat) < 80 && ((rising && h.azimuth > 180.5) || (!rising && h.azimuth < 179.5)) && Math.abs(h.altitude) < 0.01 && Math.abs(Math.abs(lat) - (90-Math.abs(b.dec))) > 2) azBad++;
    }
  }
  const hm = A.Horizon(time, new A.Observer(0, b.mc, 0), b.ra/15, b.dec, null);
  const hourAngle = ACG.norm180((ch.gast + b.mc) - b.ra);
  if (Math.abs(hourAngle) > 1e-6) console.log('MC hour angle off', b.id, hourAngle);
}
console.log('max |altitude| on ASC/DSC samples:', worst.toExponential(2), 'deg; wrong-side azimuths:', azBad);
// distances
const near = ACG.linesNear(ch, 52.32, 104.25, 1000);
console.log('Lines near Irkutsk:', near.map(n => `${n.body.ru} ${n.angle} ${Math.round(n.km)} км`).join('; '));
// tz history spot checks
for (const [tz, y, m, d, hh] of [['Europe/Moscow', 1985, 7, 1, 12], ['Europe/Moscow', 2012, 1, 1, 12], ['Europe/Samara', 1990, 1, 1, 12], ['Asia/Novosibirsk', 2017, 1, 1, 12], ['Europe/Kiev', 1989, 7, 1, 12]]) {
  const r = ACG.localToUtc(y, m, d, hh, 0, tz); console.log(tz, y, 'UTC' + (r.offset/60));
}
