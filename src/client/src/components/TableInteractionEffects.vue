<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { playInteractionSound } from '../services/audio';
import { effectDelay } from '../services/preferences';
import { overlayViewport, viewportPointToOverlay } from '../services/overlayCoordinates.mjs';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  teleportTarget: {
    type: String,
    default: 'body'
  }
});

const effects = ref([]);
let initialized = false;
let seenSeq = 0;
let localId = 0;
const timers = new Set();
const INTERACTION_IMPACT_DELAY_MS = 880;
const RECENT_INTERACTION_WINDOW_MS = 3200;

const desktopSeatPoints = [
  { x: 84, y: 79 },
  { x: 7, y: 45 },
  { x: 50, y: 9 },
  { x: 93, y: 45 }
];
const mobileSeatPoints = [
  { x: 50, y: 78 },
  { x: 16, y: 50 },
  { x: 50, y: 17 },
  { x: 84, y: 50 }
];

function normalizeIndex(index) {
  const number = Number(index);
  return Number.isInteger(number) && number >= 0 && number < 4 ? number : 0;
}

function displayName(name, fallback) {
  return String(name || fallback || '玩家').trim().slice(0, 10);
}

function fallbackPoint(viewIndex) {
  const viewport = overlayViewport();
  const seatPoints = viewport.width <= 900 ? mobileSeatPoints : desktopSeatPoints;
  const point = seatPoints[normalizeIndex(viewIndex)];
  return { x: viewport.width * point.x / 100, y: viewport.height * point.y / 100 };
}

function elementCenter(selector, viewIndex) {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  if (!rect) return fallbackPoint(viewIndex);
  return viewportPointToOverlay({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}

function seatCenter(viewIndex) {
  return elementCenter(`.seat-${['south', 'west', 'north', 'east'][normalizeIndex(viewIndex)]} .seat-avatar`, viewIndex);
}

function pileCenter(viewIndex) {
  const selectors = ['.hand-panel .card-row', '.opponent-hand-west', '.opponent-hand-north', '.opponent-hand-east'];
  const element = document.querySelector(selectors[normalizeIndex(viewIndex)]);
  if (!element) return seatCenter(viewIndex);
  const cards = Array.from(element.querySelectorAll('.game-card, .opponent-card-back-vue'))
    .filter(card => {
      const rect = card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  if (cards.length) {
    const focusCards = cards.length > 5
      ? cards.slice(Math.max(0, Math.floor(cards.length / 2) - 2), Math.min(cards.length, Math.floor(cards.length / 2) + 3))
      : cards;
    const sum = focusCards.reduce((total, card) => {
      const rect = card.getBoundingClientRect();
      total.x += rect.left + rect.width / 2;
      total.y += rect.top + rect.height / 2;
      return total;
    }, { x: 0, y: 0 });
    return viewportPointToOverlay({ x: sum.x / focusCards.length, y: sum.y / focusCards.length });
  }
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return seatCenter(viewIndex);
  return viewportPointToOverlay({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}

function bubbleAnchor(viewIndex) {
  const point = seatCenter(viewIndex);
  const viewport = overlayViewport();
  const dx = point.x - viewport.width / 2;
  const dy = point.y - viewport.height / 2;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: Math.max(116, Math.min(viewport.width - 116, point.x - dx / length * 48)),
    y: Math.max(50, Math.min(viewport.height - 50, point.y - dy / length * 48))
  };
}

function effectStyle(item) {
  const from = pileCenter(item.fromIndex);
  const to = seatCenter(item.broadcastOnly ? item.fromIndex : item.toIndex);
  const bubble = bubbleAnchor(item.broadcastOnly ? item.fromIndex : item.toIndex);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const arc = Math.max(18, Math.min(54, distance * .08));
  const normalX = distance ? dy / distance * arc : 0;
  const normalY = distance ? -dx / distance * arc : -arc;
  return {
    '--interaction-from-x': `${Math.round(from.x)}px`,
    '--interaction-from-y': `${Math.round(from.y)}px`,
    '--interaction-to-x': `${Math.round(to.x)}px`,
    '--interaction-to-y': `${Math.round(to.y)}px`,
    '--interaction-mid-x': `${Math.round(from.x + dx * .45 + normalX)}px`,
    '--interaction-mid-y': `${Math.round(from.y + dy * .45 + normalY)}px`,
    '--interaction-distance': `${Math.round(distance)}px`,
    '--interaction-angle': `${Math.atan2(dy, dx)}rad`,
    '--interaction-bubble-x': `${Math.round(bubble.x)}px`,
    '--interaction-bubble-y': `${Math.round(bubble.y)}px`,
    '--interaction-duration': `${Math.round(Math.max(840, Math.min(1380, 720 + distance * .42)))}ms`
  };
}

function addEffect(item) {
  const effect = {
    id: `${item.seq || Date.now()}-${localId++}`,
    kind: item.kind || 'emoji',
    icon: item.icon || '💬',
    label: item.label || '互动',
    from: displayName(item.from, '玩家'),
    to: displayName(item.to, '玩家'),
    fromIndex: normalizeIndex(item.fromIndex),
    toIndex: normalizeIndex(item.toIndex),
    // 文字互动只在发送者附近显示气泡，绝不生成道具飞行或发射轨迹。
    broadcastOnly: item.kind === 'emoji' || Boolean(item.broadcastOnly)
  };
  effects.value = [...effects.value.slice(-4), effect];
  playInteractionSound(effect.kind);
  if (!effect.broadcastOnly && effect.kind !== 'emoji') {
    const impactTimer = window.setTimeout(() => {
      playInteractionSound(effect.kind, 'impact');
      timers.delete(impactTimer);
    }, INTERACTION_IMPACT_DELAY_MS);
    timers.add(impactTimer);
  }
  const timer = window.setTimeout(() => {
    effects.value = effects.value.filter(current => current.id !== effect.id);
    timers.delete(timer);
  }, effectDelay(effect.kind === 'emoji' ? 2200 : 2600));
  timers.add(timer);
}

function onDebugInteraction(event) {
  addEffect(event.detail || {});
}

watch(
  () => props.game.interactionsView,
  interactions => {
    const list = Array.isArray(interactions) ? interactions : [];
    const maxSeq = list.reduce((max, item) => Math.max(max, Number(item.seq || 0)), 0);
    if (!initialized) {
      seenSeq = maxSeq;
      initialized = true;
      list
        .filter(item => Number(item.at || 0) >= Date.now() - RECENT_INTERACTION_WINDOW_MS)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .forEach(addEffect);
      return;
    }
    list
      .filter(item => Number(item.seq || 0) > seenSeq)
      .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
      .forEach(addEffect);
    seenSeq = Math.max(seenSeq, maxSeq);
  },
  { immediate: true }
);

onMounted(() => window.addEventListener('hearts:debug-interaction', onDebugInteraction));

onBeforeUnmount(() => {
  timers.forEach(timer => window.clearTimeout(timer));
  window.removeEventListener('hearts:debug-interaction', onDebugInteraction);
});
</script>

<template>
  <Teleport :to="teleportTarget">
    <div v-if="effects.length" class="interaction-effects-layer legacy-interaction-layer" aria-live="polite">
      <article
        v-for="effect in effects"
        :key="effect.id"
        class="legacy-interaction-sequence"
        :class="[effect.kind, { broadcast: effect.broadcastOnly }]"
        :style="effectStyle(effect)"
      >
        <div v-if="effect.broadcastOnly" class="interaction-bubble-vue bubble-at-source">
          <span>{{ effect.icon }}</span>
          <strong>{{ effect.label }}</strong>
          <small>{{ effect.from }}</small>
        </div>
        <template v-else>
          <span class="interaction-fly-item-vue">{{ effect.icon }}</span>
          <span class="interaction-impact-vue">{{ effect.icon }}</span>
          <div class="interaction-bubble-vue bubble-at-target">
            <span>{{ effect.icon }}</span>
            <strong>{{ effect.label }}</strong>
            <small>{{ effect.from }}</small>
          </div>
        </template>
      </article>
    </div>
  </Teleport>
</template>
