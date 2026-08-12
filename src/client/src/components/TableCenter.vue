<script setup>
import { computed } from 'vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

defineEmits(['start-next-round', 'open-result', 'open-round-table', 'open-room']);

const currentPlayerName = computed(() => props.game.viewPlayers[props.game.currentViewPlayer]?.name || '等待中');
const canOpenRoom = computed(() => Boolean(props.game.connected && ['offline', 'lobby'].includes(props.game.phase)));
const isYourTurn = computed(() => props.game.phase === 'play' && props.game.currentViewPlayer === 0 && !props.game.busy);
const sweepWinnerName = computed(() => props.game.viewPlayers[props.game.sweepCollect?.winnerViewPlayer]?.name || '玩家');
const sweepCardCount = computed(() => props.game.sweepCollect?.totalCards || props.game.sweepCollect?.cardCount || 0);
const statusText = computed(() => {
  if (props.game.phase === 'pass') return props.game.youPassed ? '已传牌，等待其他玩家。' : '请选择3张牌传出。';
  if (props.game.phase === 'deal') return '正在发牌...';
  if (props.game.sweepCollect && props.game.collectingTrick) {
    return `${sweepWinnerName.value} 甩牌收墩，${sweepCardCount.value} 张一起收走。`;
  }
  if (props.game.collectingTrick) return '正在收墩...';
  if (props.game.sweepCollect) {
    return `${sweepWinnerName.value} 正在甩牌，准备收下 ${sweepCardCount.value} 张牌。`;
  }
  if (props.game.comparingTrick) return '正在比牌...';
  if (isYourTurn.value) return `轮到你出牌。红桃${props.game.heartsBroken ? '已破' : '尚未破'}。`;
  if (props.game.phase === 'play') return `轮到${currentPlayerName.value}出牌。红桃${props.game.heartsBroken ? '已破' : '尚未破'}。`;
  if (props.game.phase === 'roundEnd') return '本局结束，点击开始下一局继续。';
  if (props.game.phase === 'gameEnd') return '游戏结束，点击查看成绩。';
  if (props.game.phase === 'lobby') return '等待房间开始。';
  if (props.game.phase === 'offline') return '准备开始。';
  return props.game.phase;
});

function phaseName(phase) {
  return {
    offline: '离线',
    lobby: '房间',
    deal: '发牌',
    pass: '传牌',
    play: '出牌',
    roundEnd: '本局结束',
    gameEnd: '游戏结束'
  }[phase] || phase;
}
</script>

<template>
  <section class="table-status-panel" :class="[{ 'your-turn': isYourTurn, 'round-ended': game.phase === 'roundEnd' }, `phase-${game.phase}`]">
    <div v-if="game.phase === 'play' || game.phase === 'roundEnd'" class="center-turn-arc-vue" :class="`turn-player-${game.phase === 'roundEnd' ? 0 : game.currentViewPlayer}`" aria-hidden="true">
      <svg viewBox="0 0 420 420">
        <circle v-if="isYourTurn" class="self-wave-ring wave-one" cx="210" cy="210" r="170" />
        <circle v-if="isYourTurn" class="self-wave-ring wave-two" cx="210" cy="210" r="170" />
        <path class="fan-fill" d="M210 210 L114.8 341.1 A162 162 0 0 0 305.2 341.1 Z" />
        <path class="fan-arc" d="M114.8 341.1 A162 162 0 0 0 305.2 341.1" />
      </svg>
    </div>
    <strong>第{{ game.roundNo }}局</strong>
    <span>{{ statusText }}</span>
    <span class="table-status-meta">{{ phaseName(game.phase) }}{{ game.roomId ? ` · 房间 ${game.roomId}` : '' }}</span>
    <span v-if="game.sweepCollect" class="table-status-meta">甩牌：{{ sweepCardCount }} 张 · {{ game.sweepCollect.points || 0 }} 分</span>
    <span v-if="game.phase === 'play'" class="table-status-meta">红桃：{{ game.heartsBroken ? '已破' : '未破' }}</span>
    <span v-if="game.phase === 'pass'" class="table-status-meta">{{ game.passName || '传牌' }}</span>

    <div class="center-actions">
      <button
        v-if="canOpenRoom"
        class="primary-button center-room-button"
        type="button"
        @click="$emit('open-room')"
      >
        房间
      </button>
      <button
        v-if="game.phase === 'roundEnd'"
        class="primary-button"
        type="button"
        @click="$emit('start-next-round')"
      >
        开始下一局
      </button>
      <button
        v-if="game.phase === 'gameEnd'"
        class="primary-button"
        type="button"
        @click="$emit('open-result')"
      >
        成绩
      </button>
      <button
        v-if="game.phase === 'roundEnd' && game.roundTableView?.players?.length"
        class="text-button"
        type="button"
        @click="$emit('open-round-table')"
      >
        查看牌桌
      </button>
    </div>
  </section>
</template>
