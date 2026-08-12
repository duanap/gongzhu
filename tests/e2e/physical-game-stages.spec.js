const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playCompleteRound,
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

async function captureStage(page, testInfo, variant, stage) {
  await page.addStyleTag({
    content: `
      .action-toast, .receive-toast, .your-turn-reminder, .special-event,
      .broadcast-layer, .interaction-effect-layer, .moon-effect, .avatar-wave,
      .seat-pill.turn { display: none !important; }
      body.moon-effect-active .table-scene { filter: none !important; }
    `
  });
  await page.waitForTimeout(250);
  const name = `${variant}-${stage}-physical-landscape`;
  const evidence = await captureValidatedLandscape(page, testInfo, name);
  expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
    `${name}.orientation.json`
  );

  const dynamicMasks = [
    page.locator('.card, .game-card'),
    page.locator('.avatar, .seat-avatar'),
    page.locator('#openRoomBtn, .score-value, .seat-score strong, .table-status-meta'),
    page.getByRole('button', { name: /^房间 \d{4}$/ })
  ];
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    mask: dynamicMasks,
    maskColor: '#5a4b72',
    maxDiffPixelRatio: 0.02,
    scale: 'css'
  });
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 客户端关键牌局阶段保持真实手机横屏`, async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(360000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      if (variant === 'vue') {
        await expect(roomSet.pages[0].locator('.mobile-game-stage.dealing')).toBeVisible({ timeout: 2000 });
        await expect(roomSet.pages[0].locator('.opponent-card-back-vue').first()).toHaveCSS('animation-name', 'dealCardFanVue');
        await expect(roomSet.pages[0].locator('.hand-panel .game-card').first()).toHaveCSS('animation-name', 'dealCardFanVue');
      }
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      if (variant === 'vue') {
        const brandLayout = await roomSet.pages[0].locator('.app-bar > div:first-child').evaluate(brand => {
          const title = brand.querySelector('strong').getBoundingClientRect();
          const version = brand.querySelector('span').getBoundingClientRect();
          return {
            titleCenterY: title.top + title.height / 2,
            versionCenterY: version.top + version.height / 2,
            versionHeight: version.height,
            titleHeight: title.height
          };
        });
        expect(Math.abs(brandLayout.titleCenterY - brandLayout.versionCenterY)).toBeLessThanOrEqual(5);
        expect(brandLayout.versionHeight).toBeLessThanOrEqual(brandLayout.titleHeight + 2);
        const sideLayout = await roomSet.pages[0].evaluate(() => {
          const avatar = position => document.querySelector(`.seat-${position} .seat-avatar`).getBoundingClientRect();
          const pile = position => {
            const rects = Array.from(document.querySelectorAll(`.opponent-hand-${position} > *`)).map(card => card.getBoundingClientRect());
            return {
              centerX: (Math.min(...rects.map(rect => rect.left)) + Math.max(...rects.map(rect => rect.right))) / 2,
              top: Math.min(...rects.map(rect => rect.top))
            };
          };
          return ['west', 'east'].map(position => {
            const avatarRect = avatar(position);
            const pileRect = pile(position);
            return {
              avatarCenterX: avatarRect.left + avatarRect.width / 2,
              avatarBottom: avatarRect.bottom,
              avatarWidth: avatarRect.width,
              avatarHeight: avatarRect.height,
              pileCenterX: pileRect.centerX,
              pileTop: pileRect.top,
              northWidth: avatar('north').width,
              northHeight: avatar('north').height
            };
          });
        });
        sideLayout.forEach(side => {
          expect(Math.abs(side.avatarCenterX - side.pileCenterX)).toBeLessThanOrEqual(8);
          expect(side.avatarBottom).toBeLessThan(side.pileTop);
          expect(Math.abs(side.avatarWidth - side.northWidth)).toBeLessThanOrEqual(1);
          expect(Math.abs(side.avatarHeight - side.northHeight)).toBeLessThanOrEqual(1);
        });
        const legacyTableVisual = await roomSet.pages[0].evaluate(() => {
          const center = document.querySelector('.table-status-panel').getBoundingClientRect();
          const centerElement = document.querySelector('.table-status-panel');
          const score = document.querySelector('.seat-west .seat-score');
          const scoreRect = score.getBoundingClientRect();
          const scoreStyle = getComputedStyle(score);
          return {
            centerWidth: center.width,
            centerHeight: center.height,
            innerCircleContent: getComputedStyle(centerElement, '::before').content,
            fixedInnerCircleCount: centerElement.querySelectorAll('.ring-base').length,
            scoreWidth: scoreRect.width,
            scoreBackground: scoreStyle.backgroundColor,
            scoreBorderWidth: scoreStyle.borderTopWidth
          };
        });
        expect(legacyTableVisual.centerWidth).toBeGreaterThanOrEqual(210);
        expect(legacyTableVisual.centerWidth).toBeLessThanOrEqual(220);
        expect(Math.abs(legacyTableVisual.centerWidth - legacyTableVisual.centerHeight)).toBeLessThanOrEqual(1);
        expect(legacyTableVisual.innerCircleContent).toBe('none');
        expect(legacyTableVisual.fixedInnerCircleCount).toBe(0);
        expect(legacyTableVisual.scoreWidth).toBeGreaterThanOrEqual(120);
        expect(legacyTableVisual.scoreBackground).not.toBe('rgba(0, 0, 0, 0)');
        expect(legacyTableVisual.scoreBorderWidth).not.toBe('0px');
      }
      await captureStage(roomSet.pages[0], testInfo, variant, 'pass');

      await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
      const result = await playCompleteRound(roomSet.pages, variant, {
        timeout: variant === 'vue' ? 300000 : 150000,
        captureAfterPlays: 8,
        onProgress: async () => {
          await roomSet.pages[0].waitForTimeout(2200);
          if (variant === 'vue') {
            const center = roomSet.pages[0].locator('.table-status-panel');
            const ownTurn = await center.evaluate(element => element.classList.contains('your-turn'));
            await expect(center.locator('.self-wave-ring')).toHaveCount(ownTurn ? 2 : 0);
          }
          await captureStage(roomSet.pages[0], testInfo, variant, 'play');
        }
      });
      expect(result.acceptedPlays).toBe(52);
      await captureStage(roomSet.pages[0], testInfo, variant, 'round-end');
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
