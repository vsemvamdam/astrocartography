// F11 — вкладка «Спорт»
const { test, expect, open } = require('./fixtures');

test('F11-H1 матчи, турниры, карточка матча, фаворит, длительность, составы', async ({ page }) => {
  await open(page, 'sport');
  const rows = page.locator('.sp-row');
  await expect(rows.first()).toBeVisible({ timeout: 30000 });
  const strip = page.getByRole('group', { name: 'Турнир' });
  const ids = await strip.getByRole('button').evaluateAll((b) => b.map((x) => x.dataset.l));
  expect(ids).toEqual(['all', 'eng.1', 'esp.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'nhl']);
  for (const id of ids) {
    await strip.locator(`button[data-l="${id}"]`).click();
    await expect(strip.locator(`button[data-l="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    const txt = await page.locator('#sportView').innerText();
    expect(txt, id).not.toMatch(/NaN|undefined|Infinity/);
  }
  for (const id of ['fra.1', 'nhl']) {
    await strip.locator(`button[data-l="${id}"]`).click();
    await rows.first().click();
    const d = page.locator('#spDetail');
    await expect(d).toBeVisible();
    await expect(d).toContainText(id === 'nhl' ? 'НХЛ' : 'Лига 1');
    await expect(d).toContainText(/I и X дома/);
    await expect(d).toContainText(/Сигнификаторы/);
    const ext = d.locator('#spExtra button');
    expect(await ext.count()).toBe(3);
    const v0 = await d.locator('.hv').innerText();
    await ext.nth(2).click();
    await expect(ext.nth(2)).toHaveAttribute('aria-pressed', 'true');
    // switching the favourite turns the chart around
    const favs = d.locator('.sp-ctl .seg').first().getByRole('button');
    if (await favs.count() === 2) {
      await favs.nth(1).click();
      await expect(favs.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(d.locator('.hv')).not.toBeEmpty();
    }
    await expect(d).toContainText(id === 'nhl' ? /Весь состав команды/ : /состав/i, { timeout: 20000 });
    // on a phone the card replaces the list and has a way back; on a wide screen they stand side by side
    const back = d.getByRole('button', { name: /Все матчи/ });
    if (await back.isVisible()) { await back.click(); await expect(d).toBeHidden(); }
  }
});

test('F11-N1 нет копии данных и ESPN недоступен — понятное сообщение', async ({ page }) => {
  await page.route(/raw\.githubusercontent\.com\/vsemvamdam\/astrocartography\/data\//, (r) => r.fulfill({ status: 404, body: '' }));
  await open(page, 'sport');
  await expect(page.locator('#sportView')).toContainText(/не удалось|нет связи|недоступ|ошибк|ESPN/i, { timeout: 40000 });
});
