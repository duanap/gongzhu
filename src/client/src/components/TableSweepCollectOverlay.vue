<script setup>
import { computed } from 'vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const suitNames = {
  C: '梅花',
  D: '方块',
  S: '黑桃',
  H: '红桃'
};

const canShow = computed(() => Boolean(props.game.sweepCollect));
const sweep = computed(() => props.game.sweepCollect || {});
const winnerName = computed(() => props.game.viewPlayers[sweep.value.winnerViewPlayer]?.name || '玩家');
const suitName = computed(() => suitNames[sweep.value.suit] || sweep.value.suit || '同花色');
const sweepCount = computed(() => Number(sweep.value.cardCount || 0));
const totalCount = computed(() => Number(sweep.value.totalCards || sweep.value.cardCount || 0));
const points = computed(() => Number(sweep.value.points || 0));
const stackCards = computed(() => {
  const count = Math.max(4, Math.min(10, totalCount.value || sweepCount.value || 4));
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    style: {
      '--i': index,
      '--mid': (count - 1) / 2,
      '--spread': `${(index - (count - 1) / 2) * 9}px`,
      '--rot': `${(index - (count - 1) / 2) * 3.8}deg`
    }
  }));
});
</script>

<template>
  <div
    v-if="canShow"
    class="sweep-collect-layer"
    :class="{ collecting: game.collectingTrick }"
    aria-live="polite"
  >
    <div class="sweep-card-stack" aria-hidden="true">
      <span
        v-for="card in stackCards"
        :key="card.id"
        class="sweep-card-back"
        :style="card.style"
      />
    </div>

    <article class="sweep-collect-copy">
      <span>甩牌收墩</span>
      <strong>{{ winnerName }}</strong>
      <small>{{ suitName }} {{ sweepCount }} 张甩出 · {{ totalCount }} 张一起收走 · {{ points }} 分</small>
    </article>
  </div>
</template>
