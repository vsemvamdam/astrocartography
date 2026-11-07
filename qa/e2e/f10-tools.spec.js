// F10 — вкладка «Инструменты»: все 14 инструментов
const { test, expect, open } = require('./fixtures');
const { setBirth } = require('./helpers');

const TOOLS = ['Управители дня и часа', 'Луна без курса', 'Лунные дни', 'Эфемериды', 'Достоинства и альмутен', 'Диспозиторы', 'Арабские жребии',
  'Неподвижные звёзды', 'Тридцатиградусник', 'Профекции', 'Календарь транзитов', 'Циклы жизни', 'Нумерология', 'Биоритмы'];

test.beforeEach(async ({ page }) => {
  await open(page, 'map');
  await setBirth(page, { date: '1996-04-11', time: '05:54', place: 'Воронеж' });
  await page.locator('nav.tabs a[data-view="tools"]').click();
});
const nav = (page) => page.getByRole('navigation', { name: 'Инструменты' });

test('F10-H1 каждый инструмент открывается и показывает результат', async ({ page }) => {
  for (const t of TOOLS) {
    await nav(page).getByRole('button', { name: t }).click();
    await expect(nav(page).getByRole('button', { name: t })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 1, name: t })).toBeVisible();
    const txt = await page.locator('#toolOut').innerText();
    expect(txt.length, t).toBeGreaterThan(80);
    expect(txt, t).not.toMatch(/NaN|undefined|Infinity|\[object/);
  }
});

test('F10-H2 смена даты и места пересчитывает результат', async ({ page }) => {
  const towns = ['Владивосток', 'Калининград', 'Новосибирск'];
  for (const t of ['Управители дня и часа', 'Луна без курса', 'Лунные дни', 'Эфемериды']) {
    await nav(page).getByRole('button', { name: t }).click();
    const a = await page.locator('#toolOut').innerText();
    await page.locator('#toolDate').fill('2031-02-14');
    await page.locator('#toolDate').dispatchEvent('change');
    await expect.poll(() => page.locator('#toolOut').innerText(), { message: t }).not.toBe(a);
    const b = await page.locator('#toolOut').innerText();
    if (t !== 'Эфемериды') {
      const inp = page.locator('#toolPlace');
      await inp.click(); await inp.fill(towns.shift());
      await page.locator('#toolSuggest li[role=option]').first().dispatchEvent('pointerdown');
      await expect.poll(() => page.locator('#toolOut').innerText(), { message: t + ' место' }).not.toBe(b);
    }
    await page.getByRole('button', { name: 'Сегодня' }).click();
  }
});

test('F10-E1 нумерология: кириллица, латиница, ё, дефис, пусто, эмодзи, длинное имя', async ({ page }) => {
  await nav(page).getByRole('button', { name: 'Нумерология' }).click();
  const name = page.getByRole('textbox', { name: /Имя/ }).first();
  const results = {};
  for (const v of ['Анна Иванова', 'Anna Ivanova', 'Алёна Ёлкина', 'Анна-Мария Петрова-Водкина', '', 'Анна 😀🚀', 'А'.repeat(500)]) {
    await name.fill(v);
    await name.press('Enter');
    await page.waitForTimeout(150);
    const txt = await page.locator('#toolOut').innerText();
    expect(txt, JSON.stringify(v.slice(0, 20))).not.toMatch(/NaN|undefined|Infinity/);
    results[v.slice(0, 24)] = (txt.match(/\d+/g) || []).slice(0, 6).join(' ');
  }
  test.info().annotations.push({ type: 'note', description: JSON.stringify(results) });
});

test('F10-E2 биоритмы: один человек, период, семья, критические дни', async ({ page }) => {
  await nav(page).getByRole('button', { name: 'Биоритмы' }).click();
  await expect(page.getByRole('img', { name: 'График биоритмов' })).toBeVisible();
  const span = page.getByRole('group', { name: 'Период' }).getByRole('button');
  for (let i = 0; i < await span.count(); i++) await span.nth(i).click();
  await page.locator('#bioDate').fill('1990-01-01');
  await page.locator('#bioDate').dispatchEvent('change');
  await expect(page.locator('#toolOut')).toContainText(/раньше даты рождения/);
  await page.locator('#bioDate').fill('2026-11-07');
  await page.locator('#bioDate').dispatchEvent('change');
  const who = page.getByRole('group', { name: 'Для кого' }).getByRole('button');
  await who.nth(1).click();
  await expect(page.locator('#toolOut')).toContainText(/сем/i);
  await page.locator('#famAdd').click().catch(() => {});
  expect(await page.locator('#toolOut').innerText()).not.toMatch(/NaN|undefined/);
});

test('F10-E3 биоритмы семьи: добавить людей и скачать PDF', async ({ page }) => {
  await nav(page).getByRole('button', { name: 'Биоритмы' }).click();
  await page.getByRole('group', { name: 'Для кого' }).getByRole('button').nth(1).click();
  // as a person does it: type the name, tap the date field, type the date, tap elsewhere
  for (const [name, date] of [['Анна', '1990-05-17'], ['Пётр', '2015-01-09']]) {
    await page.locator('#famAdd').click();
    await page.getByRole('textbox', { name: 'Имя' }).last().pressSequentially(name);
    await page.getByLabel('Дата рождения').last().click();
    await expect(page.getByLabel('Дата рождения').last(), 'поле даты не потеряло фокус').toBeFocused();
    await page.getByLabel('Дата рождения').last().fill(date);
    await page.getByRole('heading', { name: 'Кто в семье' }).click();
  }
  await expect(page.locator('.fam-birth')).toHaveCount(3);
  expect(await page.locator('.fam-birth').evaluateAll((x) => x.map((i) => i.value))).toEqual(['1996-04-11', '1990-05-17', '2015-01-09']);
  await expect(page.locator('#toolOut')).toContainText('Пётр');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#famPdf').click()]);
  const p = await dl.path();
  const head = require('fs').readFileSync(p).subarray(0, 5).toString();
  expect(head).toBe('%PDF-');
  test.info().annotations.push({ type: 'note', description: `PDF ${dl.suggestedFilename()} ${require('fs').statSync(p).size} байт` });
});
