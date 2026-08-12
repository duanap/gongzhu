const { test, expect } = require('@playwright/test');
const {
  captureValidatedCssFallback,
  stableOrientationEvidence
} = require('./helpers/orientation');

const entries = [
  { name: 'legacy', path: '/', root: '.table-scene' },
  { name: 'vue', path: '/vue/', root: '.app-shell' }
];

for (const entry of entries) {
  test(`${entry.name} 客户端的 CSS 横屏降级必须与物理横屏证据分离`, async ({ page }, testInfo) => {
    await page.goto(entry.path, { waitUntil: 'networkidle' });
    await expect(page.locator(entry.root)).toBeVisible();
    const evidence = await captureValidatedCssFallback(page, testInfo, `${entry.name}-css-landscape-fallback`);
    expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
      `${entry.name}-css-landscape-fallback.orientation.json`
    );
    await expect(page).toHaveScreenshot(`${entry.name}-css-landscape-fallback.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      scale: 'css'
    });
    if (entry.name === 'vue') {
      await page.context().setOffline(true);
      const banner = page.locator('.global-connection-banner');
      await expect(banner).toContainText('当前设备处于离线状态');
      const bounds = await banner.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(evidence.viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(evidence.viewport.height);
      await page.context().setOffline(false);
    }
  });
}
