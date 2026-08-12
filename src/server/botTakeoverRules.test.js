'use strict';

const assert = require('assert');
const { resolvePureBotTakeoverTarget } = require('./botTakeoverRules');

function human(name) {
  return { id: `human-${name}`, name, isBot: false };
}

function pureBot(name, id = name) {
  return { id: `bot-${id}`, name, isBot: true };
}

function takeoverBot(name) {
  return { id: `bot-${name}`, name, isBot: true, takeoverFromName: name };
}

const players = [
  human('duanap'),
  pureBot('赵子龙', 'zhao'),
  pureBot('司马懿', 'sima'),
  pureBot('周瑜', 'zhou')
];

assert.strictEqual(
  resolvePureBotTakeoverTarget(players, { nickname: '司马懿' }).targetIndex,
  2,
  'nickname matching a pure AI name should target that AI instead of the first pure AI'
);

assert.strictEqual(
  resolvePureBotTakeoverTarget(players, { requestedIndex: 3, nickname: '司马懿' }).targetIndex,
  3,
  'explicit target index should win over nickname inference'
);

assert.strictEqual(
  resolvePureBotTakeoverTarget(players, { requestedName: '周瑜' }).targetIndex,
  3,
  'explicit target name should select the matching pure AI'
);

assert.deepStrictEqual(
  resolvePureBotTakeoverTarget(players, { requestedIndex: 0 }),
  {
    targetIndex: null,
    targetPlayer: null,
    targets: [1, 2, 3],
    reason: 'invalidRequestedIndex'
  },
  'explicit target index that is not a pure AI must not fall back to another AI'
);

assert.deepStrictEqual(
  resolvePureBotTakeoverTarget(players, { requestedName: '不存在' }),
  {
    targetIndex: null,
    targetPlayer: null,
    targets: [1, 2, 3],
    reason: 'invalidRequestedName'
  },
  'explicit target name that is not a pure AI must not fall back to another AI'
);

assert.strictEqual(
  resolvePureBotTakeoverTarget(players, { previousTargetIndex: 2 }).targetIndex,
  2,
  'an existing request should keep its previous target when no stronger target is supplied'
);

assert.strictEqual(
  resolvePureBotTakeoverTarget(players, { nickname: '新玩家' }).targetIndex,
  1,
  'requests without a target hint should still fall back to the first pure AI'
);

assert.deepStrictEqual(
  resolvePureBotTakeoverTarget([human('duanap'), takeoverBot('离线玩家')], { nickname: '离线玩家' }),
  {
    targetIndex: null,
    targetPlayer: null,
    targets: [],
    reason: 'noPureBot'
  },
  'AI that is already standing in for an offline human is not a pure AI target'
);

console.log('Bot takeover rule tests passed');
