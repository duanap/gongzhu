const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
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

const lastTrickFixture = {
  hands: [['C2', 'D2'], ['C3'], ['C4'], ['C5']],
  trick: [],
  trickNo: 5,
  currentPlayer: 0,
  heartsBroken: true,
  lastTrick: {
    leadSuit: 'C',
    leaderPlayer: 2,
    winnerPlayer: 3,
    winningRank: 14,
    points: 14,
    cards: [
      { player: 0, cardId: 'H4' },
      { player: 1, cardId: 'S12' },
      { player: 2, cardId: 'C10' },
      { player: 3, cardId: 'C14' }
    ]
  }
};

const sweepFixture = {
  hands: [['S13', 'S14'], ['H2', 'H3'], ['D2', 'D3'], ['C3', 'C4']],
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

async function applyFixture(request, roomId, fixture) {
  const response = await request.post('/__e2e__/fixture', { data: { roomId, ...fixture } });
  expect(response.status()).toBe(200);
}

async function closeLegacyRoomPanel(page, variant) {
  if (variant !== 'legacy') return;
  const modal = page.locator('#roomModal');
  if (await modal.isVisible().catch(() => false)) await page.locator('#closeRoomBtn').click();
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
  test(`${variant} 上一墩内容在真实手机横屏内完整可见`, async ({ browser, baseURL, request }, testInfo) => {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      const page = roomSet.pages[0];
      await closeLegacyRoomPanel(page, variant);
      await applyFixture(request, roomSet.roomId, lastTrickFixture);
      const button = page.locator(variant === 'legacy' ? '#lastTrickBtn' : '.last-trick-btn-vue');
      await expect(button).toBeVisible();
      await button.click();

      const popover = page.locator(variant === 'legacy' ? '#lastTrickPopover:not(.hidden)' : '.last-trick-popover-vue');
      await expect(popover).toBeVisible();
      const box = await popover.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(844);
      expect(box.y + box.height).toBeLessThanOrEqual(390);
      if (variant === 'vue') {
        expect(box.width).toBeGreaterThanOrEqual(694);
        expect(box.width).toBeLessThanOrEqual(704);
        expect(box.height).toBeLessThanOrEqual(300);
      }
      const plays = popover.locator(variant === 'legacy' ? '.last-trick-play' : '.last-trick-play-vue');
      await expect(plays).toHaveCount(4);
      const playBoxes = await plays.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (const playBox of playBoxes) {
        expect(playBox.left).toBeGreaterThanOrEqual(box.x);
        expect(playBox.right).toBeLessThanOrEqual(box.x + box.width + 1);
        expect(playBox.top).toBeGreaterThanOrEqual(box.y);
        expect(playBox.bottom).toBeLessThanOrEqual(box.y + box.height + 1);
      }

      await assertLandscapeSnapshot(page, testInfo, `${variant}-last-trick-review-physical-landscape`, [
        page.locator('.avatar, .seat-avatar'),
        page.getByRole('button', { name: /^房间 \d{4}$/ })
      ]);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 完整牌桌回看在真实手机横屏中保持清晰座位布局`, async ({ browser, baseURL, request }, testInfo) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
      const page = roomSet.pages[0];
      await expect(page.locator(variant === 'legacy' ? '.pass-flight-card' : '.pass-flight-card-vue')).toHaveCount(12);
      await applyFixture(request, roomSet.roomId, sweepFixture);
      const confirm = variant === 'legacy'
        ? page.locator('#confirmSweepBtn')
        : page.getByRole('dialog', { name: '可以甩牌' }).getByRole('button', { name: '确认甩牌' });
      await confirm.click();
      await expect(page.locator(variant === 'legacy' ? '#message' : '.table-status-panel')).toContainText('本局结束');
      if (variant === 'legacy') await page.locator('#viewRoundTableBtn').click();
      else await page.getByRole('button', { name: '查看牌桌' }).click();

      const modal = page.locator(variant === 'legacy' ? '#roundTableModal:not(.hidden) .round-table-card' : '.mobile-tool-sheet.round-table-modal');
      await expect(modal).toBeVisible();
      if (variant === 'vue') {
        const centers = await modal.locator('.round-review-heading').evaluate(heading => {
          const modalBox = heading.closest('.round-table-modal').getBoundingClientRect();
          const titleBox = heading.querySelector('strong').getBoundingClientRect();
          return {
            modal: modalBox.left + modalBox.width / 2,
            title: titleBox.left + titleBox.width / 2
          };
        });
        expect(Math.abs(centers.modal - centers.title)).toBeLessThanOrEqual(2);
      }
      const box = await modal.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(844);
      expect(box.y + box.height).toBeLessThanOrEqual(390);

      const rows = modal.locator('.round-player-panel');
      await expect(rows).toHaveCount(4);
      if (variant === 'vue') {
        const cardRatios = await rows.first().locator('.round-hand-block .game-card').evaluateAll(cards => cards.slice(0, 2).map(card => {
          const rect = card.getBoundingClientRect();
          return rect.width / rect.height;
        }));
        cardRatios.forEach(ratio => expect(ratio).toBeGreaterThan(0.64));
        cardRatios.forEach(ratio => expect(ratio).toBeLessThan(0.75));
        const cardVisuals = await modal.locator('.game-card').evaluateAll(cards => cards.map(card => {
          return {
            red: card.classList.contains('red'),
            rankColor: getComputedStyle(card.querySelector('.card-corner strong')).color,
            pipColor: getComputedStyle(card.querySelector('.card-pip')).color
          };
        }));
        expect(cardVisuals.some(card => card.red)).toBe(true);
        expect(cardVisuals.some(card => !card.red)).toBe(true);
        cardVisuals.forEach(card => {
          const expectedColor = card.red ? 'rgb(197, 31, 45)' : 'rgb(23, 23, 23)';
          expect(card.rankColor).toBe(expectedColor);
          expect(card.pipColor).toBe(expectedColor);
        });
        const transferVisual = await rows.first().evaluate(row => {
          const label = row.querySelector('.round-transfer-line > strong');
          const passCards = row.querySelector('.round-card-strip.pass-cards');
          const labelRect = label.getBoundingClientRect();
          const passRect = passCards.getBoundingClientRect();
          return {
            titleColor: getComputedStyle(row.closest('.round-table-modal').querySelector('.round-review-heading > strong')).color,
            playerColor: getComputedStyle(row.querySelector('.round-player-name')).color,
            passGap: passRect.left - labelRect.right
          };
        });
        expect(transferVisual.titleColor).toBe('rgb(23, 23, 23)');
        expect(transferVisual.playerColor).toBe('rgb(23, 23, 23)');
        expect(transferVisual.passGap).toBeGreaterThanOrEqual(12);
      }
      const positions = await rows.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y) };
      }));
      if (variant === 'vue') {
        expect(positions[1].y).toBeGreaterThan(positions[0].y);
        expect(Math.abs(positions[0].x - positions[1].x)).toBeLessThanOrEqual(2);
      } else {
        expect(Math.abs(positions[0].y - positions[1].y)).toBeLessThanOrEqual(2);
        expect(positions[1].x).toBeGreaterThan(positions[0].x);
      }

      await page.addStyleTag({
        content: `
          .round-mini-card,
          .round-card-strip .game-card .card-corner,
          .round-card-strip .game-card .card-pip { color: transparent !important; text-shadow: none !important; }
        `
      });
      await assertLandscapeSnapshot(page, testInfo, `${variant}-round-table-review-physical-landscape`, [
        page.locator('.avatar, .seat-avatar, .round-player-avatar'),
        page.getByRole('button', { name: /^房间 \d{4}$/ })
      ]);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
