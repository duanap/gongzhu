const { test, expect } = require('@playwright/test');

test.setTimeout(90_000);

test('host can complete a full round with three bots', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByText('拱猪 · Gongzhu', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.service-state.online, .gongzhu-online-state.online, .status-line').first()).toContainText(/已连接/, { timeout: 20_000 });
  await page.getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.getByText('规则：gongzhu-v1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI补位开始' }).click();
  await expect(page.getByText('秘密亮牌', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /不亮|确认亮/ }).click();
  await expect(page.locator('.table-status-panel.phase-play')).toBeVisible();
  await expect(page.locator('.hand-panel .game-card')).toHaveCount(13);
  for (let remaining = 13; remaining > 0; remaining -= 1) {
    const legal = page.locator('.hand-panel .game-card.playable').first();
    await expect(legal).toBeVisible({ timeout: 10000 });
    await legal.click();
    await page.getByRole('button', { name: '出牌' }).click();
    await expect(page.locator('.hand-panel .game-card')).toHaveCount(remaining - 1, { timeout: 10000 });
  }
  await expect(page.getByText(/本副结算完成|最高分并列/)).toBeVisible({ timeout: 10000 });
});

test('entry screen remains usable on a mobile viewport', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('Hearts table structure is preserved after creating a room', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.locator('.table-seat')).toHaveCount(4);
  await expect(page.locator('.table-status-panel')).toBeVisible();
  await expect(page.locator('.hand-panel')).toBeVisible();
  await expect(page.locator('.legacy-game-stage, .mobile-game-stage')).toBeVisible();
});
