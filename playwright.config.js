const { defineConfig } = require('@playwright/test');

const port = Number(process.env.E2E_PORT || 3210);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFileName}/{arg}{ext}',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 5000
  },
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure'
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `DATA_BACKEND=sqlite DATABASE_FILE=/tmp/hearts-e2e-${port}.sqlite AI_LEARNING_STATE_FILE=/tmp/hearts-e2e-ai-learning-${port}.json USER_DATA_FILE=/tmp/hearts-e2e-users-${port}.json E2E_FIXTURE_MODE=1 DISCONNECT_GRACE_MS=1500 OFFLINE_TAKEOVER_MS=4000 OFFLINE_TAKEOVER_SWEEP_MS=100 HOST=127.0.0.1 PORT=${port} node server.js`,
        url: `${baseURL}/healthz`,
        reuseExistingServer: false,
        timeout: 30000
      },
  projects: [
    {
      name: 'client-browser-smoke-chromium',
      testMatch: /browser-smoke\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'full-round-desktop-chromium',
      testMatch: /full-round\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'reconnect-takeover-desktop-chromium',
      testMatch: /reconnect-takeover\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'illegal-play-desktop-chromium',
      testMatch: /illegal-play\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'sweep-moon-desktop-chromium',
      testMatch: /sweep-moon\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'room-lifecycle-desktop-chromium',
      testMatch: /room-lifecycle\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'card-flow-parity-desktop-chromium',
      testMatch: /card-flow-parity\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'history-review-desktop-chromium',
      testMatch: /history-review\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'game-end-desktop-chromium',
      testMatch: /game-end\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'tools-parity-desktop-chromium',
      testMatch: /tools-parity\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'mobile-physical-landscape-chromium',
      testMatch: /physical-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-game-stages-chromium',
      testMatch: /physical-game-stages\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-legacy-vue-geometry-chromium',
      testMatch: /legacy-vue-geometry\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'desktop-legacy-vue-geometry-chromium',
      testMatch: /legacy-vue-geometry\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'mobile-physical-sweep-offer-chromium',
      testMatch: /sweep-offer-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-room-lifecycle-chromium',
      testMatch: /room-lifecycle-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-card-flow-chromium',
      testMatch: /card-flow-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-history-review-chromium',
      testMatch: /history-review-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-game-end-chromium',
      testMatch: /game-end-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-illegal-play-chromium',
      testMatch: /illegal-play-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-physical-tools-chromium',
      testMatch: /tools-landscape\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'mobile-css-landscape-fallback-chromium',
      testMatch: /css-landscape-fallback\.spec\.js/,
      use: {
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'vue-feedback-desktop-chromium',
      testMatch: /vue-feedback-regression\.spec\.js/,
      use: {
        viewport: { width: 1440, height: 900 },
        screen: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: 'vue-feedback-mobile-landscape-chromium',
      testMatch: /vue-feedback-regression\.spec\.js/,
      use: {
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    },
    {
      name: 'vue-feedback-mobile-portrait-chromium',
      testMatch: /vue-feedback-regression\.spec\.js/,
      use: {
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'
      }
    }
  ]
});
