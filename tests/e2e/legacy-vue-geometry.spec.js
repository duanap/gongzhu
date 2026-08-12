const { test, expect } = require('@playwright/test');
const {
  closeRoomSet,
  createFourPlayerRoom,
  waitForPassPhase
} = require('./helpers/game-flow');
const { expectPhysicalLandscape, readOrientationEvidence } = require('./helpers/orientation');

const landscapeContext = {
  viewport: { width: 844, height: 390 },
  screen: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
};

const desktopContext = {
  viewport: { width: 1440, height: 900 },
  screen: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false
};

async function tableGeometry(page, variant) {
  expectPhysicalLandscape(await readOrientationEvidence(page));
  return page.evaluate(currentVariant => {
    const selectors = currentVariant === 'legacy'
      ? {
          center: '.center-ring',
          seats: { south: '#seat0 .avatar', west: '#seat1 .avatar', north: '#seat2 .avatar', east: '#seat3 .avatar' },
          scores: { south: '#seat0 .score-box', west: '#seat1 .score-box', north: '#seat2 .score-box', east: '#seat3 .score-box' },
          piles: { west: '#opHand1 .card-back', north: '#opHand2 .card-back', east: '#opHand3 .card-back' },
          hand: '#hand .card'
        }
      : {
          center: '.table-status-panel',
          seats: { south: '.seat-south .seat-avatar', west: '.seat-west .seat-avatar', north: '.seat-north .seat-avatar', east: '.seat-east .seat-avatar' },
          scores: { south: '.seat-south .seat-score', west: '.seat-west .seat-score', north: '.seat-north .seat-score', east: '.seat-east .seat-score' },
          piles: { west: '.opponent-hand-west .opponent-card-back-vue', north: '.opponent-hand-north .opponent-card-back-vue', east: '.opponent-hand-east .opponent-card-back-vue' },
          hand: '.hand-panel .game-card'
        };

    const rect = selector => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      if (!box) return null;
      return { x: box.x, y: box.y, width: box.width, height: box.height, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
    };
    const union = selector => {
      const boxes = Array.from(document.querySelectorAll(selector))
        .map(node => node.getBoundingClientRect())
        .filter(box => box.width > 0 && box.height > 0);
      if (!boxes.length) return null;
      const left = Math.min(...boxes.map(box => box.left));
      const top = Math.min(...boxes.map(box => box.top));
      const right = Math.max(...boxes.map(box => box.right));
      const bottom = Math.max(...boxes.map(box => box.bottom));
      return { x: left, y: top, width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      fixedInnerCircleCount: document.querySelectorAll('.ring-base').length,
      center: rect(selectors.center),
      seats: Object.fromEntries(Object.entries(selectors.seats).map(([key, selector]) => [key, rect(selector)])),
      scores: Object.fromEntries(Object.entries(selectors.scores).map(([key, selector]) => [key, rect(selector)])),
      piles: Object.fromEntries(Object.entries(selectors.piles).map(([key, selector]) => [key, union(selector)])),
      hand: union(selectors.hand)
    };
  }, variant);
}

function expectClose(actual, expected, tolerance, label) {
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

test('旧版与 Vue 牌桌保持同一几何基线', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(120000);
  const contextOptions = testInfo.project.name.startsWith('mobile-') ? landscapeContext : desktopContext;
  const metrics = {};
  for (const variant of ['legacy', 'vue']) {
    const roomSet = await createFourPlayerRoom(browser, baseURL, variant, contextOptions);
    try {
      await Promise.all(roomSet.pages.map(page => waitForPassPhase(page, variant)));
      metrics[variant] = await tableGeometry(roomSet.pages[0], variant);
      await testInfo.attach(`${variant}-table-geometry.json`, {
        body: Buffer.from(`${JSON.stringify(metrics[variant], null, 2)}\n`),
        contentType: 'application/json'
      });
      expect(roomSet.errors, roomSet.errors.join('\n')).toEqual([]);
    } finally {
      await closeRoomSet(roomSet);
    }
  }

  expect(metrics.vue.viewport).toEqual(metrics.legacy.viewport);
  expect(metrics.vue.fixedInnerCircleCount).toBe(0);
  const isMobileGeometry = metrics.vue.viewport.width <= 844;
  for (const key of ['cx', 'cy']) expectClose(metrics.vue.center[key], metrics.legacy.center[key], 12, `center.${key}`);
  for (const key of ['width', 'height']) expectClose(metrics.vue.center[key], metrics.legacy.center[key], 24, `center.${key}`);

  for (const seat of ['south', 'west', 'north', 'east']) {
    if ((isMobileGeometry && seat !== 'south') || seat === 'north') {
      expectClose(metrics.vue.seats[seat].cx, metrics.legacy.seats[seat].cx, 34, `${seat}.avatar.cx`);
      expectClose(metrics.vue.seats[seat].cy, metrics.legacy.seats[seat].cy, 34, `${seat}.avatar.cy`);
    }
    expectClose(metrics.vue.scores[seat].width, metrics.legacy.scores[seat].width, 28, `${seat}.score.width`);
    expectClose(metrics.vue.scores[seat].height, metrics.legacy.scores[seat].height, 18, `${seat}.score.height`);
  }

  if (isMobileGeometry) {
    // Product-approved mobile exception: the local seat is deliberately shifted
    // inward so its avatar, name and score no longer hug the physical right edge.
    const southInset = metrics.legacy.seats.south.cx - metrics.vue.seats.south.cx;
    expect(southInset, 'south.avatar.cx inward offset').toBeGreaterThanOrEqual(50);
    expect(southInset, 'south.avatar.cx inward offset').toBeLessThanOrEqual(74);
    expectClose(metrics.vue.seats.south.cy, metrics.legacy.seats.south.cy, 34, 'south.avatar.cy');
  }

  if (!isMobileGeometry) {
    // Product-approved desktop exceptions: the local seat is shifted left under the
    // right-hand cards; side seats move inward/down to leave room for horizontal piles.
    expect(metrics.legacy.seats.south.cx - metrics.vue.seats.south.cx).toBeGreaterThanOrEqual(60);
    expect(metrics.legacy.seats.south.cx - metrics.vue.seats.south.cx).toBeLessThanOrEqual(100);
    expectClose(metrics.vue.seats.south.cy, metrics.legacy.seats.south.cy, 16, 'south.avatar.cy');
    for (const seat of ['west', 'east']) {
      expectClose(metrics.vue.seats[seat].cx, metrics.legacy.seats[seat].cx, 28, `${seat}.avatar.cx`);
      expect(metrics.vue.seats[seat].cy - metrics.legacy.seats[seat].cy).toBeGreaterThanOrEqual(45);
      expect(metrics.vue.seats[seat].cy - metrics.legacy.seats[seat].cy).toBeLessThanOrEqual(75);
    }
  }

  // Product-approved exception: Vue intentionally shows at most four opponent backs,
  // with side piles below their scoreboards and the north pile left of the avatar.
  for (const seat of ['west', 'east']) {
    expectClose(metrics.vue.piles[seat].cx, metrics.vue.scores[seat].cx, 8, `${seat}.pile.score.cx`);
    expect(metrics.vue.piles[seat].y).toBeGreaterThanOrEqual(metrics.vue.scores[seat].y + metrics.vue.scores[seat].height);
  }
  expect(metrics.vue.piles.north.x + metrics.vue.piles.north.width).toBeLessThanOrEqual(metrics.vue.seats.north.x);
  expectClose(metrics.vue.piles.north.cy, metrics.vue.seats.north.cy, 12, 'north.pile.avatar.cy');
  expectClose(metrics.vue.hand.cy, metrics.legacy.hand.cy, 28, 'hand.cy');
});
