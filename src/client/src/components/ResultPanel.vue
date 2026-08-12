<script setup>
import { computed } from 'vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  open: {
    type: Boolean,
    default: true
  }
});

defineEmits(['close', 'restart-game', 'open-round-table', 'open-versions']);

const visible = computed(() => props.open && props.game.phase === 'gameEnd');
const canOpenRoundTable = computed(() => Boolean(props.game.roundTableView?.players?.length));
const rankedPlayers = computed(() => (
  [...(props.game.viewPlayers || [])]
    .map((player, index) => ({
      ...player,
      viewIndex: index,
      label: player.name || (index === 0 ? '你' : `玩家 ${index + 1}`),
      total: Number(player.total || 0),
      round: Number(player.round || 0)
    }))
    .sort((a, b) => a.total - b.total || a.round - b.round)
));
const winnerScore = computed(() => rankedPlayers.value[0]?.total ?? 0);
const winnerNames = computed(() => rankedPlayers.value
  .filter(player => player.total === winnerScore.value)
  .map(player => player.label)
  .join('、'));

function playerType(player) {
  if (player.isBot || player.aiControlled || player.takeoverFromName) return 'AI 玩家';
  return player.viewIndex === 0 ? '你' : '真人玩家';
}
</script>

<template>
  <div v-if="visible" class="result-modal-layer" role="dialog" aria-modal="true" aria-label="游戏成绩">
    <button class="result-modal-mask" type="button" aria-label="关闭成绩" @click="$emit('close')" />
    <section class="result-panel result-card">
      <button class="result-modal-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      <header>
        <div>
          <strong>{{ winnerNames }} 获胜！</strong>
          <span>本局战绩已结算，低分玩家获胜。</span>
        </div>
      </header>

      <div class="result-list result-score-board">
        <article
          v-for="(player, rank) in rankedPlayers"
          :key="player.id || rank"
          class="result-row result-player-card"
          :class="{ winner: player.total === winnerScore, 'is-winner': player.total === winnerScore, active: player.viewIndex === 0 }"
        >
          <div class="result-rank-medal">{{ rank === 0 ? '🏆' : rank + 1 }}</div>
          <div class="result-player-main">
            <span class="result-player-name">{{ player.label }}</span>
            <small class="result-player-sub">{{ player.avatar || 'P' }} · {{ playerType(player) }}</small>
          </div>
          <div class="result-score-group">
            <div class="result-score-pill">
              <span>本局</span>
              <strong>{{ player.round }}</strong>
            </div>
            <div class="result-score-pill total">
              <span>总分</span>
              <strong>{{ player.total }}</strong>
            </div>
          </div>
          <div class="result-badge-wrap">
            <span v-if="player.total === winnerScore" class="result-badge">胜利</span>
            <span v-else class="result-keep-going">继续加油</span>
          </div>
        </article>
      </div>

      <div class="result-actions modal-actions">
        <button
          v-if="game.isHost"
          class="primary-button"
          type="button"
          @click="$emit('restart-game')"
        >
          再来一局
        </button>
        <button
          class="text-button"
          type="button"
          @click="$emit('open-versions')"
        >
          查看更新内容
        </button>
        <button
          v-if="canOpenRoundTable"
          class="text-button"
          type="button"
          @click="$emit('open-round-table')"
        >
          查看牌桌
        </button>
      </div>
    </section>
  </div>
</template>
