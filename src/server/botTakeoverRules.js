'use strict';

function normalizeName(value) {
  return String(value || '').trim();
}

function pureBotSeatIndexes(players) {
  return (Array.isArray(players) ? players : [])
    .map((player, index) => ({ player, index }))
    .filter(item => item.player?.isBot && !item.player.takeoverFromName)
    .map(item => item.index);
}

function coerceIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const index = Number(value);
  return Number.isInteger(index) ? index : null;
}

function findPureBotByName(players, targets, name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const index = targets.find(targetIndex => normalizeName(players[targetIndex]?.name) === normalized);
  return Number.isInteger(index) ? index : null;
}

function targetResult(players, targets, targetIndex, reason) {
  return {
    targetIndex,
    targetPlayer: Number.isInteger(targetIndex) ? players[targetIndex] : null,
    targets,
    reason
  };
}

function resolvePureBotTakeoverTarget(players, options = {}) {
  const playerList = Array.isArray(players) ? players : [];
  const targets = pureBotSeatIndexes(playerList);
  if (!targets.length) return targetResult(playerList, targets, null, 'noPureBot');

  const requestedIndex = coerceIndex(options.requestedIndex);
  if (requestedIndex !== null) {
    return targets.includes(requestedIndex)
      ? targetResult(playerList, targets, requestedIndex, 'requestedIndex')
      : targetResult(playerList, targets, null, 'invalidRequestedIndex');
  }

  const requestedName = normalizeName(options.requestedName);
  if (requestedName) {
    const namedIndex = findPureBotByName(playerList, targets, requestedName);
    return Number.isInteger(namedIndex)
      ? targetResult(playerList, targets, namedIndex, 'requestedName')
      : targetResult(playerList, targets, null, 'invalidRequestedName');
  }

  const nicknameIndex = findPureBotByName(playerList, targets, options.nickname);
  if (Number.isInteger(nicknameIndex)) return targetResult(playerList, targets, nicknameIndex, 'nicknameMatch');

  const previousIndex = coerceIndex(options.previousTargetIndex);
  if (previousIndex !== null && targets.includes(previousIndex)) {
    return targetResult(playerList, targets, previousIndex, 'previousTargetIndex');
  }

  return targetResult(playerList, targets, targets[0], 'firstPureBot');
}

module.exports = {
  pureBotSeatIndexes,
  resolvePureBotTakeoverTarget
};
