import { reactive } from 'vue';

const KEYS = {
  clientId: 'gongzhu-by-duanap-client-id',
  roomId: 'gongzhu-by-duanap-room-id',
  reconnectToken: 'gongzhu-by-duanap-reconnect-token',
  nickname: 'gongzhu-by-duanap-nickname'
};

function stored(key) {
  return localStorage.getItem(KEYS[key]) || '';
}

function randomId() {
  return `client-${crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
}

export function createGameState() {
  const clientId = stored('clientId') || randomId();
  localStorage.setItem(KEYS.clientId, clientId);
  return reactive({
    clientId,
    nickname: stored('nickname') || '牌友',
    roomId: stored('roomId'),
    reconnectToken: stored('reconnectToken'),
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempts: 0,
    lastError: '',
    notice: '',
    ruleSet: 'gongzhu-v1',
    phase: 'offline',
    roundNo: 0,
    trickNo: 0,
    trick: [],
    ledSuits: [],
    players: [],
    hand: [],
    legalCardIds: [],
    declarations: [],
    declarationSubmitted: [],
    declarationDeadline: 0,
    currentPlayer: 0,
    yourIndex: 0,
    isHost: false,
    previousPigTaker: null,
    overtime: false,
    gameOver: false,
    winnerIndexes: [],
    pigIndexes: [],
    lastTrick: null,
    log: []
  });
}

export function setNickname(state, nickname) {
  state.nickname = String(nickname || '').trim().slice(0, 20) || '牌友';
  localStorage.setItem(KEYS.nickname, state.nickname);
}

export function applyServerState(state, message) {
  Object.assign(state, message, {
    connected: true,
    connecting: false,
    reconnecting: false,
    lastError: '',
    players: Array.isArray(message.players) ? message.players : [],
    hand: message.players?.[message.yourIndex]?.hand || [],
    legalCardIds: Array.isArray(message.legalCardIds) ? message.legalCardIds : [],
    declarations: Array.isArray(message.declarations) ? message.declarations : [],
    declarationSubmitted: Array.isArray(message.declarationSubmitted) ? message.declarationSubmitted : [],
    log: Array.isArray(message.log) ? message.log : []
  });
  if (state.roomId) localStorage.setItem(KEYS.roomId, state.roomId);
  if (state.reconnectToken) localStorage.setItem(KEYS.reconnectToken, state.reconnectToken);
}

export function markRoomCreated(state, roomId) {
  state.roomId = roomId;
  state.phase = 'lobby';
  localStorage.setItem(KEYS.roomId, roomId);
}

export function markLeftRoom(state, message = '已退出房间。') {
  state.roomId = '';
  state.reconnectToken = '';
  state.phase = 'offline';
  state.notice = message;
  localStorage.removeItem(KEYS.roomId);
  localStorage.removeItem(KEYS.reconnectToken);
}

export function markRoomClosed(state, message) {
  markLeftRoom(state, message || '房间已关闭。');
}

export function setSocketError(state, message) {
  state.lastError = message || '连接异常。';
}
