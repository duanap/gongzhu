'use strict';

const crypto = require('crypto');
const fs = require('fs');
const {
  defaultUserStats,
  mergeStats,
  normalizeStats,
  publicUser
} = require('./userStore');
const { readJsonFile } = require('./jsonPersistence');

function publicGuest(guest) {
  if (!guest) return null;
  return {
    guestId: guest.guestId,
    nickname: guest.nickname || 'Guest',
    createdAt: guest.createdAt || '',
    lastPlayedAt: guest.lastPlayedAt || '',
    mergedIntoUserId: guest.mergedIntoUserId || '',
    stats: normalizeStats(guest.stats)
  };
}

function parseRow(row) {
  if (!row?.data_json) return null;
  return JSON.parse(row.data_json);
}

function createSqliteUserStore(options = {}) {
  const database = options.database;
  if (!database) throw new Error('database is required');
  const now = options.now || (() => new Date().toISOString());
  const randomUUID = options.randomUUID || (() => crypto.randomUUID());
  const legacyUsersFile = options.legacyUsersFile || '';
  let store = null;

  const upsertUserStatement = database.prepare(`
    INSERT INTO users(user_id, provider_subject, nickname, status, created_at, last_login_at, last_played_at, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      provider_subject = excluded.provider_subject,
      nickname = excluded.nickname,
      status = excluded.status,
      created_at = excluded.created_at,
      last_login_at = excluded.last_login_at,
      last_played_at = excluded.last_played_at,
      data_json = excluded.data_json
  `);
  const upsertGuestStatement = database.prepare(`
    INSERT INTO guests(guest_id, nickname, created_at, last_played_at, data_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guest_id) DO UPDATE SET
      nickname = excluded.nickname,
      created_at = excluded.created_at,
      last_played_at = excluded.last_played_at,
      data_json = excluded.data_json
  `);
  const upsertMatchStatement = database.prepare(`
    INSERT INTO matches(match_id, room_id, played_at, data_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      room_id = excluded.room_id,
      played_at = excluded.played_at,
      data_json = excluded.data_json
  `);

  function load() {
    if (store) return store;
    store = {
      users: database.prepare('SELECT data_json FROM users').all().map(parseRow).filter(Boolean),
      guests: database.prepare('SELECT data_json FROM guests').all().map(parseRow).filter(Boolean),
      recentMatches: database.prepare('SELECT data_json FROM matches ORDER BY played_at DESC, match_id DESC').all().map(parseRow).filter(Boolean)
    };
    if (!store.users.length && !store.guests.length && !store.recentMatches.length && legacyUsersFile && fs.existsSync(legacyUsersFile)) {
      const legacy = readJsonFile(legacyUsersFile, { fallback: null, label: 'Legacy user store' });
      if (legacy) {
        store.users = Array.isArray(legacy.users) ? legacy.users : [];
        store.guests = Array.isArray(legacy.guests) ? legacy.guests : [];
        store.recentMatches = Array.isArray(legacy.recentMatches) ? legacy.recentMatches : [];
        save();
      }
    }
    store.users.forEach(user => {
      user.stats = normalizeStats(user.stats);
      user.status = user.status || 'active';
    });
    store.guests.forEach(guest => { guest.stats = normalizeStats(guest.stats); });
    return store;
  }

  function save() {
    const current = load();
    database.exec('BEGIN IMMEDIATE');
    try {
      current.users.forEach(user => upsertUserStatement.run(
        user.userId,
        `${user.provider || 'qq'}:${user.qqOpenId || user.userId}`,
        user.nickname || '',
        user.status || 'active',
        user.createdAt || '',
        user.lastLoginAt || '',
        user.lastPlayedAt || '',
        JSON.stringify(user)
      ));
      current.guests.forEach(guest => upsertGuestStatement.run(
        guest.guestId,
        guest.nickname || 'Guest',
        guest.createdAt || '',
        guest.lastPlayedAt || '',
        JSON.stringify(guest)
      ));
      current.recentMatches.forEach(match => upsertMatchStatement.run(
        match.matchId,
        match.roomId || '',
        match.playedAt || '',
        JSON.stringify(match)
      ));
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  function findByUserId(userId) {
    return load().users.find(user => user.userId === String(userId || '')) || null;
  }

  function findByQqOpenId(openId) {
    return load().users.find(user => user.provider === 'qq' && user.qqOpenId === String(openId || '').trim()) || null;
  }

  function findGuestById(guestId) {
    return load().guests.find(guest => guest.guestId === String(guestId || '')) || null;
  }

  function ensureGuest(guestId, nickname = '') {
    const normalized = String(guestId || '').trim();
    if (!normalized) return null;
    let guest = findGuestById(normalized);
    if (!guest) {
      guest = { guestId: normalized, nickname: nickname || 'Guest', stats: defaultUserStats(), createdAt: now(), lastPlayedAt: '' };
      load().guests.push(guest);
    } else if (nickname && (!guest.nickname || guest.nickname === 'Guest')) {
      guest.nickname = nickname;
    }
    guest.stats = normalizeStats(guest.stats);
    return guest;
  }

  function mergeGuestIntoUser(user, guestId) {
    const guest = findGuestById(guestId);
    if (!user || !guest || guest.mergedIntoUserId === user.userId) return false;
    user.stats = mergeStats(user.stats, guest.stats);
    if (guest.lastPlayedAt && (!user.lastPlayedAt || guest.lastPlayedAt > user.lastPlayedAt)) user.lastPlayedAt = guest.lastPlayedAt;
    guest.mergedIntoUserId = user.userId;
    guest.mergedAt = now();
    return true;
  }

  function upsertQqUser({ openId, nickname, avatarUrl, guestId }) {
    const normalizedOpenId = String(openId || '').trim();
    if (!normalizedOpenId) throw new Error('missing QQ openId');
    const timestamp = now();
    let user = findByQqOpenId(normalizedOpenId);
    if (user) {
      user.nickname = nickname || user.nickname || '';
      user.avatarUrl = avatarUrl || user.avatarUrl || '';
      user.lastLoginAt = timestamp;
      if (guestId && !user.guestIds?.includes(guestId)) user.guestIds = [...(user.guestIds || []), guestId];
      if (guestId) mergeGuestIntoUser(user, guestId);
      user.stats = normalizeStats(user.stats);
      save();
      return user;
    }
    user = {
      userId: randomUUID(), provider: 'qq', qqOpenId: normalizedOpenId,
      nickname: nickname || 'QQ Player', avatarUrl: avatarUrl || '', guestIds: guestId ? [guestId] : [],
      stats: defaultUserStats(), status: 'active', createdAt: timestamp, lastLoginAt: timestamp
    };
    if (guestId) mergeGuestIntoUser(user, guestId);
    load().users.push(user);
    save();
    return user;
  }

  function recordGameStats(room) {
    if (!room?.players?.length) return;
    const minScore = Math.min(...room.players.map(player => Number(player.total || 0)));
    const playedAt = now();
    const participants = [];
    for (const player of room.players) {
      if (player.isBot) continue;
      const score = Number(player.total || 0);
      const winner = score === minScore;
      const moonShot = room.moonShooter != null && room.players[room.moonShooter]?.id === player.id;
      const record = player.userId ? findByUserId(player.userId) : ensureGuest(player.guestId, player.name || '');
      if (!record) continue;
      record.stats = normalizeStats(record.stats);
      record.stats.gamesPlayed += 1;
      if (winner) record.stats.gamesWon += 1;
      record.stats.totalScore += score;
      record.stats.bestScore = record.stats.bestScore == null ? score : Math.min(Number(record.stats.bestScore), score);
      if (moonShot) record.stats.moonShots += 1;
      record.stats = normalizeStats(record.stats);
      record.lastPlayedAt = playedAt;
      participants.push({ userId: player.userId || '', guestId: player.userId ? '' : (player.guestId || ''), name: player.name || 'Player', score, winner, isBot: false });
    }
    if (participants.length) {
      load().recentMatches.unshift({
        matchId: `${room.id || 'room'}-${room.roundNo || 0}-${Date.now().toString(36)}`,
        roomId: room.id || '', roundNo: Number(room.roundNo || 0), playedAt, participants
      });
      save();
    }
  }

  function leaderboard(limit = 20) {
    return load().users.filter(user => (user.status || 'active') !== 'banned')
      .map(user => ({ ...publicUser(user), type: 'user' }))
      .filter(user => user.stats.gamesPlayed > 0)
      .sort((a, b) => b.stats.gamesWon - a.stats.gamesWon || a.stats.averageScore - b.stats.averageScore || b.stats.gamesPlayed - a.stats.gamesPlayed)
      .slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  }

  function recentMatches(limit = 20) {
    return load().recentMatches.slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  }

  function userMatches(userId, guestId, limit = 20) {
    return load().recentMatches.filter(match => match.participants?.some(player =>
      (userId && player.userId === userId) || (guestId && player.guestId === guestId)
    )).slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  }

  function identityStats({ userId = '', guestId = '' } = {}) {
    const user = findByUserId(userId);
    const guest = user ? null : findGuestById(guestId);
    return { profile: user ? publicUser(user) : publicGuest(guest), matches: userMatches(user?.userId || '', user ? '' : guestId, 20) };
  }

  return {
    ensure: load, save, findByUserId, findByQqOpenId, findGuestById, publicUser, publicGuest,
    upsertQqUser, recordGameStats, leaderboard, recentMatches, userMatches, identityStats
  };
}

module.exports = { createSqliteUserStore };
