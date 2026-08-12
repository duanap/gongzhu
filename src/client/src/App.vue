<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useViewport } from './composables/useViewport';
import DesktopTable from './layouts/DesktopTable.vue';
import MobileTable from './layouts/MobileTable.vue';
import GlobalNoticeLayer from './components/GlobalNoticeLayer.vue';
import { createGameSocket } from './services/socket';
import { createGameState, setNickname } from './stores/gameState';

const { isMobile } = useViewport();
const game = createGameState();
const gameSocket = createGameSocket(game);
const activeLayout = computed(() => (isMobile.value ? MobileTable : DesktopTable));
const status = computed(() => {
  if (game.lastError) return game.lastError;
  if (game.notice) return game.notice;
  if (game.reconnecting) return `正在第 ${game.reconnectAttempts || 1} 次重连……`;
  return game.connected ? '已连接到游戏服务器。' : '正在连接游戏服务器。';
});
const notificationMessage = computed(() => game.lastError || game.notice || '');

function updateNickname(nickname) {
  setNickname(game, nickname);
}

onMounted(() => gameSocket.connect());
onBeforeUnmount(() => gameSocket.close());
</script>

<template>
  <component
    :is="activeLayout"
    :game="game"
    :status="status"
    @create-room="gameSocket.createRoom"
    @join-room="gameSocket.joinRoom"
    @fill-bots="gameSocket.fillBotsAndStart"
    @leave-room="gameSocket.leaveRoom"
    @disband-room="gameSocket.disbandRoom"
    @update-nickname="updateNickname"
    @clear-error="game.lastError = ''"
    @declare-cards="gameSocket.declareCards"
    @play-card="gameSocket.playCard"
    @start-next-round="gameSocket.startNextRound"
    @restart-game="gameSocket.restartGame"
  />
  <GlobalNoticeLayer :game="game" :message="notificationMessage" />
</template>
