/* Dumps the results of the site's own calculators (the same js files the browser runs) for the tool checks.
   node qa/verify/tools/site_dump.js <part> [outDir]
   parts: hours voc lunar natal cycles num bio syn horary cities solar all
   Writes <outDir>/site_<part>.json (outDir defaults to $TOOLS_TMP or ./tmp). */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../../lib/site.js');
const { ACG, NATAL: N, FEAT: F, CYCLES: C, HORARY: H } = S;

const OUT = process.argv[3] || process.env.TOOLS_TMP || path.join(__dirname, 'tmp');
fs.mkdirSync(OUT, { recursive: true });
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cases.json'), 'utf8'));
const TZFIX = { LMT: 'Europe/Berlin' };
const place = (c) => ({ name: c.id, lat: c.lat, lon: c.lon, tz: TZFIX[c.tz] || c.tz });
const utcOf = (c) => Date.parse(c.utc);
const save = (part, data) => { fs.writeFileSync(path.join(OUT, `site_${part}.json`), JSON.stringify(data)); console.log(part, 'ok'); };

// the functions of js/tools-view.js that live inside its IIFE: cut their source out and evaluate it
const TV = fs.readFileSync(path.join(S.ROOT, 'js', 'tools-view.js'), 'utf8');
function cut(name) {
  const re = new RegExp(`(?:function ${name}\\b[\\s\\S]*?\\n  }\\n|const ${name} = [^\\n]*\\n)`);
  const m = TV.match(re);
  if (!m) throw new Error('not found in tools-view.js: ' + name);
  return m[0];
}
const toolsFns = new Function('C', 'ACG', `'use strict';
  const n360 = (x) => ((x % 360) + 360) % 360; const n180 = (x) => { const y = n360(x); return y > 180 ? y - 360 : y; };
  ${cut('moonIngress')}${cut('moonPhase')}${cut('isoDay')}${cut('bioVal')}${cut('bioCrit')}
  return { moonIngress, moonPhase, isoDay, bioVal, bioCrit };`)(C, ACG);

function natalOf(c, house) {
  const chart = ACG.computeChart(utcOf(c), {});
  return { chart, nat: N.computeNatal(chart, c.lat, c.lon, { house: house || 'P', minor: true }) };
}
const pt = (p) => ({ id: p.id, lon: p.lon, speed: p.speed == null ? null : p.speed, sign: p.sign, house: p.house, planet: !!p.planet, small: !!p.small, lum: !!p.lum, angle: !!p.angle });

const PARTS = {
  hours() {
    const out = [];
    const dates = [[2026, 1, 7], [2026, 2, 14], [2026, 3, 21], [2026, 4, 28], [2026, 5, 31], [2026, 6, 21], [2026, 7, 9], [2026, 8, 16], [2026, 9, 23], [2026, 10, 30], [2026, 11, 7], [2026, 12, 21]];
    for (const c of CASES.charts) {
      const own = c.local.slice(0, 10).split('-').map(Number);
      for (const [y, m, d] of dates.concat([own])) {
        const r = F.planetaryHours(y, m, d, place(c));
        out.push({ id: c.id, lat: c.lat, lon: c.lon, tz: place(c).tz, y, m, d, midnight: ACG.localToUtc(y, m, d, 0, 0, place(c).tz).utc, r });
      }
    }
    return out;
  },
  voc() {
    const out = [];
    for (const iso of CASES.random_utc.filter((_, i) => i % 15 === 0)) {
      const from = Date.parse(iso);
      for (const classic of [false, true]) {
        const ids = classic ? ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] : ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
        out.push({ from, classic, list: F.voidOfCourse(from, 14, ids) });
      }
    }
    return out;
  },
  lunar() {
    const days = [], phases = [];
    CASES.charts.forEach((c, k) => {
      for (const iso of CASES.random_utc.filter((_, i) => i % 50 === k % 50).slice(0, 4)) {
        const at = Date.parse(iso);
        days.push({ id: c.id, lat: c.lat, lon: c.lon, at, r: F.lunarDays(at, place(c)) });
      }
    });
    for (const iso of CASES.random_utc) {
      const t = Date.parse(iso);
      phases.push({ t, phase: toolsFns.moonPhase(t), entered: toolsFns.moonIngress(t, -1), leaves: toolsFns.moonIngress(t, 1), moon: C.lonOf('Moon', t) });
    }
    return { days, phases };
  },
  natal() {
    const out = [];
    for (const c of CASES.charts) {
      const { chart, nat } = natalOf(c);
      const pts = nat.points.filter((p) => p.id !== 'SNode').concat(nat.angles);
      out.push({
        id: c.id, utc: utcOf(c), lat: c.lat, lon: c.lon, asc: nat.asc, mc: nat.mc, cusps: nat.cusps, isDay: nat.isDay,
        points: nat.points.map(pt), angles: nat.angles.map(pt),
        dign: F.dignityTable(nat), dispC: F.dispositors(nat, false), dispM: F.dispositors(nat, true), lots: F.lots(nat),
        stars: F.starContacts(utcOf(c), pts, 1.5), aspects: nat.aspects.map((a) => ({ A: a.A.id, B: a.B.id, asp: a.asp.a, orb: a.orb, maxOrb: a.maxOrb, applying: a.applying })),
        aspectsMajor: N.computeAspects(nat.points.filter((p) => !p.noAspects).concat(nat.angles), false).map((a) => ({ A: a.A.id, B: a.B.id, asp: a.asp.a, orb: a.orb })),
      });
    }
    // what every half degree "belongs" to, day and night
    const deg = [];
    for (let x = 0.25; x < 360; x += 0.5) deg.push({ lon: x, term: F.termRuler(x), face: F.faceRuler(x), day: F.degreeRulers(x, true), night: F.degreeRulers(x, false), hDay: H.rulersAt(x, true), hNight: H.rulersAt(x, false) });
    const ess = [];
    for (let x = 0.25; x < 360; x += 0.5) for (const id of H.SEVEN) ess.push({ lon: x, id, day: H.essential(id, x, true), night: H.essential(id, x, false) });
    return { charts: out, deg, ess, nat: { RULERS: N.RULERS, EXALT: N.EXALT, ASPECTS: N.ASPECTS }, dignity: Array.from({ length: 12 }, (_, s) => Object.fromEntries(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].map((id) => [id, N.dignity(id, s).map((x) => x.k)]))) };
  },
  cycles() {
    const out = [];
    const nowList = [Date.UTC(2026, 10, 7, 12), Date.UTC(2031, 2, 1), Date.UTC(2050, 6, 15)];
    for (const c of CASES.charts) {
      const { nat } = natalOf(c);
      const birth = utcOf(c);
      const prof = nowList.filter((t) => t > birth).map((now) => { try { const p = C.profections(nat, birth, now); return { now, age: p.age, cur: p.cur, months: p.months }; } catch (e) { return { now, error: String(e.message) }; } });
      const tpts = nat.points.filter((p) => p.planet).concat(nat.angles);
      const year = 2026, tz = place(c).tz;
      const from = ACG.localToUtc(year, 1, 1, 0, 0, tz).utc, to = ACG.localToUtc(year + 1, 1, 1, 0, 0, tz).utc;
      const tr = C.transitCalendar(tpts, from, to, ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']).map((h) => ({ tr: h.tr, natal: h.natal.id, nlon: h.natal.lon, asp: h.asp, t: h.t, pass: h.pass, passes: h.passes, win: h.win }));
      // fast planets too, as the profection tool uses them for the lord of the year
      const trFast = C.transitCalendar(tpts, from, to, ['Sun', 'Mercury', 'Venus']).map((h) => ({ tr: h.tr, natal: h.natal.id, nlon: h.natal.lon, asp: h.asp, t: h.t, pass: h.pass, passes: h.passes, win: h.win }));
      const lpts = nat.points.filter((p) => p.planet || p.id === 'Chiron' || p.id === 'Node');
      const life = C.lifeCycles(lpts, birth, 90).map((x) => ({ id: x.id, asp: x.asp, dir: x.dir, t: x.t, last: x.last, passes: x.passes, age: x.age, nth: x.nth, ru: x.ru }));
      out.push({ id: c.id, birth, asc: nat.asc, ascSign: Math.floor(nat.asc / 30), from, to, prof, natPts: tpts.map(pt), lifePts: lpts.map(pt), tr, trFast, life });
    }
    return out;
  },
  num() {
    const names = ['Анна Иванова', 'Иван Петров', 'John Smith', 'Мария', 'Бурлаков Герман', 'Alexander Pushkin', 'Ёжиков Юрий', 'Щукина Яна', ''];
    const dobs = ['1990-11-29', '1985-03-12', '2000-01-09', '1999-09-09', '1975-07-20', '2004-02-29', '1961-04-12', '1879-03-14', '2010-10-10', '1988-12-07', '2001-01-01', '1929-11-11'];
    const out = [];
    for (const dob of dobs) for (const name of names) for (const year of [2026]) out.push({ name, dob, year, r: C.numerology(name, dob, year) });
    return out;
  },
  bio() {
    const out = [];
    for (let t = 0; t <= 21252 + 30; t++) out.push([t, toolsFns.bioVal(t, 23), toolsFns.bioVal(t, 28), toolsFns.bioVal(t, 33), +toolsFns.bioCrit(t, 23), +toolsFns.bioCrit(t, 28), +toolsFns.bioCrit(t, 33)]);
    return out;
  },
  syn() {
    const out = [];
    for (let i = 0; i < CASES.charts.length; i++) {
      const a = CASES.charts[i], b = CASES.charts[(i + 1) % CASES.charts.length];
      const A = natalOf(a).nat, B = natalOf(b).nat;
      const ptsA = A.points.filter((p) => !p.noAspects).concat(A.angles), ptsB = B.points.filter((p) => !p.noAspects).concat(B.angles);
      const cross = F.crossAspects(ptsA, ptsB).map((x) => ({ A: x.A.id, B: x.B.id, asp: x.asp.a, orb: x.orb, maxOrb: x.maxOrb }));
      const comp = F.composite(A, B, 'P');
      out.push({ a: a.id, b: b.id, ptsA: ptsA.map(pt), ptsB: ptsB.map(pt), cross, mcA: A.mc, mcB: B.mc, ascA: A.asc, ascB: B.asc, latA: A.lat, latB: B.lat, epsA: A.eps, epsB: B.eps,
        comp: { asc: comp.asc, mc: comp.mc, cusps: comp.cusps, points: comp.points.map(pt), aspects: comp.aspects.map((x) => ({ A: x.A.id, B: x.B.id, asp: x.asp.a, orb: x.orb })) } });
    }
    return out;
  },
  horary() {
    const out = [];
    const P = { lat: 55.7558, lon: 37.6173 };
    for (const iso of CASES.random_utc.filter((_, i) => i % 2 === 0)) {
      const t = Date.parse(iso);
      const chart = ACG.computeChart(t, {});
      const nat = N.computeNatal(chart, P.lat, P.lon, { house: 'R' });
      const an = H.analyse(chart, nat, { base: 1, rel: 7 });
      const ev = [];
      for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
        const a = H.SEVEN[i], b = H.SEVEN[j];
        const e = H.scanPair(a, b, t, Math.min(H.signBoundary(a, t, 1, 400), H.signBoundary(b, t, 1, 400), t + 400 * 86400000), 1);
        ev.push({ a, b, t: e.t, asp: e.asp == null ? null : e.asp, stations: e.stations });
      }
      out.push({ t, lat: P.lat, lon: P.lon, asc: nat.asc, cusps: nat.cusps, isDay: an.isDay, exit: an.exit, voc: an.voc, moonNext: an.moonNext, moonPrev: an.moonPrev,
        P: Object.fromEntries(Object.entries(an.P).map(([k, v]) => [k, { lon: v.lon, speed: v.speed, house: v.house, ess: v.ess, acc: v.acc }])),
        sigBase: an.sigBase, sigQ: an.sigQ, verdict: an.verdict.v, pairs: an.pairs.map((p) => ({ a: p.a, b: p.b, perfects: p.perfects, t: p.t, asp: p.asp, prohibit: p.prohibit, refr: p.refranation, translation: p.translation, collection: p.collection, timing: p.timing, now: p.now, same: p.same })), ev });
    }
    return out;
  },
  cities() {
    const out = [];
    const cities = S.cities.map((x) => ({ ru: x.ru, en: x.en, c: x.country, lat: x.lat, lon: x.lon, pop: x.pop }));
    for (const id of ['sotis', 'gagarin', 'buenosaires']) {
      const c = CASES.charts.find((x) => x.id === id), chart = ACG.computeChart(utcOf(c), {});
      const bodies = chart.bodies.map((b) => ({ id: b.id, ra: b.ra, dec: b.dec, elon: b.elon, mc: b.mc, ic: b.ic }));
      for (const g of F.GOALS) {
        const r = F.scoreCities([{ chart, who: 0 }], cities, g.id, { keepAll: false });
        out.push({ id, goal: g.id, gast: chart.gast, bodies, top: r.slice(0, 15).map((x) => ({ city: x.city.en, lat: x.city.lat, lon: x.city.lon, score: x.score, parts: x.parts.map((p) => ({ body: p.body.id, angle: p.angle, km: p.km, w: p.w, s: p.s })) })), n: r.length });
      }
    }
    return { out, goals: F.GOALS };
  },
  solar() {
    const out = [];
    const cities = S.cities.filter((x) => x.pop > 2000000).map((x) => ({ ru: x.ru, en: x.en, lat: x.lat, lon: x.lon, pop: x.pop }));
    for (const id of ['sotis', 'gagarin', 'buenosaires', 'quito']) {
      const c = CASES.charts.find((x) => x.id === id), chart0 = ACG.computeChart(utcOf(c), {});
      const sun = chart0.bodies.find((b) => b.id === 'Sun').elon;
      const t = F.solarReturnUtc(utcOf(c), sun, 2026), chart = ACG.computeChart(t, {});
      const rank = F.rankSolarCities(chart, cities, 'P');
      out.push({ id, t, gast: chart.gast, eps: chart.eps, bodies: chart.bodies.map((b) => ({ id: b.id, elon: b.elon })), rank: rank.map((x) => ({ city: x.city.en, lat: x.city.lat, lon: x.city.lon, score: x.score, asc: x.asc, mc: x.mc, parts: x.parts.map((p) => ({ body: p.body.id, house: p.house, angle: p.angle, s: p.s })) })) });
    }
    return out;
  },
  // matches of the football base (a month file of the football-db branch, path in $FDB): the site's judgement of each
  sport() {
    const file = process.env.FDB;
    if (!file || !fs.existsSync(file)) return [];
    const rows = Object.values(JSON.parse(fs.readFileSync(file, 'utf8'))).filter((r) => r.place && r.fav && r.fav.side);
    return rows.map((r) => {
      const m = { date: Date.parse(r.kickoff), home: { name: r.home.name }, away: { name: r.away.name } };
      const J = S.SPORT.judge(m, r.place, r.fav.side, {});
      return { id: r.id, kickoff: m.date, place: r.place, fav: r.fav.side, cusps: J.E.cusps, P: J.E.P, fortune: J.fortune,
        lords: { fav: J.teams.fav.sigs, dog: J.teams.dog.sigs }, moonAsp: J.moonAsp.map((x) => ({ key: x.to.key, asp: x.asp, deg: x.deg })),
        final: J.final ? { key: J.final.to.key, asp: J.final.asp } : null, T: J.testimonies, score: J.score, diff: J.diff, verdict: J.verdict, db: r.judge || null };
    });
  },
};

const want = process.argv[2] || 'all';
for (const k of Object.keys(PARTS)) if (want === 'all' || want.split(',').includes(k)) save(k, PARTS[k]());
