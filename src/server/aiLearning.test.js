const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateFile = path.join(os.tmpdir(), `hearts-ai-learning-test-${process.pid}.json`);
process.env.AI_LEARNING_STATE_FILE = stateFile;
const aiLearning = require('./aiLearning');

const room = {
  id: '1234',
  roundNo: 1,
  players: [{ name: '测试玩家', isBot: false }]
};

try {
  aiLearning.recordPass({
    room,
    playerIndex: 0,
    cards: [{ id: 'H2', suit: 'H', rank: 2 }],
    handBefore: [{ id: 'H2', suit: 'H', rank: 2 }]
  });
  assert.equal(aiLearning.getSummary().totalSamples, 1);

  const summary = aiLearning.resetForTesting();
  assert.equal(summary.totalSamples, 0);
  assert.equal(summary.samplesSinceTune, 0);
  assert.deepEqual(summary.eventCounts, {});
  assert.deepEqual(summary.opponents, []);
  assert.deepEqual(summary.weights, {
    queenDanger: 1,
    heartDanger: 1,
    highRankDanger: 1,
    moonAggression: 1,
    moonDefense: 1,
    voidSuitPass: 1
  });
  console.log('AI learning reset tests passed');
} finally {
  fs.rmSync(stateFile, { force: true });
}
