'use strict';

const assert = require('assert');
const { aiInteractionRouting } = require('./interactionRules');

assert.deepStrictEqual(aiInteractionRouting('emoji', 1, 3), {
  broadcastOnly: true,
  toIndex: 1
});

for (const kind of ['flower', 'tomato', 'like', 'applause', 'brick', 'slipper', 'cabbage', 'doge']) {
  assert.deepStrictEqual(aiInteractionRouting(kind, 1, 3), {
    broadcastOnly: false,
    toIndex: 3
  });
}

console.log('AI interaction routing tests passed');
