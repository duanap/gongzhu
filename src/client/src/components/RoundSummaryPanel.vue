<script setup>
defineProps({ game: { type: Object, required: true } });
</script>

<template>
  <section class="gongzhu-round-panel">
    <header><div><strong>本副结算</strong><span>{{ game.overtime ? '最高分并列，进入加赛' : '原始分累计入总分' }}</span></div></header>
    <div class="gongzhu-round-list">
      <article v-for="(player, index) in game.viewPlayers" :key="player.id || index" :class="{ self: index === 0 }">
        <div><strong>{{ index === 0 ? '你' : player.name }}</strong><small v-if="player.scoreBreakdown">红 {{ player.scoreBreakdown.components.hearts }} · 猪 {{ player.scoreBreakdown.components.pig }} · 羊 {{ player.scoreBreakdown.components.sheep }} · ×{{ player.scoreBreakdown.components.transformer }}</small></div>
        <span>{{ player.round >= 0 ? '+' : '' }}{{ player.round }}</span>
        <b>{{ player.total }}</b>
      </article>
    </div>
  </section>
</template>
