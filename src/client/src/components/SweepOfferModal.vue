<script setup>
import { computed, ref, watch } from 'vue';
import LegacyModal from './LegacyModal.vue';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['sweep-cards']);
const dismissedKey = ref('');
const offer = computed(() => props.game.sweepOffer || null);
const suitName = computed(() => ({ C: '梅花', D: '方块', S: '黑桃', H: '红桃' }[offer.value?.suit] || offer.value?.suit || '未知'));
const offerKey = computed(() => {
  if (!offer.value) return '';
  return [
    props.game.roomId,
    props.game.roundNo,
    props.game.trickNo,
    offer.value.suit,
    offer.value.cardCount,
    offer.value.points
  ].join(':');
});
const visible = computed(() => Boolean(
  offerKey.value &&
  offerKey.value !== dismissedKey.value &&
  props.game.phase === 'play' &&
  props.game.currentViewPlayer === 0 &&
  !props.game.busy
));

watch(offerKey, key => {
  if (!key) dismissedKey.value = '';
});

function dismiss() {
  dismissedKey.value = offerKey.value;
}

function confirm() {
  dismiss();
  emit('sweep-cards');
}
</script>

<template>
  <LegacyModal
    v-if="visible"
    title="可以甩牌"
    :subtitle="`另外三家在上一墩均未跟${suitName}，你已取得牌权。确认后将一次性甩完手牌并收下余牌中的全部分数。`"
    variant="sweep"
    :show-bottom-close="false"
    @close="dismiss"
  >
    <div class="sweep-offer-summary">
      <div><span>剩余花色</span><strong>{{ suitName }}</strong></div>
      <div><span>甩牌张数</span><strong>{{ Number(offer?.cardCount || 0) }}</strong></div>
      <div><span>将收分数</span><strong>{{ Number(offer?.points || 0) }}</strong></div>
    </div>
    <template #actions>
      <button class="primary-button" type="button" @click="confirm">确认甩牌</button>
      <button class="text-button" type="button" @click="dismiss">关闭</button>
    </template>
  </LegacyModal>
</template>
