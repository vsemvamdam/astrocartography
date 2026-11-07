// F01 — главная страница и переходы между разделами
const { test, expect, open } = require('./fixtures');

test('F01-H1 главная открывается, разделы и логотип ведут куда надо', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: 'AstroSky' })).toBeVisible();
  for (const [view, hash, h1] of [['map', '#map', null], ['natal', '#natal', 'Натальная карта'], ['city', '#city', 'Астрокартография города'],
    ['tools', '#tools', 'Управители дня и часа'], ['sport', '#sport', 'Матчи и астропрогноз']]) {
    await page.locator(`nav.tabs a[data-view="${view}"]`).click();
    await expect(page).toHaveURL(new RegExp(hash + '$'));
    if (h1) await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
  }
  await page.getByRole('link', { name: 'AstroSky — на главную' }).click();
  await expect(page).toHaveURL(/#home$/);
  await expect(page.getByRole('heading', { level: 1, name: 'AstroSky' })).toBeVisible();
});

test('F01-H2 плитки разделов на главной открывают свои разделы', async ({ page }) => {
  await open(page);
  const tiles = page.locator('#homeOut a[href]');
  const n = await tiles.count();
  expect(n).toBeGreaterThan(10);
  const hrefs = await tiles.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const h of [...new Set(hrefs)]) {
    await open(page);
    await page.locator(`#homeOut a[href="${h}"]`).first().click();
    await page.waitForTimeout(300);
    // every tile leads to a visible section, never to an empty page
    const visible = await page.evaluate(() => [...document.querySelectorAll('main section, section')].some((s) => !s.hidden && s.offsetHeight > 200 && s.id !== 'homeView'));
    expect(visible, `плитка ${h}`).toBe(true);
  }
});

test('F01-E1 «назад» и «вперёд» переключают разделы', async ({ page }) => {
  await open(page, 'natal');
  await page.locator('nav.tabs a[data-view="tools"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Управители дня и часа' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Натальная карта' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'Управители дня и часа' })).toBeVisible();
});

test('F01-E2 ни один раздел не прокручивается по горизонтали', async ({ page }) => {
  for (const v of ['home', 'map', 'natal', 'city', 'tools', 'sport']) {
    await open(page, v);
    await page.waitForTimeout(800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `раздел ${v}`).toBeLessThanOrEqual(0);
  }
});
