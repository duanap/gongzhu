const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  collectBrowserErrors,
  createFourPlayerRoom,
  createRoom,
  joinRoom,
  openEntry,
  waitForPassPhase
} = require('./helpers/game-flow');

const contextOptions = {
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  viewport: { width: 1440, height: 900 },
  screen: { width: 1440, height: 900 }
};

const mobileLandscapeOptions = {
  ...contextOptions,
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
};

function handLocator(page, variant) {
  return page.locator(variant === 'legacy' ? '#hand .card' : '.hand-panel .game-card');
}

function roomRows(page, variant) {
  return page.locator(variant === 'legacy' ? '#roomPlayers .room-player' : '.player-list .player-row');
}

async function openRoomStatus(page, variant, roomId) {
  if (variant === 'legacy') {
    const aiPrompt = page.locator('#aiPromptModal');
    if (await aiPrompt.isVisible().catch(() => false)) await page.locator('#closeAiPromptBtn').click();
    if (!(await page.locator('#roomModal').isVisible().catch(() => false))) await page.locator('#openRoomBtn').click();
    await expect(page.locator('#roomModal')).toBeVisible();
    return;
  }
  const roomPanel = page.locator('.legacy-room-modal, .mobile-tool-sheet.room-modal');
  if (!(await roomPanel.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: `房间 ${roomId}` }).click();
  }
  await expect(roomPanel).toBeVisible();
}

test('vue 手机真实横屏可以审批纯 AI 座位接管', async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  const errors = [];
  const hostContext = await browser.newContext({ ...mobileLandscapeOptions, baseURL });
  const requesterContext = await browser.newContext({ ...mobileLandscapeOptions, baseURL });
  const host = await hostContext.newPage();
  const requester = await requesterContext.newPage();
  collectBrowserErrors(host, 'vue-mobile-bot-host', errors);
  collectBrowserErrors(requester, 'vue-mobile-bot-requester', errors);

  try {
    await openEntry(host, 'vue');
    await expect(host.locator('.mobile-shell')).toBeVisible();
    const roomId = await createRoom(host, 'vue', '手机接管房主');
    await host.getByRole('button', { name: 'AI补位开始' }).click();
    await waitForPassPhase(host, 'vue');

    await openEntry(requester, 'vue');
    await joinRoom(requester, 'vue', '手机接管新人', roomId, { expectRoomStatus: false });
    await expect(host.locator('.room-takeover-requests')).toBeVisible({ timeout: 7000 });
    await expect(host.getByText(/手机接管新人.*想接管/)).toBeVisible();
    await host.getByRole('button', { name: '同意' }).click();

    await expect(handLocator(requester, 'vue')).toHaveCount(13, { timeout: 10000 });
    const row = await expectPlayerStatus(host, 'vue', roomId, '手机接管新人', '在线');
    await expect(row).not.toContainText('AI');
    expect(errors, errors.join('\n')).toEqual([]);
  } finally {
    await Promise.all([hostContext.close().catch(() => {}), requesterContext.close().catch(() => {})]);
  }
});

async function expectPlayerStatus(page, variant, roomId, nickname, text, timeout = 7000) {
  await openRoomStatus(page, variant, roomId);
  const row = roomRows(page, variant).filter({ hasText: nickname });
  await expect(row).toHaveCount(1, { timeout });
  await expect(row).toContainText(text, { timeout });
  return row;
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 在断线宽限期内自动重连并保留原座位`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      const originalCards = await handLocator(roomSet.pages[1], variant).evaluateAll(cards => cards.map(card => card.dataset.id).sort());
      await roomSet.pages[1].reload({ waitUntil: 'networkidle' });
      await expect(handLocator(roomSet.pages[1], variant)).toHaveCount(13, { timeout: 10000 });
      const reconnectedCards = await handLocator(roomSet.pages[1], variant).evaluateAll(cards => cards.map(card => card.dataset.id).sort());
      expect(reconnectedCards).toEqual(originalCards);
      await roomSet.pages[0].waitForTimeout(1800);
      const row = await expectPlayerStatus(roomSet.pages[0], variant, roomSet.roomId, '验收乙', '在线');
      await expect(row).not.toContainText(/离线|AI托管/);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 离线玩家自动由 AI 托管后可凭本地身份取回座位`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      const originalCards = await handLocator(roomSet.pages[1], variant).evaluateAll(cards => cards.map(card => card.dataset.id).sort());
      const storageState = await roomSet.contexts[1].storageState();
      await roomSet.contexts[1].close();

      await expectPlayerStatus(roomSet.pages[0], variant, roomSet.roomId, '验收乙', 'AI托管中', 8000);

      const context = await browser.newContext({ ...contextOptions, baseURL, storageState });
      const page = await context.newPage();
      collectBrowserErrors(page, `${variant}-takeover-return`, roomSet.errors);
      roomSet.contexts[1] = context;
      roomSet.pages[1] = page;
      await page.goto(variant === 'legacy' ? '/' : '/vue/', { waitUntil: 'networkidle' });
      await expect(handLocator(page, variant)).toHaveCount(13, { timeout: 10000 });
      const restoredCards = await handLocator(page, variant).evaluateAll(cards => cards.map(card => card.dataset.id).sort());
      expect(restoredCards).toEqual(originalCards);
      const row = await expectPlayerStatus(roomSet.pages[0], variant, roomSet.roomId, '验收乙', '在线');
      await expect(row).not.toContainText(/离线|AI托管/);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 新玩家申请纯 AI 座位并由房主批准`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const errors = [];
    const hostContext = await browser.newContext({ ...contextOptions, baseURL });
    const requesterContext = await browser.newContext({ ...contextOptions, baseURL });
    const host = await hostContext.newPage();
    const requester = await requesterContext.newPage();
    collectBrowserErrors(host, `${variant}-bot-host`, errors);
    collectBrowserErrors(requester, `${variant}-bot-requester`, errors);

    try {
      await openEntry(host, variant);
      const roomId = await createRoom(host, variant, '接管房主');
      if (variant === 'legacy') await host.locator('#fillBotsBtn').click();
      else await host.getByRole('button', { name: 'AI补位开始' }).click();
      await waitForPassPhase(host, variant);

      await openEntry(requester, variant);
      await joinRoom(requester, variant, '接管新人', roomId, { expectRoomStatus: false });

      if (variant === 'legacy') {
        await expect(host.locator('#aiPromptModal')).toBeVisible({ timeout: 7000 });
        await expect(host.locator('#aiPromptTitle')).toHaveText('有人申请接管 AI');
        await host.locator('#aiPromptConfirmBtn').click();
      } else {
        await expect(host.locator('.room-takeover-requests')).toBeVisible({ timeout: 7000 });
        await expect(host.getByText(/接管新人.*想接管/)).toBeVisible();
        await host.getByRole('button', { name: '同意' }).click();
      }

      await expect(handLocator(requester, variant)).toHaveCount(13, { timeout: 10000 });
      const row = await expectPlayerStatus(host, variant, roomId, '接管新人', '在线');
      await expect(row).not.toContainText('AI');
      expect(errors, errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([hostContext.close().catch(() => {}), requesterContext.close().catch(() => {})]);
    }
  });
}

test('vue 房主可从房间面板手动接管离线真人座位', async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  const roomSet = await createFourPlayerRoom(browser, baseURL, 'vue');
  try {
    await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, 'vue')));
    const host = roomSet.pages[0];
    await openRoomStatus(host, 'vue', roomSet.roomId);
    await roomSet.contexts[1].close();

    const takeoverButton = host.getByRole('button', { name: 'AI接管离线', exact: true });
    await expect(takeoverButton).toBeVisible({ timeout: 5000 });
    await takeoverButton.click();
    const row = roomRows(host, 'vue').filter({ hasText: '验收乙' });
    await expect(row).toContainText('AI托管中', { timeout: 5000 });
    await expect(takeoverButton).toBeHidden();
    expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
  } finally {
    await closeRoomSet(roomSet);
  }
});

test('vue 手机真实横屏断网时全局提示保持可见且网页方向不变', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ ...mobileLandscapeOptions, baseURL });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await expect(page.locator('.mobile-shell')).toBeVisible();
    await context.setOffline(true);
    const banner = page.locator('.global-connection-banner');
    await expect(banner).toContainText('当前设备处于离线状态');
    const geometry = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-shell').getBoundingClientRect();
      const notice = document.querySelector('.global-connection-banner').getBoundingClientRect();
      return {
        shell: { width: shell.width, height: shell.height },
        notice: { left: notice.left, top: notice.top, right: notice.right, bottom: notice.bottom },
        noticeZ: Number.parseInt(getComputedStyle(document.querySelector('.global-notice-layer')).zIndex, 10),
        roomZ: Number.parseInt(getComputedStyle(document.querySelector('.mobile-tool-sheet')).zIndex, 10),
        viewport: { width: innerWidth, height: innerHeight },
        landscape: matchMedia('(orientation: landscape)').matches
      };
    });
    expect(geometry.viewport.width).toBeGreaterThan(geometry.viewport.height);
    expect(geometry.shell.width).toBeGreaterThan(geometry.shell.height);
    expect(geometry.landscape).toBe(true);
    expect(geometry.notice.left).toBeGreaterThanOrEqual(0);
    expect(geometry.notice.top).toBeGreaterThanOrEqual(0);
    expect(geometry.notice.right).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.notice.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    expect(geometry.noticeZ).toBeGreaterThan(geometry.roomZ);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
});
