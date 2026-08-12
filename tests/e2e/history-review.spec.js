const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  submitPass,
  variants,
  waitForPassPhase
} = require('./helpers/game-flow');

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

function lastTrickSelectors(variant) {
  if (variant === 'legacy') {
    return {
      button: '#lastTrickBtn',
      popover: '#lastTrickPopover:not(.hidden)',
      seats: '#lastTrickPopover .last-trick-seat span',
      result: '#lastTrickPopover .last-trick-result'
    };
  }
  return {
    button: '.last-trick-btn-vue',
    popover: '.last-trick-popover-vue',
    seats: '.last-trick-popover-vue .last-trick-seat-vue span',
    result: '.last-trick-popover-vue .last-trick-result-vue'
  };
}

async function finishBySweep(page, variant) {
  const confirm = variant === 'legacy'
    ? page.locator('#confirmSweepBtn')
    : page.getByRole('dialog', { name: '可以甩牌' }).getByRole('button', { name: '确认甩牌' });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.locator(variant === 'legacy' ? '#message' : '.table-status-panel')).toContainText('本局结束');
}

async function openRoundTable(page, variant) {
  if (variant === 'legacy') await page.locator('#viewRoundTableBtn').click();
  else await page.getByRole('button', { name: '查看牌桌' }).click();
  const modal = page.locator(variant === 'legacy' ? '#roundTableModal:not(.hidden)' : '.legacy-round-table-modal');
  await expect(modal).toBeVisible();
  return modal;
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 上一墩仅在本家可操作时出现并按领出顺序展示`, async ({ browser, baseURL, request }) => {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      const page = roomSet.pages[0];
      await closeLegacyRoomPanel(page, variant);
      const selectors = lastTrickSelectors(variant);

      await applyFixture(request, roomSet.roomId, { ...lastTrickFixture, currentPlayer: 1 });
      await expect(page.locator(selectors.button)).toBeHidden();
      await applyFixture(request, roomSet.roomId, lastTrickFixture);
      await expect(page.locator(selectors.button)).toBeVisible();
      await page.locator(selectors.button).click();

      await expect(page.locator(selectors.popover)).toBeVisible();
      await expect(page.locator(selectors.seats)).toHaveText(['对家', '下家', '本家', '上家']);
      await expect(page.locator(selectors.result)).toContainText('验收丁');
      await expect(page.locator(selectors.result)).toContainText('14');
      await expect(page.locator(selectors.popover)).toContainText('本墩包含 2 张分牌');
      await expect(page.locator(selectors.popover)).toContainText('梅花首出');
      if (variant === 'vue') {
        await expect(page.locator(selectors.popover)).not.toContainText('TRICK');
      }
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 局末牌桌完整展示四家手牌、换入、传出和分数`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
      const page = roomSet.pages[0];
      await expect(page.locator(variant === 'legacy' ? '.pass-flight-card' : '.pass-flight-card-vue')).toHaveCount(12);
      await applyFixture(request, roomSet.roomId, sweepFixture);
      await finishBySweep(page, variant);
      const modal = await openRoundTable(page, variant);
      const rows = modal.locator('.round-player-panel');
      await expect(rows).toHaveCount(4);

      for (let index = 0; index < 4; index++) {
        const row = rows.nth(index);
        const handCards = row.locator(variant === 'legacy' ? '.round-hand-block .round-mini-card' : '.round-hand-block .game-card');
        const passedCards = row.locator(variant === 'legacy' ? '.round-card-strip.pass-cards .round-mini-card' : '.round-card-strip.pass-cards .game-card');
        await expect(handCards).toHaveCount(13);
        await expect(passedCards).toHaveCount(3);
      }

      const received = modal.locator(variant === 'legacy' ? '.round-mini-card.received' : '.round-card-strip.received-cards .game-card');
      const passed = modal.locator(variant === 'legacy' ? '.round-card-strip.pass-cards .round-mini-card' : '.round-card-strip.pass-cards .game-card');
      await expect(received).toHaveCount(12);
      await expect(passed).toHaveCount(12);
      await expect(rows.locator('.round-player-meta')).toHaveText(['本家 / 自己', '上家', '对家', '下家']);
      await expect(rows.nth(0).locator('.round-score-pair')).toContainText('本局 2');
      await expect(rows.nth(0).locator('.round-score-pair')).toContainText('总分 2');

      if (variant === 'vue') {
        await expect(modal.locator('.detail-section')).toHaveCount(1);
        await expect(modal).not.toContainText('ROUND REVIEW');
        await expect(modal).not.toContainText('开局手牌');
        await expect(modal).not.toContainText('传牌去向');
        await expect(modal.locator('.round-transfer-line')).toHaveCount(4);
        await expect(modal.locator('.round-transfer-line').first()).toContainText(/传给.+（.+家）/);
        await expect(modal.locator('.round-transfer-line').first()).toContainText(/收到.+（.+家）/);
        const cardColors = await modal.locator('.game-card').evaluateAll(cards => cards.map(card => ({
          red: card.classList.contains('red'),
          rank: getComputedStyle(card.querySelector('.card-corner strong')).color,
          pip: getComputedStyle(card.querySelector('.card-pip')).color
        })));
        expect(cardColors.some(card => card.red)).toBe(true);
        expect(cardColors.some(card => !card.red)).toBe(true);
        cardColors.forEach(card => {
          const expectedColor = card.red ? 'rgb(197, 31, 45)' : 'rgb(23, 23, 23)';
          expect(card.rank).toBe(expectedColor);
          expect(card.pip).toBe(expectedColor);
        });
      }
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
