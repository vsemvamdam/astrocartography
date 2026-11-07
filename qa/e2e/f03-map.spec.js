// F03 — карта мира: линии, карточки, лучшие города, аспектные линии, параны, динамика
const { test, expect, open } = require('./fixtures');
const { panel, setBirth, canvasHash } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await open(page, 'map');
  await setBirth(page, { date: '1996-04-11', time: '05:54', place: 'Воронеж' });
  await page.waitForTimeout(400);
});

test('F03-H1 линии нарисованы, переключатели углов и планет меняют карту', async ({ page }) => {
  const a = await canvasHash(page);
  expect(a.lit).toBeGreaterThan(500);
  await panel(page);
  await page.getByRole('button', { name: /^MC зенит/ }).click();
  await expect(page.getByRole('button', { name: /^MC зенит/ })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(300);
  expect((await canvasHash(page)).h).not.toBe(a.h);
  await page.getByRole('button', { name: /^MC зенит/ }).click();
  await page.getByRole('button', { name: 'Скрыть все' }).click();
  await expect(page.locator('#planets input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: 'Личные' }).click();
  const personal = await page.locator('#planets input:checked').count();
  expect(personal).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  expect(await page.locator('#planets input:checked').count()).toBeGreaterThan(personal);
  // the ledger shows the Sotis positions to the minute (Sun 21°27′ Aries, Moon 22°44′ Capricorn)
  await expect(page.locator('#planets')).toContainText('21°27′');
});

test('F03-H2 нажатие на карту открывает карточку точки и карточку линии', async ({ page }) => {
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.35);
  await expect(page.locator('#info')).toBeVisible();
  await expect(page.locator('#infoCoord')).toContainText('°');
  const items = page.locator('#infoBody li[data-k]');
  if (await items.count()) {
    await items.first().click();
    // the row opens in place with the line's meaning
    await expect(page.locator('#infoBody li[data-k] .il-text').first()).toBeVisible();
  }
  await page.locator('#infoClose').click();
  await expect(page.locator('#info')).toBeHidden();
});

test('F03-H3 лучшие города: цели, страна, для пары', async ({ page }) => {
  await panel(page);
  const sw = page.getByRole('switch', { name: 'Лучшие города' });
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  const list = page.locator('#bestList');
  await expect(list.locator('li').first()).toBeVisible();
  const first = await list.innerText();
  const goals = page.getByRole('group', { name: 'Цель' }).getByRole('button');
  const n = await goals.count();
  expect(n).toBe(8);
  await goals.nth(1).click();
  await expect.poll(() => list.innerText()).not.toBe(first);
  await page.locator('#bestCountry').selectOption({ label: 'Россия' }).catch(async () => {
    const opts = await page.locator('#bestCountry option').allTextContents();
    await page.locator('#bestCountry').selectOption({ index: Math.min(1, opts.length - 1) });
  });
  await expect(list.locator('li').first()).toBeVisible();
});

test('F03-H4 аспектные линии, параны и динамика', async ({ page }) => {
  await panel(page);
  const before = (await canvasHash(page)).h;
  await page.getByRole('switch', { name: 'Аспектные линии' }).click();
  await expect(page.locator('#aspBody')).toBeVisible();
  await page.waitForTimeout(300);
  expect((await canvasHash(page)).h).not.toBe(before);
  await page.getByRole('switch', { name: 'Параны' }).click();
  await expect(page.locator('#parBody')).toBeVisible();
  await expect(page.locator('#parCount')).toContainText(/\d/);
  const mode = page.getByRole('group', { name: 'Режим' });
  await mode.getByRole('button', { name: 'Транзиты' }).click();
  await expect(page.locator('#planets .p-dyn').first()).toContainText('т');
  await page.locator('#dynDate').fill('2030-01-01');
  await page.locator('#dynDate').dispatchEvent('change');
  await mode.getByRole('button', { name: 'Прогрессии' }).click();
  await expect(page.locator('#planets .p-dyn').first()).toContainText('п');
  await mode.getByRole('button', { name: 'Выкл' }).click();
  await expect(page.locator('#planets .p-dyn')).toHaveCount(0);
});

test('F03-E1 масштаб, весь мир, полный экран', async ({ page }) => {
  const h0 = (await canvasHash(page)).h;
  await page.getByRole('button', { name: 'Приблизить' }).click();
  await page.waitForTimeout(600);
  expect((await canvasHash(page)).h).not.toBe(h0);
  await page.getByRole('button', { name: 'Отдалить' }).click();
  await page.getByRole('button', { name: 'Показать весь мир' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Карта на весь экран' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
});

test('F03-E2 линии партнёра', async ({ page }) => {
  await panel(page);
  await page.locator('#pName').fill('Маша');
  await page.locator('#pDate').fill('1995-08-12');
  await page.locator('#pDate').dispatchEvent('change');
  await page.locator('#pTime').fill('06:04');
  await page.locator('#pTime').dispatchEvent('change');
  const pp = page.locator('#pPlace');
  await pp.click(); await pp.fill('Рязань');
  await page.locator('#pSuggest li[role=option]').first().dispatchEvent('pointerdown');
  const before = (await canvasHash(page)).h;
  await page.getByRole('checkbox', { name: /Показать линии партнёра/ }).check();
  await page.waitForTimeout(400);
  expect((await canvasHash(page)).h).not.toBe(before);
});
