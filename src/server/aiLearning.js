const path = require('path');
const { readJsonFile, writeJsonAtomic } = require('./jsonPersistence');

const STATE_FILE = process.env.AI_LEARNING_STATE_FILE || path.join(__dirname, '..', '..', 'data', 'ai-learning-state.json');
const MIN_SAMPLES_TO_TUNE = Number(process.env.AI_LEARNING_MIN_SAMPLES || 24);
const SAVE_INTERVAL_MS = Number(process.env.AI_LEARNING_SAVE_INTERVAL_MS || 5000);

const DEFAULT_WEIGHTS = {
  queenDanger: 1,
  heartDanger: 1,
  highRankDanger: 1,
  moonAggression: 1,
  moonDefense: 1,
  voidSuitPass: 1
};

const state = {
  version: 1,
  samplesSinceTune: 0,
  totalSamples: 0,
  weights: { ...DEFAULT_WEIGHTS },
  events: [],
  opponents: {}
};

let saveTimer = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function cloneCard(card) {
  if (!card) return null;
  return { suit: card.suit, rank: Number(card.rank || 0), id: card.id };
}

function compactPlayer(player) {
  if (!player) return { name: '玩家', isBot: false };
  return {
    name: player.name || '玩家',
    isBot: Boolean(player.isBot),
    aiControlled: Boolean(player.isBot && player.takeoverFromName)
  };
}

function opponentFor(name) {
  const key = String(name || '玩家').slice(0, 32);
  if (!state.opponents[key]) {
    state.opponents[key] = {
      passSamples: 0,
      trickSamples: 0,
      roundSamples: 0,
      passedPoints: 0,
      takenPoints: 0,
      shootMoonAttempts: 0,
      shootMoonSuccess: 0,
      voidSuits: {}
    };
  }
  return state.opponents[key];
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, SAVE_INTERVAL_MS);
  saveTimer.unref?.();
}

function serializedState() {
  return {
    version: state.version,
    samplesSinceTune: state.samplesSinceTune,
    totalSamples: state.totalSamples,
    weights: state.weights,
    events: state.events.slice(-500),
    opponents: state.opponents
  };
}

function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    writeJsonAtomic(STATE_FILE, serializedState());
    return true;
  } catch (error) {
    console.warn('AI learning save failed:', error.message);
    return false;
  }
}

function load() {
  const saved = readJsonFile(STATE_FILE, { fallback: null, label: 'AI learning state' });
  if (!saved) return;
  state.samplesSinceTune = Number(saved.samplesSinceTune || 0);
  state.totalSamples = Number(saved.totalSamples || 0);
  state.weights = { ...DEFAULT_WEIGHTS, ...(saved.weights || {}) };
  state.events = Array.isArray(saved.events) ? saved.events.slice(-500) : [];
  state.opponents = saved.opponents && typeof saved.opponents === 'object' ? saved.opponents : {};
}

function addEvent(type, payload = {}) {
  state.totalSamples += 1;
  state.samplesSinceTune += 1;
  state.events.push({
    type,
    at: Date.now(),
    ...payload
  });
  state.events = state.events.slice(-500);
  maybeTuneWeights();
  scheduleSave();
}

function pointValue(card) {
  if (!card) return 0;
  if (card.suit === 'H') return 1;
  if (card.suit === 'S' && Number(card.rank) === 12) return 13;
  return 0;
}

function recordPass({ room, playerIndex, cards = [], mode = 0, handBefore = [] } = {}) {
  const player = room?.players?.[playerIndex];
  const points = cards.reduce((sum, card) => sum + pointValue(card), 0);
  const suitsBefore = Object.fromEntries(['C', 'D', 'S', 'H'].map(suit => [
    suit,
    handBefore.filter(card => card.suit === suit).length
  ]));
  const voided = ['C', 'D', 'S', 'H'].filter(suit => {
    const before = suitsBefore[suit] || 0;
    const passed = cards.filter(card => card.suit === suit).length;
    return before > 0 && before === passed;
  });
  const opponent = opponentFor(player?.name);
  opponent.passSamples += 1;
  opponent.passedPoints += points;
  for (const suit of voided) opponent.voidSuits[suit] = Number(opponent.voidSuits[suit] || 0) + 1;
  addEvent('pass', {
    roomId: room?.id || '',
    roundNo: room?.roundNo || 0,
    mode,
    player: compactPlayer(player),
    cards: cards.map(cloneCard),
    points,
    voided
  });
}

function recordMoonGuard({ room, senderIndex, threatIndex, mode = 'suspect' } = {}) {
  addEvent(mode === 'block' ? 'moon-block' : 'moon-suspect', {
    roomId: room?.id || '',
    roundNo: room?.roundNo || 0,
    trickNo: room?.trickNo || 0,
    sender: compactPlayer(room?.players?.[senderIndex]),
    threat: compactPlayer(room?.players?.[threatIndex])
  });
}

function recordTrick({ room, winnerPlay, points = 0, cards = [] } = {}) {
  const winner = room?.players?.[winnerPlay?.player];
  const opponent = opponentFor(winner?.name);
  opponent.trickSamples += 1;
  opponent.takenPoints += Number(points || 0);
  addEvent('trick', {
    roomId: room?.id || '',
    roundNo: room?.roundNo || 0,
    trickNo: room?.trickNo || 0,
    winner: compactPlayer(winner),
    points: Number(points || 0),
    cards: cards.map(cloneCard)
  });
}

function recordRoundResult({ room, shooter = -1 } = {}) {
  const players = (room?.players || []).map(player => ({
    ...compactPlayer(player),
    round: Number(player.round || 0),
    total: Number(player.total || 0)
  }));
  players.forEach((player, index) => {
    const opponent = opponentFor(player.name);
    opponent.roundSamples += 1;
    if (player.round >= 20) opponent.shootMoonAttempts += 1;
    if (index === shooter) opponent.shootMoonSuccess += 1;
  });
  addEvent('round-result', {
    roomId: room?.id || '',
    roundNo: room?.roundNo || 0,
    shooter,
    players
  });
}

function maybeTuneWeights() {
  if (state.samplesSinceTune < MIN_SAMPLES_TO_TUNE) return;
  state.samplesSinceTune = 0;

  const recent = state.events.slice(-Math.max(MIN_SAMPLES_TO_TUNE, 80));
  const tricks = recent.filter(event => event.type === 'trick');
  const rounds = recent.filter(event => event.type === 'round-result');
  const moonBlocks = recent.filter(event => event.type === 'moon-block').length;
  const avgTrickPoints = tricks.length
    ? tricks.reduce((sum, event) => sum + Number(event.points || 0), 0) / tricks.length
    : 0;
  const moonSuccessRate = rounds.length
    ? rounds.filter(event => Number(event.shooter) >= 0).length / rounds.length
    : 0;

  state.weights.queenDanger = clamp(state.weights.queenDanger + (avgTrickPoints > 2.2 ? 0.04 : -0.015), 0.75, 1.35);
  state.weights.heartDanger = clamp(state.weights.heartDanger + (avgTrickPoints > 1.7 ? 0.03 : -0.01), 0.75, 1.35);
  state.weights.highRankDanger = clamp(state.weights.highRankDanger + (avgTrickPoints > 2.4 ? 0.025 : -0.01), 0.8, 1.25);
  state.weights.moonAggression = clamp(state.weights.moonAggression + (moonSuccessRate > 0.12 ? -0.05 : 0.025), 0.7, 1.3);
  state.weights.moonDefense = clamp(state.weights.moonDefense + (moonSuccessRate > 0.08 || moonBlocks > 3 ? 0.05 : -0.015), 0.85, 1.45);
  state.weights.voidSuitPass = clamp(state.weights.voidSuitPass + (avgTrickPoints > 2.0 ? 0.025 : -0.005), 0.85, 1.25);
}

function getWeights() {
  return { ...DEFAULT_WEIGHTS, ...state.weights };
}

function getOpponentTendency(name) {
  const item = state.opponents[String(name || '玩家').slice(0, 32)];
  if (!item) return null;
  return { ...item, voidSuits: { ...(item.voidSuits || {}) } };
}

function eventCounts() {
  return state.events.reduce((counts, event) => {
    const type = event?.type || 'unknown';
    counts[type] = Number(counts[type] || 0) + 1;
    return counts;
  }, {});
}

function opponentRows() {
  return Object.entries(state.opponents)
    .map(([name, item]) => {
      const passSamples = Number(item.passSamples || 0);
      const trickSamples = Number(item.trickSamples || 0);
      const roundSamples = Number(item.roundSamples || 0);
      const shootMoonAttempts = Number(item.shootMoonAttempts || 0);
      const shootMoonSuccess = Number(item.shootMoonSuccess || 0);
      const totalSamples = passSamples + trickSamples + roundSamples;
      const voidSuits = item.voidSuits || {};
      const favoriteVoidSuit = Object.entries(voidSuits).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0]?.[0] || '';
      return {
        name,
        totalSamples,
        passSamples,
        trickSamples,
        roundSamples,
        avgPassedPoints: passSamples ? Number(item.passedPoints || 0) / passSamples : 0,
        avgTakenPoints: trickSamples ? Number(item.takenPoints || 0) / trickSamples : 0,
        shootMoonAttempts,
        shootMoonSuccess,
        shootMoonRate: shootMoonAttempts ? shootMoonSuccess / shootMoonAttempts : 0,
        favoriteVoidSuit
      };
    })
    .filter(row => row.totalSamples > 0)
    .sort((a, b) => b.totalSamples - a.totalSamples || b.avgTakenPoints - a.avgTakenPoints)
    .slice(0, 8);
}

function getSummary() {
  return {
    totalSamples: state.totalSamples,
    samplesSinceTune: state.samplesSinceTune,
    minSamplesToTune: MIN_SAMPLES_TO_TUNE,
    weights: getWeights(),
    eventCounts: eventCounts(),
    opponents: opponentRows(),
    recentEvents: state.events.slice(-8).reverse().map(event => ({
      type: event.type,
      at: event.at,
      roundNo: event.roundNo || 0,
      trickNo: event.trickNo || 0,
      player: event.player?.name || event.winner?.name || event.threat?.name || '',
      points: Number(event.points || 0)
    }))
  };
}

function resetForTesting() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  state.version = 1;
  state.samplesSinceTune = 0;
  state.totalSamples = 0;
  state.weights = { ...DEFAULT_WEIGHTS };
  state.events = [];
  state.opponents = {};
  flush();
  return getSummary();
}

load();

module.exports = {
  flush,
  getWeights,
  getOpponentTendency,
  getSummary,
  resetForTesting,
  recordPass,
  recordMoonGuard,
  recordTrick,
  recordRoundResult
};
