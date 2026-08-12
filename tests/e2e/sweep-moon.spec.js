const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playSelectedCard,
  variants
} = require('./helpers/game-flow');

const sweepFixture = {
  hands: [
    ['S13', 'S14'],
    ['H2', 'H3'],
    ['D2', 'D3'],
    ['C3', 'C4']
  ],
  trick: [],
  trickNo: 11,
  currentPlayer: 0,
  heartsBroken: true,
  lastTrick: {
    leadSuit: 'S',
    leaderPlayer: 0,
    winnerPlayer: 0,
    winningRank: 12,
    points: 1,
    cards: [
      { player: 0, cardId: 'S12' },
      { player: 1, cardId: 'H10' },
      { player: 2, cardId: 'D10' },
      { player: 3, cardId: 'C10' }
    ]
  }
};

const moonFixture = {
  hands: [['C14'], ['H2'], ['H3'], ['H4']],
  trick: [],
  trickNo: 12,
  currentPlayer: 0,
  heartsBroken: true,
  roundScores: [23, 0, 0, 0]
};

const heartsBrokenFixture = {
  hands: [
    ['C2', 'D14'],
    ['H2', 'H3'],
    ['D2', 'D3'],
    ['C3', 'C4']
  ],
  trick: [],
  trickNo: 1,
  currentPlayer: 0,
  heartsBroken: false
};

const queenCapturedFixture = {
  hands: [
    ['S10', 'C2'],
    ['S12', 'C3'],
    ['S2', 'C4'],
    ['S14', 'C5']
  ],
  trick: [],
  trickNo: 2,
  currentPlayer: 0,
  heartsBroken: true
};

async function applyFixture(request, roomId, fixture) {
  const response = await request.post('/__e2e__/fixture', {
    data: { roomId, ...fixture }
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, roomId });
}

function sweepDialog(page, variant) {
  return variant === 'legacy'
    ? page.locator('#sweepModal')
    : page.getByRole('dialog', { name: '可以甩牌' });
}

function sweepConfirm(page, variant) {
  return variant === 'legacy'
    ? page.locator('#confirmSweepBtn')
    : sweepDialog(page, variant).getByRole('button', { name: '确认甩牌' });
}

function roundEndStatus(page, variant) {
  return page.locator(variant === 'legacy' ? '#message' : '.table-status-panel');
}

function playerScore(page, variant, viewIndex) {
  if (variant === 'legacy') return page.locator(`#seat${viewIndex} .score-value`);
  const seatClass = ['south', 'west', 'north', 'east'][viewIndex];
  return page.locator(`.seat-${seatClass} .seat-score strong`);
}

function moonEffect(page, variant) {
  return page.locator(variant === 'legacy' ? '#moonEffect' : '.moon-effect-vue');
}

function eventToast(page, variant) {
  return page.locator(variant === 'legacy' ? '#specialEvent' : '.special-event-toast');
}

async function playFinalTrick(pages, variant) {
  const selector = variants[variant].playableCards;
  for (const page of pages) {
    const playable = page.locator(selector);
    await expect(playable).toHaveCount(1);
    await playSelectedCard(page, variant, playable);
  }
}

async function closeLegacyRoomPanels(pages, variant) {
  if (variant !== 'legacy') return;
  for (const page of pages) {
    const modal = page.locator('#roomModal');
    if (await modal.isVisible().catch(() => false)) {
      await page.locator('#closeRoomBtn').click();
      await expect(modal).toBeHidden();
    }
  }
}

async function playCardById(page, variant, cardId) {
  const hand = variant === 'legacy' ? '#hand .card' : '.hand-panel .game-card';
  const card = page.locator(`${hand}[data-id="${cardId}"]`);
  await expect(card).toBeVisible();
  await playSelectedCard(page, variant, card);
}

async function expectEventDirection(page, variant, direction) {
  const toast = eventToast(page, variant);
  const vector = await toast.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      x: Number.parseFloat(style.getPropertyValue('--special-to-x')),
      y: Number.parseFloat(style.getPropertyValue('--special-to-y'))
    };
  });
  if (direction === 'left') expect(vector.x).toBeLessThan(-page.viewportSize().width / 2);
  if (direction === 'right') expect(vector.x).toBeGreaterThan(page.viewportSize().width / 2);
  if (direction === 'up') expect(vector.y).toBeLessThan(-page.viewportSize().height / 2);
  if (direction === 'down') expect(vector.y).toBeGreaterThan(page.viewportSize().height / 2);
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 红桃破与黑桃 Q 播报保持旧版文案、顺序、颜色和飞行方向`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await closeLegacyRoomPanels(roomSet.pages, variant);
      const observer = roomSet.pages[2];

      await applyFixture(request, roomSet.roomId, heartsBrokenFixture);
      await playCardById(roomSet.pages[0], variant, 'C2');
      await playCardById(roomSet.pages[1], variant, 'H2');
      await expect(eventToast(observer, variant)).toBeVisible();
      await expect(eventToast(observer, variant)).toContainText('红桃已破');
      await expect(eventToast(observer, variant)).toContainText(/验收乙\s+打出第一张红桃，现在可以主动出红桃了。/);
      await expectEventDirection(observer, variant, 'right');
      if (variant === 'vue') {
        await expect(eventToast(observer, variant)).toHaveCSS('color', 'rgb(255, 241, 241)');
        await expect(eventToast(observer, variant)).toHaveClass(/heartsBroken/);
      }
      await expect(eventToast(observer, variant)).toBeHidden({ timeout: 5000 });

      await applyFixture(request, roomSet.roomId, queenCapturedFixture);
      await playCardById(roomSet.pages[0], variant, 'S10');
      await playCardById(roomSet.pages[1], variant, 'S12');
      await playCardById(roomSet.pages[2], variant, 'S2');
      await playCardById(roomSet.pages[3], variant, 'S14');
      await expect(eventToast(observer, variant)).toBeVisible();
      await expect(eventToast(observer, variant)).toContainText('黑桃女王入袋');
      await expect(eventToast(observer, variant)).toContainText(/验收丁\s+吃下黑桃 Q，\+13 分。/);
      await expectEventDirection(observer, variant, 'left');
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 在固定缺门牌局中确认甩牌并完成余牌结算`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      const page = roomSet.pages[0];
      await applyFixture(request, roomSet.roomId, sweepFixture);

      await expect(sweepDialog(page, variant)).toBeVisible();
      await expect(sweepDialog(page, variant)).toContainText('黑桃');
      await expect(sweepDialog(page, variant)).toContainText('2');
      await sweepConfirm(page, variant).click();

      if (variant === 'legacy') await expect(page.locator('.judge-bubble')).toHaveText('甩牌收墩');
      else await expect(page.locator('.sweep-collect-copy')).toContainText('甩牌收墩');
      await expect(roundEndStatus(page, variant)).toContainText('本局结束', { timeout: 5000 });
      await expect(playerScore(page, variant, 0).nth(0)).toHaveText('2');
      await expect(playerScore(page, variant, 0).nth(1)).toHaveText('2');
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 固定末墩射月先播放月亮动画再显示事件播报`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      const page = roomSet.pages[0];
      await applyFixture(request, roomSet.roomId, moonFixture);
      await closeLegacyRoomPanels(roomSet.pages, variant);
      await playFinalTrick(roomSet.pages, variant);

      await expect(moonEffect(page, variant)).toBeVisible({ timeout: 5000 });
      await expect(eventToast(page, variant)).toBeHidden();
      if (variant === 'vue') {
        await expect(moonEffect(page, variant)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.62)');
        await expect(page.locator('.legacy-game-stage')).toHaveCSS('filter', 'brightness(0.58) saturate(0.82)');
      }
      await expect(playerScore(page, variant, 0).nth(0)).toHaveText('26');
      await expect(playerScore(page, variant, 0).nth(1)).toHaveText('0');
      for (let index = 1; index < 4; index++) {
        await expect(playerScore(page, variant, index).nth(1)).toHaveText('26');
      }

      await expect(moonEffect(page, variant)).toBeHidden({ timeout: 5000 });
      await expect(eventToast(page, variant)).toBeVisible({ timeout: 1500 });
      await expect(eventToast(page, variant)).toContainText('射中月亮');
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
