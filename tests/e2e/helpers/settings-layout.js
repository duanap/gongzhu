const { expect } = require('@playwright/test');

async function expectThreeByThreeSettingsGrid(dialog, variant) {
  const grid = dialog.locator(variant === 'legacy' ? '.settings-sections' : '.settings-sections-vue');
  const sections = grid.locator(variant === 'legacy' ? ':scope > .settings-section' : ':scope > .settings-section-vue');
  await expect(sections).toHaveCount(6);

  const metrics = await sections.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    const heading = element.querySelector('.settings-section-title, h3');
    return {
      heading: heading?.textContent?.trim() || '',
      x: rect.x,
      y: rect.y,
      right: rect.right,
      width: rect.width,
      hasHorizontalOverflow: element.scrollWidth > element.clientWidth + 1,
      clippedLabels: Array.from(element.querySelectorAll('.settings-row-label, .settings-row-vue > div, .settings-row-vue strong'))
        .filter(label => {
          const style = getComputedStyle(label);
          return style.display !== 'none' && label.scrollWidth > label.clientWidth + 1;
        })
        .map(label => label.textContent?.trim() || label.tagName),
      overflowingControls: Array.from(element.querySelectorAll('button, select, input, .settings-controls, .settings-info, .settings-info-vue'))
        .filter(control => {
          const controlRect = control.getBoundingClientRect();
          return controlRect.left < rect.left - 1 || controlRect.right > rect.right + 1;
        })
        .map(control => control.getAttribute('aria-label') || control.textContent?.trim() || control.tagName)
    };
  }));
  expect(metrics.map(item => item.heading)).toEqual([
    '牌局特效',
    '音效',
    '牌桌互动',
    variant === 'legacy' ? '背景音乐（预留）' : '背景音乐',
    '工具与资料',
    '项目信息'
  ]);

  for (const [wideIndex, sideIndex] of [[0, 1], [2, 3], [4, 5]]) {
    expect(Math.abs(metrics[wideIndex].y - metrics[sideIndex].y)).toBeLessThanOrEqual(2);
    expect(metrics[wideIndex].x).toBeLessThan(metrics[sideIndex].x);
    expect(metrics[wideIndex].width).toBeGreaterThan(metrics[sideIndex].width * .95);
    expect(metrics[wideIndex].width).toBeLessThan(metrics[sideIndex].width * 1.1);
    expect(metrics[sideIndex].hasHorizontalOverflow).toBe(false);
    expect(metrics[sideIndex].overflowingControls).toEqual([]);
  }
  expect(new Set(metrics.map(item => Math.round(item.y))).size).toBe(3);

  metrics.forEach(item => {
    expect(item.hasHorizontalOverflow).toBe(false);
    expect(item.clippedLabels).toEqual([]);
  });

  const gridBox = await grid.boundingBox();
  metrics.forEach(item => {
    expect(item.x).toBeGreaterThanOrEqual(gridBox.x - 1);
    expect(item.right).toBeLessThanOrEqual(gridBox.x + gridBox.width + 1);
  });
}

module.exports = { expectThreeByThreeSettingsGrid };
