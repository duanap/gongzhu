'use strict';

function cardPointCost(card) {
  if (!card) return Number.POSITIVE_INFINITY;
  if (card.suit === 'S' && Number(card.rank) === 12) return 13;
  if (card.suit === 'H') return 1;
  return 0;
}

function chooseLowestCostWinningCard(cards = []) {
  return [...cards].sort((a, b) =>
    cardPointCost(a) - cardPointCost(b)
    || Number(a.rank || 0) - Number(b.rank || 0)
  )[0] || null;
}

function hasOtherPlayerRoundPoints(room, playerIndex) {
  if ((room?.players || []).some((player, index) => (
    index !== playerIndex && Number(player?.round || 0) > 0
  ))) {
    return true;
  }
  return (room?.pendingPointOwners || []).some(index => index !== playerIndex);
}

module.exports = {
  cardPointCost,
  chooseLowestCostWinningCard,
  hasOtherPlayerRoundPoints
};
