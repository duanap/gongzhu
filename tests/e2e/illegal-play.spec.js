const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playButton,
  playSelectedCard
} = require('./helpers/game-flow');

const cases = [
  {
    name: '首轮必须先出梅花 2',
    hand: ['C2', 'D5', 'H5'],
    cardId: 'H5',
    trick: [],
    trickNo: 0,
    expected: '首轮首出必须先出梅花 2。'
  },
  {
    name: '有首出花色时必须跟牌',
    hand: ['C5', 'D5', 'H5'],
    cardId: 'H5',
    trick: [{ player: 3, cardId: 'C7' }],
    trickNo: 2,
    expected: '本墩先出的是梅花，你必须跟出同花色。'
  },
  {
    name: '红桃未破不能主动领出',
    hand: ['D5', 'H5'],
    cardId: 'H5',
    trick: [],
    trickNo: 2,
    expected: '红桃尚未破，暂时不能主动出红桃。'
  },
  {
    name: '首墩不能垫分牌',
    hand: ['D5', 'S12', 'H5'],
    cardId: 'H5',
    trick: [{ player: 3, cardId: 'C2' }],
    trickNo: 0,
    expected: '第一墩不能垫红桃或黑桃 Q。'
  }
];

function cardLocator(page, variant, cardId) {
  const root = variant === 'legacy' ? '#hand .card' : '.hand-panel .game-card';
  return page.locator(`${root}[data-id="${cardId}"]`);
}

function hintLocator(page, variant) {
  return page.locator(variant === 'legacy' ? '#handTip' : '.hand-panel .hand-hint');
}

async function applyFixture(request, roomId, fixture) {
  const response = await request.post('/__e2e__/fixture', {
    data: {
      roomId,
      hands: [fixture.hand, ['C3'], ['D3'], ['S3']],
      trick: fixture.trick,
      trickNo: fixture.trickNo,
      currentPlayer: 0,
      heartsBroken: false
    }
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, roomId });
}

async function waitForFixtureHand(page, variant, expectedIds) {
  const root = variant === 'legacy' ? '#hand .card' : '.hand-panel .game-card';
  await expect.poll(async () => (
    page.locator(root).evaluateAll(cards => cards.map(card => card.dataset.id).sort())
  )).toEqual([...expectedIds].sort());
}

async function applyRawFixture(request, roomId, data) {
  const response = await request.post('/__e2e__/fixture', {
    data: { roomId, ...data }
  });
  expect(response.status()).toBe(200);
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 选中合法牌后必须点击出牌才会提交`, async ({ browser, baseURL, request }) => {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      const page = roomSet.pages[0];
      await applyRawFixture(request, roomSet.roomId, {
        hands: [['C2'], ['C3'], ['C4'], ['C5']],
        trick: [],
        trickNo: 0,
        currentPlayer: 0,
        heartsBroken: false
      });
      await waitForFixtureHand(page, variant, ['C2']);

      const card = cardLocator(page, variant, 'C2');
      await card.click();
      await expect(card).toHaveClass(/selected/);
      await expect(playButton(page, variant)).toBeEnabled();
      await expect(page.locator(variant === 'legacy' ? '.trick-area .slot .card' : '.trick-panel .trick-play')).toHaveCount(0);

      await playButton(page, variant).click();
      await expect(card).toBeHidden({ timeout: 3000 });
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 对四类非法出牌显示与旧版一致的具体原因`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      const page = roomSet.pages[0];
      for (const [caseIndex, fixture] of cases.entries()) {
        await test.step(fixture.name, async () => {
          await applyFixture(request, roomSet.roomId, fixture);
          await waitForFixtureHand(page, variant, fixture.hand);
          if (caseIndex === 0) {
            const reminder = page.locator(variant === 'legacy' ? '#yourTurnReminder' : '.your-turn-reminder-vue');
            await expect(reminder).toHaveText('轮到你出牌');
            await expect(reminder).toBeHidden({ timeout: 2500 });
          }
          await expect(cardLocator(page, variant, fixture.cardId)).toBeVisible();
          await cardLocator(page, variant, fixture.cardId).click({ force: true });
          await expect(hintLocator(page, variant)).toHaveText(fixture.expected);
          if (caseIndex === 0) {
            await page.waitForTimeout(1000);
            await cardLocator(page, variant, fixture.cardId).click({ force: true });
            await page.waitForTimeout(900);
            if (variant === 'legacy') await expect(hintLocator(page, variant)).not.toHaveClass(/hidden/);
            else await expect(hintLocator(page, variant)).toBeVisible();
          }
          if (variant === 'legacy') await expect(hintLocator(page, variant)).toHaveClass(/hidden/, { timeout: 2500 });
          else await expect(hintLocator(page, variant)).toBeHidden({ timeout: 2500 });
        });
      }
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 非当前玩家和结算忙碌时阻止重复出牌并给出具体原因`, async ({ browser, baseURL, request }) => {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      const page = roomSet.pages[0];
      await applyRawFixture(request, roomSet.roomId, {
        hands: [['C2', 'D5'], ['C3'], ['C4'], ['C5']],
        trick: [],
        trickNo: 2,
        currentPlayer: 1,
        heartsBroken: true
      });
      await waitForFixtureHand(page, variant, ['C2', 'D5']);
      await cardLocator(page, variant, 'D5').click({ force: true });
      await expect(hintLocator(page, variant)).toHaveText('还没轮到你出牌。');
      await expect(cardLocator(page, variant, 'D5')).toBeVisible();
      if (variant === 'vue') {
        await expect(page.locator('.hand-panel .game-card.unplayable')).toHaveCount(0);
      }

      await applyRawFixture(request, roomSet.roomId, {
        hands: [['C2', 'C3'], [], [], []],
        trick: [
          { player: 1, cardId: 'C10' },
          { player: 2, cardId: 'C11' },
          { player: 3, cardId: 'C12' }
        ],
        trickNo: 2,
        currentPlayer: 0,
        heartsBroken: true
      });
      await waitForFixtureHand(page, variant, ['C2', 'C3']);
      await playSelectedCard(page, variant, cardLocator(page, variant, 'C2'));
      const status = page.locator(variant === 'legacy' ? '#message' : '.table-status-panel');
      await expect(status).toContainText(variant === 'legacy' ? '正在比牌收墩' : '正在比牌');
      await expect(cardLocator(page, variant, 'C3')).toBeVisible();
      if (variant === 'vue') {
        await expect(page.locator('.hand-panel .game-card.unplayable')).toHaveCount(0);
      }
      await cardLocator(page, variant, 'C3').click({ force: true });
      await expect(hintLocator(page, variant)).toHaveText('正在结算本墩，请稍等。');
      await expect(cardLocator(page, variant, 'C3')).toBeVisible();
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
