#!/usr/bin/env node
/* Builds js/tz-history.js: time zone facts before 1970 that browsers do not have.

   1. hist — the full history before 1970 of the zones where the browser's time zone data (ICU) is wrong. Since 2022
      IANA merges zones that agree after 1970 (Oslo and Stockholm into Berlin, Reykjavik into Abidjan, Amsterdam into
      Brussels…); their older history lives only in "backzone", and ICU in Chrome, Firefox and Node is built without it.
   2. mean — when a zone was still on local mean time (LMT in tzdata). For those years the site takes the mean time of
      the birthplace itself, from its longitude, as astrologers do, instead of the mean time of the city that names the
      zone. A city's mean time that was the legal time of a whole country (Paris 1891–1911, Dublin 1880–1916, Amsterdam
      1909–1937…) stays as it is. The Russian Empire had no legal standard time: there the city mean times of tzdata
      (Moscow, Minsk, Perm, Irkutsk, Tbilisi, Riga, Tallinn…) count as local mean time too, up to the first standard time.

   Needs compiled tzdata built WITH backzone (Debian and Ubuntu tzdata since 2022, ZONEINFO=/usr/share/zoneinfo).
   Run: node tools/build_tz_history.js            → writes js/tz-history.js and prints what differs from ICU */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ZI = process.env.ZONEINFO || '/usr/share/zoneinfo';
globalThis.window = globalThis;
require(path.join(ROOT, 'js', 'data.js'));
const TZS = globalThis.ACG_DATA.tzs;
const END = Date.UTC(1970, 0, 1) / 1000;
const version = (fs.readFileSync(path.join(ZI, 'tzdata.zi'), 'utf8').match(/^# version (\S+)/) || [])[1] || '?';

/* TZif (RFC 8536): the 64-bit block of version 2+ files */
// old names the site keeps (Europe/Kiev, Pacific/Enderbury): the link lines of tzdata.zi give the zone they point to
const LINKS = Object.fromEntries(fs.readFileSync(path.join(ZI, 'tzdata.zi'), 'utf8').split('\n').filter((l) => l.startsWith('L ')).map((l) => l.split(' ').slice(1).reverse()));
const RENAMED = { 'Pacific/Enderbury': 'Pacific/Kanton', ...LINKS };
function readTzif(tz) {
  const f = path.join(ZI, tz), b = fs.readFileSync(fs.existsSync(f) ? f : path.join(ZI, RENAMED[tz] || tz));
  if (b.toString('latin1', 0, 4) !== 'TZif') throw new Error(tz + ': not TZif');
  const counts = (o) => [0, 1, 2, 3, 4, 5].map((k) => b.readUInt32BE(o + 20 + 4 * k));
  let [isut, isstd, leap, timecnt, typecnt, charcnt] = counts(0);
  let o = 44 + timecnt * 5 + typecnt * 6 + charcnt + leap * 8 + isstd + isut;   // skip the 32-bit block
  if (b[4] < 0x32) throw new Error(tz + ': version 1 file');
  [isut, isstd, leap, timecnt, typecnt, charcnt] = counts(o);
  o += 44;
  const times = []; for (let i = 0; i < timecnt; i++) times.push(Number(b.readBigInt64BE(o + 8 * i)));
  o += 8 * timecnt;
  const idx = []; for (let i = 0; i < timecnt; i++) idx.push(b[o + i]);
  o += timecnt;
  const types = [];
  for (let i = 0; i < typecnt; i++) types.push({ off: b.readInt32BE(o + 6 * i), dst: b[o + 6 * i + 4], ai: b[o + 6 * i + 5] });
  o += 6 * typecnt;
  const chars = b.toString('latin1', o, o + charcnt);
  for (const t of types) t.abbr = chars.slice(t.ai, chars.indexOf('\0', t.ai));
  // periods before 1970: the first one is time type 0, from the beginning of time
  const per = [{ s: -Infinity, ...types[0] }];
  for (let i = 0; i < timecnt; i++) {
    if (times[i] >= END) break;
    const t = types[idx[i]], last = per[per.length - 1];
    if (times[i] < -1e11) { per[0] = { s: -Infinity, ...t }; continue; }      // "big bang" entry of fat files
    if (t.off === last.off && t.dst === last.dst && t.abbr === last.abbr) continue;
    per.push({ s: times[i], ...t });
  }
  return per;
}

const fmt = {};
function icuOff(tz, sec) {        // the browser's offset, in seconds (the same arithmetic as ACG.tzOffsetMin)
  const f = fmt[tz] || (fmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', era: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  const p = f.formatToParts(new Date(sec * 1000)), g = (t) => +(p.find((x) => x.type === t) || { value: 0 }).value;
  let y = g('year'); if (/^B/.test((p.find((x) => x.type === 'era') || {}).value || '')) y = 1 - y;
  return (Date.UTC(y, g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) / 1000) - sec;
}
const offAt = (per, sec) => { let k = 0; while (k + 1 < per.length && per[k + 1].s <= sec) k++; return per[k].off; };

const RU_EMPIRE = new Set(['Europe/Moscow', 'Europe/Minsk', 'Europe/Kiev', 'Europe/Kyiv', 'Europe/Zaporozhye', 'Europe/Simferopol', 'Europe/Chisinau', 'Europe/Riga', 'Europe/Tallinn',
  'Europe/Vilnius', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Saratov', 'Europe/Kirov', 'Europe/Astrakhan', 'Europe/Ulyanovsk', 'Asia/Yekaterinburg', 'Asia/Omsk',
  'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Chita', 'Asia/Yakutsk', 'Asia/Vladivostok',
  'Asia/Khandyga', 'Asia/Ust-Nera', 'Asia/Magadan', 'Asia/Sakhalin', 'Asia/Srednekolymsk', 'Asia/Kamchatka', 'Asia/Anadyr', 'Asia/Tbilisi', 'Asia/Baku', 'Asia/Yerevan',
  'Asia/Almaty', 'Asia/Tashkent', 'Asia/Samarkand', 'Asia/Bishkek', 'Asia/Dushanbe', 'Asia/Ashgabat', 'Asia/Qyzylorda', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau',
  'Asia/Oral', 'Asia/Qostanay']);
const hist = {}, mean = {}, report = [];
const FROM = Date.UTC(1800, 0, 1) / 1000;
for (const tz of TZS) {
  let per;
  try { per = readTzif(tz); } catch (e) { report.push(`${tz}: ${e.message}`); continue; }
  // where ICU is wrong: monthly samples and both sides of every transition, 1800–1970
  const probes = [];
  for (let s = FROM; s < END; s += 30.44 * 86400) probes.push(Math.round(s));
  for (const p of per) if (p.s > FROM) probes.push(p.s - 1, p.s + 1);
  let bad = 0, worst = 0;
  for (const s of probes) { const d = Math.abs(icuOff(tz, s) - offAt(per, s)); if (d > 0.5) { bad++; worst = Math.max(worst, d); } }
  if (bad) {
    hist[tz] = per.flatMap((p) => [p.s === -Infinity ? null : p.s, p.off]);
    report.push(`${tz}: ICU differs before 1970 in ${bad} of ${probes.length} probes, up to ${Math.round(worst / 60)} min`);
  }
  // local mean time; in the Russian Empire zones also the mean time of the zone's city (no summer time, not a whole quarter hour)
  const m = [];
  per.forEach((p, k) => {
    if (p.dst) return;
    if (p.abbr !== 'LMT' && !(RU_EMPIRE.has(tz) && p.off % 900 !== 0)) return;
    const e = k + 1 < per.length ? per[k + 1].s : END;
    if (m.length && m[m.length - 1] === p.s) m[m.length - 1] = e; else m.push(p.s === -Infinity ? null : p.s, e);
  });
  if (m.length) mean[tz] = m;
}

const out = `/* Time zone history before 1970 that browsers lack. Generated by tools/build_tz_history.js from tzdata ${version} with backzone; do not edit.
   hist: [start, offset, start, offset, …] in Unix seconds, the first start is the beginning of time (null), valid until 1970.
   mean: [from, to, …] — when the zone was still on a mean time; the site then takes the mean time of the birthplace. */
window.TZ_HISTORY = ${JSON.stringify({ v: version, until: END, hist, mean })};
`;
fs.writeFileSync(path.join(ROOT, 'js', 'tz-history.js'), out);
console.log(report.join('\n'));
console.log(`zones ${TZS.length}; with own history ${Object.keys(hist).length}; with mean time ${Object.keys(mean).length}; ${(out.length / 1024).toFixed(1)} KB`);
