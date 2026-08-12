'use strict';

const USER_STATUSES = new Set(['active', 'suspended', 'banned']);

function encodeCursor(offset) {
  return Buffer.from(String(Math.max(0, Number(offset || 0)))).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch (error) {
    return 0;
  }
}

function page(items, { limit = 20, cursor = '' } = {}) {
  const requestedLimit = Number(limit || 20);
  const safeLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 20;
  const offset = decodeCursor(cursor);
  const rows = items.slice(offset, offset + safeLimit);
  const nextOffset = offset + rows.length;
  return {
    rows,
    page: {
      limit: safeLimit,
      nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : '',
      total: items.length
    }
  };
}

function publicMatch(match) {
  if (!match) return null;
  return {
    matchId: match.matchId,
    roomId: match.roomId || '',
    roundNo: Number(match.roundNo || 0),
    playedAt: match.playedAt || '',
    participants: (match.participants || []).map(player => ({
      name: player.name || 'Player',
      score: Number(player.score || 0),
      winner: Boolean(player.winner),
      isBot: Boolean(player.isBot)
    }))
  };
}

function createUserAdminRepository(userStore) {
  if (!userStore?.ensure || !userStore?.save) throw new Error('userStore with ensure/save is required');

  function raw() {
    return userStore.ensure();
  }

  function listUsers(filters = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    const status = String(filters.status || '').trim();
    const rows = raw().users
      .filter(user => !status || (user.status || 'active') === status)
      .filter(user => !query || [user.userId, user.nickname, user.qqOpenId].some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map(user => ({
        userId: user.userId,
        provider: user.provider || 'qq',
        nickname: user.nickname || '',
        avatarUrl: user.avatarUrl || '',
        status: user.status || 'active',
        statusReason: user.statusReason || '',
        statusExpiresAt: user.statusExpiresAt || '',
        version: Number(user.version || 0),
        createdAt: user.createdAt || '',
        lastLoginAt: user.lastLoginAt || '',
        lastPlayedAt: user.lastPlayedAt || '',
        stats: user.stats || {}
      }));
    return page(rows, filters);
  }

  function getUser(userId) {
    const user = userStore.findByUserId(userId);
    if (!user) return null;
    return {
      ...listUsers({ query: user.userId, limit: 1 }).rows[0],
      guestIds: [...(user.guestIds || [])],
      matches: userStore.userMatches(user.userId, '', 20)
    };
  }

  function updateUserStatus(userId, { status, reason = '', expiresAt = '', expectedVersion } = {}) {
    if (!USER_STATUSES.has(status)) throw new Error('invalid user status');
    const user = userStore.findByUserId(userId);
    if (!user) return null;
    if (Number.isInteger(expectedVersion) && Number(user.version || 0) !== expectedVersion) {
      const error = new Error('user version conflict');
      error.code = 'VERSION_CONFLICT';
      throw error;
    }
    const before = getUser(userId);
    user.status = status;
    user.statusReason = status === 'active' ? '' : String(reason || '').trim().slice(0, 500);
    user.statusExpiresAt = status === 'suspended' ? String(expiresAt || '').trim() : '';
    user.statusUpdatedAt = new Date().toISOString();
    user.version = Number(user.version || 0) + 1;
    userStore.save();
    return { before, after: getUser(userId) };
  }

  function listMatches(filters = {}) {
    const roomId = String(filters.roomId || '').trim();
    const userId = String(filters.userId || '').trim();
    const rows = raw().recentMatches
      .filter(match => !roomId || match.roomId === roomId)
      .filter(match => !userId || match.participants?.some(player => player.userId === userId))
      .sort((a, b) => String(b.playedAt || '').localeCompare(String(a.playedAt || '')));
    return page(rows, filters);
  }

  function getMatch(matchId) {
    return raw().recentMatches.find(match => match.matchId === String(matchId || '')) || null;
  }

  function publicRecentMatches(limit = 20) {
    return userStore.recentMatches(limit).map(publicMatch);
  }

  function counts() {
    return {
      users: raw().users.length,
      guests: raw().guests.length,
      matches: raw().recentMatches.length,
      bannedUsers: raw().users.filter(user => (user.status || 'active') === 'banned').length,
      suspendedUsers: raw().users.filter(user => (user.status || 'active') === 'suspended').length
    };
  }

  return { counts, getMatch, getUser, listMatches, listUsers, publicRecentMatches, updateUserStatus };
}

module.exports = { createUserAdminRepository, decodeCursor, encodeCursor, publicMatch };
