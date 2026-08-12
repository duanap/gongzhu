<script setup>
import { computed, ref, watch } from 'vue';
import { playGameSound } from '../services/audio';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const visible = ref(false);
let hideTimer = 0;

const reminderKey = computed(() => {
  if (
    props.game.phase !== 'play' ||
    props.game.currentViewPlayer !== 0 ||
    props.game.busy ||
    props.game.comparingTrick ||
    props.game.collectingTrick
  ) {
    return '';
  }
  return [
    props.game.roomId || '',
    props.game.roundNo || 0,
    props.game.trickNo || 0,
    props.game.trickView?.length || 0,
    props.game.legalCardIds?.length || 0
  ].join(':');
});

watch(reminderKey, key => {
  window.clearTimeout(hideTimer);
  if (!key) {
    visible.value = false;
    return;
  }
  visible.value = false;
  window.requestAnimationFrame(() => {
    visible.value = true;
    playGameSound('turn');
    hideTimer = window.setTimeout(() => {
      visible.value = false;
    }, 1900);
  });
}, { immediate: true });
</script>

<template>
  <div v-if="visible" class="your-turn-reminder-vue" aria-live="polite">
    轮到你出牌
  </div>
</template>
