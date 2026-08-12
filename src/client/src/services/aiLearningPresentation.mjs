export const AI_WEIGHT_ENTRIES = Object.freeze([
  ['queenDanger', '黑桃 Q 风险'],
  ['heartDanger', '红桃风险'],
  ['highRankDanger', '高牌风险'],
  ['moonAggression', '射月进攻'],
  ['moonDefense', '防射月'],
  ['voidSuitPass', '短门传牌']
]);

export const AI_EVENT_LABELS = Object.freeze({
  pass: '传牌',
  trick: '收墩',
  'round-result': '局末',
  'moon-suspect': '疑似射月',
  'moon-block': '防射月'
});

export const SUIT_LABELS = Object.freeze({
  C: '梅花',
  D: '方块',
  S: '黑桃',
  H: '红桃'
});

export function formatLearningNumber(value, digits = 1) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

export function weightTrend(value) {
  const normalized = Number(value || 1);
  if (normalized > 1.04) return '偏高';
  if (normalized < 0.96) return '偏低';
  return '基准';
}

export function learningWeightRows(weights = {}) {
  return AI_WEIGHT_ENTRIES.map(([key, label]) => {
    const value = Number(weights[key] || 1);
    return { key, label, value, trend: weightTrend(value) };
  });
}

export function learningEventDistribution(eventCounts = {}) {
  return Object.entries(eventCounts)
    .map(([type, count]) => `${AI_EVENT_LABELS[type] || type} ${Number(count || 0)}`)
    .join(' / ') || '暂无';
}

export function learningEventLabel(type) {
  return AI_EVENT_LABELS[type] || type || '事件';
}

export function learningEventMeta(event = {}) {
  const pieces = [`第 ${Number(event.roundNo || 0)} 局`];
  if (event.trickNo) pieces.push(`第 ${Number(event.trickNo) + 1} 墩`);
  if (event.player) pieces.push(String(event.player));
  return pieces.join(' · ');
}
