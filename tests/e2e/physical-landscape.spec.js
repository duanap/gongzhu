const { test, expect } = require('@playwright/test');
const {
  captureValidatedLandscape,
  stableOrientationEvidence
} = require('./helpers/orientation');

const entries = [
  { name: 'legacy', path: '/', root: '.table-scene' },
  { name: 'vue', path: '/vue/', root: '.app-shell' }
];

for (const entry of entries) {
  test(`${entry.name} 客户端必须在真实手机横屏环境中自然横向布局`, async ({ page }, testInfo) => {
    await page.goto(entry.path, { waitUntil: 'networkidle' });
    await expect(page.locator(entry.root)).toBeVisible();
    if (entry.name === 'vue') {
      await expect(page.getByRole('button', { name: 'QQ登录' })).toBeVisible();
      const roomBox = await page.locator('.mobile-tool-sheet.room-modal').boundingBox();
      expect(roomBox).not.toBeNull();
      expect(roomBox.width).toBeGreaterThanOrEqual(616);
      expect(roomBox.width).toBeLessThanOrEqual(624);
      expect(roomBox.height).toBeGreaterThanOrEqual(276);
      expect(roomBox.height).toBeLessThanOrEqual(320);
    }
    const evidence = await captureValidatedLandscape(page, testInfo, `${entry.name}-physical-landscape`);
    expect(`${JSON.stringify(stableOrientationEvidence(evidence), null, 2)}\n`).toMatchSnapshot(
      `${entry.name}-physical-landscape.orientation.json`
    );
    await expect(page).toHaveScreenshot(`${entry.name}-physical-landscape.png`, {
      animations: 'disabled',
      caret: 'hide',
      fullPage: false,
      scale: 'css'
    });
  });
}
