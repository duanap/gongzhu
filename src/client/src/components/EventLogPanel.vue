<script setup>
defineProps({ game: { type: Object, required: true } });
</script>

<template>
  <section class="gongzhu-log-panel">
    <article v-for="entry in [...game.log].reverse()" :key="entry.id">
      <time>{{ new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</time>
      <span>{{ entry.text }}</span>
    </article>
    <p v-if="!game.log.length">牌局开始后，房间与出牌事件会显示在这里。</p>
  </section>
</template>
