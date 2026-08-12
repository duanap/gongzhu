const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playSelectedCard,
  submitPass,
  waitForPassPhase
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

const finalTrickFixture = {
  hands: [['H2'], [], [], []],
  trick: [
    { player: 1, cardId: 'C10' },
    { player: 2, cardId: 'C11' },
    { player: 3, cardId: 'C12' }
  ],
  trickNo: 12,
  currentPlayer: 0,
  heartsBroken: true,
  roundScores: [0, 1, 2, 3],
  totalScores: [10, 20, 30, 99]
};

async function finishGame(roomSet, request, variant) {
  await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
  await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
  await expect(roomSet.pages[0].locator(variant === 'legacy' ? '.pass-flight-card' : '.pass-flight-card-vue')).toHaveCount(12);
  const response = await request.post('/__e2e__/fixture', {
    data: { roomId: roomSet.roomId, ...finalTrickFixture }
  });
  expect(response.status()).toBe(200);
  const card = roomSet.pages[0].locator(variant === 'legacy'
    ? '#hand .card[data-id="H2"]'
    : '.hand-panel .game-card[data-id="H2"]');
  await playSelectedCard(roomSet.pages[0], variant, card);
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
  test(`${variant} 整场结果在真实手机横屏中完整展示赢家和房主操作`, async ({ browser, baseURL, request }, testInfo) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      const page = roomSet.pages[0];
      await finishGame(roomSet, request, variant);
      const layer = page.locator(variant === 'legacy' ? '#resultModal:not(.hidden)' : '.result-modal-layer');
      const card = layer.locator(variant === 'legacy' ? '.result-card' : '.result-card');
      await expect(layer).toBeVisible({ timeout: 8000 });
      await expect(layer).toContainText('验收甲 获胜！');
      await expect(layer.locator('.result-player-card')).toHaveCount(4);
      await expect(layer.getByRole('button', { name: '再来一局' })).toBeVisible();
      await expect(layer.getByRole('button', { name: '查看更新内容' })).toBeVisible();
      await expect(layer.getByRole('button', { name: '查看牌桌' })).toBeVisible();

      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(844);
      expect(box.y + box.height).toBeLessThanOrEqual(390);
      const actions = await layer.locator(variant === 'legacy' ? '.modal-actions' : '.result-actions').boundingBox();
      expect(actions).not.toBeNull();
      expect(actions.x).toBeGreaterThanOrEqual(box.x);
      expect(actions.x + actions.width).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(actions.y + actions.height).toBeLessThanOrEqual(box.y + box.height + 1);

      await assertLandscapeSnapshot(page, testInfo, `${variant}-game-end-physical-landscape`, [
        page.locator('.avatar, .seat-avatar'),
        page.getByRole('button', { name: /^房间 \d{4}$/ })
      ]);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
