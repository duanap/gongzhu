'use strict';

function aiInteractionRouting(kind, senderIndex, targetIndex) {
  const broadcastOnly = String(kind || 'emoji') === 'emoji';
  return {
    broadcastOnly,
    toIndex: broadcastOnly ? senderIndex : targetIndex
  };
}

module.exports = {
  aiInteractionRouting
};
