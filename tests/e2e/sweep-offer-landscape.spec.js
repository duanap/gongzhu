const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom
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

const fixture = {
  hands: [
    ['S13', 'S14'],
    ['H2', 'H3'],
    ['D2', 'D3'],
    ['C3', 'C4']
  ],
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

test('Vue 甩牌确认框保持真实手机横屏且完整位于窗口内', async ({ browser, baseURL, request }, testInfo) => {
  test.setTimeout(60000);
  const roomSet = await createFourPlayerRoom(browser, baseURL, 'vue', landscapeContext);
  try {
    const response = await request.post('/__e2e__/fixture', {
      data: { roomId: roomSet.roomId, ...fixture }
    });
    expect(response.status()).toBe(200);

    const page = roomSet.pages[0];
    const dialog = page.getByRole('dialog', { name: '可以甩牌' });
    await expect(dialog).toBeVisible();
    const box = await dialog.locator('.legacy-parity-card').boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    expect(box.y + box.height).toBeLessThanOrEqual(390);

    const name = 'vue-sweep-offer-physical-landscape';
    const evidence = await captureValidatedLandscape(page, testInfo, name);
    expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
      `${name}.orientation.json`
    );
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      mask: [
        page.locator('.table-seat'),
        page.locator('.room-button, .table-status-meta')
      ],
      maskColor: '#5a4b72',
      maxDiffPixelRatio: 0.02,
      scale: 'css'
    });
    expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
  } finally {
    await closeRoomSet(roomSet);
  }
});
