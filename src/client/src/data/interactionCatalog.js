export const INTERACTION_EMOJIS = [
  { kind: 'emoji', icon: '👍', label: '干得漂亮', cooldown: 1000 },
  { kind: 'emoji', icon: '😂', label: '哈哈哈', cooldown: 1000 },
  { kind: 'emoji', icon: '⚡', label: '搞快点！搞快点！', cooldown: 1000 },
  { kind: 'emoji', icon: '🛸', label: '小飞棍来喽~', cooldown: 1000 },
  { kind: 'emoji', icon: '🚨', label: '拦住他', cooldown: 1000 },
  { kind: 'emoji', icon: '🌕', label: '我要冲月亮', cooldown: 1000 },
  { kind: 'emoji', icon: '😭', label: '家人们，谁懂啊', cooldown: 1000 },
  { kind: 'emoji', icon: '🔍', label: '我要验牌', cooldown: 1000 },
  { kind: 'emoji', icon: '✅', label: '牌没有问题', cooldown: 1000 },
  { kind: 'emoji', icon: '😏', label: '小瘪三', cooldown: 1000 },
  { kind: 'emoji', icon: '🧸', label: '小儿科', cooldown: 1000 },
  { kind: 'emoji', icon: '👞', label: '给我擦皮鞋', cooldown: 1000 }
];

export const INTERACTION_TOOLS = [
  { kind: 'applause', icon: '👏', label: '鼓掌', cooldown: 2200, className: 'tool-applause' },
  { kind: 'flower', icon: '🌹', label: '送花', cooldown: 1800, className: 'tool-flower' },
  { kind: 'tomato', icon: '🍅', label: '扔番茄', shortLabel: '番茄', cooldown: 1800, className: 'tool-tomato' },
  { kind: 'like', icon: '💙', label: '点赞', cooldown: 1000, className: 'tool-like' },
  { kind: 'brick', icon: '🧱', label: '板砖', cooldown: 2200, className: 'tool-brick' },
  { kind: 'slipper', icon: '🩴', label: '拖鞋', cooldown: 2200, className: 'tool-slipper' },
  { kind: 'cabbage', icon: '🥬', label: '大白菜', cooldown: 1800, className: 'tool-cabbage' },
  { kind: 'doge', icon: '🐶', label: '狗头', cooldown: 1000, className: 'tool-doge' }
];

export const SPECIAL_EVENT_SAMPLES = [
  { type: 'heartsBroken', level: 'minor', title: '红桃已破', subtitle: '刘备打出第一张红桃，现在可以主动出红桃了。', playerIndex: 0 },
  { type: 'twoPointCapture', level: 'highlight', title: '二点吃分', subtitle: '诸葛亮用梅花 2 收下 5 分。', playerIndex: 2 },
  { type: 'queenCaptured', level: 'highlight', title: '黑桃女王入袋', subtitle: '曹操吃下黑桃 Q，+13 分。', playerIndex: 1 },
  { type: 'lastQueenSelf', level: 'epic', title: '压轴自吃', subtitle: '孙权最后一墩打出黑桃 Q，却自己收回。', playerIndex: 3 },
  { type: 'lastQueenThrow', level: 'epic', title: '压轴甩锅', subtitle: '张辽最后一墩甩出黑桃 Q，关羽接锅。', playerIndex: 0 },
  { type: 'disasterTrick', level: 'epic', title: '大祸临头', subtitle: '司马懿一墩收下 15 分：2 张红桃 + 黑桃 Q。', playerIndex: 1 },
  { type: 'zeroRound', level: 'highlight', title: '零分过关', subtitle: '赵云、小乔本局完美避分。', playerIndex: 2 },
  { type: 'nearMoon', level: 'epic', title: '差点射月', subtitle: '周瑜本局吃到 25 分，只差一步。', playerIndex: 3 },
  { type: 'heartCollector', level: 'epic', title: '红桃收集者', subtitle: '吕蒙收下 10 张红桃。', playerIndex: 1 },
  { type: 'shootMoon', level: 'legendary', title: '射中月亮', subtitle: '貂蝉独揽 26 分，全场改命！', playerIndex: 0 }
];

export const SPECIAL_LEVEL_NAMES = {
  minor: '小事件',
  highlight: '高光',
  epic: '名场面',
  legendary: '封神'
};
