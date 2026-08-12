<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({ game: { type: Object, required: true } });
const emit = defineEmits(['create-room', 'join-room', 'fill-bots', 'leave-room', 'disband-room', 'update-nickname', 'clear-error', 'close-panel']);
const nickname = ref(props.game.nickname || '牌友');
const roomId = ref(props.game.roomId || '');
const panelMode = ref(props.game.roomId ? 'status' : 'choice');
const localMessage = ref('');
const modeToUse = computed(() => props.game.roomId ? 'status' : panelMode.value);

watch(() => props.game.roomId, value => {
  if (value) {
    roomId.value = value;
    panelMode.value = 'status';
    return;
  }
  roomId.value = '';
  panelMode.value = 'choice';
});

function commitName() { emit('update-nickname', nickname.value); }
function createRoom() { commitName(); emit('create-room'); }
function joinRoom() {
  const value = String(roomId.value || '').trim();
  if (!/^\d{4}$/.test(value)) { localMessage.value = '请输入 4 位数字房间号。'; return; }
  localMessage.value = '';
  commitName();
  emit('join-room', value);
}
function copyRoomId() { navigator.clipboard?.writeText?.(String(props.game.roomId)).catch(() => {}); }
</script>

<template>
  <section class="room-panel" :class="[`mode-${modeToUse}`, { 'has-active-room': game.roomId }]">
    <header class="panel-header">
      <div><div class="room-title-line"><strong>{{ game.roomId ? `房间号 ${game.roomId}` : modeToUse === 'create' ? '创建房间' : modeToUse === 'join' ? '加入房间' : '联机房间' }}</strong><button v-if="game.roomId" class="text-button small title-copy-btn" type="button" @click="copyRoomId">复制</button></div><span>{{ game.roomId ? '满四人自动开始；房主也可以使用 AI 补位。' : '创建房间或输入好友的 4 位房间号。' }}</span></div>
    </header>

    <section v-if="modeToUse === 'choice'" class="room-choice-panel">
      <div class="room-choice-grid">
        <button class="primary-button room-choice-btn" type="button" @click="panelMode = 'create'"><strong>创建房间</strong><span>生成房间号，邀请牌友加入</span></button>
        <button class="text-button room-choice-btn secondary" type="button" @click="panelMode = 'join'"><strong>加入房间</strong><span>输入好友给你的房间号</span></button>
      </div>
    </section>

    <section v-if="['create', 'join'].includes(modeToUse)" class="room-action-panel">
      <div class="room-form">
        <label class="room-field"><span>昵称</span><input v-model="nickname" maxlength="20" autocomplete="nickname" @change="commitName"></label>
        <label v-if="modeToUse === 'join'" class="room-field"><span>房间号</span><input v-model="roomId" maxlength="4" inputmode="numeric" placeholder="例如：1234" @keyup.enter="joinRoom"></label>
      </div>
      <div class="room-actions">
        <button class="text-button room-back-button" type="button" @click="panelMode = 'choice'; emit('clear-error')">返回</button>
        <button class="primary-button" type="button" @click="modeToUse === 'create' ? createRoom() : joinRoom()">{{ modeToUse === 'create' ? '确认创建' : '加入房间' }}</button>
      </div>
    </section>

    <div v-if="modeToUse === 'status'" class="room-status"><span>服务端： <b class="service-state online">{{ game.connected ? '已连接' : '重连中' }}</b></span><strong>规则：{{ game.ruleSet }}</strong></div>
    <div v-if="modeToUse === 'status'" class="player-list">
      <div v-for="(player, index) in game.players" :key="player.id || index" class="player-row" :class="{ active: index === game.yourIndex }">
        <span class="player-main">{{ index + 1 }}. {{ player.name }}<b v-if="player.isBot" class="bot-badge">AI</b></span>
        <small>{{ player.isBot || player.connected ? '在线' : '离线' }}</small>
      </div>
    </div>
    <div v-if="modeToUse === 'status'" class="room-controls">
      <button v-if="game.phase === 'lobby' && game.isHost" class="primary-button room-positive-button room-fill-bots-button" type="button" @click="emit('fill-bots')">AI补位开始</button>
      <button class="text-button danger room-destructive-button" type="button" @click="game.isHost ? emit('disband-room') : emit('leave-room')">{{ game.isHost ? '解散房间' : '退出房间' }}</button>
      <button class="text-button room-close-bottom" type="button" @click="emit('close-panel')">关闭</button>
    </div>
    <p v-if="game.lastError || localMessage || game.notice" class="panel-message" :class="{ error: game.lastError || localMessage }">{{ game.lastError || localMessage || game.notice }}</p>
  </section>
</template>
