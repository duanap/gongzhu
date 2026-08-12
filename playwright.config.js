const { defineConfig } = require('@playwright/test');

const port = Number(process.env.E2E_PORT || 3210);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: /gongzhu-smoke\.spec\.js/,
  outputDir: 'test-results',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure'
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `DECLARATION_MS=3000 HOST=127.0.0.1 PORT=${port} node server.js`,
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 30000
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
