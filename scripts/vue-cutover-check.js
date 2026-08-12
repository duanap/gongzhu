#!/usr/bin/env node

const WebSocket = require('ws');
const vm = require('node:vm');
const { version: expectedVersion } = require('../package.json');
const { logs: expectedVersionLogs } = require('../release-info.json');

const rawBaseUrl = process.env.BASE_URL || process.argv[2] || 'http://127.0.0.1:3000';
const baseUrl = new URL(rawBaseUrl);
baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '') || '/';
const websocketOrigin = new URL(process.env.CHECK_WS_ORIGIN || baseUrl.origin).origin;

const checks = [];

function targetUrl(pathname) {
  return new URL(pathname, baseUrl).toString();
}

function wsTargetUrl(pathname) {
  const url = new URL(pathname, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCheck(name, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    checks.push({ name, ok: true, ms: Date.now() - startedAt });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, ok: false, ms: Date.now() - startedAt, error });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function fetchWithTimeout(pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.CHECK_TIMEOUT_MS || 8000));
  try {
    return await fetch(targetUrl(pathname), {
      redirect: 'manual',
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function expectHtml(pathname, marker, name) {
  const response = await fetchWithTimeout(pathname);
  const body = await response.text();
  assert(response.status === 200, `${name} returned HTTP ${response.status}`);
  assert((response.headers.get('content-type') || '').includes('text/html'), `${name} is not HTML`);
  assert(body.includes(marker), `${name} missing marker ${marker}`);
  return { response, body };
}

async function expectNoStore(pathname) {
  const response = await fetchWithTimeout(pathname, { method: 'HEAD' });
  const cacheControl = response.headers.get('cache-control') || '';
  assert(response.status === 200, `${pathname} returned HTTP ${response.status}`);
  assert(/no-store/i.test(cacheControl), `${pathname} Cache-Control is ${cacheControl || '(empty)'}`);
}

async function expectShortHtmlCache(pathname) {
  const response = await fetchWithTimeout(pathname, { method: 'HEAD' });
  const cacheControl = response.headers.get('cache-control') || '';
  assert(response.status === 200, `${pathname} returned HTTP ${response.status}`);
  assert(/max-age=0/i.test(cacheControl), `${pathname} browser cache is not revalidate-only: ${cacheControl || '(empty)'}`);
  assert(/s-maxage=60/i.test(cacheControl), `${pathname} edge cache is not 60 seconds: ${cacheControl || '(empty)'}`);
}

function expectWebSocketCreateRoom() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsTargetUrl('/ws'), {
      handshakeTimeout: Number(process.env.CHECK_TIMEOUT_MS || 8000),
      origin: websocketOrigin
    });
    const clientId = `cutover-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let roomId = '';
    let settled = false;
    const timer = setTimeout(() => finish(new Error('WebSocket createRoom timed out')), Number(process.env.CHECK_TIMEOUT_MS || 8000));

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(1000, 'cutover check finished'); } catch (closeError) { /* ignore */ }
      if (error) reject(error);
      else resolve();
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'createRoom',
        clientId,
        guestId: `guest-${clientId}`,
        nickname: 'Vue验收'
      }));
    });

    ws.on('message', raw => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch (error) {
        return finish(new Error('WebSocket returned invalid JSON'));
      }
      if (message.type === 'error') return finish(new Error(message.message || 'WebSocket error'));
      if (message.type === 'roomCreated') {
        roomId = message.roomId || '';
        assert(/^\d{4}$/.test(roomId), `invalid room id ${roomId}`);
        ws.send(JSON.stringify({ type: 'disbandRoom', clientId, guestId: `guest-${clientId}`, roomId }));
        return;
      }
      if (message.type === 'roomClosed' && roomId) finish();
    });

    ws.on('error', error => finish(error));
    ws.on('close', (code, reason) => {
      if (!settled && code !== 1000) finish(new Error(`WebSocket closed before success: ${code} ${reason}`));
    });
  });
}

(async () => {
  console.log(`Vue cutover check target: ${baseUrl.origin}`);
  if (websocketOrigin !== baseUrl.origin) {
    console.log(`WebSocket check Origin: ${websocketOrigin}`);
  }

  await runCheck('stable root / remains old client', async () => {
    const { body } = await expectHtml('/', '<main class="table-scene">', '/');
    assert(!body.includes('/vue/assets/'), '/ unexpectedly points to Vue assets');
    assert(body.includes('<script src="/release-info.js"></script>'), '/ missing shared release information loader');
  });

  await runCheck('shared release information matches package version', async () => {
    const response = await fetchWithTimeout('/release-info.js');
    const body = await response.text();
    const sandbox = { window: {} };
    assert(response.status === 200, `/release-info.js returned HTTP ${response.status}`);
    assert((response.headers.get('content-type') || '').includes('text/javascript'), '/release-info.js is not JavaScript');
    vm.runInNewContext(body, sandbox);
    const releaseInfo = sandbox.window.HEARTS_RELEASE_INFO;
    assert(releaseInfo?.version === expectedVersion, `release version is ${releaseInfo?.version || '(missing)'}, expected ${expectedVersion}`);
    assert(releaseInfo?.displayVersion === `v${expectedVersion}`, `release display version is ${releaseInfo?.displayVersion || '(missing)'}`);
    assert(releaseInfo?.logs?.length === expectedVersionLogs.length, `release log count is ${releaseInfo?.logs?.length || 0}, expected ${expectedVersionLogs.length}`);
  });

  await runCheck('Vue client /vue/ is published beside old client', async () => {
    const { body } = await expectHtml('/vue/', '<div id="app"></div>', '/vue/');
    assert(body.includes('/vue/assets/'), '/vue/ missing built Vue assets');
  });

  await runCheck('HTML entry files use short cache', async () => {
    await expectShortHtmlCache('/');
    await expectShortHtmlCache('/vue/');
  });

  await runCheck('critical callback and service worker are not cached', async () => {
    await expectNoStore('/sw.js');
    await expectNoStore('/qq-callback.html');
  });

  await runCheck('identity API is not cached', async () => {
    const response = await fetchWithTimeout('/api/me');
    const cacheControl = response.headers.get('cache-control') || '';
    assert(response.status === 200, `/api/me returned HTTP ${response.status}`);
    assert(/no-store/i.test(cacheControl), `/api/me Cache-Control is ${cacheControl || '(empty)'}`);
  });

  await runCheck('WebSocket /ws can create and close a room', expectWebSocketCreateRoom);

  const failed = checks.filter(check => !check.ok);
  console.log('');
  console.log(`Result: ${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
})();
