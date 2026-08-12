const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playSelectedCard,
  submitPass,
  waitForPassPhase
} = require('./helpers/game-flow');

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

async function applyFixture(request, roomId) {
  const response = await request.post('/__e2e__/fixture', {
    data: { roomId, ...finalTrickFixture }
  });
  expect(response.status()).toBe(200);
}

function resultModal(page, variant) {
  return page.locator(variant === 'legacy' ? '#resultModal:not(.hidden)' : '.result-modal-layer');
}

function resultRows(page, variant) {
  return resultModal(page, variant).locator('.result-player-card');
}

function playAgainButton(page, variant) {
  return variant === 'legacy'
    ? page.locator('#playAgainBtn:not(.hidden)')
    : resultModal(page, variant).getByRole('button', { name: '再来一局' });
}

function viewTableButton(page, variant) {
  return variant === 'legacy'
    ? page.locator('#viewTableBtn')
    : resultModal(page, variant).getByRole('button', { name: '查看牌桌' });
}

function viewUpdatesButton(page, variant) {
  return variant === 'legacy'
    ? page.locator('#viewVersionAfterWinBtn')
    : resultModal(page, variant).getByRole('button', { name: '查看更新内容' });
}

function roundTableModal(page, variant) {
  return page.locator(variant === 'legacy'
    ? '#roundTableModal:not(.hidden)'
    : '.legacy-round-table-modal');
}

async function closeRoundTable(page, variant) {
  if (variant === 'legacy') await page.locator('#closeRoundTableBtn').click();
  else await roundTableModal(page, variant).getByRole('button', { name: '关闭', exact: true }).click();
}

async function reopenResult(page, variant) {
  if (await resultModal(page, variant).isVisible().catch(() => false)) return;
  const button = variant === 'legacy'
    ? page.locator('#centerBtn')
    : page.locator('.table-status-panel').getByRole('button', { name: '成绩' });
  await button.click();
  await expect(resultModal(page, variant)).toBeVisible();
}

async function finishGame(roomSet, request, variant) {
  await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
  await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
  await expect(roomSet.pages[0].locator(variant === 'legacy' ? '.pass-flight-card' : '.pass-flight-card-vue')).toHaveCount(12);
  await applyFixture(request, roomSet.roomId);
  const card = roomSet.pages[0].locator(variant === 'legacy'
    ? '#hand .card[data-id="H2"]'
    : '.hand-panel .game-card[data-id="H2"]');
  await expect(card).toBeVisible();
  await playSelectedCard(roomSet.pages[0], variant, card);
  await Promise.all(roomSet.pages.map(page => expect(resultModal(page, variant)).toBeVisible({ timeout: 8000 })));
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 整场结束展示真实姓名排名且仅房主可以再来一局`, async ({ browser, baseURL, request }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await finishGame(roomSet, request, variant);
      const host = roomSet.pages[0];
      const guest = roomSet.pages[1];

      await expect(resultModal(host, variant)).toContainText('验收甲 获胜！');
      await expect(resultRows(host, variant)).toHaveCount(4);
      await expect(resultRows(host, variant)).toHaveText([
        /验收甲[\s\S]*本局\s*0[\s\S]*总分\s*10[\s\S]*胜利/,
        /验收乙[\s\S]*本局\s*1[\s\S]*总分\s*21/,
        /验收丙[\s\S]*本局\s*2[\s\S]*总分\s*32/,
        /验收丁[\s\S]*本局\s*4[\s\S]*总分\s*103/
      ]);

      await expect(playAgainButton(host, variant)).toBeVisible();
      await expect(playAgainButton(host, variant)).toBeEnabled();
      if (variant === 'legacy') await expect(guest.locator('#playAgainBtn')).toBeHidden();
      else await expect(resultModal(guest, variant).getByRole('button', { name: '再来一局' })).toBeHidden();

      await expect(viewUpdatesButton(host, variant)).toBeVisible();
      await viewUpdatesButton(host, variant).click();
      const versions = variant === 'legacy'
        ? host.locator('#versionLogModal:not(.hidden)')
        : host.getByRole('dialog', { name: '版本更新日志' });
      await expect(versions).toBeVisible();
      if (variant === 'legacy') await host.locator('#closeVersionLogBtn').click();
      else await versions.locator('.legacy-modal-close').click();
      await reopenResult(host, variant);

      await expect(viewTableButton(host, variant)).toBeVisible();
      await viewTableButton(host, variant).click();
      await expect(roundTableModal(host, variant)).toBeVisible();
      await expect(resultModal(host, variant)).toBeHidden();
      await expect(roundTableModal(host, variant).locator('.round-player-panel')).toHaveCount(4);
      await closeRoundTable(host, variant);
      await reopenResult(host, variant);

      await playAgainButton(host, variant).click();
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      await expect(resultModal(host, variant)).toBeHidden();
      const scores = host.locator(variant === 'legacy' ? '.score-box .score-value' : '.table-seat .seat-score strong');
      await expect(scores).toHaveCount(8);
      await expect(scores).toHaveText(['0', '0', '0', '0', '0', '0', '0', '0']);
      await expect(host.locator(variant === 'legacy' ? '#roundTitle' : '.info-panel')).toContainText(variant === 'legacy' ? '第1局' : '第 1 局');
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
