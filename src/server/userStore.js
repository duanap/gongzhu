'use strict';

const crypto = require('crypto');
const path = require('path');
const { readJsonFile, writeJsonAtomic } = require('./jsonPersistence');

function defaultUserStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    totalScore: 0,
    bestScore: null,
    moonShots: 0,
    averageScore: 0
  };
}

function normalizeStats(stats = {}) {
  const gamesPlayed = Number(stats.gamesPlayed || 0);
  const totalScore = Number(stats.totalScore || 0);
  return {
    ...defaultUserStats(),
    ...stats,
    gamesPlayed,
    gamesWon: Number(stats.gamesWon || 0),
    totalScore,
    bestScore: stats.bestScore == null ? null : Number(stats.bestScore),
    moonShots: Number(stats.moonShots || 0),
    averageScore: gamesPlayed ? Math.round((totalScore / gamesPlayed) * 10) / 10 : 0
  };
}

function mergeStats(target = {}, source = {}) {
  const base = normalizeStats(target);
  const incoming = normalizeStats(source);
  const gamesPlayed = base.gamesPlayed + incoming.gamesPlayed;
  const totalScore = base.totalScore + incoming.totalScore;
  const bestScores = [base.bestScore, incoming.bestScore].filter(value => value != null);
  return normalizeStats({
    gamesPlayed,
    gamesWon: base.gamesWon + incoming.gamesWon,
    totalScore,
    bestScore: bestScores.length ? Math.min(...bestScores) : null,
    moonShots: base.moonShots + incoming.moonShots
  });
}

function publicUser(user) {
  if (!user) return null;
  const stats = normalizeStats(user.stats);
  return {
    userId: user.userId,
    nickname: user.nickname || '',
    avatarUrl: user.avatarUrl || '',
    provider: user.provider || 'qq',
    createdAt: user.createdAt || '',
    lastLoginAt: user.lastLoginAt || '',
    lastPlayedAt: user.lastPlayedAt || '',
    stats
  };
}

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

function createUserStore(options = {}) {
  const usersFile = options.usersFile || path.join(__dirname, '..', '..', 'data', 'users.json');
  const now = options.now || (() => new Date().toISOString());
  const randomUUID = options.randomUUID || (() => crypto.randomUUID());
  const logger = options.logger || console;
  let store = null;

  function ensure() {
    if (store) return store;
    const parsed = readJsonFile(usersFile, {
      fallback: () => ({ users: [], guests: [], recentMatches: [] }),
      label: 'User store',
      logger
    });
    store = {
      users: Array.isArray(parsed?.users) ? parsed.users : [],
      guests: Array.isArray(parsed?.guests) ? parsed.guests : [],
      recentMatches: Array.isArray(parsed?.recentMatches) ? parsed.recentMatches : []
    };
    store.users.forEach(user => { user.stats = normalizeStats(user.stats); });
    store.guests.forEach(guest => { guest.stats = normalizeStats(guest.stats); });
    return store;
  }

  function save() {
    writeJsonAtomic(usersFile, ensure());
  }

  function findByUserId(userId) {
    const normalized = String(userId || '');
    if (!normalized) return null;
    return ensure().users.find(user => user.userId === normalized) || null;
  }

  function findByQqOpenId(openId) {
    const normalized = String(openId || '');
    if (!normalized) return null;
    return ensure().users.find(user => user.provider === 'qq' && user.qqOpenId === normalized) || null;
  }

  function findGuestById(guestId) {
    const normalized = String(guestId || '');
    if (!normalized) return null;
    return ensure().guests.find(guest => guest.guestId === normalized) || null;
  }

  function ensureGuest(guestId, nickname = '') {
    const normalized = String(guestId || '').trim();
    if (!normalized) return null;
    let guest = findGuestById(normalized);
    if (!guest) {
      guest = {
        guestId: normalized,
        nickname: nickname || 'Guest',
        stats: defaultUserStats(),
        createdAt: now(),
        lastPlayedAt: ''
      };
      ensure().guests.push(guest);
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
    if (guest.lastPlayedAt && (!user.lastPlayedAt || guest.lastPlayedAt > user.lastPlayedAt)) {
      user.lastPlayedAt = guest.lastPlayedAt;
    }
    guest.mergedIntoUserId = user.userId;
    guest.mergedAt = now();
    return true;
  }

  function upsertQqUser({ openId, nickname, avatarUrl, guestId }) {
    const normalizedOpenId = String(openId || '').trim();
    if (!normalizedOpenId) throw new Error('missing QQ openId');
    const existing = findByQqOpenId(normalizedOpenId);
    const timestamp = now();
    if (existing) {
      existing.nickname = nickname || existing.nickname || '';
      existing.avatarUrl = avatarUrl || existing.avatarUrl || '';
      existing.lastLoginAt = timestamp;
      if (guestId && !existing.guestIds?.includes(guestId)) {
        existing.guestIds = [...(existing.guestIds || []), guestId];
      }
      if (guestId) mergeGuestIntoUser(existing, guestId);
      existing.stats = normalizeStats(existing.stats);
      save();
      return existing;
    }

    const user = {
      userId: randomUUID(),
      provider: 'qq',
      qqOpenId: normalizedOpenId,
      nickname: nickname || 'QQ Player',
      avatarUrl: avatarUrl || '',
      guestIds: guestId ? [guestId] : [],
      stats: defaultUserStats(),
      createdAt: timestamp,
      lastLoginAt: timestamp
    };
    if (guestId) mergeGuestIntoUser(user, guestId);
    user.stats = normalizeStats(user.stats);
    ensure().users.push(user);
    save();
    return user;
  }

  function matchId(room) {
    return `${room?.id || 'room'}-${room?.roundNo || 0}-${Date.now().toString(36)}`;
  }

  function recordGameStats(room) {
    if (!room?.players?.length) return;
    const minScore = Math.min(...room.players.map(player => Number(player.total || 0)));
    const playedAt = now();
    const participants = [];
    let changed = false;
    for (const player of room.players) {
      if (player.isBot) continue;
      const score = Number(player.total || 0);
      const winner = score === minScore;
      const moonShot = room.moonShooter != null && room.players[room.moonShooter]?.id === player.id;
      let record = null;
      if (player.userId) {
        record = findByUserId(player.userId);
      }
      if (!record && player.guestId) {
        record = ensureGuest(player.guestId, player.name || '');
      }
      if (!record) continue;
      record.stats = normalizeStats(record.stats);
      record.stats.gamesPlayed += 1;
      if (winner) record.stats.gamesWon += 1;
      record.stats.totalScore += score;
      record.stats.bestScore = record.stats.bestScore == null ? score : Math.min(Number(record.stats.bestScore), score);
      if (moonShot) record.stats.moonShots += 1;
      record.stats = normalizeStats(record.stats);
      record.lastPlayedAt = playedAt;
      participants.push({
        userId: player.userId || '',
        guestId: player.userId ? '' : (player.guestId || ''),
        name: player.name || 'Player',
        score,
        winner,
        isBot: Boolean(player.isBot)
      });
      changed = true;
    }
    if (participants.length) {
      ensure().recentMatches.unshift({
        matchId: matchId(room),
        roomId: room.id || '',
        roundNo: Number(room.roundNo || 0),
        playedAt,
        participants
      });
      ensure().recentMatches = ensure().recentMatches.slice(0, 100);
      changed = true;
    }
    if (changed) save();
  }

  function leaderboard(limit = 20) {
    function bestScoreValue(user) {
      return user.stats.bestScore == null ? Number.POSITIVE_INFINITY : user.stats.bestScore;
    }
    return ensure().users
      .map(user => ({ ...publicUser(user), type: 'user' }))
      .filter(user => user.stats.gamesPlayed > 0)
      .sort((a, b) => b.stats.gamesWon - a.stats.gamesWon
        || a.stats.averageScore - b.stats.averageScore
        || bestScoreValue(a) - bestScoreValue(b)
        || b.stats.gamesPlayed - a.stats.gamesPlayed)
      .slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  }

  function recentMatches(limit = 20) {
    return ensure().recentMatches.slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  }

  function userMatches(userId, guestId, limit = 20) {
    const normalizedUserId = String(userId || '');
    const normalizedGuestId = String(guestId || '');
    return recentMatches(100)
      .filter(match => match.participants?.some(player => (
        (normalizedUserId && player.userId === normalizedUserId)
        || (normalizedGuestId && player.guestId === normalizedGuestId)
      )))
      .slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  }

  function identityStats({ userId = '', guestId = '' } = {}) {
    const user = findByUserId(userId);
    const guest = user ? null : findGuestById(guestId);
    return {
      profile: user ? publicUser(user) : publicGuest(guest),
      matches: userMatches(user?.userId || '', user ? '' : guestId, 20)
    };
  }

  return {
    ensure,
    save,
    findByUserId,
    findByQqOpenId,
    findGuestById,
    publicUser,
    publicGuest,
    upsertQqUser,
    recordGameStats,
    leaderboard,
    recentMatches,
    userMatches,
    identityStats
  };
}

module.exports = {
  createUserStore,
  defaultUserStats,
  mergeStats,
  normalizeStats,
  publicUser
};
