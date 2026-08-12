<script setup>
import { computed } from 'vue';

const props = defineProps({
  count: {
    type: Number,
    default: 0
  },
  position: {
    type: String,
    required: true,
    validator: value => ['north', 'west', 'east'].includes(value)
  }
});

const cards = computed(() => {
  const count = Math.max(0, Math.min(4, Number(props.count) || 0));
  return Array.from({ length: count }, (_, index) => {
    return {
      index,
      style: {
        '--card-index': index,
        '--card-x': `${index * 18}px`,
        '--deal-delay': `${(index * 4 + { west: 1, north: 2, east: 3 }[props.position]) * 26}ms`,
        '--deal-x': props.position === 'west' ? '190px' : props.position === 'east' ? '-190px' : '0px',
        '--deal-y': props.position === 'north' ? '210px' : '20px'
      }
    };
  });
});
</script>

<template>
  <div
    v-if="cards.length"
    class="opponent-hand-vue"
    :class="`opponent-hand-${position}`"
    aria-hidden="true"
  >
    <span
      v-for="card in cards"
      :key="card.index"
      class="opponent-card-back-vue"
      :style="card.style"
    />
  </div>
</template>
