<script setup>
defineProps({ game: { type: Object, required: true } });
</script>

<template>
  <section class="info-panel">
    <header><strong>比分</strong><span>{{ game.gameOver ? '游戏结束' : `第 ${game.roundNo || 0} 副` }}</span></header>
    <div class="score-list">
      <div v-for="(player, index) in game.viewPlayers" :key="player.id || index" class="score-row" :class="{ active: index === 0 }">
        <span>{{ index === 0 ? '你' : player.name || '等待中' }}</span>
        <small>本副 {{ player.round || 0 }} · 总分 {{ player.total || 0 }}</small>
      </div>
    </div>
  </section>
</template>
