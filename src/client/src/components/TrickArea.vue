<script setup>
import Card from './Card.vue';

const props = defineProps({
  trick: {
    type: Array,
    default: () => []
  },
  players: {
    type: Array,
    default: () => []
  },
  game: {
    type: Object,
    default: null
  }
});

function trickCountText() {
  return props.trick.length > 4 ? `${props.trick.length}/${props.trick.length}` : `${props.trick.length}/4`;
}

function playClass(play) {
  return {
    [`trick-player-${play.player}`]: true,
    winner: props.game?.trickWinnerView === play.player,
    collecting: Boolean(props.game?.collectingTrick),
    judging: Boolean(props.game?.comparingTrick)
  };
}
</script>

<template>
  <section
    class="trick-panel"
    :class="{
      judging: game?.comparingTrick,
      collecting: game?.collectingTrick,
      sweep: Boolean(game?.sweepCollect)
    }"
  >
    <header>
      <strong>{{ trick.length > 4 ? '甩牌收墩' : '本墩出牌' }}</strong>
      <span>{{ game?.collectingTrick ? '收墩中' : game?.comparingTrick ? '比牌中' : trickCountText() }}</span>
    </header>
    <div v-if="trick.length" class="trick-cards">
      <div
        v-for="play in trick"
        :key="`${play.player}-${play.card?.id}`"
        class="trick-play"
        :class="playClass(play)"
      >
        <Card v-if="play.card" :card="play.card" compact />
        <span>{{ players[play.player]?.name || `玩家 ${play.player + 1}` }}</span>
      </div>
    </div>
    <p v-else>桌面暂无出牌。</p>
    <div v-if="game?.judgeText" class="judge-bubble">{{ game.judgeText }}</div>
  </section>
</template>
