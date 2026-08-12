const { test, expect } = require('@playwright/test');
const {
  collectBrowserErrors,
  createRoom,
  openEntry,
  waitForPassPhase
} = require('./helpers/game-flow');

async function closeRoomPanel(page) {
  const panel = page.locator('.legacy-room-modal, .mobile-tool-sheet.room-modal').filter({ visible: true });
  if (await panel.isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: '关闭', exact: true }).first().click();
  }
}

async function createAiRoom(page) {
  await openEntry(page, 'vue');
  const roomId = await createRoom(page, 'vue', '反馈验收');
  await page.getByRole('button', { name: 'AI补位开始', exact: true }).click();
  await waitForPassPhase(page, 'vue');
  await closeRoomPanel(page);
  return roomId;
}

async function applyPlayFixture(request, roomId, { withLastTrick = false } = {}) {
  const response = await request.post('/__e2e__/fixture', {
    data: {
      roomId,
      hands: [['C2', 'C4', 'C5'], ['D2'], ['S2'], ['H2']],
      trick: [{ player: 1, cardId: 'C10' }],
      trickNo: 2,
      currentPlayer: 0,
      heartsBroken: true,
      lastTrick: withLastTrick ? {
        leaderPlayer: 1,
        winnerPlayer: 2,
        points: 1,
        leadSuit: 'D',
        cards: [
          { player: 1, cardId: 'D3' },
          { player: 2, cardId: 'D14' },
          { player: 3, cardId: 'D8' },
          { player: 0, cardId: 'H2' }
        ]
      } : null
    }
  });
  expect(response.status()).toBe(200);
}

function center(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function expectSingleRowInOrder(locator) {
  const boxes = await locator.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right };
  }));
  boxes.slice(1).forEach(box => expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(2));
  for (let index = 1; index < boxes.length; index += 1) expect(boxes[index].x).toBeGreaterThan(boxes[index - 1].x);
}

test('Vue 设置、战绩和房间面板符合本轮结构与权限要求', async ({ page }) => {
  test.skip(!test.info().project.name.includes('desktop'));
  const errors = [];
  collectBrowserErrors(page, 'feedback-desktop', errors);
  await page.route('**/api/stats/me?**', route => route.fulfill({
    json: {
      profile: { stats: { gamesPlayed: 12, gamesWon: 5, totalScore: 77, bestScore: 3, moonShots: 2, averageScore: 6.4 } },
      matches: []
    }
  }));
  await page.route('**/api/leaderboard?**', route => route.fulfill({
    json: { leaderboard: [{ userId: 'raw-user-id-must-not-display', nickname: '', stats: { gamesWon: 2, averageScore: 4 } }] }
  }));
  await page.route('**/api/matches/recent?**', route => route.fulfill({
    json: {
      matches: [
        { matchId: 'm1', roomId: '1001', roundNo: 1, participants: [{ name: '甲', score: 2, winner: true }] },
        { matchId: 'm2', roomId: '1002', roundNo: 2, participants: [{ name: '乙', score: 4, winner: false }] }
      ]
    }
  }));

  await openEntry(page, 'vue');
  await page.getByRole('button', { name: /加入房间/ }).click();
  let panel = page.locator('.room-panel.mode-join');
  await expect(panel.locator('.room-actions > button')).toHaveText(['刷新缓存', '加入房间', '返回重新', '关闭']);
  await expectSingleRowInOrder(panel.locator('.room-actions > button'));
  await panel.getByRole('button', { name: '返回重新' }).click();
  await page.getByRole('button', { name: /创建房间/ }).click();
  panel = page.locator('.room-panel.mode-create');
  await expect(panel.locator('.room-actions > button')).toHaveText(['刷新缓存', '确认创建', '返回重新', '关闭']);
  await expectSingleRowInOrder(panel.locator('.room-actions > button'));
  const nicknameCenters = await panel.locator('.room-nickname-field').evaluate(field => {
    const y = selector => {
      const rect = field.querySelector(selector).getBoundingClientRect();
      return rect.y + rect.height / 2;
    };
    return [y(':scope > span'), y('input'), y('.dice-icon-btn')];
  });
  nicknameCenters.slice(1).forEach(value => expect(Math.abs(value - nicknameCenters[0])).toBeLessThanOrEqual(4));
  const createGeometry = await panel.locator('.room-nickname-field').evaluate(field => {
    const dialog = field.closest('[role="dialog"]');
    const dialogRect = dialog.getBoundingClientRect();
    const randomRect = field.querySelector('.dice-icon-btn').getBoundingClientRect();
    return { dialogRight: dialogRect.right, randomRight: randomRect.right };
  });
  expect(createGeometry.randomRight).toBeLessThanOrEqual(createGeometry.dialogRight - 20);
  await panel.getByLabel('昵称').fill('权限房主');
  await panel.getByRole('button', { name: '确认创建' }).click();
  panel = page.locator('.legacy-room-modal .room-panel');
  await expect(panel.getByRole('button', { name: '退出房间', exact: true })).toHaveCount(0);
  const disband = panel.getByRole('button', { name: '解散房间', exact: true });
  await expect(disband).toBeVisible();
  await expect(disband).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(await disband.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  const fillBots = panel.getByRole('button', { name: 'AI补位开始', exact: true });
  expect(await fillBots.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
  await expect(panel).not.toContainText('UUID');

  await closeRoomPanel(page);
  await page.locator('.legacy-top-actions').getByRole('button', { name: '设置' }).click();
  let dialog = page.getByRole('dialog', { name: '设置' });
  const toolButtons = dialog.locator('.settings-actions-grid-vue > button');
  await expect(toolButtons).toHaveCount(6);
  const toolBoxes = await toolButtons.evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y) };
  }));
  expect(new Set(toolBoxes.map(box => box.x)).size).toBe(3);
  expect(new Set(toolBoxes.map(box => box.y)).size).toBe(2);
  await expect(dialog.locator('.settings-cache-action-vue')).toHaveCount(1);
  await expect(dialog.getByLabel('背景音乐曲目').locator('option')).toHaveCount(5);

  await dialog.getByRole('button', { name: '战绩' }).click();
  dialog = page.getByRole('dialog', { name: '战绩' });
  const tiles = dialog.locator('.stat-tile');
  await expect(tiles).toHaveCount(6);
  const tileBoxes = await tiles.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y) };
  }));
  expect(new Set(tileBoxes.map(box => box.x)).size).toBe(3);
  expect(new Set(tileBoxes.map(box => box.y)).size).toBe(2);
  const matches = dialog.locator('.recent-matches-grid > .match-row');
  await expect(matches).toHaveCount(2);
  const matchBoxes = await matches.evaluateAll(elements => elements.map(element => element.getBoundingClientRect()));
  expect(Math.abs(matchBoxes[0].y - matchBoxes[1].y)).toBeLessThanOrEqual(2);
  expect(matchBoxes[1].x).toBeGreaterThan(matchBoxes[0].x);
  await expect(dialog).not.toContainText('raw-user-id-must-not-display');
  expect(errors).toEqual([]);
});

test('Vue 牌面尺寸、右下角牌角、传牌提示和手动选牌符合要求', async ({ page, request }) => {
  test.skip(test.info().project.name.includes('portrait'));
  const errors = [];
  collectBrowserErrors(page, 'feedback-cards', errors);
  const roomId = await createAiRoom(page);
  const passPrompt = page.locator('.table-status-panel.phase-pass > span').first();
  await expect(passPrompt).toHaveText('请选择3张牌传出。');
  const promptStyle = await passPrompt.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, whiteSpace: style.whiteSpace };
  });
  expect(promptStyle.color).toBe('rgb(115, 189, 255)');
  expect(promptStyle.whiteSpace).toBe('nowrap');

  const mobile = test.info().project.name.includes('mobile');
  if (mobile) {
    const handSize = await page.locator('.hand-panel .game-card').first().evaluate(card => {
      const style = getComputedStyle(card);
      return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
    });
    expect(handSize.width).toBeCloseTo(50, 0);
    expect(handSize.height).toBeCloseTo(72, 0);
    const ownSeat = await page.locator('.seat-south').boundingBox();
    expect(ownSeat.x + ownSeat.width).toBeLessThanOrEqual(770);
  }

  await applyPlayFixture(request, roomId);
  const tableCard = page.locator('.trick-panel .game-card.compact').first();
  await expect(tableCard).toBeVisible();
  const cardGeometry = await tableCard.evaluate(card => {
    const cardRect = card.getBoundingClientRect();
    const corner = card.querySelector('.card-corner.bottom');
    const cornerRect = corner.getBoundingClientRect();
    return {
      card: { width: cardRect.width, height: cardRect.height, right: cardRect.right, bottom: cardRect.bottom },
      corner: { right: cornerRect.right, bottom: cornerRect.bottom, display: getComputedStyle(corner).display }
    };
  });
  expect(cardGeometry.corner.display).toBe('grid');
  expect(cardGeometry.card.right - cardGeometry.corner.right).toBeGreaterThanOrEqual(4);
  expect(cardGeometry.card.right - cardGeometry.corner.right).toBeLessThanOrEqual(9);
  expect(cardGeometry.card.bottom - cardGeometry.corner.bottom).toBeGreaterThanOrEqual(4);
  expect(cardGeometry.card.bottom - cardGeometry.corner.bottom).toBeLessThanOrEqual(9);
  if (mobile) {
    expect(cardGeometry.card.width).toBeCloseTo(54, 0);
    expect(cardGeometry.card.height).toBeCloseTo(76, 0);
  }

  const playable = page.locator('.hand-panel .game-card.playable').first();
  await expect(playable).toBeVisible();
  await expect(playable).toHaveAttribute('aria-pressed', 'false');
  const transforms = await playable.evaluate(card => {
    const playableTransform = getComputedStyle(card).transform;
    card.classList.remove('playable');
    const baselineTransform = getComputedStyle(card).transform;
    card.classList.add('playable');
    return { playableTransform, baselineTransform };
  });
  expect(transforms.playableTransform).toBe(transforms.baselineTransform);
  await playable.click();
  await expect(playable).toHaveClass(/selected/);
  await expect(playable).toHaveAttribute('aria-pressed', 'true');
  const playButton = page.getByRole('button', { name: '出牌', exact: true });
  await expect(playButton).toBeEnabled();
  await playButton.click();
  await expect(playButton).toBeHidden();
  expect(errors).toEqual([]);
});

test('Vue 弹窗锁定焦点、支持 Escape 关闭并恢复触发按钮', async ({ page }) => {
  test.skip(test.info().project.name.includes('portrait'));
  await openEntry(page, 'vue');
  await closeRoomPanel(page);

  const roomTrigger = page.getByRole('button', { name: '房间', exact: true }).first();
  await roomTrigger.click();
  const roomDialog = page.getByRole('dialog', { name: '联机房间' });
  await expect(roomDialog).toBeVisible();
  await expect(roomDialog.getByRole('button', { name: '关闭', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(roomDialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(roomDialog).toBeHidden();
  await expect(roomTrigger).toBeFocused();

  const settingsTrigger = page.getByRole('button', { name: '设置', exact: true }).first();
  await settingsTrigger.click();
  const settingsDialog = page.getByRole('dialog', { name: '设置' });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: '关闭', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settingsDialog).toBeHidden();
  await expect(settingsTrigger).toBeFocused();
});

test('Vue 在 reduced-motion 下取消跨屏飞行并保留静态反馈', async ({ page }) => {
  test.skip(test.info().project.name.includes('portrait'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEntry(page, 'vue');
  await closeRoomPanel(page);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('hearts:debug-interaction', {
      detail: { kind: 'tomato', icon: '🍅', label: '测试', from: '甲', to: '乙', fromIndex: 0, toIndex: 2, seq: 99101 }
    }));
    window.dispatchEvent(new CustomEvent('hearts:debug-broadcast', {
      detail: { type: 'shootQueen', level: 'epic', title: '测试播报', subtitle: '减少动态效果', playerIndex: 0, seq: 99102 }
    }));
  });

  const fly = page.locator('.interaction-fly-item-vue');
  const bubble = page.locator('.interaction-bubble-vue');
  const broadcast = page.locator('.special-event-toast');
  await expect(fly).toHaveCSS('display', 'none');
  await expect(bubble).toHaveCSS('animation-name', 'none');
  await expect(bubble).toHaveCSS('opacity', '1');
  await expect(broadcast).toHaveCSS('animation-name', 'none');
  await expect(broadcast).toHaveCSS('opacity', '1');
});

test('Vue 全局提示按顺序展示且每条提示拥有独立生命周期', async ({ page }) => {
  test.skip(test.info().project.name.includes('portrait'));
  await openEntry(page, 'vue');
  await closeRoomPanel(page);

  await page.evaluate(() => {
    ['第一条提示', '第二条提示', '第三条提示'].forEach((message, index) => {
      window.dispatchEvent(new CustomEvent('hearts:debug-notice', {
        detail: { message, kind: index === 1 ? 'error' : 'notice', holdMs: 140 }
      }));
    });
  });

  const toast = page.locator('.global-notice-toast');
  await expect(toast).toContainText('第一条提示');
  const firstId = await toast.getAttribute('data-notice-id');
  await expect(toast).toContainText('第二条提示', { timeout: 1200 });
  const secondId = await toast.getAttribute('data-notice-id');
  expect(secondId).not.toBe(firstId);
  await expect(toast).toHaveClass(/error/);
  await expect(toast).toContainText('第三条提示', { timeout: 1200 });
  await expect(toast).toHaveCSS('animation-name', 'none');
  expect(await toast.evaluate(element => getComputedStyle(element).transitionProperty)).toContain('opacity');
});

test('Vue 全屏切换保持根布局，移动端互动与上一墩弹层始终同向且不越界', async ({ page, request }) => {
  const errors = [];
  collectBrowserErrors(page, 'feedback-fullscreen', errors);
  const projectName = test.info().project.name;
  const mobile = projectName.includes('mobile');

  if (!mobile) {
    await openEntry(page, 'vue');
    await closeRoomPanel(page);
    await page.locator('.legacy-top-actions').getByRole('button', { name: '设置' }).click();
    const settings = page.getByRole('dialog', { name: '设置' });
    await expect(settings).toBeVisible();
    await page.setViewportSize({ width: 700, height: 500 });
    await page.evaluate(() => document.dispatchEvent(new Event('fullscreenchange')));
    await expect(page.locator('.legacy-desktop-shell')).toHaveCount(1);
    await expect(page.locator('.mobile-shell')).toHaveCount(0);
    await expect(settings).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }

  const roomId = await createAiRoom(page);
  await applyPlayFixture(request, roomId, { withLastTrick: true });
  await page.evaluate(() => {
    window.__fakeFullscreen = false;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => window.__fakeFullscreen ? document.documentElement : null
    });
    document.documentElement.requestFullscreen = async () => {
      window.__fakeFullscreen = true;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      window.__fakeFullscreen = false;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  });

  const fullscreen = page.locator('.fullscreen-button');
  const interaction = page.locator('.interaction-fab-button-vue');
  const before = center(await interaction.boundingBox());
  await fullscreen.click();
  await expect(fullscreen).toHaveText('缩小');
  await expect(page.locator('.mobile-shell')).toHaveCount(1);
  await expect(page.locator('.legacy-desktop-shell')).toHaveCount(0);
  const after = center(await interaction.boundingBox());
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);

  await interaction.click();
  const quickMenu = page.locator('.interaction-target-menu-vue.quick-emoji-menu');
  await expect(quickMenu).toBeVisible();
  const viewport = page.viewportSize();
  for (const box of [await quickMenu.boundingBox()]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.evaluate(() => document.body.click());

  const westAvatar = page.locator('.seat-west .seat-avatar');
  const avatarBox = await westAvatar.boundingBox();
  await page.mouse.click(avatarBox.x - 8, avatarBox.y + avatarBox.height / 2);
  const targetMenu = page.locator('.interaction-target-menu-vue.target-tool-menu');
  await expect(targetMenu).toBeVisible();
  const targetBox = await targetMenu.boundingBox();
  expect(targetBox.x).toBeGreaterThanOrEqual(0);
  expect(targetBox.y).toBeGreaterThanOrEqual(0);
  expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(viewport.width);
  expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(viewport.height);
  await page.evaluate(() => document.body.click());

  const lastTrickButton = page.getByRole('button', { name: '上一墩', exact: true });
  await expect(lastTrickButton).toBeVisible();
  await lastTrickButton.click();
  const lastTrick = page.locator('.last-trick-popover-vue');
  await expect(lastTrick).toBeVisible();
  const lastTrickBox = await lastTrick.boundingBox();
  expect(lastTrickBox.x).toBeGreaterThanOrEqual(0);
  expect(lastTrickBox.y).toBeGreaterThanOrEqual(0);
  expect(lastTrickBox.x + lastTrickBox.width).toBeLessThanOrEqual(viewport.width);
  expect(lastTrickBox.y + lastTrickBox.height).toBeLessThanOrEqual(viewport.height);
  expect(errors).toEqual([]);
});

test('Vue 手机设置面板可稳定纵向滚动且音量滑块保留横向手势', async ({ page }) => {
  test.skip(!test.info().project.name.includes('mobile'));
  await openEntry(page, 'vue');
  await closeRoomPanel(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  const body = dialog.locator('.mobile-sheet-body');
  await expect(body).toBeVisible();
  const initial = await body.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
    touchAction: getComputedStyle(element).touchAction
  }));
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.overflowY).toBe('auto');
  expect(initial.touchAction).toBe('pan-y');
  const readability = await dialog.evaluate(element => {
    const sideLabel = element.querySelector('.settings-section-side-vue .settings-row-vue strong');
    const toggle = element.querySelector('.settings-switch-vue');
    const info = element.querySelector('.settings-info-vue span');
    const action = element.querySelector('.settings-actions-grid-vue button');
    return {
      sideLabelFont: Number.parseFloat(getComputedStyle(sideLabel).fontSize),
      toggleHeight: toggle.getBoundingClientRect().height,
      infoFont: Number.parseFloat(getComputedStyle(info).fontSize),
      actionHeight: action.getBoundingClientRect().height,
      actionMinHeight: Number.parseFloat(getComputedStyle(action).minHeight)
    };
  });
  expect(readability.sideLabelFont).toBeGreaterThanOrEqual(12);
  expect(readability.toggleHeight).toBeGreaterThanOrEqual(34);
  expect(readability.infoFont).toBeGreaterThanOrEqual(11);
  expect(readability.actionMinHeight).toBeGreaterThanOrEqual(40);
  expect(readability.actionHeight).toBeGreaterThanOrEqual(36);
  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.locator('.settings-range-vue').first()).toHaveCSS('touch-action', 'pan-x');
});
