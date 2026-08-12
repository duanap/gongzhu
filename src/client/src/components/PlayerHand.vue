<script setup>
import { computed, ref, watch } from 'vue';
import Card from './Card.vue';

const props = defineProps({ game: { type: Object, required: true } });
const emit = defineEmits(['declare-cards', 'play-card']);
const selected = ref([]);
const hint = ref('');
const specialNames = { S12: '猪', D11: '羊', H14: '红', C10: '变' };

watch(() => props.game.phase, () => { selected.value = []; hint.value = ''; });
watch(() => props.game.hand.map(card => card.id).join('|'), () => {
  selected.value = selected.value.filter(id => props.game.hand.some(card => card.id === id));
});

const selectedSet = computed(() => new Set(selected.value));
const legalSet = computed(() => new Set(props.game.legalCardIds || []));
const declarable = computed(() => new Set(props.game.hand.filter(card => specialNames[card.id]).map(card => card.id)));
const submitted = computed(() => Boolean(props.game.declarationSubmitted[props.game.yourIndex]));
const isYourTurn = computed(() => props.game.phase === 'play' && props.game.currentViewPlayer === 0);

function toggleCard(card) {
  hint.value = '';
  if (props.game.phase === 'declare') {
    if (submitted.value) return;
    if (!declarable.value.has(card.id)) {
      hint.value = '只有猪、羊、红、变可以亮。';
      return;
    }
    selected.value = selectedSet.value.has(card.id)
      ? selected.value.filter(id => id !== card.id)
      : [...selected.value, card.id];
    return;
  }
  if (!isYourTurn.value || !legalSet.value.has(card.id)) {
    hint.value = isYourTurn.value ? '这张牌现在不能出。' : '还没轮到你出牌。';
    return;
  }
  selected.value = selectedSet.value.has(card.id) ? [] : [card.id];
}

function submitDeclaration() {
  if (submitted.value) return;
  emit('declare-cards', [...selected.value]);
}

function submitPlay() {
  if (selected.value.length !== 1 || !legalSet.value.has(selected.value[0])) return;
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
        <span v-if="game.phase === 'declare'">选择要亮的特殊牌，也可以不亮。</span>
        <span v-else-if="isYourTurn">轮到你出牌，先选择一张高亮牌。</span>
        <span v-else>等待当前玩家出牌。</span>
      </div>
      <button v-if="game.phase === 'declare'" class="primary-button declaration-submit" type="button" :disabled="submitted" @click="submitDeclaration">
        {{ submitted ? '已提交' : (selected.length ? `确认亮 ${selected.length} 张` : '不亮') }}
      </button>
      <button v-else-if="isYourTurn" class="primary-button" type="button" :disabled="selected.length !== 1" @click="submitPlay">出牌</button>
    </header>
    <div v-if="game.hand.length" class="card-row">
      <div v-for="(card, index) in game.hand" :key="card.id" class="gongzhu-hand-card" :class="{ special: specialNames[card.id], declared: selectedSet.has(card.id) }">
        <Card
          :card="card"
          :selected="selectedSet.has(card.id)"
          :playable="(game.phase === 'play' && legalSet.has(card.id)) || (game.phase === 'declare' && declarable.has(card.id) && !submitted)"
          :unplayable="(game.phase === 'play' && isYourTurn && !legalSet.has(card.id)) || (game.phase === 'declare' && !declarable.has(card.id))"
          :style="{ '--deal-delay': `${index * 84}ms`, '--deal-x': '0px', '--deal-y': '-230px' }"
          @click="toggleCard(card)"
        />
        <b v-if="specialNames[card.id]" class="gongzhu-special-badge">{{ specialNames[card.id] }}</b>
      </div>
    </div>
    <p v-if="hint" class="hand-hint">{{ hint }}</p>
    <p v-if="!game.hand.length" class="empty-note">开局后手牌会显示在这里。</p>
  </section>
</template>
