const { test, expect } = require('@playwright/test');

test('host can complete a full round with three bots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '拱猪', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建房间' }).click();
  await expect(page.getByText('gongzhu-v1')).toBeVisible();
  await page.getByRole('button', { name: 'AI 补位并开始' }).click();
  await expect(page.getByRole('heading', { name: '选择要亮的牌' })).toBeVisible();
  await page.getByRole('button', { name: /不亮|确认亮/ }).click();
  await expect(page.getByText(/轮到你出牌|等待 .* 出牌/)).toBeVisible();
  await expect(page.locator('.hand-cards .playing-card')).toHaveCount(13);
  for (let remaining = 13; remaining > 0; remaining -= 1) {
    const legal = page.locator('.hand-cards .playing-card:enabled').first();
    await expect(legal).toBeVisible({ timeout: 10000 });
    await legal.click();
    await expect(page.locator('.hand-cards .playing-card')).toHaveCount(remaining - 1, { timeout: 10000 });
  }
  await expect(page.locator('.results')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('本副结算')).toBeVisible();
});

test('entry screen remains usable on a mobile viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
