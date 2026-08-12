const { test, expect } = require('@playwright/test');
const { version } = require('../../package.json');
const {
  createRoom,
  openEntry
} = require('./helpers/game-flow');
const { expectThreeByThreeSettingsGrid } = require('./helpers/settings-layout');

const DISPLAY_VERSION = `v${version}`;

async function closeRoomPanel(page, variant) {
  if (variant === 'legacy') {
    const modal = page.locator('#roomModal');
    if (await modal.isVisible().catch(() => false)) await page.locator('#closeRoomBtn').click();
    return;
  }
  const modal = page.locator('.legacy-room-modal');
  if (await modal.isVisible().catch(() => false)) await modal.locator('.legacy-modal-close').click();
}

async function openSettings(page, variant) {
  if (variant === 'legacy') await page.locator('#openSettingsBtn').click();
  else await page.locator('.legacy-top-actions').getByRole('button', { name: '设置' }).click();
  const dialog = variant === 'legacy'
    ? page.locator('#settingsModal:not(.hidden)')
    : page.getByRole('dialog', { name: '设置' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeDialog(page, variant, legacyButton, name) {
  if (variant === 'legacy') await page.locator(legacyButton).click();
  else await page.getByRole('dialog', { name }).locator('.legacy-modal-close').click();
}

for (const variant of ['legacy', 'vue']) {
  test(`${variant} 设置工具与版本日志保持预期入口`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await openEntry(page, variant);
      await createRoom(page, variant, `工具${variant}`);
      await closeRoomPanel(page, variant);

      let settings = await openSettings(page, variant);
      for (const heading of ['牌局特效', '音效', '牌桌互动', '背景音乐', '工具与资料', '项目信息']) {
        await expect(settings).toContainText(heading);
      }
      await expectThreeByThreeSettingsGrid(settings, variant);
      const rulesButton = variant === 'legacy'
        ? settings.locator('#openRulesBtn')
        : settings.getByRole('button', { name: '规则' });
      await rulesButton.click();
      const rulesDialog = variant === 'legacy'
        ? page.locator('#rulesModal:not(.hidden)')
        : page.getByRole('dialog', { name: '岛屿规则提示' });
      await expect(rulesDialog.locator(variant === 'legacy' ? '.rules-list li' : '.rules-list-vue li')).toHaveCount(8);
      await closeDialog(page, variant, '#closeRulesBtn', '岛屿规则提示');
      settings = await openSettings(page, variant);

      if (variant === 'vue') {
        const tomatoToggle = settings.locator('.settings-row-vue').filter({ hasText: '允许番茄' }).getByRole('button');
        await tomatoToggle.click();
        await expect(tomatoToggle).toHaveAttribute('aria-pressed', 'false');
        await closeDialog(page, variant, '', '设置');
        await page.locator('.table-seat .seat-avatar').nth(1).click();
        await expect(page.locator('.target-tool-menu').getByRole('button', { name: /番茄/ })).toBeDisabled();
        await page.locator('.legacy-game-stage').click({ position: { x: 8, y: 8 }, force: true });
        settings = await openSettings(page, variant);
      }
      if (variant === 'legacy') {
        const logButton = settings.locator('#openLogBtn');
        await expect(logButton).toBeVisible();
        await logButton.click();
        const logDialog = page.locator('#logModal:not(.hidden)');
        await expect(logDialog).toBeVisible();
        const filters = logDialog.locator('#logFilterBar button');
        await expect(filters).toHaveText(['全部', '出牌', '收墩', '传牌', '房间']);
        await filters.filter({ hasText: '房间' }).click();
        const events = logDialog.locator('.log-event');
        await expect(events).not.toHaveCount(0);
        await expect(events.first()).toContainText(/房间|创建|加入/);
        await closeDialog(page, variant, '#closeLogBtn', '出牌日志');
      } else {
        const logButton = settings.getByRole('button', { name: /^日志(?: \d+)?$/ });
        await expect(logButton).toBeVisible();
        await logButton.click();
        const logDialog = page.getByRole('dialog', { name: '出牌日志' });
        await expect(logDialog).toBeVisible();
        const filters = logDialog.locator('.log-filter-bar-vue button');
        await expect(filters).toHaveText(['全部', '出牌', '收墩', '传牌', '房间']);
        await filters.filter({ hasText: '房间' }).click();
        const events = logDialog.locator('.log-event-vue');
        await expect(events).not.toHaveCount(0);
        await expect(events.first()).toContainText(/房间|创建|加入/);
        await expect(settings.getByRole('button', { name: 'AI 接管', exact: true })).toHaveCount(0);
        await closeDialog(page, variant, '', '出牌日志');
      }

      settings = await openSettings(page, variant);
      const versionButton = variant === 'legacy'
        ? settings.locator('#openVersionLogBtn')
        : settings.getByRole('button', { name: '版本日志' });
      await versionButton.click();
      const versionDialog = variant === 'legacy'
        ? page.locator('#versionLogModal:not(.hidden)')
        : page.getByRole('dialog', { name: '版本更新日志' });
      const versionItems = versionDialog.locator(variant === 'legacy' ? '.version-log-item' : '.version-log-item-vue');
      await expect(versionItems.first()).toContainText(DISPLAY_VERSION);
      expect(await versionItems.count()).toBeGreaterThan(20);
      if (variant === 'vue') {
        await closeDialog(page, variant, '', '版本更新日志');
        settings = await openSettings(page, variant);
        await settings.getByRole('button', { name: '战绩' }).click();
        const statsDialog = page.getByRole('dialog', { name: '战绩' });
        await expect(statsDialog).toBeVisible();
        await expect(statsDialog).toContainText('排行榜');
        await expect(statsDialog).toContainText('最近对局');
        const statsVisual = await statsDialog.evaluate(element => {
          const panel = element.querySelector('.user-data-panel');
          const tile = element.querySelector('.stat-tile');
          const label = tile.querySelector('span');
          const value = tile.querySelector('strong');
          return {
            panelColor: getComputedStyle(panel).color,
            labelColor: getComputedStyle(label).color,
            valueColor: getComputedStyle(value).color,
            tileBackground: getComputedStyle(tile).backgroundColor
          };
        });
        expect(statsVisual.panelColor).toBe('rgb(74, 46, 23)');
        expect(statsVisual.labelColor).toBe('rgba(79, 50, 23, 0.78)');
        expect(statsVisual.valueColor).toBe('rgb(74, 46, 23)');
        expect(statsVisual.tileBackground).not.toBe('rgba(0, 0, 0, 0)');
      }

      if (variant === 'legacy') {
        await closeDialog(page, variant, '#closeVersionLogBtn', '版本更新日志');
      } else {
        await closeDialog(page, variant, '', '战绩');
      }
      settings = await openSettings(page, variant);
      const aiButton = variant === 'legacy'
        ? settings.locator('#openAiLearningBtn')
        : settings.getByRole('button', { name: 'AI 学习' });
      await aiButton.click();
      const aiDialog = variant === 'legacy'
        ? page.locator('#aiLearningModal:not(.hidden)')
        : page.getByRole('dialog', { name: 'AI 学习数据' });
      await expect(aiDialog).toContainText('AI 学习数据');
      await expect(aiDialog.locator('.ai-learning-stat')).toHaveCount(3);
      await expect(aiDialog.locator('.ai-learning-weight')).toHaveCount(6);
      await expect(aiDialog).toContainText('对手倾向');
      await expect(aiDialog).toContainText('近期样本');
    } finally {
      await context.close();
    }
  });
}

test('Vue 音量、音效、背景音乐、互动音效和特效速度会驱动实际运行状态并持久化', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
      window.__audioStarts = 0;
      window.__audioGains = [];
      class FakeParam {
        constructor() { this.value = 0; }
        cancelScheduledValues() {}
        setValueAtTime(value) { this.value = value; }
        exponentialRampToValueAtTime(value) { window.__audioGains.push(value); this.value = value; }
        linearRampToValueAtTime(value) { window.__audioGains.push(value); this.value = value; }
      }
      class FakeAudioContext {
        constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
        createOscillator() {
          return { type: '', frequency: new FakeParam(), connect() {}, start() { window.__audioStarts += 1; }, stop() {} };
        }
        createGain() { return { gain: new FakeParam(), connect() {}, disconnect() {} }; }
        resume() { this.state = 'running'; }
      }
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
  });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await closeRoomPanel(page, 'vue');
    let settings = await openSettings(page, 'vue');

    const soundRow = settings.locator('.settings-row-vue').filter({ hasText: '音效开关' });
    const soundToggle = soundRow.getByRole('button');
    await soundToggle.click();
    const startsBeforeEnable = await page.evaluate(() => window.__audioStarts);
    await soundToggle.click();
    await expect.poll(() => page.evaluate(() => window.__audioStarts)).toBeGreaterThan(startsBeforeEnable);

    const volume = settings.getByLabel('音效音量');
    await volume.fill('0.35');
    await volume.dispatchEvent('change');
    await expect(settings).toContainText('35%');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hearts-vue-settings')).soundVolume)).toBe(0.35);
    await expect.poll(() => page.evaluate(() => window.__audioGains.some(value => value > 0.02 && value < 0.03))).toBe(true);

    const interactionToggle = settings.locator('.settings-row-vue').filter({ hasText: '互动音效' }).getByRole('button');
    await interactionToggle.click();
    await expect(interactionToggle).toHaveAttribute('aria-pressed', 'false');
    const effectsToggle = settings.locator('.settings-row-vue').filter({ hasText: '特效开关' }).getByRole('button');
    await effectsToggle.click();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('effects-off'))).toBe(true);

    const speed = settings.locator('.settings-select-vue').first();
    await speed.selectOption('1.2');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--special-event-duration').trim())).toBe('2.82s');

    const musicTrack = settings.getByLabel('背景音乐曲目');
    await expect(musicTrack.locator('option')).toHaveCount(5);
    const musicToggle = settings.locator('.settings-row-vue').filter({ hasText: '背景音乐开关' }).getByRole('button');
    const startsBeforeMusic = await page.evaluate(() => window.__audioStarts);
    await musicToggle.click();
    await expect(musicToggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.__audioStarts)).toBeGreaterThan(startsBeforeMusic);
    await musicTrack.selectOption('cloud-kite');
    await settings.getByLabel('背景音乐音量').fill('0.2');
    await expect.poll(() => page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('hearts-vue-settings'));
      return [value.bgm, value.bgmTrack, value.bgmVolume];
    })).toEqual([true, 'cloud-kite', 0.2]);
    await closeDialog(page, 'vue', '', '设置');
    await page.reload({ waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('effects-off'))).toBe(true);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hearts-vue-settings')).interactionSound)).toBe(false);
    await closeRoomPanel(page, 'vue');
    settings = await openSettings(page, 'vue');
    await expect(settings.getByLabel('音效音量')).toHaveValue('0.35');
    await expect(settings.getByLabel('背景音乐音量')).toHaveValue('0.2');
    await expect(settings.getByLabel('背景音乐曲目')).toHaveValue('cloud-kite');
    await settings.locator('.settings-row-vue').filter({ hasText: '背景音乐开关' }).getByRole('button').click();
    const restoredInteractionToggle = settings.locator('.settings-row-vue').filter({ hasText: '互动音效' }).getByRole('button');
    await restoredInteractionToggle.click();
    await closeDialog(page, 'vue', '', '设置');
    const startsBeforeInteraction = await page.evaluate(() => window.__audioStarts);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hearts:debug-interaction', {
      detail: { seq: Date.now(), kind: 'flower', icon: '🌹', label: '送花', fromIndex: 0, toIndex: 1 }
    })));
    await expect.poll(() => page.evaluate(() => window.__audioStarts)).toBeGreaterThan(startsBeforeInteraction);
    await page.waitForTimeout(200);
    const startsAfterLaunch = await page.evaluate(() => window.__audioStarts);
    await expect.poll(() => page.evaluate(() => window.__audioStarts), { timeout: 2000 }).toBeGreaterThan(startsAfterLaunch);
  } finally {
    await context.close();
  }
});

test('Vue 刷新缓存会清除房间身份、横屏和设置后重新加载', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await closeRoomPanel(page, 'vue');
    await page.evaluate(() => {
      localStorage.setItem('hearts-by-duanap-room-id', '1234');
      localStorage.setItem('hearts-by-duanap-reconnect-token', 'fixture-token');
      localStorage.setItem('hearts-online-force-landscape', '1');
    });
    const settings = await openSettings(page, 'vue');
    page.once('dialog', dialog => dialog.accept());
    await settings.getByRole('button', { name: '刷新缓存' }).click();
    await page.waitForLoadState('networkidle');
    await expect.poll(() => page.evaluate(() => ({
      room: localStorage.getItem('hearts-by-duanap-room-id'),
      token: localStorage.getItem('hearts-by-duanap-reconnect-token'),
      landscape: localStorage.getItem('hearts-online-force-landscape'),
      settings: localStorage.getItem('hearts-vue-settings')
    }))).toEqual({ room: null, token: null, landscape: null, settings: null });
  } finally {
    await context.close();
  }
});

test('Vue 移除手动横屏入口并保留全屏浏览器 API', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await closeRoomPanel(page, 'vue');
    await page.evaluate(() => {
      window.__fullscreenRequests = 0;
      Object.defineProperty(document.documentElement, 'requestFullscreen', {
        configurable: true,
        value: async () => { window.__fullscreenRequests += 1; }
      });
    });
    await expect(page.getByRole('button', { name: '横屏' })).toHaveCount(0);

    await page.locator('.legacy-top-actions').getByRole('button', { name: '全屏' }).click();
    await expect.poll(() => page.evaluate(() => window.__fullscreenRequests)).toBe(1);
  } finally {
    await context.close();
  }
});

test('Vue 游客 UUID 会跨刷新保持稳定并兼容迁移旧版身份', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    const first = await page.evaluate(() => localStorage.getItem('hearts-by-duanap-guest-id'));
    expect(first).toMatch(/^guest-/);
    await page.reload({ waitUntil: 'networkidle' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('hearts-by-duanap-guest-id'))).toBe(first);
  } finally {
    await context.close();
  }

  const migratedContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
  await migratedContext.addInitScript(() => {
    localStorage.removeItem('hearts-by-duanap-guest-id');
    localStorage.setItem('hearts-online-guest-id', 'guest-e2e-legacy-id');
  });
  const migratedPage = await migratedContext.newPage();
  try {
    await openEntry(migratedPage, 'vue');
    await expect.poll(() => migratedPage.evaluate(() => localStorage.getItem('hearts-by-duanap-guest-id'))).toBe('guest-e2e-legacy-id');
  } finally {
    await migratedContext.close();
  }
});

test('Vue 道具沿清晰轨迹飞向目标头像且调试播放会替换旧播报', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 844, height: 390 },
    screen: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await createRoom(page, 'vue', '互动轨迹');
    await page.getByRole('button', { name: 'AI补位开始' }).click();
    await expect(page.locator('.opponent-hand-north .opponent-card-back-vue')).toHaveCount(4);
    await expect(page.locator('.mobile-game-stage')).not.toHaveClass(/dealing/);
    await page.waitForTimeout(700);
    const roomModal = page.locator('.mobile-tool-sheet.room-modal');
    if (await roomModal.isVisible().catch(() => false)) {
      await roomModal.locator('.legacy-modal-close').click();
    }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hearts:debug-interaction', {
      detail: { seq: Date.now(), kind: 'flower', icon: '🌹', label: '送花', fromIndex: 0, toIndex: 2 }
    })));
    const flight = page.locator('.legacy-interaction-sequence.flower');
    await expect(flight).toBeVisible();
    const trajectory = await flight.evaluate(element => {
      const style = getComputedStyle(element);
      const avatar = document.querySelector('.seat-north .seat-avatar').getBoundingClientRect();
      return {
        toX: Number.parseFloat(style.getPropertyValue('--interaction-to-x')),
        toY: Number.parseFloat(style.getPropertyValue('--interaction-to-y')),
        avatarX: avatar.left + avatar.width / 2,
        avatarY: avatar.top + avatar.height / 2
      };
    });
    expect(Math.abs(trajectory.toX - trajectory.avatarX)).toBeLessThanOrEqual(2);
    expect(Math.abs(trajectory.toY - trajectory.avatarY)).toBeLessThanOrEqual(2);
    expect(await flight.evaluate(element => Number.parseFloat(getComputedStyle(element).getPropertyValue('--interaction-distance')))).toBeGreaterThan(100);
    const flightPerformance = await flight.locator('.interaction-fly-item-vue').evaluate(element => {
      const frames = element.getAnimations()[0]?.effect?.getKeyframes?.() || [];
      return {
        willChange: getComputedStyle(element).willChange,
        hasLayoutPositionFrames: frames.some(frame => Object.hasOwn(frame, 'left') || Object.hasOwn(frame, 'top')),
        usesTranslate3d: frames.some(frame => String(frame.transform || '').includes('translate3d'))
      };
    });
    expect(flightPerformance.willChange).toContain('transform');
    expect(flightPerformance.hasLayoutPositionFrames).toBe(false);
    expect(flightPerformance.usesTranslate3d).toBe(true);
    const trailAnimation = await flight.evaluate(element => getComputedStyle(element, '::before').animationName);
    expect(trailAnimation).toContain('interactionTrailVue');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hearts:debug-broadcast', {
        detail: { seq: Date.now(), type: 'first', level: 'minor', title: '第一条', subtitle: '旧播报', playerIndex: 0 }
      }));
    });
    await expect(page.locator('.special-flying-vue')).toContainText('第一条');
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hearts:debug-broadcast', {
        detail: { seq: Date.now() + 1, type: 'second', level: 'highlight', title: '第二条', subtitle: '新播报', playerIndex: 2 }
      }));
    });
    await expect(page.locator('.special-flying-vue')).toHaveCount(1);
    await expect(page.locator('.special-flying-vue')).toContainText('第二条');
    await expect(page.locator('.special-flying-vue')).not.toContainText('第一条');
    await expect(page.locator('.special-flying-vue')).toHaveCSS('--screen-rot', '0deg');
    const broadcastVisual = await page.locator('.special-flying-vue').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, color: style.color, background: style.backgroundImage };
    });
    expect(broadcastVisual.width).toBeLessThanOrEqual(360);
    expect(broadcastVisual.height).toBeLessThanOrEqual(120);
    expect(broadcastVisual.background).toContain('linear-gradient');
  } finally {
    await context.close();
  }
});

test('Vue 文字互动绝不产生发射轨迹，关闭互动特效后仍保留简洁气泡', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await closeRoomPanel(page, 'vue');

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hearts:debug-interaction', {
      detail: {
        seq: Date.now(),
        kind: 'emoji',
        icon: '🚨',
        label: '定向表情',
        fromIndex: 0,
        toIndex: 1,
        broadcastOnly: false
      }
    })));
    const targetedEmoji = page.locator('.legacy-interaction-sequence.emoji').last();
    await expect(targetedEmoji).toBeVisible();
    await expect(targetedEmoji).toHaveClass(/broadcast/);
    await expect(targetedEmoji.locator('.interaction-fly-item-vue')).toHaveCount(0);
    await expect(targetedEmoji.locator('.interaction-impact-vue')).toHaveCount(0);
    await expect(targetedEmoji.locator('.bubble-at-source')).toContainText('定向表情');
    expect(await targetedEmoji.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');

    await page.evaluate(() => document.body.classList.add('interactions-off'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hearts:debug-interaction', {
      detail: {
        seq: Date.now() + 1,
        kind: 'flower',
        icon: '🌹',
        label: '简洁提示',
        fromIndex: 0,
        toIndex: 2,
        broadcastOnly: false
      }
    })));
    const simplified = page.locator('.legacy-interaction-sequence.flower').last();
    await expect(simplified.locator('.interaction-fly-item-vue')).toBeHidden();
    await expect(simplified.locator('.interaction-impact-vue')).toBeHidden();
    await expect(simplified.locator('.bubble-at-target')).toBeVisible();
    await expect(simplified.locator('.bubble-at-target')).toContainText('简洁提示');
  } finally {
    await context.close();
  }
});

test('Vue 关闭牌局特效后不再渲染事件与射月播报层', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await openEntry(page, 'vue');
    await closeRoomPanel(page, 'vue');
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('hearts-vue-settings') || '{}');
      settings.effects = false;
      localStorage.setItem('hearts-vue-settings', JSON.stringify(settings));
      document.body.classList.add('effects-off');
      window.dispatchEvent(new CustomEvent('hearts:settings-changed', { detail: settings }));
      window.dispatchEvent(new CustomEvent('hearts:debug-broadcast', {
        detail: { seq: Date.now(), type: 'shootMoon', level: 'legendary', title: '不应出现', subtitle: '关闭特效', playerIndex: 0 }
      }));
    });
    await expect(page.locator('.broadcast-layer')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('moon-effect-active'))).toBe(false);
  } finally {
    await context.close();
  }
});
