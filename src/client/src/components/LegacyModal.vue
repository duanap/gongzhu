<script setup>
import { ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';

defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  eyebrow: {
    type: String,
    default: ''
  },
  variant: {
    type: String,
    default: 'standard'
  },
  showBottomClose: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['close']);
const dialogRef = ref(null);

function close() {
  emit('close');
}

useDialogFocus(dialogRef, () => true, close);
</script>

<template>
  <div class="legacy-overlay-modal">
    <button class="legacy-overlay-mask" type="button" :aria-label="`关闭${title}`" @click="close" />
    <section
      ref="dialogRef"
      class="legacy-parity-card"
      :class="`legacy-parity-${variant}`"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
    >
      <button class="legacy-modal-close" type="button" aria-label="关闭" data-dialog-initial-focus @click="close">×</button>
      <header class="legacy-parity-heading">
        <span v-if="eyebrow" class="legacy-parity-eyebrow">{{ eyebrow }}</span>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </header>
      <div class="legacy-parity-body">
        <slot />
      </div>
      <footer v-if="showBottomClose || $slots.actions" class="legacy-parity-actions">
        <slot name="actions" />
        <button v-if="showBottomClose" class="text-button" type="button" @click="close">关闭</button>
      </footer>
    </section>
  </div>
</template>
