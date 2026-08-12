const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playSelectedCard
} = require('./helpers/game-flow');
const {
  captureValidatedLandscape,
  stableOrientationEvidence
} = require('./helpers/orientation');

const landscapeContext = {
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
};

async function applyBusyFixture(request, roomId) {
  const response = await request.post('/__e2e__/fixture', {
    data: {
      roomId,
      hands: [['C2', 'C3'], [], [], []],
      trick: [
        { player: 1, cardId: 'C10' },
        { player: 2, cardId: 'C11' },
        { player: 3, cardId: 'C12' }
      ],
      trickNo: 2,
      currentPlayer: 0,
      heartsBroken: true
    }
  });
  expect(response.status()).toBe(200);
}

async function assertLandscapeSnapshot(page, testInfo, name, masks = []) {
  const evidence = await captureValidatedLandscape(page, testInfo, name);
  expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
    `${name}.orientation.json`
  );
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
  test(`${variant} 结算忙碌提示在真实手机横屏内完整可见`, async ({ browser, baseURL, request }, testInfo) => {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      const page = roomSet.pages[0];
      await applyBusyFixture(request, roomSet.roomId);
      const tableCards = page.locator(variant === 'legacy' ? '.trick-area .slot .card' : '.trick-panel .trick-play .game-card');
      await expect(tableCards).toHaveCount(3);
      const tableCardBoxes = await tableCards.evaluateAll(cards => cards.map(card => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      }));
      tableCardBoxes.forEach(box => {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(844);
        expect(box.bottom).toBeLessThanOrEqual(390);
        expect(box.width).toBeGreaterThanOrEqual(variant === 'vue' ? 54 : 58);
        expect(box.height).toBeGreaterThanOrEqual(variant === 'vue' ? 76 : 82);
      });
      const reminder = page.locator(variant === 'legacy' ? '#yourTurnReminder' : '.your-turn-reminder-vue');
      await expect(reminder).toHaveText('轮到你出牌');
      const reminderBox = await reminder.boundingBox();
      expect(reminderBox).not.toBeNull();
      expect(reminderBox.x).toBeGreaterThanOrEqual(0);
      expect(reminderBox.y).toBeGreaterThanOrEqual(0);
      expect(reminderBox.x + reminderBox.width).toBeLessThanOrEqual(844);
      expect(reminderBox.y + reminderBox.height).toBeLessThanOrEqual(390);
      await expect(reminder).toBeHidden({ timeout: 2500 });
      const card = id => page.locator(variant === 'legacy'
        ? `#hand .card[data-id="${id}"]`
        : `.hand-panel .game-card[data-id="${id}"]`);
      await expect(card('C2')).toBeVisible();
      await playSelectedCard(page, variant, card('C2'));
      await expect(card('C3')).toBeVisible();
      if (variant === 'vue') await expect(page.locator('.hand-panel .game-card.unplayable')).toHaveCount(0);
      await card('C3').click({ force: true });

      const hint = page.locator(variant === 'legacy' ? '#handTip:not(.hidden)' : '.hand-panel .hand-hint');
      await expect(hint).toHaveText('正在结算本墩，请稍等。');
      const box = await hint.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(844);
      expect(box.y + box.height).toBeLessThanOrEqual(390);

      await assertLandscapeSnapshot(page, testInfo, `${variant}-illegal-busy-physical-landscape`, [
        page.locator('.avatar, .seat-avatar'),
        page.getByRole('button', { name: /^房间 \d{4}$/ })
      ]);
      if (variant === 'vue') {
        const northResponse = await request.post('/__e2e__/fixture', {
          data: {
            roomId: roomSet.roomId,
            hands: [['C2'], ['D2'], ['S2'], ['H2']],
            trick: [],
            trickNo: 3,
            currentPlayer: 2,
            heartsBroken: true
          }
        });
        expect(northResponse.status()).toBe(200);
        const indicator = page.locator('.seat-north .seat-turn-indicator');
        await expect(indicator).toBeVisible();
        const indicatorBox = await indicator.boundingBox();
        expect(indicatorBox.x).toBeGreaterThanOrEqual(0);
        expect(indicatorBox.y).toBeGreaterThanOrEqual(0);
        expect(indicatorBox.x + indicatorBox.width).toBeLessThanOrEqual(844);
        expect(indicatorBox.y + indicatorBox.height).toBeLessThanOrEqual(390);
      }
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
