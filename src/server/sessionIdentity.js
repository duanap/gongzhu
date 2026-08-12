'use strict';

const crypto = require('crypto');

function normalizeReconnectToken(value) {
  return String(value || '').trim().slice(0, 128);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function reconnectTokenMatches(player, token) {
  const normalized = normalizeReconnectToken(token);
  if (!normalized || !player) return false;
  return safeEqual(player.reconnectToken, normalized) || safeEqual(player.takeoverFromReconnectToken, normalized);
}

function authenticatedUserMatches(player, userId) {
  const normalized = String(userId || '').trim();
  return Boolean(normalized && player && String(player.userId || '') === normalized);
}

function canResumeSeat(player, { userId = '', reconnectToken = '' } = {}) {
  if (!player || player.isBot) return false;
  return authenticatedUserMatches(player, userId) || reconnectTokenMatches(player, reconnectToken);
}

function canResumeTakeoverSeat(player, { userId = '', reconnectToken = '' } = {}) {
  if (!player || !player.isBot || !player.takeoverFromName) return false;
  return authenticatedUserMatches(player, userId) || reconnectTokenMatches(player, reconnectToken);
}

function createRejoinGrant(roomId, reconnectToken, { now = Date.now(), ttlMs = 30 * 60 * 1000 } = {}) {
  const token = normalizeReconnectToken(reconnectToken);
  if (!roomId || !token) return null;
  return { roomId: String(roomId), reconnectToken: token, expiresAt: now + ttlMs };
}

function rejoinGrantTokenFor(grant, roomId, now = Date.now()) {
  if (!grant || grant.roomId !== String(roomId || '') || Number(grant.expiresAt || 0) <= now) return '';
  return normalizeReconnectToken(grant.reconnectToken);
}

module.exports = {
  authenticatedUserMatches,
  canResumeSeat,
  canResumeTakeoverSeat,
  createRejoinGrant,
  normalizeReconnectToken,
  rejoinGrantTokenFor,
  reconnectTokenMatches
};
