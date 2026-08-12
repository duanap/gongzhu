'use strict';

const {
  DECLARABLE_CARD_IDS,
  legalCards,
  scoreCapturedCards,
  settleMatch
} = require('./rules');

const SUIT_ORDER = { C: 0, D: 1, S: 2, H: 3 };

function sortHand(hand) {
  hand.sort((left, right) => SUIT_ORDER[left.suit] - SUIT_ORDER[right.suit] || left.rank - right.rank);
  return hand;
}

function createGame(players = []) {
  return {
    ruleSet: 'gongzhu-v1',
    phase: 'lobby',
    roundNo: 0,
    trickNo: 0,
    trick: [],
    ledSuits: [],
    currentPlayer: 0,
    declarations: [],
    declarationChoices: [null, null, null, null],
    declarationDeadline: 0,
    previousPigTaker: null,
    overtime: false,
    gameOver: false,
    winnerIndexes: [],
    pigIndexes: [],
    lastTrick: null,
    players: players.map((player, index) => ({
      id: player.id || `player-${index}`,
      name: player.name || `玩家 ${index + 1}`,
      avatar: player.avatar || '',
      isBot: Boolean(player.isBot),
      connected: player.connected !== false,
      hand: [],
      taken: [],
      round: 0,
      total: Number(player.total || 0),
      scoreBreakdown: null
    }))
  };
}

function dealRound(game, deck) {
  if (!game || game.players.length !== 4) throw new Error('拱猪需要 4 名玩家');
  if (!Array.isArray(deck) || deck.length !== 52) throw new Error('发牌需要完整的 52 张牌');
  game.roundNo += 1;
  game.phase = 'declare';
  game.trickNo = 0;
  game.trick = [];
  game.ledSuits = [];
  game.declarations = [];
  game.declarationChoices = [null, null, null, null];
  game.declarationDeadline = Date.now() + 20_000;
  game.gameOver = false;
  game.winnerIndexes = [];
  game.pigIndexes = [];
  game.lastTrick = null;
  game.players.forEach((player, index) => {
    player.hand = sortHand(deck.slice(index * 13, index * 13 + 13).map(card => ({ ...card })));
    player.taken = [];
    player.round = 0;
    player.scoreBreakdown = null;
  });
  return game;
}

function beginPlay(game) {
  game.declarations = game.declarationChoices.flatMap((ids, player) => (
    (ids || []).map(cardId => ({ player, cardId }))
  ));
  game.declarationDeadline = 0;
  game.phase = 'play';
  if (game.roundNo > 1 && Number.isInteger(game.previousPigTaker)) {
    game.currentPlayer = game.previousPigTaker;
  } else {
    const starter = game.players.findIndex(player => player.hand.some(card => card.id === 'C2'));
    game.currentPlayer = starter < 0 ? 0 : starter;
  }
}

function submitDeclaration(game, playerIndex, cardIds = []) {
  if (game.phase !== 'declare') return '现在不是亮牌阶段';
  if (!Number.isInteger(playerIndex) || !game.players[playerIndex]) return '玩家不存在';
  if (game.declarationChoices[playerIndex] !== null) return '你已经完成亮牌';
  if (!Array.isArray(cardIds)) return '亮牌内容格式错误';
  if (new Set(cardIds).size !== cardIds.length) return '不能重复亮同一张牌';
  if (cardIds.some(id => !DECLARABLE_CARD_IDS.includes(id))) return '所选牌不能亮';
  if (cardIds.some(id => !game.players[playerIndex].hand.some(card => card.id === id))) return '所选牌不在你的手牌中';
  game.declarationChoices[playerIndex] = [...cardIds];
  if (game.declarationChoices.every(choice => Array.isArray(choice))) beginPlay(game);
  return null;
}

function declarationCardIds(game) {
  return game.declarations.map(item => item.cardId);
}

function finishRound(game) {
  game.players.forEach(player => {
    const result = scoreCapturedCards(player.taken, declarationCardIds(game));
    player.round = result.total;
    player.total += result.total;
    player.scoreBreakdown = result;
  });
  const settlement = settleMatch(game.players.map(player => player.total), game.overtime);
  game.overtime = settlement.overtime;
  game.gameOver = settlement.gameOver;
  game.winnerIndexes = settlement.winnerIndexes;
  game.pigIndexes = settlement.pigIndexes;
  game.phase = settlement.gameOver ? 'gameEnd' : 'roundEnd';
}

function playCard(game, playerIndex, cardId) {
  if (game.phase !== 'play') return '现在不是出牌阶段';
  if (game.currentPlayer !== playerIndex) return '还没轮到你出牌';
  const player = game.players[playerIndex];
  const card = player?.hand.find(item => item.id === cardId);
  if (!card) return '这张牌不在你的手牌中';
  const legal = legalCards({
    hand: player.hand,
    trick: game.trick,
    trickNo: game.trickNo,
    ledSuits: game.ledSuits,
    declarations: declarationCardIds(game),
    forceClubTwo: game.roundNo === 1
  });
  if (!legal.some(item => item.id === cardId)) return '这张牌现在不能出';

  player.hand.splice(player.hand.indexOf(card), 1);
  game.trick.push({ player: playerIndex, card });
  if (game.trick.length < 4) {
    game.currentPlayer = (playerIndex + 1) % 4;
    return null;
  }

  const leadSuit = game.trick[0].card.suit;
  const winnerPlay = game.trick
    .filter(play => play.card.suit === leadSuit)
    .sort((left, right) => right.card.rank - left.card.rank)[0];
  const trickCards = game.trick.map(play => play.card);
  game.players[winnerPlay.player].taken.push(...trickCards);
  if (trickCards.some(item => item.id === 'S12')) game.previousPigTaker = winnerPlay.player;
  if (!game.ledSuits.includes(leadSuit)) game.ledSuits.push(leadSuit);
  game.lastTrick = { winnerPlayer: winnerPlay.player, leadSuit, cards: game.trick.map(play => ({ ...play })) };
  game.trick = [];
  game.trickNo += 1;
  game.currentPlayer = winnerPlay.player;
  if (game.players.every(item => item.hand.length === 0)) finishRound(game);
  return null;
}

module.exports = {
  beginPlay,
  createGame,
  dealRound,
  playCard,
  submitDeclaration
};
