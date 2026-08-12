'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const { createGame, dealRound, submitDeclaration, playCard } = require('./src/server/games/gongzhu/engine');
const { legalCards } = require('./src/server/games/gongzhu/rules');
const { version: APP_VERSION } = require('./package.json');

const PORT = Number(process.env.PORT || 3010);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const ALLOWED_HOSTS = String(process.env.ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim().toLowerCase().replace(/\/$/, '')).filter(Boolean);
const WS_PATHS = new Set(String(process.env.WS_PATHS || '/ws').split(',').map(value => value.trim()).filter(Boolean));
const DECLARATION_MS = Number(process.env.DECLARATION_MS || 20_000);
const rooms = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png'
};

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function requestHost(req) {
  return firstHeader(req.headers['x-forwarded-host'] || req.headers.host).toLowerCase().replace(/:\d+$/, '');
}

function requestOrigin(req) {
  return String(req.headers.origin || '').trim().toLowerCase().replace(/\/$/, '');
}

function allowedHost(req) {
  return !ALLOWED_HOSTS.length || ALLOWED_HOSTS.includes(requestHost(req));
}

function allowedSocket(req) {
  let pathname = '';
  try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch (error) { return false; }
  return allowedHost(req) && WS_PATHS.has(pathname) && (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(requestOrigin(req)));
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (!allowedHost(req)) return sendJson(res, 421, { ok: false, message: 'Misdirected Request' });
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  if (['/healthz', '/readyz'].includes(requestUrl.pathname)) {
    return sendJson(res, 200, { ok: true, service: 'gongzhu-by-duanap', version: APP_VERSION, rooms: rooms.size });
  }
  if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, { ok: false, message: 'Method Not Allowed' });
  let pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  let filePath;
  try { filePath = path.resolve(PUBLIC_DIR, `.${decodeURIComponent(pathname)}`); } catch (error) { return sendJson(res, 400, { ok: false }); }
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return sendJson(res, 403, { ok: false });
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { ok: false, message: 'Not Found' });
    const headers = {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': pathname === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Content-Length': stat.size
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

const wss = new WebSocket.Server({ server, maxPayload: 64 * 1024, verifyClient: (info, done) => allowedSocket(info.req) ? done(true) : done(false, 403, 'Forbidden') });

function send(ws, data) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function error(ws, message) {
  send(ws, { type: 'error', message });
}

function makeDeck() {
  const deck = [];
  for (const suit of ['C', 'D', 'S', 'H']) for (let rank = 2; rank <= 14; rank += 1) deck.push({ id: `${suit}${rank}`, suit, rank });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function roomId() {
  for (let tries = 0; tries < 1000; tries += 1) {
    const id = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(id)) return id;
  }
  throw new Error('暂时无法创建房间');
}

function playerRecord({ id, name, ws = null, isBot = false }) {
  return { id, name: String(name || '').trim().slice(0, 20) || '玩家', ws, isBot, connected: Boolean(ws) || isBot, hand: [], taken: [], round: 0, total: 0, scoreBreakdown: null };
}

function publicState(room, viewer) {
  const game = room.game;
  const self = game.players[viewer];
  return {
    type: 'state',
    ruleSet: game.ruleSet,
    roomId: room.id,
    yourIndex: viewer,
    reconnectToken: self?.reconnectToken || '',
    isHost: viewer === room.hostIndex,
    phase: game.phase,
    roundNo: game.roundNo,
    trickNo: game.trickNo,
    trick: game.trick,
    ledSuits: game.ledSuits,
    currentPlayer: game.currentPlayer,
    legalCardIds: game.phase === 'play' && viewer === game.currentPlayer
      ? legalCards({ hand: self.hand, trick: game.trick, trickNo: game.trickNo, ledSuits: game.ledSuits, declarations: game.declarations.map(item => item.cardId), forceClubTwo: game.roundNo === 1 }).map(card => card.id)
      : [],
    declarationDeadline: game.phase === 'declare' ? game.declarationDeadline : 0,
    declarationSubmitted: game.declarationChoices.map(choice => Array.isArray(choice)),
    declarations: game.phase === 'declare' ? [] : game.declarations,
    previousPigTaker: game.previousPigTaker,
    overtime: game.overtime,
    gameOver: game.gameOver,
    winnerIndexes: game.winnerIndexes,
    pigIndexes: game.pigIndexes,
    lastTrick: game.lastTrick,
    players: game.players.map((player, index) => ({
      id: `seat-${index}`,
      name: player.name,
      isBot: player.isBot,
      connected: player.connected,
      hand: index === viewer ? player.hand : [],
      handCount: player.hand.length,
      round: player.round,
      total: player.total,
      scoreBreakdown: ['roundEnd', 'gameEnd'].includes(game.phase) ? player.scoreBreakdown : null
    })),
    log: room.log.slice(-80)
  };
}

function broadcast(room) {
  room.game.players.forEach((player, index) => {
    if (!player.isBot) send(player.ws, publicState(room, index));
  });
}

function log(room, text) {
  room.log.push({ id: `${Date.now()}-${room.log.length}`, text, at: Date.now() });
}

function clearDeclarationTimer(room) {
  if (room.declarationTimer) clearTimeout(room.declarationTimer);
  room.declarationTimer = null;
}

function startDeclarationTimer(room) {
  clearDeclarationTimer(room);
  room.game.declarationDeadline = Date.now() + DECLARATION_MS;
  room.declarationTimer = setTimeout(() => {
    if (room.game.phase !== 'declare') return;
    room.game.declarationChoices.forEach((choice, index) => {
      if (choice === null) submitDeclaration(room.game, index, []);
    });
    log(room, '亮牌倒计时结束，未提交的玩家自动选择不亮。');
    broadcast(room);
    scheduleBots(room);
  }, DECLARATION_MS);
}

function startRound(room) {
  dealRound(room.game, makeDeck());
  room.game.players.forEach((player, index) => {
    if (player.isBot) {
      const own = player.hand.filter(card => ['S12', 'D11', 'H14', 'C10'].includes(card.id));
      const choice = own.filter(card => card.id === 'D11' || card.id === 'C10').map(card => card.id);
      submitDeclaration(room.game, index, choice);
    }
  });
  log(room, `第 ${room.game.roundNo} 副发牌完成，进入亮牌阶段。`);
  broadcast(room);
  if (room.game.phase === 'declare') startDeclarationTimer(room);
  else scheduleBots(room);
}

function botCard(game, index) {
  const player = game.players[index];
  const legal = legalCards({ hand: player.hand, trick: game.trick, trickNo: game.trickNo, ledSuits: game.ledSuits, declarations: game.declarations.map(item => item.cardId), forceClubTwo: game.roundNo === 1 });
  if (!game.trick.length) return [...legal].sort((a, b) => a.rank - b.rank)[0];
  const leadSuit = game.trick[0].card.suit;
  const currentRank = Math.max(...game.trick.filter(item => item.card.suit === leadSuit).map(item => item.card.rank));
  const under = legal.filter(card => card.suit === leadSuit && card.rank < currentRank).sort((a, b) => b.rank - a.rank);
  if (under.length) return under[0];
  const scoring = legal.filter(card => ['S12', 'D11', 'C10'].includes(card.id) || card.suit === 'H').sort((a, b) => a.rank - b.rank);
  return scoring[0] || [...legal].sort((a, b) => a.rank - b.rank)[0];
}

function scheduleBots(room) {
  if (room.botTimer) return;
  const tick = () => {
    room.botTimer = null;
    if (room.game.phase !== 'play') return;
    const current = room.game.players[room.game.currentPlayer];
    if (!current?.isBot && current?.connected) return;
    const chosen = botCard(room.game, room.game.currentPlayer);
    if (!chosen) return;
    playCard(room.game, room.game.currentPlayer, chosen.id);
    broadcast(room);
    room.botTimer = setTimeout(tick, 260);
  };
  room.botTimer = setTimeout(tick, 260);
}

function attach(ws, room, index) {
  const player = room.game.players[index];
  player.ws = ws;
  player.connected = true;
  ws.roomId = room.id;
  ws.playerIndex = index;
}

function findSeat(room, clientId, reconnectToken) {
  return room.game.players.findIndex(player => !player.isBot && (
    (reconnectToken && player.reconnectToken === reconnectToken) || (clientId && player.clientId === clientId)
  ));
}

function handle(ws, msg) {
  if (msg.type === 'hello') {
    ws.clientId = String(msg.clientId || '');
    const room = rooms.get(String(msg.roomId || ''));
    const index = room ? findSeat(room, ws.clientId, String(msg.reconnectToken || '')) : -1;
    if (index >= 0) { attach(ws, room, index); log(room, `${room.game.players[index].name} 已重连。`); broadcast(room); }
    return;
  }
  if (msg.type === 'createRoom') {
    const id = roomId();
    const clientId = String(msg.clientId || ws.clientId || crypto.randomUUID());
    const host = playerRecord({ id: clientId, name: msg.nickname || '房主', ws });
    host.clientId = clientId;
    host.reconnectToken = crypto.randomBytes(18).toString('base64url');
    const game = createGame([host]);
    Object.assign(game.players[0], host);
    const room = { id, hostIndex: 0, game, log: [], declarationTimer: null, botTimer: null };
    rooms.set(id, room);
    attach(ws, room, 0);
    log(room, `${host.name} 创建了房间。`);
    send(ws, { type: 'roomCreated', roomId: id });
    broadcast(room);
    return;
  }
  if (msg.type === 'joinRoom') {
    const room = rooms.get(String(msg.roomId || '').trim());
    if (!room) return error(ws, '房间不存在');
    const clientId = String(msg.clientId || ws.clientId || crypto.randomUUID());
    const resumed = findSeat(room, clientId, String(msg.reconnectToken || ''));
    if (resumed >= 0) { attach(ws, room, resumed); broadcast(room); return; }
    if (room.game.phase !== 'lobby' || room.game.players.length >= 4) return error(ws, '房间已满或牌局已经开始');
    const player = playerRecord({ id: clientId, name: msg.nickname, ws });
    player.clientId = clientId;
    player.reconnectToken = crypto.randomBytes(18).toString('base64url');
    room.game.players.push(player);
    attach(ws, room, room.game.players.length - 1);
    log(room, `${player.name} 加入了房间。`);
    if (room.game.players.length === 4) startRound(room); else broadcast(room);
    return;
  }
  const room = rooms.get(ws.roomId);
  if (!room) return error(ws, '请先创建或加入房间');
  if (msg.type === 'fillBotsAndStart' || msg.type === 'startGame') {
    if (ws.playerIndex !== room.hostIndex) return error(ws, '只有房主可以开始游戏');
    if (room.game.phase !== 'lobby') return error(ws, '牌局已经开始');
    if (msg.type === 'startGame' && room.game.players.length !== 4) return error(ws, '需要 4 名玩家');
    while (room.game.players.length < 4) room.game.players.push(playerRecord({ id: `bot-${crypto.randomUUID()}`, name: `AI ${room.game.players.length + 1}`, isBot: true }));
    startRound(room);
    return;
  }
  if (msg.type === 'declareCards') {
    const declarationError = submitDeclaration(room.game, ws.playerIndex, msg.cardIds || []);
    if (declarationError) return error(ws, declarationError);
    if (room.game.phase !== 'declare') clearDeclarationTimer(room);
    broadcast(room);
    scheduleBots(room);
    return;
  }
  if (msg.type === 'playCard') {
    const playError = playCard(room.game, ws.playerIndex, String(msg.cardId || ''));
    if (playError) return error(ws, playError);
    broadcast(room);
    scheduleBots(room);
    return;
  }
  if (msg.type === 'startNextRound') {
    if (room.game.phase !== 'roundEnd') return error(ws, '现在不能开始下一副');
    if (ws.playerIndex !== room.hostIndex) return error(ws, '只有房主可以开始下一副');
    startRound(room);
    return;
  }
  if (msg.type === 'restartGame') {
    if (room.game.phase !== 'gameEnd' || ws.playerIndex !== room.hostIndex) return error(ws, '现在不能重新开始');
    room.game.players.forEach(player => { player.total = 0; });
    room.game.roundNo = 0;
    room.game.overtime = false;
    room.game.previousPigTaker = null;
    startRound(room);
    return;
  }
  if (msg.type === 'leaveRoom') {
    const player = room.game.players[ws.playerIndex];
    player.connected = false;
    player.ws = null;
    send(ws, { type: 'leftRoom' });
    broadcast(room);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    try { handle(ws, JSON.parse(raw)); } catch (caught) { console.error(caught); error(ws, '服务端处理失败'); }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.roomId);
    const player = room?.game.players[ws.playerIndex];
    if (player?.ws === ws) { player.connected = false; player.ws = null; broadcast(room); scheduleBots(room); }
  });
});

const heartbeat = setInterval(() => wss.clients.forEach(ws => {
  if (!ws.isAlive) return ws.terminate();
  ws.isAlive = false;
  ws.ping();
}), 10_000);
heartbeat.unref();

server.listen(PORT, HOST, () => console.log(`Gongzhu listening on http://${HOST}:${PORT}`));

module.exports = { rooms, server };
