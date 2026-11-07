// F02 — данные рождения: дата, время, город, часовой пояс
const { test, expect, open } = require('./fixtures');

// on a phone the birth form sits in a panel that has to be opened first
async function form(page) {
  const date = page.locator('#bDate');
  if (!(await date.isVisible())) {
    const b = page.getByRole('button', { name: /Данные|Изменить|Настройки|Панель/ }).first();
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await expect(date).toBeVisible();
  return { date, time: page.locator('#bTime'), place: page.locator('#bPlace') };
}
async function setPlace(page, q, pick) {
  const { place } = await form(page);
  await place.click();
  await place.fill(q);
  const opt = page.locator('#suggest li[role=option]').filter({ hasText: pick || q }).first();
  await expect(opt).toBeVisible();
  await opt.dispatchEvent('pointerdown');
}
const utcText = (page) => page.locator('#utcOut').textContent();

test('F02-H1 дата, время и город пересчитывают карту и часовой пояс', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  await f.date.fill('1996-04-11');
  await f.time.fill('05:54');
  await setPlace(page, 'Воронеж');
  await expect(page.locator('#tzName')).toHaveText('Europe/Moscow');
  await expect(page.locator('#tzOffset')).toHaveText('UTC+04:00');
  await expect(page.locator('#utcOut')).toHaveText('11.04.1996 01:54 UTC');
  // the planets ledger follows (Sotis: Sun 21°27′ Aries)
  await expect(page.locator('#planets')).toContainText('Овен');
});

test('F02-E1 поиск города: английский, ё, диакритика, неизвестный город, координаты', async ({ page }) => {
  await open(page, 'map');
  await setPlace(page, 'Voronezh', 'Воронеж');
  await expect(page.locator('#bPlace')).toHaveValue(/Воронеж/);
  await setPlace(page, 'Орёл', 'Орёл');
  await expect(page.locator('#bPlace')).toHaveValue(/Орёл/);
  await setPlace(page, 'Орел', 'Орёл');
  await expect(page.locator('#bPlace')).toHaveValue(/Орёл/);
  await setPlace(page, 'Zürich', 'Цюрих');
  await expect(page.locator('#tzName')).toHaveText('Europe/Zurich');
  // most people type Latin names without diacritics
  for (const [q, ru] of [['Zurich', 'Цюрих'], ['Sao Paulo', 'Сан-Паулу'], ['Reykjavik', 'Рейкьявик'], ['Tromso', 'Тромсё']]) await setPlace(page, q, ru);
  const { place } = await form(page);
  await place.fill('Ыгыдым-на-Луне');
  await expect(page.locator('#suggest')).toContainText('Не нашли такой город');
  await place.fill('52.3, 104.2');
  await page.locator('#suggest li[role=option]').first().dispatchEvent('pointerdown');
  await expect(page.locator('#tzName')).toHaveText('Asia/Irkutsk');
});

test('F02-E2 несуществующее и двойное местное время', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  await setPlace(page, 'Берлин');
  // 29.03.2026 02:30 does not exist in Berlin (clocks jump 02:00 → 03:00)
  await f.date.fill('2026-03-29'); await f.time.fill('02:30');
  await expect(page.locator('#utcOut')).toContainText('2026');
  const gap = await utcText(page);
  // 31.10.2010 02:30 happened twice in Moscow (03:00 → 02:00)
  await setPlace(page, 'Москва');
  await f.date.fill('2010-10-31'); await f.time.fill('02:30');
  await expect(page.locator('#utcOut')).toContainText('2010');
  const twice = await utcText(page);
  test.info().annotations.push({ type: 'note', description: `Берлин 29.03.2026 02:30 → ${gap}; Москва 31.10.2010 02:30 → ${twice}` });
  expect(gap).toMatch(/29\.03\.2026 0[01]:30 UTC/);
  expect(twice).toMatch(/30\.10\.2010 2[23]:30 UTC/);
});

test('F02-E7 несуществующее и двойное время: одно правило и подсказка (A-08)', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  const note = page.locator('#tzNote');
  await setPlace(page, 'Берлин');
  await f.date.fill('2026-03-29'); await f.time.fill('02:30');
  await expect(page.locator('#utcOut')).toHaveText('29.03.2026 01:30 UTC');
  await expect(note).toBeVisible(); await expect(note).toContainText('такого времени на часах не было');
  await setPlace(page, 'Москва');
  await f.date.fill('2010-10-31'); await f.time.fill('02:30');
  await expect(page.locator('#utcOut')).toHaveText('30.10.2010 22:30 UTC');       // первое, ещё летнее
  await expect(note).toContainText('было дважды');
  await setPlace(page, 'Нью-Йорк');
  await f.date.fill('2010-11-07'); await f.time.fill('01:30');
  await expect(page.locator('#utcOut')).toHaveText('07.11.2010 05:30 UTC');       // тоже первое
  await f.date.fill('2010-07-01'); await f.time.fill('12:00');
  await expect(page.locator('#utcOut')).toHaveText('01.07.2010 16:00 UTC');
  await expect(note).toBeHidden();
});

test('F02-E8 старые даты: история поясов до 1970 и местное среднее время (A-02, A-03)', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  await setPlace(page, 'Осло');
  await f.date.fill('1960-07-15'); await f.time.fill('12:00');
  await expect(page.locator('#utcOut')).toHaveText('15.07.1960 10:00 UTC');       // летнее время Норвегии 1959–1965
  await expect(page.locator('#tzOffset')).toHaveText('UTC+02:00');
  await setPlace(page, 'Ульм');
  await f.date.fill('1879-03-14'); await f.time.fill('11:30');
  await expect(page.locator('#utcOut')).toHaveText('14.03.1879 10:50 UTC');       // как у astro.com
  await expect(page.locator('#tzOffset')).toHaveText('UTC+00:40');                // 10° в. д.: 4 минуты на градус
  await expect(page.locator('#tzNote')).toContainText('местное среднее время');
  await setPlace(page, 'Воронеж');
  await f.date.fill('1996-04-11'); await f.time.fill('05:54');
  await expect(page.locator('#utcOut')).toHaveText('11.04.1996 01:54 UTC');
  await expect(page.locator('#tzNote')).toBeHidden();
});

test('F02-E3 ручное смещение часового пояса', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  await f.date.fill('1879-03-14'); await f.time.fill('11:30');
  await setPlace(page, 'Ульм', 'Ульм').catch(async () => setPlace(page, 'Ulm'));
  await page.getByRole('checkbox', { name: 'Задать смещение вручную' }).check();
  const sel = page.getByRole('combobox', { name: 'Смещение от UTC' });
  await expect(sel).toBeVisible();
  const opts = await sel.locator('option').allTextContents();
  expect(opts.length).toBeGreaterThan(20);
  await sel.selectOption({ index: opts.findIndex((t) => /\+0?1:00/.test(t)) });
  await expect(page.locator('#tzName')).toHaveText('вручную');
  await expect(page.locator('#utcOut')).toHaveText('14.03.1879 10:30 UTC');
});

test('F02-E4 широта и долгота вручную, с запятой и вне пределов', async ({ page }) => {
  await open(page, 'map');
  await form(page);
  const lat = page.getByRole('textbox', { name: 'Широта' }), lon = page.getByRole('textbox', { name: 'Долгота' });
  await lat.fill('55,75'); await lat.press('Enter');
  await lon.fill('37,62'); await lon.press('Enter');
  await expect(page.locator('#placeCoords')).toContainText('55°45′ с.ш.');
  await expect(page.locator('#placeCoords')).toContainText('37°37′ в.д.');
  await lat.fill('95'); await lat.press('Enter');
  await expect(lat).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#placeCoords')).toContainText('55°45′ с.ш.');
});

test('F02-E5 границы дат: 1800 и 2100 считаются, 1799 и 2101 — понятное сообщение', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  for (const d of ['1800-01-01', '2100-12-31']) {
    await f.date.fill(d);
    await expect(page.locator('#status')).toBeHidden();
    await expect(page.locator('#utcOut')).toContainText(d.slice(0, 4));
  }
  await f.date.fill('1799-12-31');
  await expect(page.locator('#status')).toHaveText(/между 1800 и 2100/);
  await f.date.fill('2101-01-01');
  await expect(page.locator('#status')).toHaveText(/между 1800 и 2100/);
});

test('F02-E6 данные сохраняются после перезагрузки', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  await f.date.fill('1988-12-07'); await f.time.fill('11:41');
  await setPlace(page, 'Ереван');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.ACG_APP);
  const g = await form(page);
  await expect(g.date).toHaveValue('1988-12-07');
  await expect(g.time).toHaveValue('11:41');
  await expect(g.place).toHaveValue(/Ереван/);
  await expect(page.locator('#utcOut')).toHaveText('07.12.1988 07:41 UTC');
});

test('F02-N1 пустые дата и время — подсказка, без падения', async ({ page }) => {
  await open(page, 'map');
  const f = await form(page);
  await f.date.fill('');
  await expect(page.locator('#status')).toHaveText(/Укажите дату/);
  await f.date.fill('2000-01-01');
  await f.time.fill('');
  await expect(page.locator('#status')).toHaveText(/Укажите время/);
});

test('F02-E9 поля партнёра называются иначе, чем свои (UI-08)', async ({ page }) => {
  await open(page, 'map');
  await form(page);
  for (const [f, own, partner] of [['Date', 'Дата', 'Дата рождения партнёра'], ['Time', 'Местное время', 'Местное время рождения партнёра'], ['Place', 'Место рождения', 'Место рождения партнёра']]) {
    await expect(page.locator(`#b${f}`)).toHaveAccessibleName(own);
    await expect(page.locator(`#p${f}`)).toHaveAccessibleName(partner);
  }
});
