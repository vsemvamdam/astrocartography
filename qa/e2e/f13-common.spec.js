// F13 — общие проверки: доступность (axe) на каждом экране, нет библиотеки расчётов
const { test, expect, open, axe } = require('./fixtures');
const { setBirth } = require('./helpers');
const fs = require('fs');
const path = require('path');

const SCREENS = [
  ['главная', 'home', null],
  ['карта мира', 'map', null],
  ['натальная карта', 'natal', null],
  ['соляр', 'natal', async (p) => p.getByRole('group', { name: 'Что показать' }).getByRole('button', { name: 'Соляр' }).click()],
  ['хорар', 'natal', async (p) => p.getByRole('group', { name: 'Что показать' }).getByRole('button', { name: 'Хорар' }).click()],
  ['звёзды', 'natal', async (p) => p.getByRole('group', { name: 'Что показать' }).getByRole('button', { name: 'Звёзды' }).click()],
  ['город', 'city', null],
  ['инструменты', 'tools', null],
  ['нумерология', 'tools', async (p) => p.getByRole('navigation', { name: 'Инструменты' }).getByRole('button', { name: 'Нумерология' }).click()],
  ['биоритмы', 'tools', async (p) => p.getByRole('navigation', { name: 'Инструменты' }).getByRole('button', { name: 'Биоритмы' }).click()],
  ['спорт', 'sport', null],
  ['кабинет', 'map', async (p) => p.locator('#accBtn').click()],
];

for (const [name, hash, then] of SCREENS) {
  test(`F13-E2 доступность: ${name}`, async ({ page }, info) => {
    await open(page, hash);
    if (then) await then(page);
    await page.waitForTimeout(1200);
    const v = await axe(page);
    const out = path.join(__dirname, 'axe');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${info.project.name}-${name}.json`), JSON.stringify(v, null, 1));
    expect(v.map((x) => `${x.id} ×${x.n}: ${x.help} — ${x.nodes.join(' | ')}`)).toEqual([]);
  });
}

test('F13-E4 библиотека расчётов не загрузилась — понятное сообщение', async ({ page }) => {
  await page.route(/astronomy-engine/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/#map');
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).toContainText(/Не загрузилась астрономическая библиотека|Проверьте интернет/);
});

test('F13-E5 одна и та же планета на карте мира и в натале показана одинаково', async ({ page }) => {
  await open(page, 'map');
  await setBirth(page, { date: '1996-04-11', time: '05:54', place: 'Воронеж' });
  const ledger = await page.locator('#planets li').evaluateAll((l) => l.map((x) => x.querySelector('.p-pos') && x.querySelector('.p-pos').firstChild && x.querySelector('.p-pos').firstChild.textContent).filter(Boolean));
  await page.locator('nav.tabs a[data-view="natal"]').click();
  const natal = await page.locator('#natPlanets').innerText();
  const differ = ledger.slice(0, 10).filter((pos) => !natal.includes(pos));
  expect(differ, 'позиции из списка планет на карте, которых нет в таблице натала').toEqual([]);
});
