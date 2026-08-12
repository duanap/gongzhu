const { test, expect } = require('@playwright/test');
const { version } = require('../../package.json');
const {
  createRoom,
  openEntry
} = require('./helpers/game-flow');
const {
  captureValidatedLandscape,
  stableOrientationEvidence
} = require('./helpers/orientation');
const { expectThreeByThreeSettingsGrid } = require('./helpers/settings-layout');

const DISPLAY_VERSION = `v${version}`;

const landscapeContext = {
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
};

async function closeRoomPanel(page, variant) {
  if (variant === 'legacy') {
    if (await page.locator('#roomModal').isVisible().catch(() => false)) await page.locator('#closeRoomBtn').click();
    return;
  }
  const panel = page.locator('.mobile-tool-sheet.room-modal');
  if (await panel.isVisible().catch(() => false)) await panel.locator('.legacy-modal-close').click();
}

async function openSettings(page, variant) {
  if (variant === 'legacy') await page.locator('#openSettingsBtn').click();
  else await page.getByRole('button', { name: '设置' }).click();
  const dialog = variant === 'legacy'
    ? page.locator('#settingsModal:not(.hidden)')
    : page.getByRole('dialog', { name: '设置' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeOverlay(page, variant, legacySelector, label) {
  if (variant === 'legacy') await page.locator(legacySelector).click();
  else await page.getByRole('dialog', { name: label }).locator('.legacy-modal-close').click();
}

async function assertModalBounds(dialog) {
  const candidates = dialog.locator('.modal-card, .legacy-parity-card');
  const card = await candidates.count() ? candidates.first() : dialog;
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(844);
  expect(box.y + box.height).toBeLessThanOrEqual(390);
}

async function assertLandscapeSnapshot(page, testInfo, name, masks = []) {
  const evidence = await captureValidatedLandscape(page, testInfo, name);
  expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(`${name}.orientation.json`);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    mask: masks,
    maskColor: '#5a4b72',
    maxDiffPixelRatio: 0.02,
    scale: 'css'
  });
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 设置与版本工具在真实手机横屏中保持独立完整面板`, async ({ browser, baseURL, request }, testInfo) => {
    test.setTimeout(90000);
    const resetResponse = await request.post('/__e2e__/ai-learning/reset');
    expect(resetResponse.status()).toBe(200);
    const context = await browser.newContext({ baseURL, ...landscapeContext });
    const page = await context.newPage();
    const masks = [page.locator('.avatar, .seat-avatar'), page.getByRole('button', { name: /^房间 \d{4}$/ })];
    try {
      await openEntry(page, variant);
      await createRoom(page, variant, `工具${variant}`);
      await closeRoomPanel(page, variant);

      let dialog = await openSettings(page, variant);
      await expect(dialog.locator(variant === 'legacy' ? '.settings-card' : '.settings-panel')).toHaveCount(1);
      await assertModalBounds(dialog);
      await expectThreeByThreeSettingsGrid(dialog, variant);
      if (variant === 'vue') {
        const tools = dialog.locator('.settings-actions-grid-vue > button');
        await expect(tools).toHaveCount(6);
        const boxes = await tools.evaluateAll(buttons => buttons.map(button => {
          const rect = button.getBoundingClientRect();
          return { x: Math.round(rect.x), y: Math.round(rect.y) };
        }));
        expect(new Set(boxes.map(box => box.x)).size).toBe(6);
        expect(new Set(boxes.map(box => box.y)).size).toBe(1);
        await expect(dialog.getByLabel('背景音乐曲目').locator('option')).toHaveCount(5);
      }
      await assertLandscapeSnapshot(page, testInfo, `${variant}-settings-tools-physical-landscape`, masks);

      if (variant === 'legacy') {
        await dialog.locator('#openLogBtn').click();
        dialog = page.locator('#logModal:not(.hidden)');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('#logFilterBar button')).toHaveCount(5);
        await assertModalBounds(dialog);
        await assertLandscapeSnapshot(page, testInfo, `${variant}-log-tools-physical-landscape`, masks);
        await closeOverlay(page, variant, '#closeLogBtn', '出牌日志');
      } else {
        await expect(dialog.getByRole('button', { name: 'AI 接管', exact: true })).toHaveCount(0);
        await dialog.getByRole('button', { name: /^日志(?: \d+)?$/ }).click();
        dialog = page.getByRole('dialog', { name: '出牌日志' });
        await expect(dialog).toBeVisible();
        const filters = dialog.locator('.log-filter-bar-vue button');
        await expect(filters).toHaveText(['全部', '出牌', '收墩', '传牌', '房间']);
        await filters.filter({ hasText: '房间' }).click();
        await expect(dialog.locator('.log-event-vue')).not.toHaveCount(0);
        await expect(dialog.locator('.log-event-vue').first()).toContainText(/房间|创建|加入/);
        await assertModalBounds(dialog);
        const scrollState = await dialog.locator('.mobile-sheet-body').evaluate(element => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflowY: getComputedStyle(element).overflowY
        }));
        expect(scrollState.clientHeight).toBeGreaterThan(0);
        expect(scrollState.scrollHeight).toBeGreaterThanOrEqual(scrollState.clientHeight);
        expect(['auto', 'scroll']).toContain(scrollState.overflowY);
        await closeOverlay(page, variant, '', '出牌日志');
      }

      dialog = await openSettings(page, variant);
      const versionButton = variant === 'legacy'
        ? dialog.locator('#openVersionLogBtn')
        : dialog.getByRole('button', { name: '版本日志' });
      await versionButton.click();
      dialog = variant === 'legacy'
        ? page.locator('#versionLogModal:not(.hidden)')
        : page.getByRole('dialog', { name: '版本更新日志' });
      await expect(dialog).toBeVisible();
      const versions = dialog.locator(variant === 'legacy' ? '.version-log-item' : '.version-log-item-vue');
      expect(await versions.count()).toBeGreaterThan(20);
      await expect(versions.first()).toContainText(DISPLAY_VERSION);
      await assertModalBounds(dialog);
      await assertLandscapeSnapshot(page, testInfo, `${variant}-versions-tools-physical-landscape`, masks);

      await closeOverlay(page, variant, variant === 'legacy' ? '#closeVersionLogBtn' : '', '版本更新日志');
      dialog = await openSettings(page, variant);
      const aiButton = variant === 'legacy'
        ? dialog.locator('#openAiLearningBtn')
        : dialog.getByRole('button', { name: 'AI 学习' });
      await aiButton.click();
      dialog = variant === 'legacy'
        ? page.locator('#aiLearningModal:not(.hidden)')
        : page.getByRole('dialog', { name: 'AI 学习数据' });
      await expect(dialog.locator('.ai-learning-stat')).toHaveCount(3);
      await expect(dialog.locator('.ai-learning-weight')).toHaveCount(6);
      await assertModalBounds(dialog);
      const aiVisual = await dialog.evaluate(element => {
        const card = element.querySelector('.modal-card, .mobile-tool-sheet') || element;
        const row = element.querySelector('.ai-learning-weight');
        const cardStyle = getComputedStyle(card);
        const rowStyle = getComputedStyle(row);
        return {
          cardWidth: card.getBoundingClientRect().width,
          cardBackground: cardStyle.backgroundImage,
          rowColor: rowStyle.color,
          rowBackground: rowStyle.backgroundColor
        };
      });
      expect(aiVisual.cardWidth).toBeGreaterThanOrEqual(760);
      expect(aiVisual.cardBackground).not.toBe('none');
      expect(aiVisual.rowColor).not.toBe('rgb(255, 255, 255)');
      expect(aiVisual.rowBackground).not.toBe('rgba(0, 0, 0, 0)');
      await page.addStyleTag({
        content: '.ai-learning-list, .ai-learning-panel > .interaction-debug-title { display: none !important; }'
      });
      await assertLandscapeSnapshot(page, testInfo, `${variant}-ai-learning-tools-physical-landscape`, [
        ...masks,
        dialog.locator('.ai-learning-stat strong, .ai-learning-weight b, .ai-learning-row')
      ]);

      if (variant === 'vue') {
        await closeOverlay(page, variant, '', 'AI 学习数据');
        dialog = await openSettings(page, variant);
        await dialog.getByRole('button', { name: '战绩' }).click();
        dialog = page.getByRole('dialog', { name: '战绩' });
        await expect(dialog).toContainText('排行榜');
        await expect(dialog).toContainText('最近对局');
        await expect(dialog.locator('.stat-tile')).toHaveCount(6);
        expect(await dialog.locator('.stats-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
        await assertModalBounds(dialog);
        const statsVisual = await dialog.evaluate(element => {
          const panel = element.querySelector('.user-data-panel');
          const tile = element.querySelector('.stat-tile');
          const label = tile.querySelector('span');
          const value = tile.querySelector('strong');
          return {
            panelColor: getComputedStyle(panel).color,
            labelColor: getComputedStyle(label).color,
            valueColor: getComputedStyle(value).color,
            tileBackground: getComputedStyle(tile).backgroundColor
          };
        });
        expect(statsVisual.panelColor).toBe('rgb(74, 46, 23)');
        expect(statsVisual.labelColor).toBe('rgba(79, 50, 23, 0.78)');
        expect(statsVisual.valueColor).toBe('rgb(74, 46, 23)');
        expect(statsVisual.tileBackground).not.toBe('rgba(0, 0, 0, 0)');
        await closeOverlay(page, variant, '', '战绩');
        dialog = await openSettings(page, variant);
        await dialog.getByRole('button', { name: '调试' }).click();
        dialog = page.getByRole('dialog', { name: '调试' });
        await expect(dialog).toBeVisible();
        await assertModalBounds(dialog);
        const debugLayout = await dialog.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const first = element.querySelector('.debug-item-vue strong');
          const firstRect = first.getBoundingClientRect();
          return {
            width: rect.width,
            firstHeight: firstRect.height,
            fontSize: Number.parseFloat(getComputedStyle(first).fontSize)
          };
        });
        expect(debugLayout.width).toBeLessThanOrEqual(540);
        expect(debugLayout.firstHeight).toBeLessThanOrEqual(debugLayout.fontSize * 1.6);
        const roundTablePreview = dialog.locator('.debug-item-vue').filter({ hasText: '查看牌桌' });
        await roundTablePreview.getByRole('button', { name: '播放' }).click();
        const roundTableDialog = page.getByRole('dialog', { name: '本局牌桌' });
        await expect(roundTableDialog).toBeVisible();
        await assertModalBounds(roundTableDialog);
      }
    } finally {
      await context.close();
    }
  });
}

test('旧版与 Vue 互动入口、头像菜单和道具轨迹保持真实手机横屏等价', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120000);
  const metrics = {};

  for (const variant of ['legacy', 'vue']) {
    const context = await browser.newContext({ baseURL, ...landscapeContext });
    const page = await context.newPage();
    try {
      await openEntry(page, variant);
      await createRoom(page, variant, `互动${variant}`);
      const fillBots = variant === 'legacy'
        ? page.locator('#fillBotsBtn')
        : page.getByRole('button', { name: 'AI补位开始' });
      await fillBots.click();
      await expect(page.locator(variant === 'legacy'
        ? '#opHand1 .card-back'
        : '.opponent-hand-west .opponent-card-back-vue')).not.toHaveCount(0);
      await closeRoomPanel(page, variant);

      const button = page.locator(variant === 'legacy' ? '#interactionBtn' : '.interaction-fab-button-vue');
      await expect(button).toBeVisible();
      const buttonBox = await button.boundingBox();

      await button.click();
      let menu = page.locator(variant === 'legacy'
        ? '#interactionTargetMenu:not(.hidden)'
        : '.interaction-target-menu-vue.quick-emoji-menu');
      await expect(menu).toBeVisible();
      const quickBox = await menu.boundingBox();
      expect(quickBox.x).toBeGreaterThanOrEqual(0);
      expect(quickBox.y).toBeGreaterThanOrEqual(0);
      expect(quickBox.x + quickBox.width).toBeLessThanOrEqual(844);
      expect(quickBox.y + quickBox.height).toBeLessThanOrEqual(390);

      await page.evaluate(() => document.body.click());
      await expect(menu).toBeHidden();

      const avatar = page.locator(variant === 'legacy' ? '#seat1 .avatar' : '.seat-west .seat-avatar');
      if (variant === 'legacy') {
        await avatar.click();
      } else {
        const expandedHitTarget = await avatar.boundingBox();
        await page.mouse.click(expandedHitTarget.x - 8, expandedHitTarget.y + expandedHitTarget.height / 2);
      }
      menu = page.locator(variant === 'legacy'
        ? '#interactionTargetMenu:not(.hidden)'
        : '.interaction-target-menu-vue.target-tool-menu');
      await expect(menu).toBeVisible();
      const avatarBox = await avatar.boundingBox();
      const targetBox = await menu.boundingBox();
      expect(targetBox.x).toBeGreaterThanOrEqual(avatarBox.x + avatarBox.width - 2);
      expect(targetBox.x - (avatarBox.x + avatarBox.width)).toBeLessThanOrEqual(21);
      expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(844);
      expect(targetBox.y).toBeGreaterThanOrEqual(0);
      expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(390);

      const name = `${variant}-interaction-tools-physical-landscape`;
      const evidence = await captureValidatedLandscape(page, testInfo, name);
      expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(`${name}.orientation.json`);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
        mask: [page.locator('.avatar, .seat-avatar')],
        maskColor: '#5a4b72',
        maxDiffPixelRatio: 0.02,
        scale: 'css'
      });

      const flowerButton = variant === 'legacy'
        ? page.locator('#interactionTargetMenu [data-target-menu-kind="flower"]')
        : menu.locator('[data-interaction-kind="flower"]');
      await flowerButton.click();
      const flight = page.locator(variant === 'legacy'
        ? '#interactionLayer .interaction-fly-item'
        : '.legacy-interaction-sequence.flower .interaction-fly-item-vue');
      await expect(flight).toBeVisible();
      const targetDelta = await page.evaluate(currentVariant => {
        const avatarCenter = selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        };
        if (currentVariant === 'legacy') {
          const item = document.querySelector('#interactionLayer .interaction-fly-item');
          const style = item.style;
          const targetX = Number.parseFloat(style.left) + Number.parseFloat(style.getPropertyValue('--interaction-to-x'));
          const targetY = Number.parseFloat(style.top) + Number.parseFloat(style.getPropertyValue('--interaction-to-y'));
          const avatar = avatarCenter('#seat1 .avatar');
          return { x: targetX - avatar.x, y: targetY - avatar.y };
        }
        const item = document.querySelector('.legacy-interaction-sequence.flower');
        const style = getComputedStyle(item);
        const targetX = Number.parseFloat(style.getPropertyValue('--interaction-to-x'));
        const targetY = Number.parseFloat(style.getPropertyValue('--interaction-to-y'));
        const avatar = avatarCenter('.seat-west .seat-avatar');
        return { x: targetX - avatar.x, y: targetY - avatar.y };
      }, variant);
      expect(Math.abs(targetDelta.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(targetDelta.y)).toBeLessThanOrEqual(3);

      await avatar.click();
      const cooldownMenu = page.locator(variant === 'legacy'
        ? '#interactionTargetMenu:not(.hidden)'
        : '.interaction-target-menu-vue.target-tool-menu');
      const coolingFlower = variant === 'legacy'
        ? cooldownMenu.locator('[data-target-menu-kind="flower"]')
        : cooldownMenu.locator('[data-interaction-kind="flower"]');
      await expect(coolingFlower).toBeDisabled();
      await expect(coolingFlower).toContainText(/\d+s/);

      metrics[variant] = {
        buttonX: buttonBox.x + buttonBox.width / 2,
        buttonY: buttonBox.y + buttonBox.height / 2,
        quickX: quickBox.x + quickBox.width / 2,
        quickY: quickBox.y + quickBox.height / 2,
        targetGap: targetBox.x - (avatarBox.x + avatarBox.width)
      };
    } finally {
      await context.close();
    }
  }

  expect(Math.abs(metrics.legacy.buttonX - metrics.vue.buttonX)).toBeLessThanOrEqual(24);
  expect(Math.abs(metrics.legacy.buttonY - metrics.vue.buttonY)).toBeLessThanOrEqual(18);
  expect(Math.abs(metrics.legacy.quickX - metrics.vue.quickX)).toBeLessThanOrEqual(18);
  expect(Math.abs(metrics.legacy.quickY - metrics.vue.quickY)).toBeLessThanOrEqual(18);
  expect(Math.abs(metrics.legacy.targetGap - metrics.vue.targetGap)).toBeLessThanOrEqual(8);
});
