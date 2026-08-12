<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EFFECT_TIMINGS } from '../services/effectTimings.mjs';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  message: {
    type: String,
    default: ''
  }
});

const browserOnline = ref(navigator.onLine !== false);
const toastItem = ref(null);
const noticeQueue = [];
let noticeId = 0;
let hideTimer = 0;
let gapTimer = 0;

const connectionMessage = computed(() => {
  if (!browserOnline.value) return '当前设备处于离线状态，请检查网络连接。';
  if (props.game.connected) return '';
  if (props.game.reconnecting) {
    const attempts = Number(props.game.reconnectAttempts || 0);
    return attempts > 0
      ? `已与联机服务断开，正在第 ${attempts} 次自动重连。`
      : '已与联机服务断开，正在自动重连。';
  }
  if (props.game.connecting) return props.game.roomId
    ? '正在重新连接联机服务……'
    : '正在连接联机服务端……';
  return props.game.roomId
    ? '已与联机服务断开，正在等待重连。'
    : '当前未连接到联机服务。';
});

function syncOnlineState() {
  browserOnline.value = navigator.onLine !== false;
}

function showNextNotice() {
  window.clearTimeout(gapTimer);
  gapTimer = 0;
  const next = noticeQueue.shift() || null;
  toastItem.value = next;
  if (!next) return;
  hideTimer = window.setTimeout(finishNotice, next.holdMs);
}

function finishNotice() {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  toastItem.value = null;
  if (!noticeQueue.length) return;
  gapTimer = window.setTimeout(showNextNotice, EFFECT_TIMINGS.noticeGap);
}

function enqueueNotice(message, kind = 'notice', holdMs = 0) {
  const text = String(message || '').trim();
  if (!text) return;
  const fallbackDuration = kind === 'error' ? EFFECT_TIMINGS.noticeError : EFFECT_TIMINGS.notice;
  noticeQueue.push({
    id: ++noticeId,
    message: text,
    kind,
    holdMs: Math.max(80, Number(holdMs || fallbackDuration))
  });
  if (noticeQueue.length > 4) noticeQueue.splice(0, noticeQueue.length - 4);
  if (!toastItem.value && !gapTimer) showNextNotice();
}

function onDebugNotice(event) {
  enqueueNotice(event.detail?.message, event.detail?.kind, event.detail?.holdMs);
}

watch(() => props.message, message => {
  const next = String(message || '').trim();
  if (!next) return;
  enqueueNotice(next, props.game.lastError && next === props.game.lastError ? 'error' : 'notice');
}, { immediate: true });

onMounted(() => {
  window.addEventListener('online', syncOnlineState);
  window.addEventListener('offline', syncOnlineState);
  window.addEventListener('hearts:debug-notice', onDebugNotice);
});

onBeforeUnmount(() => {
  window.clearTimeout(hideTimer);
  window.clearTimeout(gapTimer);
  noticeQueue.splice(0, noticeQueue.length);
  window.removeEventListener('online', syncOnlineState);
  window.removeEventListener('offline', syncOnlineState);
  window.removeEventListener('hearts:debug-notice', onDebugNotice);
});
</script>

<template>
  <div class="global-notice-layer" aria-live="polite">
    <div v-if="connectionMessage" class="global-connection-banner" role="status">
      <span class="connection-pulse" aria-hidden="true" />
      {{ connectionMessage }}
    </div>
    <Transition name="global-toast" mode="out-in">
      <div
        v-if="toastItem"
        :key="toastItem.id"
        class="global-notice-toast"
        :class="toastItem.kind"
        :data-notice-id="toastItem.id"
        :role="toastItem.kind === 'error' ? 'alert' : 'status'"
      >
        {{ toastItem.message }}
      </div>
    </Transition>
  </div>
</template>
