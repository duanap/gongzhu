'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  dealRound,
  submitDeclaration,
  playCard,
  resolveTrick
} = require('./engine');

function card(id) {
  const [, suit, rank] = /^([CDSH])(\d+)$/.exec(id) || [];
  return { id, suit, rank: Number(rank) };
}

function orderedDeck() {
  const ids = [];
  for (const suit of ['C', 'D', 'S', 'H']) {
    for (let rank = 2; rank <= 14; rank += 1) ids.push(`${suit}${rank}`);
  }
  return ids.map(card);
}

test('deal enters a secret declaration phase and reveals together', () => {
  const game = createGame(['A', 'B', 'C', 'D'].map(name => ({ name })));
  dealRound(game, orderedDeck());
  assert.equal(game.phase, 'declare');
  assert.equal(game.roundNo, 1);
  assert.equal(game.players.every(player => player.hand.length === 13), true);

  assert.equal(submitDeclaration(game, 0, ['C10']), null);
  assert.deepEqual(game.declarations, []);
  assert.equal(submitDeclaration(game, 1, ['D11']), null);
  assert.equal(submitDeclaration(game, 2, ['S12']), null);
  assert.equal(submitDeclaration(game, 3, ['H14']), null);
  assert.equal(game.phase, 'play');
  assert.deepEqual(game.declarations, [
    { player: 0, cardId: 'C10' },
    { player: 1, cardId: 'D11' },
    { player: 2, cardId: 'S12' },
    { player: 3, cardId: 'H14' }
  ]);
  assert.equal(game.players[0].hand.some(item => item.id === 'C2'), true);
  assert.equal(game.currentPlayer, 0);
});

test('declaration rejects cards that are not owned or declarable', () => {
  const game = createGame(['A', 'B', 'C', 'D'].map(name => ({ name })));
  dealRound(game, orderedDeck());
  assert.match(submitDeclaration(game, 0, ['S12']), /不在你的手牌/);
  assert.match(submitDeclaration(game, 0, ['C9']), /不能亮/);
});

test('winner collects a trick and the pig taker opens the next round', () => {
  const game = createGame(['A', 'B', 'C', 'D'].map(name => ({ name })));
  game.phase = 'play';
  game.roundNo = 1;
  game.currentPlayer = 0;
  game.players[0].hand = [card('C2')];
  game.players[1].hand = [card('S12')];
  game.players[2].hand = [card('D2')];
  game.players[3].hand = [card('H2')];

  assert.equal(playCard(game, 0, 'C2'), null);
  assert.equal(playCard(game, 1, 'S12'), null);
  assert.equal(playCard(game, 2, 'D2'), null);
  assert.equal(playCard(game, 3, 'H2'), null);
  assert.equal(game.previousPigTaker, 0);
  assert.equal(game.phase, 'roundEnd');

  dealRound(game, orderedDeck());
  [0, 1, 2, 3].forEach(index => submitDeclaration(game, index, []));
  assert.equal(game.currentPlayer, 0);
});

test('deferred trick resolution keeps four cards visible until the server settles', () => {
  const game = createGame(['A', 'B', 'C', 'D'].map(name => ({ name })));
  game.phase = 'play';
  game.roundNo = 2;
  game.currentPlayer = 0;
  game.players[0].hand = [card('H10'), card('C3')];
  game.players[1].hand = [card('H11'), card('C4')];
  game.players[2].hand = [card('H12'), card('C5')];
  game.players[3].hand = [card('H13'), card('C6')];

  assert.equal(playCard(game, 0, 'H10', { deferTrickResolution: true }), null);
  assert.equal(playCard(game, 1, 'H11', { deferTrickResolution: true }), null);
  assert.equal(playCard(game, 2, 'H12', { deferTrickResolution: true }), null);
  assert.equal(playCard(game, 3, 'H13', { deferTrickResolution: true }), null);
  assert.equal(game.settlingTrick, true);
  assert.equal(game.trickWinnerPlayer, 3);
  assert.equal(game.trick.length, 4);
  assert.equal(playCard(game, 3, 'C6'), '本墩正在结算');

  assert.equal(resolveTrick(game), null);
  assert.equal(game.settlingTrick, false);
  assert.equal(game.trick.length, 0);
  assert.equal(game.trickNo, 1);
  assert.equal(game.currentPlayer, 3);
  assert.equal(game.players[3].taken.length, 4);
});
