<script setup>
import Card from './Card.vue';
defineProps({
  trick: { type: Array, default: () => [] },
  players: { type: Array, default: () => [] }
});
</script>

<template>
  <section class="trick-panel">
    <header><strong>本墩出牌</strong><span>{{ trick.length }}/4</span></header>
    <div v-if="trick.length" class="trick-cards">
      <div v-for="play in trick" :key="`${play.player}-${play.card?.id}`" class="trick-play" :class="`trick-player-${play.player}`">
        <Card v-if="play.card" :card="play.card" compact />
        <span>{{ players[play.player]?.name || `玩家 ${play.player + 1}` }}</span>
      </div>
    </div>
    <p v-else>桌面暂无出牌。</p>
  </section>
</template>
