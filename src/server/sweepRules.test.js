'use strict';

const assert = require('assert');
const { getSweepEligibility, collectSweepCards } = require('./sweepRules');

function card(id, suit, rank) {
  return { id, suit, rank };
}

function eligibleRoom() {
  return {
    phase: 'play',
    busy: false,
    trick: [],
    currentPlayer: 0,
    players: [
      { hand: [card('S13', 'S', 13), card('S14', 'S', 14)], taken: [], round: 4 },
      { hand: [card('H2', 'H', 2), card('H3', 'H', 3)], taken: [], round: 0 },
      { hand: [card('D2', 'D', 2), card('D3', 'D', 3)], taken: [], round: 0 },
      { hand: [card('C3', 'C', 3), card('C4', 'C', 4)], taken: [], round: 0 }
    ],
    lastTrick: {
      leadSuit: 'S',
      leaderPlayer: 0,
      winnerPlayer: 0,
      cards: [
        { player: 0, card: card('S12', 'S', 12) },
        { player: 1, card: card('H10', 'H', 10) },
        { player: 2, card: card('D10', 'D', 10) },
        { player: 3, card: card('C10', 'C', 10) }
      ]
    }
  };
}

const eligible = getSweepEligibility(eligibleRoom(), 0);
assert.deepStrictEqual(eligible, {
  suit: 'S',
  cardCount: 2,
  totalCards: 8,
  points: 2
});

const mixedHand = eligibleRoom();
mixedHand.players[0].hand[1] = card('H14', 'H', 14);
assert.strictEqual(getSweepEligibility(mixedHand, 0), null);

const opponentFollowed = eligibleRoom();
opponentFollowed.lastTrick.cards[1] = { player: 1, card: card('S2', 'S', 2) };
assert.strictEqual(getSweepEligibility(opponentFollowed, 0), null);

const didNotWin = eligibleRoom();
didNotWin.lastTrick.winnerPlayer = 1;
assert.strictEqual(getSweepEligibility(didNotWin, 0), null);

const collectedRoom = eligibleRoom();
const collected = collectSweepCards(collectedRoom, 0);
assert.strictEqual(collected.cards.length, 8);
assert.strictEqual(collected.points, 2);
assert.strictEqual(collectedRoom.players[0].round, 6);
assert.strictEqual(collectedRoom.players[0].taken.length, 8);
assert.deepStrictEqual(collectedRoom.players.map(player => player.hand.length), [0, 0, 0, 0]);

console.log('Sweep eligibility tests passed');
