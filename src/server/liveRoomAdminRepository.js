'use strict';

const { adminRoomFor } = require('./adminRoomProjection');
const { decodeCursor, encodeCursor } = require('./userAdminRepository');

function createLiveRoomAdminRepository(options = {}) {
  const rooms = options.rooms;
  const closeRoom = options.closeRoom;
  if (!(rooms instanceof Map) || typeof closeRoom !== 'function') {
    throw new Error('rooms Map and closeRoom are required');
  }

  function sortedRooms() {
    return Array.from(rooms.values()).sort((left, right) =>
      Number(right.updatedAt || right.createdAt || 0) - Number(left.updatedAt || left.createdAt || 0)
    );
  }

  function counts() {
    const rows = sortedRooms();
    return {
      liveRooms: rows.length,
      livePlayers: rows.reduce((total, room) => total + (room.players?.length || 0), 0),
      connectedHumans: rows.reduce((total, room) => total + (room.players || []).filter(player => !player.isBot && player.connected).length, 0)
    };
  }

  function list(filters = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    const status = String(filters.status || '').trim();
    const requestedLimit = Number(filters.limit || 20);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 20;
    const offset = decodeCursor(filters.cursor);
    const filtered = sortedRooms()
      .filter(room => !status || room.phase === status)
      .filter(room => !query || room.id.toLowerCase().includes(query) || (room.players || []).some(player =>
        [player.name, player.userId].some(value => String(value || '').toLowerCase().includes(query))
      ));
    const rows = filtered.slice(offset, offset + limit).map(room => adminRoomFor(room));
    return {
      rows,
      page: {
        limit,
        total: filtered.length,
        nextCursor: offset + rows.length < filtered.length ? encodeCursor(offset + rows.length) : ''
      }
    };
  }

  function get(roomId, projectionOptions = {}) {
    return adminRoomFor(rooms.get(String(roomId || '')), projectionOptions);
  }

  function disband(roomId, reason) {
    const room = rooms.get(String(roomId || ''));
    if (!room) return false;
    closeRoom(room, reason);
    return true;
  }

  return { counts, disband, get, list };
}

module.exports = { createLiveRoomAdminRepository };
