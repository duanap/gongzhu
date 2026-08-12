import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatLearningNumber,
  learningEventDistribution,
  learningEventLabel,
  learningEventMeta,
  learningWeightRows,
  SUIT_LABELS
} from './aiLearningPresentation.mjs';

test('AI learning presentation keeps all legacy weights and trends', () => {
  const rows = learningWeightRows({ queenDanger: 1.08, heartDanger: 0.92 });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.slice(0, 2), [
    { key: 'queenDanger', label: '黑桃 Q 风险', value: 1.08, trend: '偏高' },
    { key: 'heartDanger', label: '红桃风险', value: 0.92, trend: '偏低' }
  ]);
  assert.equal(rows[2].trend, '基准');
});

test('AI learning presentation localizes legacy events and metadata', () => {
  assert.equal(learningEventDistribution({ pass: 2, trick: 3 }), '传牌 2 / 收墩 3');
  assert.equal(learningEventDistribution({}), '暂无');
  assert.equal(learningEventLabel('moon-block'), '防射月');
  assert.equal(learningEventMeta({ roundNo: 2, trickNo: 3, player: '魏延' }), '第 2 局 · 第 4 墩 · 魏延');
  assert.equal(formatLearningNumber(2.345), '2.3');
  assert.equal(SUIT_LABELS.S, '黑桃');
});
