<script setup>
import { computed } from 'vue';

const props = defineProps({ game: { type: Object, required: true } });
defineEmits(['open-room', 'open-result', 'start-next-round']);

const currentPlayerName = computed(() => props.game.viewPlayers[props.game.currentViewPlayer]?.name || '牌友');
const isYourTurn = computed(() => props.game.phase === 'play' && props.game.currentViewPlayer === 0);
const declaredNames = { S12: '猪', D11: '羊', H14: '红', C10: '变' };
const statusText = computed(() => {
  if (props.game.phase === 'declare') return '秘密亮牌中，四人提交后同时公开。';
  if (props.game.phase === 'play') return isYourTurn.value ? '轮到你出牌。' : `轮到 ${currentPlayerName.value} 出牌。`;
  if (props.game.phase === 'roundEnd') return props.game.overtime ? '最高分并列，下一副进入加赛。' : '本副结算完成。';
  if (props.game.phase === 'gameEnd') return '整场结束，点击查看成绩。';
  if (props.game.phase === 'lobby') return '等待牌友加入。';
  return '准备开始。';
});
</script>

<template>
  <section class="table-status-panel" :class="[{ 'your-turn': isYourTurn, 'round-ended': game.phase === 'roundEnd' }, `phase-${game.phase}`]">
    <div v-if="game.phase === 'play' || game.phase === 'roundEnd'" class="center-turn-arc-vue" :class="`turn-player-${game.phase === 'roundEnd' ? 0 : game.currentViewPlayer}`" aria-hidden="true">
      <svg viewBox="0 0 420 420"><circle v-if="isYourTurn" class="self-wave-ring wave-one" cx="210" cy="210" r="170" /><circle v-if="isYourTurn" class="self-wave-ring wave-two" cx="210" cy="210" r="170" /><path class="fan-fill" d="M210 210 L114.8 341.1 A162 162 0 0 0 305.2 341.1 Z" /><path class="fan-arc" d="M114.8 341.1 A162 162 0 0 0 305.2 341.1" /></svg>
    </div>
    <strong>第{{ game.roundNo || 0 }}副</strong>
    <span>{{ statusText }}</span>
    <div v-if="game.declarations.length" class="gongzhu-declaration-chips">
      <span v-for="item in game.declarations" :key="`${item.player}-${item.cardId}`">{{ game.players[item.player]?.name }} 亮{{ declaredNames[item.cardId] }}</span>
    </div>
    <span class="table-status-meta">{{ game.ruleSet }}{{ game.roomId ? ` · 房间 ${game.roomId}` : '' }}</span>
    <div class="center-actions">
      <button v-if="['offline', 'lobby'].includes(game.phase)" class="primary-button center-room-button" type="button" @click="$emit('open-room')">房间</button>
      <button v-if="game.phase === 'roundEnd'" class="primary-button" type="button" @click="$emit('start-next-round')">{{ game.overtime ? '开始加赛' : '开始下一副' }}</button>
      <button v-if="game.phase === 'gameEnd'" class="primary-button" type="button" @click="$emit('open-result')">成绩</button>
    </div>
  </section>
</template>
