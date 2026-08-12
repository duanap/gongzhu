const fs = require('node:fs');
const { expect } = require('@playwright/test');

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('Screenshot is not a PNG file.');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function readOrientationEvidence(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.app-shell, .table-scene');
    if (!root) throw new Error('Could not find the game root element.');

    const style = getComputedStyle(root);
    const transform = style.transform;
    const matrix = transform === 'none' ? null : new DOMMatrixReadOnly(transform);
    const rotation = matrix ? Math.atan2(matrix.b, matrix.a) * 180 / Math.PI : 0;
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rect = root.getBoundingClientRect();

    return {
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      window: {
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight
      },
      devicePixelRatio: window.devicePixelRatio,
      orientationMedia: window.matchMedia('(orientation: landscape)').matches,
      orientationType: window.screen.orientation?.type || null,
      root: {
        selector: root.matches('.app-shell') ? '.app-shell' : '.table-scene',
        transform,
        rotationDegrees: normalizedRotation,
        layoutSize: {
          width: root.offsetWidth,
          height: root.offsetHeight
        },
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      },
      bodyClasses: Array.from(document.body.classList)
    };
  });
}

function expectPhysicalLandscape(evidence) {
  expect(evidence.viewport.width, '网页 viewport 必须是真实横屏').toBeGreaterThan(evidence.viewport.height);
  expect(evidence.window.outerWidth, '浏览器窗口必须是横屏').toBeGreaterThan(evidence.window.outerHeight);
  expect(evidence.screen.width, '模拟设备 screen 必须是横屏').toBeGreaterThan(evidence.screen.height);
  expect(evidence.orientationMedia, '横屏媒体查询必须命中').toBe(true);
  expect(evidence.orientationType, '浏览器必须报告明确的横屏方向').toMatch(/^landscape-/);
  expect(
    Math.min(Math.abs(evidence.root.rotationDegrees), Math.abs(360 - evidence.root.rotationDegrees)),
    '物理横屏页面根节点不能再通过 rotate(90deg) 冒充横屏'
  ).toBeLessThan(1);
  expect(evidence.root.rect.width, '页面根节点显示区域必须是横向').toBeGreaterThan(evidence.root.rect.height);
}

function expectCssLandscapeFallback(evidence) {
  expect(evidence.viewport.width, 'CSS 降级模式必须使用竖屏 viewport').toBeLessThan(evidence.viewport.height);
  expect(evidence.window.outerWidth, 'CSS 降级模式必须保留竖屏窗口').toBeLessThan(evidence.window.outerHeight);
  expect(evidence.screen.width, 'CSS 降级模式必须保留竖屏 screen').toBeLessThan(evidence.screen.height);
  expect(evidence.orientationMedia, 'CSS 降级模式不能命中物理横屏媒体查询').toBe(false);
  expect(evidence.orientationType, '浏览器必须报告明确的竖屏方向').toMatch(/^portrait-/);
  expect(
    Math.abs(evidence.root.rotationDegrees - 90),
    'CSS 降级模式的页面根节点必须明确旋转 90 度'
  ).toBeLessThan(1);
  expect(
    evidence.root.layoutSize.width,
    'CSS 旋转前的游戏布局坐标必须按横向尺寸排版'
  ).toBeGreaterThan(evidence.root.layoutSize.height);
  expect(
    evidence.root.rect.width,
    'CSS 降级模式的外接矩形必须继续匹配竖屏窗口，不能混入物理横屏基线'
  ).toBeLessThan(evidence.root.rect.height);
}

async function writePreflightEvidence(testInfo, name, evidence) {
  const evidencePath = testInfo.outputPath(`${name}.preflight.json`);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await testInfo.attach(`${name}-preflight`, {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json'
  });
}

async function captureValidatedLandscape(page, testInfo, name) {
  const evidence = await readOrientationEvidence(page);
  await writePreflightEvidence(testInfo, name, evidence);
  expectPhysicalLandscape(evidence);

  const screenshot = await page.screenshot({
    animations: 'disabled',
    fullPage: false,
    scale: 'css'
  });
  const screenshotSize = pngSize(screenshot);
  expect(screenshotSize.width, '截图文件本身必须是横屏').toBeGreaterThan(screenshotSize.height);

  const completeEvidence = {
    ...evidence,
    screenshot: screenshotSize
  };
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  const evidencePath = testInfo.outputPath(`${name}.orientation.json`);
  fs.writeFileSync(screenshotPath, screenshot);
  fs.writeFileSync(evidencePath, `${JSON.stringify(completeEvidence, null, 2)}\n`);
  await testInfo.attach(`${name}-orientation`, {
    body: Buffer.from(JSON.stringify(completeEvidence, null, 2)),
    contentType: 'application/json'
  });

  return completeEvidence;
}

async function captureValidatedCssFallback(page, testInfo, name) {
  const evidence = await readOrientationEvidence(page);
  await writePreflightEvidence(testInfo, name, evidence);
  expectCssLandscapeFallback(evidence);

  const screenshot = await page.screenshot({
    animations: 'disabled',
    fullPage: false,
    scale: 'css'
  });
  const screenshotSize = pngSize(screenshot);
  expect(screenshotSize.width, 'CSS 降级截图必须保留竖屏窗口尺寸').toBeLessThan(screenshotSize.height);

  const completeEvidence = {
    ...evidence,
    screenshot: screenshotSize
  };
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  const evidencePath = testInfo.outputPath(`${name}.orientation.json`);
  fs.writeFileSync(screenshotPath, screenshot);
  fs.writeFileSync(evidencePath, `${JSON.stringify(completeEvidence, null, 2)}\n`);

  return completeEvidence;
}

function stableOrientationEvidence(evidence) {
  return {
    viewport: evidence.viewport,
    window: evidence.window,
    screen: evidence.screen,
    devicePixelRatio: evidence.devicePixelRatio,
    orientationMedia: evidence.orientationMedia,
    orientationType: evidence.orientationType,
    root: evidence.root,
    bodyClasses: evidence.bodyClasses.filter(className => className !== 'moon-effect-active'),
    screenshot: evidence.screenshot
  };
}

module.exports = {
  captureValidatedCssFallback,
  captureValidatedLandscape,
  expectPhysicalLandscape,
  readOrientationEvidence,
  stableOrientationEvidence
};
