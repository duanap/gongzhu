<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useViewport } from './composables/useViewport';
import DesktopTable from './layouts/DesktopTable.vue';
import MobileTable from './layouts/MobileTable.vue';
import GlobalNoticeLayer from './components/GlobalNoticeLayer.vue';
import { authWithQq, ensureGuestId, fetchIdentity, logout as logoutIdentity } from './services/identity';
import { createGameSocket } from './services/socket';
import { disposeAudioRuntime, initAudioRuntime, playGameSound } from './services/audio';
import { applyClientSettings, readClientSettings } from './services/preferences';
import { readQqLogin, showQqLogin } from './services/qq';
import { createGameState, setNickname } from './stores/gameState';

const { isMobile } = useViewport();
const identity = ref({
  authenticated: false,
  user: null,
  guestId: ensureGuestId(),
  qq: null
});
const game = createGameState();
const gameSocket = createGameSocket(game);
const authStatus = ref('');
const activeLayout = computed(() => (isMobile.value ? MobileTable : DesktopTable));
const status = computed(() => {
  if (game.lastError) return game.lastError;
  if (game.notice) return game.notice;
  return authStatus.value || (game.connected ? '已连接到游戏服务器。' : '正在连接游戏服务器。');
});
const notificationMessage = computed(() => {
  if (game.lastError) return game.lastError;
  if (game.notice) return game.notice;
  if (['游客模式已就绪。', '已登录，战绩会自动保存。'].includes(authStatus.value)) return '';
  return authStatus.value;
});

async function refreshIdentity() {
  try {
    identity.value = await fetchIdentity();
    authStatus.value = identity.value.authenticated ? '已登录，战绩会自动保存。' : '游客模式已就绪。';
  } catch (error) {
    authStatus.value = error.message || '身份信息加载失败。';
  }
}

async function completeQqLogin(credentials) {
  if (!credentials?.openId || !credentials?.accessToken) return false;
  identity.value = await authWithQq(credentials);
  authStatus.value = 'QQ 登录成功。';
  gameSocket.reconnect();
  return true;
}

async function loginWithQq() {
  try {
      authStatus.value = '正在打开 QQ 登录...';
    const config = identity.value.qq || (await fetchIdentity()).qq;
    const immediate = await showQqLogin(config);
    if (await completeQqLogin(immediate)) return;

      authStatus.value = '请在 QQ 弹窗中完成授权。';
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt > 120000) {
        window.clearInterval(timer);
          authStatus.value = 'QQ 授权超时。';
        return;
      }
      const credentials = await readQqLogin(config);
      if (await completeQqLogin(credentials)) window.clearInterval(timer);
    }, 1200);
  } catch (error) {
      authStatus.value = error.message || 'QQ 登录失败。';
  }
}

async function logout() {
  try {
    identity.value = await logoutIdentity();
    authStatus.value = '已退出登录，仍可使用游客模式。';
    gameSocket.reconnect();
  } catch (error) {
    authStatus.value = error.message || '退出登录失败。';
  }
}

function updateNickname(nickname) {
  setNickname(game, nickname);
}

function clearGameError() {
  const previous = game.lastError;
  game.lastError = '';
  if (game.notice === previous) game.notice = '';
}

function passCards(cards) {
  playGameSound('pass');
  gameSocket.passCards(cards);
}

function playCard(cardId) {
  playGameSound('play');
  gameSocket.playCard(cardId);
}

watch(() => game.lastError, (message, previous) => {
  if (message && message !== previous) playGameSound('error');
});

onMounted(async () => {
  initAudioRuntime();
  applyClientSettings(readClientSettings(), { persist: false });
  await refreshIdentity();
  gameSocket.connect();
});

onBeforeUnmount(() => {
  disposeAudioRuntime();
  gameSocket.close();
});
</script>

<template>
  <component
    :is="activeLayout"
    :identity="identity"
    :game="game"
    :status="status"
    @login="loginWithQq"
    @logout="logout"
    @refresh="refreshIdentity"
    @create-room="gameSocket.createRoom"
    @join-room="gameSocket.joinRoom"
    @start-game="gameSocket.startGame"
    @fill-bots="gameSocket.fillBotsAndStart"
    @leave-room="gameSocket.leaveRoom"
    @disband-room="gameSocket.disbandRoom"
    @update-nickname="updateNickname"
    @clear-error="clearGameError"
    @pass-cards="passCards"
    @play-card="playCard"
    @start-next-round="gameSocket.startNextRound"
    @restart-game="gameSocket.restartGame"
    @sweep-cards="gameSocket.sweepCards"
    @send-interaction="gameSocket.sendInteraction"
    @takeover-offline="gameSocket.takeoverOffline"
    @approve-bot-takeover="gameSocket.approveBotTakeover"
  />
  <GlobalNoticeLayer :game="game" :message="notificationMessage" />
</template>
