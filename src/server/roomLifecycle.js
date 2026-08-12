'use strict';

function roomExpiryReason({ now = Date.now(), emptySince = 0, updatedAt = 0, emptyTtlMs, idleTtlMs } = {}) {
  if (emptySince && now - emptySince >= Number(emptyTtlMs || 0)) return 'empty';
  if (updatedAt && now - updatedAt >= Number(idleTtlMs || 0)) return 'idle';
  return '';
}

module.exports = { roomExpiryReason };
