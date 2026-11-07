// F04–F08 — натальная карта и её режимы: соляр, лунар, совместимость, хорар, звёзды
const { test, expect, open } = require('./fixtures');
const { panel, setBirth } = require('./helpers');

const modes = (page) => page.getByRole('group', { name: 'Что показать' });
async function natal(page, birth = { date: '1996-04-11', time: '05:54', place: 'Воронеж' }) {
  await open(page, 'natal');
  await setBirth(page, birth);
  await expect(page.locator('#natPlanets')).toContainText('Солнце');
}
const cusps = (page) => page.locator('#natHouses').innerText();

test('F04-H1 колесо, планеты, дома, аспекты, стихии, узлы, астероиды', async ({ page }) => {
  await natal(page);
  await expect(page.getByLabel('Колесо натальной карты')).toBeVisible();
  // Sotis: Sun 21°27′50″ Aries, Moon 22°44′08″ Capricorn, ASC in Aries
  await expect(page.locator('#natPlanets')).toContainText('21°27′');
  await expect(page.locator('#natPlanets')).toContainText('22°44′');
  expect(await page.locator('#natHouses tr').count()).toBeGreaterThanOrEqual(12);
  await expect(page.locator('#natAspCount')).toContainText(/\d/);
  await expect(page.locator('#natBalance')).toContainText(/Огонь|огонь/);
  await expect(page.locator('#natSoulCard')).toContainText(/узел/i);
  await expect(page.locator('#natAstCard')).toBeVisible();
});

test('F04-H2 семь систем домов меняют куспиды, «знак = дом» ставит куспиды на 0°', async ({ page }) => {
  await natal(page);
  await panel(page);
  const sel = page.getByRole('combobox', { name: 'Система домов' });
  const opts = await sel.locator('option').evaluateAll((o) => o.map((x) => ({ v: x.value, t: x.textContent })));
  expect(opts.length).toBe(7);
  const seen = new Set();
  for (const o of opts) {
    await sel.selectOption(o.v);
    await page.waitForTimeout(250);
    const t = await cusps(page);
    seen.add(t);
    if (/знак/i.test(o.t)) expect(t.match(/\b0°00′/g).length).toBeGreaterThanOrEqual(12);
  }
  expect(seen.size).toBe(7);
});

test('F04-H3 точки, минорные аспекты, дополнительные астероиды', async ({ page }) => {
  await natal(page);
  await panel(page);
  const n0 = +(await page.locator('#natAspCount').innerText()).match(/\d+/)[0];
  await page.getByRole('button', { name: '+ минорные' }).click();
  await expect.poll(async () => +(await page.locator('#natAspCount').innerText()).match(/\d+/)[0]).toBeGreaterThan(n0);
  await page.getByRole('button', { name: 'Лилит', exact: true }).click();
  await expect(page.locator('#natPlanets')).not.toContainText('Лилит');
  await page.getByRole('button', { name: 'Эрос, Психея и др.' }).click();
  await expect(page.locator('#natPlanets')).toContainText('Психея', { timeout: 20000 });
});

test('F04-H4 расшифровка: четыре раздела', async ({ page }) => {
  await natal(page);
  await page.getByRole('button', { name: 'Расшифровка ↓' }).click();
  const tabs = page.getByRole('group', { name: 'Раздел расшифровки' });
  for (const t of ['Общий портрет', 'Планеты в знаках', 'Планеты в домах', 'Аспекты']) {
    await tabs.getByRole('button', { name: t }).click();
    await expect(tabs.getByRole('button', { name: t })).toHaveAttribute('aria-pressed', 'true');
    expect((await page.locator('#natReadCard').innerText()).length).toBeGreaterThan(300);
  }
});

test('F04-E1 высокие широты: Мурманск и Тромсё в Плацидусе и Кохе', async ({ page }) => {
  for (const [place, date] of [['Мурманск', '1975-07-20'], ['Тромсё', '1985-12-21']]) {
    await natal(page, { date, time: '03:30', place });
    await panel(page);
    for (const v of ['P', 'K']) {
      await page.getByRole('combobox', { name: 'Система домов' }).selectOption(v).catch(() => {});
      await page.waitForTimeout(300);
      const t = await cusps(page);
      expect(t, `${place} ${v}`).not.toMatch(/NaN|undefined|Infinity/);
    }
    test.info().annotations.push({ type: 'note', description: `${place}: ${(await page.locator('#natNote').innerText().catch(() => '')).slice(0, 200)}` });
  }
});

test('F05-H1 соляр: год, город, оценка и лучшие города', async ({ page }) => {
  await natal(page);
  await modes(page).getByRole('button', { name: 'Соляр' }).click();
  await expect(page.locator('#natSolarCard')).toBeVisible();
  await page.locator('#solYear').fill('2027');
  await page.locator('#solYear').dispatchEvent('change');
  const sp = page.locator('#solPlace');
  await sp.click(); await sp.fill('Сочи');
  await page.locator('#solSuggest li[role=option]').first().dispatchEvent('pointerdown');
  await expect(page.locator('#natSolarCard')).toContainText(/Сочи/);
  await expect(page.locator('#natPlanets')).toContainText('Солнце');
  await expect(page.locator('#natPlanets')).toContainText('21°27′');
});

test('F06-H1 лунар: назад, вперёд, на дату', async ({ page }) => {
  await natal(page);
  await modes(page).getByRole('button', { name: 'Лунар' }).click();
  await expect(page.locator('#natLunarCard')).toBeVisible();
  const t0 = await page.locator('#natSub').innerText();
  await page.getByRole('button', { name: 'Следующий лунар' }).click();
  await expect.poll(() => page.locator('#natSub').innerText()).not.toBe(t0);
  await page.getByRole('button', { name: 'Предыдущий лунар' }).click();
  await page.getByRole('button', { name: 'Предыдущий лунар' }).click();
  await page.locator('#lunDate').fill('2030-06-15');
  await page.locator('#lunDate').dispatchEvent('change');
  await expect(page.locator('#natSub')).toContainText(/2030/);
  // the Moon of a lunar return stands on the natal Moon: 22°44′ Capricorn
  await expect(page.locator('#natPlanets')).toContainText('22°44′');
});

test('F07-H1 совместимость: подсказка без партнёра, синастрия и композит с партнёром', async ({ page }) => {
  await natal(page);
  await modes(page).getByRole('button', { name: 'Совместимость' }).click();
  await expect(page.locator('#natalView')).toContainText(/партн/i);
  await panel(page);
  await page.locator('#pName').fill('Маша');
  await page.locator('#pDate').fill('1995-08-12'); await page.locator('#pDate').dispatchEvent('change');
  await page.locator('#pTime').fill('06:04'); await page.locator('#pTime').dispatchEvent('change');
  const pp = page.locator('#pPlace'); await pp.click(); await pp.fill('Рязань');
  await page.locator('#pSuggest li[role=option]').first().dispatchEvent('pointerdown');
  await expect(page.locator('#natPartnerCard')).toBeVisible();
  const syn = page.getByRole('group', { name: 'Вид совместимости' });
  const btns = await syn.getByRole('button').allTextContents();
  expect(btns.length).toBeGreaterThanOrEqual(2);
  for (const b of btns) { await syn.getByRole('button', { name: b }).click(); await page.waitForTimeout(300); }
});

test('F08-H1 хорар: вопрос, дом, момент — суждение', async ({ page }) => {
  await natal(page);
  await modes(page).getByRole('button', { name: 'Хорар' }).click();
  await expect(page.locator('#natHoraryCard')).toBeVisible();
  await page.locator('#horQ').fill('Получу ли я эту работу?');
  await page.locator('#horDate').fill('2026-11-07'); await page.locator('#horDate').dispatchEvent('change');
  await page.locator('#horTime').fill('12:00'); await page.locator('#horTime').dispatchEvent('change');
  const rel = page.locator('#horRel');
  const opts = await rel.locator('option').count();
  expect(opts).toBeGreaterThan(10);
  await rel.selectOption({ index: 9 });
  await expect(page.locator('#horVerdict')).not.toBeEmpty();
  await expect(page.locator('#horSig')).toContainText(/сигнификатор|управител/i);
});

test('F08-E1 звёзды: поиск, категории, сортировка, карта звезды и синастрия с ней', async ({ page }) => {
  await natal(page);
  await modes(page).getByRole('button', { name: 'Звёзды' }).click();
  const list = page.locator('#starList');
  await expect(list.locator('> *').first()).toBeVisible();
  const all = await list.locator('> *').count();
  expect(all).toBeGreaterThan(100);
  await page.locator('#starQ').fill('Эйнш');
  await expect(list).toContainText('Эйнштейн');
  await page.locator('#starQ').fill('Einstein');
  await expect(list).toContainText('Эйнштейн');
  await page.locator('#starQ').fill('');
  const cats = page.getByRole('group', { name: 'Категория' }).getByRole('button');
  const nc = await cats.count();
  for (let i = 0; i < nc; i++) { await cats.nth(i).click(); await page.waitForTimeout(100); }
  await cats.first().click();
  await page.locator('#starSort').selectOption({ index: 1 }).catch(async () => { await page.getByRole('group', { name: 'Порядок' }).getByRole('button').nth(1).click(); });
  await page.locator('#starQ').fill('Эйнштейн');
  await list.locator('button, a, [role=button], li').filter({ hasText: 'Эйнштейн' }).first().click();
  await expect(page.locator('#natStarCard')).toBeVisible();
  await expect(page.locator('#natStarCard')).toContainText(/AA|Родден|источник/i);
  await page.locator('#starSyn').click();
  await expect(page.locator('#natPartnerCard')).toBeVisible();
});
