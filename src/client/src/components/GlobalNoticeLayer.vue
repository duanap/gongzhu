<script setup>
import { computed } from 'vue';

const props = defineProps({
  game: { type: Object, required: true },
  message: { type: String, default: '' }
});

const connectionMessage = computed(() => {
  if (props.game.connected) return '';
  if (props.game.reconnecting) return `已断开，正在第 ${props.game.reconnectAttempts || 1} 次自动重连。`;
  return props.game.connecting ? '正在连接联机服务……' : '当前未连接到联机服务。';
});
</script>

<template>
  <div class="global-notice-layer" aria-live="polite">
    <div v-if="connectionMessage" class="global-connection-banner" role="status">
      <span class="connection-pulse" aria-hidden="true" />{{ connectionMessage }}
    </div>
    <Transition name="global-toast">
      <div v-if="message" class="global-notice-toast" :class="{ error: game.lastError }" :role="game.lastError ? 'alert' : 'status'">
        {{ message }}
      </div>
    </Transition>
  </div>
</template>
