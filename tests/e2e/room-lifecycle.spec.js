const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  collectBrowserErrors,
  createFourPlayerRoom,
  createRoom,
  joinRoom,
  openEntry,
  playCompleteRound,
  submitPass,
  waitForPassPhase
} = require('./helpers/game-flow');

const contextOptions = {
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  viewport: { width: 1440, height: 900 },
  screen: { width: 1440, height: 900 }
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

async function closeRoomStatus(page, variant) {
  if (variant === 'legacy') {
    await page.locator('#closeRoomBtn').click();
    await expect(page.locator('#roomModal')).toBeHidden();
    return;
  }
  const roomPanel = page.locator('.legacy-room-modal, .mobile-tool-sheet.room-modal');
  await roomPanel.getByRole('button', { name: '关闭', exact: true }).first().click();
  await expect(roomPanel).toBeHidden();
}

async function expectPlayerStatus(page, variant, roomId, nickname, text, timeout = 7000) {
  await openRoomStatus(page, variant, roomId);
  const row = roomRows(page, variant).filter({ hasText: nickname });
  await expect(row).toHaveCount(1, { timeout });
  await expect(row).toContainText(text, { timeout });
  return row;
}

async function leaveRoomWithConfirmation(page, variant, roomId) {
  await openRoomStatus(page, variant, roomId);
  let confirmationText = '';
  page.once('dialog', async dialog => {
    confirmationText = dialog.message();
    await dialog.accept();
  });
  if (variant === 'legacy') await page.locator('#leaveRoomBtn').click();
  else await page.getByRole('button', { name: '退出房间', exact: true }).click();
  await expect.poll(() => confirmationText).toContain(`确定退出房间 ${roomId}`);
}

async function expectRoomChoice(page, variant) {
  if (variant === 'legacy') {
    await expect(page.locator('#roomModal')).toBeVisible();
    await expect(page.locator('#chooseCreateRoomBtn')).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: /^创建房间/ })).toBeVisible();
  }
  const stored = await page.evaluate(() => [
    localStorage.getItem('hearts-online-room-id'),
    localStorage.getItem('hearts-online-reconnect-token'),
    localStorage.getItem('hearts-by-duanap-room-id'),
    localStorage.getItem('hearts-by-duanap-reconnect-token')
  ]);
  expect(stored).toEqual([null, null, null, null]);
}

async function rejectTakeover(host, variant) {
  if (variant === 'legacy') {
    await expect(host.locator('#aiPromptModal')).toBeVisible({ timeout: 7000 });
    await expect(host.locator('#aiPromptTitle')).toHaveText('有人申请接管 AI');
    await expect(host.locator('#aiPromptLaterBtn')).toHaveText('拒绝');
    await host.locator('#aiPromptLaterBtn').click();
    await expect(host.locator('#aiPromptModal')).toBeHidden();
    return;
  }
  const requests = host.locator('.room-takeover-requests');
  await expect(requests).toBeVisible({ timeout: 7000 });
  await requests.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(requests).toBeHidden();
}

test('Vue 房间表单、顶部工具顺序和非房主权限符合旧版流程', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext({ ...contextOptions, baseURL });
  const guestContext = await browser.newContext({ ...contextOptions, baseURL });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await openEntry(host, 'vue');
    await expect(host.locator('.legacy-top-actions button')).toHaveText(['全屏', '房间', 'QQ登录', '设置']);

    await host.getByRole('button', { name: '关闭联机房间' }).click({ position: { x: 12, y: 12 } });
    await expect(host.locator('.legacy-room-modal')).toBeHidden();
    await host.locator('.legacy-top-actions').getByRole('button', { name: '房间', exact: true }).click();
    await expect(host.locator('.legacy-room-modal')).toBeVisible();

    await host.getByRole('button', { name: /加入房间/ }).click();
    let panel = host.locator('.room-panel.mode-join');
    await expect(panel.locator('.room-actions button')).toHaveText(['刷新缓存', '加入房间', '返回重新', '关闭']);
    const joinFields = await panel.locator('.room-field').evaluateAll(fields => fields.map(field => {
      const label = field.querySelector(':scope > span')?.getBoundingClientRect();
      const input = field.querySelector('input')?.getBoundingClientRect();
      return { labelY: Math.round(label?.y || 0), inputY: Math.round(input?.y || 0) };
    }));
    joinFields.forEach(field => expect(Math.abs(field.labelY - field.inputY)).toBeLessThanOrEqual(14));

    await panel.getByLabel('房间号').fill('12');
    await panel.getByRole('button', { name: '加入房间', exact: true }).click();
    const inlineError = panel.locator('.room-field').filter({ hasText: '房间号' }).locator('.room-field-error');
    await expect(inlineError).toHaveText('请输入 4 位数字房间号。');
    await expect(panel.getByLabel('房间号')).toHaveAttribute('aria-invalid', 'true');
    await panel.getByLabel('房间号').fill('0000');
    await panel.getByRole('button', { name: '加入房间', exact: true }).click();
    await expect(inlineError).toContainText('房间不存在');
    await expect(panel.locator('.panel-message')).toHaveCount(0);
    await panel.getByLabel('房间号').fill('1234');
    await expect(inlineError).toBeHidden();

    await panel.getByRole('button', { name: '返回重新' }).click();
    await host.getByRole('button', { name: /创建房间/ }).click();
    panel = host.locator('.room-panel.mode-create');
    await expect(panel.locator('.room-actions button')).toHaveText(['刷新缓存', '确认创建', '返回重新', '关闭']);
    const createActions = await panel.locator('.room-actions button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y) };
    }));
    createActions.slice(1).forEach(box => expect(Math.abs(box.y - createActions[0].y)).toBeLessThanOrEqual(2));
    for (let index = 1; index < createActions.length; index += 1) {
      expect(createActions[index].x).toBeGreaterThan(createActions[index - 1].x);
    }
    await panel.getByLabel('昵称').fill('权限房主');
    await panel.getByRole('button', { name: '确认创建' }).click();
    const statusPanel = host.locator('.legacy-room-modal .room-panel');
    await expect(statusPanel.locator('.panel-header strong')).toHaveText(/^房间号 \d{4}$/);
    const roomId = (await statusPanel.locator('.panel-header strong').textContent()).match(/\d{4}/)[0];
    await expect(statusPanel.getByRole('button', { name: '解散房间' })).toBeVisible();

    await openEntry(guest, 'vue');
    await joinRoom(guest, 'vue', '普通玩家', roomId);
    const guestPanel = guest.locator('.legacy-room-modal .room-panel');
    await expect(guestPanel.getByRole('button', { name: '解散房间' })).toHaveCount(0);
    const leave = guestPanel.getByRole('button', { name: '退出房间', exact: true });
    await expect(leave).toBeVisible();
    expect(await leave.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
    await expect(guestPanel).not.toContainText('UUID');
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 房间状态完整展示四名玩家、房主、在线和已传牌状态`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));

      const host = roomSet.pages[0];
      await openRoomStatus(host, variant, roomSet.roomId);
      const rows = roomRows(host, variant);
      await expect(rows).toHaveCount(4);
      await expect(rows.filter({ hasText: '验收甲' })).toContainText('房主');
      for (const nickname of ['验收甲', '验收乙', '验收丙', '验收丁']) {
        await expect(rows.filter({ hasText: nickname })).toContainText('在线');
      }
      await closeRoomStatus(host, variant);

      await submitPass(roomSet.pages[1], variant);
      const passedRow = await expectPlayerStatus(host, variant, roomSet.roomId, '验收乙', '已传牌');
      await expect(passedRow).toContainText('在线');
      await expect(passedRow).not.toContainText(/离线|AI托管|已退出/);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 主动退出会清理本地身份，AI 补位后牌局可完成并允许原玩家重返`, async ({ browser, baseURL }) => {
    test.setTimeout(240000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      await leaveRoomWithConfirmation(roomSet.pages[1], variant, roomSet.roomId);
      await expectRoomChoice(roomSet.pages[1], variant);

      await expectPlayerStatus(roomSet.pages[0], variant, roomSet.roomId, '验收乙', '已退出');
      if (variant === 'legacy') await roomSet.pages[0].locator('#fillBotsBtn').click();
      else await roomSet.pages[0].getByRole('button', { name: 'AI补位', exact: true }).click();
      const managedRow = await expectPlayerStatus(roomSet.pages[0], variant, roomSet.roomId, '验收乙', 'AI托管');
      await expect(managedRow).toContainText('AI');
      await closeRoomStatus(roomSet.pages[0], variant);

      const activePages = [roomSet.pages[0], roomSet.pages[2], roomSet.pages[3]];
      await Promise.all(activePages.map(page => submitPass(page, variant)));
      const result = await playCompleteRound(activePages, variant, { timeout: 180000 });
      expect(result.humanPlays).toBeGreaterThan(20);

      await joinRoom(roomSet.pages[1], variant, '验收乙', roomSet.roomId, { expectRoomStatus: false });
      const restoredRow = await expectPlayerStatus(roomSet.pages[0], variant, roomSet.roomId, '验收乙', '在线');
      await expect(restoredRow).not.toContainText(/AI|已退出/);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 房主拒绝纯 AI 接管后申请者收到通知且可以再次申请`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const errors = [];
    const hostContext = await browser.newContext({ ...contextOptions, baseURL });
    const requesterContext = await browser.newContext({ ...contextOptions, baseURL });
    const host = await hostContext.newPage();
    const requester = await requesterContext.newPage();
    collectBrowserErrors(host, `${variant}-reject-host`, errors);
    collectBrowserErrors(requester, `${variant}-reject-requester`, errors);

    try {
      await openEntry(host, variant);
      const roomId = await createRoom(host, variant, '拒绝房主');
      if (variant === 'legacy') await host.locator('#fillBotsBtn').click();
      else await host.getByRole('button', { name: 'AI补位开始' }).click();
      await waitForPassPhase(host, variant);

      await openEntry(requester, variant);
      await joinRoom(requester, variant, '拒绝新人', roomId, { expectRoomStatus: false });
      await rejectTakeover(host, variant);

      const notice = requester.locator(variant === 'legacy' ? '#actionToast' : '.global-notice-toast');
      await expect(notice).toContainText('房主暂未批准接管 AI 座位');
      if (variant === 'vue') {
        const layers = await requester.evaluate(() => ({
          notice: Number.parseInt(getComputedStyle(document.querySelector('.global-notice-layer')).zIndex, 10),
          room: Number.parseInt(getComputedStyle(document.querySelector('.legacy-room-modal')).zIndex, 10)
        }));
        expect(layers.notice).toBeGreaterThan(layers.room);
      }
      await expect(handLocator(requester, variant)).toHaveCount(0);

      if (variant === 'legacy') await requester.locator('#joinRoomBtn').click();
      else await requester.getByRole('button', { name: '加入房间', exact: true }).click();
      await rejectTakeover(host, variant);
      expect(errors, errors.join('\n')).toEqual([]);
    } finally {
      await Promise.all([hostContext.close().catch(() => {}), requesterContext.close().catch(() => {})]);
    }
  });
}
