'use strict';

const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createSqliteDatabase } = require('./sqliteDatabase');
const { createSqliteUserStore } = require('./sqliteUserStore');
const { createUserAdminRepository } = require('./userAdminRepository');
const { createAdminStore } = require('./adminStore');
const { createAdminApplication } = require('./adminApplication');
const { createAdminHttp } = require('./adminHttp');
const { readJsonBody } = require('./auth');

function makeReq({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function makeRes() {
  return {
    statusCode: 0, headers: {}, body: '', headersSent: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
    },
    end(body) { this.body = body || ''; }
  };
}

async function call(http, request) {
  const req = makeReq(request);
  const res = makeRes();
  await http.handle(req, res, new URL(req.url, 'http://localhost').pathname);
  return { statusCode: res.statusCode, headers: res.headers, json: JSON.parse(res.body) };
}

(async () => {
  const sqlite = createSqliteDatabase({ databaseFile: ':memory:' });
  try {
    const userStore = createSqliteUserStore({ database: sqlite.database, randomUUID: () => 'user-1' });
    userStore.upsertQqUser({ openId: 'qq-1', nickname: 'Alice' });
    const users = createUserAdminRepository(userStore);
    const adminStore = createAdminStore({ database: sqlite.database });
    const bootstrap = adminStore.bootstrap({ username: 'root-admin', password: 'a-secure-test-password', role: 'super_admin' });
    assert.equal(bootstrap.created, true);

    let roomClosed = false;
    const rooms = {
      counts: () => ({ liveRooms: 1, livePlayers: 1, connectedHumans: 1 }),
      list: () => ({ rows: [{ roomId: '1234' }], page: { limit: 20, nextCursor: '', total: 1 } }),
      get: roomId => roomId === '1234' && !roomClosed ? { roomId: '1234' } : null,
      disband: () => { roomClosed = true; return true; }
    };
    const application = createAdminApplication({ users, rooms, adminStore, aiLearning: { getSummary: () => ({ totalSamples: 3 }) } });
    const http = createAdminHttp({ application, adminStore, readJsonBody, configured: true, requestProtocol: () => 'https' });

    const login = await call(http, {
      method: 'POST', url: '/api/admin/v1/auth/login',
      body: JSON.stringify({ username: 'root-admin', password: 'a-secure-test-password' })
    });
    assert.equal(login.statusCode, 200);
    assert.match(login.headers['Set-Cookie'], /HttpOnly/);
    assert.match(login.headers['Set-Cookie'], /SameSite=Strict/);
    const cookie = login.headers['Set-Cookie'];
    const csrf = login.json.data.csrfToken;

    const overview = await call(http, { url: '/api/admin/v1/overview', headers: { cookie } });
    assert.equal(overview.statusCode, 200);
    assert.equal(overview.json.data.liveRooms, 1);

    const user = users.getUser('user-1');
    const moderate = await call(http, {
      method: 'PATCH', url: '/api/admin/v1/users/user-1/status',
      headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': 'moderate-user-1' },
      body: JSON.stringify({ status: 'suspended', reason: 'automated test', expiresAt: '2099-01-01T00:00:00.000Z', expectedVersion: user.version })
    });
    assert.equal(moderate.statusCode, 200);
    assert.equal(moderate.json.data.after.status, 'suspended');

    const replay = await call(http, {
      method: 'PATCH', url: '/api/admin/v1/users/user-1/status',
      headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': 'moderate-user-1' },
      body: JSON.stringify({ status: 'banned', reason: 'must not run twice' })
    });
    assert.equal(replay.json.data.after.status, 'suspended');

    const disband = await call(http, {
      method: 'POST', url: '/api/admin/v1/rooms/1234/disband',
      headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': 'disband-1234' },
      body: JSON.stringify({ reason: 'automated test' })
    });
    assert.equal(disband.statusCode, 200);
    assert.equal(roomClosed, true);
    assert.equal(adminStore.listAudit({ limit: 10 }).rows.length, 2);
  } finally {
    sqlite.close();
  }
  console.log('Admin stack tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
