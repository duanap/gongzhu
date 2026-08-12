'use strict';

function isPointCard(card) {
  return Boolean(card && (card.suit === 'H' || (card.suit === 'S' && Number(card.rank) === 12)));
}

function legalCardsForState({ hand = [], trick = [], trickNo = 0, heartsBroken = false } = {}) {
  const cards = Array.isArray(hand) ? hand : [];
  const plays = Array.isArray(trick) ? trick : [];
  const firstTrick = Number(trickNo || 0) === 0;

  if (!plays.length) {
    if (firstTrick) return cards.filter(card => card.id === 'C2');
    const nonHearts = cards.filter(card => card.suit !== 'H');
    if (!heartsBroken && nonHearts.length) return nonHearts;
    return cards;
  }

  const leadSuit = plays[0]?.card?.suit;
  const followCards = cards.filter(card => card.suit === leadSuit);
  if (followCards.length) return followCards;

  if (firstTrick) {
    const safeCards = cards.filter(card => !isPointCard(card));
    return safeCards.length ? safeCards : cards;
  }

  return cards;
}

function explainIllegalCardForState(state = {}, cardId = '') {
  const hand = Array.isArray(state.hand) ? state.hand : [];
  const trick = Array.isArray(state.trick) ? state.trick : [];
  const card = hand.find(item => item.id === cardId);
  if (!card) return '这张牌不在你的手牌中';
  if (legalCardsForState(state).some(item => item.id === cardId)) return '';

  const firstTrick = Number(state.trickNo || 0) === 0;
  const leadSuit = trick[0]?.card?.suit || '';
  if (!leadSuit && firstTrick && hand.some(item => item.id === 'C2') && card.id !== 'C2') {
    return '首轮首出必须先出梅花 2';
  }
  if (leadSuit && card.suit !== leadSuit && hand.some(item => item.suit === leadSuit)) {
    const suitName = { C: '梅花', D: '方片', S: '黑桃', H: '红桃' }[leadSuit] || leadSuit;
    return `本墩先出的是${suitName}，你必须跟出同花色`;
  }
  if (firstTrick && leadSuit && isPointCard(card) && hand.some(item => !isPointCard(item))) {
    return '第一墩不能垫红桃或黑桃 Q';
  }
  if (!leadSuit && card.suit === 'H' && !state.heartsBroken && hand.some(item => item.suit !== 'H')) {
    return '红桃尚未破，暂时不能主动出红桃';
  }
  return '这张牌现在不能出';
}

module.exports = {
  explainIllegalCardForState,
  isPointCard,
  legalCardsForState
};
