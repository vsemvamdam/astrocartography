// F12 — личный кабинет на заглушке Firebase (никаких настоящих аккаунтов)
const { test, expect, open } = require('./fixtures');
const { setBirth } = require('./helpers');

const dlg = (page) => page.locator('dialog[open]');
async function openAcc(page) {
  await page.locator('#accBtn').click();
  await expect(dlg(page)).toBeVisible();
}
async function register(page, email = 'anna@example.com', pass = 'secret123') {
  await openAcc(page);
  await dlg(page).getByRole('button', { name: 'Зарегистрироваться' }).click();
  await dlg(page).getByLabel('Имя (необязательно)').fill('Анна');
  await dlg(page).getByLabel('Почта').fill(email);
  await dlg(page).getByLabel('Придумайте пароль').fill(pass);
  await dlg(page).getByLabel('Повторите пароль').fill(pass);
  await dlg(page).getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(dlg(page).getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await open(page, 'map');
  await setBirth(page, { date: '1996-04-11', time: '05:54', place: 'Воронеж' });
});

test('F12-H1 регистрация, подтверждение, выход, вход', async ({ page }) => {
  await register(page);
  await expect(dlg(page)).toContainText('Аккаунт создан');
  await expect(dlg(page)).toContainText('Почта не подтверждена');
  await dlg(page).getByRole('button', { name: /Отправить/ }).first().click();
  await expect(dlg(page)).toContainText('Письмо отправлено');
  await page.evaluate(() => window.__fb.verify('anna@example.com'));
  await dlg(page).getByRole('button', { name: 'Я подтвердил(а)' }).click();
  await expect(dlg(page)).toContainText('Почта подтверждена');
  await dlg(page).getByRole('button', { name: /Выйти/ }).click();
  await expect(dlg(page)).toContainText('Вы вышли из аккаунта');
  await dlg(page).getByLabel('Почта').fill('anna@example.com');
  await dlg(page).getByLabel('Пароль').fill('secret123');
  await dlg(page).getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dlg(page).getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
});

test('F12-H2 сохранить карту, открыть, как партнёра, удалить', async ({ page }) => {
  await register(page);
  await dlg(page).getByLabel('Название карты').fill('Воронеж 96');
  await dlg(page).getByRole('button', { name: /Сохранить/ }).first().click();
  await expect(dlg(page)).toContainText('Карта сохранена');
  await expect(dlg(page).locator('#accCharts')).toContainText('Воронеж 96');
  await dlg(page).getByRole('button', { name: 'Закрыть' }).click();
  await setBirth(page, { date: '2000-01-01', time: '12:00', place: 'Лондон' });
  await openAcc(page);
  await dlg(page).getByRole('button', { name: 'Открыть' }).first().click();
  await expect(page.locator('#bDate')).toHaveValue('1996-04-11');
  await expect(page.locator('#utcOut')).toHaveText('11.04.1996 01:54 UTC');
  await openAcc(page);
  await dlg(page).getByRole('button', { name: /Как партн/ }).first().click();
  await expect(page).toHaveURL(/#natal$/);
  await expect(page.locator('#natPartnerCard')).toBeVisible();
  await openAcc(page);
  page.once('dialog', (d) => d.accept());
  await dlg(page).getByRole('button', { name: /Удалить/ }).first().click();
  await expect(dlg(page).locator('#accCharts')).toContainText('Пока пусто');
});

test('F12-H3 восстановление и смена пароля', async ({ page }) => {
  await register(page);
  await dlg(page).getByRole('button', { name: 'Сменить пароль' }).click();
  await dlg(page).getByLabel('Текущий пароль').fill('wrong-one');
  await dlg(page).getByLabel('Новый пароль', { exact: true }).fill('newsecret1');
  await dlg(page).getByLabel('Повторите новый пароль').fill('newsecret1');
  await dlg(page).getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(dlg(page)).toContainText('Неверная почта или пароль');
  await dlg(page).getByLabel('Текущий пароль').fill('secret123');
  await dlg(page).getByLabel('Новый пароль', { exact: true }).fill('newsecret1');
  await dlg(page).getByLabel('Повторите новый пароль').fill('newsecret1');
  await dlg(page).getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(dlg(page)).toContainText('Пароль изменён');
  await dlg(page).getByRole('button', { name: /Выйти/ }).click();
  await dlg(page).getByRole('button', { name: 'Забыли пароль?' }).click();
  await dlg(page).getByLabel('Почта').fill('anna@example.com');
  await dlg(page).getByRole('button', { name: 'Отправить ссылку' }).click();
  await expect(dlg(page)).toContainText('пришло письмо');
});

test('F12-N1 ошибки: почта, короткий и разные пароли, неверный пароль, занятая почта, нет сети', async ({ page }) => {
  await register(page);
  await dlg(page).getByRole('button', { name: /Выйти/ }).click();
  await dlg(page).getByRole('button', { name: 'Зарегистрироваться' }).click();
  const f = dlg(page);
  const fill = async (email, p1, p2) => {
    await f.getByLabel('Почта').fill(email); await f.getByLabel('Придумайте пароль').fill(p1); await f.getByLabel('Повторите пароль').fill(p2);
    await f.getByRole('button', { name: 'Создать аккаунт' }).click();
  };
  await fill('anna@example', 'secret123', 'secret123');
  await expect(f).toContainText('Проверьте адрес почты');
  await fill('anna@example.com', '123', '123');
  await expect(f).toContainText('не короче 6 символов');
  await fill('anna@example.com', 'secret123', 'secret124');
  await expect(f).toContainText('Пароли не совпадают');
  await fill('anna@example.com', 'secret123', 'secret123');
  await expect(f).toContainText('уже зарегистрирован');
  await f.getByRole('button', { name: 'Уже есть аккаунт? Войти' }).click();
  await f.getByLabel('Почта').fill('anna@example.com');
  await f.getByLabel('Пароль').fill('nope-nope');
  await f.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(f).toContainText('Неверная почта или пароль');
  await page.evaluate(() => window.__fb.fail('auth/network-request-failed'));
  await f.getByLabel('Пароль').fill('secret123');
  await f.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(f).toContainText('Нет связи с сервером');
});

test('F12-H4 вход через Google (заглушка)', async ({ page }) => {
  await openAcc(page);
  await dlg(page).getByRole('button', { name: 'Войти через Google' }).click();
  await expect(dlg(page).getByRole('heading', { name: 'Личный кабинет' })).toBeVisible();
  await expect(dlg(page)).toContainText('Вход через Google');
});
