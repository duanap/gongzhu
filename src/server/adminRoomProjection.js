'use strict';

function adminPlayerFor(player, index, { includeSensitive = false } = {}) {
  const projected = {
    seatIndex: index,
    userId: player.userId || '',
    name: player.name || 'Player',
    avatar: player.avatar || '',
    isBot: Boolean(player.isBot),
    aiControlled: Boolean(player.isBot && player.takeoverFromName),
    connected: Boolean(player.connected),
    leftRoom: Boolean(player.leftRoom),
    handCount: player.hand?.length || 0,
    roundScore: Number(player.round || 0),
    totalScore: Number(player.total || 0),
    disconnectedAt: player.disconnectedAt || null,
    takeoverAt: player.takeoverAt || null
  };
  if (includeSensitive) {
    projected.guestId = player.guestId || '';
    projected.hand = (player.hand || []).map(card => ({ id: card.id, suit: card.suit, rank: card.rank }));
  }
  return projected;
}

function adminRoomFor(room, options = {}) {
  if (!room) return null;
  return {
    roomId: room.id,
    phase: room.phase,
    roundNo: Number(room.roundNo || 0),
    trickNo: Number(room.trickNo || 0),
    playerCount: room.players?.length || 0,
    humanCount: (room.players || []).filter(player => !player.isBot).length,
    connectedHumanCount: (room.players || []).filter(player => !player.isBot && player.connected).length,
    botCount: (room.players || []).filter(player => player.isBot).length,
    busy: Boolean(room.busy),
    createdAt: room.createdAt ? new Date(room.createdAt).toISOString() : '',
    updatedAt: room.updatedAt ? new Date(room.updatedAt).toISOString() : '',
    emptySince: room.emptySince ? new Date(room.emptySince).toISOString() : '',
    players: (room.players || []).map((player, index) => adminPlayerFor(player, index, options))
  };
}

module.exports = { adminPlayerFor, adminRoomFor };
