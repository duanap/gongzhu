'use strict';

const assert = require('assert');
const {
  canResumeSeat,
  canResumeTakeoverSeat,
  createRejoinGrant,
  normalizeReconnectToken,
  rejoinGrantTokenFor,
  reconnectTokenMatches
} = require('./sessionIdentity');

const human = {
  id: 'publicly-visible-client-id',
  userId: 'user-1',
  reconnectToken: 'token-1',
  takeoverFromReconnectToken: null,
  isBot: false
};

assert.strictEqual(canResumeSeat(human, { userId: 'user-1' }), true);
assert.strictEqual(canResumeSeat(human, { reconnectToken: 'token-1' }), true);
assert.strictEqual(canResumeSeat(human, { reconnectToken: 'wrong-token' }), false);
assert.strictEqual(canResumeSeat(human, {}), false);
assert.strictEqual(reconnectTokenMatches(human, ''), false);
assert.strictEqual(normalizeReconnectToken(`  ${'x'.repeat(140)}  `).length, 128);

const takeover = {
  id: 'bot-id',
  userId: 'user-2',
  reconnectToken: '',
  takeoverFromReconnectToken: 'takeover-token',
  takeoverFromName: 'Player',
  isBot: true
};

assert.strictEqual(canResumeTakeoverSeat(takeover, { userId: 'user-2' }), true);
assert.strictEqual(canResumeTakeoverSeat(takeover, { reconnectToken: 'takeover-token' }), true);
assert.strictEqual(canResumeTakeoverSeat(takeover, { reconnectToken: 'wrong-token' }), false);
assert.strictEqual(canResumeSeat(takeover, { userId: 'user-2' }), false);

const grant = createRejoinGrant('1234', 'leave-token', { now: 1000, ttlMs: 5000 });
assert.strictEqual(rejoinGrantTokenFor(grant, '1234', 5999), 'leave-token');
assert.strictEqual(rejoinGrantTokenFor(grant, '1234', 6000), '');
assert.strictEqual(rejoinGrantTokenFor(grant, '9999', 2000), '');

console.log('Session identity tests passed');
