<script setup>
import { computed, ref, watch } from 'vue';
import { clearClientCache } from '../stores/gameState';

const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  identity: {
    type: Object,
    required: true
  }
});

const emit = defineEmits([
  'create-room',
  'join-room',
  'start-game',
  'fill-bots',
  'takeover-offline',
  'approve-bot-takeover',
  'leave-room',
  'disband-room',
  'update-nickname',
  'clear-error',
  'login',
  'logout',
  'close-panel'
]);

const nickname = ref(props.game.nickname || '');
const roomId = ref(props.game.roomId || '');
const panelMode = ref(props.game.roomId ? 'status' : 'choice');
const localMessage = ref('');
const randomNames = [
  '貂蝉', '大乔', '小乔', '甄姬', '黄月英', '孙尚香', '祝融', '蔡文姬',
  '王异', '步练师', '糜夫人', '甘夫人', '赵云', '马超', '诸葛亮', '关羽',
  '张飞', '刘备', '黄忠', '魏延', '庞统', '姜维', '法正', '徐庶',
  '曹操', '司马懿', '张辽', '许褚', '夏侯惇', '夏侯渊', '郭嘉', '荀彧',
  '荀攸', '典韦', '曹仁', '张郃', '徐晃', '周瑜', '陆逊', '鲁肃',
  '吕蒙', '甘宁', '太史慈', '孙权', '孙策', '黄盖', '程普', '凌统',
  '诸葛瑾', '袁绍', '吕布', '陈宫', '华佗', '孟获', '张角', '左慈',
  '司马昭', '邓艾', '钟会', '羊祜', '陆抗'
];

watch(() => props.game.nickname, value => {
  if (value !== nickname.value) nickname.value = value || '';
});

watch(() => props.game.roomId, value => {
  if (value && !roomId.value) roomId.value = value;
  if (value) panelMode.value = 'status';
  if (!value) {
    roomId.value = '';
    panelMode.value = 'choice';
  }
});

const hasActiveRoom = computed(() => Boolean(props.game.roomId));
const hasFourPlayers = computed(() => hasActiveRoom.value && props.game.players.length >= 4);
const hasLeftPlayers = computed(() => props.game.players.some(player => !player.isBot && player.leftRoom));
const offlineHumans = computed(() => props.game.players.filter(player => (
  player.name &&
  player.name !== 'Waiting' &&
  !player.isBot &&
  !player.connected &&
  !player.leftRoom
)));
const canFillBots = computed(() => Boolean(
  props.game.isHost &&
  props.game.roomId &&
  (props.game.phase === 'lobby' || hasLeftPlayers.value)
));
const canTakeoverOffline = computed(() => Boolean(
  props.game.isHost &&
  props.game.connected &&
  props.game.roomId &&
  props.game.phase !== 'gameEnd' &&
  offlineHumans.value.length
));
const canChooseRoom = computed(() => !props.game.roomId && ['offline', 'lobby'].includes(props.game.phase));
const modeToUse = computed(() => (hasActiveRoom.value ? 'status' : panelMode.value));
const connectedText = computed(() => {
  if (props.game.connected) return '已连接';
  if (props.game.connecting) return '连接中';
  if (props.game.reconnecting) return '重连中';
  return '离线';
});

const phaseText = computed(() => ({
  offline: '离线',
  lobby: '房间',
  deal: '发牌',
  pass: '传牌',
  play: '出牌',
  roundEnd: '本局结束',
  gameEnd: '游戏结束'
})[props.game.phase] || props.game.phase || '离线');
const roomSubtitle = computed(() => {
  if (hasActiveRoom.value) return props.game.isHost
    ? '满 4 人会自动开始，人数不足可 AI 补位，也可以解散房间。'
    : '等待房主开始；你可以主动退出房间，之后仍可用房间号重新加入。';
  if (modeToUse.value === 'create') return '填写昵称后创建房间，系统会生成 4 位纯数字房间号。';
  if (modeToUse.value === 'join') return '填写昵称，并输入好友给你的 4 位纯数字房间号。';
  return '请选择创建房间或加入房间。';
});
const roomTitle = computed(() => {
  if (hasActiveRoom.value) return `房间号 ${props.game.roomId}`;
  if (modeToUse.value === 'create') return '创建房间';
  if (modeToUse.value === 'join') return '加入房间';
  return '联机房间';
});
const hostName = computed(() => {
  const host = props.game.players.find(player => player.id && player.id === props.game.hostId);
  return host?.name || '未知';
});
const roomFieldError = computed(() => modeToUse.value === 'join'
  ? (props.game.lastError || localMessage.value || '')
  : '');
const visibleMessage = computed(() => {
  if (modeToUse.value === 'join') {
    return props.game.notice && props.game.notice !== props.game.lastError ? props.game.notice : '';
  }
  return props.game.lastError || localMessage.value || props.game.notice || '';
});
const staleRoomMessage = computed(() => /本地房间已失效，已刷新房间缓存/.test(visibleMessage.value));

function commitNickname() {
  emit('update-nickname', nickname.value);
}

function chooseMode(mode) {
  localMessage.value = '';
  emit('clear-error');
  panelMode.value = mode;
}

function backToChoice() {
  localMessage.value = '';
  emit('clear-error');
  panelMode.value = 'choice';
}

function clearJoinError() {
  localMessage.value = '';
  emit('clear-error');
}

function randomNickname() {
  const pool = randomNames.filter(name => name !== nickname.value);
  nickname.value = pool[Math.floor(Math.random() * pool.length)] || randomNames[0];
  commitNickname();
}

function joinRoom() {
  if (!canChooseRoom.value) return;
  const normalized = String(roomId.value || '').trim();
  if (!/^\d{4}$/.test(normalized)) {
    localMessage.value = '请输入 4 位数字房间号。';
    return;
  }
  localMessage.value = '';
  emit('clear-error');
  commitNickname();
  emit('join-room', normalized);
}

function createRoom() {
  if (!canChooseRoom.value) return;
  localMessage.value = '';
  commitNickname();
  emit('create-room');
}

function leaveRoom() {
  if (!props.game.roomId) return;
  if (!window.confirm(`确定退出房间 ${props.game.roomId} 吗？之后可重新输入房间号加入。`)) return;
  emit('leave-room');
}

async function copyRoomId() {
  if (!props.game.roomId) return;
  await navigator.clipboard?.writeText(props.game.roomId).catch(() => {});
  localMessage.value = '房间号已复制。';
}

function clearLocalCache() {
  if (!window.confirm('确定清除本地缓存并刷新页面吗？这会清空本机保存的房间号、玩家标识和横屏设置。')) return;
  clearClientCache();
}

function displayName(name) {
  if (!name || name === 'Waiting') return '等待中';
  if (name === 'You') return '你';
  return name;
}

function playerStatus(player) {
  if (player.aiControlled || player.takeoverFromName) return '离线 · AI托管中';
  if (player.isBot) return '在线';
  if (player.leftRoom) return '已退出';
  return player.connected ? '在线' : '离线';
}

function playerBadge(player) {
  if (player.aiControlled || player.takeoverFromName) return 'AI托管';
  if (player.isBot) return `${player.avatar || ''} AI`.trim();
  return '';
}
</script>

<template>
  <section
    class="room-panel"
    :class="[
      `mode-${modeToUse}`,
      { 'has-active-room': hasActiveRoom, 'has-four-players': hasFourPlayers }
    ]"
  >
    <header class="panel-header">
      <div>
        <div class="room-title-line">
          <strong>{{ roomTitle }}</strong>
          <button v-if="hasActiveRoom" class="text-button small title-copy-btn" type="button" @click="copyRoomId">复制</button>
        </div>
        <span>{{ roomSubtitle }}</span>
      </div>
    </header>

    <section v-if="modeToUse === 'choice'" class="room-choice-panel">
      <div class="room-choice-grid">
        <button class="primary-button room-choice-btn" type="button" @click="chooseMode('create')">
          <strong>创建房间</strong>
          <span>生成 4 位房间号，邀请好友加入</span>
        </button>
        <button class="text-button room-choice-btn secondary" type="button" @click="chooseMode('join')">
          <strong>加入房间</strong>
          <span>输入好友给你的 4 位房间号</span>
        </button>
      </div>
    </section>

    <div v-if="modeToUse !== 'status'" class="account-callout" :class="{ authenticated: identity.authenticated }">
      <div>
        <strong>{{ identity.authenticated ? 'QQ 已登录' : 'QQ登录' }}</strong>
        <span>
          {{ identity.authenticated
            ? `账号：${identity.user?.nickname || 'QQ 用户'}`
            : '游客可直接玩，登录后同步战绩和排行榜。' }}
        </span>
      </div>
      <button
        v-if="identity.authenticated"
        class="text-button small"
        type="button"
        @click="$emit('logout')"
      >
        退出
      </button>
      <button
        v-else
        class="qq-login-button"
        type="button"
        @click="$emit('login')"
      >
        <span>登录</span>
      </button>
    </div>

    <section v-if="modeToUse === 'create' || modeToUse === 'join'" class="room-action-panel">
      <div class="room-form">
        <div class="room-field room-nickname-field">
          <span id="room-nickname-label">昵称</span>
          <div class="input-with-btn">
            <input
              v-model="nickname"
              maxlength="20"
              type="text"
              aria-labelledby="room-nickname-label"
              placeholder="例如：赵云"
              @change="commitNickname"
              @keyup.enter="modeToUse === 'create' ? createRoom() : joinRoom()"
            />
            <button
              class="dice-icon-btn"
              type="button"
              title="换一个随机角色名"
              aria-label="换一个名字"
              @click="randomNickname"
            >🎲</button>
          </div>
        </div>
        <div v-if="modeToUse === 'join'" class="room-field">
          <span id="room-id-label">房间号</span>
          <div class="room-id-input-wrap">
            <input
              v-model="roomId"
              maxlength="4"
              inputmode="numeric"
              pattern="[0-9]{4}"
              type="text"
              aria-labelledby="room-id-label"
              placeholder="例如：1234"
              :aria-invalid="Boolean(roomFieldError)"
              aria-describedby="join-room-error"
              @input="clearJoinError"
              @keyup.enter="joinRoom"
            />
            <small v-if="roomFieldError" id="join-room-error" class="room-field-error" role="alert">
              {{ roomFieldError }}
            </small>
          </div>
        </div>
      </div>
      <div class="room-actions">
        <button class="text-button room-refresh-cache-button" type="button" @click="clearLocalCache">刷新缓存</button>
        <button v-if="modeToUse === 'create'" class="primary-button" type="button" :disabled="!canChooseRoom" @click="createRoom">确认创建</button>
        <button v-if="modeToUse === 'join'" class="primary-button" type="button" :disabled="!canChooseRoom" @click="joinRoom">加入房间</button>
        <button class="text-button room-back-button" type="button" @click="backToChoice">返回重新</button>
        <button class="text-button room-close-bottom" type="button" @click="$emit('close-panel')">关闭</button>
      </div>
    </section>

    <div v-if="modeToUse !== 'status'" class="account-line">
      <span>{{ identity.authenticated ? 'QQ 账号已连接' : '游客模式可直接游玩' }}</span>
      <button v-if="identity.authenticated" class="text-button small" type="button" @click="$emit('logout')">退出</button>
      <button v-else class="text-button small" type="button" @click="$emit('login')">QQ登录</button>
    </div>

    <div v-if="modeToUse === 'status'" class="room-status">
      <span>服务端： <b class="service-state" :class="{ online: game.connected }">{{ connectedText }}</b></span>
      <strong>当前房主： {{ hostName }}</strong>
    </div>

    <div v-if="modeToUse === 'status'" class="player-list">
      <div
        v-for="(player, index) in game.players"
        :key="player.id || index"
        class="player-row"
        :class="{ active: index === game.yourIndex }"
      >
        <span class="player-main">
          {{ index + 1 }}. {{ displayName(player.name) }}
          <b v-if="game.hostId && player.id === game.hostId" class="host-badge">👑 房主</b>
          <b v-if="playerBadge(player)" class="bot-badge">{{ playerBadge(player) }}</b>
        </span>
        <small>
          <b v-if="player.passed" class="pass-ready-pill">已传牌</b>
          {{ playerStatus(player) }}
        </small>
      </div>
    </div>

    <section
      v-if="modeToUse === 'status' && game.isHost && game.botTakeoverRequests.length"
      class="room-takeover-requests"
      aria-label="AI 座位接管申请"
    >
      <strong>AI 座位接管申请</strong>
      <div class="request-list">
        <article v-for="request in game.botTakeoverRequests" :key="request.requestId" class="request-card">
          <div>
            <strong>{{ request.nickname }}</strong>
            <span>想接管 {{ request.targetName }}</span>
          </div>
          <div class="request-actions">
            <button class="text-button small" type="button" @click="emit('approve-bot-takeover', request.requestId, false)">拒绝</button>
            <button class="primary-button small" type="button" @click="emit('approve-bot-takeover', request.requestId, true)">同意</button>
          </div>
        </article>
      </div>
    </section>

    <div class="room-controls">
      <button v-if="canFillBots" class="primary-button room-positive-button room-fill-bots-button" type="button" @click="$emit('fill-bots')">{{ hasLeftPlayers ? 'AI补位' : 'AI补位开始' }}</button>
      <button v-if="canTakeoverOffline" class="primary-button" type="button" @click="emit('takeover-offline')">AI接管离线</button>
      <button v-if="modeToUse === 'status' && !game.isHost" class="text-button danger room-destructive-button room-leave-button" type="button" :disabled="!game.roomId" @click="leaveRoom">退出房间</button>
      <button v-if="modeToUse === 'status' && game.isHost" class="text-button danger room-destructive-button room-disband-button" type="button" :disabled="!game.roomId" @click="$emit('disband-room')">解散房间</button>
      <button v-if="modeToUse !== 'create' && modeToUse !== 'join'" class="text-button" type="button" @click="clearLocalCache">刷新缓存</button>
      <button v-if="modeToUse !== 'create' && modeToUse !== 'join'" class="text-button room-close-bottom" type="button" @click="$emit('close-panel')">关闭</button>
    </div>

    <p
      v-if="visibleMessage"
      class="panel-message"
      :class="{ error: game.lastError, 'stale-room-message': staleRoomMessage }"
    >
      {{ visibleMessage }}
    </p>
  </section>
</template>
