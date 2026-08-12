'use strict';

const crypto = require('crypto');
const { AdminError } = require('./adminApplication');
const { parseCookies } = require('./auth');

function createAdminHttp(options = {}) {
  const application = options.application;
  const adminStore = options.adminStore;
  const readJsonBody = options.readJsonBody;
  const requestIp = options.requestIp || (() => '');
  const requestProtocol = options.requestProtocol || (() => 'http');
  const cookieName = options.cookieName || 'hearts_admin_sid';
  const configured = Boolean(options.configured);
  const loginAttempts = new Map();

  function requestId(req) {
    return String(req.headers['x-request-id'] || '').trim().slice(0, 128) || crypto.randomUUID();
  }

  function sendJson(req, res, statusCode, data, id, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': id,
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function ok(req, res, data, id, meta = null, statusCode = 200, headers = {}) {
    return sendJson(req, res, statusCode, { data, ...(meta ? { meta } : {}), requestId: id }, id, headers);
  }

  function fail(req, res, error, id) {
    const statusCode = Number(error.statusCode || 500);
    return sendJson(req, res, statusCode, {
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal Server Error' : error.message,
        ...(error.details ? { details: error.details } : {})
      },
      requestId: id
    }, id);
  }

  function sessionFor(req) {
    const token = parseCookies(req)[cookieName] || '';
    const session = adminStore.session(token);
    return session ? { ...session, token } : null;
  }

  function cookie(req, token, maxAgeSeconds) {
    const secure = requestProtocol(req) === 'https' ? '; Secure' : '';
    return `${cookieName}=${encodeURIComponent(token)}; Path=/api/admin/v1; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
  }

  function assertCsrf(req, session) {
    const received = String(req.headers['x-csrf-token'] || '');
    if (!received || received !== session.csrfToken) throw new AdminError('CSRF_INVALID', 'CSRF token 无效', 403);
  }

  function assertIdempotency(req) {
    const key = String(req.headers['idempotency-key'] || '').trim().slice(0, 128);
    if (!key) throw new AdminError('IDEMPOTENCY_KEY_REQUIRED', '管理写操作必须提供 Idempotency-Key', 400);
    return key;
  }

  function allowLogin(ip) {
    const now = Date.now();
    const state = loginAttempts.get(ip) || { count: 0, startedAt: now };
    if (now - state.startedAt > 10 * 60 * 1000) {
      state.count = 0;
      state.startedAt = now;
    }
    state.count += 1;
    loginAttempts.set(ip, state);
    return state.count <= 8;
  }

  function queryParams(url) {
    return {
      query: url.searchParams.get('query') || '',
      status: url.searchParams.get('status') || '',
      roomId: url.searchParams.get('roomId') || '',
      userId: url.searchParams.get('userId') || '',
      action: url.searchParams.get('action') || '',
      adminId: url.searchParams.get('adminId') || '',
      cursor: url.searchParams.get('cursor') || '',
      limit: Number(url.searchParams.get('limit') || 20),
      includeSensitive: url.searchParams.get('includeSensitive') === '1'
    };
  }

  async function jsonBody(req) {
    try {
      return await readJsonBody(req);
    } catch (error) {
      throw new AdminError(
        'INVALID_REQUEST_BODY',
        error.message === 'request body too large' ? '请求体过大' : 'JSON 请求体无效',
        400
      );
    }
  }

  function streamEvents(req, res, session, id) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': id
    });
    const push = () => {
      try {
        const overview = application.query({ kind: 'overview' }, session.admin);
        const rooms = application.query({ kind: 'rooms', params: { limit: 100 } }, session.admin);
        res.write(`event: snapshot\ndata: ${JSON.stringify({ overview, rooms, at: new Date().toISOString() })}\n\n`);
      } catch (error) {
        res.write(`event: error\ndata: ${JSON.stringify({ code: error.code || 'STREAM_ERROR' })}\n\n`);
      }
    };
    push();
    const timer = setInterval(push, 10000);
    timer.unref?.();
    req.on('close', () => clearInterval(timer));
  }

  async function handle(req, res, pathname) {
    const id = requestId(req);
    try {
      const url = new URL(req.url || pathname, 'http://localhost');
      if (pathname === '/api/admin/v1/auth/login' && req.method === 'POST') {
        if (!configured) throw new AdminError('ADMIN_NOT_CONFIGURED', '管理员尚未配置', 503);
        const ip = requestIp(req);
        if (!allowLogin(ip)) throw new AdminError('LOGIN_RATE_LIMITED', '登录尝试过多，请稍后再试', 429);
        const body = await jsonBody(req);
        const login = adminStore.login(body.username, body.password);
        if (!login) throw new AdminError('INVALID_CREDENTIALS', '管理员账号或密码错误', 401);
        return ok(req, res, { admin: login.admin, csrfToken: login.csrfToken, expiresAt: login.expiresAt }, id, null, 200, {
          'Set-Cookie': cookie(req, login.token, Math.max(1, Math.floor((new Date(login.expiresAt).getTime() - Date.now()) / 1000)))
        });
      }

      const session = sessionFor(req);
      if (!session) throw new AdminError('UNAUTHORIZED', '请先登录管理平台', 401);

      if (pathname === '/api/admin/v1/auth/me' && ['GET', 'HEAD'].includes(req.method)) {
        return ok(req, res, { admin: session.admin, csrfToken: session.csrfToken, expiresAt: session.expiresAt }, id);
      }
      if (pathname === '/api/admin/v1/auth/logout' && req.method === 'POST') {
        assertCsrf(req, session);
        adminStore.logout(session.token);
        return ok(req, res, { ok: true }, id, null, 200, { 'Set-Cookie': cookie(req, '', 0) });
      }
      if (pathname === '/api/admin/v1/events' && req.method === 'GET') return streamEvents(req, res, session, id);

      const params = queryParams(url);
      if (pathname === '/api/admin/v1/overview' && req.method === 'GET') return ok(req, res, application.query({ kind: 'overview' }, session.admin), id);
      if (pathname === '/api/admin/v1/users' && req.method === 'GET') {
        const result = application.query({ kind: 'users', params }, session.admin);
        return ok(req, res, result.rows, id, result.page);
      }
      const userMatch = pathname.match(/^\/api\/admin\/v1\/users\/([^/]+)$/);
      if (userMatch && req.method === 'GET') return ok(req, res, application.query({ kind: 'user', params: { userId: userMatch[1] } }, session.admin), id);
      const userStatusMatch = pathname.match(/^\/api\/admin\/v1\/users\/([^/]+)\/status$/);
      if (userStatusMatch && req.method === 'PATCH') {
        assertCsrf(req, session);
        const key = assertIdempotency(req);
        const cached = adminStore.idempotentResult(session.admin.adminId, key);
        if (cached) return ok(req, res, cached, id);
        const body = await jsonBody(req);
        const result = application.execute({ kind: 'updateUserStatus', userId: userStatusMatch[1], ...body }, session.admin, { requestId: id, ip: requestIp(req) });
        adminStore.saveIdempotentResult(session.admin.adminId, key, result);
        return ok(req, res, result, id);
      }
      if (pathname === '/api/admin/v1/matches' && req.method === 'GET') {
        const result = application.query({ kind: 'matches', params }, session.admin);
        return ok(req, res, result.rows, id, result.page);
      }
      const matchMatch = pathname.match(/^\/api\/admin\/v1\/matches\/([^/]+)$/);
      if (matchMatch && req.method === 'GET') return ok(req, res, application.query({ kind: 'match', params: { matchId: matchMatch[1] } }, session.admin), id);
      if (pathname === '/api/admin/v1/rooms' && req.method === 'GET') {
        const result = application.query({ kind: 'rooms', params }, session.admin);
        return ok(req, res, result.rows, id, result.page);
      }
      const roomMatch = pathname.match(/^\/api\/admin\/v1\/rooms\/([^/]+)$/);
      if (roomMatch && req.method === 'GET') return ok(req, res, application.query({ kind: 'room', params: { roomId: roomMatch[1], includeSensitive: params.includeSensitive } }, session.admin), id);
      const disbandMatch = pathname.match(/^\/api\/admin\/v1\/rooms\/([^/]+)\/disband$/);
      if (disbandMatch && req.method === 'POST') {
        assertCsrf(req, session);
        const key = assertIdempotency(req);
        const cached = adminStore.idempotentResult(session.admin.adminId, key);
        if (cached) return ok(req, res, cached, id);
        const body = await jsonBody(req);
        const result = application.execute({ kind: 'disbandRoom', roomId: disbandMatch[1], reason: body.reason }, session.admin, { requestId: id, ip: requestIp(req) });
        adminStore.saveIdempotentResult(session.admin.adminId, key, result);
        return ok(req, res, result, id);
      }
      if (pathname === '/api/admin/v1/ai/learning' && req.method === 'GET') return ok(req, res, application.query({ kind: 'aiLearning' }, session.admin), id);
      if (pathname === '/api/admin/v1/audit-logs' && req.method === 'GET') {
        const result = application.query({ kind: 'audit', params }, session.admin);
        return ok(req, res, result.rows, id, result.page);
      }
      throw new AdminError('ROUTE_NOT_FOUND', '管理接口不存在', 404);
    } catch (error) {
      if (!error.statusCode) console.error(error);
      return fail(req, res, error, id);
    }
  }

  return { handle };
}

module.exports = { createAdminHttp };
