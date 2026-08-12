<script setup>
import { computed } from 'vue';
const props = defineProps({ game: { type: Object, required: true }, open: { type: Boolean, default: true } });
defineEmits(['close', 'restart-game']);
const ranked = computed(() => [...props.game.viewPlayers].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)));
const winnerNames = computed(() => props.game.winnerIndexes.map(index => props.game.players[index]?.name).filter(Boolean).join('、'));
</script>

<template>
  <div v-if="open && game.phase === 'gameEnd'" class="result-modal-layer" role="dialog" aria-modal="true" aria-label="游戏成绩">
    <button class="result-modal-mask" type="button" aria-label="关闭成绩" @click="$emit('close')" />
    <section class="result-panel result-card">
      <button class="result-modal-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      <header><div><strong>{{ winnerNames }} 获胜！</strong><span>拱猪按最高累计分判定胜负。</span></div></header>
      <div class="result-list result-score-board">
        <article v-for="(player, rank) in ranked" :key="player.id || rank" class="result-row result-player-card" :class="{ winner: rank === 0, active: player.viewIndex === 0 }">
          <div class="result-rank-medal">{{ rank === 0 ? '🏆' : rank + 1 }}</div>
          <div class="result-player-main"><span class="result-player-name">{{ player.viewIndex === 0 ? '你' : player.name }}</span><small class="result-player-sub">{{ player.isBot ? 'AI 玩家' : '真人玩家' }}</small></div>
          <div class="result-score-group"><div class="result-score-pill"><span>本副</span><strong>{{ player.round || 0 }}</strong></div><div class="result-score-pill total"><span>总分</span><strong>{{ player.total || 0 }}</strong></div></div>
          <div class="result-badge-wrap"><span v-if="rank === 0" class="result-badge">胜利</span></div>
        </article>
      </div>
      <div class="result-actions modal-actions"><button v-if="game.isHost" class="primary-button" type="button" @click="$emit('restart-game')">再来一场</button></div>
    </section>
  </div>
</template>
