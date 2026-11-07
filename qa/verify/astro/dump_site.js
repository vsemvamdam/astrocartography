/* Dump of the site's astronomy results for the QA comparison (area A).
   node qa/verify/astro/dump_site.js <cases.json> <out.json> [tzcases.json tzout.json]
   Calls the same js/*.js the browser loads (qa/lib/site.js). */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'lib', 'site.js'));
const { ACG, NATAL, FEAT, Astronomy: A } = S;
// city-view.js is a browser module; its horizon() has no DOM dependency at load time
globalThis.document = globalThis.document || { getElementById: () => null };
require(path.join(S.ROOT, 'js', 'city-view.js'));
const horizon = globalThis.CityView._horizon;

const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = { generated: new Date().toISOString(), charts: [], random: [], houseGrid: [], tz: null };
const SYS = NATAL.HOUSE_SYSTEMS.map((s) => s.id);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const arr = (a, step) => { const o = []; for (let i = 0; i < a.length; i += 2 * (step || 1)) o.push([r6(a[i]), r6(a[i + 1])]); return o; };

function bodyRows(ch) {
  return ch.bodies.map((b) => ({ id: b.id, elon: b.elon, elat: b.elat, ra: b.ra, dec: b.dec, speed: b.speed, retro: b.retro, mc: b.mc, ic: b.ic }));
}
function timeInfo(ms) {
  const t = A.MakeTime(new Date(ms));
  return { ut: t.ut, tt: t.tt, dT: (t.tt - t.ut) * 86400 };
}
function natalAll(ch, lat, lon) {
  const o = {};
  for (const s of SYS) {
    const n = NATAL.computeNatal(ch, lat, lon, { house: s });
    const P = (id) => (n.points.find((p) => p.id === id) || {}).lon;
    o[s] = { cusps: n.cusps.slice(1), asc: n.asc, mc: n.mc, used: n.used, note: n.note, ramc: n.ramc, isDay: n.isDay,
      fortune: P('Fortune'), lilith: P('Lilith'), snode: P('SNode'),
      houses: Object.fromEntries(n.points.map((p) => [p.id, p.house])) };
  }
  return o;
}

// ------------------------------------------------------------------ charts
const RELOC = [['Москва', 55.7558, 37.6173], ['Нью-Йорк', 40.7128, -74.006], ['Сидней', -33.8688, 151.2093], ['Норильск', 69.3535, 88.2027], ['Рио-де-Жанейро', -22.9068, -43.1729]];
for (const c of cases.charts) {
  const ms = Date.parse(c.utc);
  const chT = ACG.computeChart(ms, { node: 'true' }), chM = ACG.computeChart(ms, { node: 'mean' });
  const rec = { id: c.id, utcMs: ms, lat: c.lat, lon: c.lon, ...timeInfo(ms), gast: chT.gast, eps: chT.eps,
    bodies: bodyRows(chT), meanNode: chM.bodies.find((b) => b.id === 'Node'),
    lilith: NATAL.lilithLon(A.MakeTime(new Date(ms))) };
  // lines (every 2nd point of the ASC/DSC curves)
  rec.lines = chT.bodies.map((b) => ({ id: b.id, mc: b.mc, ic: b.ic, asc: arr(b.asc, 2), dsc: arr(b.dsc, 2) }));
  rec.natal = natalAll(chT, c.lat, c.lon);
  rec.reloc = RELOC.map(([name, lat, lon]) => ({ name, lat, lon, natal: natalAll(chT, lat, lon) }));
  // aspect lines
  rec.aspectLines = ACG.computeAspectLines(chT, { 60: true, 90: true, 120: true }).map((l) => ({ id: l.body.id, a: l.aspect.a, sgn: l.sgn, point: l.point, mc: l.mc, asc: arr(l.asc, 4) }));
  // parans (all bodies the site can show)
  rec.parans = ACG.computeParans(chT).map((p) => ({ A: p.A.id, ea: p.ea, B: p.B.id, eb: p.eb, lat: p.lat }));
  // dynamics: transits at the 'today' chart moment, progressions to natal + 30 years
  const tgtT = Date.parse('2026-11-07T12:00:00Z');
  const tgtP = ms + 30 * 365.2422 * 86400000;
  rec.dyn = {};
  for (const [mode, tgt] of [['transit', tgtT], ['prog', tgtP]]) {
    const d = ACG.computeDynamic(chT, mode, tgt);
    rec.dyn[mode] = { utcMs: d.utcMs, targetUtcMs: tgt, bodies: d.bodies.map((b) => ({ id: b.id, elon: b.elon, ra: b.ra, dec: b.dec, retro: b.retro, mc: b.mc, ic: b.ic, asc: arr(b.asc, 8), dsc: arr(b.dsc, 8) })) };
  }
  // local space (city view): from the birthplace and from two 'home' points
  const homes = [[c.lat, c.lon], [c.lat + 0.3, c.lon - 0.4], [55.7558, 37.6173]];
  rec.horizon = homes.map(([la, lo]) => ({ lat: la, lon: lo, bodies: chT.bodies.map((b) => ({ id: b.id, ...horizon(b, chT.gast, la, lo) })) }));
  // solar returns
  const sun = chT.bodies.find((b) => b.id === 'Sun'), moon = chT.bodies.find((b) => b.id === 'Moon');
  const y0 = new Date(ms).getUTCFullYear();
  rec.solar = [1, 5, 30, 75].map((k) => y0 + k).filter((y) => y >= 1800 && y <= 2100).map((y) => ({ year: y, utcMs: FEAT.solarReturnUtc(ms, sun.elon, y) }));
  rec.sunLon = sun.elon; rec.moonLon = moon.elon;
  // lunar returns: the latest at or before `at`, and the next one
  rec.lunar = [3, 100, 1000, 10000].map((k) => ms + k * 86400000 + 0.37 * 86400000).filter((at) => at < Date.UTC(2100, 11, 31)).map((at) => {
    const r = FEAT.lunarReturnUtc(moon.elon, at);
    return { at, utcMs: r, next: FEAT.nextLunarReturnUtc(moon.elon, r) };
  });
  rec.stars = FEAT.starLongitudes(ms).map((s) => ({ ru: s.ru, lon: s.lon, lat: s.lat }));
  out.charts.push(rec);
}

// ------------------------------------------------------------------ random moments
cases.random_utc.forEach((iso, i) => {
  const ms = Date.parse(iso);
  const chT = ACG.computeChart(ms, { node: 'true' }), chM = ACG.computeChart(ms, { node: 'mean' });
  const lat = ((i * 37) % 131) - 65 + 0.123, lon = ((i * 97) % 360) - 180 + 0.456;   // deterministic place
  const rec = { i, iso, utcMs: ms, ...timeInfo(ms), gast: chT.gast, eps: chT.eps, bodies: bodyRows(chT),
    meanNode: chM.bodies.find((b) => b.id === 'Node').elon, lilith: NATAL.lilithLon(A.MakeTime(new Date(ms))), lat, lon };
  rec.natal = natalAll(chT, lat, lon);
  // a few solar/lunar returns from random moments too
  if (i % 10 === 0) {
    const sun = chT.bodies.find((b) => b.id === 'Sun'), moon = chT.bodies.find((b) => b.id === 'Moon');
    const y = Math.min(2100, new Date(ms).getUTCFullYear() + 1 + (i % 7));
    rec.solar = { year: y, utcMs: FEAT.solarReturnUtc(ms, sun.elon, y), sunLon: sun.elon };
    const at = ms + (50 + i) * 86400000;
    const r = FEAT.lunarReturnUtc(moon.elon, at);
    rec.lunar = { at, utcMs: r, next: FEAT.nextLunarReturnUtc(moon.elon, r), moonLon: moon.elon };
  }
  out.random.push(rec);
});

// ------------------------------------------------------------------ house grid (pure geometry)
const LATS = [];
for (let la = -66; la <= 66; la += 3) LATS.push(la);
LATS.push(-89, -80, -70, -67, 67, 68.96, 69.65, 70, 75, 80, 89, -54.8, 0.001, -0.001);
for (const eps of [23.4392911, 23.2, 23.8]) for (const lat of LATS) for (let ramc = 0.25; ramc < 360; ramc += 7.5) {
  const row = { eps, lat, ramc, s: {} };
  for (const s of SYS) { const h = NATAL.computeHouses(s, ramc, eps, lat); row.s[s] = { c: h.cusps.slice(1), used: h.used }; }
  out.houseGrid.push(row);
}

// ------------------------------------------------------------------ ephemeris tables
out.ephemeris = [[1996, 4], [2024, 2], [1800, 1], [2100, 12], [1900, 2]].map(([y, m]) => ({ y, m, rows: FEAT.ephemeris(y, m, 'true').map((r) => ({ d: r.d, bodies: r.bodies.map((b) => ({ id: b.id, elon: b.elon, retro: b.retro })) })) }));

fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log('charts', out.charts.length, 'random', out.random.length, 'grid', out.houseGrid.length);

// ------------------------------------------------------------------ time zones
if (process.argv[4]) {
  const tc = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const res = {};
  res.local = tc.local.map(([y, mo, d, h, mi, tz, man]) => {
    try { const r = ACG.localToUtc(y, mo, d, h, mi, tz, man == null ? undefined : man); return { utc: r.utc, offset: r.offset, source: r.source }; }
    catch (e) { return { error: String(e) }; }
  });
  res.offsets = tc.offsets.map(([tz, ms]) => { try { return ACG.tzOffsetMin(tz, ms); } catch (e) { return null; } });
  // ICU directly, a different path: the 'longOffset' time zone name ("GMT+03:00" / "GMT+02:30:17")
  const icuOff = (tz, ms) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName').value;
    if (p === 'GMT') return 0;
    const m = /GMT([+-−])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?/.exec(p);
    const s = m[1] === '+' ? 1 : -1;
    return s * (+m[2] * 60 + (+(m[3] || 0)) + (+(m[4] || 0)) / 60);
  };
  res.icuOffsets = tc.offsets.map(([tz, ms]) => { try { return icuOff(tz, ms); } catch (e) { return null; } });
  // ICU local→UTC by search: every instant whose wall clock equals the input
  res.icuLocal = tc.local.map(([y, mo, d, h, mi, tz]) => {
    try {
      const L = Date.UTC(y, mo - 1, d, h, mi), sols = [];
      const cands = new Set();
      for (let k = -2; k <= 2; k++) cands.add(icuOff(tz, L + k * 43200000));
      for (const off of cands) { const u = L - Math.round(off * 60000); if (Math.abs(icuOff(tz, u) - off) < 1e-9) sols.push(u); }
      return [...new Set(sols)].sort((a, b) => a - b);
    } catch (e) { return null; }
  });
  res.icu = process.versions.icu + ' tz ' + process.versions.tz;
  fs.writeFileSync(process.argv[5], JSON.stringify(res));
  console.log('tz local', res.local.length, 'offsets', res.offsets.length);
}
