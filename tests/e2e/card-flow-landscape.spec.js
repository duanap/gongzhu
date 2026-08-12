const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playSelectedCard,
  submitPass,
  waitForPassPhase,
  variants
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

const collectFixture = {
  hands: [
    ['C13', 'D2'],
    ['D3'],
    ['S3'],
    ['H3']
  ],
  trick: [
    { player: 1, cardId: 'C10' },
    { player: 2, cardId: 'C11' },
    { player: 3, cardId: 'C12' }
  ],
  trickNo: 3,
  currentPlayer: 0,
  heartsBroken: true
};

async function freezePassFlightCards(passCards) {
  await passCards.evaluateAll(elements => {
    const sourceLayer = elements[0]?.parentElement;
    if (!sourceLayer) throw new Error('传牌飞行层不存在');
    document.querySelector('#e2e-pass-flight-layer')?.remove();
    sourceLayer.setAttribute('data-e2e-original-pass-layer', '');
    const stableLayer = sourceLayer.cloneNode(false);
    stableLayer.id = 'e2e-pass-flight-layer';
    stableLayer.removeAttribute('data-e2e-original-pass-layer');
    elements.forEach(element => stableLayer.appendChild(element.cloneNode(true)));
    document.body.appendChild(stableLayer);
  });
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 传牌飞行和换入提示在真实手机横屏中完整可见`, async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      let page = roomSet.pages[0];
      const name = `${variant}-pass-flow-physical-landscape`;
      const evidence = await captureValidatedLandscape(page, testInfo, name);
      expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
        `${name}.orientation.json`
      );

      await Promise.all(roomSet.pages.map(candidate => submitPass(candidate, variant)));
      let currentPageIndex = -1;
      await expect.poll(async () => {
        const currentStates = await Promise.all(roomSet.pages.map(candidate => (
          candidate.locator(
            variant === 'legacy' ? '#turnArc .self-wave-ring' : '.table-status-panel.your-turn'
          ).count()
        )));
        currentPageIndex = currentStates.findIndex(Boolean);
        return currentPageIndex;
      }).toBeGreaterThanOrEqual(0);
      page = roomSet.pages[currentPageIndex];
      const passCards = page.locator(variant === 'legacy' ? '.pass-flight-card' : '.pass-flight-card-vue');
      const receivedCards = page.locator(variant === 'legacy' ? '#hand .card.just-received' : '.hand-panel .game-card.just-received');
      const receiveToast = page.locator(variant === 'legacy' ? '#receiveToast:not(.hidden)' : '.receive-toast-vue');
      await expect(passCards).toHaveCount(12);
      await freezePassFlightCards(passCards);
      await expect(receivedCards).toHaveCount(3);
      await expect(receiveToast).toBeVisible();
      await page.addStyleTag({
        content: `
          .pass-flight-card,
          .pass-flight-card-vue {
            animation: none !important;
            opacity: 1 !important;
            transform: translate(
              calc(var(--pass-to-x) * .50),
              calc(var(--pass-to-y) * .50 + var(--pass-arc-y, -12px))
            ) scale(.90) rotate(var(--pass-fly-rot, 0deg)) !important;
          }
          [data-e2e-original-pass-layer] { visibility: hidden !important; }
          #e2e-pass-flight-layer { visibility: visible !important; }
          .receive-toast-vue { animation: none !important; opacity: 1 !important; }
          #appVersionLabel,
          .app-bar > div:first-child > span { visibility: hidden !important; }
          .receive-toast,
          .receive-toast-vue {
            width: 360px !important;
            max-width: 360px !important;
            color: transparent !important;
            text-shadow: none !important;
          }
          .your-turn-reminder,
          .your-turn-reminder-vue { display: none !important; }
          .seat.current .avatar,
          .seat.active .avatar,
          .table-seat.current .seat-avatar {
            outline: none !important;
            box-shadow: none !important;
          }
          .center-turn-arc, .center-turn-arc-vue { display: none !important; }
          .round-desc, .table-status-panel > strong, .table-status-panel > span,
          .turn-indicator, .seat-turn-indicator { visibility: hidden !important; }
        `
      });
      const frozenPassCards = page.locator(
        '#e2e-pass-flight-layer .pass-flight-card, #e2e-pass-flight-layer .pass-flight-card-vue'
      );
      await expect(frozenPassCards).toHaveCount(12);
      await expect(frozenPassCards.first()).toBeVisible();

      const screenshot = await page.screenshot({
        animations: 'allow',
        caret: 'hide',
        fullPage: false,
        mask: [
          page.locator(variant === 'legacy' ? '#hand' : '.hand-panel'),
          page.locator('.seat, .table-seat'),
          page.getByRole('button', { name: /^房间 \d{4}$/ })
        ],
        maskColor: '#5a4b72',
        scale: 'css'
      });
      expect(screenshot).toMatchSnapshot(`${name}.png`, { maxDiffPixelRatio: 0.02 });
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 定向收墩在真实手机横屏中保持横向牌桌`, async ({ browser, baseURL, request }, testInfo) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, landscapeContext);
    try {
      const response = await request.post('/__e2e__/fixture', {
        data: { roomId: roomSet.roomId, ...collectFixture }
      });
      expect(response.status()).toBe(200);

      const page = roomSet.pages[0];
      const name = `${variant}-collect-flow-physical-landscape`;
      const evidence = await captureValidatedLandscape(page, testInfo, name);
      expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
        `${name}.orientation.json`
      );

      const ownCard = page.locator(`${variants[variant].handCards}[data-id="C13"]`);
      await expect(ownCard).toBeVisible();
      await playSelectedCard(page, variant, ownCard);

      const collectCards = page.locator(variant === 'legacy' ? '.collect-flight-card' : '.collect-flight-card-vue');
      await expect(collectCards).toHaveCount(4, { timeout: 1600 });
      await page.addStyleTag({
        content: `
          .collect-flight-card.card,
          .collect-flight-card-vue {
            animation: none !important;
            opacity: 1 !important;
            transform: translate(
              calc(var(--collect-gather-x) * .90 + var(--collect-to-x) * .10),
              calc(var(--collect-gather-y) * .90 + var(--collect-to-y) * .10)
            ) scale(.70) rotate(var(--collect-end-rot, 0deg)) !important;
          }
        `
      });

      await expect(collectCards).toHaveCount(4);
      const collectBoxes = await collectCards.evaluateAll(cards => cards.map(card => {
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity: style.opacity, display: style.display };
      }));
      const visibleCollectCards = collectBoxes.filter(rect => (
        Number(rect.opacity) > 0 && rect.display !== 'none' && rect.x < 844 && rect.y < 390
        && rect.x + rect.width > 0 && rect.y + rect.height > 0
      ));
      expect(visibleCollectCards, JSON.stringify(collectBoxes)).toHaveLength(4);
      const screenshot = await page.screenshot({
        animations: 'allow',
        caret: 'hide',
        fullPage: false,
        mask: [
          page.locator('.seat, .table-seat'),
          page.getByRole('button', { name: /^房间 \d{4}$/ })
        ],
        maskColor: '#5a4b72',
        scale: 'css'
      });
      expect(screenshot).toMatchSnapshot(`${name}.png`, { maxDiffPixelRatio: 0.02 });
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
