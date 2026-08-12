<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  teleportTarget: {
    type: String,
    default: 'body'
  }
});

const open = ref(false);

const canShow = computed(() => Boolean(
  props.game.lastTrickView?.cards?.length &&
  props.game.phase === 'play' &&
  props.game.currentViewPlayer === 0 &&
  !props.game.busy &&
  !props.game.comparingTrick &&
  !props.game.collectingTrick
));

const points = computed(() => Number(props.game.lastTrickView?.points || 0));
const winnerName = computed(() => props.game.viewPlayers[props.game.lastTrickView?.winnerPlayer]?.name || '玩家');
const leadSuit = computed(() => {
  const suit = props.game.lastTrickView?.leadSuit || props.game.lastTrickView?.cards?.[0]?.card?.suit || '';
  return { C: '梅花', D: '方片', S: '黑桃', H: '红桃' }[suit] || suit || '-';
});
const pointCards = computed(() => {
  const cards = props.game.lastTrickView?.cards || [];
  return cards.filter(play => play.card?.suit === 'H' || play.card?.id === 'S12').length;
});
const orderedCards = computed(() => {
  const cards = [...(props.game.lastTrickView?.cards || [])];
  const leader = props.game.lastTrickView?.leaderPlayer ?? cards[0]?.player;
  const leaderIndex = cards.findIndex(play => play.player === leader);
  return leaderIndex > 0 ? [...cards.slice(leaderIndex), ...cards.slice(0, leaderIndex)] : cards;
});

function relationLabel(viewIndex) {
  return ['本家', '上家', '对家', '下家'][viewIndex] || '玩家';
}

function rankText(rank) {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[rank] || String(rank || '');
}

function suitSymbol(suit) {
  return ({ C: '♣', D: '♦', S: '♠', H: '♥' })[suit] || suit || '?';
}

watch(canShow, value => {
  if (!value) open.value = false;
});

watch(() => props.game.lastTrickView, () => {
  open.value = false;
});
</script>

<template>
  <div v-if="canShow" class="last-trick-float">
    <button class="last-trick-btn-vue" type="button" @click="open = !open">
      上一墩
    </button>
  </div>

  <Teleport :to="teleportTarget">
    <div v-if="open && canShow" class="last-trick-modal-layer" role="dialog" aria-modal="true" aria-label="上一墩">
      <button class="last-trick-modal-mask" type="button" aria-label="关闭上一墩" @click="open = false" />
      <section class="last-trick-popover-vue">
        <header class="last-trick-title-vue">
          <strong>上一墩</strong>
          <button class="last-trick-close-vue" type="button" aria-label="关闭" @click="open = false">×</button>
        </header>

        <div class="last-trick-result-vue">
          <div>
            <span>收墩玩家</span>
            <strong>{{ winnerName }}</strong>
          </div>
          <div class="last-trick-score-vue">
            <strong>{{ points }}</strong>
            <span>分</span>
          </div>
        </div>

        <div class="last-trick-track-vue">
          <template v-for="(play, index) in orderedCards" :key="`${play.player}-${play.card?.id}`">
            <article
              class="last-trick-play-vue"
              :class="{ winner: play.player === game.lastTrickView.winnerPlayer }"
            >
              <div class="last-trick-seat-vue">
                <span>{{ relationLabel(play.player) }}</span>
                <strong>{{ game.viewPlayers[play.player]?.name || '玩家' }}</strong>
              </div>
              <div v-if="play.card" class="last-trick-card-vue" :class="{ red: play.card.suit === 'D' || play.card.suit === 'H' }">
                {{ rankText(play.card.rank) }}<br />{{ suitSymbol(play.card.suit) }}
              </div>
              <div class="last-trick-flags-vue">
                <span v-if="play.player === game.lastTrickView.leaderPlayer">首出</span>
                <span v-if="play.player === game.lastTrickView.winnerPlayer" class="winner">最大</span>
              </div>
            </article>
            <span v-if="index < orderedCards.length - 1" class="last-trick-arrow-vue">›</span>
          </template>
        </div>

        <footer class="last-trick-summary-vue">
          {{ pointCards ? `本墩包含 ${pointCards} 张分牌` : '本墩无分牌' }} · {{ leadSuit }}首出
        </footer>
      </section>
    </div>
  </Teleport>
</template>
