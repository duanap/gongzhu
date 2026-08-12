'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { createAuth, parseCookies } = require('./auth');
const { createUserStore } = require('./userStore');

function makeReq({ method = 'GET', headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.headers = headers;
  return req;
}

function makeRes() {
  return {
    headersSent: false,
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body) {
      this.body = body || '';
    }
  };
}

async function requestJson(auth, pathname, req) {
  const res = makeRes();
  await auth.handleApi(req, res, pathname);
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    json: res.body ? JSON.parse(res.body) : null
  };
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearts-auth-'));
const userStore = createUserStore({
  usersFile: path.join(tempDir, 'users.json'),
  randomUUID: () => 'user-qq-1',
  now: () => '2026-07-01T00:00:00.000Z'
});

const requestedUrls = [];
const auth = createAuth({
  userStore,
  qqAppId: '1904930904',
  qqCallbackUrl: 'https://hearts.duanap.cn/qq-callback.html',
  requestProtocol: () => 'https',
  randomBytes: () => Buffer.alloc(32, 7),
  randomUUID: () => 'guest-created',
  fetchJson: async url => {
    requestedUrls.push(url);
    if (url.includes('/oauth2.0/me')) {
      return { client_id: '1904930904', openid: 'openid-1' };
    }
    return {
      nickname: 'Alice',
      figureurl_qq_2: 'https://example.com/avatar.png'
    };
  }
});

(async () => {
  const verified = await auth.verifyQqAccess(' openid-1 ', ' token-1 ');
  assert.deepStrictEqual(verified, {
    openId: 'openid-1',
    nickname: 'Alice',
    avatarUrl: 'https://example.com/avatar.png'
  });
  assert.ok(requestedUrls.some(url => url.includes('access_token=token-1')));

  const login = await requestJson(auth, '/api/auth/qq', makeReq({
    method: 'POST',
    body: JSON.stringify({
      openId: 'openid-1',
      accessToken: 'token-1',
      guestId: 'guest-1'
    })
  }));
  assert.strictEqual(login.statusCode, 200);
  assert.strictEqual(login.json.authenticated, true);
  assert.strictEqual(login.json.user.userId, 'user-qq-1');
  assert.match(login.headers['Set-Cookie'], /hearts_sid=/);
  assert.match(login.headers['Set-Cookie'], /HttpOnly/);
  assert.match(login.headers['Set-Cookie'], /Secure/);

  const me = await requestJson(auth, '/api/me', makeReq({
    headers: { cookie: login.headers['Set-Cookie'] }
  }));
  assert.strictEqual(me.statusCode, 200);
  assert.strictEqual(me.json.authenticated, true);
  assert.strictEqual(me.json.user.nickname, 'Alice');
  assert.deepStrictEqual(me.json.qq, {
    appId: '1904930904',
    callbackUrl: 'https://hearts.duanap.cn/qq-callback.html'
  });

  userStore.recordGameStats({
    id: 'api-room',
    roundNo: 1,
    players: [
      { userId: 'user-qq-1', name: 'Alice', total: 12 },
      { guestId: 'guest-api', name: 'Guest API', total: 24 },
      { isBot: true, total: 30 },
      { isBot: true, total: 40 }
    ]
  });

  const stats = await requestJson(auth, '/api/stats/me', makeReq({
    headers: { cookie: login.headers['Set-Cookie'] }
  }));
  assert.strictEqual(stats.statusCode, 200);
  assert.strictEqual(stats.json.profile.userId, 'user-qq-1');
  assert.strictEqual(stats.json.profile.stats.gamesPlayed, 1);
  assert.strictEqual(stats.json.matches.length, 1);

  const leaderboard = await requestJson(auth, '/api/leaderboard', makeReq());
  assert.strictEqual(leaderboard.statusCode, 200);
  assert.strictEqual(leaderboard.json.leaderboard[0].userId, 'user-qq-1');

  const recent = await requestJson(auth, '/api/matches/recent', makeReq());
  assert.strictEqual(recent.statusCode, 200);
  assert.strictEqual(recent.json.matches[0].roomId, 'api-room');
  assert.strictEqual(recent.json.matches[0].participants[0].userId, undefined);
  assert.strictEqual(recent.json.matches[0].participants[1].guestId, undefined);

  const logout = await requestJson(auth, '/api/auth/logout', makeReq({
    method: 'POST',
    headers: { cookie: login.headers['Set-Cookie'] }
  }));
  assert.strictEqual(logout.statusCode, 200);
  assert.strictEqual(logout.json.ok, true);
  assert.match(logout.headers['Set-Cookie'], /Max-Age=0/);

  const anonymous = await requestJson(auth, '/api/me', makeReq({
    headers: { cookie: login.headers['Set-Cookie'] }
  }));
  assert.strictEqual(anonymous.statusCode, 200);
  assert.strictEqual(anonymous.json.authenticated, false);

  const blockedUser = userStore.findByUserId('user-qq-1');
  blockedUser.status = 'banned';
  blockedUser.statusReason = 'test moderation';
  userStore.save();
  const blockedLogin = await requestJson(auth, '/api/auth/qq', makeReq({
    method: 'POST',
    body: JSON.stringify({ openId: 'openid-1', accessToken: 'token-1' })
  }));
  assert.strictEqual(blockedLogin.statusCode, 403);
  assert.strictEqual(blockedLogin.json.code, 'ACCOUNT_BANNED');

  const guest = await requestJson(auth, '/api/auth/guest', makeReq({ method: 'POST' }));
  assert.deepStrictEqual(guest.json, { guestId: 'guest-guest-created' });

  const badAuth = createAuth({
    userStore,
    qqAppId: '1904930904',
    requestProtocol: () => 'http',
    fetchJson: async () => ({ client_id: 'other-app', openid: 'openid-1' })
  });
  await assert.rejects(
    () => badAuth.verifyQqAccess('openid-1', 'token-1'),
    /QQ app id mismatch/
  );

  assert.strictEqual(parseCookies({ headers: { cookie: 'a=1; hearts_sid=abc%20123' } }).hearts_sid, 'abc 123');

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('Auth tests passed');
})().catch(error => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
