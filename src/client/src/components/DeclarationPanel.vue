<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({ game: { type: Object, required: true } });
const now = ref(Date.now());
let timer;
const seconds = computed(() => Math.max(0, Math.ceil((props.game.declarationDeadline - now.value) / 1000)));
onMounted(() => { timer = window.setInterval(() => { now.value = Date.now(); }, 250); });
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <aside v-if="game.phase === 'declare'" class="gongzhu-declare-panel">
    <div><strong>秘密亮牌</strong><span>四人提交后同时公开</span></div>
    <b :class="{ urgent: seconds <= 5 }">{{ seconds }}s</b>
    <div class="gongzhu-declare-status">
      <span v-for="(player, index) in game.viewPlayers" :key="player.id || index" :class="{ done: game.declarationSubmitted[player.serverIndex] }">
        {{ index === 0 ? '你' : player.name }} {{ game.declarationSubmitted[player.serverIndex] ? '✓' : '…' }}
      </span>
    </div>
  </aside>
</template>
