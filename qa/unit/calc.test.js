/* Calculation regressions found by qa/verify. Each test failed on the site before its fix.
   Run: node --test qa/unit/   (QA_SITE=<checkout> to test another copy of the site) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/site');
const A = S.Astronomy;

const n180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
const near = (a, b, tol, msg) => assert.ok(Math.abs(n180(a - b)) <= tol, `${msg}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
const R = Math.PI / 180;

// Swiss Ephemeris 2.10.03, swe.houses(jd 1985-12-21 11:00 UT, 69.6496, 18.9560)
const SE_TROMSO = {
  O: [336.529, 15.551, 54.572, 93.594, 114.572, 135.551, 156.529, 195.551, 234.572, 273.594, 294.572, 315.551],
  R: [336.529, 286.713, 278.417, 273.594, 268.317, 256.584, 156.529, 106.713, 98.417, 93.594, 88.317, 76.584],
  C: [336.529, 278.615, 275.323, 273.594, 271.809, 268.079, 156.529, 98.615, 95.323, 93.594, 91.809, 88.079],
  E: [336.529, 6.529, 36.529, 66.529, 96.529, 126.529, 156.529, 186.529, 216.529, 246.529, 276.529, 306.529],
  W: [330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300],
};

test('A-01 за полярным кругом Асцендент — восходящая точка (Тромсё, как Swiss Ephemeris)', () => {
  const ch = S.ACG.computeChart(Date.UTC(1985, 11, 21, 11, 0));
  for (const sys of ['P', 'O', 'R', 'C', 'E', 'W']) {
    const n = S.NATAL.computeNatal(ch, 69.6496, 18.9560, { house: sys });
    near(n.asc, 336.529, 0.02, `ASC ${sys}`);
    near(n.mc, 273.594, 0.02, `MC ${sys}`);
    const se = SE_TROMSO[sys === 'P' ? 'O' : sys];
    for (let h = 1; h <= 12; h++) near(n.cusps[h], se[h - 1], 0.02, `${sys} куспид ${h}`);
  }
});

test('A-01 Асцендент всегда на восточной стороне горизонта (69°, 78°, −75° с., сутки по 6 ч 22 мин)', () => {
  for (const [lat, lon] of [[69.65, 18.96], [78.22, 15.65], [-75, 0], [67.5, 33.4], [60, 30], [-45, 170]]) {
    for (let k = 0; k < 96; k++) {
      const ch = S.ACG.computeChart(Date.UTC(1985, 11, 21) + k * 3600e3 * 6.37);
      const n = S.NATAL.computeNatal(ch, lat, lon, { house: 'P' });
      const ra = Math.atan2(Math.sin(n.asc * R) * Math.cos(n.eps * R), Math.cos(n.asc * R)) / R;
      const ha = n180(n.ramc - ra);           // hour angle: negative in the east
      assert.ok(ha < 0, `${lat} ${lon} #${k}: часовой угол ASC ${ha.toFixed(2)}°`);
      // houses still run in order: every cusp inside the circle once
      const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => ((n.cusps[h] - n.cusps[1]) % 360 + 360) % 360);
      for (let h = 1; h < 12; h++) assert.ok(order[h] > order[h - 1], `${lat} #${k}: куспид ${h + 1} не по порядку`);
    }
  }
});

test('B-01 профекции в 97 лет и больше не падают', () => {
  const birth = Date.parse('1879-03-14T10:50:00Z');
  const ch = S.ACG.computeChart(birth);
  const nat = S.NATAL.computeNatal(ch, 48.4011, 9.9876, {});
  const ascSign = Math.floor(nat.asc / 30);
  for (const now of [Date.UTC(1976, 2, 13), Date.UTC(1976, 2, 15), Date.UTC(2026, 10, 7), Date.UTC(2100, 0, 1)]) {
    const p = S.CYCLES.profections(nat, birth, now);
    const age = new Date(now).getUTCFullYear() - 1879 - (now < Date.UTC(new Date(now).getUTCFullYear(), 2, 14, 10, 50) ? 1 : 0);
    assert.equal(p.age, age);
    assert.equal(p.cur.age, age);
    assert.equal(p.cur.sign, (ascSign + age) % 12);
    assert.equal(p.months.length, 12);
    assert.ok(p.cur.from <= now && now < p.cur.to);
  }
});

test('B-02 лунные дни на высоких широтах идут до следующего новолуния', () => {
  for (const [name, lat, lon] of [['Мурманск', 68.9585, 33.0827], ['Норильск', 69.35, 88.2], ['Якутск', 62.03, 129.73], ['Рейкьявик', 64.15, -21.94], ['Москва', 55.75, 37.62]]) {
    for (let m = 0; m < 12; m++) {
      const at = Date.UTC(2026, m, 15);
      const L = S.FEAT.lunarDays(at, { lat, lon });
      // every moonrise between the two new moons starts a day: count them with a plain scan of the altitude
      const obs = new A.Observer(lat, lon, 0);
      let rises = 0, prev = null;
      for (let t = L.newMoon; t < L.nextNewMoon; t += 120000) {
        const tm = A.MakeTime(new Date(t));
        const eq = A.Equator(A.Body.Moon, tm, obs, true, true);
        const alt = A.Horizon(tm, obs, eq.ra, eq.dec, null).altitude;
        const top = alt + Math.asin(1737.4 / (eq.dist * A.KM_PER_AU)) / R + 34 / 60;   // upper limb with refraction, as SearchRiseSet
        if (prev != null && prev < 0 && top >= 0) rises++;
        prev = top;
      }
      const msg = `${name} ${m + 1}.2026`;
      assert.ok(Math.abs(L.days.length - (1 + rises)) <= 1, `${msg}: дней ${L.days.length}, восходов ${rises}`);
      assert.equal(L.days[L.days.length - 1].end, L.nextNewMoon, `${msg}: последний день кончается новолунием`);
      for (let i = 1; i < L.days.length; i++) assert.ok(L.days[i].start > L.days[i - 1].start, `${msg}: день ${i + 1}`);
    }
  }
});

const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';
test('A-02 история поясов до 1970 года, которой нет в браузере (backzone)', () => {
  const L = S.ACG.localToUtc;
  assert.equal(iso(L(1960, 7, 15, 12, 0, 'Europe/Oslo').utc), '1960-07-15T10:00:00Z');          // летнее время 1959–1965
  assert.equal(iso(L(1955, 1, 15, 12, 0, 'Atlantic/Reykjavik').utc), '1955-01-15T13:00:00Z');   // UTC−1 до 1968
  assert.equal(iso(L(1947, 6, 1, 12, 0, 'Europe/Stockholm').utc), '1947-06-01T11:00:00Z');      // без летнего времени
  assert.equal(iso(L(1930, 1, 15, 12, 0, 'Europe/Amsterdam').utc), '1930-01-15T11:40:28Z');     // амстердамское время +0:19:32
  assert.equal(S.ACG.tzOffsetMin('Europe/Oslo', Date.UTC(1960, 6, 15, 10)), 120);
  // после 1970 года — как в браузере
  assert.equal(iso(L(1996, 4, 11, 5, 54, 'Europe/Moscow').utc), '1996-04-11T01:54:00Z');
  assert.equal(iso(L(2026, 7, 1, 12, 0, 'Europe/Oslo').utc), '2026-07-01T10:00:00Z');
});

test('A-03 до поясного времени — местное среднее время места рождения', () => {
  const L = S.ACG.localToUtc;
  const ulm = L(1879, 3, 14, 11, 30, 'Europe/Berlin', null, 9.9876);
  assert.equal(ulm.source, 'lmt');
  assert.equal(iso(ulm.utc), '1879-03-14T10:50:03Z');                                          // как astro.com
  assert.equal(iso(L(1900, 6, 1, 12, 0, 'Europe/Moscow', null, 39.2).utc), '1900-06-01T09:23:12Z');   // Воронеж +2:36:48
  assert.equal(iso(L(1880, 1, 1, 12, 0, 'America/New_York', null, -87.65).utc), '1880-01-01T17:50:36Z'); // Чикаго
  // среднее время города, которое было законным временем всей страны, остаётся: Марсель 1900 — парижское время +0:09:21
  const mrs = L(1900, 6, 1, 12, 0, 'Europe/Paris', null, 5.37);
  assert.equal(mrs.source, 'tz');
  assert.equal(iso(mrs.utc), '1900-06-01T11:50:39Z');
  assert.equal(L(1910, 6, 1, 12, 0, 'Europe/Kiev', null, 35.05).source, 'lmt');                  // Днепр, Российская империя
  // после введения поясов долгота не важна
  assert.equal(L(1996, 4, 11, 5, 54, 'Europe/Moscow', null, 39.2).source, 'tz');
  assert.equal(iso(L(1930, 1, 15, 12, 0, 'Asia/Kolkata', null, 72.88).utc), '1930-01-15T06:30:00Z');
  assert.equal(L(1950, 6, 1, 12, 0, 'Asia/Kathmandu', null, 85.3).source, 'tz');              // +5:30, уже поясное
});

test('A-08 двойное и несуществующее время — одно правило везде', () => {
  const L = S.ACG.localToUtc;
  const msk = L(2010, 10, 31, 2, 30, 'Europe/Moscow'), ny = L(2010, 11, 7, 1, 30, 'America/New_York');
  assert.ok(msk.ambiguous && ny.ambiguous);
  assert.equal(iso(msk.utc), '2010-10-30T22:30:00Z');            // первое, ещё летнее
  assert.equal(iso(ny.utc), '2010-11-07T05:30:00Z');             // первое, ещё летнее
  const ber = L(2026, 3, 29, 2, 30, 'Europe/Berlin'), msk2 = L(2010, 3, 28, 2, 30, 'Europe/Moscow'), nyg = L(2010, 3, 14, 2, 30, 'America/New_York');
  assert.ok(ber.gap && msk2.gap && nyg.gap);
  assert.equal(iso(ber.utc), '2026-03-29T01:30:00Z');
  assert.equal(iso(msk2.utc), '2010-03-27T23:30:00Z');
  assert.equal(iso(nyg.utc), '2010-03-14T07:30:00Z');
  const plain = L(2010, 7, 1, 12, 0, 'Europe/Moscow');
  assert.ok(!plain.gap && !plain.ambiguous);
});

test('A-04 параны у широты, где планета перестаёт восходить, не теряются', () => {
  const P = S.ACG.computeParans(S.ACG.computeChart(Date.parse('1996-04-11T01:54:00Z')));
  const has = (a, ea, b, eb, lat) => P.some((p) => p.A.id === a && p.ea === ea && p.B.id === b && p.eb === eb && Math.abs(p.lat - lat) < 0.01);
  assert.ok(has('Sun', 'ASC', 'Mars', 'MC', -81.567), 'Солнце ASC / Марс MC на −81,567°');
  assert.ok(has('Moon', 'ASC', 'Venus', 'DSC', 64.719), 'Луна ASC / Венера DSC на 64,719°');
});

test('A-05 Хирон и астероиды есть весь 2100 год и 1 января 1800 года', () => {
  // Swiss Ephemeris 2.10.03, seas_18
  const SE = { '2100-12-31T23:00:00Z': { Chiron: 254.0436, Ceres: 154.8704, Pallas: 23.5212, Juno: 314.1288, Vesta: 188.094 },
    '2100-06-01T00:00:00Z': { Chiron: 242.9981, Ceres: 81.6465, Pallas: 20.7263, Juno: 298.9458, Vesta: 98.8126 } };
  const ALL = ['Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta', 'Eros', 'Psyche', 'Amor', 'Hygiea', 'Proserpina'];
  for (const t of ['2100-12-31T23:00:00Z', '2100-06-01T00:00:00Z', '1800-01-01T00:00:00Z']) {
    const ch = S.ACG.computeChart(Date.parse(t));
    for (const id of ALL) assert.ok(ch.bodies.some((b) => b.id === id), `${t}: нет ${id}`);
    for (const [id, lon] of Object.entries(SE[t] || {})) near(ch.bodies.find((b) => b.id === id).elon, lon, 0.005, `${t} ${id}`);
  }
});

test('B-03 календарь транзитов: проходы одного транзита — по смене направления', () => {
  const nat = S.NATAL.computeNatal(S.ACG.computeChart(Date.parse('1996-04-11T01:54:00Z')), 51.6720, 39.1843, {});
  const pts = nat.points.filter((p) => p.planet).map((p) => ({ id: p.id, lon: p.lon, ru: p.ru }));
  const hits = S.CYCLES.transitCalendar(pts, Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1), ['Mars']);
  const mm = hits.filter((h) => h.natal.id === 'Mercury' && h.asp === 120);
  assert.ok(mm.length, 'Марс △ Меркурий в 2026 году');
  for (const h of mm) assert.equal(h.passes, 3, `Марс △ Меркурий ${new Date(h.t).toISOString().slice(0, 10)}: проходов ${h.passes}`);   // 12.12.2026, 06.02.2027, 28.05.2027
  // Венера ☌ Уран у Эйнштейна: два разных транзита, а не два прохода одного
  const ein = S.NATAL.computeNatal(S.ACG.computeChart(Date.parse('1879-03-14T10:50:03Z')), 48.4011, 9.9876, {});
  const ep = ein.points.filter((p) => p.planet).map((p) => ({ id: p.id, lon: p.lon, ru: p.ru }));
  const vu = S.CYCLES.transitCalendar(ep, Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1), ['Venus']).filter((h) => h.natal.id === 'Uranus' && h.asp === 0);
  for (const h of vu) assert.equal(h.passes, 1, `Венера ☌ Уран ${new Date(h.t).toISOString().slice(0, 10)}`);
});

test('B-05 хорар: единица срока по Фроули (знак и дом вместе)', () => {
  const U = S.HORARY.timingUnit;   // 0 короткая, 1 средняя, 2 длинная
  assert.equal(U(1, 10), 2, 'Телец (фиксированный) в X (угловом) — самая длинная');
  assert.equal(U(0, 12), 0, 'Овен (кардинальный) в XII (падающем) — самая короткая');
  assert.equal(U(0, 1), 1, 'кардинальный в угловом — средняя');
  assert.equal(U(4, 9), 1, 'фиксированный в падающем — средняя');
  assert.equal(U(2, 11), 1, 'мутабельный в последующем — средняя');
  assert.equal(U(2, 3), 1, 'мутабельный в падающем — средняя');
});

test('A-10 средний узел и Лилит — на истинное равноденствие даты, как планеты (Swiss Ephemeris)', () => {
  const SE = [['1996-04-11T01:54:00Z', 197.0852, 111.81789], ['2026-11-07T00:00:00Z', 325.75576, 275.94743], ['1850-06-01T12:00:00Z', 138.1748, 296.8739]];
  for (const [t, node, lil] of SE) {
    const ch = S.ACG.computeChart(Date.parse(t), { node: 'mean' });
    near(ch.bodies.find((b) => b.id === 'Node').elon, node, 3 / 3600, `${t} средний узел`);
    near(S.NATAL.lilithLon(S.Astronomy.MakeTime(new Date(t))), lil, 3 / 3600, `${t} Лилит`);
  }
});
