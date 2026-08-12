<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SPECIAL_LEVEL_NAMES } from '../data/interactionCatalog';
import { playGameSound } from '../services/audio';
import { effectDelay, readClientSettings } from '../services/preferences';
import { EFFECT_TIMINGS, specialEventMilliseconds } from '../services/effectTimings.mjs';

const props = defineProps({
  game: {
    type: Object,
    required: true
  }
});

const currentEvent = ref(null);
const moonEvent = ref(null);
const queue = [];
const seen = new Set();
let initialized = false;
let timer = 0;
const screenRotation = ref('0deg');

function eventKey(event) {
  return String(event.seq || `${event.type || ''}|${event.title || ''}|${event.subtitle || ''}`);
}

function enqueue(event) {
  if (!event) return;
  queue.push({ ...event });
  playNext();
}

function replacePreview(event) {
  window.clearTimeout(timer);
  queue.splice(0, queue.length);
  currentEvent.value = null;
  moonEvent.value = null;
  document.body.classList.remove('moon-effect-active');
  if (!event) return;
  queue.push({ ...event });
  playNext();
}

function playNext() {
  if (currentEvent.value || moonEvent.value || !queue.length) return;
  if (!readClientSettings().effects) {
    queue.splice(0, queue.length);
    return;
  }
  const next = queue.shift();
  if (next.type === 'shootMoon') {
    playGameSound('moon');
    moonEvent.value = next;
    document.body.classList.add('moon-effect-active');
    timer = window.setTimeout(() => {
      document.body.classList.remove('moon-effect-active');
      moonEvent.value = null;
      currentEvent.value = next;
      timer = window.setTimeout(finishCurrent, effectDelay(specialEventMilliseconds(next.level)));
    }, effectDelay(EFFECT_TIMINGS.moon));
    return;
  }
  playGameSound('event');
  currentEvent.value = next;
  timer = window.setTimeout(finishCurrent, effectDelay(specialEventMilliseconds(next.level)));
}

function finishCurrent() {
  currentEvent.value = null;
  timer = window.setTimeout(playNext, EFFECT_TIMINGS.specialEventGap);
}

function onDebugBroadcast(event) {
  replacePreview(event.detail);
}

function onSettingsChanged(event) {
  if (event.detail?.effects !== false) return;
  window.clearTimeout(timer);
  queue.splice(0, queue.length);
  currentEvent.value = null;
  moonEvent.value = null;
  document.body.classList.remove('moon-effect-active');
}

function syncScreenRotation() {
  screenRotation.value = window.matchMedia('(orientation: portrait)').matches && document.body.classList.contains('force-landscape')
    ? '90deg'
    : '0deg';
}

const eventTargetStyle = computed(() => {
  const index = Number(currentEvent.value?.playerIndex);
  if (!Number.isInteger(index) || index < 0 || index > 3) return {};
  const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const directions = [
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 0 }
  ];
  let direction = directions[index];
  if (screenRotation.value === '90deg') direction = { x: -direction.y, y: direction.x };
  return {
    '--special-to-x': `${Math.round(direction.x * (width / 2 + 190))}px`,
    '--special-to-y': `${Math.round(direction.y * (height / 2 + 190))}px`,
    '--screen-rot': screenRotation.value,
    '--special-event-duration': `${effectDelay(specialEventMilliseconds(currentEvent.value?.level)) / 1000}s`
  };
});

watch(
  () => props.game.specialEventsView,
  events => {
    const list = Array.isArray(events) ? events : [];
    if (!initialized) {
      list.forEach(event => seen.add(eventKey(event)));
      initialized = true;
      return;
    }
    list.forEach(event => {
      const key = eventKey(event);
      if (seen.has(key)) return;
      seen.add(key);
      enqueue(event);
    });
  },
  { immediate: true }
);

onMounted(() => {
  syncScreenRotation();
  window.addEventListener('resize', syncScreenRotation);
  window.addEventListener('orientationchange', syncScreenRotation);
  window.addEventListener('hearts:debug-broadcast', onDebugBroadcast);
  window.addEventListener('hearts:settings-changed', onSettingsChanged);
});

onBeforeUnmount(() => {
  window.clearTimeout(timer);
  document.body.classList.remove('moon-effect-active');
  window.removeEventListener('resize', syncScreenRotation);
  window.removeEventListener('orientationchange', syncScreenRotation);
  window.removeEventListener('hearts:debug-broadcast', onDebugBroadcast);
  window.removeEventListener('hearts:settings-changed', onSettingsChanged);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="currentEvent || moonEvent" class="broadcast-layer" aria-live="polite">
      <section v-if="moonEvent" class="moon-effect-vue" aria-label="射中月亮">
        <div class="moon-orbit-vue">
          <span class="moon-stars-vue">✦ ✧ ✦</span>
          <span class="moon-glow-vue">🌕</span>
          <strong>射中月亮！</strong>
          <small>{{ moonEvent.subtitle || '独揽 26 分，全场改命！' }}</small>
        </div>
      </section>

      <article
        v-if="currentEvent"
        :key="eventKey(currentEvent)"
        class="special-event-toast special-flying-vue"
        :class="[currentEvent.level || 'minor', currentEvent.type || '']"
        :style="eventTargetStyle"
      >
        <span class="special-event-level">{{ SPECIAL_LEVEL_NAMES[currentEvent.level] || '事件' }}</span>
        <strong>{{ currentEvent.title || '牌局事件' }}</strong>
        <span>{{ currentEvent.subtitle }}</span>
      </article>
    </div>
  </Teleport>
</template>
