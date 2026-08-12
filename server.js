const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const aiLearning = require('./src/server/aiLearning');
const { createAuth } = require('./src/server/auth');
const { chooseLowestCostWinningCard, hasOtherPlayerRoundPoints } = require('./src/server/aiCardChoice');
const { getSweepEligibility } = require('./src/server/sweepRules');
const { aiInteractionRouting } = require('./src/server/interactionRules');
const { createUserStore } = require('./src/server/userStore');
const { createSqliteDatabase } = require('./src/server/sqliteDatabase');
const { createSqliteUserStore } = require('./src/server/sqliteUserStore');
const { createUserAdminRepository } = require('./src/server/userAdminRepository');
const { createAdminStore } = require('./src/server/adminStore');
const { createAdminApplication } = require('./src/server/adminApplication');
const { createAdminHttp } = require('./src/server/adminHttp');
const { createLiveRoomAdminRepository } = require('./src/server/liveRoomAdminRepository');
const { resolvePureBotTakeoverTarget } = require('./src/server/botTakeoverRules');
const { explainIllegalCardForState, legalCardsForState } = require('./src/server/playRules');
const { publicHostId, publicPlayerFor } = require('./src/server/roomProjection');
const {
  canResumeSeat,
  canResumeTakeoverSeat,
  createRejoinGrant,
  rejoinGrantTokenFor,
  normalizeReconnectToken
} = require('./src/server/sessionIdentity');
const { version: APP_VERSION } = require('./package.json');
const { logs: VERSION_LOGS } = require('./release-info.json');
const RELEASE_INFO_SCRIPT = `window.HEARTS_RELEASE_INFO = ${JSON.stringify({
  version: APP_VERSION,
  displayVersion: `v${APP_VERSION}`,
  logs: VERSION_LOGS
})};\n`;

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const HEALTH_PATHS = new Set(['/healthz', '/readyz']);
const WS_HEARTBEAT_MS = Number(process.env.WS_HEARTBEAT_MS || 10 * 1000);
const WS_MAX_BUFFERED_AMOUNT = Number(process.env.WS_MAX_BUFFERED_AMOUNT || 1024 * 1024);
const WS_MESSAGE_LIMIT = Number(process.env.WS_MESSAGE_LIMIT || 80);
const WS_MESSAGE_WINDOW_MS = Number(process.env.WS_MESSAGE_WINDOW_MS || 10 * 1000);
const WS_PATHS = new Set(
  String(process.env.WS_PATHS || '/ws,/')
    .split(',')
    .map(item => item.trim() || '/')
);
const STATIC_IMMUTABLE_RE = /(?:-[a-z0-9]{6,}|\bv\d+|\bv\d+\.\d+\.\d+)\.(?:webp|png|jpg|jpeg|svg|css|js|woff2?)$/i;
const ALLOWED_HOSTS = String(process.env.ALLOWED_HOSTS || '')
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(item => item.trim().toLowerCase().replace(/\/$/, ''))
  .filter(Boolean);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = process.env.USER_DATA_FILE || path.join(DATA_DIR, 'users.json');
const DATA_BACKEND = String(process.env.DATA_BACKEND || 'sqlite').trim().toLowerCase();
const DATABASE_FILE = process.env.DATABASE_FILE || path.join(DATA_DIR, 'hearts.sqlite');
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'hearts_sid';
const AUTH_SESSION_TTL_MS = Number(process.env.AUTH_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30);
const QQ_APP_ID = String(process.env.QQ_APP_ID || '1904930904').trim();
const QQ_CALLBACK_URL = String(process.env.QQ_CALLBACK_URL || 'https://hearts.duanap.cn/qq-callback.html').trim();
const E2E_FIXTURE_MODE = process.env.E2E_FIXTURE_MODE === '1';
const sqlite = DATA_BACKEND === 'sqlite' ? createSqliteDatabase({ databaseFile: DATABASE_FILE }) : null;
const userStore = sqlite
  ? createSqliteUserStore({ database: sqlite.database, legacyUsersFile: USERS_FILE })
  : createUserStore({ usersFile: USERS_FILE });
const userAdminRepository = createUserAdminRepository(userStore);
const adminStore = sqlite ? createAdminStore({
  database: sqlite.database,
  sessionTtlMs: Number(process.env.ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000)
}) : null;
const adminBootstrap = adminStore?.bootstrap({
  username: process.env.ADMIN_BOOTSTRAP_USERNAME,
  password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  role: process.env.ADMIN_BOOTSTRAP_ROLE || 'super_admin'
}) || { configured: false, created: false };
const auth = createAuth({
  userStore,
  publicRecentMatches: limit => userAdminRepository.publicRecentMatches(limit),
  requestProtocol,
  qqAppId: QQ_APP_ID,
  qqCallbackUrl: QQ_CALLBACK_URL,
  authCookieName: AUTH_COOKIE_NAME,
  sessionTtlMs: AUTH_SESSION_TTL_MS
});
let adminHttp = null;

function firstHeaderValue(value) {
  return String(value || '').split(',')[0].trim();
}

function requestHost(req) {
  return firstHeaderValue(TRUST_PROXY ? (req.headers['x-forwarded-host'] || req.headers.host) : req.headers.host).toLowerCase();
}

function requestProtocol(req) {
  return firstHeaderValue(TRUST_PROXY ? (req.headers['x-forwarded-proto'] || 'http') : 'http') || 'http';
}

function requestIp(req) {
  return firstHeaderValue(TRUST_PROXY ? req.headers['x-forwarded-for'] : '') || req.socket.remoteAddress || '';
}

function requestOrigin(req) {
  return String(req.headers.origin || '').trim().toLowerCase().replace(/\/$/, '');
}

function isAllowedHost(req) {
  if (!ALLOWED_HOSTS.length) return true;
  const host = requestHost(req).replace(/:\d+$/, '');
  return ALLOWED_HOSTS.includes(host);
}

function isAllowedWebSocket(req) {
  if (!isAllowedHost(req)) return false;
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname;
  } catch (error) {
    return false;
  }
  if (!WS_PATHS.has(pathname)) return false;
  if (!ALLOWED_ORIGINS.length) return true;
  return ALLOWED_ORIGINS.includes(requestOrigin(req));
}

function applyBaseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
}

function cacheControlFor(pathname) {
  if (pathname === '/sw.js') return 'no-cache, no-store, must-revalidate';
  if (pathname === '/qq-callback.html') return 'no-store';
  if (pathname === '/index.html' || pathname.endsWith('/index.html')) return 'public, max-age=0, s-maxage=60, must-revalidate, stale-while-revalidate=30';
  if (pathname === '/manifest.webmanifest') return 'public, max-age=3600, s-maxage=86400, must-revalidate';
  if (STATIC_IMMUTABLE_RE.test(pathname)) return 'public, max-age=31536000, immutable';
  return 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';
}

function sendHealth(req, res) {
  applyBaseHeaders(res);
  const body = JSON.stringify({
    ok: true,
    service: 'hearts-by-duanap',
    version: APP_VERSION,
    uptime: Math.round(process.uptime()),
    rooms: rooms.size,
    wsClients: wss?.clients?.size || 0,
    host: requestHost(req),
    protocol: requestProtocol(req)
  });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendReleaseInfo(req, res) {
  applyBaseHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=0, s-maxage=60, must-revalidate',
    'Content-Length': Buffer.byteLength(RELEASE_INFO_SCRIPT)
  });
  res.end(req.method === 'HEAD' ? undefined : RELEASE_INFO_SCRIPT);
}

const server = http.createServer((req, res) => {
  applyBaseHeaders(res);
  if (!isAllowedHost(req)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Misdirected Request');
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(req.url || '/', 'http://localhost');
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Bad Request');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Bad Request');
    return;
  }
  if (E2E_FIXTURE_MODE && pathname === '/__e2e__/fixture') {
    handleE2EFixture(req, res);
    return;
  }
  if (E2E_FIXTURE_MODE && pathname === '/__e2e__/ai-learning/reset') {
    handleE2EAiLearningReset(req, res);
    return;
  }
  if (pathname.startsWith('/api/admin/v1/')) {
    if (!adminHttp) {
      auth.sendJson(req, res, 503, {
        error: { code: 'ADMIN_API_UNAVAILABLE', message: '管理接口当前不可用' },
        requestId: String(req.headers['x-request-id'] || crypto.randomUUID())
      });
      return;
    }
    adminHttp.handle(req, res, pathname);
    return;
  }
  if (pathname.startsWith('/api/')) {
    auth.handleApi(req, res, pathname).catch(error => {
      console.error(error);
      if (!res.headersSent) auth.sendJson(req, res, 500, { ok: false, message: 'Internal Server Error' });
    });
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  if (HEALTH_PATHS.has(pathname)) {
    sendHealth(req, res);
    return;
  }
  if (pathname === '/release-info.js') {
    sendReleaseInfo(req, res);
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  else if (pathname.endsWith('/')) pathname = `${pathname}index.html`;

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath);
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const lastModified = stat.mtime.toUTCString();
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': cacheControlFor(pathname),
      ETag: etag,
      'Last-Modified': lastModified
    };
    const ifNoneMatch = String(req.headers['if-none-match'] || '');
    const ifModifiedSince = Date.parse(String(req.headers['if-modified-since'] || ''));
    const notModified = ifNoneMatch
      ? ifNoneMatch.split(',').map(value => value.trim()).includes(etag)
      : Number.isFinite(ifModifiedSince) && ifModifiedSince >= Math.floor(stat.mtimeMs / 1000) * 1000;
    if (notModified) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { ...headers, 'Content-Length': stat.size });
      res.end();
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': data.length });
      res.end(data);
    });
  });
});
const wss = new WebSocket.Server({
  server,
  maxPayload: Number(process.env.WS_MAX_PAYLOAD || 64 * 1024),
  verifyClient: (info, done) => {
    if (isAllowedWebSocket(info.req)) return done(true);
    return done(false, 403, 'Forbidden');
  }
});

const SUITS = {
  C: { name: '梅花', order: 0 },
  D: { name: '方块', order: 1 },
  S: { name: '黑桃', order: 2 },
  H: { name: '红桃', order: 3 }
};
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const PASS_NAMES = ['向左传牌', '向右传牌', '对家传牌', '不传牌'];
const PASS_DIRS = [1, 3, 2, 0];
const BOT_KINGDOMS = {
  魏: ['曹操', '司马懿', '张辽', '许褚', '夏侯惇', '夏侯渊', '郭嘉', '荀彧', '荀攸', '典韦', '曹仁', '张郃', '徐晃', '乐进', '于禁', '曹丕', '曹植', '贾诩', '程昱', '邓艾', '钟会', '司马昭'],
  蜀: ['刘备', '关羽', '张飞', '赵云', '诸葛亮', '黄忠', '马超', '魏延', '庞统', '姜维', '法正', '徐庶', '关平', '马岱', '黄月英', '刘禅', '严颜', '王平'],
  吴: ['孙权', '孙策', '周瑜', '陆逊', '吕蒙', '甘宁', '太史慈', '鲁肃', '黄盖', '程普', '凌统', '诸葛瑾', '周泰', '丁奉', '陆抗', '大乔', '小乔', '步练师']
};
const BOT_AVATARS = ['魏', '蜀', '吴'];
const HUMAN_NICKNAMES = ['貂蝉', '大乔', '小乔', '甄姬', '黄月英', '孙尚香', '祝融', '蔡文姬', '王异', '步练师', '糜夫人', '甘夫人', '赵云', '马超', '诸葛亮', '关羽', '张飞', '刘备', '黄忠', '魏延', '庞统', '姜维', '法正', '徐庶', '曹操', '司马懿', '张辽', '许褚', '夏侯惇', '夏侯渊', '郭嘉', '荀彧', '荀攸', '典韦', '曹仁', '张郃', '徐晃', '周瑜', '陆逊', '鲁肃', '吕蒙', '甘宁', '太史慈', '孙权', '孙策', '黄盖', '程普', '凌统', '诸葛瑾', '袁绍', '吕布', '陈宫', '华佗', '孟获', '张角', '左慈', '司马昭', '邓艾', '钟会', '羊祜', '陆抗'];
const HUMAN_AVATARS = ['🐰', '🦊', '🐼', '🐻', '🐨', '🐯', '🦝', '🐶', '🐱', '🦌', '🐹', '🐿️'];

// 房间清理策略：
// 1. 全部真人玩家离线后，默认 5 分钟自动解散。
// 2. 房间长期无活动，默认 60 分钟自动解散。
// 可通过环境变量 ROOM_EMPTY_TTL_MS / ROOM_IDLE_TTL_MS 覆盖。
const ROOM_EMPTY_TTL_MS = Number(process.env.ROOM_EMPTY_TTL_MS || 5 * 60 * 1000);
const ROOM_IDLE_TTL_MS = Number(process.env.ROOM_IDLE_TTL_MS || 60 * 60 * 1000);
const ROOM_SWEEP_INTERVAL_MS = Number(process.env.ROOM_SWEEP_INTERVAL_MS || 30 * 1000);
const OFFLINE_TAKEOVER_MS = Number(process.env.OFFLINE_TAKEOVER_MS || 60 * 1000);
const OFFLINE_TAKEOVER_SWEEP_MS = Number(process.env.OFFLINE_TAKEOVER_SWEEP_MS || 10 * 1000);
const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS || 5 * 1000);

const rooms = new Map();

function fixtureCard(cardId) {
  const match = /^([CDSH])(2|3|4|5|6|7|8|9|10|11|12|13|14)$/.exec(String(cardId || ''));
  if (!match) throw new Error(`无效测试牌：${cardId}`);
  return { id: `${match[1]}${match[2]}`, suit: match[1], rank: Number(match[2]) };
}

function fixturePlay(item = {}) {
  return {
    player: Number(item.player),
    card: fixtureCard(item.cardId)
  };
}

function fixtureLastTrick(lastTrick) {
  if (!lastTrick) return null;
  return {
    leadSuit: String(lastTrick.leadSuit || ''),
    leaderPlayer: Number(lastTrick.leaderPlayer),
    winnerPlayer: Number(lastTrick.winnerPlayer),
    winningRank: Number(lastTrick.winningRank || 0),
    points: Number(lastTrick.points || 0),
    cards: (lastTrick.cards || []).map(fixturePlay),
    sweep: Boolean(lastTrick.sweep)
  };
}

function sendFixtureJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function handleE2EAiLearningReset(req, res) {
  if (req.method !== 'POST') {
    sendFixtureJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }
  const summary = aiLearning.resetForTesting();
  sendFixtureJson(res, 200, { ok: true, summary });
}

function handleE2EFixture(req, res) {
  if (req.method !== 'POST') {
    sendFixtureJson(res, 405, { ok: false, message: 'Method Not Allowed' });
    return;
  }

  let raw = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 32 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const fixture = JSON.parse(raw || '{}');
      const room = rooms.get(String(fixture.roomId || ''));
      if (!room) return sendFixtureJson(res, 404, { ok: false, message: '测试房间不存在' });
      if (!Array.isArray(fixture.hands) || fixture.hands.length !== room.players.length) {
        return sendFixtureJson(res, 400, { ok: false, message: '测试手牌必须覆盖全部座位' });
      }

      clearRoomTimers(room);
      room.phase = 'play';
      room.roundNo = Number(fixture.roundNo ?? room.roundNo ?? 1);
      room.trickNo = Number(fixture.trickNo ?? 0);
      room.currentPlayer = Number(fixture.currentPlayer ?? 0);
      room.heartsBroken = Boolean(fixture.heartsBroken);
      room.busy = false;
      room.comparingTrick = false;
      room.collectingTrick = false;
      room.trickWinnerPlayer = null;
      room.sweepCollect = null;
      room.judgeText = '';
      room.sweepOffer = null;
      room.lastTrick = fixtureLastTrick(fixture.lastTrick);
      room.moonShooter = null;
      room.gameOver = false;
      room.specialEvents = [];
      room.interactions = [];
      room.passSelections = [null, null, null, null];
      room.trick = (fixture.trick || []).map(fixturePlay);
      room.players.forEach((player, index) => {
        player.hand = fixture.hands[index].map(fixtureCard);
        player.taken = (fixture.taken?.[index] || []).map(fixtureCard);
        player.round = Number(fixture.roundScores?.[index] || 0);
        player.total = Number(fixture.totalScores?.[index] || 0);
        sortHand(player.hand);
      });
      touchRoom(room);
      broadcast(room);
      return sendFixtureJson(res, 200, { ok: true, roomId: room.id });
    } catch (error) {
      return sendFixtureJson(res, 400, { ok: false, message: error.message });
    }
  });
}

function createReconnectToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function buildEasyRoomIdPool() {
  const ids = new Set();

  // 优先使用更好记的“叠数”：AAAA / AABB / ABAB / ABBA。
  for (let a = 1; a <= 9; a += 1) {
    ids.add(`${a}${a}${a}${a}`);
  }

  for (let a = 1; a <= 9; a += 1) {
    for (let b = 0; b <= 9; b += 1) {
      if (a === b) continue;
      ids.add(`${a}${a}${b}${b}`);
      ids.add(`${a}${b}${a}${b}`);
      ids.add(`${a}${b}${b}${a}`);
    }
  }

  return Array.from(ids);
}

const EASY_ROOM_IDS = buildEasyRoomIdPool();

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createRoomId() {
  for (const id of shuffle(EASY_ROOM_IDS)) {
    if (!rooms.has(id)) return id;
  }

  let id;
  do {
    id = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  } while (rooms.has(id));
  return id;
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickHumanAvatar(room = null) {
  const used = new Set((room?.players || []).filter(player => !player.isBot).map(player => player.avatar).filter(Boolean));
  const available = HUMAN_AVATARS.filter(avatar => !used.has(avatar));
  return randomItem(available.length ? available : HUMAN_AVATARS);
}

function pickHumanNickname(room = null) {
  const used = new Set((room?.players || []).filter(player => !player.isBot).map(player => player.name).filter(Boolean));
  const available = HUMAN_NICKNAMES.filter(name => !used.has(name));
  return randomItem(available.length ? available : HUMAN_NICKNAMES);
}

function pickBotIdentity(room = null) {
  const kingdom = randomItem(BOT_AVATARS);
  const used = new Set((room?.players || []).filter(player => player.isBot && player.avatar === kingdom).map(player => player.name).filter(Boolean));
  const pool = BOT_KINGDOMS[kingdom] || HUMAN_NICKNAMES;
  const available = pool.filter(name => !used.has(name));
  return { kingdom, name: randomItem(available.length ? available : pool) };
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (ws.bufferedAmount > WS_MAX_BUFFERED_AMOUNT) {
      try { ws.terminate(); } catch (error) { /* ignore */ }
      return false;
    }
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      try { ws.terminate(); } catch (terminateError) { /* ignore */ }
    }
  }
  return false;
}

function sendError(ws, message) {
  send(ws, { type: 'error', message });
}

function rankText(rank) {
  if (rank <= 10) return String(rank);
  return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank];
}

function cardName(card) {
  return SUITS[card.suit].name + rankText(card.rank);
}

function makeDeck() {
  const deck = [];
  for (const suit of Object.keys(SUITS)) {
    for (const rank of RANKS) deck.push({ suit, rank, id: suit + rank });
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function sortHand(hand) {
  hand.sort((a, b) => SUITS[a.suit].order - SUITS[b.suit].order || a.rank - b.rank);
}

function isPoint(card) {
  return card.suit === 'H' || (card.suit === 'S' && card.rank === 12);
}

function cardPoints(card) {
  if (card.suit === 'H') return 1;
  if (card.suit === 'S' && card.rank === 12) return 13;
  return 0;
}

function createPlayer({ id, name, ws = null, isBot = false, botIndex = 0, avatar = '', room = null, userId = '', accountProvider = '', guestId = '' }) {
  const botIdentity = isBot ? pickBotIdentity(room) : null;
  return {
    id,
    userId: isBot ? '' : String(userId || ''),
    guestId: isBot ? '' : String(guestId || ''),
    accountProvider: isBot ? '' : String(accountProvider || ''),
    name: name || (isBot ? botIdentity.name : pickHumanNickname(room)),
    avatar: avatar || (isBot ? botIdentity.kingdom : pickHumanAvatar(room)),
    ws,
    isBot,
    connected: isBot || Boolean(ws),
    hand: [],
    taken: [],
    round: 0,
    total: 0,
    receivedCards: [],
    receivedFrom: '',
    leftRoom: false,
    reconnectToken: isBot ? '' : createReconnectToken(),
    takeoverFromId: null,
    takeoverFromName: null,
    takeoverFromAvatar: null,
    takeoverFromReconnectToken: null,
    takeoverAt: null,
    disconnectedAt: null,
    disconnectGraceTimer: null,
    disconnectGraceStartedAt: null
  };
}

function createRoom(host) {
  const room = {
    id: createRoomId(),
    hostId: host.id,
    players: [host],
    phase: 'lobby',
    roundNo: 1,
    passMode: 0,
    passSelections: [null, null, null, null],
    trick: [],
    trickNo: 0,
    currentPlayer: 0,
    heartsBroken: false,
    busy: false,
    comparingTrick: false,
    collectingTrick: false,
    trickWinnerPlayer: null,
    judgeText: '',
    gameOver: false,
    moonShooter: null,
    eventSeq: 0,
    specialEvents: [],
    interactionSeq: 0,
    interactions: [],
    passFlow: null,
    passFlowSeq: 0,
    lastTrick: null,
    sweepCollect: null,
    lastAiInteractionKey: '',
    aiMoonGuardInteractionCount: 0,
    botTakeoverRequests: [],
    timers: [],
    log: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    emptySince: null
  };
  rooms.set(room.id, room);
  return room;
}

function addLog(room, text) {
  room.log.unshift({ round: room.roundNo, text });
  room.log = room.log.slice(0, 200);
}

function addSpecialEvent(room, event) {
  if (!room) return null;
  room.eventSeq = (room.eventSeq || 0) + 1;
  const item = {
    seq: room.eventSeq,
    round: room.roundNo,
    type: event.type || 'event',
    level: event.level || 'minor',
    title: event.title || '牌局事件',
    subtitle: event.subtitle || '',
    player: event.player || '',
    playerIndex: Number.isInteger(event.playerIndex) ? event.playerIndex : null,
    points: Number(event.points || 0),
    at: Date.now()
  };
  room.specialEvents = room.specialEvents || [];
  room.specialEvents.push(item);
  room.specialEvents = room.specialEvents.slice(-10);
  return item;
}


function normalizeInteractionPayload(value) {
  const input = value && typeof value === 'object' ? value : {};
  const allowed = new Map([
    ['emoji', { icon: '💬', label: '表情' }],
    ['flower', { icon: '🌹', label: '送花' }],
    ['tomato', { icon: '🍅', label: '扔番茄' }],
    ['like', { icon: '💙', label: '点赞' }],
    ['applause', { icon: '👏', label: '鼓掌' }],
    ['brick', { icon: '🧱', label: '板砖' }],
    ['slipper', { icon: '🩴', label: '拖鞋' }],
    ['cabbage', { icon: '🥬', label: '大白菜' }],
    ['doge', { icon: '🐶', label: '狗头' }]
  ]);
  const kind = allowed.has(String(input.kind || '')) ? String(input.kind) : 'emoji';
  const fallback = allowed.get(kind);
  const icon = String(input.icon || fallback.icon).slice(0, 8);
  const label = String(input.label || fallback.label).replace(/[<>]/g, '').slice(0, 16);
  return { kind, icon, label };
}

function addInteraction(room, senderIndex, payload = {}) {
  if (!room || !room.players?.[senderIndex]) return null;
  const info = normalizeInteractionPayload(payload);
  const broadcastOnly = Boolean(payload.broadcastOnly);
  let targetIndex = Number(payload.toIndex);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > 3) targetIndex = senderIndex;
  room.interactionSeq = (room.interactionSeq || 0) + 1;
  const sender = room.players[senderIndex];
  const target = room.players[targetIndex] || sender;
  const item = {
    seq: room.interactionSeq,
    round: room.roundNo,
    kind: info.kind,
    icon: info.icon,
    label: info.label,
    fromIndex: senderIndex,
    toIndex: targetIndex,
    broadcastOnly,
    from: sender.name || '玩家',
    to: broadcastOnly ? '' : (target.name || '玩家'),
    at: Date.now()
  };
  room.interactions = room.interactions || [];
  room.interactions.push(item);
  room.interactions = room.interactions.slice(-30);
  addLog(room, broadcastOnly
    ? `${item.from} 发送互动：${item.label}`
    : `${item.from} 对 ${item.to} 发送互动：${item.label}`);
  return item;
}


function addAIInteraction(room, senderIndex, targetIndex, payload = {}) {
  if (!room || !room.players?.[senderIndex]?.isBot) return null;
  const key = `${room.roundNo}:${room.trickNo}:${senderIndex}:${payload.kind || 'emoji'}:${payload.label || ''}`;
  if (room.lastAiInteractionKey === key) return null;
  room.lastAiInteractionKey = key;
  const routing = aiInteractionRouting(payload.kind, senderIndex, targetIndex);
  return addInteraction(room, senderIndex, {
    ...payload,
    toIndex: routing.toIndex,
    broadcastOnly: routing.broadcastOnly
  });
}


const AI_RANDOM_INTERACTIONS = [
  { kind: 'emoji', icon: '👍', label: '干得漂亮' },
  { kind: 'emoji', icon: '😂', label: '哈哈哈' },
  { kind: 'emoji', icon: '⚡', label: '搞快点！搞快点！' },
  { kind: 'emoji', icon: '🛸', label: '小飞棍来喽~' },
  { kind: 'emoji', icon: '😭', label: '家人们，谁懂啊' },
  { kind: 'emoji', icon: '🔍', label: '我要验牌' },
  { kind: 'emoji', icon: '✅', label: '牌没有问题' },
  { kind: 'emoji', icon: '😏', label: '小瘪三' },
  { kind: 'emoji', icon: '🧸', label: '小儿科' },
  { kind: 'emoji', icon: '👞', label: '给我擦皮鞋' },
  { kind: 'like', icon: '💙', label: '点赞' },
  { kind: 'applause', icon: '👏', label: '鼓掌' },
  { kind: 'flower', icon: '🌹', label: '送花' },
  { kind: 'tomato', icon: '🍅', label: '扔番茄' },
  { kind: 'brick', icon: '🧱', label: '板砖' },
  { kind: 'slipper', icon: '🩴', label: '拖鞋' },
  { kind: 'cabbage', icon: '🥬', label: '大白菜' },
  { kind: 'doge', icon: '🐶', label: '狗头' }
];

function maybeTriggerAIRandomInteraction(room, senderIndex, reason = 'play') {
  const sender = room?.players?.[senderIndex];
  if (!room || !sender?.isBot || room.players.length < 2) return null;
  const now = Date.now();
  if (now - Number(room.lastAIRandomInteractionAt || 0) < 16000) return null;
  const chance = reason === 'roundEnd' ? 0.16 : 0.075;
  if (Math.random() > chance) return null;
  const candidates = room.players
    .map((player, index) => ({ player, index }))
    .filter(item => item.index !== senderIndex && item.player);
  if (!candidates.length) return null;
  const target = candidates[Math.floor(Math.random() * candidates.length)].index;
  const payload = AI_RANDOM_INTERACTIONS[Math.floor(Math.random() * AI_RANDOM_INTERACTIONS.length)];
  room.lastAIRandomInteractionAt = now;
  return addAIInteraction(room, senderIndex, target, payload);
}

function maybeTriggerAIMoonGuardInteraction(room, senderIndex, threatIndex, mode = 'suspect') {
  if (!room || !room.players?.[senderIndex]?.isBot || !room.players?.[threatIndex]) return null;
  if (senderIndex === threatIndex) return null;
  // v1.4.11：AI 怀疑 / 阻止射月时的自动互动整局最多 3 条，避免刷屏。
  room.aiMoonGuardInteractionCount = Number(room.aiMoonGuardInteractionCount || 0);
  if (room.aiMoonGuardInteractionCount >= 3) return null;
  const variants = mode === 'block'
    ? [
        { kind: 'emoji', icon: '🚨', label: '拦住他' },
        { kind: 'tomato', icon: '🍅', label: '别冲月亮' }
      ]
    : [
        { kind: 'emoji', icon: '🔍', label: '我要验牌' },
        { kind: 'emoji', icon: '🚨', label: '疑似冲月亮' }
      ];
  const info = variants[(Number(room.trickNo || 0) + senderIndex + threatIndex) % variants.length];
  const sent = addAIInteraction(room, senderIndex, threatIndex, info);
  if (sent) {
    room.aiMoonGuardInteractionCount += 1;
    aiLearning.recordMoonGuard({ room, senderIndex, threatIndex, mode });
  }
  return sent;
}

function maybeTriggerAIInteractionForTrick(room, winnerPlay, points) {
  if (!room?.trick?.length || !winnerPlay) return;
  const queenPlay = room.trick.find(play => play.card?.id === 'S12');
  const winnerIndex = winnerPlay.player;
  if (queenPlay && queenPlay.player !== winnerIndex && room.players[queenPlay.player]?.isBot) {
    addAIInteraction(room, queenPlay.player, winnerIndex, { kind: 'tomato', icon: '🍅', label: '接锅啦' });
    return;
  }
  if (points >= 10) {
    const bot = room.players.findIndex((player, index) => player.isBot && index !== winnerIndex);
    if (bot >= 0) addAIInteraction(room, bot, winnerIndex, { kind: 'emoji', icon: '😅', label: '大礼包' });
    return;
  }
  if (points === 0 && room.players[winnerIndex]?.isBot && room.trickNo >= 6) {
    const target = room.trick.find(play => play.player !== winnerIndex)?.player ?? winnerIndex;
    addAIInteraction(room, winnerIndex, target, { kind: 'like', icon: '💙', label: '稳住' });
  }
}

function maybeTriggerAIInteractionForRoundEnd(room, shooter) {
  if (!room?.players?.length) return;
  if (shooter >= 0) {
    const bot = room.players.findIndex((player, index) => player.isBot && index !== shooter);
    if (bot >= 0) addAIInteraction(room, bot, shooter, { kind: 'flower', icon: '🌹', label: '射月漂亮' });
    return;
  }
  const zeroIndex = room.players.findIndex(player => player.isBot && Number(player.round || 0) === 0);
  if (zeroIndex >= 0) {
    const target = room.players.findIndex((player, index) => index !== zeroIndex && !player.isBot);
    if (target >= 0) addAIInteraction(room, zeroIndex, target, { kind: 'applause', icon: '👏', label: '零分过关' });
  }
}

function pointSummary(cards) {
  const hearts = cards.filter(card => card.suit === 'H').length;
  const hasQueen = cards.some(card => card.suit === 'S' && card.rank === 12);
  const parts = [];
  if (hearts) parts.push(`${hearts} 张红桃`);
  if (hasQueen) parts.push('黑桃 Q');
  return parts.join(' + ') || '无分牌';
}

function triggerTrickEvents(room, winnerPlay, points) {
  if (!room?.trick?.length || !winnerPlay) return;
  const winner = room.players[winnerPlay.player]?.name || '玩家';
  const trickCards = room.trick.map(play => play.card);
  const queenPlay = room.trick.find(play => play.card.suit === 'S' && play.card.rank === 12);
  const winnerCard = winnerPlay.card;
  const winnerCardName = cardName(winnerCard);
  const isLastTrick = room.trickNo === 12;

  // 高光：二点吃分。用某个花色的 2 点牌收下分牌时触发。
  if (points > 0 && winnerCard?.rank === 2) {
    addSpecialEvent(room, {
      type: 'twoPointCapture',
      level: 'highlight',
      title: '二点吃分',
      subtitle: `${winner} 用 ${winnerCardName} 收下 ${points} 分。`,
      player: winner,
      playerIndex: winnerPlay.player,
      points
    });
  }

  // 高光：黑桃女王入袋。最后一墩不触发，最后一墩走压轴事件。
  if (queenPlay) {
    if (!isLastTrick) {
      addSpecialEvent(room, {
        type: 'queenCaptured',
        level: 'highlight',
        title: '黑桃女王入袋',
        subtitle: `${winner} 吃下黑桃 Q，+13 分。`,
        player: winner,
        playerIndex: winnerPlay.player,
        points: 13
      });
    } else {
      const queenPlayer = room.players[queenPlay.player]?.name || '玩家';
      const selfEat = queenPlay.player === winnerPlay.player;
      addSpecialEvent(room, {
        type: selfEat ? 'lastQueenSelf' : 'lastQueenThrow',
        level: 'epic',
        title: selfEat ? '压轴自吃' : '压轴甩锅',
        subtitle: selfEat
          ? `${queenPlayer} 最后一墩打出黑桃 Q，却自己收回。`
          : `${queenPlayer} 最后一墩甩出黑桃 Q，${winner} 接锅。`,
        player: selfEat ? queenPlayer : winner,
        playerIndex: selfEat ? queenPlay.player : winnerPlay.player,
        points: 13
      });
    }
  }

  // 名场面：大祸临头。单墩 14-15 分触发。
  if (points >= 14 && points <= 15) {
    addSpecialEvent(room, {
      type: 'disasterTrick',
      level: 'epic',
      title: '大祸临头',
      subtitle: `${winner} 一墩收下 ${points} 分：${pointSummary(trickCards)}。`,
      player: winner,
      playerIndex: winnerPlay.player,
      points
    });
  }

  maybeTriggerAIInteractionForTrick(room, winnerPlay, points);
}

function triggerRoundEndEvents(room, shooter) {
  if (!room?.players?.length) return;
  if (shooter >= 0) {
    const name = room.players[shooter]?.name || '玩家';
    addSpecialEvent(room, {
      type: 'shootMoon',
      level: 'legendary',
      title: '射中月亮',
      subtitle: `${name} 独揽 26 分，全场改命！`,
      player: name,
      playerIndex: shooter,
      points: 26
    });
    maybeTriggerAIInteractionForRoundEnd(room, shooter);
    return;
  }

  const zeroPlayers = room.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(item => Number(item.player.round || 0) === 0);
  const zeroNames = zeroPlayers.map(item => item.player.name);
  if (zeroNames.length) {
    addSpecialEvent(room, {
      type: 'zeroRound',
      level: 'highlight',
      title: '零分过关',
      subtitle: `${zeroNames.join('、')} 本局完美避分。`,
      player: zeroNames.join('、'),
      playerIndex: zeroPlayers[0]?.playerIndex ?? null
    });
  }

  room.players.forEach((player, playerIndex) => {
    const roundScore = Number(player.round || 0);
    const hearts = (player.taken || []).filter(card => card.suit === 'H').length;

    // 名场面：差点射月。只在 25 分且未射月时触发。
    if (roundScore === 25) {
      addSpecialEvent(room, {
        type: 'nearMoon',
        level: 'epic',
        title: '差点射月',
        subtitle: `${player.name} 本局吃到 25 分，只差一步。`,
        player: player.name,
        playerIndex,
        points: roundScore
      });
    }

    // 名场面：红桃收集者。10 张以上红桃触发。
    if (hearts >= 10) {
      addSpecialEvent(room, {
        type: 'heartCollector',
        level: 'epic',
        title: '红桃收集者',
        subtitle: `${player.name} 收下 ${hearts} 张红桃。`,
        player: player.name,
        playerIndex,
        points: hearts
      });
    }
  });
  maybeTriggerAIInteractionForRoundEnd(room, shooter);
}

function clearRoomTimers(room) {
  for (const timer of room.timers) clearTimeout(timer);
  room.timers = [];
}

function touchRoom(room) {
  if (!room) return;
  room.updatedAt = Date.now();
}

function connectedHumanCount(room) {
  return room.players.filter(player => !player.isBot && player.connected).length;
}

function refreshRoomEmptySince(room) {
  if (!room) return;
  if (connectedHumanCount(room) === 0) {
    if (!room.emptySince) room.emptySince = Date.now();
  } else {
    room.emptySince = null;
  }
}

function closeRoom(room, reason) {
  if (!room || !rooms.has(room.id)) return;
  const message = reason || '房间已自动解散';
  for (const player of room.players) {
    if (!player.isBot && player.ws) {
      send(player.ws, { type: 'roomClosed', roomId: room.id, message });
      try { player.ws.roomId = null; } catch (error) { /* ignore */ }
    }
  }
  clearRoomTimers(room);
  rooms.delete(room.id);
  console.log(`房间 ${room.id} 已解散：${message}`);
}


function sweepAutoTakeovers() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room || !Array.isArray(room.players)) continue;
    const convertedNames = [];
    const converted = convertHumansToBots(room, player => {
      const shouldTakeover = !player.isBot && !player.connected && !player.leftRoom && player.disconnectedAt && now - player.disconnectedAt >= OFFLINE_TAKEOVER_MS;
      if (shouldTakeover) convertedNames.push(player.name || '玩家');
      return shouldTakeover;
    });
    if (!converted) continue;
    touchRoom(room);
    addLog(room, `${convertedNames.join('、')} 离线超过 1 分钟，已由 AI 自动托管。`);
    broadcast(room);
    if (room.phase === 'pass') maybeCompletePass(room);
    if (room.phase === 'play') {
      scheduleAutoLastCard(room);
      scheduleBot(room);
    }
  }
}

function sweepExpiredRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    refreshRoomEmptySince(room);
    if (room.emptySince && now - room.emptySince >= ROOM_EMPTY_TTL_MS) {
      closeRoom(room, '所有真人玩家离线超过时限，房间已自动解散');
      continue;
    }
    if (now - room.updatedAt >= ROOM_IDLE_TTL_MS) {
      closeRoom(room, '房间长时间无操作，已自动解散');
    }
  }
}

function normalizeHost(room) {
  const currentHost = room.players.find(player => player.id === room.hostId);
  if (currentHost && !currentHost.isBot && currentHost.connected && !currentHost.leftRoom) return;
  const nextHost = room.players.find(player => !player.isBot && player.connected && !player.leftRoom);
  if (nextHost) room.hostId = nextHost.id;
}

function findRoomAndIndexByUser(userId, { includeLeft = true } = {}) {
  const normalized = String(userId || '');
  if (!normalized) return null;
  for (const room of rooms.values()) {
    const index = room.players.findIndex(player => player.userId === normalized && (includeLeft || !player.leftRoom));
    if (index >= 0) return { room, playerIndex: index };
  }
  return null;
}

function publicStateFor(room, viewerIndex) {
  const viewer = room.players[viewerIndex];
  const legal = room.phase === 'play' && room.currentPlayer === viewerIndex && !room.busy
    ? legalCards(room, viewerIndex).map(card => card.id)
    : [];
  const sweepOffer = getSweepEligibility(room, viewerIndex);

  return {
    type: 'state',
    roomId: room.id,
    yourIndex: viewerIndex,
    reconnectToken: viewer && !viewer.isBot ? viewer.reconnectToken : '',
    hostId: publicHostId(room),
    isHost: viewer?.id === room.hostId,
    phase: room.phase,
    roundNo: room.roundNo,
    passMode: room.passMode,
    passName: PASS_NAMES[room.passMode],
    players: room.players.map((player, index) => publicPlayerFor(player, index, viewerIndex, room.passSelections)),
    trick: room.trick,
    trickNo: room.trickNo,
    currentPlayer: room.currentPlayer,
    heartsBroken: room.heartsBroken,
    busy: room.busy,
    comparingTrick: room.comparingTrick,
    collectingTrick: room.collectingTrick,
    trickWinnerPlayer: room.trickWinnerPlayer,
    sweepCollect: room.sweepCollect
      ? {
          winnerPlayer: room.sweepCollect.winnerPlayer,
          suit: room.sweepCollect.suit,
          cardCount: room.sweepCollect.cardCount,
          totalCards: room.sweepCollect.totalCards,
          points: room.sweepCollect.points
        }
      : null,
    judgeText: room.judgeText,
    gameOver: room.gameOver,
    moonShooter: room.moonShooter,
    legalCardIds: legal,
    sweepOffer,
    receivedCards: viewer?.receivedCards || [],
    receivedFrom: viewer?.receivedFrom || '',
    specialEvents: room.specialEvents || [],
    interactions: room.interactions || [],
    passFlow: room.passFlow || null,
    lastTrick: room.lastTrick || null,
    botTakeoverRequests: viewer?.id === room.hostId
      ? (room.botTakeoverRequests || []).map(request => ({
          requestId: request.requestId,
          nickname: request.nickname,
          targetIndex: request.targetIndex,
          targetName: request.targetName || room.players[request.targetIndex]?.name || 'AI',
          at: request.at
        }))
      : [],
    aiLearningSummary: viewer?.id === room.hostId ? aiLearning.getSummary() : null,
    roundTable: ['roundEnd', 'gameEnd'].includes(room.phase) ? (room.roundTable || null) : null,
    log: room.log
  };
}

function broadcast(room) {
  refreshRoomEmptySince(room);
  normalizeHost(room);
  room.players.forEach((player, index) => {
    if (!player.isBot && player.ws) send(player.ws, publicStateFor(room, index));
  });
}

function fillBots(room) {
  while (room.players.length < 4) {
    const identity = pickBotIdentity(room);
    room.players.push(createPlayer({
      id: `bot-${room.id}-${room.players.length}-${Date.now()}` ,
      name: identity.name,
      avatar: identity.kingdom,
      isBot: true,
      botIndex: room.players.length - 1,
      room
    }));
  }
}

function makeBotId(room, index) {
  return `bot-${room.id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function convertHumansToBots(room, predicate) {
  let converted = 0;
  room.players.forEach((player, index) => {
    if (!player || player.isBot || !predicate(player, index)) return;
    const oldId = player.id;
    const oldName = player.name || `玩家${index + 1}`;
    const oldAvatar = player.avatar || null;
    player.id = makeBotId(room, index);
    player.name = oldName;
    player.avatar = oldAvatar || pickHumanAvatar(room);
    player.isBot = true;
    player.connected = false;
    player.ws = null;
    player.leftRoom = false;
    player.takeoverFromId = oldId;
    player.takeoverFromName = oldName;
    player.takeoverFromAvatar = oldAvatar;
    player.takeoverFromReconnectToken = player.reconnectToken || createReconnectToken();
    player.takeoverAt = Date.now();
    if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
    player.disconnectGraceTimer = null;
    player.disconnectGraceStartedAt = null;
    player.disconnectedAt = null;
    player.receivedFrom = player.receivedFrom || '';
    converted++;

    if (room.phase === 'pass' && (!room.passSelections[index] || room.passSelections[index].length !== 3)) {
      room.passSelections[index] = choosePassCards(room, index).map(card => card.id);
    }
  });
  return converted;
}

function convertDisconnectedHumansToBots(room, keepClientId = '') {
  return convertHumansToBots(room, player => (
    !player.isBot &&
    !player.connected &&
    !player.leftRoom &&
    player.id !== keepClientId
  ));
}

function convertLeftHumansToBots(room, keepClientId = '') {
  return convertHumansToBots(room, player => (
    !player.isBot &&
    player.leftRoom &&
    player.id !== keepClientId
  ));
}

function resetHands(room, resetScores = false) {
  for (const player of room.players) {
    player.hand = [];
    player.taken = [];
    player.round = 0;
    player.receivedCards = [];
    player.receivedFrom = '';
    if (resetScores) player.total = 0;
  }
}

function startRound(room, { resetScores = false } = {}) {
  if (room.players.length < 4) return;
  touchRoom(room);
  clearRoomTimers(room);
  resetHands(room, resetScores);

  room.phase = 'deal';
  room.trick = [];
  room.trickNo = 0;
  room.currentPlayer = 0;
  room.heartsBroken = false;
  room.busy = false;
  room.comparingTrick = false;
  room.collectingTrick = false;
  room.trickWinnerPlayer = null;
  room.sweepCollect = null;
  room.judgeText = '';
  room.gameOver = false;
  room.moonShooter = null;
  room.specialEvents = [];
  room.passFlow = null;
  room.passFlowSeq = 0;
  room.lastTrick = null;
  room.lastAiInteractionKey = '';
  room.roundTable = null;
  room.lastPassCards = [[], [], [], []];
  room.passSelections = [null, null, null, null];
  if (resetScores) room.aiMoonGuardInteractionCount = 0;

  const deck = shuffle(makeDeck());
  for (let i = 0; i < deck.length; i++) room.players[i % 4].hand.push(deck[i]);
  room.players.forEach(player => sortHand(player.hand));

  room.passMode = (room.roundNo - 1) % 4;
  addLog(room, `第 ${room.roundNo} 局发牌：${PASS_NAMES[room.passMode]}。`);

  broadcast(room);
  room.timers.push(setTimeout(() => finishDeal(room), 2150));
}

function finishDeal(room) {
  if (!room || room.phase !== 'deal') return;

  if (PASS_DIRS[room.passMode] === 0) {
    beginPlay(room);
    return;
  }

  room.phase = 'pass';
  room.players.forEach((player, index) => {
    if (player.isBot) room.passSelections[index] = choosePassCards(room, index).map(card => card.id);
  });
  broadcast(room);
  maybeCompletePass(room);
}

function buildRoundTableSnapshot(room) {
  const direction = PASS_DIRS[room.passMode] || 0;
  room.roundTable = {
    roundNo: room.roundNo,
    passMode: room.passMode,
    passName: PASS_NAMES[room.passMode],
    players: room.players.map((player, index) => {
      const passedToIndex = direction ? (index + direction) % 4 : null;
      return {
        index,
        name: player.name,
        avatar: player.avatar,
        round: Number(player.round || 0),
        cards: (player.hand || []).map(card => ({ ...card })),
        receivedCards: (player.receivedCards || []).map(card => ({ ...card })),
        passedCards: ((room.lastPassCards || [])[index] || []).map(card => ({ ...card })),
        passedTo: passedToIndex == null ? '' : (room.players[passedToIndex]?.name || '')
      };
    })
  };
}

function beginPlay(room) {
  room.phase = 'play';
  room.trick = [];
  room.trickNo = 0;
  room.busy = false;
  room.comparingTrick = false;
  room.collectingTrick = false;
  room.trickWinnerPlayer = null;
  room.judgeText = '';

  buildRoundTableSnapshot(room);

  const starter = room.players.findIndex(player => player.hand.some(card => card.id === 'C2'));
  room.currentPlayer = starter >= 0 ? starter : 0;
  addLog(room, `${room.players[room.currentPlayer].name} 持有梅花2，先出牌。`);
  broadcast(room);
  if (!scheduleAutoOpeningClubTwo(room)) {
    scheduleAutoLastCard(room);
    scheduleBot(room);
  }
}

function countSuit(hand, suit) {
  return hand.filter(card => card.suit === suit).length;
}

function cardDangerValue(card) {
  const weights = aiLearning.getWeights();
  let score = card.rank;
  if (card.suit === 'S' && card.rank === 12) score += 120 * weights.queenDanger;
  if (card.suit === 'S' && card.rank >= 13) score += 46 * weights.highRankDanger;
  if (card.suit === 'H') score += (22 + card.rank) * weights.heartDanger;
  if (card.rank >= 12) score += 10 * weights.highRankDanger;
  if (card.id === 'C2') score -= 80;
  return score;
}

function playedCards(room) {
  const cards = [];
  for (const player of room.players) cards.push(...(player.taken || []));
  cards.push(...(room.trick || []).map(play => play.card).filter(Boolean));
  return cards;
}

function isQueenSpadesGone(room, playerIndex) {
  const ownHand = room.players[playerIndex]?.hand || [];
  return ownHand.some(card => card.id === 'S12') || playedCards(room).some(card => card.id === 'S12');
}

function suitVoidPlan(hand) {
  const groups = Object.keys(SUITS)
    .map(suit => ({ suit, cards: hand.filter(card => card.suit === suit) }))
    .filter(group => group.cards.length > 0 && group.cards.length <= 3)
    .map(group => {
      const cards = sortDangerHigh(group.cards);
      const danger = cards.reduce((sum, card) => sum + cardDangerValue(card), 0);
      const hasC2 = cards.some(card => card.id === 'C2');
      const hasMeaningfulRisk = cards.some(card => card.id === 'S12' || card.suit === 'H' || card.rank >= 8);
      return { ...group, cards, danger, hasC2, hasMeaningfulRisk };
    })
    .filter(group => !group.hasC2 && group.hasMeaningfulRisk);
  groups.sort((a, b) => a.cards.length - b.cards.length || b.danger - a.danger);
  return groups;
}

function passedCardsWithVoidPlan(room, playerIndex, passScore) {
  const hand = [...(room.players[playerIndex]?.hand || [])];
  const selected = [];
  const selectedIds = new Set();

  for (const group of suitVoidPlan(hand)) {
    // 短门通常传空以便后续垫分；但若有一张低风险小牌，留它作为掩护，
    // 可以延后暴露缺门意图，同时仍传走该门的大牌风险。
    const coverCard = sortLow(group.cards).find(card => (
      !isPoint(card) && card.id !== 'C2' && card.rank <= 5
    ));
    const cardsToPass = coverCard && group.cards.length > 1
      ? group.cards.filter(card => card.id !== coverCard.id)
      : group.cards;
    if (selected.length + cardsToPass.length > 3) continue;
    for (const card of cardsToPass) {
      if (selected.length >= 3) break;
      selected.push(card);
      selectedIds.add(card.id);
    }
    if (selected.length >= 3) break;
  }

  const rest = hand
    .filter(card => !selectedIds.has(card.id))
    .sort((a, b) => passScore(b) - passScore(a) || cardDangerValue(b) - cardDangerValue(a) || b.rank - a.rank);
  for (const card of rest) {
    if (selected.length >= 3) break;
    selected.push(card);
  }
  return selected.slice(0, 3);
}

function choosePassCards(room, playerIndex) {
  const player = room.players[playerIndex];
  const hand = [...player.hand];
  const aiWeights = aiLearning.getWeights();
  const suitCounts = Object.fromEntries(Object.keys(SUITS).map(suit => [suit, countSuit(hand, suit)]));
  const hasQueenSpades = hand.some(card => card.id === 'S12');
  const moonPattern = hasMoonLaunchPattern(hand);
  const moonLockSuit = moonPattern ? Object.keys(SUITS).find(suit => {
    const ranks = new Set(hand.filter(card => card.suit === suit).map(card => Number(card.rank)));
    return [10, 11, 12, 13, 14].every(rank => ranks.has(rank));
  }) : '';

  const passScore = card => {
    let score = cardDangerValue(card);

    // 若手牌具备明显射月骨架，尽量保留成套控牌，不轻易拆掉 10/J/Q/K/A。
    if (moonPattern && card.suit === moonLockSuit && card.rank >= 10) score -= 520;

    // 优先处理黑桃 Q，以及会被黑桃 Q 反咬的 A/K。
    if (card.id === 'S12') score += moonPattern ? 220 : 700;
    if (card.suit === 'S' && card.rank >= 13) score += hasQueenSpades || suitCounts.S <= 4 ? 260 : 120;

    // 高红桃、A/K/Q 等控牌过强且带分风险高，优先传走。
    if (card.suit === 'H' && card.rank >= 11) score += 180;
    if (card.suit !== 'S' && card.rank === 14) score += 70;
    if (card.suit !== 'S' && card.rank === 13) score += 45;

    // 尽量做短门：同一花色 1-3 张时，传走更容易形成缺门，后续可甩分或避分。
    if (suitCounts[card.suit] > 0 && suitCounts[card.suit] <= 3) {
      score += (4 - suitCounts[card.suit]) * 34 * aiWeights.voidSuitPass;
      if (card.rank >= 10) score += 26;
    }

    // 保留低张安全牌和梅花 2，避免传掉过多控局资源。
    if (!isPoint(card) && card.rank <= 5) score -= 34;
    if (card.id === 'C2') score -= 120;
    return score;
  };

  return passedCardsWithVoidPlan(room, playerIndex, passScore);
}

function removeCardsByIds(hand, ids) {
  const removed = [];
  for (const id of ids) {
    const index = hand.findIndex(card => card.id === id);
    if (index < 0) return null;
    removed.push(hand[index]);
  }
  for (const card of removed) {
    const index = hand.findIndex(item => item.id === card.id);
    if (index >= 0) hand.splice(index, 1);
  }
  return removed;
}

function submitPass(room, playerIndex, cardIds) {
  if (room.phase !== 'pass') return '现在不是传牌阶段';
  if (!Array.isArray(cardIds) || cardIds.length !== 3) return '必须选择 3 张牌';
  if (new Set(cardIds).size !== 3) return '传牌不能重复选择同一张牌';
  const player = room.players[playerIndex];
  if (!player) return '玩家不存在';
  if (!cardIds.every(id => player.hand.some(card => card.id === id))) return '选择的牌不在你的手牌中';

  touchRoom(room);
  room.passSelections[playerIndex] = cardIds;
  addLog(room, `${player.name} 已选择 3 张传牌。`);
  broadcast(room);
  maybeCompletePass(room);
  return null;
}

function maybeCompletePass(room) {
  if (room.phase !== 'pass') return;
  if (!room.passSelections.every(selection => Array.isArray(selection) && selection.length === 3)) return;

  const direction = PASS_DIRS[room.passMode];
  const passCards = room.passSelections.map((ids, index) => {
    return ids.map(id => room.players[index].hand.find(card => card.id === id)).filter(Boolean);
  });
  room.lastPassCards = passCards.map(cards => cards.map(card => ({ ...card })));

  if (passCards.some(cards => cards.length !== 3)) {
    addLog(room, '传牌失败：有玩家选择的牌已经不存在。');
    room.passSelections = [null, null, null, null];
    broadcast(room);
    return;
  }

  passCards.forEach((cards, index) => {
    aiLearning.recordPass({
      room,
      playerIndex: index,
      cards,
      mode: room.passMode,
      handBefore: room.players[index].hand
    });
  });

  for (let i = 0; i < 4; i++) removeCardsByIds(room.players[i].hand, room.passSelections[i]);
  for (let i = 0; i < 4; i++) {
    const receiverIndex = (i + direction) % 4;
    room.players[receiverIndex].hand.push(...passCards[i]);
  }

  for (let receiver = 0; receiver < 4; receiver++) {
    const sender = (receiver - direction + 4) % 4;
    room.players[receiver].receivedCards = [...passCards[sender]];
    room.players[receiver].receivedFrom = room.players[sender].name;
    sortHand(room.players[receiver].hand);
  }

  room.passFlowSeq = Number(room.passFlowSeq || 0) + 1;
  room.passFlow = {
    seq: room.passFlowSeq,
    roundNo: room.roundNo,
    passMode: room.passMode,
    flows: room.players.map((_, sender) => ({
      from: sender,
      to: (sender + direction) % 4,
      count: 3
    }))
  };

  room.passSelections = [null, null, null, null];
  addLog(room, `传牌完成：${PASS_NAMES[room.passMode]}。`);
  beginPlay(room);
}

function legalCards(room, playerIndex) {
  return legalCardsForState({
    hand: room.players[playerIndex].hand,
    trick: room.trick,
    trickNo: room.trickNo,
    heartsBroken: room.heartsBroken
  });
}

function currentWinningPlay(room) {
  const leadSuit = room.trick[0].card.suit;
  return room.trick
    .filter(play => play.card.suit === leadSuit)
    .sort((a, b) => b.card.rank - a.card.rank)[0];
}

function sortLow(cards) {
  return [...cards].sort((a, b) => a.rank - b.rank || SUITS[a.suit].order - SUITS[b.suit].order);
}

function sortHigh(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || SUITS[b.suit].order - SUITS[a.suit].order);
}

function sortDangerHigh(cards) {
  return [...cards].sort((a, b) => cardDangerValue(b) - cardDangerValue(a) || b.rank - a.rank);
}

function trickPoints(room) {
  return (room.trick || []).reduce((sum, play) => sum + cardPoints(play.card), 0);
}

function roundPointsSoFar(room) {
  return (room.players || []).reduce((sum, player) => sum + Number(player.round || 0), 0) + trickPoints(room);
}

function pendingPointOwners(room) {
  if (!room) return [];
  const owners = [];
  if (trickPoints(room) > 0) {
    const winnerPlay = getTrickWinnerPlay(room);
    if (Number.isInteger(winnerPlay?.player)) owners.push(winnerPlay.player);
  }
  if (Number(room.sweepCollect?.points || 0) > 0 && Number.isInteger(room.sweepCollect?.winnerPlayer)) {
    owners.push(room.sweepCollect.winnerPlayer);
  }
  return owners;
}

function hasOtherKnownRoundPoints(room, playerIndex) {
  return hasOtherPlayerRoundPoints({
    players: room?.players || [],
    pendingPointOwners: pendingPointOwners(room)
  }, playerIndex);
}

function findMoonThreat(room, playerIndex) {
  const aiWeights = aiLearning.getWeights();
  const totalKnownPoints = roundPointsSoFar(room);
  let best = null;
  for (let i = 0; i < room.players.length; i += 1) {
    if (i === playerIndex) continue;
    if (hasOtherKnownRoundPoints(room, i)) continue;
    const player = room.players[i];
    const score = Number(player.round || 0);
    const taken = player.taken || [];
    const heartsTaken = taken.filter(card => card.suit === 'H').length;
    const hasQueen = taken.some(card => card.id === 'S12');
    const pointShare = totalKnownPoints > 0 ? score / totalKnownPoints : 0;
    const justWonPointTrick = room.lastTrick?.winnerPlayer === i && Number(room.lastTrick?.points || 0) > 0;
    const hasEarlyMoonPressure = totalKnownPoints >= 6
      && score >= 5
      && pointShare >= 0.7
      && heartsTaken >= 3
      && taken.length >= 8
      && justWonPointTrick;

    // 单独吃到黑桃 Q 或几张红桃不代表冲月。至少需要控制大多数公开分数，
    // 并且已经收集较多红桃；接近 26 分时才放宽黑桃 Q 条件。
    const collectingMoonSet = score >= 16 && pointShare >= 0.82 && heartsTaken >= 5;
    const nearMoonThreshold = Math.max(20, Math.round(22 / aiWeights.moonDefense));
    const isNearMoon = score >= nearMoonThreshold && pointShare >= 0.88 && (heartsTaken >= 8 || hasQueen);
    if ((hasEarlyMoonPressure || collectingMoonSet || isNearMoon) && (!best || score > best.score)) {
      best = { playerIndex: i, score, heartsTaken, hasQueen, pointShare, early: hasEarlyMoonPressure };
    }
  }
  return best;
}

function ownPublicControlScore(hand) {
  return (hand || []).reduce((sum, card) => {
    let value = 0;
    if (card.rank >= 13) value += 2;
    else if (card.rank === 12) value += 1;
    if (card.suit === 'H' && card.rank >= 10) value += 2;
    if (card.id === 'S12') value += 2;
    if (card.suit === 'S' && card.rank >= 13) value += 1;
    return sum + value;
  }, 0);
}

function hasMoonLaunchPattern(hand) {
  const cards = hand || [];
  const lockSuit = Object.keys(SUITS).find(suit => {
    const ranks = new Set(cards.filter(card => card.suit === suit).map(card => Number(card.rank)));
    return [10, 11, 12, 13, 14].every(rank => ranks.has(rank));
  });
  if (!lockSuit) return false;
  const outsideKingsAces = cards.filter(card => card.suit !== lockSuit && Number(card.rank) >= 13).length;
  const heartControl = cards.filter(card => card.suit === 'H' && Number(card.rank) >= 10).length;
  return outsideKingsAces >= 2 || (lockSuit === 'H' && outsideKingsAces >= 1) || heartControl >= 4;
}

function suitLedBefore(room, suit) {
  if (!suit) return false;
  const history = playedCards(room).filter(card => card && card.suit === suit);
  const current = (room.trick || []).filter(play => play.card?.suit === suit).length;
  return history.length > current;
}

function firstRoundHighDump(room, playerIndex, leadSuit, follows, pointsOnTable) {
  if (!Array.isArray(follows) || !follows.length || pointsOnTable) return null;
  const hand = room.players[playerIndex]?.hand || [];
  // 首墩梅花 2 开局不能出分牌，跟梅花时可以积极甩掉最大梅花，减少后续吃牌权风险。
  if (room.trickNo === 0 && leadSuit === 'C') return sortHigh(follows)[0];
  // 方片首次被领出且自己方片不多时，同样优先释放大方片；方片很多则保留小牌控节奏。
  if (leadSuit === 'D' && !suitLedBefore(room, 'D')) {
    const diamondCount = countSuit(hand, 'D');
    if (diamondCount > 0 && diamondCount <= 4) return sortHigh(follows)[0];
  }
  return null;
}


function smallSafeOtherSuitLead(room, legal) {
  const previousSuit = room.lastTrick?.leadSuit || '';
  const safe = sortLow((legal || []).filter(card => !isPoint(card) && card.rank <= 5));
  const other = safe.filter(card => !previousSuit || card.suit !== previousSuit);
  return other[0] || null;
}

function lowHeartLeadForTempo(room, legal) {
  if (!room.heartsBroken || room.trickNo > 5) return null;
  const lowHearts = sortLow((legal || []).filter(card => card.suit === 'H' && card.rank <= 4));
  return lowHearts[0] || null;
}

function shouldAvoidRepeatMaxSuit(room, candidates) {
  const last = room.lastTrick;
  if (!last || !last.leadSuit || !Array.isArray(candidates) || !candidates.length) return false;
  const sameSuit = candidates.filter(card => card.suit === last.leadSuit);
  if (!sameSuit.length) return false;
  const lowSame = sortLow(sameSuit)[0];
  if (!lowSame) return false;
  // 如果上一墩该花色已经被较大牌拿下，而自己现在同花色只剩高张，优先尝试其他 2/3/4/5 小牌，不急着重新把牌权拿回来。
  return lowSame.rank >= Math.max(10, Number(last.winningRank || 0));
}

function shouldTryShootMoon(room, playerIndex, legal) {
  if (hasOtherKnownRoundPoints(room, playerIndex)) return false;
  const aiWeights = aiLearning.getWeights();
  const player = room.players[playerIndex];
  const roundScore = Number(player.round || 0);
  const hand = player.hand || [];
  const controlScore = ownPublicControlScore(hand);
  const legalCanCollect = (legal || []).some(card => card.rank >= 12 || isPoint(card));
  const moonPattern = hasMoonLaunchPattern(hand);
  // 高手射月：当某一花色 10/J/Q/K/A 齐全且其它花色仍有两张以上 K/A 时，可从前中期主动尝试吃分。
  if (moonPattern && (legalCanCollect || room.trickNo <= 4 || roundScore >= 4)) return true;
  // 保守射月：只有自己已经吃到不少分，且手中仍有明显控牌能力时才继续推进。
  if (roundScore >= 20) return controlScore * aiWeights.moonAggression >= 4 && legalCanCollect;
  if (roundScore >= 15) return controlScore * aiWeights.moonAggression >= 7 && legalCanCollect;
  if (roundScore >= 10 && moonPattern) return controlScore * aiWeights.moonAggression >= 5;
  return false;
}

function chooseLeadCard(room, playerIndex, legal, shootMoon) {
  const low = sortLow(legal);
  const high = sortHigh(legal);

  if (shootMoon) {
    const pointLead = sortHigh(legal.filter(card => card.suit === 'H' || card.id === 'S12'))[0];
    if (pointLead && (room.heartsBroken || pointLead.suit !== 'H')) return pointLead;
    return high[0];
  }

  const queenGone = isQueenSpadesGone(room, playerIndex);
  const safe = low.filter(card => {
    if (isPoint(card)) return false;
    if (card.suit === 'S' && card.rank >= 12 && !queenGone) return false;
    return true;
  });

  const candidates = safe.length ? safe : low.filter(card => !isPoint(card));
  if (candidates.length) {
    const smallOther = smallSafeOtherSuitLead(room, candidates);
    if (smallOther && (room.trickNo <= 4 || shouldAvoidRepeatMaxSuit(room, candidates))) return smallOther;

    const tempoHeart = lowHeartLeadForTempo(room, legal);
    if (tempoHeart && candidates.every(card => card.rank > 5 || card.suit === 'H')) return tempoHeart;

    // 高手风格：优先从长门出低张，减少被迫收分；短门保留给后续垫分/避分。
    const suitGroups = Object.keys(SUITS)
      .map(suit => ({ suit, cards: candidates.filter(card => card.suit === suit) }))
      .filter(group => group.cards.length);
    suitGroups.sort((a, b) => b.cards.length - a.cards.length || sortLow(a.cards)[0].rank - sortLow(b.cards)[0].rank);
    return sortLow(suitGroups[0].cards)[0];
  }

  const tempoHeart = lowHeartLeadForTempo(room, legal);
  if (tempoHeart && !shootMoon) return tempoHeart;
  return low[0] || high[0];
}

function chooseAICard(room, playerIndex) {
  const legal = legalCards(room, playerIndex);
  if (!legal.length) return null;
  const firstTrick = room.trickNo === 0;
  const c2 = legal.find(card => card.id === 'C2');
  if (firstTrick && c2) return c2;

  const low = sortLow(legal);
  const high = sortHigh(legal);
  const shootMoon = shouldTryShootMoon(room, playerIndex, legal);
  const moonThreat = findMoonThreat(room, playerIndex);
  if (moonThreat && room.players[playerIndex]?.isBot) {
    maybeTriggerAIMoonGuardInteraction(room, playerIndex, moonThreat.playerIndex, 'suspect');
  }

  if (room.trick.length === 0) {
    return chooseLeadCard(room, playerIndex, legal, shootMoon);
  }

  const leadSuit = room.trick[0].card.suit;
  const follows = legal.filter(card => card.suit === leadSuit);
  const winningPlay = currentWinningPlay(room);
  const currentWinner = winningPlay?.player;
  const currentWinningCard = winningPlay?.card;
  const pointsOnTable = trickPoints(room) > 0;
  const isLastToAct = room.trick.length === 3;

  if (follows.length) {
    const under = sortHigh(follows.filter(card => card.rank < currentWinningCard.rank));
    const over = sortLow(follows.filter(card => card.rank > currentWinningCard.rank));
    const firstDump = firstRoundHighDump(room, playerIndex, leadSuit, follows, pointsOnTable);
    if (firstDump && !shootMoon) return firstDump;

    if (shootMoon) {
      if (over.length) return sortLow(over)[0];
      return sortHigh(follows)[0] || high[0];
    }

    // 防射月：若威胁玩家正在赢本墩，AI 会主动截胡，但不会在 K/A 同样能赢时白白用黑桃 Q 吃 13 分。
    if (moonThreat && currentWinner === moonThreat.playerIndex && over.length) {
      maybeTriggerAIMoonGuardInteraction(room, playerIndex, moonThreat.playerIndex, 'block');
      return chooseLowestCostWinningCard(over);
    }

    if (under.length) {
      // 非首家跟牌：若当前最大只是 10，则 9/8/7 属于本墩安全张，可优先打出，保留 2-6 以后接牌。
      if (!pointsOnTable && currentWinningCard?.rank === 10 && !moonThreat) {
        const safeBelowTen = sortHigh(under.filter(card => card.rank >= 7 && card.rank <= 9));
        if (safeBelowTen.length) return safeBelowTen[0];
      }
      // 有分时压在最大牌下面并顺手处理高危牌；无分时也趁安全释放 Q/K/A，不把大牌机械留到后期吃大分。
      if (pointsOnTable) return sortDangerHigh(under)[0];
      const safeDump = sortDangerHigh(under.filter(card => card.rank >= 12 || (card.suit === 'S' && card.rank >= 11)))[0];
      return safeDump || under[0];
    }

    // 不得不赢时，先选自身不带分的最低赢牌。黑桃 Q 与 K/A 都能赢时应保留 Q，避免主动吃下 13 分。
    if (over.length) {
      const winningCard = chooseLowestCostWinningCard(over);
      if (isLastToAct && !pointsOnTable && winningCard?.rank <= 10) return winningCard;
      return winningCard;
    }
    return low[0];
  }

  if (shootMoon) {
    const point = sortHigh(legal.filter(card => isPoint(card)))[0];
    return point || high[0];
  }

  // 缺门时优先甩危险牌；但若当前赢家疑似射月，则尽量不继续喂分。
  if (moonThreat && currentWinner === moonThreat.playerIndex) {
    const safe = sortHigh(legal.filter(card => !isPoint(card)))[0];
    if (safe) return safe;
    return sortLow(legal)[0];
  }

  const queenSpades = legal.find(card => card.suit === 'S' && card.rank === 12);
  if (queenSpades && !firstTrick) return queenSpades;

  const highDanger = sortDangerHigh(legal.filter(card => !isPoint(card) && (card.rank >= 12 || card.suit === 'S')))[0];
  const highHearts = sortHigh(legal.filter(card => card.suit === 'H' && card.rank >= 8));
  if (!firstTrick) {
    // 缺门时优先甩真正危险的大牌；红桃小牌可留 1-2 张，后续用来垫缺门或压低风险。
    if (highDanger && (!highHearts.length || cardDangerValue(highDanger) >= cardDangerValue(highHearts[0]) - 8)) return highDanger;
    if (highHearts.length) return highHearts[0];
  }

  const remainingDanger = sortDangerHigh(legal.filter(card => !isPoint(card)))[0];
  if (remainingDanger) return remainingDanger;

  // 末位且本墩已有分，能垫低分时避免额外加大风险。
  if (isLastToAct && pointsOnTable) return low[0];
  return high[0] || low[0];
}

function getTrickWinnerPlay(room) {
  if (!room.trick.length) return null;
  const leadSuit = room.trick[0].card.suit;
  return room.trick
    .filter(play => play.card.suit === leadSuit)
    .sort((a, b) => b.card.rank - a.card.rank)[0];
}

function removeCardById(hand, cardId) {
  const index = hand.findIndex(card => card.id === cardId);
  if (index < 0) return null;
  return hand.splice(index, 1)[0];
}

function playCard(room, playerIndex, cardId) {
  if (room.phase !== 'play') return '现在不是出牌阶段';
  if (room.busy) return '正在结算本墩，请稍等';
  if (room.currentPlayer !== playerIndex) return '还没轮到你出牌';

  const player = room.players[playerIndex];
  const legal = legalCards(room, playerIndex);
  if (!legal.some(card => card.id === cardId)) {
    return explainIllegalCardForState({
      hand: player.hand,
      trick: room.trick,
      trickNo: room.trickNo,
      heartsBroken: room.heartsBroken
    }, cardId);
  }

  const card = removeCardById(player.hand, cardId);
  if (!card) return '这张牌不在你的手牌中';

  touchRoom(room);
  const wasHeartsBroken = room.heartsBroken;
  room.trick.push({ player: playerIndex, card });
  if (card.suit === 'H') {
    room.heartsBroken = true;
    if (!wasHeartsBroken) {
      addSpecialEvent(room, {
        type: 'heartsBroken',
        level: 'minor',
        title: '红桃已破',
        subtitle: `${player.name} 打出第一张红桃，现在可以主动出红桃了。`,
        player: player.name,
        playerIndex
      });
    }
  }
  addLog(room, `${player.name} 出 ${cardName(card)}。`);
  maybeTriggerAIRandomInteraction(room, playerIndex, 'play');

  if (room.trick.length < 4) {
    room.currentPlayer = (playerIndex + 1) % 4;
    broadcast(room);
    scheduleAutoLastCard(room);
    scheduleBot(room);
    return null;
  }

  startTrickJudge(room);
  return null;
}

function startTrickJudge(room) {
  const winnerPlay = getTrickWinnerPlay(room);
  const leadSuit = room.trick[0].card.suit;
  const points = room.trick.reduce((sum, play) => sum + cardPoints(play.card), 0);

  room.busy = true;
  room.comparingTrick = true;
  room.collectingTrick = false;
  room.trickWinnerPlayer = winnerPlay.player;
  room.judgeText = ''; // v1.3.13：不显示文字收墩播报，保留最大牌高亮，并用方向性整叠收牌动画。
  triggerTrickEvents(room, winnerPlay, points);
  broadcast(room);

  room.timers.push(setTimeout(() => {
    room.collectingTrick = true;
    broadcast(room);
  }, 900));

  // v1.3.17：收墩飞行动画由前端克隆层继续播放；牌合并并开始飞行后，即可进入下一墩。
  room.timers.push(setTimeout(() => resolveTrick(room), 1720));
}

function resolveTrick(room) {
  if (room.trick.length !== 4) return;

  const winnerPlay = getTrickWinnerPlay(room);
  const points = room.trick.reduce((sum, play) => sum + cardPoints(play.card), 0);

  const completedTrick = room.trick.map(play => ({ player: play.player, card: { ...play.card } }));
  const leadSuit = completedTrick[0]?.card?.suit || '';
  room.players[winnerPlay.player].taken.push(...room.trick.map(play => play.card));
  room.players[winnerPlay.player].round += points;
  room.lastTrick = {
    leadSuit,
    leaderPlayer: completedTrick[0]?.player ?? null,
    winnerPlayer: winnerPlay.player,
    winningRank: Number(winnerPlay.card?.rank || 0),
    points,
    cards: completedTrick
  };
  addLog(room, `第 ${room.trickNo + 1} 墩：${room.players[winnerPlay.player].name} 收墩，最大牌 ${cardName(winnerPlay.card)}，得到 ${points} 分。`);
  aiLearning.recordTrick({ room, winnerPlay, points, cards: completedTrick.map(play => play.card) });

  room.trick = [];
  room.trickNo++;
  room.currentPlayer = winnerPlay.player;
  room.busy = false;
  room.comparingTrick = false;
  room.collectingTrick = false;
  room.trickWinnerPlayer = null;
  room.judgeText = '';

  if (room.trickNo >= 13) finishRound(room);
  else {
    broadcast(room);
    scheduleAutoLastCard(room);
    scheduleBot(room);
  }
}

function sweepRemainingCards(room, playerIndex) {
  const eligibility = getSweepEligibility(room, playerIndex);
  if (!eligibility) return '当前不满足甩牌条件';

  clearRoomTimers(room);
  const player = room.players[playerIndex];
  const cards = room.players.flatMap((item, index) => (
    (item.hand || []).map(card => ({ player: index, card: { ...card } }))
  ));
  if (!cards.length) return '甩牌状态已变化，请继续正常出牌';
  room.trick = cards;
  room.currentPlayer = playerIndex;
  room.busy = true;
  room.comparingTrick = true;
  room.collectingTrick = false;
  room.trickWinnerPlayer = playerIndex;
  room.judgeText = '甩牌收墩';
  room.sweepCollect = {
    winnerPlayer: playerIndex,
    suit: eligibility.suit,
    cardCount: eligibility.cardCount,
    totalCards: eligibility.totalCards,
    points: eligibility.points,
    cards
  };

  addLog(room, `${player.name} 甩出剩余 ${eligibility.cardCount} 张${SUITS[eligibility.suit].name}，准备收下余牌中的 ${eligibility.points} 分。`);
  addSpecialEvent(room, {
    type: 'sweepCollect',
    level: eligibility.points > 0 ? 'highlight' : 'minor',
    title: '甩牌收墩',
    subtitle: `${player.name} 一次甩出 ${eligibility.cardCount} 张${SUITS[eligibility.suit].name}，收下剩余 ${eligibility.totalCards} 张牌。`,
    player: player.name,
    playerIndex,
    points: eligibility.points
  });
  broadcast(room);

  room.timers.push(setTimeout(() => {
    if (!room.sweepCollect) return;
    room.collectingTrick = true;
    broadcast(room);
  }, 900));

  room.timers.push(setTimeout(() => resolveSweepCollect(room), 1720));
  return null;
}

function resolveSweepCollect(room) {
  const sweep = room.sweepCollect;
  if (!sweep) return;

  const playerIndex = sweep.winnerPlayer;
  const completedTrick = (room.trick || []).map(play => ({ player: play.player, card: { ...play.card } }));
  const cards = completedTrick.map(play => play.card).filter(Boolean);
  room.players.forEach(player => { player.hand = []; });
  room.players[playerIndex].taken.push(...cards);
  room.players[playerIndex].round += Number(sweep.points || 0);
  room.lastTrick = {
    leadSuit: sweep.suit,
    leaderPlayer: playerIndex,
    winnerPlayer: playerIndex,
    winningRank: Math.max(0, ...cards.filter(card => card.suit === sweep.suit).map(card => Number(card.rank || 0))),
    points: Number(sweep.points || 0),
    cards: completedTrick,
    sweep: true
  };
  addLog(room, `第 ${room.trickNo + 1} 墩：${room.players[playerIndex].name} 甩牌收墩，得到 ${sweep.points} 分。`);
  aiLearning.recordTrick({
    room,
    winnerPlay: { player: playerIndex },
    points: Number(sweep.points || 0),
    cards
  });

  room.trick = [];
  room.trickNo = 13;
  room.currentPlayer = playerIndex;
  room.busy = false;
  room.comparingTrick = false;
  room.collectingTrick = false;
  room.trickWinnerPlayer = null;
  room.judgeText = '';
  room.sweepCollect = null;
  finishRound(room);
}

function finishRound(room) {
  room.phase = 'roundEnd';
  room.busy = false;
  const shooter = room.players.findIndex(player => player.round === 26);
  room.moonShooter = shooter >= 0 ? shooter : null;

  triggerRoundEndEvents(room, shooter);

  if (shooter >= 0) {
    addLog(room, `${room.players[shooter].name} 打满贯！其他三家各加 26 分。`);
    for (let i = 0; i < 4; i++) room.players[i].total += i === shooter ? 0 : 26;
  } else {
    for (const player of room.players) player.total += player.round;
  }
  aiLearning.recordRoundResult({ room, shooter });

  if (room.roundTable?.players) {
    room.roundTable.players.forEach((row, index) => {
      row.round = Number(room.players[index]?.round || 0);
      row.total = Number(room.players[index]?.total || 0);
    });
  }

  if (Math.max(...room.players.map(player => player.total)) >= 100) {
    room.phase = 'gameEnd';
    room.gameOver = true;
    const minScore = Math.min(...room.players.map(player => player.total));
    const winners = room.players.filter(player => player.total === minScore).map(player => player.name).join('、');
    addLog(room, `游戏结束：${winners} 获胜。`);
    userStore.recordGameStats(room);
  } else {
    addLog(room, `第 ${room.roundNo} 局结束。`);
  }
  const roundEndBot = room.players.findIndex(player => player?.isBot);
  if (roundEndBot >= 0) maybeTriggerAIRandomInteraction(room, roundEndBot, 'roundEnd');

  broadcast(room);
}

function scheduleAutoOpeningClubTwo(room) {
  if (room.phase !== 'play' || room.busy || room.trickNo !== 0 || room.trick.length !== 0) return false;
  const playerIndex = room.currentPlayer;
  const player = room.players[playerIndex];
  if (!player?.hand?.some(card => card.id === 'C2')) return false;
  const timer = setTimeout(() => {
    if (room.phase !== 'play' || room.busy || room.trickNo !== 0 || room.trick.length !== 0) return;
    if (room.currentPlayer !== playerIndex) return;
    const current = room.players[playerIndex];
    if (!current?.hand?.some(card => card.id === 'C2')) return;
    playCard(room, playerIndex, 'C2');
  }, 720);
  room.timers.push(timer);
  return true;
}

function scheduleAutoLastCard(room) {
  if (room.phase !== 'play' || room.busy) return false;
  const playerIndex = room.currentPlayer;
  const player = room.players[playerIndex];
  if (!player || (player.hand || []).length !== 1) return false;
  const legal = legalCards(room, playerIndex);
  if (legal.length !== 1) return false;
  const cardId = legal[0].id;
  const timer = setTimeout(() => {
    if (room.phase !== 'play' || room.busy) return;
    if (room.currentPlayer !== playerIndex) return;
    const current = room.players[playerIndex];
    if (!current || (current.hand || []).length !== 1) return;
    const currentLegal = legalCards(room, playerIndex);
    if (currentLegal.length === 1 && currentLegal[0].id === cardId) playCard(room, playerIndex, cardId);
  }, 520);
  room.timers.push(timer);
  return true;
}

function scheduleBot(room) {
  if (room.phase !== 'play' || room.busy) return;
  const player = room.players[room.currentPlayer];
  if (!player || !player.isBot) return;
  const sweepOffer = getSweepEligibility(room, room.currentPlayer);

  const timer = setTimeout(() => {
    if (room.phase !== 'play' || room.busy) return;
    if (!room.players[room.currentPlayer]?.isBot) return;
    if (sweepOffer && getSweepEligibility(room, room.currentPlayer)) {
      sweepRemainingCards(room, room.currentPlayer);
      return;
    }
    const card = chooseAICard(room, room.currentPlayer);
    if (card) playCard(room, room.currentPlayer, card.id);
  }, sweepOffer ? 900 : 1700 + Math.floor(Math.random() * 450));
  room.timers.push(timer);
}

function getRoomForSocket(ws) {
  if (!ws.roomId) return null;
  return rooms.get(ws.roomId) || null;
}

function attachSocketToPlayer(ws, room, playerIndex) {
  const player = room.players[playerIndex];
  if (!player || player.isBot) return false;
  if (player.ws && player.ws !== ws) {
    try { player.ws.close(); } catch (error) { /* ignore */ }
  }
  if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
  player.disconnectGraceTimer = null;
  player.disconnectGraceStartedAt = null;
  player.ws = ws;
  player.connected = true;
  if (!player.reconnectToken) player.reconnectToken = createReconnectToken();
  if (ws.authUser?.userId) {
    player.userId = ws.authUser.userId;
    player.accountProvider = ws.authUser.provider || 'qq';
  }
  if (ws.guestId && !player.guestId) player.guestId = ws.guestId;
  player.disconnectedAt = null;
  player.leftRoom = false;
  room.emptySince = null;
  touchRoom(room);
  ws.roomId = room.id;
  ws.playerIndex = playerIndex;
  ws.clientId = player.id;
  return true;
}

function canHost(ws, room) {
  const player = room.players[ws.playerIndex];
  return player && player.id === room.hostId;
}

function normalizeNickname(name) {
  const input = String(name || '').trim();
  let units = 0;
  let output = '';
  for (const char of Array.from(input)) {
    const unit = /[\x00-\xff]/.test(char) ? 1 : 2;
    if (units + unit > 20) break;
    output += char;
    units += unit;
  }
  return output;
}

function replaceTakeoverBotWithHuman(ws, room, botIndex, clientId, nickname) {
  const player = room.players[botIndex];
  if (!player || !player.isBot || !player.takeoverFromName) return false;
  const oldBotId = player.id;
  player.id = clientId;
  player.userId = ws.authUser?.userId || '';
  player.guestId = ws.guestId || player.guestId || '';
  player.accountProvider = ws.authUser?.provider || '';
  player.name = player.takeoverFromName || nickname || '玩家';
  player.avatar = player.takeoverFromAvatar || pickHumanAvatar(room);
  player.reconnectToken = player.takeoverFromReconnectToken || player.reconnectToken || createReconnectToken();
  if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
  player.disconnectGraceTimer = null;
  player.disconnectGraceStartedAt = null;
  player.ws = null;
  player.isBot = false;
  player.connected = false;
  player.disconnectedAt = null;
  player.leftRoom = false;
  player.takeoverFromId = null;
  player.takeoverFromName = null;
  player.takeoverFromAvatar = null;
  player.takeoverFromReconnectToken = null;
  player.takeoverAt = null;

  if (room.hostId === oldBotId) room.hostId = player.id;
  attachSocketToPlayer(ws, room, botIndex);

  if (room.phase === 'pass' && room.passSelections[botIndex]) {
    room.passSelections[botIndex] = null;
  }

  touchRoom(room);
  addLog(room, `${player.name} 已重新加入，并取代 AI 接管座位。`);
  broadcast(room);
  return true;
}

function pureBotSeatIndexes(room) {
  return (room?.players || [])
    .map((player, index) => ({ player, index }))
    .filter(item => item.player?.isBot && !item.player.takeoverFromName)
    .map(item => item.index);
}

function requestPureBotTakeover(ws, room, clientId, nickname, reconnectToken = '', targetOptions = {}) {
  const targets = pureBotSeatIndexes(room);
  if (!targets.length) return false;
  room.botTakeoverRequests = (room.botTakeoverRequests || []).filter(request => request.ws?.readyState === WebSocket.OPEN);
  const existing = room.botTakeoverRequests.find(request => request.clientId === clientId || request.ws === ws);
  const resolvedTarget = resolvePureBotTakeoverTarget(room.players, {
    requestedIndex: targetOptions.requestedIndex,
    requestedName: targetOptions.requestedName,
    nickname,
    previousTargetIndex: existing?.targetIndex
  });
  if (!Number.isInteger(resolvedTarget.targetIndex)) {
    sendError(ws, '目标 AI 座位已变化，请重新选择。');
    return true;
  }
  const request = existing || {
    requestId: `takeover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    ws,
    at: Date.now()
  };
  request.nickname = nickname || '玩家';
  request.userId = ws.authUser?.userId || '';
  request.accountProvider = ws.authUser?.provider || '';
  request.reconnectToken = normalizeReconnectToken(reconnectToken) || createReconnectToken();
  request.targetIndex = resolvedTarget.targetIndex;
  request.targetId = resolvedTarget.targetPlayer?.id || '';
  request.targetName = resolvedTarget.targetPlayer?.name || 'AI';
  request.ws = ws;
  if (!existing) room.botTakeoverRequests.push(request);
  ws.pendingBotTakeover = { roomId: room.id, requestId: request.requestId };
  send(ws, {
    type: 'botTakeoverPending',
    roomId: room.id,
    requestId: request.requestId,
    message: '已向房主发送接管 AI 座位申请，请等待批准。'
  });
  addLog(room, `${request.nickname} 申请接管 ${request.targetName} 的 AI 座位，等待房主批准。`);
  touchRoom(room);
  broadcast(room);
  return true;
}

function approvePureBotTakeover(room, requestId, approved = true) {
  room.botTakeoverRequests = room.botTakeoverRequests || [];
  const requestIndex = room.botTakeoverRequests.findIndex(request => request.requestId === requestId);
  if (requestIndex < 0) return '申请已失效';
  const request = room.botTakeoverRequests.splice(requestIndex, 1)[0];
  const requesterWs = request.ws;
  if (requesterWs?.pendingBotTakeover?.requestId === request.requestId) {
    requesterWs.pendingBotTakeover = null;
  }
  if (!approved) {
    send(requesterWs, { type: 'botTakeoverRejected', roomId: room.id, message: '房主暂未批准接管 AI 座位。' });
    addLog(room, `房主拒绝 ${request.nickname || '玩家'} 接管 ${request.targetName || 'AI'} 的 AI 座位。`);
    touchRoom(room);
    broadcast(room);
    return null;
  }

  const targetIndex = Number(request.targetIndex);
  const player = room.players[targetIndex];
  const targetStillAvailable = Number.isInteger(targetIndex) &&
    pureBotSeatIndexes(room).includes(targetIndex) &&
    player &&
    (!request.targetId || player.id === request.targetId);
  if (!targetStillAvailable) {
    send(requesterWs, { type: 'botTakeoverRejected', roomId: room.id, message: '目标 AI 座位已变化，请重新申请接管。' });
    broadcast(room);
    return '目标 AI 座位已变化，请重新申请接管';
  }

  const oldBotName = player.name || 'AI';
  const oldBotId = player.id;
  player.id = request.clientId;
  player.userId = request.userId || '';
  player.accountProvider = request.accountProvider || '';
  player.name = normalizeNickname(request.nickname) || '玩家';
  player.avatar = pickHumanAvatar(room);
  player.isBot = false;
  player.connected = false;
  player.ws = null;
  player.leftRoom = false;
  player.reconnectToken = normalizeReconnectToken(request.reconnectToken) || createReconnectToken();
  player.takeoverFromId = null;
  player.takeoverFromName = null;
  player.takeoverFromAvatar = null;
  player.takeoverFromReconnectToken = null;
  player.takeoverAt = null;
  if (room.hostId === oldBotId) room.hostId = player.id;

  if (requesterWs?.readyState === WebSocket.OPEN) {
    attachSocketToPlayer(requesterWs, room, targetIndex);
    send(requesterWs, {
      type: 'botTakeoverApproved',
      roomId: room.id,
      reconnectToken: player.reconnectToken,
      message: `房主已批准，你已接管 ${oldBotName} 的座位。`
    });
  }

  if (room.phase === 'pass' && room.passSelections[targetIndex]) {
    room.passSelections[targetIndex] = null;
  }
  addLog(room, `房主批准 ${player.name} 接管 ${oldBotName} 的 AI 座位。`);
  touchRoom(room);
  broadcast(room);
  if (room.phase === 'pass') maybeCompletePass(room);
  if (room.phase === 'play') {
    scheduleAutoLastCard(room);
    scheduleBot(room);
  }
  return null;
}

function handleMessage(ws, msg) {
  if (msg.guestId) ws.guestId = String(msg.guestId || '').trim().slice(0, 128);
  if (msg.type === 'hello') {
    ws.clientId = String(msg.clientId || '');
    const reconnectToken = normalizeReconnectToken(msg.reconnectToken || '');
    const nickname = normalizeNickname(msg.nickname || '');
    const userId = ws.authUser?.userId || '';
    const roomId = typeof msg.roomId === 'string' ? msg.roomId.trim() : '';
    const room = rooms.get(roomId);
    if (room) {
      const index = room.players.findIndex(player => canResumeSeat(player, { userId, reconnectToken }));
      if (index >= 0) {
        attachSocketToPlayer(ws, room, index);
        addLog(room, `${room.players[index].name} 已重新连接。`);
        broadcast(room);
      } else {
        const takeoverIndex = room.players.findIndex(player => canResumeTakeoverSeat(player, { userId, reconnectToken }));
        if (takeoverIndex >= 0) {
          replaceTakeoverBotWithHuman(ws, room, takeoverIndex, ws.clientId, nickname);
        } else {
          sendError(ws, '本地房间身份已失效，请重新加入房间');
        }
      }
    } else if (roomId) {
      sendError(ws, '房间不存在或已超时解散');
    }
    return;
  }

  if (msg.type === 'createRoom') {
    const clientId = String(msg.clientId || ws.clientId || `client-${Date.now()}-${Math.random()}`);
    const existing = findRoomAndIndexByUser(ws.authUser?.userId, { includeLeft: false });
    if (existing && existing.room.phase !== 'gameEnd') {
      attachSocketToPlayer(ws, existing.room, existing.playerIndex);
      send(ws, { type: 'roomCreated', roomId: existing.room.id });
      broadcast(existing.room);
      return;
    }

    const host = createPlayer({
      id: clientId,
      name: normalizeNickname(msg.nickname || '') || pickHumanNickname(),
      ws,
      userId: ws.authUser?.userId || '',
      guestId: msg.guestId || '',
      accountProvider: ws.authUser?.provider || '',
      avatar: pickHumanAvatar()
    });
    const room = createRoom(host);
    attachSocketToPlayer(ws, room, 0);
    addLog(room, `${host.name} 创建了房间。`);
    send(ws, { type: 'roomCreated', roomId: room.id });
    broadcast(room);
    return;
  }

  if (msg.type === 'joinRoom') {
    const roomId = String(msg.roomId || '').trim();
    if (!/^\d{4}$/.test(roomId)) return sendError(ws, '请输入 4 位数字房间号');
    const room = rooms.get(roomId);
    if (!room) return sendError(ws, '房间不存在或已超时解散');

    const clientId = String(msg.clientId || ws.clientId || `client-${Date.now()}-${Math.random()}`);
    const nickname = normalizeNickname(msg.nickname || '') || pickHumanNickname(room);
    const reconnectToken = normalizeReconnectToken(msg.reconnectToken || '');
    const userId = ws.authUser?.userId || '';
    const grantedReconnectToken = rejoinGrantTokenFor(ws.rejoinGrant, roomId);
    const seatCredentials = { userId, reconnectToken: reconnectToken || grantedReconnectToken };
    const existingIndex = room.players.findIndex(player => canResumeSeat(player, seatCredentials));
    if (existingIndex >= 0) {
      ws.rejoinGrant = null;
      attachSocketToPlayer(ws, room, existingIndex);
      addLog(room, `${room.players[existingIndex].name} 已重新加入房间。`);
      broadcast(room);
      return;
    }

    const takeoverIndex = room.players.findIndex(player => canResumeTakeoverSeat(player, seatCredentials));
    if (takeoverIndex >= 0) {
      ws.rejoinGrant = null;
      replaceTakeoverBotWithHuman(ws, room, takeoverIndex, clientId, nickname);
      return;
    }

    if (!['lobby'].includes(room.phase)) {
      if (requestPureBotTakeover(ws, room, clientId, nickname, reconnectToken, {
        requestedIndex: msg.targetIndex,
        requestedName: msg.targetName
      })) return;
      return sendError(ws, '牌局已经开始，仅原玩家、被 AI 接管的玩家或申请接管纯 AI 座位的玩家可加入');
    }
    if (room.players.length >= 4) {
      if (requestPureBotTakeover(ws, room, clientId, nickname, reconnectToken, {
        requestedIndex: msg.targetIndex,
        requestedName: msg.targetName
      })) return;
      return sendError(ws, '房间已满');
    }

    const player = createPlayer({
      id: clientId,
      name: nickname,
      ws,
      userId: ws.authUser?.userId || '',
      guestId: msg.guestId || '',
      accountProvider: ws.authUser?.provider || '',
      avatar: pickHumanAvatar(room),
      room
    });
    room.players.push(player);
    touchRoom(room);
    attachSocketToPlayer(ws, room, room.players.length - 1);
    addLog(room, `${player.name} 加入了房间。`);

    if (room.players.length === 4) startRound(room);
    else broadcast(room);
    return;
  }

  const room = getRoomForSocket(ws);
  if (!room) return sendError(ws, '请先创建或加入房间');

  if (msg.type === 'leaveRoom') {
    const player = room.players[ws.playerIndex];
    if (player && !player.isBot && player.ws === ws) {
      if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
      player.disconnectGraceTimer = null;
      player.disconnectGraceStartedAt = null;
      player.connected = false;
      player.leftRoom = true;
      player.ws = null;
      ws.rejoinGrant = createRejoinGrant(room.id, player.reconnectToken);
      addLog(room, `${player.name} 主动退出了房间，可稍后用房间号重新加入。`);
      send(ws, { type: 'leftRoom', roomId: room.id, message: '已退出房间，可重新输入房间号加入。' });
      ws.roomId = null;
      ws.playerIndex = null;
      refreshRoomEmptySince(room);
      broadcast(room);
    }
    return;
  }

  if (msg.type === 'takeoverOffline') {
    if (!canHost(ws, room)) return sendError(ws, '只有房主可以设置 AI 接管');
    const converted = convertDisconnectedHumansToBots(room, ws.clientId);
    if (!converted) return sendError(ws, '当前没有可接管的离线真人玩家');
    touchRoom(room);
    addLog(room, `房主已设置 AI 接管 ${converted} 名离线玩家。`);
    normalizeHost(room);
    broadcast(room);
    maybeCompletePass(room);
    scheduleBot(room);
    return;
  }

  if (msg.type === 'approveBotTakeover') {
    if (!canHost(ws, room)) return sendError(ws, '只有房主可以批准接管 AI 座位');
    const error = approvePureBotTakeover(room, String(msg.requestId || ''), msg.approved !== false);
    if (error) sendError(ws, error);
    return;
  }

  if (msg.type === 'disbandRoom') {
    if (!canHost(ws, room)) return sendError(ws, '只有房主可以解散房间');
    closeRoom(room, '房主已解散房间');
    return;
  }

  if (msg.type === 'fillBotsAndStart') {
    if (!canHost(ws, room)) return sendError(ws, '只有房主可以设置 AI 补位');

    if (room.phase === 'lobby') {
      const converted = convertLeftHumansToBots(room, ws.clientId);
      fillBots(room);
      addLog(room, converted
        ? `房主使用 AI 补位 ${converted} 名主动退出玩家，并补齐座位，牌局开始。`
        : '房主使用 AI 补齐座位，牌局开始。');
      startRound(room, { resetScores: true });
      return;
    }

    const converted = convertLeftHumansToBots(room, ws.clientId);
    if (!converted) return sendError(ws, '当前没有主动退出的真人玩家可由 AI 补位');
    touchRoom(room);
    addLog(room, `房主已设置 AI 补位 ${converted} 名主动退出玩家。`);
    normalizeHost(room);
    broadcast(room);
    maybeCompletePass(room);
    scheduleBot(room);
    return;
  }

  if (msg.type === 'startGame') {
    if (!canHost(ws, room)) return sendError(ws, '只有房主可以开始游戏');
    if (room.phase !== 'lobby') return sendError(ws, '当前牌局已经开始');
    if (room.players.length !== 4) return sendError(ws, '需要 4 名玩家，或使用 AI 补位');
    startRound(room, { resetScores: true });
    return;
  }

  if (msg.type === 'passCards') {
    const error = submitPass(room, ws.playerIndex, msg.cards);
    if (error) sendError(ws, error);
    return;
  }

  if (msg.type === 'playCard') {
    const error = playCard(room, ws.playerIndex, String(msg.cardId || ''));
    if (error) sendError(ws, error);
    return;
  }

  if (msg.type === 'sweepCards') {
    const error = sweepRemainingCards(room, ws.playerIndex);
    if (error) sendError(ws, error);
    return;
  }


  if (msg.type === 'interaction') {
    addInteraction(room, ws.playerIndex, {
      ...(msg.interaction || msg),
      broadcastOnly: false
    });
    touchRoom(room);
    broadcast(room);
    return;
  }

  if (msg.type === 'startNextRound') {
    if (!['roundEnd'].includes(room.phase)) return sendError(ws, '当前不能开始下一局');
    room.roundNo++;
    startRound(room);
    return;
  }

  if (msg.type === 'restartGame') {
    if (!canHost(ws, room)) return sendError(ws, '只有房主可以再来一局');
    if (room.phase !== 'gameEnd') return sendError(ws, '游戏结束后才能再来一局');
    clearRoomTimers(room);
    room.roundNo = 1;
    room.gameOver = false;
    fillBots(room);
    addLog(room, '房主发起再来一局，分数已重置。');
    startRound(room, { resetScores: true });
    return;
  }

}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.remoteAddress = requestIp(req);
  ws.authUser = auth.getUserBySession(req);
  ws.messageWindowStartedAt = Date.now();
  ws.messageWindowCount = 0;
  try { req.socket.setNoDelay(true); } catch (error) { /* ignore */ }
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', raw => {
    const now = Date.now();
    if (now - ws.messageWindowStartedAt >= WS_MESSAGE_WINDOW_MS) {
      ws.messageWindowStartedAt = now;
      ws.messageWindowCount = 0;
    }
    ws.messageWindowCount += 1;
    if (ws.messageWindowCount > WS_MESSAGE_LIMIT) {
      try { ws.close(1008, 'message rate limit'); } catch (error) { /* ignore */ }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (error) {
      return sendError(ws, '消息格式错误');
    }

    try {
      handleMessage(ws, msg);
    } catch (error) {
      console.error(error);
      sendError(ws, '服务端处理失败：' + error.message);
    }
  });

  ws.on('close', () => {
    if (ws.pendingBotTakeover?.roomId) {
      const pendingRoom = rooms.get(ws.pendingBotTakeover.roomId);
      if (pendingRoom?.botTakeoverRequests?.length) {
        pendingRoom.botTakeoverRequests = pendingRoom.botTakeoverRequests.filter(request => request.ws !== ws);
        broadcast(pendingRoom);
      }
    }
    const room = getRoomForSocket(ws);
    if (!room) return;
    const player = room.players[ws.playerIndex];
    if (player && player.ws === ws) {
      const closedAt = Date.now();
      player.ws = null;
      player.disconnectGraceStartedAt = closedAt;
      if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
      player.disconnectGraceTimer = setTimeout(() => {
        if (!rooms.has(room.id)) return;
        if (!player || player.isBot || player.leftRoom || player.ws) return;
        player.connected = false;
        player.disconnectedAt = closedAt;
        player.disconnectGraceTimer = null;
        player.disconnectGraceStartedAt = null;
        refreshRoomEmptySince(room);
        const expireText = connectedHumanCount(room) === 0 ? `如果 ${Math.ceil(ROOM_EMPTY_TTL_MS / 60000)} 分钟内无人重连，房间将自动解散。` : '';
        addLog(room, `${player.name} 与服务器断开超过 ${Math.ceil(DISCONNECT_GRACE_MS / 1000)} 秒，已标记离线。${expireText}`);
        broadcast(room);
      }, DISCONNECT_GRACE_MS);
    }
  });
});

const wsHeartbeatTimer = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (error) { /* ignore */ }
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (error) { /* ignore */ }
  });
}, WS_HEARTBEAT_MS);
wsHeartbeatTimer.unref();

const takeoverSweepTimer = setInterval(sweepAutoTakeovers, OFFLINE_TAKEOVER_SWEEP_MS);
takeoverSweepTimer.unref();
const roomSweepTimer = setInterval(sweepExpiredRooms, ROOM_SWEEP_INTERVAL_MS);
roomSweepTimer.unref();

if (adminStore) {
  const adminRooms = createLiveRoomAdminRepository({ rooms, closeRoom });
  const adminApplication = createAdminApplication({
    users: userAdminRepository,
    rooms: adminRooms,
    adminStore,
    aiLearning
  });
  adminHttp = createAdminHttp({
    application: adminApplication,
    adminStore,
    readJsonBody: auth.readJsonBody,
    requestIp,
    requestProtocol,
    configured: adminBootstrap.configured
  });
}

server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65 * 1000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || server.keepAliveTimeout + 5000);

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭红心大战服务。`);
  clearInterval(wsHeartbeatTimer);
  clearInterval(takeoverSweepTimer);
  clearInterval(roomSweepTimer);
  for (const ws of wss.clients) {
    try { ws.close(1001, 'server shutdown'); } catch (error) { /* ignore */ }
  }
  aiLearning.flush();
  server.close(() => {
    try { sqlite?.close(); } catch (error) { console.error('关闭 SQLite 失败', error); }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`红心大战联机服务 v${APP_VERSION} 已启动：http://${HOST}:${PORT}`);
  console.log(`反向代理模式：trustProxy=${TRUST_PROXY}，WebSocket 路径=${Array.from(WS_PATHS).join(',')}`);
  console.log(`数据后端：${DATA_BACKEND}${sqlite ? ` (${sqlite.databaseFile})` : ''}；管理 API：${adminBootstrap.configured ? '已启用' : '未配置管理员'}`);
  if (adminBootstrap.created) console.log(`已创建管理员账号：${adminBootstrap.admin.username} (${adminBootstrap.admin.role})`);
  console.log(`房间号规则：4 位纯数字；断线超过 ${Math.ceil(DISCONNECT_GRACE_MS / 1000)} 秒判定离线；离线 ${Math.ceil(OFFLINE_TAKEOVER_MS / 60000)} 分钟 AI 自动托管；空房间 ${Math.ceil(ROOM_EMPTY_TTL_MS / 60000)} 分钟自动解散；无活动 ${Math.ceil(ROOM_IDLE_TTL_MS / 60000)} 分钟自动解散。`);
  if (typeof process.send === 'function') process.send('ready');
});
