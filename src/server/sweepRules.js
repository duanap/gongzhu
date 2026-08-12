'use strict';

function cardPoints(card) {
  if (!card) return 0;
  if (card.suit === 'H') return 1;
  if (card.suit === 'S' && Number(card.rank) === 12) return 13;
  return 0;
}

function getSweepEligibility(room, playerIndex) {
  if (!room || room.phase !== 'play' || room.busy || room.trick?.length) return null;
  if (room.currentPlayer !== playerIndex) return null;

  const player = room.players?.[playerIndex];
  const hand = player?.hand || [];
  if (hand.length < 2) return null;

  const suits = new Set(hand.map(card => card.suit));
  if (suits.size !== 1) return null;
  const [suit] = suits;

  const last = room.lastTrick;
  if (!last || last.leaderPlayer !== playerIndex || last.winnerPlayer !== playerIndex) return null;
  if (last.leadSuit !== suit || !Array.isArray(last.cards) || last.cards.length !== 4) return null;

  const leaderPlay = last.cards.find(play => play.player === playerIndex);
  if (!leaderPlay || leaderPlay.card?.suit !== suit) return null;
  const opponentsWereVoid = last.cards
    .filter(play => play.player !== playerIndex)
    .every(play => play.card?.suit && play.card.suit !== suit);
  if (!opponentsWereVoid) return null;

  const equalHandCounts = room.players.every(item => (item.hand || []).length === hand.length);
  if (!equalHandCounts) return null;

  const remainingCards = room.players.flatMap(item => item.hand || []);
  return {
    suit,
    cardCount: hand.length,
    totalCards: remainingCards.length,
    points: remainingCards.reduce((sum, card) => sum + cardPoints(card), 0)
  };
}

function collectSweepCards(room, playerIndex) {
  const eligibility = getSweepEligibility(room, playerIndex);
  if (!eligibility) return null;

  const remainingCards = room.players.flatMap(item => item.hand || []);
  room.players.forEach(item => { item.hand = []; });
  room.players[playerIndex].taken.push(...remainingCards);
  room.players[playerIndex].round += eligibility.points;
  return {
    ...eligibility,
    cards: remainingCards
  };
}

module.exports = {
  cardPoints,
  getSweepEligibility,
  collectSweepCards
};
