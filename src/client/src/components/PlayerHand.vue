<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Card from './Card.vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['pass-cards', 'play-card']);
const selected = ref([]);
const hint = ref('');
const receivedIds = ref(new Set());
let hintTimer = null;
let receivedTimer = null;

watch(() => props.game.phase, () => {
  selected.value = [];
  clearHint();
});

watch(
  () => `${props.game.phase}:${props.game.currentViewPlayer}:${props.game.busy}`,
  () => {
    if (props.game.phase === 'play' && (props.game.currentViewPlayer !== 0 || props.game.busy)) {
      selected.value = [];
    }
  }
);

watch(() => props.game.hand.map(card => card.id).join('|'), () => {
  selected.value = selected.value.filter(id => props.game.hand.some(card => card.id === id));
});

watch(
  () => `${props.game.roomId}:${props.game.roundNo}:${(props.game.receivedCards || []).map(card => card.id).join('|')}`,
  () => {
    const ids = (props.game.receivedCards || []).map(card => card.id);
    if (!ids.length) return;
    receivedIds.value = new Set(ids);
    window.clearTimeout(receivedTimer);
    receivedTimer = window.setTimeout(() => { receivedIds.value = new Set(); }, 3600);
  }
);

function clearHint() {
  window.clearTimeout(hintTimer);
  hintTimer = null;
  hint.value = '';
}

function showHint(message) {
  window.clearTimeout(hintTimer);
  hint.value = message;
  hintTimer = window.setTimeout(clearHint, 1700);
}

onBeforeUnmount(() => {
  window.clearTimeout(hintTimer);
  window.clearTimeout(receivedTimer);
});

const selectedSet = computed(() => new Set(selected.value));
const legalSet = computed(() => new Set(props.game.legalCardIds || []));
const canSubmitPass = computed(() => props.game.phase === 'pass' && selected.value.length === 3 && !props.game.youPassed);
const isYourTurn = computed(() => props.game.phase === 'play' && props.game.currentViewPlayer === 0 && !props.game.busy);
const canSubmitPlay = computed(() => isYourTurn.value && selected.value.length === 1 && legalSet.value.has(selected.value[0]));
const leadSuit = computed(() => props.game.trickView[0]?.card?.suit || '');
const phaseHint = computed(() => {
  if (props.game.phase === 'pass') {
    if (props.game.youPassed) return '已传牌，等待其他玩家。';
    return '请选择3张牌传出。';
  }
  if (props.game.phase === 'play') {
    if (isYourTurn.value) {
      if (selected.value.length === 1) return '已选择一张牌，点击出牌确认。';
      return '轮到你出牌，先选择一张高亮牌。';
    }
    return '等待当前玩家出牌。';
  }
  return '开局后手牌会显示在这里。';
});

function suitName(suit) {
  return { C: '梅花', D: '方片', S: '黑桃', H: '红桃' }[suit] || suit || '该花色';
}

function illegalReason(card) {
  if (props.game.busy) return '正在结算本墩，请稍等。';
  if (props.game.currentViewPlayer !== 0) return '还没轮到你出牌。';
  if (leadSuit.value && card.suit !== leadSuit.value && props.game.hand.some(item => item.suit === leadSuit.value)) {
    return `本墩先出的是${suitName(leadSuit.value)}，你必须跟出同花色。`;
  }
  if (props.game.trickNo === 0 && props.game.hand.some(item => item.id === 'C2') && card.id !== 'C2') {
    return '首轮首出必须先出梅花 2。';
  }
  if (props.game.trickNo === 0 && leadSuit.value && (card.suit === 'H' || card.id === 'S12')) {
    return '第一墩不能垫红桃或黑桃 Q。';
  }
  if (!leadSuit.value && card.suit === 'H' && !props.game.heartsBroken && props.game.hand.some(item => item.suit !== 'H')) {
    return '红桃尚未破，暂时不能主动出红桃。';
  }
  return '这张牌现在不能出。';
}

function toggleCard(card) {
  if (props.game.phase === 'pass') {
    if (props.game.youPassed) {
      showHint('你已经提交传牌。');
      return;
    }
    if (selectedSet.value.has(card.id)) {
      selected.value = selected.value.filter(id => id !== card.id);
      clearHint();
      return;
    }
    if (selected.value.length < 3) {
      selected.value = [...selected.value, card.id];
      clearHint();
      return;
    }
    showHint('只能选择 3 张牌。');
    return;
  }

  if (props.game.phase === 'play' && legalSet.value.has(card.id) && isYourTurn.value) {
    selected.value = selectedSet.value.has(card.id) ? [] : [card.id];
    clearHint();
    return;
  }

  if (props.game.phase === 'play') {
    showHint(illegalReason(card));
  }
}

function submitPass() {
  if (!canSubmitPass.value) return;
  emit('pass-cards', [...selected.value]);
}

function submitPlay() {
  if (!canSubmitPlay.value) return;
  const [cardId] = selected.value;
  selected.value = [];
  emit('play-card', cardId);
}
</script>

<template>
  <section class="hand-panel" :class="`hand-phase-${game.phase}`">
    <header>
      <div>
        <strong>你的手牌</strong>
        <span>{{ phaseHint }}</span>
      </div>
      <button
        v-if="game.phase === 'pass'"
        class="primary-button"
        type="button"
        :disabled="!canSubmitPass"
        @click="submitPass"
      >
        传牌 {{ selected.length }}/3
      </button>
      <button
        v-else-if="isYourTurn"
        class="primary-button"
        type="button"
        :disabled="!canSubmitPlay"
        @click="submitPlay"
      >
        出牌
      </button>
    </header>

    <div v-if="game.hand.length" class="card-row">
      <Card
        v-for="(card, index) in game.hand"
        :key="card.id"
        :card="card"
        :selected="selectedSet.has(card.id)"
        :playable="game.phase === 'play' && legalSet.has(card.id) && !game.busy"
        :unplayable="game.phase === 'play' && game.currentViewPlayer === 0 && !game.busy && !legalSet.has(card.id)"
        :received="receivedIds.has(card.id)"
        :style="{ '--deal-delay': `${index * 104}ms`, '--deal-x': '0px', '--deal-y': '-230px' }"
        @click="toggleCard(card)"
      />
    </div>
    <p v-if="hint" class="hand-hint">{{ hint }}</p>
    <p v-if="!game.hand.length" class="empty-note">暂无手牌。</p>
  </section>
</template>
