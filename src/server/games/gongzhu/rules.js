'use strict';

const DECLARABLE_CARD_IDS = Object.freeze(['S12', 'D11', 'H14', 'C10']);
const SCORING_CARD_IDS = new Set([
  ...Array.from({ length: 13 }, (_, index) => `H${index + 2}`),
  'S12',
  'D11',
  'C10'
]);

function normalizeIds(values) {
  return new Set((values || []).map(value => typeof value === 'string' ? value : value?.id).filter(Boolean));
}

function isDeclaredCardProtected(card, hand, ledSuits, declarations) {
  if (!normalizeIds(declarations).has(card.id)) return false;
  if (normalizeIds(ledSuits).has(card.suit)) return false;
  return hand.filter(item => item.suit === card.suit).length > 1;
}

function legalCards({ hand = [], trick = [], trickNo = 0, ledSuits = [], declarations = [], forceClubTwo = true } = {}) {
  const cards = Array.isArray(hand) ? hand : [];
  const plays = Array.isArray(trick) ? trick : [];
  if (!plays.length && Number(trickNo) === 0 && forceClubTwo) {
    const clubTwo = cards.find(card => card.id === 'C2');
    return clubTwo ? [clubTwo] : cards;
  }

  if (!plays.length) {
    return cards.filter(card => !isDeclaredCardProtected(card, cards, ledSuits, declarations));
  }

  const leadSuit = plays[0]?.card?.suit;
  const following = cards.filter(card => card.suit === leadSuit);
  if (!following.length) return cards;
  return following.filter(card => !isDeclaredCardProtected(card, cards, ledSuits, declarations));
}

function heartBaseValue(rank) {
  const value = Number(rank);
  if (value <= 4) return 0;
  if (value <= 10) return -10;
  return { 11: -20, 12: -30, 13: -40, 14: -50 }[value] || 0;
}

function scoreCapturedCards(cards = [], declarations = []) {
  const captured = Array.isArray(cards) ? cards : [];
  const capturedIds = normalizeIds(captured);
  const declared = normalizeIds(declarations);
  const hearts = captured.filter(card => card.suit === 'H');
  const fullRed = hearts.length === 13;
  const hasPig = capturedIds.has('S12');
  const hasSheep = capturedIds.has('D11');
  const hasTransformer = capturedIds.has('C10');
  const grandSlam = [...SCORING_CARD_IDS].every(id => capturedIds.has(id));

  const heartMultiplier = declared.has('H14') ? 2 : 1;
  const pigValue = hasPig ? -100 * (declared.has('S12') ? 2 : 1) : 0;
  const sheepValue = hasSheep ? 100 * (declared.has('D11') ? 2 : 1) : 0;
  const heartsValue = fullRed
    ? 200 * heartMultiplier
    : hearts.reduce((sum, item) => sum + heartBaseValue(item.rank), 0) * heartMultiplier;
  const transformer = hasTransformer ? (declared.has('C10') ? 4 : 2) : 1;
  const scoringCardCount = captured.filter(card => SCORING_CARD_IDS.has(card.id)).length;
  const transformerBonus = hasTransformer && scoringCardCount === 1
    ? (declared.has('C10') ? 100 : 50)
    : 0;

  let subtotal = heartsValue + pigValue + sheepValue;
  if (grandSlam) subtotal = heartsValue + Math.abs(pigValue) + sheepValue;
  const total = transformerBonus || subtotal * transformer;

  return {
    total,
    fullRed,
    grandSlam,
    scoringCardCount,
    components: {
      hearts: heartsValue,
      pig: pigValue,
      sheep: sheepValue,
      transformer,
      transformerBonus
    }
  };
}

function settleMatch(scores = [], alreadyOvertime = false) {
  const totals = scores.map(value => Number(value || 0));
  const thresholdReached = totals.some(value => value <= -1000);
  const highest = totals.length ? Math.max(...totals) : 0;
  const lowest = totals.length ? Math.min(...totals) : 0;
  const winnerIndexes = totals.map((value, index) => value === highest ? index : -1).filter(index => index >= 0);
  const pigIndexes = totals.map((value, index) => value === lowest ? index : -1).filter(index => index >= 0);
  const mustSettle = thresholdReached || alreadyOvertime;
  const gameOver = mustSettle && winnerIndexes.length === 1;
  return {
    thresholdReached,
    gameOver,
    overtime: mustSettle && !gameOver,
    winnerIndexes,
    pigIndexes
  };
}

module.exports = {
  DECLARABLE_CARD_IDS,
  SCORING_CARD_IDS,
  legalCards,
  scoreCapturedCards,
  settleMatch
};
