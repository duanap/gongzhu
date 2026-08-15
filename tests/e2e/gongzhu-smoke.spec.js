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

test('entry screen remains upright and usable in mobile portrait', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile portrait regression');
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  await expect(page.locator('.mobile-shell')).toHaveCSS('transform', 'none');
  const viewport = page.viewportSize();
  const shell = await page.locator('.mobile-shell').boundingBox();
  expect(shell.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(shell.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('mobile table also fits a physical landscape viewport without CSS rotation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'physical mobile landscape regression');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
  await expect(page.locator('.mobile-shell')).toHaveCSS('transform', 'none');
  const shell = await page.locator('.mobile-shell').boundingBox();
  expect(shell.width).toBeGreaterThanOrEqual(843);
  expect(shell.height).toBeGreaterThanOrEqual(389);
});

test('narrow 360px portrait keeps the table inside the physical viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'narrow mobile portrait regression');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('.mobile-shell')).toHaveCSS('transform', 'none');
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('host can change the room-wide pacing setting', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('.service-state.online, .gongzhu-online-state.online, .status-line').first()).toContainText(/已连接/, { timeout: 20_000 });
  await page.getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('button', { name: '确认创建' }).click();
  await page.locator('.room-close-bottom').click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const paceGroup = page.getByRole('group', { name: '牌局节奏' });
  await expect(paceGroup.getByRole('button', { name: '标准' })).toHaveClass(/active/);
  await paceGroup.getByRole('button', { name: '偏慢' }).click();
  await expect(paceGroup.getByRole('button', { name: '偏慢' })).toHaveClass(/active/);
  await expect(page.getByText(/约 1\.7–2\.15 秒出牌/)).toBeVisible();
});

test('Hearts table structure is preserved after creating a room', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('button', { name: '规则' })).toBeVisible();
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible();
  await page.getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.locator('.table-seat')).toHaveCount(4);
  await expect(page.locator('.table-status-panel')).toBeVisible();
  await expect(page.locator('.hand-panel')).toBeVisible();
  const stage = page.locator('.legacy-game-stage, .mobile-game-stage');
  await expect(stage).toBeVisible();
  await expect(stage).toHaveCSS('background-image', /table-bg-v1210\.webp/);
  await expect(page.locator('.gongzhu-declare-panel, .gongzhu-round-panel')).toHaveCount(0);
});

test('stale room cache is cleared after an in-memory room is gone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gongzhu-by-duanap-room-id', '9999');
    localStorage.setItem('gongzhu-by-duanap-reconnect-token', 'stale-token');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('房间号 9999', { exact: true })).toHaveCount(0);
  await expect(page.evaluate(() => localStorage.getItem('gongzhu-by-duanap-room-id'))).resolves.toBeNull();
});

test('a valid in-memory room still reconnects after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('.service-state.online, .gongzhu-online-state.online, .status-line').first()).toContainText(/已连接/, { timeout: 20_000 });
  await page.getByRole('button', { name: '创建房间' }).click();
  await page.getByRole('button', { name: '确认创建' }).click();
  await expect(page.locator('.room-panel .room-title-line strong')).toHaveText(/房间号 \d{4}/);
  const roomId = await page.evaluate(() => localStorage.getItem('gongzhu-by-duanap-room-id'));
  expect(roomId).toMatch(/^\d{4}$/);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('.room-panel .room-title-line strong')).toHaveText(`房间号 ${roomId}`);
  await expect(page.getByRole('button', { name: 'AI补位开始' })).toBeVisible();
});
