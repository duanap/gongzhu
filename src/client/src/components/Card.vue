<script setup>
defineProps({
  card: {
    type: Object,
    required: true
  },
  selected: {
    type: Boolean,
    default: false
  },
  playable: {
    type: Boolean,
    default: false
  },
  unplayable: {
    type: Boolean,
    default: false
  },
  received: {
    type: Boolean,
    default: false
  },
  passed: {
    type: Boolean,
    default: false
  },
  compact: {
    type: Boolean,
    default: false
  },
  summary: {
    type: Boolean,
    default: false
  }
});

const suits = {
  C: { symbol: '♣', label: '梅花', color: 'black' },
  D: { symbol: '♦', label: '方片', color: 'red' },
  S: { symbol: '♠', label: '黑桃', color: 'black' },
  H: { symbol: '♥', label: '红桃', color: 'red' }
};

function rankText(rank) {
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === 14) return 'A';
  return String(rank || '');
}

function visualClass(card) {
  if (card?.suit === 'S' && card?.rank === 12) return 'queen-spades';
  if (card?.suit === 'H') return 'heart-card';
  return '';
}
</script>

<template>
  <button
    class="game-card"
    :class="[
      suits[card.suit]?.color || 'black',
      visualClass(card),
      { selected, playable, unplayable, compact, summary, 'just-received': received, 'passed-card': passed }
    ]"
    type="button"
    :data-id="card.id"
    :aria-label="`${rankText(card.rank)} ${suits[card.suit]?.label || card.suit}`"
    :aria-pressed="selected"
    :aria-disabled="unplayable || undefined"
  >
    <span class="card-corner">
      <strong>{{ rankText(card.rank) }}</strong>
      <small>{{ suits[card.suit]?.symbol || card.suit }}</small>
    </span>
    <span class="card-pip">{{ suits[card.suit]?.symbol || card.suit }}</span>
    <span class="card-corner bottom">
      <strong>{{ rankText(card.rank) }}</strong>
      <small>{{ suits[card.suit]?.symbol || card.suit }}</small>
    </span>
  </button>
</template>
