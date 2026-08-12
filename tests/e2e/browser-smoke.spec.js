const { test, expect } = require('@playwright/test');

function collectBrowserErrors(page) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      const location = message.location();
      const source = location.url ? ` (${location.url}:${location.lineNumber || 0})` : '';
      errors.push(`console: ${message.text()}${source}`);
    }
  });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`response ${response.status()}: ${response.url()}`);
  });
  return errors;
}

test('旧版可以通过真实 UI 创建并解散房间', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.locator('#roomModal')).toBeVisible();
  await page.locator('#chooseCreateRoomBtn').click();
  await page.locator('#nicknameInput').fill('旧版验收');
  await page.locator('#createRoomBtn').click();

  await expect(page.locator('#roomStatus')).toContainText('已连接');
  await expect(page.locator('#disbandRoomBtn')).toBeVisible();
  await expect(page.locator('#roomIdInput')).toHaveValue(/^\d{4}$/);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#disbandRoomBtn').click();
  await expect(page.locator('#roomChoicePanel')).toBeVisible();
  await expect(page.locator('#roomStatus')).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Vue 灰度版可以通过真实 UI 创建并解散房间', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  await page.goto('/vue/', { waitUntil: 'networkidle' });

  await expect(page.locator('.legacy-room-modal')).toBeVisible();
  await page.getByRole('button', { name: /创建房间/ }).click();
  await page.getByLabel('昵称').fill('Vue验收');
  await page.getByRole('button', { name: '确认创建' }).click();

  await expect(page.locator('.room-status')).toContainText('已连接');
  await expect(page.locator('.panel-header')).toContainText(/^房间号 \d{4}/);
  await expect(page.getByRole('button', { name: '解散房间' })).toBeEnabled();

  await page.getByRole('button', { name: '解散房间' }).click();
  await expect(page.getByRole('button', { name: /创建房间/ })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
