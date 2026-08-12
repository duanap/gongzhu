import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLogEntries,
  classifyLogText,
  simplifyLogText,
  summarizeLogEntries
} from './logEntries.mjs';

test('日志文本沿用旧版分类规则', () => {
  assert.equal(classifyLogText('赵云 出 红桃A。'), '出牌');
  assert.equal(classifyLogText('第 3 墩：小乔收墩。'), '收墩');
  assert.equal(classifyLogText('传牌完成：向左传牌。'), '传牌');
  assert.equal(classifyLogText('玩家创建了房间。'), '房间');
  assert.equal(classifyLogText('第 2 局发牌：向右传牌。'), '传牌');
  assert.equal(classifyLogText('游戏结束：赵云获胜。'), '结算');
});

test('日志筛选保留服务端倒序与显示序号', () => {
  const log = [
    { round: 2, text: '赵云 出 红桃A。' },
    { round: 2, text: '第 3 墩：赵云收墩。' },
    { round: 1, text: '小乔 创建了房间。' }
  ];
  const plays = buildLogEntries(log, '出牌');
  assert.deepEqual(plays.map(item => ({ round: item.round, order: item.order, type: item.type })), [
    { round: 2, order: 3, type: '出牌' }
  ]);
  assert.equal(summarizeLogEntries(plays, log.length, '出牌'), '出牌 1 条 · 出牌 1');
});

test('日志显示文本压缩局数、墩数和句号', () => {
  assert.equal(simplifyLogText('第 4 局发牌：不传牌。'), '第4局 · 发牌：不传牌');
  assert.equal(simplifyLogText('第 7 墩：赵云收下本墩。'), '第7墩 · 赵云收墩');
});
