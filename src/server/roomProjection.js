'use strict';

function publicSeatId(index) {
  return Number.isInteger(index) && index >= 0 ? `seat-${index}` : '';
}

function publicHostId(room) {
  const hostIndex = (room?.players || []).findIndex(player => player.id === room.hostId);
  return publicSeatId(hostIndex);
}

function publicPlayerFor(player, index, viewerIndex, passSelections = []) {
  return {
    id: publicSeatId(index),
    authenticated: Boolean(player.userId),
    name: player.name,
    avatar: player.avatar,
    isBot: player.isBot,
    aiControlled: Boolean(player.isBot && player.takeoverFromName),
    connected: player.connected,
    leftRoom: Boolean(player.leftRoom),
    hand: index === viewerIndex ? player.hand : [],
    handCount: player.hand.length,
    round: player.round,
    total: player.total,
    passed: Boolean(passSelections[index])
  };
}

module.exports = { publicHostId, publicPlayerFor, publicSeatId };
