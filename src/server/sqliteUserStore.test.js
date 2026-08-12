'use strict';

const assert = require('assert');
const { createSqliteDatabase } = require('./sqliteDatabase');
const { createSqliteUserStore } = require('./sqliteUserStore');
const { createUserAdminRepository } = require('./userAdminRepository');

const sqlite = createSqliteDatabase({ databaseFile: ':memory:' });
let tick = 0;
const store = createSqliteUserStore({
  database: sqlite.database,
  randomUUID: () => 'sqlite-user-1',
  now: () => `2026-07-21T00:00:0${tick++}.000Z`
});

const user = store.upsertQqUser({ openId: 'openid-sqlite', nickname: 'SQLite Alice', avatarUrl: '', guestId: '' });
assert.strictEqual(user.userId, 'sqlite-user-1');
store.recordGameStats({
  id: 'room-sqlite', roundNo: 1, moonShooter: null,
  players: [
    { userId: user.userId, name: user.nickname, total: 0 },
    { isBot: true, total: 10 }, { isBot: true, total: 20 }, { isBot: true, total: 30 }
  ]
});
assert.strictEqual(store.findByUserId(user.userId).stats.gamesPlayed, 1);

const admin = createUserAdminRepository(store);
assert.strictEqual(admin.counts().users, 1);
assert.strictEqual(admin.listUsers({ query: 'alice' }).rows[0].userId, user.userId);
const statusChange = admin.updateUserStatus(user.userId, { status: 'suspended', reason: 'review' });
assert.strictEqual(statusChange.after.status, 'suspended');
assert.strictEqual(admin.listMatches({ userId: user.userId }).rows.length, 1);
assert.strictEqual(admin.publicRecentMatches(1)[0].participants[0].userId, undefined);

sqlite.close();
console.log('SQLite user store tests passed');
