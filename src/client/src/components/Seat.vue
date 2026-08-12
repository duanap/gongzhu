<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  player: {
    type: Object,
    default: () => ({})
  },
  label: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: false
  },
  current: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['avatar-click']);
const lastAvatar = ref('');

watch(
  () => props.player?.avatar,
  avatar => {
    const normalized = String(avatar || '').trim();
    if (normalized) lastAvatar.value = normalized;
  },
  { immediate: true }
);

function displayName(name) {
  if (!name || name === 'Waiting') return '等待中';
  if (name === 'You') return '你';
  return name;
}

function statusText(player) {
  if (player.aiControlled || player.takeoverFromName) return 'AI托管';
  if (player.isBot) return 'AI';
  if (player.leftRoom) return '已退出';
  return player.connected ? '在线' : '离线';
}

function avatarTone(player) {
  if (!player?.isBot) return 'avatar-human';
  const symbol = String(player.avatar || '');
  if (symbol.includes('魏')) return 'avatar-wei';
  if (symbol.includes('吴')) return 'avatar-wu';
  return 'avatar-shu';
}

function displayAvatar(player) {
  return String(player?.avatar || '').trim() || lastAvatar.value || (player?.isBot ? 'AI' : '🐶');
}

function showAiSuffix(player) {
  return Boolean(player?.isBot && !/^AI(?:\s|$)/i.test(String(player?.name || '')));
}
</script>

<template>
  <section class="table-seat" :class="{ active, current }">
    <button class="seat-avatar" :class="avatarTone(player)" type="button" :aria-label="`与${displayName(player.name)}互动`" @click.stop="emit('avatar-click')">
      <span v-if="current" class="avatar-wave wave-one" />
      <span v-if="current" class="avatar-wave wave-two" />
      <span class="avatar-symbol">{{ displayAvatar(player) }}</span>
      <b v-if="current" class="seat-turn-indicator"><span class="turn-dot" />出牌中</b>
    </button>
    <div class="seat-copy">
      <strong>{{ displayName(player.name) }}<i v-if="showAiSuffix(player)" class="seat-name-ai"> · AI</i></strong>
      <span>{{ label }} · {{ player.handCount || 0 }} 张</span>
      <small>
        {{ statusText(player) }}
      </small>
    </div>
    <div class="seat-score" aria-label="比分">
      <span>当前 <strong>{{ player.round || 0 }}</strong></span>
      <span>总分 <strong>{{ player.total || 0 }}</strong></span>
    </div>
  </section>
</template>
