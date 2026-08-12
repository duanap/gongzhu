'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createUserStore, defaultUserStats } = require('./userStore');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearts-user-store-'));
const usersFile = path.join(tempDir, 'users.json');
let tick = 0;
let uuidTick = 0;
const store = createUserStore({
  usersFile,
  randomUUID: () => `user-${++uuidTick}`,
  now: () => `2026-07-01T00:00:0${tick++}.000Z`
});

const user = store.upsertQqUser({
  openId: 'openid-1',
  nickname: 'Alice',
  avatarUrl: 'https://example.com/a.png',
  guestId: 'guest-1'
});

assert.strictEqual(user.userId, 'user-1');
assert.strictEqual(user.provider, 'qq');
assert.strictEqual(user.qqOpenId, 'openid-1');
assert.deepStrictEqual(user.stats, defaultUserStats());
assert.deepStrictEqual(user.guestIds, ['guest-1']);
assert.ok(fs.existsSync(usersFile));

assert.deepStrictEqual(store.publicUser(user), {
  userId: 'user-1',
  nickname: 'Alice',
  avatarUrl: 'https://example.com/a.png',
  provider: 'qq',
  createdAt: '2026-07-01T00:00:00.000Z',
  lastLoginAt: '2026-07-01T00:00:00.000Z',
  lastPlayedAt: '',
  stats: defaultUserStats()
});

store.recordGameStats({
  id: 'guest-room',
  roundNo: 1,
  players: [
    { id: 'guest-player', guestId: 'guest-2', name: 'Guest Two', total: 7 },
    { isBot: true, total: 18 },
    { isBot: true, total: 21 },
    { isBot: true, total: 30 }
  ]
});

const existing = store.upsertQqUser({
  openId: 'openid-1',
  nickname: 'Alice QQ',
  avatarUrl: '',
  guestId: 'guest-2'
});

assert.strictEqual(existing.userId, 'user-1');
assert.strictEqual(existing.nickname, 'Alice QQ');
assert.strictEqual(existing.avatarUrl, 'https://example.com/a.png');
assert.deepStrictEqual(existing.guestIds, ['guest-1', 'guest-2']);
assert.strictEqual(existing.stats.gamesPlayed, 1);
assert.strictEqual(existing.stats.gamesWon, 1);
assert.strictEqual(existing.stats.totalScore, 7);
assert.strictEqual(existing.stats.bestScore, 7);
assert.strictEqual(existing.stats.averageScore, 7);
assert.strictEqual(store.findGuestById('guest-2').mergedIntoUserId, 'user-1');

store.recordGameStats({
  id: 'user-room',
  roundNo: 2,
  players: [
    { userId: 'user-1', total: 42 },
    { userId: '', total: 10 },
    { userId: 'missing-user', total: 4 },
    { userId: 'user-1', total: 18 }
  ]
});

assert.strictEqual(existing.stats.gamesPlayed, 3);
assert.strictEqual(existing.stats.gamesWon, 1);
assert.strictEqual(existing.stats.totalScore, 67);
assert.strictEqual(existing.stats.bestScore, 7);
assert.strictEqual(existing.stats.averageScore, 22.3);
assert.ok(existing.lastPlayedAt);
assert.strictEqual(store.leaderboard(5)[0].userId, 'user-1');
assert.strictEqual(store.recentMatches(5).length, 2);
assert.strictEqual(store.identityStats({ userId: 'user-1' }).matches.length, 1);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('User store tests passed');
