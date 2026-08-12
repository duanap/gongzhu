import { reactive } from 'vue';
import { ensureGuestId } from '../services/identity';
import { createRoomSessionState, resetRoomSession } from './roomState.mjs';

const CLIENT_ID_KEY = 'hearts-by-duanap-client-id';
const GUEST_ID_KEY = 'hearts-by-duanap-guest-id';
const ROOM_ID_KEY = 'hearts-by-duanap-room-id';
const RECONNECT_TOKEN_KEY = 'hearts-by-duanap-reconnect-token';
const NICKNAME_KEY = 'hearts-by-duanap-nickname';
const LEGACY_STORAGE_KEYS = {
  [CLIENT_ID_KEY]: 'hearts-online-client-id',
  [GUEST_ID_KEY]: 'hearts-online-guest-id',
  [ROOM_ID_KEY]: 'hearts-online-room-id',
  [RECONNECT_TOKEN_KEY]: 'hearts-online-reconnect-token',
  [NICKNAME_KEY]: 'hearts-online-nickname'
};

const fallbackNames = ['甘夫人', '赵子龙', '孙尚香', '周公瑾', '小乔', '司马懿', '曹孟德', '刘玄德'];

function randomId(prefix) {
  const value = crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `${prefix}-${value}`;
}

function getStoredValue(key) {
  const value = localStorage.getItem(key);
  if (value) return value;
  const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEYS[key]);
  if (legacyValue) localStorage.setItem(key, legacyValue);
  return legacyValue || '';
}

function removeStoredValue(key) {
  localStorage.removeItem(key);
  if (LEGACY_STORAGE_KEYS[key]) localStorage.removeItem(LEGACY_STORAGE_KEYS[key]);
}

export function clearClientCache({ reload = true } = {}) {
  [
    CLIENT_ID_KEY,
    GUEST_ID_KEY,
    ROOM_ID_KEY,
    RECONNECT_TOKEN_KEY,
    NICKNAME_KEY
  ].forEach(removeStoredValue);
  [
    'hearts-vue-settings',
    'hearts-online-force-landscape',
    'hearts-online-landscape-prompt'
  ].forEach(key => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  if (reload) window.location.reload();
}

export function ensureClientId() {
  let clientId = getStoredValue(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = randomId('client');
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

function defaultNickname() {
  const stored = getStoredValue(NICKNAME_KEY).trim();
  if (stored) return stored;
  const next = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
  localStorage.setItem(NICKNAME_KEY, next);
  return next;
}

function placeholderPlayers() {
  return [0, 1, 2, 3].map(index => ({
    id: '',
    userId: '',
    name: index === 0 ? '你' : '等待中',
    avatar: '',
    isBot: false,
    authenticated: false,
    connected: false,
    leftRoom: false,
    round: 0,
    total: 0,
    handCount: 0,
    passed: false
  }));
}

function viewIndexFor(absIndex, yourIndex) {
  if (!Number.isInteger(absIndex)) return absIndex;
  return (absIndex - yourIndex + 4) % 4;
}

function nullableViewIndex(value, yourIndex) {
  if (value == null) return value;
  const number = Number(value);
  return Number.isInteger(number) ? viewIndexFor(number, yourIndex) : value;
}

function buildViewPlayers(players, yourIndex) {
  return [0, 1, 2, 3].map(viewIndex => players[(yourIndex + viewIndex) % 4] || placeholderPlayers()[viewIndex]);
}

function buildViewTrick(trick, yourIndex) {
  return (Array.isArray(trick) ? trick : []).map(play => ({
    ...play,
    player: nullableViewIndex(play.player, yourIndex),
    absPlayer: Number(play.player)
  }));
}

function buildViewLastTrick(lastTrick, yourIndex) {
  if (!lastTrick) return null;
  return {
    ...lastTrick,
    leaderPlayer: nullableViewIndex(lastTrick.leaderPlayer, yourIndex),
    winnerPlayer: nullableViewIndex(lastTrick.winnerPlayer, yourIndex),
    cards: buildViewTrick(lastTrick.cards || [], yourIndex)
  };
}

function buildViewRoundTable(roundTable, yourIndex) {
  if (!roundTable?.players) return null;
  return {
    ...roundTable,
    players: buildViewPlayers(roundTable.players, yourIndex)
  };
}

function buildViewSpecialEvents(events, yourIndex) {
  return (Array.isArray(events) ? events : []).map(event => ({
    ...event,
    playerIndex: nullableViewIndex(event.playerIndex, yourIndex),
    absPlayerIndex: event.playerIndex
  }));
}

function buildViewInteractions(interactions, yourIndex) {
  return (Array.isArray(interactions) ? interactions : []).map(item => ({
    ...item,
    fromIndex: nullableViewIndex(item.fromIndex, yourIndex),
    toIndex: nullableViewIndex(item.toIndex, yourIndex),
    absFromIndex: item.fromIndex,
    absToIndex: item.toIndex
  }));
}

function buildViewPassFlow(passFlow, yourIndex) {
  if (!passFlow) return null;
  return {
    ...passFlow,
    flows: (Array.isArray(passFlow.flows) ? passFlow.flows : []).map(item => ({
      ...item,
      from: nullableViewIndex(item.from, yourIndex),
      to: nullableViewIndex(item.to, yourIndex),
      absFrom: item.from,
      absTo: item.to
    }))
  };
}

export function viewToAbsIndex(state, viewIndex) {
  const number = Number(viewIndex);
  if (!Number.isInteger(number)) return state.yourIndex || 0;
  return ((state.yourIndex || 0) + number + 4) % 4;
}

export function createGameState() {
  return reactive({
    clientId: ensureClientId(),
    guestId: ensureGuestId(),
    nickname: defaultNickname(),
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempts: 0,
    lastError: '',
    ...createRoomSessionState(placeholderPlayers),
    roomId: getStoredValue(ROOM_ID_KEY),
    reconnectToken: getStoredValue(RECONNECT_TOKEN_KEY)
  });
}

export function setNickname(state, nickname) {
  const next = String(nickname || '').trim().slice(0, 20) || defaultNickname();
  state.nickname = next;
  localStorage.setItem(NICKNAME_KEY, next);
}

export function applyServerState(state, msg) {
  state.connected = true;
  state.connecting = false;
  state.reconnecting = false;
  state.lastError = '';
  state.notice = '';
  state.roomId = msg.roomId || state.roomId;
  state.reconnectToken = msg.reconnectToken || state.reconnectToken;
  state.phase = msg.phase || 'offline';
  state.yourIndex = Number.isInteger(msg.yourIndex) ? msg.yourIndex : 0;
  state.isHost = Boolean(msg.isHost);
  state.hostId = msg.hostId || '';
  state.roundNo = Number(msg.roundNo || 1);
  state.passMode = Number(msg.passMode || 0);
  state.passName = msg.passName || '';
  state.players = Array.isArray(msg.players) ? msg.players : placeholderPlayers();
  state.viewPlayers = buildViewPlayers(state.players, state.yourIndex);
  const ownPlayer = state.players[state.yourIndex] || {};
  state.hand = Array.isArray(ownPlayer.hand) ? ownPlayer.hand : [];
  state.legalCardIds = Array.isArray(msg.legalCardIds) ? msg.legalCardIds : [];
  state.trick = Array.isArray(msg.trick) ? msg.trick : [];
  state.trickView = buildViewTrick(state.trick, state.yourIndex);
  state.lastTrick = msg.lastTrick || null;
  state.lastTrickView = buildViewLastTrick(state.lastTrick, state.yourIndex);
  state.trickNo = Number(msg.trickNo || 0);
  state.currentPlayer = Number.isInteger(msg.currentPlayer) ? msg.currentPlayer : 0;
  state.currentViewPlayer = viewIndexFor(state.currentPlayer, state.yourIndex);
  state.busy = Boolean(msg.busy);
  state.comparingTrick = Boolean(msg.comparingTrick);
  state.collectingTrick = Boolean(msg.collectingTrick);
  state.trickWinnerPlayer = Number.isInteger(msg.trickWinnerPlayer) ? msg.trickWinnerPlayer : null;
  state.trickWinnerView = nullableViewIndex(state.trickWinnerPlayer, state.yourIndex);
  state.judgeText = msg.judgeText || '';
  state.sweepCollect = msg.sweepCollect
    ? {
        ...msg.sweepCollect,
        winnerViewPlayer: nullableViewIndex(msg.sweepCollect.winnerPlayer, state.yourIndex)
      }
    : null;
  state.heartsBroken = Boolean(msg.heartsBroken);
  state.gameOver = Boolean(msg.gameOver);
  state.moonShooter = msg.moonShooter;
  state.moonShooterView = nullableViewIndex(msg.moonShooter, state.yourIndex);
  state.sweepOffer = msg.sweepOffer || null;
  state.youPassed = Boolean(state.players[state.yourIndex]?.passed);
  state.receivedCards = Array.isArray(msg.receivedCards) ? msg.receivedCards : [];
  state.receivedFrom = msg.receivedFrom || '';
  state.passFlow = msg.passFlow || null;
  state.passFlowView = buildViewPassFlow(state.passFlow, state.yourIndex);
  state.roundTable = msg.roundTable || null;
  state.roundTableView = buildViewRoundTable(state.roundTable, state.yourIndex);
  state.specialEvents = Array.isArray(msg.specialEvents) ? msg.specialEvents : [];
  state.specialEventsView = buildViewSpecialEvents(state.specialEvents, state.yourIndex);
  state.interactions = Array.isArray(msg.interactions) ? msg.interactions : [];
  state.interactionsView = buildViewInteractions(state.interactions, state.yourIndex);
  state.log = Array.isArray(msg.log) ? msg.log : [];
  state.botTakeoverRequests = Array.isArray(msg.botTakeoverRequests) ? msg.botTakeoverRequests : [];
  state.aiLearningSummary = msg.aiLearningSummary || null;

  if (state.roomId) localStorage.setItem(ROOM_ID_KEY, state.roomId);
  if (state.reconnectToken) localStorage.setItem(RECONNECT_TOKEN_KEY, state.reconnectToken);
}

export function markRoomCreated(state, roomId) {
  state.roomId = roomId || state.roomId;
  state.phase = 'lobby';
  state.connected = true;
  state.connecting = false;
  state.reconnecting = false;
  state.lastError = '';
  state.notice = state.roomId ? `房间 ${state.roomId} 已创建。` : '房间已创建。';
  if (state.roomId) localStorage.setItem(ROOM_ID_KEY, state.roomId);
}

export function markRoomClosed(state, message = '') {
  resetRoomSession(state, placeholderPlayers, message || '房间已关闭。');
  removeStoredValue(ROOM_ID_KEY);
  removeStoredValue(RECONNECT_TOKEN_KEY);
}

export function markLeftRoom(state, message = '') {
  resetRoomSession(state, placeholderPlayers, message || '已退出房间。');
  removeStoredValue(ROOM_ID_KEY);
  removeStoredValue(RECONNECT_TOKEN_KEY);
}

export function setSocketError(state, message) {
  state.lastError = message || '连接异常。';
  state.notice = state.lastError;
}
