import {
  applyServerState,
  markLeftRoom,
  markRoomClosed,
  markRoomCreated,
  setSocketError
} from '../stores/gameState';

export function createGameSocket(state) {
  let socket = null;
  let reconnectTimer = null;
  let manuallyClosed = false;

  function socketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  function scheduleReconnect() {
    if (manuallyClosed) return;
    window.clearTimeout(reconnectTimer);
    state.reconnectAttempts += 1;
    state.reconnecting = true;
    const baseDelay = Math.min(15000, 1000 * (2 ** Math.min(4, state.reconnectAttempts - 1)));
    const jitter = Math.floor(Math.random() * 500);
    reconnectTimer = window.setTimeout(connect, baseDelay + jitter);
  }

  function send(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setSocketError(state, '尚未连接到游戏服务器。');
      return false;
    }
    socket.send(JSON.stringify({
      ...data,
      clientId: state.clientId,
      guestId: state.guestId,
      reconnectToken: state.reconnectToken || '',
      nickname: state.nickname
    }));
    return true;
  }

  function handleMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (msg.type === 'state') {
      applyServerState(state, msg);
      return;
    }
    if (msg.type === 'roomCreated') {
      markRoomCreated(state, msg.roomId);
      return;
    }
    if (msg.type === 'roomClosed') {
      markRoomClosed(state, msg.message);
      return;
    }
    if (msg.type === 'leftRoom') {
      markLeftRoom(state, msg.message);
      return;
    }
    if (msg.type === 'botTakeoverPending') {
      state.notice = msg.message || 'AI 座位接管申请已发送。';
      return;
    }
    if (msg.type === 'botTakeoverApproved') {
      state.notice = msg.message || 'AI 座位接管申请已通过。';
      if (msg.reconnectToken) state.reconnectToken = msg.reconnectToken;
      if (msg.roomId) state.roomId = msg.roomId;
      return;
    }
    if (msg.type === 'botTakeoverRejected') {
      setSocketError(state, msg.message || 'AI 座位接管申请未通过。');
      return;
    }
    if (msg.type === 'error') {
      if (state.roomId && /房间不存在|已超时解散|房间身份已失效/.test(String(msg.message || ''))) {
        markRoomClosed(state, '本地房间已失效，已刷新房间缓存。');
        return;
      }
      setSocketError(state, msg.message || '游戏服务器返回错误。');
    }
  }

  function connect() {
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return socket;
    manuallyClosed = false;
    state.connecting = true;
    socket = new WebSocket(socketUrl());

    socket.addEventListener('open', () => {
      state.connected = true;
      state.connecting = false;
      state.reconnecting = false;
      state.reconnectAttempts = 0;
      state.lastError = '';
      send({ type: 'hello', roomId: state.roomId });
    });

    socket.addEventListener('message', handleMessage);

    socket.addEventListener('close', () => {
      state.connected = false;
      state.connecting = false;
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      state.connected = false;
      state.connecting = false;
      setSocketError(state, '联机服务连接失败。');
    });

    return socket;
  }

  function reconnect() {
    manuallyClosed = false;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'reconnect requested');
      return;
    }
    connect();
  }

  function close() {
    manuallyClosed = true;
    window.clearTimeout(reconnectTimer);
    if (socket) socket.close(1000, 'client closed');
  }

  return {
    close,
    connect,
    reconnect,
    send,
    createRoom: () => send({ type: 'createRoom' }),
    joinRoom: roomId => send({ type: 'joinRoom', roomId }),
    startGame: () => send({ type: 'startGame' }),
    fillBotsAndStart: () => send({ type: 'fillBotsAndStart' }),
    leaveRoom: () => send({ type: 'leaveRoom' }),
    disbandRoom: () => send({ type: 'disbandRoom' }),
    passCards: cards => send({ type: 'passCards', cards }),
    playCard: cardId => send({ type: 'playCard', cardId }),
    sweepCards: () => send({ type: 'sweepCards' }),
    startNextRound: () => send({ type: 'startNextRound' }),
    restartGame: () => send({ type: 'restartGame' }),
    takeoverOffline: () => send({ type: 'takeoverOffline' }),
    approveBotTakeover: (requestId, approved = true) => send({
      type: 'approveBotTakeover',
      requestId,
      approved
    }),
    sendInteraction: interaction => send({
      type: 'interaction',
      interaction
    })
  };
}
