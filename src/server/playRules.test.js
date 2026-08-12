'use strict';

const assert = require('assert');
const { explainIllegalCardForState, legalCardsForState } = require('./playRules');

function card(id) {
  const match = /^([CDSH])(\d+)$/.exec(id);
  return { id, suit: match[1], rank: Number(match[2]) };
}

function play(player, id) {
  return { player, card: card(id) };
}

const opening = { hand: ['C2', 'D5', 'H5'].map(card), trick: [], trickNo: 0, heartsBroken: false };
assert.deepStrictEqual(legalCardsForState(opening).map(item => item.id), ['C2']);
assert.strictEqual(explainIllegalCardForState(opening, 'H5'), '首轮首出必须先出梅花 2');

const followSuit = { hand: ['C5', 'D5', 'H5'].map(card), trick: [play(3, 'C7')], trickNo: 2, heartsBroken: false };
assert.deepStrictEqual(legalCardsForState(followSuit).map(item => item.id), ['C5']);
assert.strictEqual(explainIllegalCardForState(followSuit, 'H5'), '本墩先出的是梅花，你必须跟出同花色');

const unbrokenHearts = { hand: ['D5', 'H5'].map(card), trick: [], trickNo: 2, heartsBroken: false };
assert.deepStrictEqual(legalCardsForState(unbrokenHearts).map(item => item.id), ['D5']);
assert.strictEqual(explainIllegalCardForState(unbrokenHearts, 'H5'), '红桃尚未破，暂时不能主动出红桃');

const firstTrickPoints = { hand: ['D5', 'S12', 'H5'].map(card), trick: [play(3, 'C2')], trickNo: 0, heartsBroken: false };
assert.deepStrictEqual(legalCardsForState(firstTrickPoints).map(item => item.id), ['D5']);
assert.strictEqual(explainIllegalCardForState(firstTrickPoints, 'S12'), '第一墩不能垫红桃或黑桃 Q');
assert.strictEqual(explainIllegalCardForState(firstTrickPoints, 'H5'), '第一墩不能垫红桃或黑桃 Q');

console.log('Play rule reason tests passed');
