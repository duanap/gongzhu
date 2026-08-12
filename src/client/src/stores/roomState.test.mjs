import assert from 'node:assert/strict';
import { createRoomSessionState, resetRoomSession } from './roomState.mjs';

const players = () => [{ id: '' }, { id: '' }, { id: '' }, { id: '' }];
const state = {
  ...createRoomSessionState(players),
  roomId: '1234',
  reconnectToken: 'secret',
  phase: 'play',
  hand: [{ id: 'S12' }],
  legalCardIds: ['S12'],
  trickNo: 8,
  currentPlayer: 3,
  currentViewPlayer: 2,
  busy: true,
  heartsBroken: true,
  gameOver: true,
  sweepOffer: { playerIndex: 0 },
  youPassed: true
};

resetRoomSession(state, players, '房间已关闭。');

assert.strictEqual(state.roomId, '');
assert.strictEqual(state.reconnectToken, '');
assert.strictEqual(state.phase, 'offline');
assert.deepStrictEqual(state.hand, []);
assert.deepStrictEqual(state.legalCardIds, []);
assert.strictEqual(state.trickNo, 0);
assert.strictEqual(state.currentPlayer, 0);
assert.strictEqual(state.currentViewPlayer, 0);
assert.strictEqual(state.busy, false);
assert.strictEqual(state.heartsBroken, false);
assert.strictEqual(state.gameOver, false);
assert.strictEqual(state.sweepOffer, null);
assert.strictEqual(state.youPassed, false);
assert.strictEqual(state.notice, '房间已关闭。');
assert.notStrictEqual(state.players, state.viewPlayers);

console.log('Room state reset tests passed');
