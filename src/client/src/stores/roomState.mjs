export function createRoomSessionState(createPlayers = () => []) {
  return {
    notice: '',
    roomId: '',
    reconnectToken: '',
    phase: 'offline',
    yourIndex: 0,
    isHost: false,
    hostId: '',
    roundNo: 1,
    passMode: 0,
    passName: '',
    players: createPlayers(),
    viewPlayers: createPlayers(),
    legalCardIds: [],
    hand: [],
    trick: [],
    trickView: [],
    lastTrick: null,
    lastTrickView: null,
    trickNo: 0,
    currentPlayer: 0,
    currentViewPlayer: 0,
    busy: false,
    comparingTrick: false,
    collectingTrick: false,
    trickWinnerPlayer: null,
    trickWinnerView: null,
    judgeText: '',
    sweepCollect: null,
    heartsBroken: false,
    gameOver: false,
    moonShooter: null,
    moonShooterView: null,
    sweepOffer: null,
    youPassed: false,
    receivedCards: [],
    receivedFrom: '',
    passFlow: null,
    passFlowView: null,
    roundTable: null,
    roundTableView: null,
    specialEvents: [],
    specialEventsView: [],
    interactions: [],
    interactionsView: [],
    log: [],
    botTakeoverRequests: [],
    aiLearningSummary: null
  };
}

export function resetRoomSession(state, createPlayers, notice) {
  Object.assign(state, createRoomSessionState(createPlayers));
  state.notice = notice || '已退出房间。';
  return state;
}
