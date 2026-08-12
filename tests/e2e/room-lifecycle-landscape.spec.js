const { test, expect } = require('@playwright/test');
const { version } = require('../../package.json');
const {
  closeRoomSet,
  createFourPlayerRoom,
  openEntry,
  waitForPassPhase
} = require('./helpers/game-flow');
const {
  captureValidatedLandscape,
  stableOrientationEvidence
} = require('./helpers/orientation');

const DISPLAY_VERSION = `v${version}`;

const landscapeContext = {
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
};

async function openRoomPanel(page, roomId) {
  const panel = page.locator('.mobile-tool-sheet.room-modal');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: `房间 ${roomId}` }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

test('旧版与 Vue 房间弹窗的尺寸、遮罩和关闭契约保持真实手机横屏等价', async ({ browser, baseURL }, testInfo) => {
  const metrics = {};
  for (const variant of ['legacy', 'vue']) {
    const context = await browser.newContext({ ...landscapeContext, baseURL });
    const page = await context.newPage();
    try {
      await openEntry(page, variant);
      const dialog = page.locator(variant === 'legacy' ? '#roomModal' : '.mobile-tool-sheet.room-modal');
      const card = page.locator(variant === 'legacy' ? '#roomModal .modal-card' : '.mobile-tool-sheet.room-modal');
      const mask = page.locator(variant === 'legacy' ? '#roomMask' : '.mobile-tool-backdrop');
      await expect(dialog).toBeVisible();
      const box = await card.boundingBox();
      const maskStyle = await mask.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor
        };
      });
      expect(maskStyle.background).toBe('rgba(104, 145, 82, 0.3)');

      const evidenceName = `${variant}-room-contract-physical-landscape`;
      const evidence = await captureValidatedLandscape(page, testInfo, evidenceName);
      expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(`${evidenceName}.orientation.json`);

      await mask.click({ position: { x: 8, y: 8 } });
      await expect(dialog).toBeHidden();
      const openButton = variant === 'legacy'
        ? page.locator('#openRoomBtn')
        : page.locator('.app-bar-actions').getByRole('button', { name: '房间', exact: true });
      await openButton.click();
      await expect(dialog).toBeVisible();
      const bottomClose = variant === 'legacy'
        ? page.locator('#closeRoomBottomBtn')
        : dialog.locator('.room-close-bottom');
      await bottomClose.click();
      await expect(dialog).toBeHidden();

      metrics[variant] = box;
    } finally {
      await context.close();
    }
  }

  for (const key of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(metrics.legacy[key] - metrics.vue[key]), `房间弹窗 ${key} 应与旧版一致`).toBeLessThanOrEqual(2);
  }
});

test('Vue 创建与加入表单在真实手机横屏中保持单行字段与单行操作', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ ...landscapeContext, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/vue/', { waitUntil: 'networkidle' });
    await expect(page.locator('.app-bar-actions button')).toHaveText(['全屏', '房间', 'QQ登录', '设置']);
    await expect(page.locator('.app-bar > div:first-child > span')).toHaveText(DISPLAY_VERSION);
    await page.getByRole('button', { name: /加入房间/ }).click();
    const panel = page.locator('.mobile-tool-sheet.room-modal');
    await expect(panel.locator('.room-actions button')).toHaveText(['刷新缓存', '加入房间', '返回重新', '关闭']);
    const actionBoxes = await panel.locator('.room-actions button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right };
    }));
    actionBoxes.slice(1).forEach(box => expect(Math.abs(box.y - actionBoxes[0].y)).toBeLessThanOrEqual(2));
    for (let index = 1; index < actionBoxes.length; index += 1) {
      expect(actionBoxes[index].x).toBeGreaterThan(actionBoxes[index - 1].x);
    }
    actionBoxes.forEach(box => {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(844);
    });

    const joinFields = await panel.locator('.room-field').evaluateAll(fields => fields.map(field => {
      const label = field.querySelector(':scope > span').getBoundingClientRect();
      const input = field.querySelector('input').getBoundingClientRect();
      return { labelY: label.y + label.height / 2, inputY: input.y + input.height / 2 };
    }));
    joinFields.forEach(field => expect(Math.abs(field.labelY - field.inputY)).toBeLessThanOrEqual(4));

    const name = 'vue-room-form-physical-landscape';
    const evidence = await captureValidatedLandscape(page, testInfo, name);
    expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(`${name}.orientation.json`);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      scale: 'css'
    });

    await panel.getByRole('button', { name: '返回重新' }).click();
    await panel.getByRole('button', { name: /创建房间/ }).click();
    await expect(panel.locator('.room-actions button')).toHaveText(['刷新缓存', '确认创建', '返回重新', '关闭']);
    const createBoxes = await panel.locator('.room-actions button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), right: Math.round(rect.right) };
    }));
    createBoxes.slice(1).forEach(box => expect(Math.abs(box.y - createBoxes[0].y)).toBeLessThanOrEqual(2));
    for (let index = 1; index < createBoxes.length; index += 1) {
      expect(createBoxes[index].x).toBeGreaterThan(createBoxes[index - 1].x);
    }
    createBoxes.forEach(box => {
      expect(box.right).toBeLessThanOrEqual(844);
    });

    const createNameField = await panel.locator('.room-field').first().evaluate(field => {
      const panelRect = field.closest('.room-panel').getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      const label = field.querySelector(':scope > span').getBoundingClientRect();
      const input = field.querySelector('input').getBoundingClientRect();
      const random = field.querySelector('.dice-icon-btn').getBoundingClientRect();
      return {
        panelWidth: panelRect.width,
        fieldWidth: fieldRect.width,
        labelY: label.y + label.height / 2,
        inputY: input.y + input.height / 2,
        randomY: random.y + random.height / 2
      };
    });
    expect(createNameField.fieldWidth).toBeGreaterThan(createNameField.panelWidth * 0.8);
    expect(Math.abs(createNameField.labelY - createNameField.inputY)).toBeLessThanOrEqual(4);
    expect(Math.abs(createNameField.randomY - createNameField.inputY)).toBeLessThanOrEqual(4);

    const createName = 'vue-create-room-form-physical-landscape';
    const createEvidence = await captureValidatedLandscape(page, testInfo, createName);
    expect(`${JSON.stringify(stableOrientationEvidence(createEvidence), null, 2)}\n`).toMatchSnapshot(`${createName}.orientation.json`);
    await expect(page).toHaveScreenshot(`${createName}.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      scale: 'css'
    });
  } finally {
    await context.close();
  }
});

test('Vue 玩家主动退出后的 AI 补位入口保持真实手机横屏', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(60000);
  const roomSet = await createFourPlayerRoom(browser, baseURL, 'vue', landscapeContext);
  try {
    await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, 'vue')));
    const leaverPanel = await openRoomPanel(roomSet.pages[1], roomSet.roomId);
    let confirmation = '';
    roomSet.pages[1].once('dialog', async dialog => {
      confirmation = dialog.message();
      await dialog.accept();
    });
    await leaverPanel.getByRole('button', { name: '退出房间', exact: true }).click();
    await expect.poll(() => confirmation).toContain(`确定退出房间 ${roomSet.roomId}`);

    const host = roomSet.pages[0];
    const hostPanel = await openRoomPanel(host, roomSet.roomId);
    const leftRow = hostPanel.locator('.player-row').filter({ hasText: '验收乙' });
    await expect(leftRow).toContainText('已退出');
    const fillButton = hostPanel.getByRole('button', { name: 'AI补位', exact: true });
    await expect(fillButton).toBeVisible();

    const box = await hostPanel.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    expect(box.y + box.height).toBeLessThanOrEqual(390);

    const name = 'vue-left-player-ai-fill-physical-landscape';
    const evidence = await captureValidatedLandscape(host, testInfo, name);
    expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
      `${name}.orientation.json`
    );
    await expect(host).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      mask: [
        host.locator('.player-main'),
        host.locator('.room-status strong'),
        host.locator('.room-button')
      ],
      maskColor: '#5a4b72',
      maxDiffPixelRatio: 0.02,
      scale: 'css'
    });

    await fillButton.click();
    await expect(leftRow).toContainText('AI托管');
    expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
  } finally {
    await closeRoomSet(roomSet);
  }
});
