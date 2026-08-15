<script setup>
import Card from './Card.vue';
defineProps({
  trick: { type: Array, default: () => [] },
  players: { type: Array, default: () => [] },
  settling: Boolean,
  winnerPlayer: { type: Number, default: -1 }
});
</script>

<template>
  <section class="trick-panel" :class="{ judging: settling }">
    <header><strong>本墩出牌</strong><span>{{ trick.length }}/4</span></header>
    <div v-if="trick.length" class="trick-cards">
      <div v-for="play in trick" :key="`${play.player}-${play.card?.id}`" class="trick-play" :class="[`trick-player-${play.player}`, { winner: settling && play.player === winnerPlayer }]">
        <Card v-if="play.card" :card="play.card" compact />
        <span>{{ players[play.player]?.name || `玩家 ${play.player + 1}` }}</span>
      </div>
    </div>
    <p v-else>桌面暂无出牌。</p>
    <div v-if="settling" class="judge-bubble" role="status">{{ players[winnerPlayer]?.name || '本墩赢家' }} 收下本墩</div>
  </section>
</template>
