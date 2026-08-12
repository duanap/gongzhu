const { expect } = require('@playwright/test');

const variants = {
  legacy: {
    path: '/',
    handCards: '#hand .card',
    selectableCards: '#hand .card:not(.selected)',
    playableCards: '#hand .card.legal',
    playButton: '#centerBtn'
  },
  vue: {
    path: '/vue/',
    handCards: '.hand-panel .game-card',
    selectableCards: '.hand-panel .game-card:not(.selected)',
    playableCards: '.hand-panel .game-card.playable',
    playButton: '.hand-panel .primary-button'
  }
};

function collectBrowserErrors(page, label, errors) {
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location();
    const source = location.url ? ` (${location.url}:${location.lineNumber || 0})` : '';
    errors.push(`${label} console: ${message.text()}${source}`);
  });
  page.on('pageerror', error => errors.push(`${label} pageerror: ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${label} response ${response.status()}: ${response.url()}`);
  });
}

async function openEntry(page, variant) {
  const config = variants[variant];
  await page.goto(config.path, { waitUntil: 'networkidle' });
  if (variant === 'legacy') await expect(page.locator('#roomModal')).toBeVisible();
  else await expect(page.getByRole('button', { name: /^创建房间/ })).toBeVisible();
}

async function createRoom(page, variant, nickname) {
  if (variant === 'legacy') {
    await page.locator('#chooseCreateRoomBtn').click();
    await page.locator('#nicknameInput').fill(nickname);
    await page.locator('#createRoomBtn').click();
    await expect(page.locator('#roomIdInput')).toHaveValue(/^\d{4}$/);
    return page.locator('#roomIdInput').inputValue();
  }

  await page.getByRole('button', { name: /创建房间/ }).click();
  await page.getByLabel('昵称').fill(nickname);
  await page.getByRole('button', { name: '确认创建' }).click();
  const heading = page.locator('.panel-header strong');
  await expect(heading).toContainText(/^房间号 \d{4}$/);
  return (await heading.textContent()).match(/\d{4}/)[0];
}

async function joinRoom(page, variant, nickname, roomId, { expectRoomStatus = true } = {}) {
  if (variant === 'legacy') {
    await page.locator('#chooseJoinRoomBtn').click();
    await page.locator('#nicknameInput').fill(nickname);
    await page.locator('#roomIdInput').fill(roomId);
    await page.locator('#joinRoomBtn').click();
    if (expectRoomStatus) await expect(page.locator('#roomStatus')).toContainText('已连接');
    return;
  }

  await page.getByRole('button', { name: /加入房间/ }).click();
  await page.getByLabel('昵称').fill(nickname);
  await page.getByLabel('房间号').fill(roomId);
  await page.getByRole('button', { name: '加入房间', exact: true }).click();
  if (expectRoomStatus) await expect(page.locator('.room-status')).toContainText('已连接');
}

async function createFourPlayerRoom(browser, baseURL, variant, contextOptions = {}) {
  const contexts = [];
  const pages = [];
  const errors = [];
  const names = ['验收甲', '验收乙', '验收丙', '验收丁'];

  for (let index = 0; index < 4; index++) {
    const context = await browser.newContext({
      baseURL,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      viewport: { width: 1440, height: 900 },
      screen: { width: 1440, height: 900 },
      ...contextOptions
    });
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    collectBrowserErrors(page, `${variant}-${index + 1}`, errors);
  }

  try {
    await openEntry(pages[0], variant);
    const roomId = await createRoom(pages[0], variant, names[0]);
    for (let index = 1; index < pages.length; index++) {
      await openEntry(pages[index], variant);
      await joinRoom(pages[index], variant, names[index], roomId, {
        expectRoomStatus: index < pages.length - 1
      });
    }
    return { contexts, pages, errors, roomId };
  } catch {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
    throw error;
  }
}

async function waitForPassPhase(page, variant) {
  const config = variants[variant];
  await expect(page.locator(config.handCards)).toHaveCount(13, { timeout: 15000 });
  if (variant === 'legacy') {
    const roomModal = page.locator('#roomModal');
    if (await roomModal.isVisible().catch(() => false)) {
      await page.locator('#closeRoomBtn').click();
      await expect(roomModal).toBeHidden();
    }
    await expect(page.locator('#centerBtn')).toContainText('传递', { timeout: 15000 });
  } else {
    await expect(page.getByRole('button', { name: /^传牌 0\/3$/ })).toBeVisible({ timeout: 15000 });
  }
}

async function submitPass(page, variant) {
  const config = variants[variant];
  for (let index = 0; index < 3; index++) {
    const cards = page.locator(config.selectableCards);
    await expect(cards).not.toHaveCount(0);
    await cards.last().click();
  }

  if (variant === 'legacy') {
    await expect(page.locator('#centerBtn')).toBeEnabled();
    await page.locator('#centerBtn').click();
  } else {
    const button = page.getByRole('button', { name: /^传牌 3\/3$/ });
    await expect(button).toBeEnabled();
    await button.click();
  }
}

function playButton(page, variant) {
  return page.locator(variants[variant].playButton).filter({ hasText: '出牌' });
}

async function playSelectedCard(page, variant, card) {
  const alreadySelected = variant === 'vue' && /(?:^|\s)selected(?:\s|$)/.test(
    await card.getAttribute('class', { timeout: 900 }) || ''
  );
  if (!alreadySelected) {
    try {
      await card.click({ timeout: 900 });
    } catch (error) {
      // 刚换入或刚收墩的牌仍可能处于短暂位移动画；只在首轮稳定性
      // 等待失败时延长同一次点击，不绕过可见性和遮挡检查。
      await card.click({ timeout: 1800 });
    }
  }
  const button = playButton(page, variant);
  if (variant === 'vue') {
    // Vue requires an explicit selection before the confirmation button becomes
    // active. Assert that intermediate state so this helper cannot accidentally
    // mask a regression back to one-click card submission.
    await expect(card).toHaveClass(/\bselected\b/, { timeout: 900 });
  }
  // 收墩动画的短暂状态可能仍把上一手的合法牌留在 DOM 中；快速重试
  // 比等待 Playwright 默认 5 秒更贴近真实的可出牌时机。
  await expect(button).toBeEnabled({ timeout: 900 });
  await button.click({ timeout: 900 });
}

async function isRoundEnd(page, variant) {
  const selector = variant === 'legacy' ? '#message' : '.table-status-panel';
  const text = await page.locator(selector).textContent().catch(() => '');
  return text.includes('本局结束');
}

async function handleSweepOffer(page, variant) {
  if (variant === 'legacy') {
    const modal = page.locator('#sweepModal');
    if (await modal.isVisible().catch(() => false)) {
      await page.locator('#confirmSweepBtn').click();
      return true;
    }
    return false;
  }

  const button = page.getByRole('button', { name: '确认甩牌' });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return true;
  }
  return false;
}

async function playCompleteRound(pages, variant, options = {}) {
  const config = variants[variant];
  const deadline = Date.now() + Number(process.env.E2E_ROUND_TIMEOUT || options.timeout || 150000);
  let humanPlays = 0;
  let sweepAccepted = false;
  let progressCaptured = false;
  const lastClickErrors = new Map();

  while (Date.now() < deadline) {
    if (await isRoundEnd(pages[0], variant)) break;

    let acted = false;
    for (const page of pages) {
      if (await handleSweepOffer(page, variant)) {
        sweepAccepted = true;
        acted = true;
        break;
      }

      const playable = page.locator(config.playableCards);
      const count = await playable.count();
      if (!count) continue;
      try {
        await playSelectedCard(page, variant, playable.last());
        humanPlays++;
        acted = true;
        if (!progressCaptured && typeof options.onProgress === 'function') {
          const remainingCards = (await Promise.all(
            pages.map(candidate => candidate.locator(config.handCards).count())
          )).reduce((sum, count) => sum + count, 0);
          const acceptedPlays = 52 - remainingCards;
          if (acceptedPlays >= Number(options.captureAfterPlays || 8)) {
            progressCaptured = true;
            await options.onProgress({ acceptedPlays, humanPlays });
          }
        }
        break;
      } catch (error) {
        // 服务端状态广播会在 count 与 click 之间替换手牌 DOM；下一轮按最新合法牌重试。
        lastClickErrors.set(page, String(error));
        if (!/Timeout|detached|Test ended/i.test(String(error))) throw error;
      }
    }

    if (!acted) await pages[0].waitForTimeout(100);
  }

  if (!(await isRoundEnd(pages[0], variant))) {
    const diagnostics = await Promise.all(pages.map(async (page, index) => ({
      index,
      handCount: await page.locator(config.handCards).count(),
      playableCount: await page.locator(config.playableCards).count(),
      status: await page.locator(variant === 'legacy' ? '#message' : '.table-status-panel').textContent().catch(() => ''),
      visibleDialogs: await page.locator('[role="dialog"]:visible, .modal:not(.hidden):visible').count(),
      clickError: lastClickErrors.get(page)?.split('\n').slice(0, 18).join(' | ') || ''
    })));
    throw new Error(`${variant} did not reach roundEnd before the timeout; human plays=${humanPlays}; states=${JSON.stringify(diagnostics)}`);
  }
  expect(humanPlays, `${variant} 必须通过真人 UI 完成出牌`).toBeGreaterThan(20);
  const remainingCards = (await Promise.all(
    pages.map(page => page.locator(config.handCards).count())
  )).reduce((sum, count) => sum + count, 0);
  expect(remainingCards, `${variant} 结算时四家手牌必须全部出完`).toBe(0);

  if (variant === 'legacy') {
    await expect(pages[0].locator('#centerBtn')).toHaveText('开始下一局');
    await expect(pages[0].locator('#viewRoundTableBtn')).toBeVisible();
  } else {
    await expect(pages[0].locator('.table-status-panel')).toContainText('本局结束');
    await expect(pages[0].getByRole('button', { name: '开始下一局' })).toBeVisible();
    await expect(pages[0].getByRole('button', { name: '查看牌桌' })).toBeVisible();
  }

  return { acceptedPlays: 52 - remainingCards, humanPlays, sweepAccepted };
}

async function closeRoomSet(roomSet) {
  await Promise.all(roomSet.contexts.map(context => context.close().catch(() => {})));
}

module.exports = {
  closeRoomSet,
  collectBrowserErrors,
  createRoom,
  createFourPlayerRoom,
  joinRoom,
  openEntry,
  playButton,
  playCompleteRound,
  playSelectedCard,
  submitPass,
  variants,
  waitForPassPhase
};
