export const LOG_FILTERS = ['全部', '出牌', '收墩', '传牌', '房间'];

export function classifyLogText(text) {
  const value = String(text || '');
  if (value.includes(' 出 ')) return '出牌';
  if (value.includes('收墩') || value.includes('收下本墩')) return '收墩';
  if (value.includes('传牌')) return '传牌';
  if (value.includes('发牌')) return '发牌';
  if (['加入', '创建', '连接', '退出', '断开', '房间'].some(keyword => value.includes(keyword))) return '房间';
  if (value.includes('打满贯') || value.includes('游戏结束') || value.includes('局结束')) return '结算';
  if (value.includes('AI')) return 'AI';
  return '记录';
}

export function logTypeClass(type) {
  return {
    出牌: 'log-play',
    收墩: 'log-trick',
    传牌: 'log-pass',
    发牌: 'log-deal',
    房间: 'log-room',
    结算: 'log-score',
    AI: 'log-ai'
  }[type] || 'log-note';
}

export function simplifyLogText(text) {
  return String(text || '')
    .replace(/^第\s*(\d+)\s*局发牌：/, '第$1局 · 发牌：')
    .replace(/^第\s*(\d+)\s*墩：/, '第$1墩 · ')
    .replace(/收下本墩/g, '收墩')
    .replace(/。$/g, '');
}

export function buildLogEntries(log, filter = '全部') {
  const source = Array.isArray(log) ? log : [];
  return source
    .map((item, index) => {
      const type = classifyLogText(item?.text);
      return {
        ...item,
        index,
        order: source.length - index,
        type,
        typeClass: logTypeClass(type),
        displayText: simplifyLogText(item?.text)
      };
    })
    .filter(item => filter === '全部' || item.type === filter);
}

export function summarizeLogEntries(entries, total, filter = '全部') {
  if (!entries.length) return total ? `没有“${filter}”类型的记录。` : '暂无出牌记录。';
  const typeCounts = entries.reduce((counts, item) => {
    counts[item.type] = Number(counts[item.type] || 0) + 1;
    return counts;
  }, {});
  const typeSummary = Object.entries(typeCounts).map(([type, count]) => `${type} ${count}`).join(' · ');
  return `${filter === '全部' ? '全部记录' : filter} ${entries.length} 条 · ${typeSummary}`;
}
