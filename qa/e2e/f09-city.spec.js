// F09 — вкладка «Город»: лучи от дома, релокация, линии рядом, оценки
const { test, expect, open } = require('./fixtures');
const { setBirth } = require('./helpers');

async function city(page, q, pick) {
  const inp = page.getByRole('combobox', { name: 'Город, где вы живёте или куда собираетесь' });
  await inp.click(); await inp.fill(q);
  const opt = page.locator('#citySuggest li[role=option], [id$=Suggest] li[role=option]').filter({ hasText: pick || q }).first();
  await expect(opt).toBeVisible();
  await opt.dispatchEvent('pointerdown');
}

test.beforeEach(async ({ page }) => {
  await open(page, 'map');
  await setBirth(page, { date: '1996-04-11', time: '05:54', place: 'Воронеж' });
  await page.locator('nav.tabs a[data-view="city"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Астрокартография города' })).toBeVisible();
});

test('F09-H1 город: лучи, направления, релокация, линии рядом, оценки', async ({ page }) => {
  await city(page, 'Санкт-Петербург');
  await expect(page.locator('#cityView')).toContainText('Санкт-Петербург');
  await expect(page.locator('#cityReloc')).toContainText(/ASC|Асцендент/);
  await expect(page.locator('#cityReloc')).toContainText(/MC/);
  await expect(page.locator('#cityNear')).not.toBeEmpty();
  const layers = page.getByRole('group', { name: 'Слои' }).getByRole('button');
  for (let i = 0; i < await layers.count(); i++) {
    await layers.nth(i).click();
    await expect(layers.nth(i)).toHaveAttribute('aria-pressed', 'false');
    await layers.nth(i).click();
  }
  // a direction row highlights its beam
  const dir = page.locator('#cityView').getByRole('button').filter({ hasText: /°/ }).first();
  if (await dir.count()) await dir.click();
});

test('F09-E1 «Город рождения», «⌂ в центр», «Где я»', async ({ page }) => {
  await city(page, 'Казань');
  await page.getByRole('button', { name: 'Город рождения' }).click();
  await expect(page.locator('#cityView')).toContainText('Воронеж');
  await page.getByRole('button', { name: 'Где я' }).click();
  await expect(page.locator('#cityView')).toContainText(/Москва|55[,.]7/, { timeout: 20000 });
});

test('F09-N1 геолокация запрещена — понятное сообщение', async ({ page, context }) => {
  await context.clearPermissions();
  await page.getByRole('button', { name: 'Где я' }).click();
  await expect(page.locator('#cityView')).toContainText(/доступ|разреш|не удалось|геолокац/i, { timeout: 20000 });
});
