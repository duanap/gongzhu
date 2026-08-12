'use strict';

const assert = require('assert');
const { publicHostId, publicPlayerFor, publicSeatId } = require('./roomProjection');

const players = [0, 1, 2, 3].map(index => ({
  id: `private-${index}`,
  userId: index === 0 ? 'user-1' : '',
  reconnectToken: `secret-${index}`,
  name: `Player ${index}`,
  avatar: '',
  isBot: false,
  connected: true,
  leftRoom: false,
  hand: [{ id: `C${index + 2}` }],
  round: index,
  total: index * 2
}));
const room = { hostId: 'private-2', players };

assert.strictEqual(publicSeatId(2), 'seat-2');
assert.strictEqual(publicHostId(room), 'seat-2');
const own = publicPlayerFor(players[0], 0, 0, [[1], null, null, null]);
const opponent = publicPlayerFor(players[1], 1, 0, []);
assert.strictEqual(own.id, 'seat-0');
assert.strictEqual(own.passed, true);
assert.strictEqual(own.hand.length, 1);
assert.deepStrictEqual(opponent.hand, []);
assert.strictEqual('reconnectToken' in own, false);
assert.strictEqual('userId' in own, false);
assert.strictEqual(JSON.stringify(own).includes('private-0'), false);

console.log('Room projection tests passed');
