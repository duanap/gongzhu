'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DECLARABLE_CARD_IDS,
  legalCards,
  scoreCapturedCards,
  settleMatch
} = require('./rules');

function card(id) {
  const [, suit, rank] = /^([CDSH])(\d+)$/.exec(id) || [];
  return { id, suit, rank: Number(rank) };
}

test('gongzhu-v1 exposes the four declarable cards', () => {
  assert.deepEqual(DECLARABLE_CARD_IDS, ['S12', 'D11', 'H14', 'C10']);
});

test('the first lead is forced to club two', () => {
  const hand = ['C2', 'C10', 'D3'].map(card);
  assert.deepEqual(legalCards({ hand, trick: [], trickNo: 0 }).map(item => item.id), ['C2']);
});

test('later rounds allow the previous pig taker to lead any unprotected card', () => {
  const hand = ['C2', 'D3'].map(card);
  assert.deepEqual(legalCards({ hand, trick: [], trickNo: 0, forceClubTwo: false }).map(item => item.id), ['C2', 'D3']);
});

test('players must follow suit without Hearts first-trick restrictions', () => {
  const hand = ['H14', 'H2', 'S12'].map(card);
  const trick = [{ player: 0, card: card('H5') }];
  assert.deepEqual(legalCards({ hand, trick, trickNo: 0, ledSuits: [] }).map(item => item.id), ['H14', 'H2']);
});

test('a declared card is protected the first time its suit is led unless it is the only card', () => {
  const trick = [{ player: 0, card: card('S3') }];
  const protectedHand = ['S12', 'S5', 'D2'].map(card);
  assert.deepEqual(legalCards({
    hand: protectedHand,
    trick,
    trickNo: 3,
    ledSuits: [],
    declarations: ['S12']
  }).map(item => item.id), ['S5']);

  const onlySpade = ['S12', 'D2'].map(card);
  assert.deepEqual(legalCards({
    hand: onlySpade,
    trick,
    trickNo: 3,
    ledSuits: [],
    declarations: ['S12']
  }).map(item => item.id), ['S12']);
});

test('a void player may discard a declared card', () => {
  const hand = ['S12', 'D2'].map(card);
  const trick = [{ player: 0, card: card('C3') }];
  assert.deepEqual(legalCards({
    hand,
    trick,
    trickNo: 4,
    ledSuits: [],
    declarations: ['S12']
  }).map(item => item.id), ['S12', 'D2']);
});

test('ordinary pig sheep hearts and transformer scoring follows gongzhu-v1', () => {
  const result = scoreCapturedCards(
    ['S12', 'D11', 'H5', 'H11', 'C10'].map(card),
    []
  );
  assert.equal(result.total, -60);
  assert.deepEqual(result.components, {
    hearts: -30,
    pig: -100,
    sheep: 100,
    transformer: 2,
    transformerBonus: 0
  });
});

test('declared cards double their own effects and declared transformer quadruples', () => {
  const result = scoreCapturedCards(
    ['S12', 'D11', 'H5', 'H14', 'C10'].map(card),
    ['S12', 'D11', 'H14', 'C10']
  );
  assert.equal(result.total, -480);
  assert.equal(result.components.hearts, -120);
  assert.equal(result.components.pig, -200);
  assert.equal(result.components.sheep, 200);
  assert.equal(result.components.transformer, 4);
});

test('transformer alone is a bonus while a zero-point heart prevents the bonus', () => {
  assert.equal(scoreCapturedCards([card('C10')], []).total, 50);
  assert.equal(scoreCapturedCards([card('C10')], ['C10']).total, 100);
  assert.equal(scoreCapturedCards(['C10', 'H2'].map(card), []).total, 0);
});

test('all hearts are positive full red and grand slam reverses the pig', () => {
  const hearts = Array.from({ length: 13 }, (_, index) => card(`H${index + 2}`));
  assert.equal(scoreCapturedCards(hearts, []).total, 200);
  assert.equal(scoreCapturedCards(hearts, ['H14']).total, 400);

  const slam = [...hearts, card('S12'), card('D11'), card('C10')];
  assert.equal(scoreCapturedCards(slam, []).total, 800);
  assert.equal(scoreCapturedCards(slam, ['S12', 'D11', 'H14', 'C10']).total, 3200);
});

test('match ends at minus 1000 only with a unique highest score', () => {
  assert.deepEqual(settleMatch([-1000, -200, -300, -400]), {
    thresholdReached: true,
    gameOver: true,
    overtime: false,
    winnerIndexes: [1],
    pigIndexes: [0]
  });
  assert.deepEqual(settleMatch([-1000, 20, 20, -40]), {
    thresholdReached: true,
    gameOver: false,
    overtime: true,
    winnerIndexes: [1, 2],
    pigIndexes: [0]
  });
});
