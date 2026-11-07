// Smoke test of the published site with the real network (CDN, Firebase SDK, map tiles, ESPN copy).
// Reads pages as a visitor would; never submits a form or creates an account.
const { test, expect } = require('@playwright/test');

const VIEWS = [['home', 'AstroSky'], ['map', null], ['natal', 'Натальная карта'], ['city', 'Астрокартография города'], ['tools', 'Управители дня и часа'], ['sport', 'Матчи и астропрогноз']];

test('живой сайт: разделы без ошибок, внешние сервисы отвечают', async ({ page }) => {
  const errors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failed.push(`${r.failure() && r.failure().errorText} ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  for (const [v, h1] of VIEWS) {
    await page.goto('#' + v);
    await page.waitForFunction(() => window.Astronomy && window.ACG_APP, null, { timeout: 30000 });
    if (h1) await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
    await page.waitForTimeout(v === 'sport' || v === 'city' ? 6000 : 1500);
  }
  await expect(page.locator('.sp-row').first()).toBeVisible({ timeout: 30000 });
  const src = await page.locator('.sp-src').innerText().catch(() => '');
  // the account dialog loads the real Firebase SDK
  await page.locator('#accBtn').click();
  await expect(page.locator('dialog[open]')).toContainText('Вход');
  await page.waitForFunction(() => window.firebase && window.firebase.apps && window.firebase.apps.length > 0, null, { timeout: 30000 });
  // the town map draws real tiles
  await page.goto('#city');
  await page.waitForTimeout(5000);
  const tiles = await page.locator('.leaflet-tile-loaded').count();
  test.info().annotations.push({ type: 'note', description: JSON.stringify({ sportSource: src, tiles, errors, failed: failed.slice(0, 30) }) });
  expect(tiles, 'тайлы карты города').toBeGreaterThan(0);
  expect(errors, 'ошибки в консоли').toEqual([]);
});
