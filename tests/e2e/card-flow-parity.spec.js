const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  playSelectedCard,
  submitPass,
  variants,
  waitForPassPhase
} = require('./helpers/game-flow');

function selectorsFor(variant) {
  if (variant === 'legacy') {
    return {
      passCards: '.pass-flight-card',
      receiveToast: '#receiveToast:not(.hidden)',
      receivedCards: '#hand .card.just-received',
      trickCards: '.trick-area .slot .card',
      comparing: '.trick-area.judging',
      collecting: '.trick-area.collecting',
      collectCards: '.collect-flight-card'
    };
  }
  return {
    passCards: '.pass-flight-card-vue',
    receiveToast: '.receive-toast-vue',
    receivedCards: '.hand-panel .game-card.just-received',
    trickCards: '.trick-panel .trick-play',
    comparing: '.trick-panel.judging',
    collecting: '.trick-panel.collecting',
    collectCards: '.collect-flight-card-vue'
  };
}

async function playUntilThreeCards(pages, variant) {
  const selectors = selectorsFor(variant);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await pages[0].locator(selectors.trickCards).count() === 3) return;
    let played = false;
    for (const page of pages) {
      const playable = page.locator(variants[variant].playableCards);
      if (!await playable.count()) continue;
      try {
        await playSelectedCard(page, variant, playable.first());
        played = true;
        break;
      } catch (error) {
        if (!/Timeout|detached/i.test(String(error))) throw error;
      }
    }
    if (!played) await pages[0].waitForTimeout(50);
  }
  throw new Error(`${variant} 未能进入三张桌面牌状态`);
}

async function playFourthCard(pages, variant) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    for (const page of pages) {
      const playable = page.locator(variants[variant].playableCards);
      if (!await playable.count()) continue;
      try {
        await playSelectedCard(page, variant, playable.first());
        return;
      } catch (error) {
        if (!/Timeout|detached/i.test(String(error))) throw error;
      }
    }
    await pages[0].waitForTimeout(50);
  }
  throw new Error(`${variant} 未找到第四张合法牌`);
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 传牌结束后保留飞牌、换入提示和三张限时高亮`, async ({ browser, baseURL }) => {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    const selectors = selectorsFor(variant);
    try {
      if (variant === 'vue') {
        await expect(roomSet.pages[0].locator('.legacy-game-stage.dealing')).toBeVisible({ timeout: 2000 });
        await expect(roomSet.pages[0].locator('.opponent-card-back-vue').first()).toHaveCSS('animation-name', 'dealCardFanVue');
        await expect(roomSet.pages[0].locator('.legacy-hand .game-card').first()).toHaveCSS('animation-name', 'dealCardFanVue');
      }
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));

      await expect(roomSet.pages[0].locator(selectors.passCards)).toHaveCount(12);
      await expect(roomSet.pages[0].locator(selectors.receiveToast)).toContainText(/^你从.+收到：/);
      await expect(roomSet.pages[0].locator(selectors.receivedCards)).toHaveCount(3);

      if (variant === 'vue') {
        const piles = roomSet.pages[0].locator('.opponent-hand-vue');
        await expect(piles).toHaveCount(3);
        for (let index = 0; index < 3; index++) {
          await expect(piles.nth(index).locator('.opponent-card-back-vue')).toHaveCount(4);
        }
      }

      await expect(roomSet.pages[0].locator(selectors.passCards)).toHaveCount(0, { timeout: 4200 });
      await expect(roomSet.pages[0].locator(selectors.receivedCards)).toHaveCount(0, { timeout: 4400 });
      await expect(roomSet.pages[0].locator(selectors.receiveToast)).toHaveCount(0, { timeout: 6200 });
      expect(roomSet.errors).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });

  test(`${variant} 比牌 900ms 后定向收墩且飞牌完整结束`, async ({ browser, baseURL }) => {
    test.setTimeout(60000);
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant);
    const selectors = selectorsFor(variant);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      await Promise.all(roomSet.pages.map(page => submitPass(page, variant)));
      await playUntilThreeCards(roomSet.pages, variant);
      await playFourthCard(roomSet.pages, variant);

      await expect(roomSet.pages[0].locator(selectors.comparing)).toBeVisible();
      await expect(roomSet.pages[0].locator(selectors.collecting)).toHaveCount(0);
      await roomSet.pages[0].waitForTimeout(650);
      await expect(roomSet.pages[0].locator(selectors.collecting)).toHaveCount(0);
      await expect(roomSet.pages[0].locator(selectors.collecting)).toBeVisible({ timeout: 650 });
      await expect(roomSet.pages[0].locator(selectors.collectCards)).toHaveCount(4);

      if (variant === 'vue') {
        const direction = await roomSet.pages[0].locator(selectors.collectCards).filter({ has: roomSet.pages[0].locator('.game-card') }).evaluateAll(elements => {
          const winner = Number(elements[0].dataset.winner);
          const element = elements.find(item => Number(item.dataset.player) === winner) || elements[0];
          const style = element.style;
          const seatNames = ['south', 'west', 'north', 'east'];
          let target;
          if (winner === 0) {
            const rects = Array.from(document.querySelectorAll('.hand-panel .card-row > *')).map(card => card.getBoundingClientRect());
            target = {
              x: (Math.min(...rects.map(rect => rect.left)) + Math.max(...rects.map(rect => rect.right))) / 2,
              y: (Math.min(...rects.map(rect => rect.top)) + Math.max(...rects.map(rect => rect.bottom))) / 2
            };
          } else {
            const rect = document.querySelector(`.seat-${seatNames[winner]} .seat-avatar`).getBoundingClientRect();
            target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }
          return {
            winner,
            x: Number.parseFloat(style.getPropertyValue('--collect-to-x')),
            y: Number.parseFloat(style.getPropertyValue('--collect-to-y')),
            durations: elements.map(item => Number.parseFloat(item.style.getPropertyValue('--collect-flight-duration'))),
            animationName: getComputedStyle(element).animationName,
            timingFunction: getComputedStyle(element).animationTimingFunction,
            actualX: Number.parseFloat(style.left) + Number.parseFloat(style.getPropertyValue('--collect-to-x')),
            actualY: Number.parseFloat(style.top) + Number.parseFloat(style.getPropertyValue('--collect-to-y')),
            targetX: target.x,
            targetY: target.y
          };
        });
        if (direction.winner === 0) expect(direction.y).toBeGreaterThan(0);
        if (direction.winner === 1) expect(direction.x).toBeLessThan(0);
        if (direction.winner === 2) expect(direction.y).toBeLessThan(0);
        if (direction.winner === 3) expect(direction.x).toBeGreaterThan(0);
        expect(Math.abs(direction.actualX - direction.targetX)).toBeLessThanOrEqual(2);
        expect(Math.abs(direction.actualY - direction.targetY)).toBeLessThanOrEqual(2);
        expect(direction.durations.every(duration => duration >= 620 && duration <= 900)).toBe(true);
        expect(direction.animationName).toBe('collectCardPileFlyVue');
        expect(direction.timingFunction).toBe('cubic-bezier(0.77, 0, 0.175, 1)');
      }

      await expect(roomSet.pages[0].locator(selectors.trickCards)).toHaveCount(0, { timeout: 1400 });
      await expect(roomSet.pages[0].locator(selectors.collectCards)).toHaveCount(0, { timeout: 3000 });
      expect(roomSet.errors).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  });
}
