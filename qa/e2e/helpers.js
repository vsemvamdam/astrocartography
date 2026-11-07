'use strict';
const { expect } = require('@playwright/test');

/* Birth panel: on a phone it is a sheet that has to be opened first. */
async function panel(page) {
  const date = page.locator('#bDate');
  if (!(await date.isVisible())) {
    for (const name of [/Данные рождения/, /Настройки/, /Панель/, /Изменить/]) {
      const b = page.getByRole('button', { name }).first();
      if (await b.isVisible().catch(() => false)) { await b.click(); break; }
    }
  }
  await expect(date).toBeVisible();
}
async function setBirth(page, { date, time, place, pick }) {
  await panel(page);
  if (date) await page.locator('#bDate').fill(date);
  if (time) await page.locator('#bTime').fill(time);
  if (place) {
    const inp = page.locator('#bPlace');
    await inp.click(); await inp.fill(place);
    const opt = page.locator('#suggest li[role=option]').filter({ hasText: pick || place }).first();
    await expect(opt).toBeVisible();
    await opt.dispatchEvent('pointerdown');
  }
  if (date) await expect(page.locator('#utcOut')).toContainText(date.slice(0, 4));
}
/* A cheap fingerprint of what a canvas shows, to see that a toggle changed the picture. */
const canvasHash = (page, sel = '#map') => page.locator(sel).evaluate((c) => {
  const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 0, lit = 0;
  for (let i = 0; i < x.length; i += 97) { h = (h * 31 + x[i]) >>> 0; if (x[i] > 40) lit++; }
  return { h, lit };
});
module.exports = { panel, setBirth, canvasHash };
