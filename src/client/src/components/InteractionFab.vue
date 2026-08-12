<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { INTERACTION_EMOJIS, INTERACTION_TOOLS } from '../data/interactionCatalog';
import { elementCenterInOverlay, overlayViewport } from '../services/overlayCoordinates.mjs';

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

const emit = defineEmits(['send-interaction']);
const mode = ref('');
const targetViewIndex = ref(0);
const cooldownUntil = ref({});
const now = ref(Date.now());
const targetMenuStyle = ref({});
let ticker = 0;
let repositionFrame = 0;

const canSend = computed(() => Boolean(props.game.roomId && props.game.connected));

function absIndex(viewIndex) {
  return ((props.game.yourIndex || 0) + Number(viewIndex) + 4) % 4;
}

function cooldownKey(item, global = false) {
  return global ? `global:${item.kind}` : `${item.kind}:${targetViewIndex.value}`;
}

function remaining(item, global = false) {
  return Math.max(0, Math.ceil((Number(cooldownUntil.value[cooldownKey(item, global)] || 0) - now.value) / 1000));
}

function tomatoAllowed() {
  try {
    const settings = JSON.parse(localStorage.getItem('hearts-vue-settings') || '{}');
    return settings.allowTomato !== false;
  } catch {
    return true;
  }
}

function openQuick() {
  mode.value = mode.value === 'quick' ? '' : 'quick';
  targetViewIndex.value = 0;
}

async function openTarget(viewIndex) {
  if (!props.game.roomId) return;
  targetViewIndex.value = Math.max(0, Math.min(3, Number(viewIndex || 0)));
  mode.value = 'target';
  await nextTick();
  const seat = document.querySelector(`.seat-${['south', 'west', 'north', 'east'][targetViewIndex.value]} .seat-avatar`);
  const menu = document.querySelector('.interaction-target-menu-vue.target-tool-menu');
  const seatCenter = elementCenterInOverlay(seat);
  if (!seatCenter || !menu) return;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const seatWidth = seat.offsetWidth;
  const seatHeight = seat.offsetHeight;
  const bounds = overlayViewport();
  // 旧版以头像边缘外 8px 为锚点，再通过菜单自身的 12px 位移留白。
  const margin = 20;
  let left = seatCenter.x - menuWidth / 2;
  let top = targetViewIndex.value === 0
    ? seatCenter.y - seatHeight / 2 - menuHeight - margin
    : seatCenter.y + seatHeight / 2 + margin;
  if (targetViewIndex.value === 1) {
    left = seatCenter.x + seatWidth / 2 + margin;
    top = seatCenter.y - menuHeight / 2;
  }
  if (targetViewIndex.value === 3) {
    left = seatCenter.x - seatWidth / 2 - menuWidth - margin;
    top = seatCenter.y - menuHeight / 2;
  }
  targetMenuStyle.value = {
    left: `${Math.max(8, Math.min(bounds.width - menuWidth - 8, left))}px`,
    top: `${Math.max(8, Math.min(bounds.height - menuHeight - 8, top))}px`
  };
}

function repositionTargetMenu() {
  if (mode.value !== 'target') return;
  window.cancelAnimationFrame?.(repositionFrame);
  repositionFrame = window.requestAnimationFrame?.(() => {
    repositionFrame = 0;
    void openTarget(targetViewIndex.value);
  }) || 0;
}

function close() {
  mode.value = '';
}

function send(item, global = false) {
  if (!canSend.value || remaining(item, global)) return;
  if (item.kind === 'tomato' && !tomatoAllowed()) return;
  emit('send-interaction', {
    kind: item.kind,
    icon: item.icon,
    label: item.label,
    toIndex: absIndex(global ? 0 : targetViewIndex.value),
    broadcastOnly: global || item.kind === 'emoji'
  });
  cooldownUntil.value = {
    ...cooldownUntil.value,
    [cooldownKey(item, global)]: Date.now() + item.cooldown
  };
  close();
}

function onDocumentClick(event) {
  if (!event.target.closest('.interaction-fab-vue, .interaction-target-menu-vue, .seat-avatar')) close();
}

onMounted(() => {
  ticker = window.setInterval(() => { now.value = Date.now(); }, 250);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', repositionTargetMenu);
  document.addEventListener('fullscreenchange', repositionTargetMenu);
});

onBeforeUnmount(() => {
  window.clearInterval(ticker);
  window.cancelAnimationFrame?.(repositionFrame);
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('resize', repositionTargetMenu);
  document.removeEventListener('fullscreenchange', repositionTargetMenu);
});

defineExpose({ openTarget, close });
</script>

<template>
  <div v-if="game.roomId" class="interaction-fab-vue" :class="{ open: mode }">
    <button class="interaction-fab-button-vue" type="button" @click.stop="openQuick">💬 互动</button>
  </div>

  <Teleport :to="teleportTarget">
    <section
      v-if="mode === 'quick'"
      class="interaction-target-menu-vue menu-center quick-emoji-menu"
      aria-label="快捷表情"
      @click.stop
    >
      <button
        v-for="(item, index) in INTERACTION_EMOJIS"
        :key="`${item.label}-${index}`"
        :data-interaction-kind="item.kind"
        type="button"
        :disabled="!canSend || remaining(item, true) > 0"
        @click="send(item, true)"
      >
        {{ item.icon }} {{ item.label }}<template v-if="remaining(item, true)"> {{ remaining(item, true) }}s</template>
      </button>
    </section>

    <section
      v-if="mode === 'target'"
      class="interaction-target-menu-vue target-tool-menu"
      :style="targetMenuStyle"
      aria-label="道具互动"
      @click.stop
    >
      <button
        v-for="item in INTERACTION_TOOLS"
        :key="item.kind"
        :data-interaction-kind="item.kind"
        type="button"
        :disabled="!canSend || remaining(item) > 0 || (item.kind === 'tomato' && !tomatoAllowed())"
        @click="send(item)"
      >
        {{ item.icon }} {{ item.shortLabel || item.label }}<template v-if="remaining(item)"> {{ remaining(item) }}s</template>
      </button>
    </section>
  </Teleport>
</template>
