'use strict';

const crypto = require('crypto');
const { publicMatch } = require('./userAdminRepository');

function parseCookies(req) {
  const cookies = {};
  String(req.headers?.cookie || '').split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function readJsonBody(req, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('invalid json body'));
      }
    });
    req.on('error', reject);
  });
}

async function defaultFetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('QQ returned non-json response');
  }
  if (!response.ok) throw new Error(parsed?.msg || `QQ request failed: ${response.status}`);
  return parsed;
}

function createAuth(options = {}) {
  const userStore = options.userStore;
  if (!userStore) throw new Error('userStore is required');

  const requestProtocol = options.requestProtocol || (() => 'http');
  const qqAppId = String(options.qqAppId || '').trim();
  const qqCallbackUrl = String(options.qqCallbackUrl || '').trim();
  const authCookieName = options.authCookieName || 'hearts_sid';
  const sessionTtlMs = Number(options.sessionTtlMs || 1000 * 60 * 60 * 24 * 30);
  const fetchJson = options.fetchJson || defaultFetchJson;
  const randomBytes = options.randomBytes || (size => crypto.randomBytes(size));
  const randomUUID = options.randomUUID || (() => crypto.randomUUID());
  const sessions = options.sessions || new Map();
  const publicRecentMatches = options.publicRecentMatches || (limit => userStore.recentMatches(limit).map(publicMatch));

  function accessState(user) {
    if (!user) return { allowed: false, status: 'missing' };
    const status = user.status || 'active';
    if (status === 'active') return { allowed: true, status };
    if (status === 'suspended' && user.statusExpiresAt) {
      const expiresAt = Date.parse(user.statusExpiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        user.status = 'active';
        user.statusReason = '';
        user.statusExpiresAt = '';
        user.statusUpdatedAt = new Date().toISOString();
        user.version = Number(user.version || 0) + 1;
        userStore.save();
        return { allowed: true, status: 'active' };
      }
    }
    return { allowed: false, status, reason: user.statusReason || '' };
  }

  function sessionCookie(req, sessionId, maxAgeSeconds) {
    const secure = requestProtocol(req) === 'https' ? '; Secure' : '';
    return `${authCookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  }

  function clearSessionCookie(req) {
    const secure = requestProtocol(req) === 'https' ? '; Secure' : '';
    return `${authCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }

  function getSession(req) {
    const sessionId = parseCookies(req)[authCookieName];
    if (!sessionId) return null;
    const session = sessions.get(sessionId);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  function getUserBySession(req) {
    const session = getSession(req);
    if (!session?.userId) return null;
    const user = userStore.findByUserId(session.userId);
    return accessState(user).allowed ? user : null;
  }

  function createSession(userId) {
    const sessionId = randomBytes(32).toString('base64url');
    sessions.set(sessionId, {
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + sessionTtlMs
    });
    return sessionId;
  }

  function sendJson(req, res, statusCode, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
      ...extraHeaders
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function verifyQqAccess(openId, accessToken) {
    if (!qqAppId) throw new Error('QQ_APP_ID is not configured');
    const normalizedOpenId = String(openId || '').trim();
    const normalizedToken = String(accessToken || '').trim();
    if (!normalizedOpenId || !normalizedToken) throw new Error('missing QQ openId or accessToken');

    const meUrl = `https://graph.qq.com/oauth2.0/me?access_token=${encodeURIComponent(normalizedToken)}&fmt=json`;
    const identity = await fetchJson(meUrl);
    if (String(identity.client_id || '') !== qqAppId) throw new Error('QQ app id mismatch');
    if (String(identity.openid || '') !== normalizedOpenId) throw new Error('QQ openId mismatch');

    let profile = {};
    try {
      const profileUrl = `https://graph.qq.com/user/get_user_info?access_token=${encodeURIComponent(normalizedToken)}&oauth_consumer_key=${encodeURIComponent(qqAppId)}&openid=${encodeURIComponent(normalizedOpenId)}`;
      profile = await fetchJson(profileUrl);
    } catch (error) {
      profile = {};
    }

    return {
      openId: normalizedOpenId,
      nickname: String(profile.nickname || '').trim(),
      avatarUrl: String(profile.figureurl_qq_2 || profile.figureurl_qq_1 || profile.figureurl_2 || profile.figureurl_1 || '').trim()
    };
  }

  async function handleApi(req, res, pathname) {
    const requestUrl = new URL(req.url || pathname || '/', 'http://localhost');
    if (pathname === '/api/me' && ['GET', 'HEAD'].includes(req.method)) {
      const user = getUserBySession(req);
      return sendJson(req, res, 200, {
        authenticated: Boolean(user),
        user: userStore.publicUser(user),
        qq: {
          appId: qqAppId,
          callbackUrl: qqCallbackUrl
        }
      });
    }

    if (pathname === '/api/stats/me' && ['GET', 'HEAD'].includes(req.method)) {
      const user = getUserBySession(req);
      const guestId = String(requestUrl.searchParams.get('guestId') || '').trim();
      return sendJson(req, res, 200, userStore.identityStats({
        userId: user?.userId || '',
        guestId
      }));
    }

    if (pathname === '/api/leaderboard' && ['GET', 'HEAD'].includes(req.method)) {
      return sendJson(req, res, 200, {
        leaderboard: userStore.leaderboard(Number(requestUrl.searchParams.get('limit') || 20))
      });
    }

    if (pathname === '/api/matches/recent' && ['GET', 'HEAD'].includes(req.method)) {
      return sendJson(req, res, 200, {
        matches: publicRecentMatches(Number(requestUrl.searchParams.get('limit') || 20))
      });
    }

    if (pathname === '/api/auth/guest' && req.method === 'POST') {
      return sendJson(req, res, 200, { guestId: `guest-${randomUUID()}` });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const sessionId = parseCookies(req)[authCookieName];
      if (sessionId) sessions.delete(sessionId);
      return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
    }

    if (pathname === '/api/auth/qq' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const qqUser = await verifyQqAccess(body.openId, body.accessToken);
        const existingUser = userStore.findByQqOpenId(qqUser.openId);
        const existingState = existingUser ? accessState(existingUser) : null;
        if (existingState && !existingState.allowed) {
          return sendJson(req, res, 403, {
            ok: false,
            code: existingState.status === 'banned' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED',
            message: existingState.status === 'banned' ? '账号已被封禁' : '账号已被暂停使用'
          });
        }
        const user = userStore.upsertQqUser({ ...qqUser, guestId: String(body.guestId || '').trim() });
        const state = accessState(user);
        if (!state.allowed) {
          return sendJson(req, res, 403, {
            ok: false,
            code: state.status === 'banned' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED',
            message: state.status === 'banned' ? '账号已被封禁' : '账号已被暂停使用'
          });
        }
        const sessionId = createSession(user.userId);
        return sendJson(req, res, 200, {
          ok: true,
          authenticated: true,
          user: userStore.publicUser(user)
        }, { 'Set-Cookie': sessionCookie(req, sessionId, Math.floor(sessionTtlMs / 1000)) });
      } catch (error) {
        return sendJson(req, res, 401, { ok: false, message: error.message || 'QQ auth failed' });
      }
    }

    const allow = ['/api/me', '/api/stats/me', '/api/leaderboard', '/api/matches/recent'].includes(pathname) ? 'GET, HEAD' : 'POST';
    return sendJson(req, res, pathname.startsWith('/api/') ? 404 : 405, {
      ok: false,
      message: pathname.startsWith('/api/') ? 'API route not found' : 'Method Not Allowed'
    }, { Allow: allow });
  }

  return {
    clearSessionCookie,
    createSession,
    getSession,
    getUserBySession,
    accessState,
    handleApi,
    parseCookies,
    readJsonBody,
    sendJson,
    sessionCookie,
    verifyQqAccess
  };
}

module.exports = {
  createAuth,
  defaultFetchJson,
  parseCookies,
  readJsonBody
};
