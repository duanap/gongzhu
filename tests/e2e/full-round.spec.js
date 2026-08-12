const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playCompleteRound,
  submitPass,
  waitForPassPhase
} = require('./helpers/game-flow');

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 客户端由四个真人浏览器完成一整局`, async ({ browser, baseURL }) => {
    test.setTimeout(180000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      if (variant === 'vue') {
        const desktopTableVisual = await roomSet.pages[0].evaluate(() => {
          const center = document.querySelector('.table-status-panel').getBoundingClientRect();
          const score = document.querySelector('.seat-west .seat-score');
          const scoreRect = score.getBoundingClientRect();
          const scoreStyle = getComputedStyle(score);
          return {
            centerWidth: center.width,
            centerHeight: center.height,
            scoreWidth: scoreRect.width,
            scoreBackground: scoreStyle.backgroundColor,
            scoreBorderWidth: scoreStyle.borderTopWidth
          };
        });
        expect(desktopTableVisual.centerWidth).toBeGreaterThanOrEqual(296);
        expect(desktopTableVisual.centerWidth).toBeLessThanOrEqual(304);
        expect(Math.abs(desktopTableVisual.centerWidth - desktopTableVisual.centerHeight)).toBeLessThanOrEqual(1);
        expect(desktopTableVisual.scoreWidth).toBeGreaterThanOrEqual(124);
        expect(desktopTableVisual.scoreBackground).not.toBe('rgba(0, 0, 0, 0)');
        expect(desktopTableVisual.scoreBorderWidth).not.toBe('0px');
      }
      await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
      const result = await playCompleteRound(roomSet.pages, variant);
      expect(result.acceptedPlays).toBe(52);
      expect(result.humanPlays).toBeGreaterThan(20);
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
