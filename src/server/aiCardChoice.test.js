'use strict';

const assert = require('assert');
const {
  cardPointCost,
  chooseLowestCostWinningCard,
  hasOtherPlayerRoundPoints
} = require('./aiCardChoice');

assert.strictEqual(cardPointCost({ id: 'S12', suit: 'S', rank: 12 }), 13);
assert.strictEqual(cardPointCost({ id: 'H2', suit: 'H', rank: 2 }), 1);
assert.strictEqual(cardPointCost({ id: 'S14', suit: 'S', rank: 14 }), 0);

assert.deepStrictEqual(
  chooseLowestCostWinningCard([
    { id: 'S12', suit: 'S', rank: 12 },
    { id: 'S14', suit: 'S', rank: 14 }
  ]),
  { id: 'S14', suit: 'S', rank: 14 }
);

assert.deepStrictEqual(
  chooseLowestCostWinningCard([
    { id: 'S12', suit: 'S', rank: 12 },
    { id: 'S13', suit: 'S', rank: 13 },
    { id: 'S14', suit: 'S', rank: 14 }
  ]),
  { id: 'S13', suit: 'S', rank: 13 }
);

assert.deepStrictEqual(
  chooseLowestCostWinningCard([
    { id: 'H10', suit: 'H', rank: 10 },
    { id: 'H13', suit: 'H', rank: 13 }
  ]),
  { id: 'H10', suit: 'H', rank: 10 }
);

assert.strictEqual(
  hasOtherPlayerRoundPoints({ players: [{ round: 8 }, { round: 0 }, { round: 0 }, { round: 0 }] }, 0),
  false
);

assert.strictEqual(
  hasOtherPlayerRoundPoints({ players: [{ round: 8 }, { round: 1 }, { round: 0 }, { round: 0 }] }, 0),
  true
);

assert.strictEqual(
  hasOtherPlayerRoundPoints({ players: [{ round: 8 }, { round: 0 }, { round: 0 }, { round: 0 }], pendingPointOwners: [1] }, 0),
  true
);

assert.strictEqual(
  hasOtherPlayerRoundPoints({ players: [{ round: 8 }, { round: 0 }, { round: 0 }, { round: 0 }], pendingPointOwners: [0] }, 0),
  false
);

console.log('AI winning-card cost tests passed');
