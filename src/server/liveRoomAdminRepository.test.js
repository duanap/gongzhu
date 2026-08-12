'use strict';

const assert = require('node:assert/strict');
const { createLiveRoomAdminRepository } = require('./liveRoomAdminRepository');

const rooms = new Map([
  ['1234', {
    id: '1234', phase: 'play', roundNo: 2, trickNo: 3, createdAt: 100, updatedAt: 200,
    players: [{ name: 'Alice', userId: 'user-1', guestId: 'secret', connected: true, hand: [{ id: 'C2', suit: 'C', rank: 2 }] }]
  }]
]);
const repository = createLiveRoomAdminRepository({ rooms, closeRoom: room => rooms.delete(room.id) });

assert.equal(repository.counts().liveRooms, 1);
assert.equal(repository.list({ query: 'alice' }).rows[0].players[0].hand, undefined);
assert.equal(repository.get('1234', { includeSensitive: true }).players[0].guestId, 'secret');
assert.equal(repository.disband('1234', 'test'), true);
assert.equal(repository.get('1234'), null);

console.log('Live room admin repository tests passed');
